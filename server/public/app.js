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
  plus: 'M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6z',
  up: 'M7.41 15.41 12 10.83l4.59 4.58L18 14l-6-6-6 6z',
  down: 'M7.41 8.59 12 13.17l4.59-4.58L18 10l-6 6-6-6z',
  series: 'M4 6H2v14a2 2 0 0 0 2 2h14v-2H4zm16-4H8a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2m-8 12.5v-9l6 4.5z',
  check: 'M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z',
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
  series: [],
  seriesContext: null, // series id when a video was opened from a series
  openSeries: null, // series shown on the series page
  seasonId: null, // selected season on the series page
};

const videoById = (id) => state.videos.find((v) => v.id === id);
const epLabel = (e) => `S${e.season} E${e.episode}`;
const watchHref = (id, seriesId) => `#/watch/${id}${seriesId ? `?s=${seriesId}` : ''}`;

/** Every episode of a series in viewing order, with its season/episode numbers. */
function episodesOf(sr) {
  return sr.seasons
    .flatMap((season, si) => season.episodes.map((id, ei) => ({ id, season: si + 1, episode: ei + 1, seasonId: season.id })))
    .filter((e) => videoById(e.id));
}

/** The first series a video belongs to (for labels on the hero). */
function seriesFor(videoId) {
  return state.series.find((sr) => sr.seasons.some((se) => se.episodes.includes(videoId))) || null;
}

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
  const [{ videos }, { series }] = await Promise.all([api('/api/videos'), api('/api/series')]);
  state.videos = videos;
  state.series = series;
  if (state.openSeries) {
    state.openSeries = series.find((sr) => sr.id === state.openSeries.id) || state.openSeries;
    renderSeries();
  }
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

function card(v, { continueRow = false, index = 0 } = {}) {
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
  const el = h('a', { class: 'card', href: `#/watch/${v.id}` },
    thumbEl(v),
    h('div', { class: 'card-body' },
      h('div', { class: 'card-text' },
        h('div', { class: 'card-title', text: v.title, title: v.title }),
        h('div', { class: 'card-meta', text: meta })),
      more));
  el.style.setProperty('--i', String(Math.min(index, 16)));
  return el;
}

// ---------------------------------------------------------------------------
// Ambient backdrop: a blurred frame of the featured video, cross-faded on change
// ---------------------------------------------------------------------------

const ambientLayers = [$('#amb-a'), $('#amb-b')];
let ambientFront = 0;
let ambientUrl = null;

function setAmbient(url) {
  if (url === ambientUrl) return;
  ambientUrl = url;
  if (!url) {
    ambientLayers.forEach((img) => img.classList.remove('on'));
    return;
  }
  const back = ambientLayers[1 - ambientFront];
  back.onload = () => {
    if (ambientUrl !== url) return;
    back.classList.add('on');
    ambientLayers[ambientFront].classList.remove('on');
    ambientFront = 1 - ambientFront;
  };
  back.src = url;
}

const thumbUrl = (v) => (v && v.thumb ? `/api/videos/${v.id}/thumb` : null);

/** The featured video: the one you were last watching, otherwise the newest. */
function heroVideo() {
  return inProgress()[0] || [...state.videos].sort((a, b) => b.created - a.created)[0] || null;
}

function renderHero(hero) {
  $('#hero').hidden = !hero;
  if (!hero) return;
  const resuming = hero.progress && hero.progress.position > 0 && hero.duration;
  const sr = seriesFor(hero.id);
  const ep = sr && episodesOf(sr).find((e) => e.id === hero.id);
  $('#hero-eyebrow').textContent = ep ? `${sr.title} · ${epLabel(ep)}` : resuming ? 'Continue watching' : 'Latest';
  $('#hero-title').textContent = hero.title;
  $('#hero-meta').textContent = resuming
    ? `${formatTime(hero.duration - hero.progress.position)} left · ${formatTime(hero.duration)}`
    : [hero.duration ? formatTime(hero.duration) : null, resolution(hero), `Added ${formatAgo(hero.created)}`].filter(Boolean).join(' · ');
  $('#hero-play-label').textContent = resuming ? 'Resume' : 'Play';
  $('#hero-restart').hidden = !resuming;
  $('#hero-restart').dataset.id = hero.id;
  $('#hero-media').href = $('#hero-play').href = watchHref(hero.id, sr?.id);
  $('#hero-bar').hidden = !resuming;
  $('#hero-progress').style.width = resuming ? `${Math.min(100, (hero.progress.position / hero.duration) * 100)}%` : '0';
  const img = $('#hero-img');
  const url = thumbUrl(hero);
  if (url && img.getAttribute('src') !== url) img.src = url;
  if (!url) img.removeAttribute('src');
}

