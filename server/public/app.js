'use strict';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const $ = (sel) => document.querySelector(sel);

/** Small element builder; text is always set as textContent, never as HTML. */
function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) if (c != null) el.append(c);
  return el;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
function icon(d, cls) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  if (cls) svg.setAttribute('class', cls);
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', d);
  svg.append(path);
  return svg;
}
const ICONS = {
  film: 'M18 4l2 4h-3l-2-4h-2l2 4h-3l-2-4H8l2 4H7L5 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V4z',
  more: 'M12 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4m0 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4m0 6a2 2 0 1 0 0 4 2 2 0 0 0 0-4',
  edit: 'M3 17.25V21h3.75L17.81 9.94l-3.75-3.75zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75z',
  download: 'M5 20h14v-2H5zM19 9h-4V3H9v6H5l7 7z',
  delete: 'M6 19a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7H6zM19 4h-3.5l-1-1h-5l-1 1H5v2h14z',
  restart: 'M12 5V1L7 6l5 5V7a6 6 0 1 1-6 6H4a8 8 0 1 0 8-8',
  close: 'M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z',
  retry: 'M17.65 6.35A7.96 7.96 0 0 0 12 4a8 8 0 1 0 7.75 10h-2.08A6 6 0 1 1 12 6c1.66 0 3.14.69 4.22 1.78L13 11h7V4z',
};

function formatTime(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return hh ? `${hh}:${String(mm).padStart(2, '0')}:${ss}` : `${mm}:${ss}`;
}

function formatSize(bytes) {
  if (!bytes) return '';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  let v = bytes;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(i >= 3 ? 2 : 0)} ${units[i]}`;
}

function formatAgo(ts) {
  const diff = (Date.now() - ts) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} h ago`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)} d ago`;
  return new Date(ts).toLocaleDateString();
}

function resolution(v) {
  const p = Math.min(v.width || 0, v.height || 0);
  if (!p) return null;
  if (p >= 2160) return '4K';
  if (p >= 1440) return '1440p';
  if (p >= 1080) return '1080p';
  if (p >= 720) return '720p';
  return `${p}p`;
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

async function api(path, { method = 'GET', body, keepalive } = {}) {
  const res = await fetch(path, {
    method,
    credentials: 'same-origin',
    keepalive,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401 && path !== '/api/login') {
    showLogin();
    throw new Error('Not signed in');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || `Request failed (${res.status})`), { status: res.status });
  return data;
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

const state = {
  videos: [],
  query: '',
  sort: localStorage.getItem('v1.sort') || 'date',
  current: null, // video being watched
};

function sortedVideos() {
  const q = state.query.trim().toLowerCase();
  const list = state.videos.filter((v) => !q || v.title.toLowerCase().includes(q));
  const by = {
    date: (a, b) => b.created - a.created,
    name: (a, b) => a.title.localeCompare(b.title, undefined, { numeric: true }),
    length: (a, b) => b.duration - a.duration,
    size: (a, b) => b.size - a.size,
  }[state.sort] || (() => 0);
  return list.sort(by);
}

function inProgress() {
  return state.videos
    .filter((v) => v.progress && v.progress.position > 0)
    .sort((a, b) => b.progress.updated - a.progress.updated);
}

async function loadVideos() {
  const { videos } = await api('/api/videos');
  state.videos = videos;
  render();
}

// ---------------------------------------------------------------------------
// Login
// ---------------------------------------------------------------------------

function showLogin() {
  $('#app').hidden = true;
  $('#login').hidden = false;
  $('#password').focus();
}

$('#login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const button = e.submitter || $('#login-form button');
  button.disabled = true;
  $('#login-error').textContent = '';
  try {
    await api('/api/login', { method: 'POST', body: { password: $('#password').value } });
    $('#password').value = '';
    $('#login').hidden = true;
    start();
  } catch (err) {
    $('#login-error').textContent = err.message;
  } finally {
    button.disabled = false;
  }
});

$('#logout-btn').addEventListener('click', async () => {
  if (uploads.some((u) => u.status === 'uploading' || u.status === 'queued')) {
    if (!confirm('Uploads are still running. Sign out anyway?')) return;
  }
  await api('/api/logout', { method: 'POST' }).catch(() => {});
  location.hash = '#/';
  showLogin();
});

// ---------------------------------------------------------------------------
// Library rendering
// ---------------------------------------------------------------------------

function thumbEl(v, { showProgress = true } = {}) {
  const box = h('div', { class: 'thumb' }, icon(ICONS.film, 'placeholder'));
  if (v.thumb) {
    const img = h('img', { src: `/api/videos/${v.id}/thumb`, alt: '', loading: 'lazy', decoding: 'async' });
    img.addEventListener('error', () => img.remove());
    box.append(img);
  }
  if (!v.ready) box.append(h('span', { class: 'badge left', text: 'Processing…' }));
  if (v.duration) box.append(h('span', { class: 'badge', text: formatTime(v.duration) }));
  if (showProgress && v.progress && v.progress.position > 0 && v.duration) {
    const bar = h('i');
    bar.style.width = `${Math.min(100, (v.progress.position / v.duration) * 100)}%`;
    box.append(h('div', { class: 'bar' }, bar));
  }
  return box;
}

function card(v, { continueRow = false } = {}) {
  const meta = continueRow && v.progress
    ? `${formatTime(v.duration - v.progress.position)} left`
    : [resolution(v), formatSize(v.size), formatAgo(v.created)].filter(Boolean).join(' · ');
  const more = h('button', {
    class: 'icon-btn small more',
    'aria-label': `Options for ${v.title}`,
    onclick: (e) => {
      e.preventDefault();
      e.stopPropagation();
      openMenu(e.currentTarget, v);
    },
  }, icon(ICONS.more));
  return h('a', { class: 'card', href: `#/watch/${v.id}` },
    thumbEl(v),
    h('div', { class: 'card-body' },
      h('div', { class: 'card-text' },
        h('div', { class: 'card-title', text: v.title, title: v.title }),
        h('div', { class: 'card-meta', text: meta })),
      more));
}

