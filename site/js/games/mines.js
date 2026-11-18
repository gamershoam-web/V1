// Cosmic Minesweeper — reveal safe sectors using radar numbers; flag the space mines.
const LEVELS = {
  cadet: { cols: 9, rows: 9, mines: 10, mult: 1, label: 'Cadet' },
  pilot: { cols: 12, rows: 12, mines: 24, mult: 2, label: 'Pilot' },
  admiral: { cols: 16, rows: 16, mines: 44, mult: 4, label: 'Admiral' },
};

export default class CosmicMines {
  constructor(root, ctx) {
    this.root = root; this.ctx = ctx;
    this.level = 'cadet';
    this.flagMode = false;
    root.innerHTML = `
      <div class="game-toolbar">
        <div class="seg">${Object.entries(LEVELS).map(([k, v]) => `<button type="button" data-level="${k}">${v.label}</button>`).join('')}</div>
        <button type="button" class="btn-mini" data-flagmode aria-pressed="false">⛏ Scan mode</button>
        <span class="btn-mini pointer-events-none">🚩 <b data-left>0</b></span>
        <span class="btn-mini pointer-events-none">⏱ <b data-time>0</b>s</span>
      </div>
      <p class="text-[11px] text-slate-400 text-center mt-2 px-3">Tap to scan · right-click, long-press or Flag mode to mark a mine · tap a number to clear around it</p>
      <div class="scroll-stage grid place-items-center"><div class="mines-grid" data-grid></div></div>`;
    this.gridEl = root.querySelector('[data-grid]');
    root.querySelectorAll('[data-level]').forEach((b) => b.addEventListener('click', () => { this.level = b.dataset.level; this.newGame(); }));
    const fm = root.querySelector('[data-flagmode]');
    fm.addEventListener('click', () => {
      this.flagMode = !this.flagMode;
      fm.textContent = this.flagMode ? '🚩 Flag mode' : '⛏ Scan mode';
      fm.setAttribute('aria-pressed', String(this.flagMode));
      fm.classList.toggle('active', this.flagMode);
      fm.style.borderColor = this.flagMode ? '#f472b6' : '';
    });
    this.ro = new ResizeObserver(() => this.sizeGrid());
    this.ro.observe(root.querySelector('.scroll-stage'));
    this.newGame();
  }

  newGame() {
    clearInterval(this.timer);
    const L = LEVELS[this.level];
    Object.assign(this, { cols: L.cols, rows: L.rows, mineCount: L.mines, mult: L.mult });
    this.cells = Array.from({ length: L.rows * L.cols }, () => ({ mine: false, open: false, flag: false, n: 0 }));
    this.started = false; this.done = false; this.seconds = 0; this.flags = 0;
    this.root.querySelectorAll('[data-level]').forEach((b) => b.classList.toggle('active', b.dataset.level === this.level));
    this.root.querySelector('[data-time]').textContent = '0';
    this.gridEl.style.gridTemplateColumns = `repeat(${L.cols}, 1fr)`;
    this.gridEl.innerHTML = this.cells.map((_, i) => `<button type="button" class="mine-cell" data-i="${i}" aria-label="Sector ${i + 1}"></button>`).join('');
    this.els = [...this.gridEl.children];
    this.els.forEach((el, i) => this.bindCell(el, i));
    this.updateLeft();
    this.sizeGrid();
    this.ctx.setScore(0);
    this.ctx.setInfo(`${L.label}: ${L.cols}×${L.rows}, ${L.mines} mines`);
  }

  sizeGrid() {
    const stage = this.root.querySelector('.scroll-stage');
    if (!stage) return;
    const r = stage.getBoundingClientRect();
    const size = Math.max(18, Math.min(44, Math.floor((Math.min(r.width - 24, r.height - 24) - this.cols * 3) / this.cols)));
    this.gridEl.style.width = `${size * this.cols + 3 * (this.cols - 1)}px`;
  }

