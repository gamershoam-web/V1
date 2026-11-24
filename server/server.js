'use strict';
/*
 * Lumen server
 *
 * A small, dependency-free video server for your own VPS:
 *  - password login (one owner account), sessions for browsers and the Android app
 *  - resumable chunked uploads (survive flaky connections and proxy size limits)
 *  - HTTP range streaming, so videos seek instantly in the browser and the app
 *  - thumbnails and duration via ffmpeg/ffprobe when available
 *  - watch progress stored per video, shared by the website and the app
 *
 * Configuration (environment variables):
 *   V1_PASSWORD   required, at least 8 characters
 *   PORT          default 8080
 *   DATA_DIR      default ./data   (videos/, thumbs/, uploads/, db.json)
 *   TRUST_PROXY   set to 1 when running behind a reverse proxy such as Caddy
 */

const http = require('node:http');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { pipeline } = require('node:stream/promises');
const { spawn } = require('node:child_process');

const PORT = Number(process.env.PORT) || 8080;
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(__dirname, 'data'));
const PASSWORD = process.env.V1_PASSWORD || '';
const TRUST_PROXY = process.env.TRUST_PROXY === '1';

if (PASSWORD.length < 8) {
  console.error('V1_PASSWORD must be set to at least 8 characters.');
  process.exit(1);
}

const PUBLIC_DIR = path.join(__dirname, 'public');
const VIDEO_DIR = path.join(DATA_DIR, 'videos');
const THUMB_DIR = path.join(DATA_DIR, 'thumbs');
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
const DB_FILE = path.join(DATA_DIR, 'db.json');

const SESSION_COOKIE = 'v1_session';
const SESSION_MAX_IDLE_MS = 180 * 24 * 3600 * 1000;
const CHUNK_MAX_BYTES = 64 * 1024 * 1024;
const VIDEO_EXTENSIONS = new Set([
  '.mp4', '.m4v', '.mov', '.mkv', '.webm', '.avi', '.wmv', '.flv', '.ts', '.m2ts', '.mts', '.3gp', '.ogv', '.mpg', '.mpeg',
]);
const MIME = {
  '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.mov': 'video/quicktime', '.mkv': 'video/x-matroska',
  '.webm': 'video/webm', '.avi': 'video/x-msvideo', '.wmv': 'video/x-ms-wmv', '.flv': 'video/x-flv',
  '.ts': 'video/mp2t', '.m2ts': 'video/mp2t', '.mts': 'video/mp2t', '.3gp': 'video/3gpp', '.ogv': 'video/ogg',
  '.mpg': 'video/mpeg', '.mpeg': 'video/mpeg',
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json',
};

for (const dir of [DATA_DIR, VIDEO_DIR, THUMB_DIR, UPLOAD_DIR]) fs.mkdirSync(dir, { recursive: true });

// ---------------------------------------------------------------------------
// Tiny JSON database (atomic writes)
// ---------------------------------------------------------------------------

let db = { videos: {}, sessions: {}, uploads: {} };
try {
  db = { ...db, ...JSON.parse(fs.readFileSync(DB_FILE, 'utf8')) };
} catch (err) {
  if (err.code !== 'ENOENT') console.error('Could not read db.json, starting empty:', err.message);
}

let saveTimer = null;
let saving = Promise.resolve();
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saving = saving.then(async () => {
      const tmp = DB_FILE + '.tmp';
      await fsp.writeFile(tmp, JSON.stringify(db));
      await fsp.rename(tmp, DB_FILE);
    }).catch((err) => console.error('Saving db failed:', err));
  }, 150);
}

const newId = (bytes = 9) => crypto.randomBytes(bytes).toString('base64url');
const sha256 = (s) => crypto.createHash('sha256').update(s).digest();

// Sessions remember which password they were created with, so changing the password signs everyone out.
if (!db.salt) {
  db.salt = crypto.randomBytes(16).toString('hex');
  save();
}
const PASSWORD_FINGERPRINT = sha256(db.salt + PASSWORD).toString('hex').slice(0, 16);

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

function checkPassword(candidate) {
  return crypto.timingSafeEqual(sha256(String(candidate)), sha256(PASSWORD));
}