function render() {
  const list = sortedVideos();
  const resume = state.query ? [] : inProgress();

  $('#continue').hidden = resume.length === 0;
  $('#continue-row').replaceChildren(...resume.map((v) => card(v, { continueRow: true })));
  $('#grid').replaceChildren(...list.map((v) => card(v)));
  $('#count').textContent = state.videos.length ? `· ${state.videos.length}` : '';
  $('#empty').hidden = list.length > 0;
  if (state.videos.length && !list.length) {
    $('#empty-title').textContent = 'No matches';
    $('#empty-text').textContent = `Nothing matches "${state.query}".`;
  } else {
    $('#empty-title').textContent = 'No videos yet';
    $('#empty-text').textContent = 'Drag videos here or press Upload. You can also upload from the Android app.';
  }
  if (state.current) renderUpNext();
}

$('#search').addEventListener('input', (e) => {
  state.query = e.target.value;
  if (location.hash.startsWith('#/watch')) location.hash = '#/';
  render();
});
$('#sort').value = state.sort;
$('#sort').addEventListener('change', (e) => {
  state.sort = e.target.value;
  localStorage.setItem('v1.sort', state.sort);
  render();
});

// ---------------------------------------------------------------------------
// Card menu: rename / download / delete
// ---------------------------------------------------------------------------

const menu = $('#menu');

