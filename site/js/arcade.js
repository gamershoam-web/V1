// Arcade engine: holographic game grid, game modal lifecycle, scoring, XP and high scores.
import { GAMES } from './games/index.js';
import { Store } from './storage.js';
import { audio } from './audio.js';
import { $, Modals, toast, fmt, escapeHTML } from './ui.js';

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
    const grid = $('#arcade-grid');
    if (!grid) return;
    grid.innerHTML = GAMES.map((g, i) => `
      <button type="button" class="game-card group" data-game="${g.id}" style="--card-accent:${g.color};--i:${i}">
        <span class="game-card-icon" aria-hidden="true">${g.icon}</span>
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
    });
  }

  async launch(id) {
    const meta = GAMES.find((g) => g.id === id);
    if (!meta) return;
    this.destroyCurrent();
    this.meta = meta;
    const token = ++this.token;
    Modals.close('modal-arcade', { silent: true });
    Modals.open('modal-game');
    this.onGameOpen?.();
    this.titleEl.textContent = meta.title;
    $('#game-icon').textContent = meta.icon;
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
    };
  }

  setScore(n) { this.scoreEl.textContent = fmt(Math.round(n)); }
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
    if (leveledUp) setTimeout(() => toast(`Level up! You reached level ${level}`, { type: 'success', icon: '⬆' }), 500);

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
        ${isNew ? '<p class="mt-4 text-neon-pink font-display tracking-widest text-sm animate-pulse">★ NEW HIGH SCORE ★</p>' : ''}
        <div class="flex flex-wrap gap-3 justify-center mt-6">
          <button type="button" class="btn-neon" data-again>Play again</button>
          <button type="button" class="btn-ghost" data-arcade>Arcade</button>
        </div>
      </div>`;
    overlay.querySelector('[data-again]').addEventListener('click', () => this.restart());
    overlay.querySelector('[data-arcade]').addEventListener('click', () => this.backToArcade());
    this.stage.appendChild(overlay);
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
    Modals.open('modal-arcade');
  }

  backToSpace() {
    this.close();
    this.onBackToSpace?.();
  }

  get isPlaying() { return !!this.meta; }
}
