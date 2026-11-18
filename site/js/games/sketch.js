// Nebula Sketch — Skribbl-style drawing & guessing.
// Mode 1 "AI Bot Drawer": the bot sketches an icon stroke-by-stroke; type guesses in chat.
// Mode 2 "Free Draw / Pass & Play": one player draws a secret word, the other guesses.
const TAU = Math.PI * 2;
const arc = (cx, cy, rx, ry, a0 = 0, a1 = TAU, n = 40) => Array.from({ length: n + 1 }, (_, i) => {
  const a = a0 + ((a1 - a0) * i) / n;
  return [cx + Math.cos(a) * rx, cy + Math.sin(a) * ry];
});
const circ = (cx, cy, r, a0, a1, n) => arc(cx, cy, r, r, a0, a1, n);
const rect = (x, y, w, h) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]];
const line = (...pts) => pts;

const ICONS = [
  { word: 'rocket', alt: ['spaceship', 'space ship', 'ship', 'rocket ship'], paths: () => [
    line([0.5, 0.08], [0.62, 0.25], [0.62, 0.62], [0.38, 0.62], [0.38, 0.25], [0.5, 0.08]),
    circ(0.5, 0.34, 0.06),
    line([0.38, 0.46], [0.26, 0.66], [0.38, 0.62]), line([0.62, 0.46], [0.74, 0.66], [0.62, 0.62]),
    line([0.42, 0.62], [0.5, 0.88], [0.58, 0.62]), line([0.46, 0.62], [0.5, 0.76], [0.54, 0.62]),
  ] },
  { word: 'planet', alt: ['saturn', 'ringed planet'], paths: () => [
    circ(0.5, 0.5, 0.2),
    arc(0.5, 0.53, 0.4, 0.1, 0, Math.PI),
    arc(0.5, 0.53, 0.4, 0.1, Math.PI, Math.PI * 1.25, 10), arc(0.5, 0.53, 0.4, 0.1, Math.PI * 1.75, TAU, 10),
    arc(0.5, 0.44, 0.17, 0.04, 0, Math.PI, 20),
  ] },
  { word: 'star', alt: ['stars'], paths: () => [Array.from({ length: 11 }, (_, i) => {
    const a = -Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? 0.16 : 0.38;
    return [0.5 + Math.cos(a) * r, 0.53 + Math.sin(a) * r];
  })] },
  { word: 'moon', alt: ['crescent', 'crescent moon'], paths: () => [
    circ(0.5, 0.5, 0.32, Math.PI * 0.32, Math.PI * 1.68), circ(0.62, 0.5, 0.26, Math.PI * 1.62, Math.PI * 0.38 + TAU * 0 , 40).reverse(),
    circ(0.36, 0.42, 0.04), circ(0.4, 0.62, 0.05),
  ] },
  { word: 'ufo', alt: ['flying saucer', 'saucer', 'spaceship'], paths: () => [
    arc(0.5, 0.55, 0.36, 0.1), arc(0.5, 0.5, 0.16, 0.15, Math.PI, TAU, 24),
    circ(0.33, 0.56, 0.02, 0, TAU, 8), circ(0.5, 0.6, 0.02, 0, TAU, 8), circ(0.67, 0.56, 0.02, 0, TAU, 8),
    line([0.42, 0.65], [0.3, 0.92]), line([0.58, 0.65], [0.7, 0.92]),
  ] },
  { word: 'sword', alt: ['diamond sword', 'blade'], paths: () => [
    line([0.5, 0.06], [0.56, 0.14], [0.56, 0.62], [0.44, 0.62], [0.44, 0.14], [0.5, 0.06]),
    rect(0.32, 0.62, 0.36, 0.05), rect(0.46, 0.67, 0.08, 0.17), circ(0.5, 0.88, 0.04),
  ] },
  { word: 'pickaxe', alt: ['pick', 'pick axe', 'diamond pickaxe'], paths: () => [
    arc(0.5, 0.42, 0.38, 0.22, Math.PI * 1.08, Math.PI * 1.92, 30),
    arc(0.5, 0.47, 0.3, 0.14, Math.PI * 1.12, Math.PI * 1.88, 30),
    line([0.47, 0.27], [0.47, 0.92], [0.53, 0.92], [0.53, 0.27]),
  ] },
  { word: 'creeper', alt: ['creeper face', 'minecraft'], paths: () => [
    rect(0.2, 0.15, 0.6, 0.7), rect(0.3, 0.3, 0.13, 0.13), rect(0.57, 0.3, 0.13, 0.13),
    line([0.44, 0.48], [0.56, 0.48], [0.56, 0.56], [0.63, 0.56], [0.63, 0.75], [0.56, 0.75], [0.56, 0.68], [0.44, 0.68], [0.44, 0.75], [0.37, 0.75], [0.37, 0.56], [0.44, 0.56], [0.44, 0.48]),
  ] },
  { word: 'sun', alt: ['star', 'sunshine'], paths: () => [
    circ(0.5, 0.5, 0.17),
    ...Array.from({ length: 12 }, (_, i) => { const a = (i / 12) * TAU; return line([0.5 + Math.cos(a) * 0.24, 0.5 + Math.sin(a) * 0.24], [0.5 + Math.cos(a) * 0.38, 0.5 + Math.sin(a) * 0.38]); }),
  ] },
  { word: 'alien', alt: ['martian', 'extraterrestrial', 'et'], paths: () => [
    arc(0.5, 0.48, 0.22, 0.28), arc(0.41, 0.46, 0.07, 0.045, 0, TAU, 20), arc(0.59, 0.46, 0.07, 0.045, 0, TAU, 20),
    arc(0.5, 0.6, 0.06, 0.03, 0, Math.PI, 12),
    line([0.42, 0.22], [0.36, 0.08]), circ(0.36, 0.07, 0.025, 0, TAU, 10), line([0.58, 0.22], [0.64, 0.08]), circ(0.64, 0.07, 0.025, 0, TAU, 10),
  ] },
  { word: 'satellite', alt: ['sat', 'space station'], paths: () => [
    rect(0.42, 0.4, 0.16, 0.2), rect(0.08, 0.44, 0.28, 0.12), rect(0.64, 0.44, 0.28, 0.12),
    line([0.36, 0.5], [0.42, 0.5]), line([0.58, 0.5], [0.64, 0.5]),
    line([0.22, 0.44], [0.22, 0.56]), line([0.78, 0.44], [0.78, 0.56]),
    arc(0.5, 0.32, 0.1, 0.06, 0, Math.PI, 16), line([0.5, 0.38], [0.5, 0.4]), line([0.5, 0.32], [0.5, 0.22]),
  ] },
  { word: 'heart', alt: ['love'], paths: () => [Array.from({ length: 61 }, (_, i) => {
    const t = (i / 60) * TAU;
    const x = 16 * Math.sin(t) ** 3, y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
    return [0.5 + x / 42, 0.48 - y / 42];
  })] },
  { word: 'diamond', alt: ['gem', 'crystal', 'jewel'], paths: () => [
    line([0.3, 0.3], [0.7, 0.3], [0.84, 0.45], [0.5, 0.85], [0.16, 0.45], [0.3, 0.3]),
    line([0.16, 0.45], [0.84, 0.45]),
    line([0.3, 0.3], [0.4, 0.45], [0.5, 0.85]), line([0.7, 0.3], [0.6, 0.45], [0.5, 0.85]), line([0.4, 0.45], [0.5, 0.3], [0.6, 0.45]),
  ] },
  { word: 'tree', alt: ['oak', 'oak tree'], paths: () => [
    rect(0.45, 0.6, 0.1, 0.3), circ(0.5, 0.42, 0.24), circ(0.42, 0.4, 0.05, 0, TAU, 10), circ(0.58, 0.48, 0.05, 0, TAU, 10),
  ] },
  { word: 'comet', alt: ['meteor', 'shooting star', 'asteroid'], paths: () => [
    circ(0.7, 0.3, 0.08), line([0.63, 0.36], [0.16, 0.84]), line([0.62, 0.27], [0.2, 0.66]), line([0.73, 0.38], [0.34, 0.88]),
  ] },
  { word: 'galaxy', alt: ['spiral', 'spiral galaxy', 'milky way', 'black hole'], paths: () => [
    Array.from({ length: 80 }, (_, i) => { const t = i / 79, a = t * 3.2 * Math.PI; return [0.5 + Math.cos(a) * (0.02 + t * 0.36), 0.5 + Math.sin(a) * (0.02 + t * 0.36) * 0.75]; }),
    Array.from({ length: 80 }, (_, i) => { const t = i / 79, a = t * 3.2 * Math.PI + Math.PI; return [0.5 + Math.cos(a) * (0.02 + t * 0.36), 0.5 + Math.sin(a) * (0.02 + t * 0.36) * 0.75]; }),
  ] },
];

