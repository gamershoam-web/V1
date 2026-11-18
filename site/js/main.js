// Orbit Network Hub — app bootstrap: 3D scene, HUD, sector navigation, portal and arcade.
import { CONFIG } from './config.js';
import { Store } from './storage.js';
import { audio } from './audio.js';
import { $, $$, Modals, toast, initTabs, fmt, escapeHTML } from './ui.js';
import { MinecraftPortal } from './minecraft.js';
import { Arcade } from './arcade.js';
import { GAMES } from './games/index.js';

const SECTORS = {
  hub: { label: 'Deep Space' },
  station: { label: 'Command Deck', modal: 'modal-deck' },
  minecraft: { label: 'Minecraft · Orbitnetwork.net', modal: 'modal-minecraft' },
  arcade: { label: 'Arcade Sector', modal: 'modal-arcade' },
  comms: { label: 'Comms Relay', modal: 'modal-comms' },
};

let scene = null;
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
    });
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
    setTimeout(() => toast(`New sector discovered: ${SECTORS[id].label} (+15 XP)`, { icon: '🛰' }), 900);
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
function renderHUD() {
  const info = Store.levelInfo();
  $('#hud-level').textContent = info.level;
  $('#hud-rank').textContent = info.rank;
  $('#hud-xp').textContent = `${fmt(info.xp - info.floor)} / ${fmt(info.next - info.floor)} XP`;
  $('#hud-xpbar').style.width = `${Math.round(info.progress * 100)}%`;
  $('#hud-highscore').textContent = fmt(Store.totalBest());
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
  $('#deck-scores').innerHTML = GAMES.map((g) => `
    <li class="flex items-center gap-3 py-2.5 border-b border-white/5 last:border-0">
      <span class="text-xl w-8 text-center" aria-hidden="true">${g.icon}</span>
      <span class="flex-1 min-w-0 truncate text-sm">${escapeHTML(g.title)}</span>
      <b class="font-display text-neon-cyan text-sm">${fmt(Store.getBest(g.id))}</b>
      <button type="button" class="btn-mini" data-play="${g.id}">Play</button>
    </li>`).join('');
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

/* ---------- wiring ---------- */
function bindUI() {
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
      toast('Progress reset', { icon: '♻' });
    }
  });

  $$('[data-discord]').forEach((a) => {
    if (CONFIG.discordUrl) {
      a.href = CONFIG.discordUrl;
    } else {
      a.addEventListener('click', (e) => { e.preventDefault(); toast('Discord invite coming soon — check back later!', { icon: '💬' }); });
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
    if (top === 'modal-game') arcade.backToArcade();
    else Modals.close(top);
  });

  // Hide the navigation hint after the first interaction.
  const hint = $('#nav-hint');
  const hideHint = () => { hint.classList.add('opacity-0'); window.removeEventListener('pointerdown', hideHint); };
  window.addEventListener('pointerdown', hideHint);
  setTimeout(hideHint, 9000);

  $$('[data-year]').forEach((el) => { el.textContent = new Date().getFullYear(); });
}

bindUI();
initTabs(document);
Store.subscribe(renderHUD);
renderHUD();
renderSound();
setSector('hub');
portal.start();
initScene();
