// Account interface: HUD pilot chip, sign in / create account panel, cloud-save button in the game
// header, and the animated "Welcome back, <name>" greeting.
import { Account } from './account.js';
import { $, Modals, toast, escapeHTML } from './ui.js';
import { icon } from './icons.js';
import { ALL_GAMES } from './games/index.js';
import { audio } from './audio.js';

const TITLES = Object.fromEntries(ALL_GAMES.map((g) => [g.id, g.title]));
const USERNAME_RE = /^[A-Za-z0-9_.-]{3,20}$/;
let mode = 'signin';
let lastView = '';
let busy = false;

const nameOf = (u) => u.displayName || u.username;
function hue(s) { let h = 0; for (const c of s) h = (h * 31 + c.codePointAt(0)) % 360; return h; }
function avatar(u, cls = 'avatar') {
  const first = [...nameOf(u).trim()][0] || '?';
  return `<span class="${cls}" style="--h:${hue(u.username.toLowerCase())}" aria-hidden="true">${escapeHTML(first.toUpperCase())}</span>`;
}
function ago(ts) {
  if (!ts) return '';
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 20) return 'just now';
  if (s < 90) return 'a minute ago';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(ts).toLocaleDateString();
}
const insecure = () => location.protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);

/* ---------------------------------------------------------------- HUD + game header */
function renderChips(st) {
  const chip = $('#hud-account');
  if (chip) {
    chip.classList.toggle('hidden', !st.ready || !st.available);
    chip.classList.toggle('signed-in', !!st.user);
    chip.dataset.status = st.status;
    if (st.user) {
      chip.innerHTML = `${avatar(st.user)}<span class="acct-chip-name">${escapeHTML(nameOf(st.user))}</span><i class="acct-dot" aria-hidden="true"></i>`;
      chip.setAttribute('aria-label', `Pilot account: ${nameOf(st.user)}`);
    } else {
      chip.innerHTML = `${icon('user')}<span class="acct-chip-name">Sign in</span>`;
      chip.setAttribute('aria-label', 'Sign in or create an account');
    }
  }
  const cloud = $('#game-cloud');
  if (cloud) {
    cloud.classList.toggle('hidden', !st.ready || !st.available);
    let ic = 'cloudOff', label = 'Save', title = 'Sign in to save your progress to your account';
    if (st.user) {
      if (st.status === 'syncing') { ic = 'cloudUp'; label = 'Saving'; title = 'Saving to your account…'; }
      else if (st.status === 'error') { ic = 'cloudOff'; label = 'Retry'; title = `Not saved yet: ${st.error}`; }
      else if (st.status === 'conflict') { ic = 'cloudOff'; label = 'Choose'; title = 'Choose which save to keep'; }
      else { ic = 'cloudOk'; label = 'Saved'; title = `Progress saved to ${nameOf(st.user)}'s account`; }
    }
    cloud.dataset.status = st.user ? st.status : 'guest';
    cloud.innerHTML = `${icon(ic)}<span class="hidden sm:inline">${label}</span>`;
    cloud.title = title;
    cloud.setAttribute('aria-label', title);
  }
}

/* ---------------------------------------------------------------- panel */
function statusLine(st) {
  if (st.status === 'syncing') return `<span class="acct-status syncing">${icon('cloudUp')}Saving to your account…</span>`;
  if (st.status === 'error') return `<span class="acct-status error">${icon('alert')}Not saved yet: ${escapeHTML(st.error)} Retrying soon.</span>`;
  return `<span class="acct-status ok">${icon('cloudOk')}All progress saved${st.lastSync ? ` · ${ago(st.lastSync)}` : ''}</span>`;
}