function createSession(req) {
  const token = crypto.randomBytes(32).toString('base64url');
  db.sessions[sha256(token).toString('hex')] = {
    created: Date.now(),
    lastUsed: Date.now(),
    pw: PASSWORD_FINGERPRINT,
    agent: String(req.headers['user-agent'] || '').slice(0, 120),
  };
  save();
  return token;
}

function tokenFrom(req) {
  const auth = req.headers.authorization || '';
  if (auth.startsWith('Bearer ')) return auth.slice(7).trim();
  const cookie = req.headers.cookie || '';
  for (const part of cookie.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === SESSION_COOKIE) return decodeURIComponent(v.join('='));
  }
  return null;
}

function sessionKey(req) {
  const token = tokenFrom(req);
  if (!token) return null;
  const key = sha256(token).toString('hex');
  const session = db.sessions[key];
  if (!session) return null;
  if (session.pw !== PASSWORD_FINGERPRINT || Date.now() - session.lastUsed > SESSION_MAX_IDLE_MS) {
    delete db.sessions[key];
    save();
    return null;
  }
  // Only persist "last used" occasionally to avoid rewriting the db on every request.
  if (Date.now() - session.lastUsed > 3600 * 1000) {
    session.lastUsed = Date.now();
    save();
  }
  return key;
}

const loginFailures = new Map(); // ip -> { count, first }
function clientIp(req) {
  if (TRUST_PROXY) {
    const fwd = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    if (fwd) return fwd;
  }
  return req.socket.remoteAddress || 'unknown';
}
function loginBlocked(ip) {
  const f = loginFailures.get(ip);
  if (!f) return false;
  if (Date.now() - f.first > 15 * 60 * 1000) {
    loginFailures.delete(ip);
    return false;
  }
  return f.count >= 10;
}
function noteLoginFailure(ip) {
  const f = loginFailures.get(ip);
  if (!f || Date.now() - f.first > 15 * 60 * 1000) loginFailures.set(ip, { count: 1, first: Date.now() });
  else f.count++;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function sendJson(res, status, body, headers = {}) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(data),
    'Cache-Control': 'no-store',
    ...headers,
  });
  res.end(data);
}

async function readJson(req, limit = 64 * 1024) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new HttpError(413, 'Request body too large');
    chunks.push(chunk);
  }
  if (!size) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new HttpError(400, 'Invalid JSON');
  }
}

/** Turns any user supplied file name into a safe one that keeps its extension. */
function safeFileName(name) {
  const base = path.basename(String(name || '')).normalize('NFC');
  let ext = path.extname(base).toLowerCase();
  if (!VIDEO_EXTENSIONS.has(ext)) ext = '.mp4';
  let stem = base.slice(0, base.length - path.extname(base).length)
    .replace(/[\u0000-\u001f<>:"/\\|?*]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[.\s]+|[.\s]+$/g, '')
    .slice(0, 150);
  if (!stem) stem = 'video';
  return { stem, ext };
}

async function uniqueVideoPath(stem, ext) {
  for (let i = 0; i < 1000; i++) {
    const file = i === 0 ? `${stem}${ext}` : `${stem} (${i})${ext}`;
    try {
      await fsp.access(path.join(VIDEO_DIR, file));
    } catch {
      return file;
    }
  }
  return `${stem}-${newId(4)}${ext}`;
}

const isSecure = (req) => TRUST_PROXY && req.headers['x-forwarded-proto'] === 'https';

function sessionCookie(req, token, maxAgeSec) {
  return [
    `${SESSION_COOKIE}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAgeSec}`,
    isSecure(req) ? 'Secure' : '',
  ].filter(Boolean).join('; ');
}

// ---------------------------------------------------------------------------
// Media probing (duration, size, thumbnail) — one job at a time to spare the VPS
// ---------------------------------------------------------------------------

let ffmpegAvailable = true;
const probeQueue = [];
let probing = false;

function run(cmd, args, timeoutMs = 120_000) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
    child.stdout.on('data', (d) => { if (out.length < 1_000_000) out += d; });
    child.stderr.on('data', (d) => { if (err.length < 10_000) err += d; });
    child.on('error', (e) => { clearTimeout(timer); reject(e); });
    child.on('close', (code) => {
      clearTimeout(timer);
      code === 0 ? resolve(out) : reject(new Error(`${cmd} exited with ${code}: ${err.slice(-500)}`));
    });
  });
}