function openMenu(anchor, v) {
  const item = (label, ic, onclick, cls) => h('button', { role: 'menuitem', class: cls, onclick: () => { closeMenu(); onclick(); } }, icon(ic), label);
  const items = [];
  if (v.progress && v.progress.position > 0) {
    items.push(item('Start from beginning', ICONS.restart, async () => {
      await api(`/api/videos/${v.id}/progress`, { method: 'DELETE' });
      v.progress = null;
      render();
    }));
  }
  items.push(
    item('Rename', ICONS.edit, () => renameVideo(v)),
    item('Download', ICONS.download, () => { location.href = `/api/videos/${v.id}/download`; }),
    item('Delete', ICONS.delete, () => deleteVideo(v), 'danger'),
  );
  menu.replaceChildren(...items);
  menu.hidden = false;
  const r = anchor.getBoundingClientRect();
  const w = menu.offsetWidth;
  const hgt = menu.offsetHeight;
  menu.style.left = `${Math.max(8, Math.min(r.right - w, innerWidth - w - 8))}px`;
  menu.style.top = `${r.bottom + hgt + 8 > innerHeight ? r.top - hgt - 4 : r.bottom + 4}px`;
  menu.querySelector('button').focus();
}
function closeMenu() { menu.hidden = true; }
document.addEventListener('click', (e) => { if (!menu.contains(e.target)) closeMenu(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenu(); });
addEventListener('scroll', closeMenu, { passive: true });

async function renameVideo(v) {
  const title = prompt('Rename video', v.title);
  if (!title || title.trim() === v.title) return;
  const updated = await api(`/api/videos/${v.id}`, { method: 'PATCH', body: { title: title.trim() } });
  Object.assign(v, updated);
  render();
  if (state.current?.id === v.id) showWatchInfo(v);
}

async function deleteVideo(v) {
  if (!confirm(`Delete "${v.title}" from the server? This can't be undone.`)) return;
  await api(`/api/videos/${v.id}`, { method: 'DELETE' });
  state.videos = state.videos.filter((x) => x.id !== v.id);
  if (state.current?.id === v.id) location.hash = '#/';
  render();
}

// ---------------------------------------------------------------------------
// Watch page with resume
// ---------------------------------------------------------------------------

const video = $('#video');
let lastSaved = 0;
let resumeTimer = null;
let nextTimer = null;

function showWatchInfo(v) {
  $('#watch-title').textContent = v.title;
  $('#watch-meta').textContent = [
    v.duration ? formatTime(v.duration) : null, resolution(v), formatSize(v.size), `Added ${formatAgo(v.created)}`,
  ].filter(Boolean).join(' · ');
  $('#download-link').href = `/api/videos/${v.id}/download`;
  $('#web-warning').hidden = v.webPlayable;
  document.title = `${v.title} · V1 Player`;
}

function renderUpNext() {
  const list = sortedVideos();
  const idx = list.findIndex((x) => x.id === state.current.id);
  const after = idx >= 0 ? [...list.slice(idx + 1), ...list.slice(0, idx)] : list;
  $('#up-next').replaceChildren(...after.slice(0, 12).map((v) =>
    h('a', { class: 'item', href: `#/watch/${v.id}` },
      thumbEl(v),
      h('div', {},
        h('div', { class: 'card-title', text: v.title }),
        h('div', { class: 'card-meta', text: [formatSize(v.size), formatAgo(v.created)].filter(Boolean).join(' · ') })))));
}

function nextVideo() {
  const list = sortedVideos();
  const idx = list.findIndex((x) => x.id === state.current?.id);
  return idx >= 0 ? list[idx + 1] : null;
}

async function openWatch(id) {
  let v = state.videos.find((x) => x.id === id);
  if (!v) {
    try {
      v = await api(`/api/videos/${id}`);
    } catch {
      location.hash = '#/';
      return;
    }
  }
  if (state.current?.id !== v.id) saveProgress(true);
  state.current = v;
  $('#library').hidden = true;
  $('#watch').hidden = false;
  hideNextOverlay();
  $('#resume-toast').hidden = true;
  showWatchInfo(v);
  renderUpNext();
  scrollTo(0, 0);

  // Always use the latest progress from the server (it may have been watched on the phone).
  let progress = v.progress;
  try {
    ({ progress } = await api(`/api/videos/${v.id}/progress`));
    v.progress = progress;
  } catch { /* use what we have */ }

  video.src = `/api/videos/${v.id}/stream`;
  video.addEventListener('loadedmetadata', function onMeta() {
    video.removeEventListener('loadedmetadata', onMeta);
    const duration = video.duration * 1000;
    if (progress && progress.position > 5000 && (!duration || progress.position < duration - 5000)) {
      video.currentTime = progress.position / 1000;
      $('#resume-time').textContent = formatTime(progress.position);
      $('#resume-toast').hidden = false;
      clearTimeout(resumeTimer);
      resumeTimer = setTimeout(() => { $('#resume-toast').hidden = true; }, 7000);
    }
    video.play().catch(() => { /* autoplay blocked: user presses play */ });
  });
}

function closeWatch() {
  saveProgress(true);
  video.pause();
  video.removeAttribute('src');
  video.load();
  state.current = null;
  hideNextOverlay();
  $('#watch').hidden = true;
  $('#library').hidden = false;
  document.title = 'V1 Player';
  render();
}

function saveProgress(force = false) {
  const v = state.current;
  if (!v || !video.src || !isFinite(video.duration) || video.readyState < 1) return;
  const now = Date.now();
  if (!force && now - lastSaved < 5000) return;
  lastSaved = now;
  const position = Math.round(video.currentTime * 1000);
  const duration = Math.round(video.duration * 1000);
  v.progress = position > 5000 && position < duration - 5000 ? { position, updated: now } : null;
  api(`/api/videos/${v.id}/progress`, { method: 'PUT', body: { position, duration }, keepalive: true })
    .then((r) => { v.progress = r.progress; })
    .catch(() => {});
}

video.addEventListener('timeupdate', () => saveProgress());
video.addEventListener('pause', () => saveProgress(true));
video.addEventListener('seeked', () => saveProgress(true));
document.addEventListener('visibilitychange', () => { if (document.hidden) saveProgress(true); });
addEventListener('pagehide', () => saveProgress(true));

$('#start-over').addEventListener('click', () => {
  video.currentTime = 0;
  video.play().catch(() => {});
  $('#resume-toast').hidden = true;
  saveProgress(true);
});

video.addEventListener('ended', () => {
  saveProgress(true);
  const next = nextVideo();
  if (!next) return;
  $('#next-title').textContent = next.title;
  $('#next-overlay').hidden = false;
  let n = 8;
  $('#next-count').textContent = `(${n})`;
  clearInterval(nextTimer);
  nextTimer = setInterval(() => {
    n--;
    $('#next-count').textContent = `(${n})`;
    if (n <= 0) {
      hideNextOverlay();
      location.hash = `#/watch/${next.id}`;
    }
  }, 1000);
});
function hideNextOverlay() {
  clearInterval(nextTimer);
  $('#next-overlay').hidden = true;
}
$('#next-cancel').addEventListener('click', hideNextOverlay);
$('#next-play').addEventListener('click', () => {
  const next = nextVideo();
  hideNextOverlay();
  if (next) location.hash = `#/watch/${next.id}`;
});

$('#rename-btn').addEventListener('click', () => state.current && renameVideo(state.current));
$('#delete-btn').addEventListener('click', () => state.current && deleteVideo(state.current));

// Keyboard shortcuts on the watch page.
document.addEventListener('keydown', (e) => {
  if ($('#watch').hidden || e.ctrlKey || e.metaKey || e.altKey) return;
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;
  const k = e.key.toLowerCase();
  if (k === ' ' || k === 'k') {
    if (document.activeElement === video && k === ' ') return; // native controls handle it
    e.preventDefault();
    video.paused ? video.play() : video.pause();
  } else if (k === 'arrowright' || k === 'l') {
    if (document.activeElement === video && k === 'arrowright') return;
    video.currentTime = Math.min(video.duration || 0, video.currentTime + 10);
  } else if (k === 'arrowleft' || k === 'j') {
    if (document.activeElement === video && k === 'arrowleft') return;
    video.currentTime = Math.max(0, video.currentTime - 10);
  } else if (k === 'f') {
    document.fullscreenElement ? document.exitFullscreen() : video.requestFullscreen?.();
  } else if (k === 'm') {
    video.muted = !video.muted;
  }
});

// ---------------------------------------------------------------------------
// Uploads: chunked and resumable
// ---------------------------------------------------------------------------

const CHUNK = 8 * 1024 * 1024;
const uploads = [];
let uploading = false;

function addFiles(files) {
  const accepted = [...files].filter((f) => f.type.startsWith('video/') || /\.(mkv|avi|mov|m4v|ts|m2ts|mts|webm|wmv|flv|3gp|mpg|mpeg|ogv)$/i.test(f.name));
  if (!accepted.length) {
    alert('Those files don\'t look like videos.');
    return;
  }
  for (const file of accepted) {
    const u = { file, status: 'queued', sent: 0, id: null, xhr: null, cancelled: false };
    u.el = uploadRow(u);
    uploads.push(u);
    $('#uploads-list').append(u.el.li);
  }
  $('#uploads').hidden = false;
  updateUploadsTitle();
  pumpUploads();
}

function uploadRow(u) {
  const bar = h('i');
  const status = h('div', { class: 'status', text: 'Waiting…' });
  const action = h('button', { class: 'icon-btn small', 'aria-label': 'Cancel upload', title: 'Cancel' }, icon(ICONS.close));
  action.addEventListener('click', () => (u.status === 'failed' ? retryUpload(u) : cancelUpload(u)));
  const li = h('li', {},
    h('div', { class: 'name', text: u.file.name, title: u.file.name }),
    action, status, h('div', { class: 'progress' }, bar));
  return { li, bar, status, action };
}

function setUploadStatus(u, status, text) {
  u.status = status;
  u.el.li.className = status;
  u.el.status.textContent = text;
  if (status === 'failed') {
    u.el.action.replaceChildren(icon(ICONS.retry));
    u.el.action.title = 'Retry';
    u.el.action.setAttribute('aria-label', 'Retry upload');
  } else if (status === 'done' || status === 'cancelled') {
    u.el.action.remove();
  }
  updateUploadsTitle();
}

function updateUploadsTitle() {
  const active = uploads.filter((u) => u.status === 'uploading' || u.status === 'queued').length;
  $('#uploads-title').textContent = active ? `Uploading ${active} video${active > 1 ? 's' : ''}` : 'Uploads finished';
}

async function pumpUploads() {
  if (uploading) return;
  uploading = true;
  try {
    let next;
    while ((next = uploads.find((u) => u.status === 'queued'))) await runUpload(next);
  } finally {
    uploading = false;
  }
}

function putChunk(u, offset, blob) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    u.xhr = xhr;
    xhr.open('PUT', `/api/uploads/${u.id}`);
    xhr.setRequestHeader('Upload-Offset', String(offset));
    xhr.setRequestHeader('Content-Type', 'application/octet-stream');
    xhr.upload.onprogress = (e) => showUploadProgress(u, offset + e.loaded);
    xhr.onload = () => {
      let data = {};
      try { data = JSON.parse(xhr.responseText); } catch { /* ignore */ }
      if (xhr.status === 200 || xhr.status === 409) resolve(data);
      else if (xhr.status === 401) { showLogin(); reject(new Error('Signed out')); }
      else reject(Object.assign(new Error(data.error || `Upload failed (${xhr.status})`), { fatal: xhr.status === 404 || xhr.status === 413 || xhr.status === 415 }));
    };
    xhr.onerror = () => reject(new Error('Connection lost'));
    xhr.onabort = () => reject(Object.assign(new Error('Cancelled'), { cancelled: true }));
    xhr.send(blob);
  });
}