  bindCell(el, i) {
    let pressTimer = null, longPressed = false;
    el.addEventListener('contextmenu', (e) => { e.preventDefault(); this.toggleFlag(i); });
    el.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse') return;
      longPressed = false;
      pressTimer = setTimeout(() => { longPressed = true; this.toggleFlag(i); navigator.vibrate?.(30); }, 420);
    });
    const cancel = () => clearTimeout(pressTimer);
    el.addEventListener('pointerup', cancel);
    el.addEventListener('pointerleave', cancel);
    el.addEventListener('pointercancel', cancel);
    el.addEventListener('click', () => {
      if (longPressed) { longPressed = false; return; }
      if (this.flagMode && !this.cells[i].open) this.toggleFlag(i);
      else this.reveal(i);
    });
  }

  neighbors(i) {
    const r = Math.floor(i / this.cols), c = i % this.cols, out = [];
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      if (!dr && !dc) continue;
      const nr = r + dr, nc = c + dc;
      if (nr >= 0 && nr < this.rows && nc >= 0 && nc < this.cols) out.push(nr * this.cols + nc);
    }
    return out;
  }

  plant(safe) {
    const banned = new Set([safe, ...this.neighbors(safe)]);
    let placed = 0;
    while (placed < this.mineCount) {
      const i = Math.floor(Math.random() * this.cells.length);
      if (banned.has(i) || this.cells[i].mine) continue;
      this.cells[i].mine = true; placed++;
    }
    this.cells.forEach((cell, i) => { cell.n = this.neighbors(i).filter((j) => this.cells[j].mine).length; });
    this.started = true;
    this.timer = setInterval(() => {
      this.seconds++;
      this.root.querySelector('[data-time]').textContent = this.seconds;
    }, 1000);
  }

  toggleFlag(i) {
    const cell = this.cells[i];
    if (this.done || cell.open) return;
    cell.flag = !cell.flag;
    this.flags += cell.flag ? 1 : -1;
    this.els[i].textContent = cell.flag ? '🚩' : '';
    this.ctx.audio.tone({ freq: cell.flag ? 900 : 500, type: 'triangle', dur: 0.06, vol: 0.08 });
    this.updateLeft();
  }

  updateLeft() { this.root.querySelector('[data-left]').textContent = this.mineCount - this.flags; }

  reveal(i) {
    if (this.done) return;
    const cell = this.cells[i];
    if (cell.flag) return;
    if (!this.started) this.plant(i);
    if (cell.open) {
      // Chord: if flags around match the number, open the rest.
      const nb = this.neighbors(i);
      if (cell.n > 0 && nb.filter((j) => this.cells[j].flag).length === cell.n) nb.forEach((j) => { if (!this.cells[j].open && !this.cells[j].flag) this.reveal(j); });
      return;
    }
    if (cell.mine) return this.lose(i);
    const stack = [i];
    let opened = 0;
    while (stack.length) {
      const k = stack.pop();
      const c = this.cells[k];
      if (c.open || c.flag) continue;
      c.open = true; opened++;
      const el = this.els[k];
      el.classList.add('open');
      el.textContent = c.n || '';
      if (c.n) el.classList.add(`n${c.n}`);
      if (c.n === 0) this.neighbors(k).forEach((j) => { if (!this.cells[j].open) stack.push(j); });
    }
    this.ctx.audio.tone({ freq: 600 + Math.min(opened, 30) * 15, type: 'sine', dur: 0.05, vol: 0.07 });
    if (this.cells.every((c) => c.mine || c.open)) this.win();
  }

  lose(i) {
    this.done = true;
    clearInterval(this.timer);
    this.ctx.audio.explosion();
    this.cells.forEach((c, k) => {
      if (c.mine && !c.flag) { this.els[k].textContent = '✹'; this.els[k].classList.add('open'); this.els[k].style.color = '#f472b6'; }
      if (!c.mine && c.flag) this.els[k].classList.add('wrong');
    });
    this.els[i].classList.add('boom');
    this.els[i].textContent = '💥';
    setTimeout(() => { if (this.done) this.ctx.gameOver(0, { title: 'Mine detonated', message: 'A proximity mine caught your ship. Try again, pilot!' }); }, 900);
  }

  win() {
    this.done = true;
    clearInterval(this.timer);
    this.cells.forEach((c, k) => { if (c.mine && !c.flag) this.els[k].textContent = '🚩'; });
    const score = Math.max(100 * this.mult, Math.round(this.mult * (1500 - this.seconds * 8)));
    this.ctx.setScore(score);
    this.ctx.gameOver(score, { won: true, title: 'Sector cleared!', message: `${LEVELS[this.level].label} field cleared in ${this.seconds}s.` });
  }

  destroy() {
    clearInterval(this.timer);
    this.done = false;
    this.ro.disconnect();
    this.root.innerHTML = '';
  }
}