function queueProbe(id) {
  if (!ffmpegAvailable) return;
  probeQueue.push(id);
  if (!probing) drainProbeQueue();
}

async function drainProbeQueue() {
  probing = true;
  while (probeQueue.length) {
    const id = probeQueue.shift();
    const video = db.videos[id];
    if (!video) continue;
    try {
      await probe(video);
    } catch (err) {
      if (err.code === 'ENOENT') {
        ffmpegAvailable = false;
        console.warn('ffmpeg/ffprobe not found: thumbnails and durations are disabled.');
        probeQueue.length = 0;
      } else {
        console.warn(`Could not analyse "${video.file}":`, err.message);
      }
    }
    video.probed = true;
    save();
  }
  probing = false;
}

async function probe(video) {
  const file = path.join(VIDEO_DIR, video.file);
  const info = JSON.parse(await run('ffprobe', [
    '-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file,
  ]));
  const v = (info.streams || []).find((s) => s.codec_type === 'video' && !(s.disposition || {}).attached_pic);
  const a = (info.streams || []).find((s) => s.codec_type === 'audio');
  video.duration = Math.round(parseFloat(info.format?.duration || v?.duration || 0) * 1000) || 0;
  if (v) {
    let { width, height } = v;
    const rotation = Math.abs(Number(v.tags?.rotate || (v.side_data_list || []).find((d) => d.rotation !== undefined)?.rotation || 0));
    if (rotation === 90 || rotation === 270) [width, height] = [height, width];
    video.width = width || 0;
    video.height = height || 0;
    video.videoCodec = v.codec_name;
  }
  video.audioCodec = a?.codec_name || null;
  video.webPlayable = isWebPlayable(path.extname(video.file).toLowerCase(), video.videoCodec, video.audioCodec);

  const at = Math.min(Math.max(video.duration / 1000 * 0.1, 0), 30);
  const thumb = path.join(THUMB_DIR, `${video.id}.jpg`);
  await run('ffmpeg', [
    '-v', 'error', '-y', '-ss', at.toFixed(2), '-i', file, '-frames:v', '1',
    '-vf', 'scale=640:-2', '-q:v', '4', thumb,
  ]);
  video.thumb = true;
}

function isWebPlayable(ext, vcodec, acodec) {
  const containers = ['.mp4', '.m4v', '.mov', '.webm'];
  const vOk = !vcodec || ['h264', 'vp8', 'vp9', 'av1', 'hevc'].includes(vcodec);
  const aOk = !acodec || ['aac', 'mp3', 'opus', 'vorbis', 'flac'].includes(acodec);
  return containers.includes(ext) && vOk && aOk;
}

// ---------------------------------------------------------------------------
// Library
// ---------------------------------------------------------------------------

function addVideo(file, size, title) {
  const id = newId();
  db.videos[id] = {
    id,
    file,
    title: title || path.basename(file, path.extname(file)),
    size,
    created: Date.now(),
    duration: 0,
    width: 0,
    height: 0,
    thumb: false,
    probed: false,
    progress: null,
  };
  save();
  queueProbe(id);
  return db.videos[id];
}

/** Picks up videos copied straight into data/videos (e.g. with scp or rsync) and forgets deleted ones. */
async function scanLibrary() {
  let entries;
  try {
    entries = await fsp.readdir(VIDEO_DIR, { withFileTypes: true });
  } catch {
    return;
  }
  const known = new Map(Object.values(db.videos).map((v) => [v.file, v]));
  const present = new Set();
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!VIDEO_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) continue;
    present.add(entry.name);
    if (!known.has(entry.name)) {
      try {
        const stat = await fsp.stat(path.join(VIDEO_DIR, entry.name));
        // Skip files that are still being copied in.
        if (Date.now() - stat.mtimeMs < 10_000) continue;
        addVideo(entry.name, stat.size);
        console.log(`Added "${entry.name}" from the videos folder.`);
      } catch { /* vanished */ }
    }
  }
  for (const video of known.values()) {
    if (!present.has(video.file)) {
      delete db.videos[video.id];
      fsp.rm(path.join(THUMB_DIR, `${video.id}.jpg`), { force: true }).catch(() => {});
      save();
    }
  }
  for (const video of Object.values(db.videos)) if (!video.probed) queueProbe(video.id);
}

