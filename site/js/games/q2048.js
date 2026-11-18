// Quantum 2048 — merge cosmic matter: Space Dust → Asteroid → Moon → Planet → Star → Pulsar → Supernova → …
const STAGES = [null,
  ['Space Dust', '✨'], ['Asteroid', '🪨'], ['Moon', '🌙'], ['Planet', '🪐'], ['Star', '⭐'], ['Pulsar', '💫'],
  ['Supernova', '💥'], ['Black Hole', '🕳️'], ['Quasar', '🌀'], ['Galaxy', '🌌'], ['Universe', '♾️'], ['Multiverse', '🔮']];
const N = 4;
const DIRS = { left: [0, -1], right: [0, 1], up: [-1, 0], down: [1, 0] };

export default class Quantum2048 {
  constructor(root, ctx) {
    this.root = root; this.ctx = ctx;
    this.grid = Array.from({ length: N }, () => Array(N).fill(null));
    this.score = 0; this.nextId = 1; this.busy = false; this.announced = false; this.over = false;
    this.timers = [];

    root.innerHTML = `
      <div class="q2048">
        <p class="text-xs text-slate-400 text-center">Swipe or use arrow keys / WASD. Merge matching matter to evolve it.</p>
        <div class="q-board" tabindex="0" aria-label="Quantum 2048 board">
          ${Array.from({ length: N * N }, (_, i) => `<div class="q-cell" style="--r:${Math.floor(i / N)};--c:${i % N}"></div>`).join('')}
        </div>
        <div class="q-legend">${STAGES.slice(1, 8).map((s, i) => `<span>${s[1]} ${s[0]}${i < 6 ? ' →' : ''}</span>`).join('')}</div>
      </div>`;
    this.board = root.querySelector('.q-board');

    this.onKey = (e) => {
      const map = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down' };
      const d = map[e.code];
      if (d) { e.preventDefault(); this.move(d); }
    };
    window.addEventListener('keydown', this.onKey);

    let start = null;
    this.board.addEventListener('pointerdown', (e) => { start = [e.clientX, e.clientY]; });
    this.board.addEventListener('pointerup', (e) => {
      if (!start) return;
      const dx = e.clientX - start[0], dy = e.clientY - start[1];
      start = null;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
      this.move(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
    });

    this.spawn(); this.spawn();
    ctx.setInfo('Goal: create a Supernova 💥');
  }

  spawn() {
    const empty = [];
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (!this.grid[r][c]) empty.push([r, c]);
    if (!empty.length) return;
    const [r, c] = empty[Math.floor(Math.random() * empty.length)];
    const tile = { id: this.nextId++, level: Math.random() < 0.9 ? 1 : 2, r, c, el: null };
    this.grid[r][c] = tile;
    this.render(tile, 'new');
  }

  render(tile, cls) {
    if (!tile.el) {
      tile.el = document.createElement('div');
      this.board.appendChild(tile.el);
    }
    const [name, emoji] = STAGES[Math.min(tile.level, STAGES.length - 1)];
    tile.el.className = `q-tile lvl-${tile.level}${cls ? ` ${cls}` : ''}`;
    tile.el.style.setProperty('--r', tile.r);
    tile.el.style.setProperty('--c', tile.c);
    tile.el.innerHTML = `<div class="q-inner"><span class="q-emoji">${emoji}</span><span class="q-name">${name}</span><span class="q-val">${2 ** tile.level}</span></div>`;
  }

  move(dir) {
    if (this.busy || this.over) return;
    const [dr, dc] = DIRS[dir];
    const rows = [...Array(N).keys()], cols = [...Array(N).keys()];
    if (dr === 1) rows.reverse();
    if (dc === 1) cols.reverse();
    let moved = false, gained = 0;
    const merged = new Set();
    const removed = [];

    for (const r of rows) for (const c of cols) {
      const tile = this.grid[r][c];
      if (!tile) continue;
      let nr = r, nc = c;
      while (true) {
        const tr = nr + dr, tc = nc + dc;
        if (tr < 0 || tr >= N || tc < 0 || tc >= N) break;
        const other = this.grid[tr][tc];
        if (!other) { nr = tr; nc = tc; continue; }
        if (other.level === tile.level && !merged.has(other.id)) {
          // Merge: tile slides onto other, other evolves.
          this.grid[r][c] = null;
          tile.r = tr; tile.c = tc;
          removed.push(tile);
          other.level++;
          merged.add(other.id);
          gained += 2 ** other.level;
          moved = true;
          nr = null;
        }
        break;
      }
      if (nr === null) continue;
      if (nr !== r || nc !== c) {
        this.grid[r][c] = null;
        this.grid[nr][nc] = tile;
        tile.r = nr; tile.c = nc;
        moved = true;
      }
    }
    if (!moved) return;
    this.busy = true;

    // Slide all tiles (including those being absorbed).
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
      const t = this.grid[r][c];
      if (t) { t.el.style.setProperty('--r', t.r); t.el.style.setProperty('--c', t.c); t.el.classList.remove('new', 'merged'); }
    }
    removed.forEach((t) => { t.el.style.setProperty('--r', t.r); t.el.style.setProperty('--c', t.c); t.el.style.zIndex = 1; });

    if (gained) {
      this.score += gained;
      this.ctx.setScore(this.score);
      this.ctx.audio.tone({ freq: 300 + Math.log2(gained) * 60, type: 'triangle', dur: 0.12, vol: 0.14 });
    } else this.ctx.audio.tone({ freq: 220, type: 'sine', dur: 0.05, vol: 0.06 });

    this.timers.push(setTimeout(() => {
      removed.forEach((t) => t.el.remove());
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
        const t = this.grid[r][c];
        if (t && merged.has(t.id)) {
          this.render(t, 'merged');
          if (t.level >= 7 && !this.announced) {
            this.announced = true;
            this.ctx.audio.chime();
            this.ctx.toast('💥 Supernova formed! Keep going for a Black Hole…', { type: 'success' });
          }
        }
      }
      this.spawn();
      this.busy = false;
      if (!this.canMove()) {
        this.over = true;
        this.timers.push(setTimeout(() => this.ctx.gameOver(this.score, {
          won: this.announced, title: this.announced ? 'Cosmos evolved!' : 'Universe collapsed',
          message: `Highest matter: ${STAGES[Math.min(this.maxLevel(), STAGES.length - 1)][0]}`,
        }), 500));
      }
    }, 130));
  }

  maxLevel() { let m = 0; this.grid.flat().forEach((t) => { if (t) m = Math.max(m, t.level); }); return m; }

  canMove() {
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
      const t = this.grid[r][c];
      if (!t) return true;
      if (c < N - 1 && this.grid[r][c + 1]?.level === t.level) return true;
      if (r < N - 1 && this.grid[r + 1][c]?.level === t.level) return true;
    }
    return false;
  }

  destroy() {
    window.removeEventListener('keydown', this.onKey);
    this.timers.forEach(clearTimeout);
    this.root.innerHTML = '';
  }
}
