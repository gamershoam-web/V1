// Account interface: HUD pilot chip, sign in / create account panel, cloud-save button in the game
// header, and the animated "Welcome back, <name>" greeting.
import { Account } from './account.js';
import { $, Modals, toast, escapeHTML } from './ui.js';
import { icon } from './icons.js';
import { ALL_GAMES } from './games/index.js';
import { audio } from './audio.js';

const TITLES = Object.fromEntries(ALL_GAMES.map((g) => [g.id, g.title]));
const USERNAME_RE = /^[A-Za-z0-9_.-]{3,20}$/;
let mode = 'signin';      // signin | signup | forgot | reset
let lastView = '';
let busy = false;
let resetToken = null;    // from a password reset link (#reset=...), kept in memory only

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

const GOOGLE_G = '<svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>';

// Google's own button is drawn into [data-google] once their script has loaded
function googleSlot(text) {
  if (!Account.state.features?.google) return '';
  return `<div class="acct-google" data-google="${text}"><span class="acct-google-wait">${GOOGLE_G}Loading Google…</span></div>
    <p class="acct-error" data-google-error role="alert" hidden></p>`;
}

function forgotView() {
  const on = Account.state.features?.emailReset;
  return `
    <h3 class="acct-h">${icon('key')}Reset your password</h3>
    ${on ? `<p class="acct-lead">Enter your username or email. If the account has an email address, we'll send it a link to choose a new password.</p>
    <form class="acct-form" data-form="forgot" novalidate>
      <label class="field"><span>Username or email</span>
        <input name="login" maxlength="254" autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false" required></label>
      <p class="acct-error" role="alert" hidden></p>
      <button class="btn-neon w-full" type="submit">Send reset link</button>
    </form>` : `<p class="acct-lead">Password reset by email isn't switched on yet.${Account.state.features?.google ? ' If your account uses Google, sign in with the button below.' : ''}</p>`}
    ${on ? '' : googleSlot('signin_with')}
    <button type="button" class="acct-link" data-mode="signin">Back to sign in</button>`;
}

function resetView() {
  return `
    <h3 class="acct-h">${icon('key')}Choose a new password</h3>
    <p class="acct-lead">This signs you in and signs your account out on every other device.</p>
    <form class="acct-form" data-form="reset" novalidate>
      <label class="field"><span>New password <small>at least 8 characters</small></span>
        <span class="pw"><input name="password" type="password" maxlength="128" autocomplete="new-password" required>
        <button type="button" class="pw-toggle" aria-label="Show password" aria-pressed="false">${icon('eye')}</button></span></label>
      <label class="field"><span>Type it again</span><input name="password2" type="password" maxlength="128" autocomplete="new-password" required></label>
      <p class="acct-error" role="alert" hidden></p>
      <button class="btn-neon w-full" type="submit">Save new password</button>
    </form>
    <button type="button" class="acct-link" data-mode="forgot">Link expired? Send a new one</button>`;
}

function guestView() {
  if (mode === 'forgot') return forgotView();
  if (mode === 'reset') return resetView();
  const signup = mode === 'signup';
  const google = Account.state.features?.google;
  return `
    <div class="seg acct-seg" role="tablist">
      <button type="button" role="tab" data-mode="signin" class="${signup ? '' : 'active'}" aria-selected="${!signup}">Sign in</button>
      <button type="button" role="tab" data-mode="signup" class="${signup ? 'active' : ''}" aria-selected="${signup}">Create account</button>
    </div>
    <p class="acct-lead">${signup ? 'Save your XP, high scores and game progress to an account, then pick up where you left off on any device.' : 'Welcome back, pilot. Sign in to load your saved progress.'}</p>
    ${google ? `${googleSlot(signup ? 'signup_with' : 'signin_with')}<div class="acct-or"><span>or ${signup ? 'make a username' : 'use your username'}</span></div>` : ''}
    <form class="acct-form" data-form="${signup ? 'signup' : 'signin'}" novalidate>
      ${signup ? `<label class="field"><span>Pilot name <small>shown in greetings</small></span><input name="displayName" maxlength="24" autocomplete="nickname" placeholder="Nova"></label>` : ''}
      <label class="field"><span>${signup ? 'Username <small>3–20 letters, numbers, . _ -</small>' : 'Username or email'}</span>
        <input name="username" maxlength="${signup ? 20 : 254}" autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false" required></label>
      <label class="field"><span>Password${signup ? ' <small>at least 8 characters</small>' : ''}</span>
        <span class="pw"><input name="password" type="password" maxlength="128" autocomplete="${signup ? 'new-password' : 'current-password'}" required>
        <button type="button" class="pw-toggle" aria-label="Show password" aria-pressed="false">${icon('eye')}</button></span></label>
      ${signup ? `<label class="field"><span>Email <small>optional, lets you reset a forgotten password</small></span>
        <input name="email" type="email" maxlength="254" autocomplete="email" autocapitalize="none" spellcheck="false" placeholder="you@example.com"></label>` : ''}
      <p class="acct-error" role="alert" hidden></p>
      <button class="btn-neon w-full" type="submit">${signup ? 'Create account' : 'Sign in'}</button>
    </form>
    ${signup ? '' : '<button type="button" class="acct-link" data-mode="forgot">Forgot your password?</button>'}
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
    <div class="acct-methods">
      <p class="acct-methods-title">Sign-in and recovery</p>
      <div class="acct-method">${icon('mail')}<span>${u.email ? `${escapeHTML(u.email)}${u.emailVerified ? ' <em class="ok">confirmed</em>' : ''}` : '<em class="warn">No email: add one so you can reset your password</em>'}</span></div>
      <div class="acct-method"><span class="g-mini">${GOOGLE_G}</span><span>${u.google ? 'Google connected' : 'Google not connected'}</span></div>
      ${!u.google && Account.state.features?.google ? googleSlot('continue_with') : ''}
      <details class="acct-more">
        <summary>${u.email ? 'Change email' : 'Add an email'}</summary>
        <form class="acct-form" data-form="email" novalidate>
          <label class="field"><span>Email</span><input name="email" type="email" maxlength="254" autocomplete="email" autocapitalize="none" spellcheck="false" value="${escapeHTML(u.email || '')}" placeholder="you@example.com"></label>
          ${u.hasPassword ? '<label class="field"><span>Current password</span><input name="password" type="password" maxlength="128" autocomplete="current-password"></label>' : ''}
          <p class="acct-error" role="alert" hidden></p>
          <button class="btn-mini" type="submit">Save email</button>
        </form>
      </details>
      <details class="acct-more">
        <summary>${u.hasPassword ? 'Change password' : 'Set a password'}</summary>
        <form class="acct-form" data-form="password" novalidate>
          ${u.hasPassword ? '<label class="field"><span>Current password</span><input name="password" type="password" maxlength="128" autocomplete="current-password"></label>' : '<p class="acct-note">Add a password to also sign in with your username.</p>'}
          <label class="field"><span>New password <small>at least 8 characters</small></span><input name="newPassword" type="password" maxlength="128" autocomplete="new-password"></label>
          <p class="acct-error" role="alert" hidden></p>
          <button class="btn-mini" type="submit">Save password</button>
        </form>
      </details>
    </div>
    <p class="acct-note">Signing out removes your progress from this device. It stays saved in your account.</p>
    <details class="acct-danger">
      <summary>Delete account</summary>
      <form class="acct-form" data-form="delete" novalidate>
        <p class="acct-note">This permanently deletes your account and its saved progress.</p>
        ${u.hasPassword ? '<label class="field"><span>Password</span><input name="password" type="password" maxlength="128" autocomplete="current-password"></label>'
          : `<label class="field"><span>Type your username (${escapeHTML(u.username)}) to confirm</span><input name="confirm" maxlength="20" autocomplete="off" autocapitalize="none" spellcheck="false"></label>`}
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
  const u = st.user;
  const view = !st.available ? 'off' : st.conflicts ? `c:${st.conflicts.join()}`
    : u ? `u:${u.username}:${u.displayName}:${u.email}:${u.emailVerified}:${u.google}:${u.hasPassword}:${!!st.features?.google}` : `g:${mode}:${!!st.features?.google}:${!!st.features?.emailReset}`;
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
  mountGoogle(body);
}