function guestView() {
  const signup = mode === 'signup';
  return `
    <div class="seg acct-seg" role="tablist">
      <button type="button" role="tab" data-mode="signin" class="${signup ? '' : 'active'}" aria-selected="${!signup}">Sign in</button>
      <button type="button" role="tab" data-mode="signup" class="${signup ? 'active' : ''}" aria-selected="${signup}">Create account</button>
    </div>
    <p class="acct-lead">${signup ? 'Save your XP, high scores and game progress to an account, then pick up where you left off on any device.' : 'Welcome back, pilot. Sign in to load your saved progress.'}</p>
    <form class="acct-form" data-form="${signup ? 'signup' : 'signin'}" novalidate>
      ${signup ? `<label class="field"><span>Pilot name <small>shown in greetings</small></span><input name="displayName" maxlength="24" autocomplete="nickname" placeholder="Nova"></label>` : ''}
      <label class="field"><span>Username${signup ? ' <small>3–20 letters, numbers, . _ -</small>' : ''}</span>
        <input name="username" maxlength="20" autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false" required></label>
      <label class="field"><span>Password${signup ? ' <small>at least 8 characters</small>' : ''}</span>
        <span class="pw"><input name="password" type="password" maxlength="128" autocomplete="${signup ? 'new-password' : 'current-password'}" required>
        <button type="button" class="pw-toggle" aria-label="Show password" aria-pressed="false">${icon('eye')}</button></span></label>
      <p class="acct-error" role="alert" hidden></p>
      <button class="btn-neon w-full" type="submit">${signup ? 'Create account' : 'Sign in'}</button>
    </form>
    ${insecure() ? `<p class="acct-warn">${icon('lock')}<span>This site isn't on HTTPS yet, so passwords could be seen on shared Wi-Fi. Use a password you don't use anywhere else.</span></p>` : ''}`;
}

function userView(st) {
  const u = st.user;
  const since = u.createdAt ? new Date(u.createdAt).toLocaleDateString(undefined, { month: 'short', year: 'numeric' }) : '';
  return `
    <div class="acct-hero">
      ${avatar(u, 'avatar avatar-lg')}
      <div class="min-w-0">
        <p class="acct-hello">Welcome back,</p>
        <p class="acct-name">${escapeHTML(nameOf(u))}</p>
        <p class="acct-sub">@${escapeHTML(u.username)}${since ? ` · pilot since ${escapeHTML(since)}` : ''}</p>
      </div>
    </div>
    <div class="acct-status-row" data-status>${statusLine(st)}</div>
    <div class="acct-actions">
      <button type="button" class="btn-ghost" data-act="sync">${icon('sync')}Sync now</button>
      <button type="button" class="btn-ghost" data-act="signout">${icon('logout')}Sign out</button>
    </div>
    <form class="acct-form" data-form="rename" novalidate>
      <label class="field"><span>Pilot name</span>
        <span class="field-row"><input name="displayName" maxlength="24" value="${escapeHTML(nameOf(u))}" autocomplete="nickname"><button class="btn-mini" type="submit">Save</button></span></label>
      <p class="acct-error" role="alert" hidden></p>
    </form>
    <p class="acct-note">Signing out removes your progress from this device. It stays saved in your account.</p>
    <details class="acct-danger">
      <summary>Delete account</summary>
      <form class="acct-form" data-form="delete" novalidate>
        <p class="acct-note">This permanently deletes your account and its saved progress.</p>
        <label class="field"><span>Password</span><input name="password" type="password" maxlength="128" autocomplete="current-password"></label>
        <p class="acct-error" role="alert" hidden></p>
        <button class="btn-ghost acct-delete" type="submit">Delete my account</button>
      </form>
    </details>`;
}

function conflictView(st) {
  const names = st.conflicts.map((id) => escapeHTML(TITLES[id] || id)).join(', ');
  return `
    <div class="acct-conflict">
      <span class="acct-conflict-icon">${icon('cloud')}</span>
      <h3>Two saves found</h3>
      <p>This device and your account both have progress in <b>${names}</b>. Which do you want to keep? Your XP and best scores are combined either way.</p>
      <button type="button" class="btn-neon w-full" data-act="keep-cloud">Keep my account's progress</button>
      <button type="button" class="btn-ghost w-full" data-act="keep-local">Keep this device's progress</button>
    </div>`;
}

