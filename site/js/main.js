// Orbit Network Hub — app bootstrap: 3D scene, HUD, sector navigation, portal and arcade.
import { CONFIG } from './config.js';
import { Store } from './storage.js';
import { audio } from './audio.js';
import { $, $$, Modals, toast, initTabs, fmt, escapeHTML } from './ui.js';
import { MinecraftPortal } from './minecraft.js';
import { Arcade, stillIcon } from './arcade.js';
import { ALL_GAMES } from './games/index.js';
import { gameIcon, icon } from './icons.js';
import { runIntro } from './intro.js';
import { Motion } from './motion.js';
import { wordmarkSVG, playWordmark } from './wordmark.js';

const SECTORS = {
  hub: { label: 'Deep Space' },
  station: { label: 'Command Deck', modal: 'modal-deck' },
  minecraft: { label: 'Minecraft · Orbitnetwork.net', modal: 'modal-minecraft' },
  arcade: { label: 'Arcade Sector', modal: 'modal-arcade' },
  comms: { label: 'Comms Relay', modal: 'modal-comms' },
};

let scene = null;
let introRunning = true;

// Screen space covered by HUD panels, so the 3D system can be centred in the open area.
function viewInsets() {
  const dock = $('#dock').getBoundingClientRect();
  const bottom = Math.max(0, window.innerHeight - dock.top);
  const mobile = window.innerWidth < 640;
  const top = mobile ? $('#hero-card').getBoundingClientRect().bottom : $('.hud-top').getBoundingClientRect().bottom;
  return { top: Math.max(0, top), bottom };
}
let sectorTimer = 0;
const portal = new MinecraftPortal();

/* ---------- 3D scene (optional: the UI still works without WebGL) ---------- */
async function initScene() {
  try {
    const probe = document.createElement('canvas');
    if (!(probe.getContext('webgl2') || probe.getContext('webgl'))) throw new Error('WebGL unavailable');
    const { SpaceScene } = await import('./scene.js');
    scene = new SpaceScene($('#space'), {
      labelsEl: $('#labels'),
      onSelect: (id) => goSector(id),
      onHover: () => audio.hover(),
      viewInsets,
      intro: introRunning,
      calm: Motion.calm,
    });
    // Keep the 3D system centred in the free space as the server card changes size.
    new ResizeObserver(() => scene.resize()).observe($('#hero-card'));
    document.body.classList.add('scene-ready');
  } catch (err) {
    console.warn('3D scene disabled:', err);
    document.body.classList.add('no-webgl');
  }
}

/* ---------- navigation ---------- */
function setSector(id) {
  $('#sector-name').textContent = SECTORS[id]?.label || '';
  $$('[data-sector]').forEach((b) => b.classList.toggle('active', b.dataset.sector === id));
  placeDockIndicator(true);
}

// Glowing pill that slides behind the active dock button.
function placeDockIndicator(animate) {
  const dock = $('#dock');
  let ind = dock.querySelector('.dock-indicator');
  if (!ind) {
    ind = document.createElement('span');
    ind.className = 'dock-indicator';
    ind.setAttribute('aria-hidden', 'true');
    dock.prepend(ind);
    animate = false;
  }
  const b = dock.querySelector('.dock-btn.active');
  if (!b) { ind.style.opacity = '0'; return; }
  ind.classList.toggle('no-anim', !animate);
  ind.style.opacity = '1';
  ind.style.width = `${b.offsetWidth}px`;
  ind.style.transform = `translateX(${b.offsetLeft}px)`;
  ind.classList.toggle('mc', b.classList.contains('dock-mc'));
}

function goSector(id) {
  clearTimeout(sectorTimer);
  if (arcade.isPlaying) arcade.close();
  Modals.closeAll({ silent: true });
  setSector(id);
  if (id === 'hub') { scene?.flyHome(); return; }
  audio.whoosh();
  scene?.flyTo(id);
  if (Store.markVisited(id)) {
    Store.addXP(15);
    setTimeout(() => toast(`New sector discovered: ${SECTORS[id].label} (+15 XP)`, { icon: 'satellite' }), 900);
  }
  if (id === 'station') renderDeck();
  sectorTimer = setTimeout(() => Modals.open(SECTORS[id].modal), scene ? 750 : 0);
}

Modals.onEmpty = () => {
  if (arcade?.isPlaying) return;
  setSector('hub');
  scene?.flyHome();
};

/* ---------- HUD ---------- */
const compactFmt = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });
const compact = (n) => (n < 10000 ? fmt(n) : compactFmt.format(n));

let lastLevel = Store.levelInfo().level;
function renderHUD() {
  const info = Store.levelInfo();
  if (info.level > lastLevel) {
    const chip = $('#hud-xpbar').closest('.hud-chip');
    chip.classList.remove('levelup'); void chip.offsetWidth; chip.classList.add('levelup');
  }
  lastLevel = info.level;
  $('#hud-level').textContent = info.level;
  $('#hud-rank').textContent = info.rank;
  $('#hud-xp').textContent = `${fmt(info.xp - info.floor)} / ${fmt(info.next - info.floor)} XP`;
  $('#hud-xpbar').style.width = `${Math.round(info.progress * 100)}%`;
  $('#hud-highscore').textContent = compact(Store.totalBest());
  if (Modals.isOpen('modal-deck')) renderDeck();
}

