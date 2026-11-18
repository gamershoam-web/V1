// Arcade engine: holographic game grid, game modal lifecycle, scoring, XP and high scores.
import { GAMES, FULL_GAMES, ALL_GAMES } from './games/index.js';
import { Store } from './storage.js';
import { audio } from './audio.js';
import { $, Modals, toast, fmt, escapeHTML } from './ui.js';
import { gameIcon, icon } from './icons.js';
import { gameCover } from './covers.js';

const saveKey = (id) => `orbitHub.game.${id}`;
export function loadSave(id) {
  try { return JSON.parse(localStorage.getItem(saveKey(id))) || null; } catch { return null; }
}
import { Motion } from './motion.js';

export class Arcade {
  constructor({ onGameOpen, onGameClose, onBackToSpace }) {
    this.onGameOpen = onGameOpen;
    this.onGameClose = onGameClose;
    this.onBackToSpace = onBackToSpace;
    this.current = null;
    this.meta = null;
    this.stage = $('#game-stage');
    this.scoreEl = $('#game-score');
    this.bestEl = $('#game-best');
    this.infoEl = $('#game-info');
    this.titleEl = $('#game-title');
    this.token = 0;

    $('#game-restart').addEventListener('click', () => this.restart());
    $('#game-to-arcade').addEventListener('click', () => this.backToArcade());
    $('#game-to-space').addEventListener('click', () => this.backToSpace());
    Store.subscribe(() => this.renderGrid());
    this.renderGrid();
  }

  renderGrid() {
    this.renderFull();
    const grid = $('#arcade-grid');
    if (!grid) return;
    grid.innerHTML = GAMES.map((g, i) => `
      <button type="button" class="game-card group" data-game="${g.id}" style="--card-accent:${g.color};--i:${i}">
        <span class="game-card-icon" aria-hidden="true">${gameIcon(g.id)}</span>
        <span class="flex-1 min-w-0 text-left">
          <span class="block font-display text-sm sm:text-base font-bold tracking-wide text-white">${escapeHTML(g.title)}</span>
          <span class="block text-xs text-slate-400 mt-0.5 leading-snug">${escapeHTML(g.desc)}</span>
          <span class="mt-2 flex items-center gap-2 text-[11px] uppercase tracking-wider">
            <span class="game-tag">${escapeHTML(g.tag)}</span>
            <span class="text-slate-400">Best <b class="text-neon-cyan">${fmt(Store.getBest(g.id))}</b></span>
          </span>
        </span>
      </button>`).join('');
    grid.querySelectorAll('[data-game]').forEach((b) => {
      b.addEventListener('click', () => this.launch(b.dataset.game));
      b.addEventListener('pointerenter', () => audio.hover());
      b.addEventListener('pointermove', (e) => {
        if (e.pointerType !== 'mouse' || Motion.calm) return;
        const r = b.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
        b.style.setProperty('--ry', `${(x * 10).toFixed(2)}deg`);
        b.style.setProperty('--rx', `${(-y * 10).toFixed(2)}deg`);
      });
      b.addEventListener('pointerleave', () => { b.style.removeProperty('--rx'); b.style.removeProperty('--ry'); });
    });
  }

  renderFull() {
    const host = $('#full-games');
    if (!host) return;
    host.innerHTML = FULL_GAMES.map((g, i) => {
      const save = loadSave(g.id);
      const started = g.id === 'colony' ? !!save?.started : false;
      return `
      <article class="full-card" style="--card-accent:${g.color};--i:${i}">
        <button type="button" class="full-cover" data-game="${g.id}" aria-label="Play ${escapeHTML(g.title)}">
          ${gameCover(g.id)}
          <span class="full-tag">${escapeHTML(g.tag)}</span>
          <span class="full-play" aria-hidden="true">${icon('arrowRight')}</span>
        </button>
        <div class="full-body">
          <div class="flex items-center gap-3">
            <span class="full-icon" aria-hidden="true">${gameIcon(g.id)}</span>
            <div class="min-w-0">
              <h3 class="full-title">${escapeHTML(g.title)}</h3>
              <p class="full-progress">${escapeHTML(g.progress(save))}</p>
            </div>
          </div>
          <p class="full-desc">${escapeHTML(g.desc)}</p>
          <ul class="full-features">${g.features.map((f) => `<li>${icon('check')}<span>${escapeHTML(f)}</span></li>`).join('')}</ul>
          <div class="full-actions">
            <button type="button" class="btn-neon flex-1" data-game="${g.id}">${started ? 'Continue' : 'Play'}</button>
            <span class="full-best">Best <b>${fmt(Store.getBest(g.id))}</b></span>
          </div>
        </div>
      </article>`;
    }).join('');
    host.querySelectorAll('[data-game]').forEach((b) => {
      b.addEventListener('click', () => this.launch(b.dataset.game));
      b.addEventListener('pointerenter', () => audio.hover());
    });
  }