const FREE_WORDS = ['rocket', 'planet', 'alien', 'astronaut', 'telescope', 'comet', 'moon', 'star', 'ufo', 'satellite', 'black hole', 'sun',
  'creeper', 'pickaxe', 'sword', 'diamond', 'tree', 'house', 'cat', 'robot', 'castle', 'dragon', 'fish', 'volcano', 'crown', 'pizza',
  'ghost', 'laser', 'meteor', 'space station', 'helmet', 'game controller', 'treasure chest', 'portal', 'zombie', 'bow and arrow'];

const COLORS = ['#ffffff', '#22d3ee', '#a855f7', '#f472b6', '#facc15', '#4ade80', '#f97316', '#ef4444'];
const SIZES = [3, 8, 16];
const BG = '#0b0a1f';
const CW = 1000, CH = 640;
const ROUNDS = 6, ROUND_TIME = 60;

const norm = (s) => s.toLowerCase().replace(/[^a-z ]/g, '').replace(/\s+/g, ' ').trim();
function lev(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  }
  return d[a.length][b.length];
}
const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

export default class NebulaSketch {
  constructor(root, ctx) {
    this.root = root; this.ctx = ctx;
    this.mode = 'bot';
    this.color = COLORS[0]; this.size = SIZES[1]; this.eraser = false;
    this.score = 0;
    this._timers = [];
    this._raf = 0;

    root.innerHTML = `
      <div class="sketch">
        <div class="sketch-top">
          <div class="seg" role="tablist">
            <button type="button" data-mode="bot" class="active">🤖 AI Bot Drawer</button>
            <button type="button" data-mode="free">✏️ Free Draw / Pass &amp; Play</button>
          </div>
          <div class="flex items-center gap-3">
            <span class="text-xs text-slate-400" data-round></span>
            <span class="sketch-word" data-word></span>
            <span class="sketch-timer" data-timer></span>
          </div>
        </div>
        <div class="sketch-board">
          <div class="sketch-canvas-wrap"><canvas class="sketch-canvas" width="${CW}" height="${CH}"></canvas></div>
          <div class="sketch-tools" data-tools>
            ${COLORS.map((c, i) => `<button type="button" class="swatch${i === 0 ? ' active' : ''}" data-color="${c}" style="background:${c}" aria-label="Color ${c}"></button>`).join('')}
            <span class="w-2"></span>
            ${SIZES.map((s, i) => `<button type="button" class="size-btn${i === 1 ? ' active' : ''}" data-size="${s}" aria-label="Brush size ${s}"><i style="width:${Math.max(4, s * 0.9)}px;height:${Math.max(4, s * 0.9)}px"></i></button>`).join('')}
            <button type="button" class="btn-mini tool-btn" data-eraser>🧽 Eraser</button>
            <button type="button" class="btn-mini" data-clear>🗑 Clear</button>
          </div>
          <div class="flex flex-wrap gap-2 justify-center hidden" data-free-bar>
            <button type="button" class="btn-mini" data-reveal>👁 Show secret word</button>
            <button type="button" class="btn-mini" data-skip>⏭ New word</button>
            <button type="button" class="btn-mini" data-finish>🏁 Finish game</button>
          </div>
        </div>
        <div class="sketch-chat">
          <div class="chat-log" data-log aria-live="polite"></div>
          <form class="chat-form" data-form>
            <input type="text" maxlength="40" placeholder="Type your guess…" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="Your guess">
            <button type="submit" class="btn-neon !px-3 !py-2 !animate-none">Send</button>
          </form>
        </div>
      </div>`;

    this.canvas = root.querySelector('canvas');
    this.g = this.canvas.getContext('2d');
    this.g.lineCap = 'round'; this.g.lineJoin = 'round';
    this.log = root.querySelector('[data-log]');
    this.input = root.querySelector('[data-form] input');
    this.wordEl = root.querySelector('[data-word]');
    this.timerEl = root.querySelector('[data-timer]');
    this.roundEl = root.querySelector('[data-round]');
    this.tools = root.querySelector('[data-tools]');
    this.freeBar = root.querySelector('[data-free-bar]');

    this.bindTools();
    this.bindDrawing();
    root.querySelector('[data-form]').addEventListener('submit', (e) => { e.preventDefault(); this.guess(this.input.value); this.input.value = ''; });
    root.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => this.setMode(b.dataset.mode)));

    this.ro = new ResizeObserver(() => this.fit());
    this.ro.observe(root.querySelector('.sketch-canvas-wrap'));
    this.fit();
    this.setMode('bot');
  }

  fit() {
    const wrap = this.root.querySelector('.sketch-canvas-wrap');
    const r = wrap.getBoundingClientRect();
    const s = Math.min(r.width / CW, r.height / CH);
    this.canvas.style.width = `${Math.floor(CW * s)}px`;
    this.canvas.style.height = `${Math.floor(CH * s)}px`;
  }

  later(ms, fn) { const id = setTimeout(fn, ms); this._timers.push(id); return id; }
  clearTimers() { this._timers.forEach(clearTimeout); this._timers = []; clearInterval(this.tick); cancelAnimationFrame(this._raf); }

  say(text, cls = 'sys') {
    const p = document.createElement('p');
    p.className = cls;
    p.textContent = text;
    this.log.appendChild(p);
    while (this.log.children.length > 80) this.log.firstChild.remove();
    this.log.scrollTop = this.log.scrollHeight;
  }

  clearCanvas() { this.g.fillStyle = BG; this.g.fillRect(0, 0, CW, CH); }

  bindTools() {
    this.root.querySelectorAll('[data-color]').forEach((b) => b.addEventListener('click', () => {
      this.color = b.dataset.color; this.eraser = false;
      this.root.querySelectorAll('[data-color]').forEach((x) => x.classList.toggle('active', x === b));
      this.root.querySelector('[data-eraser]').classList.remove('active');
    }));
    this.root.querySelectorAll('[data-size]').forEach((b) => b.addEventListener('click', () => {
      this.size = Number(b.dataset.size);
      this.root.querySelectorAll('[data-size]').forEach((x) => x.classList.toggle('active', x === b));
    }));
    this.root.querySelector('[data-eraser]').addEventListener('click', (e) => {
      this.eraser = !this.eraser;
      e.currentTarget.classList.toggle('active', this.eraser);
    });
    this.root.querySelector('[data-clear]').addEventListener('click', () => { this.clearCanvas(); this.ctx.audio.zap(); });
    this.root.querySelector('[data-reveal]').addEventListener('click', () => this.revealSecret());
    this.root.querySelector('[data-skip]').addEventListener('click', () => { this.say(`Skipped "${this.secret}".`); this.nextFreeWord(); });
    this.root.querySelector('[data-finish]').addEventListener('click', () => this.finish());
  }

  bindDrawing() {
    let drawing = false, last = null;
    const pos = (e) => {
      const r = this.canvas.getBoundingClientRect();
      return [((e.clientX - r.left) / r.width) * CW, ((e.clientY - r.top) / r.height) * CH];
    };
    this.canvas.addEventListener('pointerdown', (e) => {
      if (this.mode !== 'free') return;
      drawing = true; last = pos(e);
      try { this.canvas.setPointerCapture(e.pointerId); } catch { /* ignore */ }
      this.stroke(last, last, this.eraser ? BG : this.color, this.eraser ? this.size * 2.5 : this.size);
    });
    this.canvas.addEventListener('pointermove', (e) => {
      if (!drawing) return;
      const p = pos(e);
      this.stroke(last, p, this.eraser ? BG : this.color, this.eraser ? this.size * 2.5 : this.size);
      last = p;
    });
    const stop = () => { drawing = false; };
    this.canvas.addEventListener('pointerup', stop);
    this.canvas.addEventListener('pointercancel', stop);
  }

  stroke(a, b, color, width, glow = false) {
    const g = this.g;
    g.save();
    g.strokeStyle = color; g.lineWidth = width;
    if (glow) { g.shadowColor = color; g.shadowBlur = 10; }
    g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke();
    g.restore();
  }

  setMode(mode) {
    this.clearTimers();
    this.mode = mode;
    this.score = 0;
    this.ctx.setScore(0);
    this.log.innerHTML = '';
    this.clearCanvas();
    this.root.querySelectorAll('[data-mode]').forEach((b) => b.classList.toggle('active', b.dataset.mode === mode));
    this.tools.classList.toggle('disabled', mode === 'bot');
    this.freeBar.classList.toggle('hidden', mode !== 'free');
    this.canvas.style.cursor = mode === 'free' ? 'crosshair' : 'default';
    if (mode === 'bot') {
      this.queue = shuffle([...ICONS]).slice(0, ROUNDS);
      this.round = 0;
      this.say('🤖 Orbit-Bot is warming up its plasma pen…', 'bot');
      this.later(900, () => this.startBotRound());
    } else {
      this.timerEl.textContent = '';
      this.roundEl.textContent = 'Pass & Play';
      this.say('Free Draw: the drawer taps "Show secret word" (keep it hidden!) and draws. The guesser types guesses below. +100 per correct guess.');
      this.freeWords = shuffle([...FREE_WORDS]);
      this.nextFreeWord();
    }
  }

  /* ----- Bot mode ----- */
  startBotRound() {
    if (this.round >= ROUNDS) return this.finish();
    this.current = this.queue[this.round];
    this.round++;
    this.solved = false;
    this.revealed = new Set();
    this.timeLeft = ROUND_TIME;
    this.clearCanvas();
    this.roundEl.textContent = `Round ${this.round}/${ROUNDS}`;
    this.updateHint();
    this.say(`🤖 Round ${this.round}: I'm drawing something… guess it!`, 'bot');
    this.input.focus({ preventScroll: true });

    // Turn the icon paths into canvas-space polylines and animate them.
    const S = Math.min(CW, CH) * 0.82, ox = CW / 2 - S / 2, oy = CH / 2 - S / 2;
    this.strokes = this.current.paths().map((p) => p.map(([x, y]) => [ox + x * S, oy + y * S]));
    this.strokeColor = COLORS[1 + Math.floor(Math.random() * (COLORS.length - 1))];
    this.si = 0; this.pi = 0;
    let last = performance.now();
    const step = (now) => {
      const budget = ((now - last) / 1000) * 420; // pixels per second
      last = now;
      let left = budget;
      while (left > 0 && this.si < this.strokes.length && !this.solved) {
        const s = this.strokes[this.si];
        if (this.pi >= s.length - 1) { this.si++; this.pi = 0; continue; }
        const a = s[this.pi], b = s[this.pi + 1];
        this.stroke(a, b, this.strokeColor, 6, true);
        left -= Math.hypot(b[0] - a[0], b[1] - a[1]);
        this.pi++;
      }
      if (this.si < this.strokes.length && !this.solved) this._raf = requestAnimationFrame(step);
    };
    this._raf = requestAnimationFrame(step);

    clearInterval(this.tick);
    this.tick = setInterval(() => {
      if (this.solved) return;
      this.timeLeft--;
      this.timerEl.textContent = `${this.timeLeft}s`;
      if (this.timeLeft === 35 || this.timeLeft === 18) this.revealLetter();
      if (this.timeLeft <= 10 && this.timeLeft > 0) this.ctx.audio.tone({ freq: 880, type: 'sine', dur: 0.05, vol: 0.05 });
      if (this.timeLeft <= 0) {
        clearInterval(this.tick);
        this.solved = true;
        this.ctx.audio.lose();
        this.say(`⏱ Time's up! It was "${this.current.word.toUpperCase()}".`);
        this.wordEl.textContent = this.current.word.toUpperCase();
        this.later(2600, () => this.startBotRound());
      }
    }, 1000);
    this.timerEl.textContent = `${this.timeLeft}s`;
  }

  updateHint() {
    const w = this.current.word;
    this.wordEl.textContent = [...w].map((ch, i) => (ch === ' ' ? ' ' : this.revealed.has(i) ? ch.toUpperCase() : '_')).join('');
  }

  revealLetter() {
    const hidden = [...this.current.word].map((c, i) => i).filter((i) => !this.revealed.has(i) && this.current.word[i] !== ' ');
    if (hidden.length <= 1) return;
    this.revealed.add(hidden[Math.floor(Math.random() * hidden.length)]);
    this.updateHint();
    this.say('💡 Hint: a letter was revealed.');
  }

  /* ----- Free mode ----- */
  nextFreeWord() {
    if (!this.freeWords.length) this.freeWords = shuffle([...FREE_WORDS]);
    this.secret = this.freeWords.pop();
    this.clearCanvas();
    this.wordEl.textContent = this.secret.replace(/[a-z]/g, '_');
    this.say('New secret word ready. Drawer: tap "Show secret word".');
  }

  revealSecret() {
    this.wordEl.textContent = this.secret.toUpperCase();
    this.later(2500, () => { if (this.mode === 'free' && this.secret) this.wordEl.textContent = this.secret.replace(/[a-z]/g, '_'); });
  }

  /* ----- Guessing ----- */
  guess(raw) {
    const g = norm(raw);
    if (!g) return;
    this.say(`You: ${raw.trim()}`, 'me');
    if (this.mode === 'bot') {
      if (this.solved || !this.current) return;
      const answers = [this.current.word, ...this.current.alt].map(norm);
      if (answers.includes(g)) {
        this.solved = true;
        clearInterval(this.tick);
        cancelAnimationFrame(this._raf);
        const pts = 50 + this.timeLeft * 5 - this.revealed.size * 25;
        this.score += pts;
        this.ctx.setScore(this.score);
        this.ctx.audio.chime();
        this.say(`✅ Correct! It was "${this.current.word.toUpperCase()}" (+${pts})`, 'good');
        this.wordEl.textContent = this.current.word.toUpperCase();
        // Finish drawing instantly so the player sees the full picture.
        for (let s = this.si; s < this.strokes.length; s++) {
          for (let p = s === this.si ? this.pi : 0; p < this.strokes[s].length - 1; p++) this.stroke(this.strokes[s][p], this.strokes[s][p + 1], this.strokeColor, 6, true);
        }
        this.later(2400, () => this.startBotRound());
      } else if (answers.some((a) => lev(a, g) <= (a.length > 5 ? 2 : 1))) {
        this.ctx.audio.tone({ freq: 660, type: 'triangle', dur: 0.1, vol: 0.1 });
        this.say(`🔥 "${raw.trim()}" is so close!`, 'close');
      } else {
        this.ctx.audio.hit();
      }
    } else {
      const s = norm(this.secret);
      if (g === s) {
        this.score += 100;
        this.ctx.setScore(this.score);
        this.ctx.audio.chime();
        this.say(`✅ Correct! The word was "${this.secret.toUpperCase()}" (+100)`, 'good');
        this.wordEl.textContent = this.secret.toUpperCase();
        this.later(2000, () => this.nextFreeWord());
      } else if (lev(s, g) <= (s.length > 5 ? 2 : 1)) {
        this.say(`🔥 "${raw.trim()}" is so close!`, 'close');
      }
    }
  }

  finish() {
    this.clearTimers();
    this.ctx.gameOver(this.score, {
      won: this.score > 0,
      title: this.mode === 'bot' ? 'Sketch session complete' : 'Pass & Play finished',
      message: this.mode === 'bot' ? `You scored ${this.score} points over ${ROUNDS} rounds.` : `Your team scored ${this.score} points.`,
    });
  }

  destroy() {
    this.clearTimers();
    this.ro.disconnect();
    this.root.innerHTML = '';
  }
}
