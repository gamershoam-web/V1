// Pilot accounts: sign up / sign in, and cloud saves of all progress (XP, best scores and every game's save).
// Play always runs from localStorage. When signed in, changes are uploaded a few seconds later and merged
// with saves from the player's other devices: XP and best scores take the highest value, and each game
// keeps its newest save. The first time an account is used on a device that already has different game
// progress, the player chooses which to keep.
import { Store } from './storage.js';

const META_KEY = 'orbitHub.sync';
const GAME_PREFIX = 'orbitHub.game.';
const PUSH_DELAY = 4000;
const PUSH_MAX_WAIT = 20000;

const ls = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* full or blocked */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* blocked */ } },
  keys() { try { return Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i)); } catch { return []; } },
};
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

function readMeta() {
  try { return { user: null, rev: 0, dirty: false, gameTimes: {}, syncedAt: 0, ...(JSON.parse(ls.get(META_KEY)) || {}) }; } catch { return { user: null, rev: 0, dirty: false, gameTimes: {}, syncedAt: 0 }; }
}
let meta = readMeta();
const writeMeta = () => ls.set(META_KEY, JSON.stringify(meta));

const listeners = new Set();
let state = { ready: false, available: false, features: { google: null, emailReset: false }, user: null, status: 'idle', error: '', lastSync: meta.syncedAt || 0, conflicts: null };
function set(patch) {
  state = { ...state, ...patch };
  listeners.forEach((fn) => { try { fn(state); } catch (e) { console.error(e); } });
}