  async launch(id) {
    const meta = ALL_GAMES.find((g) => g.id === id);
    if (!meta) return;
    this.destroyCurrent();
    this.meta = meta;
    const token = ++this.token;
    Modals.close('modal-arcade', { silent: true });
    $('#modal-game').classList.toggle('big', !!meta.big);
    $('#game-restart').classList.toggle('hidden', meta.restart === false);
    Modals.open('modal-game');
    this.onGameOpen?.();
    this.warp();
    this.titleEl.textContent = meta.title;
    $('#game-icon').innerHTML = gameIcon(meta.id);
    $('#game-icon').style.setProperty('--card-accent', meta.color);
    this.setScore(0);
    this.setInfo('');
    this.bestEl.textContent = fmt(Store.getBest(id));
    this.stage.innerHTML = '<div class="h-full grid place-items-center text-slate-400 font-display tracking-widest animate-pulse">LOADING SIMULATION…</div>';
    try {
      const mod = await meta.load();
      if (token !== this.token) return;
      this.stage.innerHTML = '';
      this.over = false;
      this.current = new mod.default(this.stage, this.makeCtx(meta));
    } catch (err) {
      console.error(err);
      this.stage.innerHTML = '<div class="h-full grid place-items-center text-rose-300">This game failed to load. Please try again.</div>';
    }
  }

  makeCtx(meta) {
    return {
      audio,
      toast,
      best: Store.getBest(meta.id),
      setScore: (n) => this.setScore(n),
      setInfo: (t) => this.setInfo(t),
      gameOver: (score, opts) => this.gameOver(score, opts),
      // Save a best score without ending the session (long games report progress as they go).
      reportScore: (score) => {
        const { best } = Store.submitScore(meta.id, Math.max(0, Math.round(score || 0)));
        this.bestEl.textContent = fmt(best);
        return best;
      },
      awardXP: (n, reason) => {
        const { leveledUp, level } = Store.addXP(n);
        if (reason) toast(`${reason} (+${Math.round(n)} XP)`, { icon: 'star' });
        if (leveledUp) setTimeout(() => toast(`Level up! You reached level ${level}`, { type: 'success', icon: 'levelUp' }), 600);
      },
      storage: {
        load: () => loadSave(meta.id),
        save: (data) => { try { localStorage.setItem(saveKey(meta.id), JSON.stringify(data)); } catch { /* storage full or blocked */ } },
        clear: () => { try { localStorage.removeItem(saveKey(meta.id)); } catch { /* ignore */ } },
      },
      get calm() { return Motion.calm; },
    };
  }

  setScore(n) {
    const text = fmt(Math.round(n));
    if (text === this.scoreEl.textContent) return;
    this.scoreEl.textContent = text;
    if (Math.round(n) > 0) {
      const box = this.scoreEl.parentElement;
      box.classList.remove('bump'); void box.offsetWidth; box.classList.add('bump');
    }
  }

  warp() {
    const panel = document.querySelector('#modal-game .modal-panel');
    panel.querySelector('.warp')?.remove();
    if (Motion.calm) return;
    const w = document.createElement('div');
    w.className = 'warp';
    w.innerHTML = Array.from({ length: 48 }, () => `<i style="--a:${Math.round(Math.random() * 360)}deg;--d:${Math.round(Math.random() * 180)}ms"></i>`).join('');
    panel.appendChild(w);
    audio.whoosh();
    setTimeout(() => w.remove(), 1000);
  }