function showUploadProgress(u, sent) {
  const now = performance.now();
  if (!u.startedAt) { u.startedAt = now; u.startBytes = sent; }
  const pct = (sent / u.file.size) * 100;
  u.el.bar.style.width = `${pct}%`;
  const secs = (now - u.startedAt) / 1000;
  const speed = secs > 1 ? (sent - u.startBytes) / secs : 0;
  const left = speed ? (u.file.size - sent) / speed : 0;
  u.el.status.textContent = `${pct.toFixed(0)}% · ${formatSize(sent)} of ${formatSize(u.file.size)}`
    + (speed ? ` · ${formatSize(speed)}/s · ${formatTime(left * 1000)} left` : '');
}

async function runUpload(u) {
  setUploadStatus(u, 'uploading', 'Starting…');
  let failures = 0;
  try {
    if (!u.id) {
      const created = await api('/api/uploads', { method: 'POST', body: { name: u.file.name, size: u.file.size } });
      u.id = created.id;
    }
    let offset = (await api(`/api/uploads/${u.id}`)).offset;
    for (;;) {
      if (u.cancelled) throw Object.assign(new Error('Cancelled'), { cancelled: true });
      try {
        const res = await putChunk(u, offset, u.file.slice(offset, offset + CHUNK));
        failures = 0;
        offset = res.offset;
        showUploadProgress(u, offset);
        if (res.done) {
          setUploadStatus(u, 'done', `Uploaded · ${formatSize(u.file.size)}`);
          u.el.bar.style.width = '100%';
          state.videos.unshift(res.video);
          render();
          return;
        }
      } catch (err) {
        if (err.cancelled || err.fatal || err.message === 'Signed out') throw err;
        // Network hiccup: wait, ask the server how much it has, and carry on from there.
        failures++;
        if (failures > 30) throw err;
        const wait = Math.min(30, 2 ** Math.min(failures, 5));
        u.el.status.textContent = `Connection problem, retrying in ${wait}s…`;
        await new Promise((r) => setTimeout(r, wait * 1000));
        offset = (await api(`/api/uploads/${u.id}`)).offset;
      }
    }
  } catch (err) {
    if (err.cancelled) {
      setUploadStatus(u, 'cancelled', 'Cancelled');
      if (u.id) api(`/api/uploads/${u.id}`, { method: 'DELETE' }).catch(() => {});
    } else {
      setUploadStatus(u, 'failed', `${err.message} · press retry`);
    }
  } finally {
    u.xhr = null;
  }
}