async function api(method, path, body, { keepalive = false } = {}) {
  let res;
  try {
    res = await fetch(`/api${path}`, {
      method, credentials: 'same-origin', keepalive, cache: 'no-store',
      headers: body ? { 'Content-Type': 'application/json', 'X-Requested-With': 'orbit-hub' } : { 'X-Requested-With': 'orbit-hub' },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    const err = new Error("Can't reach the server. Check your connection.");
    err.status = 0;
    throw err;
  }
  let data = null;
  try { data = await res.json(); } catch { /* not JSON */ }
  if (!res.ok || !data) {
    const err = new Error(data?.error || (res.status === 429 ? 'Too many attempts. Please wait a moment.' : 'Something went wrong. Please try again.'));
    err.status = res.status;
    err.data = data || {};
    err.notApi = !data;
    throw err;
  }
  return data;
}

/* ---------------------------------------------------------------- local progress */
function localGames() {
  const out = {};
  for (const k of ls.keys()) {
    if (!k || !k.startsWith(GAME_PREFIX)) continue;
    try { const v = JSON.parse(ls.get(k)); if (v != null) out[k.slice(GAME_PREFIX.length)] = v; } catch { /* corrupt save */ }
  }
  return out;
}
const snapshot = () => ({ v: 1, profile: Store.exportProgress(), games: localGames(), gameTimes: { ...meta.gameTimes } });

function mergeProfiles(a = {}, b = {}) {
  const best = { ...(a.best || {}) };
  for (const [k, v] of Object.entries(b.best || {})) best[k] = Math.max(best[k] || 0, Number(v) || 0);
  return { xp: Math.max(Number(a.xp) || 0, Number(b.xp) || 0), best, visited: { ...(a.visited || {}), ...(b.visited || {}) } };
}

// prefer: 'newest' (by save time), 'cloud' or 'local' for games saved differently on both sides
function mergeGames(local, cloud, prefer) {
  const games = {}, times = {}, fromCloud = [];
  const ids = new Set([...Object.keys(local.games || {}), ...Object.keys(cloud.games || {})]);
  for (const id of ids) {
    const L = local.games?.[id], C = cloud.games?.[id];
    const lt = local.gameTimes?.[id] || 0, ct = cloud.gameTimes?.[id] || 0;
    let useCloud;
    if (L == null) useCloud = true;
    else if (C == null || same(L, C)) useCloud = false;
    else if (prefer === 'cloud') useCloud = true;
    else if (prefer === 'local') useCloud = false;
    else useCloud = ct > lt;
    games[id] = useCloud ? C : L;
    times[id] = Math.max(useCloud ? ct : lt, 0);
    if (useCloud && !same(L, C)) fromCloud.push(id);
  }
  return { games, times, fromCloud };
}

let applying = false;
function applyLocal(profile, games, times, changedGames) {
  applying = true;
  try {
    if (!same(profile, Store.exportProgress())) Store.importProgress(profile);
    for (const id of changedGames) {
      if (games[id] == null) ls.del(GAME_PREFIX + id);
      else ls.set(GAME_PREFIX + id, JSON.stringify(games[id]));
    }
    meta.gameTimes = { ...times };
    writeMeta();
  } finally {
    applying = false;
  }
  // A game that is open right now reloads from the new save (arcade.js listens)
  if (changedGames.length) document.dispatchEvent(new CustomEvent('progress:replaced', { detail: { games: changedGames } }));
}

/* ---------------------------------------------------------------- syncing */
let pushTimer = 0, firstChange = 0, changes = 0, pushing = false;

function markDirty() {
  if (applying) return;
  changes++;
  if (!meta.dirty) { meta.dirty = true; writeMeta(); }
  if (state.user) schedulePush();
}

function schedulePush(delay = PUSH_DELAY) {
  clearTimeout(pushTimer);
  if (!firstChange) firstChange = Date.now();
  const wait = Math.max(0, Math.min(delay, PUSH_MAX_WAIT - (Date.now() - firstChange)));
  pushTimer = setTimeout(() => push(), wait);
}

async function push({ keepalive = false, attempt = 0 } = {}) {
  if (!state.user || state.conflicts) return;
  if (pushing) { schedulePush(1500); return; }
  pushing = true;
  clearTimeout(pushTimer);
  firstChange = 0;
  const seen = changes;
  set({ status: 'syncing' });
  try {
    const r = await api('PUT', '/save', { data: snapshot(), baseRev: meta.rev }, { keepalive });
    meta.rev = r.rev;
    meta.user = state.user.username;
    meta.syncedAt = Date.now();
    if (changes === seen) meta.dirty = false;
    writeMeta();
    set({ status: 'saved', lastSync: meta.syncedAt, error: '' });
  } catch (e) {
    if (e.status === 409 && attempt < 3) {
      // Another device saved first: merge its progress in (newest game saves win) and try again
      pushing = false;
      reconcile({ data: e.data.data, rev: e.data.rev }, 'newest');
      return push({ attempt: attempt + 1 });
    }
    if (e.status === 401) { lostSession(); return; }
    set({ status: 'error', error: e.message });
    schedulePush(30000); // keep trying in the background
  } finally {
    pushing = false;
  }
  if (meta.dirty && changes !== seen) schedulePush();
}

// Merge a cloud save into this device. Returns true if the merged result needs uploading.
function reconcile({ data, rev }, prefer) {
  const cloud = data || { profile: {}, games: {}, gameTimes: {} };
  const local = snapshot();
  const profile = mergeProfiles(local.profile, cloud.profile);
  const { games, times, fromCloud } = mergeGames(local, cloud, prefer);
  applyLocal(profile, games, times, fromCloud);
  meta.user = state.user.username;
  meta.rev = rev || 0;
  const needsUpload = !same(profile, mergeProfiles(cloud.profile, {})) || !same(games, cloud.games || {});
  meta.dirty = needsUpload;
  writeMeta();
  return needsUpload;
}

async function pull() {
  set({ status: 'syncing' });
  let r;
  try {
    r = await api('GET', '/save');
  } catch (e) {
    if (e.status === 401) { lostSession(); return; }
    set({ status: 'error', error: e.message });
    return;
  }
  const sameAccount = meta.user === state.user.username;
  if (sameAccount && r.rev === meta.rev) {
    if (meta.dirty) push(); else set({ status: 'saved', lastSync: meta.syncedAt });
    return;
  }
  if (!sameAccount) {
    // First time this account is used on this device: ask before replacing any game progress
    const local = localGames(), cloud = r.data?.games || {};
    const conflicts = Object.keys(local).filter((id) => cloud[id] != null && !same(local[id], cloud[id]));
    if (conflicts.length) { pendingCloud = r; set({ status: 'conflict', conflicts }); return; }
  }
  if (reconcile(r, 'newest')) push();
  else { meta.syncedAt = Date.now(); writeMeta(); set({ status: 'saved', lastSync: meta.syncedAt }); }
}
let pendingCloud = null;

function lostSession() {
  clearTimeout(pushTimer);
  set({ user: null, status: 'idle', conflicts: null, error: '' });
}

function clearLocalProgress() {
  applying = true;
  try {
    Store.importProgress({});
    for (const k of ls.keys()) if (k && k.startsWith(GAME_PREFIX)) ls.del(k);
  } finally { applying = false; }
  meta = { user: null, rev: 0, dirty: false, gameTimes: {}, syncedAt: 0 };
  writeMeta();
  document.dispatchEvent(new CustomEvent('progress:replaced', { detail: { games: ['*'] } }));
}

/* ---------------------------------------------------------------- public API */
export const Account = {
  get state() { return state; },
  on(fn) { listeners.add(fn); fn(state); return () => listeners.delete(fn); },

  async init() {
    Store.subscribe(() => markDirty());
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden' && state.user && meta.dirty) push({ keepalive: true });
    });
    try {
      const r = await api('GET', '/auth/me');
      set({ ready: true, available: true, user: r.user || null, features: r.features || state.features });
      if (r.user) await pull();
    } catch {
      set({ ready: true, available: false });
    }
    return state;
  },

  // Every game save goes through here (arcade.js) so merges know which copy is newest.
  noteGameSave(id) {
    if (applying) return;
    meta.gameTimes = { ...meta.gameTimes, [id]: Date.now() };
    writeMeta();
    markDirty();
  },

  async signUp({ username, password, displayName, email }) {
    const r = await api('POST', '/auth/register', { username, password, displayName, email });
    set({ user: r.user, error: '' });
    await pull();
    return r.user;
  },

  // Google sign-in (the ID token from Google's button). Signed in already: connects Google to this account.
  async signInWithGoogle(credential) {
    const wasSignedIn = !!state.user;
    const r = await api('POST', '/auth/google', { credential });
    set({ user: r.user, error: '' });
    if (!wasSignedIn) await pull();
    return r;
  },

  // Emails a reset link if the account has an email address (same answer either way)
  async forgotPassword(login) {
    await api('POST', '/auth/forgot', { login });
  },

  async resetPassword(token, password) {
    const r = await api('POST', '/auth/reset', { token, password });
    const switching = state.user && state.user.username !== r.user.username;
    if (switching) { clearTimeout(pushTimer); clearLocalProgress(); }
    set({ user: r.user, error: '' });
    await pull();
    return r.user;
  },

  // { email?, newPassword?, password (current) }
  async updateAccount(changes) {
    const r = await api('PATCH', '/account', changes);
    set({ user: r.user });
    return r.user;
  },

  async signIn({ username, password }) {
    const r = await api('POST', '/auth/login', { username, password });
    set({ user: r.user, error: '' });
    await pull();
    return r.user;
  },

  // Uploads anything unsaved, then signs out and clears this device back to a fresh guest profile.
  async signOut() {
    if (state.user && meta.dirty && !state.conflicts) { try { await push(); } catch { /* still sign out */ } }
    try { await api('POST', '/auth/logout', {}); } catch { /* session may already be gone */ }
    clearTimeout(pushTimer);
    set({ user: null, status: 'idle', conflicts: null, error: '' });
    clearLocalProgress();
  },

  async rename(displayName) {
    const r = await api('PATCH', '/account', { displayName });
    set({ user: r.user });
    return r.user;
  },

  async deleteAccount(password, confirm) {
    await api('POST', '/account/delete', { password, confirm });
    clearTimeout(pushTimer);
    set({ user: null, status: 'idle', conflicts: null, error: '' });
    clearLocalProgress();
  },

  // Answer to the "two saves found" question: 'cloud' or 'local'
  async resolveConflict(prefer) {
    const r = pendingCloud;
    pendingCloud = null;
    set({ conflicts: null });
    if (!r || !state.user) return;
    if (reconcile(r, prefer)) await push();
    else set({ status: 'saved', lastSync: Date.now() });
  },

  async syncNow() {
    if (!state.user) return;
    if (meta.dirty) await push(); else await pull();
  },
};