function publicVideo(v) {
  return {
    id: v.id,
    title: v.title,
    fileName: v.file,
    size: v.size,
    duration: v.duration,
    width: v.width,
    height: v.height,
    created: v.created,
    thumb: Boolean(v.thumb),
    ready: Boolean(v.probed),
    webPlayable: v.webPlayable !== false,
    progress: v.progress || null,
  };
}

// ---------------------------------------------------------------------------
// Uploads (resumable): POST /api/uploads -> PUT chunks with Upload-Offset -> done
// ---------------------------------------------------------------------------

const busyUploads = new Set();

async function partSize(id) {
  try {
    return (await fsp.stat(path.join(UPLOAD_DIR, `${id}.part`))).size;
  } catch {
    return 0;
  }
}

async function createUpload(req, res) {
  const body = await readJson(req);
  const size = Number(body.size);
  if (!Number.isSafeInteger(size) || size <= 0) throw new HttpError(400, 'size is required');
  const { stem, ext } = safeFileName(body.name);
  if (body.name && !VIDEO_EXTENSIONS.has(path.extname(String(body.name)).toLowerCase())) {
    throw new HttpError(415, 'That does not look like a video file');
  }
  const id = newId(12);
  await fsp.writeFile(path.join(UPLOAD_DIR, `${id}.part`), '');
  db.uploads[id] = { id, stem, ext, size, created: Date.now() };
  save();
  sendJson(res, 201, { id, offset: 0, size });
}

async function uploadChunk(req, res, id) {
  const upload = db.uploads[id];
  if (!upload) throw new HttpError(404, 'Unknown upload');
  if (busyUploads.has(id)) throw new HttpError(409, 'Upload busy');
  const offset = Number(req.headers['upload-offset']);
  const current = await partSize(id);
  if (offset !== current) return sendJson(res, 409, { error: 'Offset mismatch', offset: current });

  busyUploads.add(id);
  try {
    const remaining = upload.size - current;
    let received = 0;
    const out = fs.createWriteStream(path.join(UPLOAD_DIR, `${id}.part`), { flags: 'a' });
    try {
      await pipeline(req, async function* (source) {
        for await (const chunk of source) {
          received += chunk.length;
          if (received > remaining || received > CHUNK_MAX_BYTES) throw new HttpError(413, 'Chunk too large');
          yield chunk;
        }
      }, out);
    } catch (err) {
      if (err instanceof HttpError) throw err;
      // Connection dropped mid-chunk: whatever arrived is kept; the client resumes from the new offset.
      return;
    }
    upload.touched = Date.now();
    const now = await partSize(id);
    if (now < upload.size) return sendJson(res, 200, { offset: now, size: upload.size, done: false });

    const file = await uniqueVideoPath(upload.stem, upload.ext);
    await fsp.rename(path.join(UPLOAD_DIR, `${id}.part`), path.join(VIDEO_DIR, file));
    delete db.uploads[id];
    const video = addVideo(file, upload.size, upload.stem);
    sendJson(res, 200, { offset: now, size: upload.size, done: true, video: publicVideo(video) });
  } finally {
    busyUploads.delete(id);
  }
}

async function cleanupUploads() {
  const week = 7 * 24 * 3600 * 1000;
  for (const upload of Object.values(db.uploads)) {
    if (Date.now() - (upload.touched || upload.created) > week) {
      await fsp.rm(path.join(UPLOAD_DIR, `${upload.id}.part`), { force: true });
      delete db.uploads[upload.id];
      save();
    }
  }
}

// ---------------------------------------------------------------------------
// Static files and range streaming
// ---------------------------------------------------------------------------