function renderPanel(st, force = false) {
  const body = $('#account-body');
  if (!body) return;
  const view = !st.available ? 'off' : st.conflicts ? `c:${st.conflicts.join()}` : st.user ? `u:${st.user.username}:${st.user.displayName}` : `g:${mode}`;
  $('#account-title').textContent = st.user ? 'Your pilot account' : 'Save your progress';
  if (view === lastView && !force) {
    const line = body.querySelector('[data-status]');
    if (line) line.innerHTML = statusLine(st);
    return;
  }
  lastView = view;
  if (!st.available) {
    body.innerHTML = `<div class="acct-conflict"><span class="acct-conflict-icon">${icon('cloudOff')}</span><h3>Accounts are offline</h3><p>Sign-in isn't available right now. Your progress keeps saving on this device.</p></div>`;
    return;
  }
  body.innerHTML = st.conflicts ? conflictView(st) : st.user ? userView(st) : guestView();
}

function showError(form, err) {
  const el = form.querySelector('.acct-error');
  el.textContent = err.message || String(err);
  el.hidden = false;
  const field = err.data?.field && form.querySelector(`[name="${err.data.field}"]`);
  (field || form.querySelector('input'))?.focus();
}

async function withBusy(form, label, fn) {
  if (busy) return;
  busy = true;
  const btn = form.querySelector('[type="submit"]');
  const before = btn.innerHTML;
  btn.disabled = true;
  btn.textContent = label;
  form.querySelector('.acct-error').hidden = true;
  try { await fn(); } catch (e) { showError(form, e); } finally {
    busy = false;
    if (btn.isConnected) { btn.disabled = false; btn.innerHTML = before; }
  }
}

function onSubmit(e) {
  const form = e.target.closest('form[data-form]');
  if (!form) return;
  e.preventDefault();
  const v = Object.fromEntries(new FormData(form));
  const kind = form.dataset.form;
  if (kind === 'signin' || kind === 'signup') {
    const username = (v.username || '').trim();
    if (kind === 'signup' && !USERNAME_RE.test(username)) return showError(form, { message: 'Usernames are 3 to 20 letters, numbers, dots, dashes or underscores.', data: { field: 'username' } });
    if (!username || !v.password) return showError(form, { message: 'Enter your username and password.', data: { field: username ? 'password' : 'username' } });
    if (kind === 'signup' && v.password.length < 8) return showError(form, { message: 'Passwords need at least 8 characters.', data: { field: 'password' } });
    withBusy(form, kind === 'signup' ? 'Creating account…' : 'Signing in…', async () => {
      const user = kind === 'signup'
        ? await Account.signUp({ username, password: v.password, displayName: (v.displayName || '').trim() || username })
        : await Account.signIn({ username, password: v.password });
      audio.chime();
      if (!Account.state.conflicts) Modals.close('modal-account');
      showGreeting(kind === 'signup' ? 'new' : 'back', user);
    });
  } else if (kind === 'rename') {
    withBusy(form, 'Saving…', async () => {
      await Account.rename((v.displayName || '').trim());
      toast('Pilot name updated', { type: 'success' });
    });
  } else if (kind === 'delete') {
    withBusy(form, 'Deleting…', async () => {
      await Account.deleteAccount(v.password || '');
      Modals.close('modal-account');
      toast('Your account was deleted', { icon: 'trash' });
    });
  }
}

async function onClick(e) {
  const modeBtn = e.target.closest('[data-mode]');
  if (modeBtn) { mode = modeBtn.dataset.mode; renderPanel(Account.state, true); $('#account-body input')?.focus(); return; }
  const pw = e.target.closest('.pw-toggle');
  if (pw) {
    const input = pw.parentElement.querySelector('input');
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    pw.setAttribute('aria-pressed', String(show));
    pw.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
    return;
  }
  const act = e.target.closest('[data-act]')?.dataset.act;
  if (!act) return;
  if (act === 'sync') Account.syncNow();
  if (act === 'signout') {
    await Account.signOut();
    toast('Signed out. Your progress is safe in your account.', { icon: 'logout' });
    renderPanel(Account.state, true);
  }
  if (act === 'keep-cloud' || act === 'keep-local') {
    await Account.resolveConflict(act === 'keep-cloud' ? 'cloud' : 'local');
    Modals.close('modal-account');
    toast(act === 'keep-cloud' ? 'Loaded the progress saved in your account' : "Kept this device's progress", { type: 'success' });
  }
}