function renderSound() {
  const muted = audio.muted;
  const btn = $('#sound-toggle');
  btn.setAttribute('aria-pressed', String(!muted));
  btn.setAttribute('aria-label', muted ? 'Turn sound on' : 'Turn sound off');
  btn.querySelector('[data-on]').classList.toggle('hidden', muted);
  btn.querySelector('[data-off]').classList.toggle('hidden', !muted);
}

function renderDeck() {
  const info = Store.levelInfo();
  $('#deck-level').textContent = info.level;
  $('#deck-rank').textContent = info.rank;
  $('#deck-xp').textContent = fmt(info.xp);
  $('#deck-xpbar').style.width = `${Math.round(info.progress * 100)}%`;
  $('#deck-next').textContent = `${fmt(info.next - info.xp)} XP to level ${info.level + 1}`;
  $('#deck-total').textContent = fmt(Store.totalBest());
  $('#deck-scores').innerHTML = ALL_GAMES.map((g) => `
    <li class="flex items-center gap-3 py-2.5 border-b border-white/5 last:border-0">
      <span class="deck-icon" style="--card-accent:${g.color}" aria-hidden="true">${gameIcon(g.id)}</span>
      <span class="flex-1 min-w-0 text-sm leading-tight">${escapeHTML(g.title)}</span>
      <b class="font-display text-neon-cyan text-sm">${fmt(Store.getBest(g.id))}</b>
      <button type="button" class="btn-mini" data-play="${g.id}">Play</button>
    </li>`).join('');
  $$('#deck-scores .deck-icon').forEach((el, i) => stillIcon(el, ALL_GAMES[i].id, 80));
  $$('#deck-scores [data-play]').forEach((b) => b.addEventListener('click', () => {
    Modals.closeAll({ silent: true });
    openArcadeGame(b.dataset.play);
  }));
}

function openArcadeGame(id) {
  setSector('arcade');
  scene?.flyTo('arcade');
  arcade.launch(id);
}

/* ---------- arcade ---------- */
const arcade = new Arcade({
  onGameOpen: () => { scene?.setPaused(true); document.body.classList.add('game-active'); },
  onGameClose: () => { scene?.setPaused(false); document.body.classList.remove('game-active'); },
  onBackToSpace: () => { Modals.closeAll({ silent: true }); setSector('hub'); scene?.flyHome(); },
});
// Phones: the arcade panel covers most of the hub, so pause it and give the GPU to the 3D card art.
const coarsePointer = window.matchMedia('(pointer: coarse)').matches;
document.addEventListener('modal:change', (e) => {
  if (coarsePointer && e.detail.id === 'modal-arcade' && !arcade.isPlaying) scene?.setPaused(e.detail.open);
});

/* ---------- wiring ---------- */
function bindUI() {
  // Hydrate declarative icons: <span data-icon="name"></span>
  $$('[data-icon]').forEach((el) => { el.innerHTML = icon(el.dataset.icon); });
  $$('[data-sector]').forEach((b) => b.addEventListener('click', () => goSector(b.dataset.sector)));
  $$('[data-open-modal]').forEach((b) => b.addEventListener('click', () => goSector(b.dataset.openModal)));
  $$('.modal [data-close]').forEach((b) => b.addEventListener('click', () => Modals.close(b.closest('.modal').id)));

  $('#sound-toggle').addEventListener('click', () => {
    audio.setMuted(!audio.muted);
    renderSound();
    if (!audio.muted) audio.chime();
  });
  $('#hud-scores').addEventListener('click', () => goSector('station'));

  $('#deck-reset').addEventListener('click', () => {
    if (confirm('Reset your XP and all high scores? This cannot be undone.')) {
      Store.reset();
      toast('Progress reset', { icon: 'reset' });
    }
  });

  $$('[data-discord]').forEach((a) => {
    if (CONFIG.discordUrl) {
      a.href = CONFIG.discordUrl;
    } else {
      a.addEventListener('click', (e) => { e.preventDefault(); toast('Discord invite coming soon — check back later!', { icon: 'chat' }); });
    }
  });

  // UI click sounds for HUD/panel buttons (games handle their own audio).
  document.addEventListener('click', (e) => {
    const b = e.target.closest('button, a.btn-neon, a.btn-ghost');
    if (b && !b.closest('#game-stage')) audio.click();
  });
  $$('.dock-btn').forEach((b) => b.addEventListener('pointerenter', () => audio.hover()));

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const top = Modals.top();
    if (!top) return;
    if (top === 'modal-game') { if (!arcade.handleEscape()) arcade.backToArcade(); }
    else Modals.close(top);
  });

  // Hide the navigation hint after the first interaction.
  const hint = $('#nav-hint');
  const hideHint = () => { hint.classList.add('opacity-0'); window.removeEventListener('pointerdown', hideHint); };
  window.addEventListener('pointerdown', hideHint);
  setTimeout(hideHint, 9000);

  $$('[data-year]').forEach((el) => { el.textContent = new Date().getFullYear(); });
}