async function sendFile(req, res, file, { type, cache = 'no-cache', download } = {}) {
  let stat;
  try {
    stat = await fsp.stat(file);
  } catch {
    throw new HttpError(404, 'Not found');
  }
  if (!stat.isFile()) throw new HttpError(404, 'Not found');
  const size = stat.size;
  const etag = `"${size.toString(36)}-${Math.floor(stat.mtimeMs).toString(36)}"`;
  const headers = {
    'Content-Type': type || MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
    'Accept-Ranges': 'bytes',
    'Cache-Control': cache,
    'Last-Modified': stat.mtime.toUTCString(),
    ETag: etag,
  };
  if (download) {
    headers['Content-Disposition'] = `attachment; filename*=UTF-8''${encodeURIComponent(download)}`;
  }
  if (req.headers['if-none-match'] === etag && !req.headers.range) {
    res.writeHead(304, headers);
    return res.end();
  }

  let start = 0;
  let end = size - 1;
  let status = 200;
  const range = req.headers.range;
  if (range && size > 0) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
    if (m && (m[1] !== '' || m[2] !== '')) {
      if (m[1] === '') {
        start = Math.max(0, size - Number(m[2]));
      } else {
        start = Number(m[1]);
        if (m[2] !== '') end = Math.min(Number(m[2]), size - 1);
      }
      if (start > end || start >= size) {
        res.writeHead(416, { 'Content-Range': `bytes */${size}` });
        return res.end();
      }
      status = 206;
      headers['Content-Range'] = `bytes ${start}-${end}/${size}`;
    }
  }
  headers['Content-Length'] = size === 0 ? 0 : end - start + 1;
  res.writeHead(status, headers);
  if (req.method === 'HEAD' || size === 0) return res.end();
  try {
    await pipeline(fs.createReadStream(file, { start, end }), res);
  } catch { /* client went away (normal while seeking) */ }
}

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy':
    "default-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
};

async function serveStatic(req, res, pathname) {
  let rel = decodeURIComponent(pathname);
  if (rel === '/' || !path.extname(rel)) rel = '/index.html'; // single page app
  const file = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!file.startsWith(PUBLIC_DIR + path.sep)) throw new HttpError(404, 'Not found');
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.setHeader(k, v);
  await sendFile(req, res, file);
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

function videoOr404(id) {
  const video = db.videos[id];
  if (!video) throw new HttpError(404, 'Video not found');
  return video;
}