/* ---------------------------------------------------------------- Google */
let gisPromise = null;
let gisReadyFor = '';
function loadGoogle() {
  gisPromise ||= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = () => (window.google?.accounts?.id ? resolve(window.google.accounts.id) : reject(new Error('Google sign-in did not load')));
    s.onerror = () => { gisPromise = null; reject(new Error("Couldn't load Google sign-in. Check your connection or ad blocker.")); };
    document.head.appendChild(s);
  });
  return gisPromise;
}

async function mountGoogle(root) {
  const slots = [...root.querySelectorAll('[data-google]')];
  const clientId = Account.state.features?.google;
  if (!slots.length || !clientId) return;
  let gis;
  try { gis = await loadGoogle(); } catch (e) {
    slots.forEach((el) => { el.innerHTML = `<span class="acct-google-wait">${GOOGLE_G}${escapeHTML(e.message)}</span>`; });
    return;
  }
  if (gisReadyFor !== clientId) {
    gis.initialize({ client_id: clientId, callback: onGoogleCredential, ux_mode: 'popup', auto_select: false, cancel_on_tap_outside: true, use_fedcm_for_button: true });
    gisReadyFor = clientId;
  }
  for (const el of slots) {
    if (!el.isConnected) continue;
    el.innerHTML = '';
    const width = Math.round(Math.max(220, Math.min(400, el.clientWidth || 320)));
    gis.renderButton(el, { type: 'standard', theme: 'filled_black', size: 'large', shape: 'pill', text: el.dataset.google, logo_alignment: 'center', width });
  }
}