function cancelUpload(u) {
  u.cancelled = true;
  if (u.status === 'queued') setUploadStatus(u, 'cancelled', 'Cancelled');
  u.xhr?.abort();
}

function retryUpload(u) {
  u.cancelled = false;
  u.el.action.replaceChildren(icon(ICONS.close));
  u.el.action.title = 'Cancel';
  setUploadStatus(u, 'queued', 'Waiting…');
  pumpUploads();
}

$('#upload-btn').addEventListener('click', () => $('#file-input').click());
$('#file-input').addEventListener('change', (e) => {
  addFiles(e.target.files);
  e.target.value = '';
});
$('#uploads-close').addEventListener('click', () => {
  $('#uploads').hidden = true;
  for (const u of uploads.filter((x) => ['done', 'cancelled'].includes(x.status))) {
    u.el.li.remove();
    uploads.splice(uploads.indexOf(u), 1);
  }
});
addEventListener('beforeunload', (e) => {
  if (uploads.some((u) => u.status === 'uploading' || u.status === 'queued')) e.preventDefault();
});

// Drag and drop anywhere.
let dragDepth = 0;
const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes('Files');
addEventListener('dragenter', (e) => {
  if (!hasFiles(e) || $('#app').hidden) return;
  e.preventDefault();
  dragDepth++;
  $('#drop').hidden = false;
});
addEventListener('dragover', (e) => { if (hasFiles(e)) e.preventDefault(); });
addEventListener('dragleave', () => {
  dragDepth = Math.max(0, dragDepth - 1);
  if (!dragDepth) $('#drop').hidden = true;
});
addEventListener('drop', (e) => {
  if (!hasFiles(e)) return;
  e.preventDefault();
  dragDepth = 0;
  $('#drop').hidden = true;
  if (!$('#app').hidden) addFiles(e.dataTransfer.files);
});

// ---------------------------------------------------------------------------
// Routing and startup
// ---------------------------------------------------------------------------

function route() {
  const m = /^#\/watch\/([\w-]+)/.exec(location.hash);
  if (m) openWatch(m[1]);
  else if (state.current || !$('#watch').hidden) closeWatch();
}
addEventListener('hashchange', route);

let refreshTimer = null;
async function start() {
  try {
    await loadVideos();
  } catch {
    return;
  }
  $('#app').hidden = false;
  route();
  clearInterval(refreshTimer);
  // Keep the list fresh (thumbnails finishing, uploads from the phone, progress from other devices).
  refreshTimer = setInterval(() => {
    if (!document.hidden && !$('#app').hidden) loadVideos().catch(() => {});
  }, 20000);
}

start();