$('#hero-restart').addEventListener('click', async () => {
  const id = $('#hero-restart').dataset.id;
  await api(`/api/videos/${id}/progress`, { method: 'DELETE' }).catch(() => {});
  const v = state.videos.find((x) => x.id === id);
  if (v) v.progress = null;
  location.hash = watchHref(id, seriesFor(id)?.id);
});

function render() {
  const list = sortedVideos();
  const hero = state.query ? null : heroVideo();
  // The hero already shows the most recent in-progress video, so the row holds the rest.
  const resume = state.query ? [] : inProgress().filter((v) => v.id !== hero?.id);

  renderHero(hero);
  if (!state.current && !state.openSeries) setAmbient(thumbUrl(hero));
  $('#series-section').hidden = Boolean(state.query) || !state.videos.length;
  $('#series-row').replaceChildren(...state.series.map((sr, index) => seriesCard(sr, index)));
  $('#series-empty').hidden = state.series.length > 0;
  $('#continue').hidden = resume.length === 0;
  $('#continue-row').replaceChildren(...resume.map((v, index) => card(v, { continueRow: true, index })));
  $('#grid').replaceChildren(...list.map((v, index) => card(v, { index })));
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

/** Shows a small menu under [anchor]. items: [{ label, icon, onClick, danger }] */
function showMenu(anchor, items) {
  menu.replaceChildren(...items.map(({ label, icon: ic, onClick, danger }) =>
    h('button', { role: 'menuitem', class: danger ? 'danger' : null, onclick: () => { closeMenu(); onClick(); } }, icon(ic), label)));
  menu.hidden = false;
  const r = anchor.getBoundingClientRect();
  const w = menu.offsetWidth;
  const hgt = menu.offsetHeight;
  menu.style.left = `${Math.max(8, Math.min(r.right - w, innerWidth - w - 8))}px`;
  menu.style.top = `${r.bottom + hgt + 8 > innerHeight ? r.top - hgt - 4 : r.bottom + 4}px`;
  menu.querySelector('button').focus();
}

function openMenu(anchor, v) {
  const items = [];
  if (v.progress && v.progress.position > 0) {
    items.push({
      label: 'Start from beginning',
      icon: ICONS.restart,
      onClick: async () => {
        await api(`/api/videos/${v.id}/progress`, { method: 'DELETE' });
        v.progress = null;
        render();
      },
    });
  }
  items.push(
    { label: 'Add to series…', icon: ICONS.series, onClick: () => addToSeriesDialog(v) },
    { label: 'Rename', icon: ICONS.edit, onClick: () => renameVideo(v) },
    { label: 'Download', icon: ICONS.download, onClick: () => { location.href = `/api/videos/${v.id}/download`; } },
    { label: 'Delete', icon: ICONS.delete, onClick: () => deleteVideo(v), danger: true },
  );
  showMenu(anchor, items);
}

/** Wires a ⋮ button to a menu built when it's clicked. */
function menuButton(button, buildItems) {
  button.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    showMenu(button, buildItems());
  });
}
function closeMenu() { menu.hidden = true; }
document.addEventListener('click', (e) => { if (!menu.contains(e.target)) closeMenu(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenu(); });
addEventListener('scroll', closeMenu, { passive: true });

async function renameVideo(v) {
  const title = await askText('Rename video', v.title, 'Save');
  if (!title || title.trim() === v.title) return;
  const updated = await api(`/api/videos/${v.id}`, { method: 'PATCH', body: { title: title.trim() } });
  Object.assign(v, updated);
  render();
  if (state.current?.id === v.id) showWatchInfo(v);
}

async function deleteVideo(v) {
  const ok = await confirmBox('Delete video?', `"${v.title}" will be deleted from your server, and removed from any series. This can't be undone.`, 'Delete', true);
  if (!ok) return;
  await api(`/api/videos/${v.id}`, { method: 'DELETE' });
  state.videos = state.videos.filter((x) => x.id !== v.id);
  loadVideos().catch(() => {}); // series lists changed too
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
  const sr = state.series.find((x) => x.id === state.seriesContext);
  const ep = sr && episodesOf(sr).find((e) => e.id === v.id);
  $('#watch-title').textContent = v.title;
  $('#watch-meta').textContent = [
    ep ? `${sr.title} · ${epLabel(ep)}` : null,
    v.duration ? formatTime(v.duration) : null, resolution(v), formatSize(v.size), `Added ${formatAgo(v.created)}`,
  ].filter(Boolean).join(' · ');
  $('#download-link').href = `/api/videos/${v.id}/download`;
  $('#web-warning').hidden = v.webPlayable;
  document.title = `${v.title} · Lumen`;
}

/** What plays after the current video: the rest of its series, or the rest of the library. */
function upNext() {
  const sr = state.series.find((x) => x.id === state.seriesContext);
  if (sr && state.current) {
    const eps = episodesOf(sr);
    const i = eps.findIndex((e) => e.id === state.current.id);
    if (i >= 0) return { series: sr, items: eps.slice(i + 1).map((e) => ({ v: videoById(e.id), label: epLabel(e) })) };
  }
  const list = sortedVideos();
  const idx = list.findIndex((x) => x.id === state.current?.id);
  const after = idx >= 0 ? [...list.slice(idx + 1), ...list.slice(0, idx)] : list;
  return { series: null, items: after.map((v) => ({ v })) };
}

function renderUpNext() {
  const { series, items } = upNext();
  $('#up-next-title').textContent = series ? `Up next in ${series.title}` : 'Up next';
  const rows = items.slice(0, 12).map(({ v, label }) =>
    h('a', { class: 'item', href: watchHref(v.id, series?.id) },
      thumbEl(v),
      h('div', {},
        label ? h('div', { class: 'ep-label', text: label }) : null,
        h('div', { class: 'card-title', text: v.title }),
        h('div', { class: 'card-meta', text: [v.duration ? formatTime(v.duration) : null, formatAgo(v.created)].filter(Boolean).join(' · ') }))));
  if (series && !items.length) rows.push(h('p', { class: 'muted', text: 'This is the last episode.' }));
  $('#up-next').replaceChildren(...rows);
}

function nextVideo() {
  const { series, items } = upNext();
  if (series) return items[0] ? { ...items[0], series } : null;
  const list = sortedVideos();
  const idx = list.findIndex((x) => x.id === state.current?.id);
  return idx >= 0 && list[idx + 1] ? { v: list[idx + 1] } : null;
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
  showView('watch');
  hideNextOverlay();
  $('#resume-toast').hidden = true;
  showWatchInfo(v);
  renderUpNext();
  setAmbient(thumbUrl(v));
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

function stopWatching() {
  saveProgress(true);
  video.pause();
  video.removeAttribute('src');
  video.load();
  state.current = null;
  hideNextOverlay();
  document.title = 'Lumen';
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
  $('#next-label').textContent = next.label ? `Next episode · ${next.label}` : 'Up next';
  $('#next-title').textContent = next.v.title;
  $('#next-overlay').hidden = false;
  let n = 8;
  $('#next-count').textContent = `(${n})`;
  clearInterval(nextTimer);
  nextTimer = setInterval(() => {
    n--;
    $('#next-count').textContent = `(${n})`;
    if (n <= 0) {
      hideNextOverlay();
      location.hash = watchHref(next.v.id, next.series?.id);
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
  if (next) location.hash = watchHref(next.v.id, next.series?.id);
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
// Dialogs and messages
// ---------------------------------------------------------------------------

const modal = $('#modal');
const modalCard = $('#modal-card');
let modalDone = null;

function openModal(content, onDone) {
  modalCard.replaceChildren(content);
  modal.hidden = false;
  modalDone = onDone || null;
  setTimeout(() => modalCard.querySelector('input:not([type=checkbox]), .btn.primary')?.focus(), 30);
}
function closeModal(result) {
  if (modal.hidden) return;
  modal.hidden = true;
  modalCard.replaceChildren();
  const done = modalDone;
  modalDone = null;
  done?.(result);
}
modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(null); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !modal.hidden) closeModal(null); });

/** Asks for a short piece of text (names). Resolves to the text, or null if cancelled. */
function askText(title, value = '', confirmLabel = 'Save', placeholder = '') {
  return new Promise((resolve) => {
    const input = h('input', { type: 'text', placeholder, maxlength: '200' });
    input.value = value;
    const form = h('form', {
      class: 'modal-form',
      onsubmit: (e) => {
        e.preventDefault();
        const text = input.value.trim();
        if (text) closeModal(text);
      },
    },
    h('h2', { text: title }),
    input,
    h('div', { class: 'modal-actions' },
      h('button', { type: 'button', class: 'btn', text: 'Cancel', onclick: () => closeModal(null) }),
      h('button', { type: 'submit', class: 'btn primary', text: confirmLabel })));
    openModal(form, resolve);
    setTimeout(() => input.select(), 40);
  });
}

function confirmBox(title, message, confirmLabel, danger = false) {
  return new Promise((resolve) => {
    openModal(h('div', { class: 'modal-form' },
      h('h2', { text: title }),
      h('p', { class: 'muted', text: message }),
      h('div', { class: 'modal-actions' },
        h('button', { class: 'btn', text: 'Cancel', onclick: () => closeModal(false) }),
        h('button', { class: danger ? 'btn danger-solid' : 'btn primary', text: confirmLabel, onclick: () => closeModal(true) }))),
    (result) => resolve(Boolean(result)));
  });
}

let snackTimer = null;
function snack(text) {
  const el = $('#snack');
  el.textContent = text;
  el.hidden = false;
  el.classList.remove('show');
  void el.offsetWidth; // restart the animation
  el.classList.add('show');
  clearTimeout(snackTimer);
  snackTimer = setTimeout(() => { el.hidden = true; }, 2800);
}
addEventListener('unhandledrejection', (e) => {
  if (e.reason?.message && e.reason.message !== 'Not signed in') snack(e.reason.message);
});

// ---------------------------------------------------------------------------
// Series
// ---------------------------------------------------------------------------

/** Stores an updated series from the server and refreshes whatever shows it. */
function upsertSeries(sr) {
  const i = state.series.findIndex((x) => x.id === sr.id);
  if (i >= 0) state.series[i] = sr; else state.series.unshift(sr);
  if (state.openSeries?.id === sr.id) {
    state.openSeries = sr;
    renderSeries();
  }
  if (!$('#library').hidden) render();
}

async function seriesCall(path, options) {
  const sr = await api(path, options);
  upsertSeries(sr);
  return sr;
}

function seriesCard(sr, index) {
  const poster = sr.posterVideoId ? `/api/videos/${sr.posterVideoId}/thumb` : null;
  const box = h('div', { class: 'thumb' }, icon(ICONS.series, 'placeholder'));
  if (poster) {
    const img = h('img', { src: poster, alt: '', loading: 'lazy', decoding: 'async' });
    img.addEventListener('error', () => img.remove());
    box.append(img);
  }
  box.append(h('span', { class: 'badge', text: `${sr.episodeCount} ep` }));
  const seasons = sr.seasons.length;
  const status = !sr.episodeCount ? 'No episodes yet'
    : sr.watchedCount >= sr.episodeCount ? 'All watched'
      : sr.nextUp ? `Next: ${epLabel(sr.nextUp)}` : '';
  const el = h('a', { class: 'card series-card', href: `#/series/${sr.id}` },
    h('div', { class: 'stack' }, box),
    h('div', { class: 'card-body' },
      h('div', { class: 'card-text' },
        h('div', { class: 'card-title', text: sr.title }),
        h('div', { class: 'card-meta', text: `${seasons} season${seasons === 1 ? '' : 's'} · ${status}` }))));
  el.style.setProperty('--i', String(Math.min(index, 16)));
  return el;
}

$('#new-series-btn').addEventListener('click', async () => {
  const title = await askText('New series', '', 'Create', 'e.g. Holiday 2026');
  if (!title) return;
  const sr = await seriesCall('/api/series', { method: 'POST', body: { title } });
  location.hash = `#/series/${sr.id}`;
});

async function openSeries(id) {
  showView('series-page');
  scrollTo(0, 0);
  if (state.openSeries?.id !== id) state.seasonId = null;
  state.openSeries = state.series.find((x) => x.id === id) || state.openSeries;
  if (state.openSeries?.id === id) renderSeries();
  try {
    upsertSeries(await api(`/api/series/${id}`));
    state.openSeries = state.series.find((x) => x.id === id);
    renderSeries();
  } catch {
    location.hash = '#/';
  }
}

function currentSeason() {
  const sr = state.openSeries;
  return sr.seasons.find((se) => se.id === state.seasonId) || sr.seasons[0];
}

function renderSeries() {
  const sr = state.openSeries;
  if (!sr || $('#series-page').hidden) return;
  const season = currentSeason();
  state.seasonId = season.id;
  document.title = `${sr.title} · Lumen`;

  $('#sp-title').textContent = sr.title;
  const n = sr.seasons.length;
  $('#sp-meta').textContent = [
    `${n} season${n === 1 ? '' : 's'}`,
    `${sr.episodeCount} episode${sr.episodeCount === 1 ? '' : 's'}`,
    sr.watchedCount ? `${sr.watchedCount} watched` : null,
  ].filter(Boolean).join(' · ');

  const poster = sr.posterVideoId ? `/api/videos/${sr.posterVideoId}/thumb` : null;
  const img = $('#sp-poster');
  img.hidden = !poster;
  if (poster && img.getAttribute('src') !== poster) img.src = poster;
  setAmbient(poster);

  const next = sr.nextUp && videoById(sr.nextUp.videoId);
  $('#sp-play').hidden = !next;
  if (next) {
    const verb = next.progress?.position > 0 ? 'Resume' : sr.watchedCount ? 'Play' : 'Start';
    $('#sp-play-label').textContent = `${verb} ${epLabel(sr.nextUp)}`;
    $('#sp-play').href = watchHref(next.id, sr.id);
  }

  $('#sp-seasons').replaceChildren(...sr.seasons.map((se) => h('button', {
    class: `season-tab${se.id === season.id ? ' active' : ''}`,
    role: 'tab',
    'aria-selected': String(se.id === season.id),
    onclick: () => {
      state.seasonId = se.id;
      renderSeries();
    },
  }, se.title, h('span', { class: 'count', text: String(se.episodes.length) }))));

  $('#sp-season-title').textContent = season.title;
  const episodes = season.episodes.map((id, i) => ({ v: videoById(id), n: i + 1 })).filter((e) => e.v);
  $('#sp-episodes').replaceChildren(...episodes.map((e, i) => episodeRow(sr, season, e, i, episodes.length)));
  $('#sp-empty').hidden = episodes.length > 0;
}

function episodeRow(sr, season, { v, n }, index, total) {
  const p = v.progress;
  const status = p?.finished ? 'Watched'
    : p?.position > 0 && v.duration ? `${formatTime(v.duration - p.position)} left`
      : v.duration ? formatTime(v.duration) : '';
  const isNext = sr.nextUp?.videoId === v.id && sr.seasons[sr.nextUp.season - 1]?.id === season.id;

  const move = async (delta) => {
    const ids = [...season.episodes];
    const j = index + delta;
    [ids[index], ids[j]] = [ids[j], ids[index]];
    await seriesCall(`/api/series/${sr.id}/seasons/${season.id}`, { method: 'PATCH', body: { episodes: ids } });
  };
  const control = (label, ic, onClick, disabled = false) => h('button', {
    class: 'icon-btn small',
    'aria-label': label,
    title: label,
    disabled,
    onclick: (e) => {
      e.preventDefault();
      onClick();
    },
  }, icon(ic));

  return h('li', { class: `episode${p?.finished ? ' watched' : ''}${isNext ? ' next' : ''}` },
    h('a', { class: 'ep-link', href: watchHref(v.id, sr.id) },
      h('span', { class: 'ep-num', text: String(n) }),
      thumbEl(v),
      h('div', { class: 'ep-text' },
        h('div', { class: 'card-title', text: v.title }),
        h('div', { class: 'card-meta' },
          isNext ? h('span', { class: 'next-pill', text: 'Up next' }) : null,
          status))),
    h('div', { class: 'ep-controls' },
      control('Move up', ICONS.up, () => move(-1), index === 0),
      control('Move down', ICONS.down, () => move(1), index === total - 1),
      control('Remove from season', ICONS.close, async () => {
        await seriesCall(`/api/series/${sr.id}/seasons/${season.id}/episodes/${v.id}`, { method: 'DELETE' });
        snack(`Removed "${v.title}" from ${season.title}`);
      })));
}

/** Picker for adding library videos to a season. */
function pickEpisodes(sr, season) {
  const inSeason = new Set(season.episodes);
  const chosen = new Set();
  const videos = [...state.videos].sort((a, b) => a.title.localeCompare(b.title, undefined, { numeric: true }));
  const search = h('input', { type: 'search', placeholder: 'Search your videos' });
  const list = h('div', { class: 'pick-list' });
  const addBtn = h('button', { class: 'btn primary', disabled: true, text: 'Add' });

  const update = () => {
    addBtn.disabled = chosen.size === 0;
    addBtn.textContent = chosen.size ? `Add ${chosen.size} episode${chosen.size === 1 ? '' : 's'}` : 'Add';
  };
  const draw = () => {
    const q = search.value.trim().toLowerCase();
    const rows = videos.filter((v) => !q || v.title.toLowerCase().includes(q)).map((v) => {
      const already = inSeason.has(v.id);
      const box = h('input', { type: 'checkbox', checked: already || chosen.has(v.id), disabled: already });
      box.addEventListener('change', () => {
        if (box.checked) chosen.add(v.id); else chosen.delete(v.id);
        update();
      });
      return h('label', { class: `pick-item${already ? ' added' : ''}` },
        box,
        thumbEl(v, { showProgress: false }),
        h('div', { class: 'pick-text' },
          h('div', { class: 'card-title', text: v.title }),
          h('div', { class: 'card-meta', text: already ? 'Already in this season' : [v.duration ? formatTime(v.duration) : null, formatAgo(v.created)].filter(Boolean).join(' · ') })));
    });
    list.replaceChildren(...rows);
    if (!rows.length) list.append(h('p', { class: 'muted pick-none', text: q ? 'No videos match.' : 'Your library is empty. Upload some videos first.' }));
  };
  search.addEventListener('input', draw);
  addBtn.addEventListener('click', async () => {
    const ids = videos.filter((v) => chosen.has(v.id)).map((v) => v.id);
    closeModal();
    await seriesCall(`/api/series/${sr.id}/seasons/${season.id}/episodes`, { method: 'POST', body: { videoIds: ids } });
    snack(`Added ${ids.length} episode${ids.length === 1 ? '' : 's'} to ${season.title}`);
  });
  draw();
  openModal(h('div', { class: 'modal-form picker' },
    h('h2', { text: `Add episodes to ${season.title}` }),
    h('p', { class: 'muted', text: 'They are added in name order; you can reorder them afterwards.' }),
    search,
    list,
    h('div', { class: 'modal-actions' },
      h('button', { class: 'btn', text: 'Cancel', onclick: () => closeModal() }),
      addBtn)));
}

/** "Add to series…" from a video's menu: pick a season, or start a new series with it. */
function addToSeriesDialog(v) {
  const body = h('div', { class: 'modal-form' },
    h('h2', { text: 'Add to series' }),
    h('p', { class: 'muted', text: v.title }));
  if (state.series.length) {
    body.append(h('div', { class: 'series-pick' }, ...state.series.map((sr) =>
      h('div', { class: 'series-pick-row' },
        h('div', { class: 'series-pick-title', text: sr.title }),
        h('div', { class: 'series-pick-seasons' }, ...sr.seasons.map((se) => {
          const has = se.episodes.includes(v.id);
          return h('button', {
            class: `chip${has ? ' on' : ''}`,
            disabled: has,
            onclick: async () => {
              closeModal();
              await seriesCall(`/api/series/${sr.id}/seasons/${se.id}/episodes`, { method: 'POST', body: { videoId: v.id } });
              snack(`Added to ${sr.title} · ${se.title}`);
            },
          }, has ? icon(ICONS.check) : null, se.title);
        }))))));
  }
  const name = h('input', { type: 'text', placeholder: 'New series name', maxlength: '200' });
  body.append(
    h('div', { class: 'divider-label', text: state.series.length ? 'Or start a new series' : 'Start a new series' }),
    h('form', {
      class: 'new-series-row',
      onsubmit: async (e) => {
        e.preventDefault();
        const title = name.value.trim();
        if (!title) return;
        closeModal();
        const sr = await api('/api/series', { method: 'POST', body: { title } });
        await seriesCall(`/api/series/${sr.id}/seasons/${sr.seasons[0].id}/episodes`, { method: 'POST', body: { videoId: v.id } });
        snack(`Created "${title}"`);
      },
    }, name, h('button', { type: 'submit', class: 'btn primary', text: 'Create' })),
    h('div', { class: 'modal-actions' }, h('button', { class: 'btn', text: 'Close', onclick: () => closeModal() })));
  openModal(body);
}

$('#sp-add-season').addEventListener('click', async () => {
  const sr = await seriesCall(`/api/series/${state.openSeries.id}/seasons`, { method: 'POST', body: {} });
  state.seasonId = sr.seasons[sr.seasons.length - 1].id;
  renderSeries();
});
$('#sp-add-episodes').addEventListener('click', () => pickEpisodes(state.openSeries, currentSeason()));
$('#sp-empty-add').addEventListener('click', () => pickEpisodes(state.openSeries, currentSeason()));

menuButton($('#sp-more'), () => [
  {
    label: 'Rename series',
    icon: ICONS.edit,
    onClick: async () => {
      const sr = state.openSeries;
      const title = await askText('Rename series', sr.title, 'Save');
      if (title && title !== sr.title) await seriesCall(`/api/series/${sr.id}`, { method: 'PATCH', body: { title } });
    },
  },
  {
    label: 'Delete series',
    icon: ICONS.delete,
    danger: true,
    onClick: async () => {
      const sr = state.openSeries;
      const ok = await confirmBox('Delete series?', `"${sr.title}" and its seasons will be removed. The videos stay in your library.`, 'Delete series', true);
      if (!ok) return;
      await api(`/api/series/${sr.id}`, { method: 'DELETE' });
      state.series = state.series.filter((x) => x.id !== sr.id);
      location.hash = '#/';
    },
  },
]);

menuButton($('#sp-season-more'), () => [
  {
    label: 'Rename season',
    icon: ICONS.edit,
    onClick: async () => {
      const sr = state.openSeries;
      const season = currentSeason();
      const title = await askText('Rename season', season.title, 'Save');
      if (title && title !== season.title) await seriesCall(`/api/series/${sr.id}/seasons/${season.id}`, { method: 'PATCH', body: { title } });
    },
  },
  {
    label: 'Delete season',
    icon: ICONS.delete,
    danger: true,
    onClick: async () => {
      const sr = state.openSeries;
      const season = currentSeason();
      const count = season.episodes.length;
      const ok = await confirmBox(
        `Delete ${season.title}?`,
        count ? `Its ${count} episode${count === 1 ? '' : 's'} will be removed from this series. The videos stay in your library.` : 'This season is empty.',
        'Delete season',
        true,
      );
      if (!ok) return;
      state.seasonId = null;
      await seriesCall(`/api/series/${sr.id}/seasons/${season.id}`, { method: 'DELETE' });
    },
  },
]);

// ---------------------------------------------------------------------------
// Routing and startup
// ---------------------------------------------------------------------------

const VIEWS = ['library', 'watch', 'series-page'];
function showView(name) {
  for (const id of VIEWS) $(`#${id}`).hidden = id !== name;
}

function route() {
  const watch = /^#\/watch\/([\w-]+)(?:\?s=([\w-]+))?/.exec(location.hash);
  if (watch) {
    state.seriesContext = watch[2] || null;
    openWatch(watch[1]);
    return;
  }
  if (state.current) stopWatching();
  const series = /^#\/series\/([\w-]+)/.exec(location.hash);
  if (series) {
    openSeries(series[1]);
  } else {
    state.openSeries = null;
    showView('library');
    render();
  }
}
addEventListener('hashchange', route);

let refreshTimer = null;
async function start() {
  // Servers without a password skip sign-in entirely, so there's nothing to sign out of.
  try {
    const health = await (await fetch('/api/health')).json();
    $('#logout-btn').hidden = health.auth === false;
  } catch { /* offline: carry on, loadVideos will report */ }
  try {
    await loadVideos();
  } catch {
    return;
  }
  $('#app').hidden = false;
  // Cards fade up once when the app opens, not on every refresh.
  document.body.classList.add('intro');
  setTimeout(() => document.body.classList.remove('intro'), 1800);
  route();
  clearInterval(refreshTimer);
  // Keep the list fresh (thumbnails finishing, uploads from the phone, progress from other devices).
  refreshTimer = setInterval(() => {
    if (!document.hidden && !$('#app').hidden) loadVideos().catch(() => {});
  }, 20000);
}

start();