/* ---------- animation setting ---------- */
function renderMotion() {
  const setting = Motion.setting;
  $$('[data-motion]').forEach((b) => {
    const on = b.dataset.motion === setting;
    b.classList.toggle('active', on);
    b.setAttribute('aria-checked', String(on));
  });
  const note = $('#motion-note');
  if (note) {
    note.textContent = setting === 'auto'
      ? `Auto follows your device: currently ${Motion.mode === 'calm' ? 'Calm, because your device asks for reduced motion' : 'Full'}.`
      : setting === 'full' ? 'Full: every effect, including the hyperspace jump and camera sweeps.' : 'Calm: animated, but big motion effects become gentle fades.';
  }
}

function bindMotion() {
  $$('[data-motion]').forEach((b) => b.addEventListener('click', () => {
    Motion.set(b.dataset.motion);
    toast(Motion.mode === 'calm' ? 'Calm animations on' : 'Full animations on', { icon: 'sparkle' });
  }));
  Motion.onChange(() => { scene?.setCalm(Motion.calm); renderMotion(); });
  Motion.apply();
  renderMotion();
}

/* ---------- diagnostics: open the site with ?diag ---------- */
function showDiagnostics() {
  if (!new URLSearchParams(location.search).has('diag')) return;
  window.orbitHub = { get scene() { return scene; }, arcade };
  const yes = (v) => (v ? '<span class="ok">yes</span>' : '<span class="bad">no</span>');
  const render = () => {
    const box = $('#diag') || document.body.appendChild(Object.assign(document.createElement('div'), { id: 'diag', className: 'diag' }));
    const webgl = document.body.classList.contains('scene-ready') ? '<span class="ok">running</span>' : document.body.classList.contains('no-webgl') ? '<span class="bad">unavailable</span>' : 'starting…';
    box.innerHTML = `
      <div><b>Orbit Network Hub</b> build ${escapeHTML(CONFIG.version)}</div>
      <div>Animations: <b>${Motion.mode}</b> (setting: ${Motion.setting})</div>
      <div>Device asks for reduced motion: ${Motion.osReduce ? '<span class="bad">yes</span>' : '<span class="ok">no</span>'}</div>
      <div>Running animations: ${document.getAnimations ? document.getAnimations().length : 'n/a'}</div>
      <div>3D scene (WebGL): ${webgl}</div>
      <div>Fonts loaded: ${yes(document.fonts?.check('700 16px "Exo 2"'))}</div>
      <div>CSS color-mix: ${yes(window.CSS?.supports?.('color', 'color-mix(in srgb, red 50%, blue)'))} · @property: ${yes(typeof window.CSS?.registerProperty === 'function')}</div>
      <div>Viewport: ${innerWidth}×${innerHeight} @${devicePixelRatio}x</div>
      <div style="word-break:break-all;opacity:.75;margin-top:6px">${escapeHTML(navigator.userAgent)}</div>`;
  };
  render();
  setInterval(render, 1000);
}

/* ---------- cursive wordmarks ---------- */
function initWordmarks() {
  const brand = $('.brand-name');
  if (brand) {
    brand.classList.add('has-wm');
    brand.innerHTML = wordmarkSVG('Orbit Network', { cls: 'wm-brand wm-wide', waves: false })
      + wordmarkSVG('Orbit', { cls: 'wm-brand wm-stack', waves: false, label: '' })
      + wordmarkSVG('Network', { cls: 'wm-brand wm-stack', waves: false, label: '' });
    brand.querySelectorAll('.wm-stack').forEach((s) => s.setAttribute('aria-hidden', 'true'));
  }
  // Panel titles keep their text as the accessible name
  [['#arcade-title', 'Arcade Sector'], ['#deck-title', 'Command Deck'], ['#comms-title', 'Join the community']].forEach(([sel, text]) => {
    const h = $(sel);
    if (h) h.innerHTML = wordmarkSVG(text, { cls: 'wm-title', waves: false });
  });
  const playBrand = () => brand?.querySelectorAll('.wordmark').forEach((svg, i) => setTimeout(() => playWordmark(svg), i === 2 ? 350 : 0));
  if (document.getElementById('intro')) document.addEventListener('intro:reveal', playBrand, { once: true });
  else playBrand();
}

initWordmarks();
bindUI();
bindMotion();
window.addEventListener('resize', () => placeDockIndicator(false));
document.fonts?.ready.then(() => placeDockIndicator(false));
initTabs(document);
Store.subscribe(renderHUD);
renderHUD();
renderSound();
setSector('hub');
portal.start();
runIntro({ onReveal: () => { introRunning = false; scene?.reveal(); } });
initScene();
showDiagnostics();