  confetti(host) {
    const colors = ['#22d3ee', '#a855f7', '#f472b6', '#facc15', '#4ade80'];
    host.insertAdjacentHTML('beforeend', Array.from({ length: 40 }, (_, i) => {
      const a = Math.random() * Math.PI * 2, d = 120 + Math.random() * 180;
      return `<span class="confetti" style="--c:${colors[i % 5]};--x:${Math.round(Math.cos(a) * d)}px;--y:${Math.round(Math.sin(a) * d)}px;--r:${Math.round(Math.random() * 720)}deg;--d:${Math.round(Math.random() * 200)}ms"></span>`;
    }).join(''));
  }
  setInfo(t) { this.infoEl.textContent = t || ''; }

  gameOver(score, { won = false, title, message } = {}) {
    if (this.over || !this.meta) return;
    this.over = true;
    score = Math.max(0, Math.round(score || 0));
    this.setScore(score);
    const { best, isNew } = Store.submitScore(this.meta.id, score);
    const xp = score > 0 ? Math.min(250, 10 + Math.round(score * this.meta.xp)) : 5;
    const { leveledUp, level } = Store.addXP(xp);
    this.bestEl.textContent = fmt(best);
    if (won || isNew) audio.chime(); else audio.lose();
    if (leveledUp) setTimeout(() => toast(`Level up! You reached level ${level}`, { type: 'success', icon: 'levelUp' }), 500);

    const overlay = document.createElement('div');
    overlay.className = 'game-over';
    overlay.innerHTML = `
      <div class="game-over-card glass">
        <p class="font-display text-xs tracking-[0.3em] text-neon-cyan">${won ? 'MISSION COMPLETE' : 'SIMULATION ENDED'}</p>
        <h3 class="font-display text-2xl sm:text-3xl font-black mt-2">${escapeHTML(title || (won ? 'Victory!' : 'Game Over'))}</h3>
        ${message ? `<p class="text-slate-300 mt-2 text-sm">${escapeHTML(message)}</p>` : ''}
        <div class="grid grid-cols-3 gap-3 mt-5 text-center">
          <div class="stat"><span>Score</span><b>${fmt(score)}</b></div>
          <div class="stat"><span>Best</span><b>${fmt(best)}</b></div>
          <div class="stat"><span>XP</span><b>+${xp}</b></div>
        </div>
        ${isNew ? `<p class="new-best mt-4">${icon('star')} NEW HIGH SCORE ${icon('star')}</p>` : ''}
        <div class="flex flex-wrap gap-3 justify-center mt-6">
          <button type="button" class="btn-neon" data-again>Play again</button>
          <button type="button" class="btn-ghost" data-arcade>Arcade</button>
        </div>
      </div>`;
    overlay.querySelector('[data-again]').addEventListener('click', () => this.restart());
    overlay.querySelector('[data-arcade]').addEventListener('click', () => this.backToArcade());
    this.stage.appendChild(overlay);
    if (isNew || won) this.confetti(overlay);
    setTimeout(() => overlay.classList.add('show'), 20);
    overlay.querySelector('[data-again]').focus({ preventScroll: true });
  }

  destroyCurrent() {
    try { this.current?.destroy?.(); } catch (e) { console.error(e); }
    this.current = null;
    this.stage.innerHTML = '';
  }

  restart() {
    if (this.meta) this.launch(this.meta.id);
  }

  close() {
    this.token++;
    this.destroyCurrent();
    this.meta = null;
    Modals.close('modal-game', { silent: true });
    this.onGameClose?.();
  }

  backToArcade() {
    this.close();
    this.renderFull();
    Modals.open('modal-arcade');
  }

  backToSpace() {
    this.close();
    this.onBackToSpace?.();
  }

  get isPlaying() { return !!this.meta; }

  // Lets a game intercept Escape (e.g. to open its pause menu). Returns true if handled.
  handleEscape() {
    try { return !!this.current?.onEscape?.(); } catch { return false; }
  }
}