async function handleApi(req, res, url) {
  const { pathname } = url;
  const method = req.method;

  if (pathname === '/api/health') {
    return sendJson(res, 200, { ok: true, name: 'Lumen', version: 1 });
  }

  if (pathname === '/api/login' && method === 'POST') {
    const ip = clientIp(req);
    if (loginBlocked(ip)) throw new HttpError(429, 'Too many attempts. Try again in 15 minutes.');
    const body = await readJson(req);
    if (!checkPassword(body.password || '')) {
      noteLoginFailure(ip);
      await new Promise((r) => setTimeout(r, 500));
      throw new HttpError(401, 'Wrong password');
    }
    loginFailures.delete(ip);
    const token = createSession(req);
    return sendJson(res, 200, { token }, { 'Set-Cookie': sessionCookie(req, token, 180 * 24 * 3600) });
  }

  const session = sessionKey(req);
  if (!session) throw new HttpError(401, 'Not signed in');

  if (pathname === '/api/logout' && method === 'POST') {
    delete db.sessions[session];
    save();
    return sendJson(res, 200, { ok: true }, { 'Set-Cookie': sessionCookie(req, '', 0) });
  }

  if (pathname === '/api/videos' && method === 'GET') {
    const videos = Object.values(db.videos).sort((a, b) => b.created - a.created).map(publicVideo);
    return sendJson(res, 200, { videos });
  }

  if (pathname === '/api/rescan' && method === 'POST') {
    await scanLibrary();
    return sendJson(res, 200, { ok: true });
  }

  if (pathname === '/api/uploads' && method === 'POST') return createUpload(req, res);

  let m = /^\/api\/uploads\/([\w-]+)$/.exec(pathname);
  if (m) {
    const upload = db.uploads[m[1]];
    if (method === 'GET') {
      if (!upload) throw new HttpError(404, 'Unknown upload');
      return sendJson(res, 200, { id: upload.id, offset: await partSize(upload.id), size: upload.size });
    }
    if (method === 'PUT' || method === 'PATCH') return uploadChunk(req, res, m[1]);
    if (method === 'DELETE') {
      if (upload && !busyUploads.has(upload.id)) {
        await fsp.rm(path.join(UPLOAD_DIR, `${upload.id}.part`), { force: true });
        delete db.uploads[upload.id];
        save();
      }
      return sendJson(res, 200, { ok: true });
    }
  }

  m = /^\/api\/videos\/([\w-]+)(?:\/(stream|thumb|download|progress))?$/.exec(pathname);
  if (m) {
    const video = videoOr404(m[1]);
    const action = m[2];
    if (!action) {
      if (method === 'GET') return sendJson(res, 200, publicVideo(video));
      if (method === 'PATCH') {
        const body = await readJson(req);
        const title = String(body.title || '').trim().slice(0, 200);
        if (!title) throw new HttpError(400, 'Title is required');
        video.title = title;
        save();
        return sendJson(res, 200, publicVideo(video));
      }
      if (method === 'DELETE') {
        await fsp.rm(path.join(VIDEO_DIR, video.file), { force: true });
        await fsp.rm(path.join(THUMB_DIR, `${video.id}.jpg`), { force: true });
        delete db.videos[video.id];
        save();
        return sendJson(res, 200, { ok: true });
      }
    }
    if ((action === 'stream' || action === 'download') && (method === 'GET' || method === 'HEAD')) {
      return sendFile(req, res, path.join(VIDEO_DIR, video.file), {
        cache: 'private, max-age=3600',
        download: action === 'download' ? video.file : undefined,
      });
    }
    if (action === 'thumb' && (method === 'GET' || method === 'HEAD')) {
      if (!video.thumb) throw new HttpError(404, 'No thumbnail yet');
      return sendFile(req, res, path.join(THUMB_DIR, `${video.id}.jpg`), { cache: 'private, max-age=86400' });
    }
    if (action === 'progress') {
      if (method === 'GET') return sendJson(res, 200, { progress: video.progress || null });
      if (method === 'PUT' || method === 'POST') {
        const body = await readJson(req);
        const position = Math.max(0, Math.round(Number(body.position) || 0));
        const duration = Math.max(0, Math.round(Number(body.duration) || video.duration || 0));
        if (duration && !video.duration) video.duration = duration;
        const finished = duration > 0 && position >= duration - 5000;
        video.progress = position < 5000 || finished
          ? (finished ? { position: 0, finished: true, updated: Date.now() } : null)
          : { position, updated: Date.now() };
        save();
        return sendJson(res, 200, { progress: video.progress });
      }
      if (method === 'DELETE') {
        video.progress = null;
        save();
        return sendJson(res, 200, { progress: null });
      }
    }
  }

  throw new HttpError(404, 'Not found');
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname.startsWith('/api/')) {
      // Let the Android app (and other tools) call the API from anywhere; auth is by bearer token.
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, Upload-Offset, Range');
      res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS');
      res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Accept-Ranges');
      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        return res.end();
      }
      await handleApi(req, res, url);
    } else if (req.method === 'GET' || req.method === 'HEAD') {
      await serveStatic(req, res, url.pathname);
    } else {
      throw new HttpError(405, 'Method not allowed');
    }
  } catch (err) {
    const status = err instanceof HttpError ? err.status : 500;
    if (status === 500) console.error(`${req.method} ${url.pathname}:`, err);
    if (!res.headersSent) sendJson(res, status, { error: status === 500 ? 'Server error' : err.message });
    else res.destroy();
  }
});

server.requestTimeout = 0; // uploads and long streams must not be cut off
server.headersTimeout = 60_000;

scanLibrary().then(() => {
  server.listen(PORT, () => {
    console.log(`Lumen server running on http://localhost:${PORT}  (data: ${DATA_DIR})`);
  });
});
setInterval(scanLibrary, 60_000).unref();
setInterval(cleanupUploads, 3600_000).unref();

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => {
    clearTimeout(saveTimer);
    try {
      fs.writeFileSync(DB_FILE + '.tmp', JSON.stringify(db));
      fs.renameSync(DB_FILE + '.tmp', DB_FILE);
    } catch (err) {
      console.error('Final save failed:', err);
    }
    process.exit(0);
  });
}