export function openAccount(startMode) {
  if (startMode) mode = startMode;
  renderPanel(Account.state, true);
  Modals.open('modal-account');
  if (!Account.state.user) setTimeout(() => $('#account-body input')?.focus({ preventScroll: true }), 80);
}

/* ---------------------------------------------------------------- greeting */
let greetTimer = 0;
export function showGreeting(kind, user = Account.state.user) {
  const el = $('#greeting');
  if (!el) return;
  const guest = kind === 'guest' || !user;
  const script = guest ? 'Welcome,' : kind === 'new' ? 'Welcome aboard,' : 'Welcome back,';
  const name = guest ? 'pilot' : nameOf(user);
  el.innerHTML = `
    <div class="greet-card">
      ${guest ? `<span class="avatar greet-orb" aria-hidden="true">${icon('rocket')}</span>` : avatar(user, 'avatar greet-orb')}
      <span class="greet-text">
        <span class="greet-script">${script}</span>
        <span class="greet-name">${escapeHTML(name)}</span>
        ${guest ? '<span class="greet-sub">Sign in to save your progress on any device</span>' : ''}
      </span>
      ${guest ? '<button type="button" class="btn-mini greet-btn" data-greet-signin>Sign in</button>' : ''}
      <i class="greet-shine" aria-hidden="true"></i>
    </div>`;
  el.hidden = false;
  el.classList.remove('leaving', 'show');
  void el.offsetWidth;
  el.classList.add('show');
  clearTimeout(greetTimer);
  greetTimer = setTimeout(hideGreeting, guest ? 6500 : 5200);
}
function hideGreeting() {
  const el = $('#greeting');
  if (!el || el.hidden) return;
  el.classList.add('leaving');
  setTimeout(() => { if (el.classList.contains('leaving')) { el.hidden = true; el.classList.remove('show', 'leaving'); } }, 600);
}

/* ---------------------------------------------------------------- setup */
export function initAccountUI() {
  const chip = document.createElement('button');
  chip.type = 'button';
  chip.id = 'hud-account';
  chip.className = 'glass hud-chip account-chip hidden';
  $('#sound-toggle').before(chip);
  chip.addEventListener('click', () => openAccount());
  $('#game-cloud')?.addEventListener('click', () => {
    if (Account.state.user && Account.state.status === 'error') Account.syncNow();
    openAccount();
  });
  const body = $('#account-body');
  body.addEventListener('submit', onSubmit);
  body.addEventListener('click', onClick);
  $('#greeting').addEventListener('click', (e) => {
    if (e.target.closest('[data-greet-signin]')) { hideGreeting(); openAccount('signup'); return; }
    hideGreeting();
  });
  Account.on((st) => {
    renderChips(st);
    if (Modals.isOpen('modal-account')) renderPanel(st);
    if (st.conflicts && !Modals.isOpen('modal-account')) openAccount();
  });
  setInterval(() => { if (Modals.isOpen('modal-account')) renderPanel(Account.state); }, 15000);
  const ready = Account.init();
  // Greet the player once the opening sequence has lifted
  const afterIntro = new Promise((r) => {
    if (!document.getElementById('intro')) r();
    else document.addEventListener('intro:reveal', () => r(), { once: true });
  });
  Promise.all([ready, afterIntro]).then(([st]) => {
    if (!st.available) return;
    setTimeout(() => showGreeting(st.user ? 'back' : 'guest', st.user), 900);
  });
}
