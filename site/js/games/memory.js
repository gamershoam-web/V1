// Starlight Memory Matrix — repeat the constellation's growing light/tone sequence.
import { icon } from '../icons.js';
const STARS = [
  { x: 18, y: 30, c: '#22d3ee' }, { x: 40, y: 18, c: '#a855f7' }, { x: 62, y: 32, c: '#f472b6' },
  { x: 82, y: 22, c: '#facc15' }, { x: 74, y: 62, c: '#4ade80' }, { x: 48, y: 78, c: '#fb923c' },
  { x: 24, y: 66, c: '#60a5fa' }, { x: 50, y: 50, c: '#e2e8f0' },
];
const LINKS = [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 0], [1, 7], [7, 4], [2, 7], [7, 6]];

export default class MemoryMatrix {
  constructor(root, ctx) {
    this.root = root; this.ctx = ctx;
    this.seq = []; this.input = 0; this.round = 0; this.accept = false; this.timers = [];
    this.active = 6; // stars in play; grows to 8 for later rounds

    root.innerHTML = `
      <div class="memory">
        <p class="font-display tracking-widest text-sm text-neon-cyan text-center" data-status>Watch the constellation, then repeat it</p>
        <div class="constellation">
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            ${LINKS.map(([a, b]) => `<line data-link="${a}-${b}" x1="${STARS[a].x}" y1="${STARS[a].y}" x2="${STARS[b].x}" y2="${STARS[b].y}" stroke="rgba(167,139,250,.25)" stroke-width=".5" stroke-dasharray="1.5 1.5"/>`).join('')}
          </svg>
          ${STARS.map((s, i) => `<button type="button" class="star-btn" data-star="${i}" style="left:${s.x}%;top:${s.y}%;--sc:${s.c}" aria-label="Star ${i + 1}" disabled><kbd>${i + 1}</kbd></button>`).join('')}
        </div>
        <button type="button" class="btn-neon" data-start>Start sequence</button>
      </div>`;
    this.status = root.querySelector('[data-status]');
    this.buttons = [...root.querySelectorAll('[data-star]')];
    this.startBtn = root.querySelector('[data-start]');
    this.buttons.forEach((b) => b.addEventListener('pointerdown', (e) => { e.preventDefault(); this.press(Number(b.dataset.star)); }));
    this.startBtn.addEventListener('click', () => { this.startBtn.classList.add('hidden'); this.nextRound(); });
    this.onKey = (e) => {
      const n = Number(e.key);
      if (n >= 1 && n <= this.active) this.press(n - 1);
      else if ((e.code === 'Space' || e.code === 'Enter') && !this.startBtn.classList.contains('hidden')) { e.preventDefault(); this.startBtn.click(); }
    };
    window.addEventListener('keydown', this.onKey);
    this.refreshActive();
  }

  later(ms, fn) { this.timers.push(setTimeout(fn, ms)); }

  refreshActive() {
    this.buttons.forEach((b, i) => b.classList.toggle('hidden', i >= this.active));
    this.root.querySelectorAll('[data-link]').forEach((l) => {
      const [a, b] = l.dataset.link.split('-').map(Number);
      l.style.display = a < this.active && b < this.active ? '' : 'none';
    });
  }

  flash(i, dur) {
    const b = this.buttons[i];
    b.classList.add('lit');
    this.ctx.audio.note(i, dur / 1000 + 0.05);
    this.later(dur, () => b.classList.remove('lit'));
  }

  nextRound() {
    this.round++;
    if (this.round === 6) { this.active = 7; this.refreshActive(); this.ctx.toast('A new star joined the constellation!', { icon: 'sparkle' }); }
    if (this.round === 10) { this.active = 8; this.refreshActive(); this.ctx.toast('The constellation is complete — 8 stars!', { icon: 'sparkle' }); }
    this.seq.push(Math.floor(Math.random() * this.active));
    this.input = 0;
    this.accept = false;
    this.buttons.forEach((b) => { b.disabled = true; });
    this.status.textContent = `Round ${this.round} · Watch…`;
    this.ctx.setInfo(`Sequence length ${this.seq.length}`);
    const dur = Math.max(260, 620 - this.round * 28);
    const gap = Math.max(110, 240 - this.round * 10);
    this.seq.forEach((s, k) => this.later(700 + k * (dur + gap), () => this.flash(s, dur)));
    this.later(700 + this.seq.length * (dur + gap), () => {
      this.accept = true;
      this.buttons.forEach((b) => { b.disabled = false; });
      this.status.textContent = `Your turn · 0 / ${this.seq.length}`;
    });
  }

  press(i) {
    if (!this.accept) return;
    if (i === this.seq[this.input]) {
      this.flash(i, 220);
      this.input++;
      this.status.textContent = `Your turn · ${this.input} / ${this.seq.length}`;
      if (this.input === this.seq.length) {
        this.accept = false;
        this.ctx.setScore(this.round);
        this.status.innerHTML = `${icon('check')} Perfect! Next sequence…`;
        this.later(450, () => this.ctx.audio.pickup());
        this.later(1100, () => this.nextRound());
      }
    } else {
      this.accept = false;
      this.buttons[i].classList.add('lit');
      this.ctx.audio.error();
      this.status.innerHTML = `${icon('cross')} Wrong star!`;
      // Show the correct star.
      this.later(350, () => this.flash(this.seq[this.input], 600));
      const done = this.round - 1;
      this.later(1300, () => this.ctx.gameOver(done, { won: done >= 8, title: 'Constellation lost', message: `You repeated ${done} sequence${done === 1 ? '' : 's'} correctly.` }));
    }
  }

  destroy() {
    window.removeEventListener('keydown', this.onKey);
    this.timers.forEach(clearTimeout);
    this.root.innerHTML = '';
  }
}