async function onGoogleCredential(resp) {
  const errEl = $('#account-body [data-google-error]');
  if (errEl) errEl.hidden = true;
  try {
    const r = await Account.signInWithGoogle(resp.credential);
    audio.chime();
    if (r.linked) { toast('Google connected. You can now sign in with it.', { type: 'success' }); renderPanel(Account.state, true); return; }
    mode = 'signin';
    if (!Account.state.conflicts) Modals.close('modal-account');
    showGreeting(r.created ? 'new' : 'back', r.user);
  } catch (e) {
    if (errEl) { errEl.textContent = e.message; errEl.hidden = false; } else toast(e.message, { type: 'error' });
  }
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
    const email = (v.email || '').trim();
    if (kind === 'signup' && email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return showError(form, { message: "That email address doesn't look right.", data: { field: 'email' } });
    if (kind === 'signup' && !USERNAME_RE.test(username)) return showError(form, { message: 'Usernames are 3 to 20 letters, numbers, dots, dashes or underscores.', data: { field: 'username' } });
    if (!username || !v.password) return showError(form, { message: kind === 'signup' ? 'Enter a username and password.' : 'Enter your username (or email) and password.', data: { field: username ? 'password' : 'username' } });
    if (kind === 'signup' && v.password.length < 8) return showError(form, { message: 'Passwords need at least 8 characters.', data: { field: 'password' } });
    withBusy(form, kind === 'signup' ? 'Creating account…' : 'Signing in…', async () => {
      const user = kind === 'signup'
        ? await Account.signUp({ username, password: v.password, displayName: (v.displayName || '').trim() || username, email })
        : await Account.signIn({ username, password: v.password });
      audio.chime();
      if (!Account.state.conflicts) Modals.close('modal-account');
      showGreeting(kind === 'signup' ? 'new' : 'back', user);
    });
  } else if (kind === 'forgot') {
    const login = (v.login || '').trim();
    if (!login) return showError(form, { message: 'Enter your username or email.', data: { field: 'login' } });
    withBusy(form, 'Sending…', async () => {
      await Account.forgotPassword(login);
      form.outerHTML = `<div class="acct-sent">${icon('mail')}<p><b>Check your email.</b> If <b>${escapeHTML(login)}</b> has an email address on its account, a link to choose a new password is on its way. It works for 30 minutes. Look in spam too.</p></div>`;
    });
  } else if (kind === 'reset') {
    if ((v.password || '').length < 8) return showError(form, { message: 'Passwords need at least 8 characters.', data: { field: 'password' } });
    if (v.password !== v.password2) return showError(form, { message: "The two passwords don't match.", data: { field: 'password2' } });
    withBusy(form, 'Saving…', async () => {
      const user = await Account.resetPassword(resetToken, v.password);
      resetToken = null;
      mode = 'signin';
      audio.chime();
      if (!Account.state.conflicts) Modals.close('modal-account');
      toast('Password changed. You are signed in.', { type: 'success' });
      showGreeting('back', user);
    });
  } else if (kind === 'email') {
    withBusy(form, 'Saving…', async () => {
      const u = await Account.updateAccount({ email: (v.email || '').trim(), password: v.password || '' });
      toast(u.email ? `Email saved: ${u.email}` : 'Email removed', { type: 'success' });
    });
  } else if (kind === 'password') {
    if ((v.newPassword || '').length < 8) return showError(form, { message: 'Passwords need at least 8 characters.', data: { field: 'newPassword' } });
    withBusy(form, 'Saving…', async () => {
      await Account.updateAccount({ newPassword: v.newPassword, password: v.password || '' });
      toast('Password saved. Other devices were signed out.', { type: 'success' });
      renderPanel(Account.state, true);
    });
  } else if (kind === 'rename') {
    withBusy(form, 'Saving…', async () => {
      await Account.rename((v.displayName || '').trim());
      toast('Pilot name updated', { type: 'success' });
    });
  } else if (kind === 'delete') {
    withBusy(form, 'Deleting…', async () => {
      await Account.deleteAccount(v.password || '', (v.confirm || '').trim());
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
  else if (mode === 'reset' && !resetToken) mode = 'signin';
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
  // Password reset link: https://site/#reset=TOKEN (the token is taken out of the address bar right away)
  const m = location.hash.match(/^#reset=([A-Za-z0-9_-]{20,200})$/);
  if (m) {
    resetToken = m[1];
    mode = 'reset';
    history.replaceState(null, '', location.pathname + location.search);
  }
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
    if (resetToken) { setTimeout(() => openAccount('reset'), 400); return; }
    setTimeout(() => showGreeting(st.user ? 'back' : 'guest', st.user), 900);
  });
}
