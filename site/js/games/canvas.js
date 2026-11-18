// Shared base for canvas mini-games: fixed logical resolution, responsive scaling,
// keyboard/pointer input, touch buttons, a frame loop and clean teardown.
import { Motion } from '../motion.js';

export const rand = (a, b) => a + Math.random() * (b - a);
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// Largest font size (<= max) at which `text` fits in `width`. Leaves g.font set to it.
export function fitFont(g, text, { weight = 700, family = 'Orbitron', max = 16, min = 9, width }) {
  let size = max;
  g.font = `${weight} ${size}px ${family}, sans-serif`;
  while (size > min && g.measureText(text).width > width) {
    size -= 1;
    g.font = `${weight} ${size}px ${family}, sans-serif`;
  }
  return size;
}

// Word-wraps `text` to lines no wider than `width` using the current g.font.
export function wrapText(g, text, width) {
  const words = String(text).split(' ');
  const lines = [];
  let line = '';
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (line && g.measureText(test).width > width) { lines.push(line); line = w; } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

const isTypingTarget = (t) => t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);

export function makeStars(n, W, H) {
  return Array.from({ length: n }, () => ({ x: Math.random() * W, y: Math.random() * H, z: Math.random(), tw: Math.random() * 6 }));
}

export function drawStars(g, stars, t, W, H, vy = 0, dt = 0) {
  for (const s of stars) {
    if (vy) { s.y += vy * (0.3 + s.z) * dt; if (s.y > H) { s.y -= H; s.x = Math.random() * W; } }
    const a = 0.35 + 0.65 * Math.abs(Math.sin(t * (0.5 + s.z) + s.tw));
    g.fillStyle = `rgba(220,230,255,${a * (0.4 + s.z * 0.6)})`;
    const r = 0.6 + s.z * 1.2;
    g.fillRect(s.x, s.y, r, r);
  }
}

export class Particles {
  constructor() { this.list = []; }
  burst(x, y, color, n = 18, speed = 160, life = 0.7) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = speed * (0.3 + Math.random());
      this.list.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life, max: life, color, size: 1.5 + Math.random() * 2.5 });
    }
  }
  update(dt) {
    for (const p of this.list) { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.98; p.vy *= 0.98; p.life -= dt; }
    this.list = this.list.filter((p) => p.life > 0);
  }
  draw(g) {
    g.save();
    g.globalCompositeOperation = 'lighter';
    for (const p of this.list) {
      g.globalAlpha = Math.max(0, p.life / p.max);
      g.fillStyle = p.color;
      g.beginPath(); g.arc(p.x, p.y, p.size, 0, Math.PI * 2); g.fill();
    }
    g.restore();
  }
}

export class CanvasGame {
  constructor(root, ctx, W, H) {
    this.root = root;
    this.ctx = ctx;
    this.W = W; this.H = H;
    this.keys = new Set();
    this.pointer = { x: W / 2, y: H / 2, down: false, moved: false };
    this.state = 'ready';
    this.t = 0;
    this.readyText = ['READY', 'Press Space or tap to start'];
    this.coarse = window.matchMedia('(pointer: coarse)').matches;
    this.calm = Motion.calm;
    this._listeners = [];
    this._timers = [];

    this.wrap = document.createElement('div');
    this.wrap.className = 'game-canvas-wrap';
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'game-canvas';
    this.canvas.setAttribute('tabindex', '0');
    this.wrap.appendChild(this.canvas);
    root.appendChild(this.wrap);
    this.g = this.canvas.getContext('2d');

    this.on(window, 'keydown', (e) => {
      if (isTypingTarget(e.target)) return;
      this.keys.add(e.code);
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
      if (this.state === 'ready' && (e.code === 'Space' || e.code === 'Enter')) { this.begin(); return; }
      if (this.state === 'play') this.onKey?.(e);
    });
    this.on(window, 'keyup', (e) => this.keys.delete(e.code));
    this.on(window, 'blur', () => this.keys.clear());
    this.on(this.canvas, 'pointerdown', (e) => {
      this.updatePointer(e);
      this.pointer.down = true;
      this.pointer.moved = false;
      try { this.canvas.setPointerCapture(e.pointerId); } catch { /* ignore */ }
      if (this.state === 'ready') { this.begin(); return; }
      if (this.state === 'play') this.onPointerDown?.(this.pointer, e);
    });
    this.on(this.canvas, 'pointermove', (e) => {
      this.updatePointer(e);
      this.pointer.moved = true;
      if (this.state === 'play') this.onPointerMove?.(this.pointer, e);
    });
    const up = (e) => { this.pointer.down = false; if (this.state === 'play') this.onPointerUp?.(this.pointer, e); };
    this.on(this.canvas, 'pointerup', up);
    this.on(this.canvas, 'pointercancel', up);
    this.on(this.canvas, 'contextmenu', (e) => e.preventDefault());

    this.ro = new ResizeObserver(() => this.fit());
    this.ro.observe(this.wrap);
    this.fit();

    this._last = performance.now();
    this._raf = requestAnimationFrame((now) => this._loop(now));
  }

  on(target, ev, fn, opts) { target.addEventListener(ev, fn, opts); this._listeners.push([target, ev, fn, opts]); }
  after(ms, fn) { const id = setTimeout(fn, ms); this._timers.push(id); return id; }

  updatePointer(e) {
    const r = this.canvas.getBoundingClientRect();
    this.pointer.x = ((e.clientX - r.left) / r.width) * this.W;
    this.pointer.y = ((e.clientY - r.top) / r.height) * this.H;
  }

  fit() {
    const r = this.wrap.getBoundingClientRect();
    const availW = Math.max(50, r.width - 16), availH = Math.max(50, r.height - 16);
    const s = Math.min(availW / this.W, availH / this.H);
    const w = Math.floor(this.W * s), h = Math.floor(this.H * s);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.max(1, Math.round(w * dpr));
    this.canvas.height = Math.max(1, Math.round(h * dpr));
    this.scale = this.canvas.width / this.W;
  }

  _loop(now) {
    this._raf = requestAnimationFrame((n) => this._loop(n));
    const dt = Math.min(0.05, (now - this._last) / 1000);
    this._last = now;
    this.t += dt;
    if (this.state === 'play') this.update(dt);
    else this.idle?.(dt);
    const g = this.g;
    g.setTransform(this.scale, 0, 0, this.scale, 0, 0);
    this.draw(g, dt);
    if (this.state === 'ready') this.drawReady(g);
  }

  drawReady(g) {
    const [title, ...lines] = this.readyText;
    const { W, H } = this;
    const maxW = W * 0.88;
    g.save();
    g.fillStyle = 'rgba(5,3,15,0.66)';
    g.fillRect(0, 0, W, H);
    g.textAlign = 'center';
    g.textBaseline = 'middle';

    // Title: largest size that fits in at most two lines.
    let size = Math.round(W / 12), titleLines = [title];
    for (; size >= 14; size--) {
      g.font = `900 ${size}px Orbitron, sans-serif`;
      titleLines = wrapText(g, title, maxW);
      if (titleLines.length <= 2 && titleLines.every((l) => g.measureText(l).width <= maxW)) break;
    }
    const titleLH = size * 1.12;

    const bodySize = Math.max(13, Math.round(W / 40));
    g.font = `500 ${bodySize}px Inter, sans-serif`;
    const body = lines.flatMap((l) => wrapText(g, l, maxW));
    const bodyLH = bodySize * 1.5;

    const prompt = this.coarse ? 'TAP TO START' : 'TAP OR PRESS SPACE TO START';
    const promptSize = fitFont(g, prompt, { weight: 700, max: Math.max(13, Math.round(W / 34)), width: maxW });

    const total = titleLines.length * titleLH + 18 + body.length * bodyLH + 22 + promptSize;
    let y = H / 2 - total / 2 + titleLH / 2;

    g.font = `900 ${size}px Orbitron, sans-serif`;
    g.shadowColor = '#22d3ee'; g.shadowBlur = 18;
    g.fillStyle = '#fff';
    titleLines.forEach((l) => { g.fillText(l, W / 2, y); y += titleLH; });
    g.shadowBlur = 0;
    y += 18 - titleLH / 2 + bodyLH / 2;
    g.font = `500 ${bodySize}px Inter, sans-serif`;
    g.fillStyle = '#cbd5e1';
    body.forEach((l) => { g.fillText(l, W / 2, y); y += bodyLH; });
    y += 22 - bodyLH / 2 + promptSize / 2;
    const pulse = 0.5 + 0.5 * Math.sin(this.t * 4);
    g.fillStyle = `rgba(34,211,238,${0.5 + pulse * 0.5})`;
    g.font = `700 ${promptSize}px Orbitron, sans-serif`;
    g.fillText(prompt, W / 2, y);
    g.restore();
  }

  begin() {
    if (this.state !== 'ready') return;
    this.state = 'play';
    this.ctx.audio.click();
    this.canvas.focus({ preventScroll: true });
    this.onBegin?.();
  }

  end(score, opts) {
    if (this.state === 'over') return;
    this.state = 'over';
    this.keys.clear();
    this.ctx.gameOver(score, opts);
  }

  addTouchButtons(defs) {
    const bar = document.createElement('div');
    bar.className = 'touch-controls';
    defs.forEach(({ label, code, aria }) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.innerHTML = label;
      b.setAttribute('aria-label', aria || code);
      const press = (e) => {
        e.preventDefault();
        b.classList.add('held');
        if (this.state === 'ready') this.begin();
        this.keys.add(code);
        if (this.state === 'play') this.onKey?.({ code, key: code, preventDefault() {} });
      };
      const release = (e) => { e.preventDefault(); b.classList.remove('held'); this.keys.delete(code); };
      b.addEventListener('pointerdown', press);
      b.addEventListener('pointerup', release);
      b.addEventListener('pointerleave', release);
      b.addEventListener('pointercancel', release);
      b.addEventListener('contextmenu', (e) => e.preventDefault());
      bar.appendChild(b);
    });
    this.root.appendChild(bar);
    return bar;
  }

  text(g, str, x, y, { size = 16, color = '#fff', align = 'left', weight = 700, font = 'Orbitron', glow = null, maxWidth = this.W - 24 } = {}) {
    g.save();
    const fitted = fitFont(g, str, { weight, family: font, max: size, width: maxWidth });
    g.font = `${weight} ${fitted}px ${font}, sans-serif`;
    g.textAlign = align;
    g.textBaseline = 'middle';
    if (glow) { g.shadowColor = glow; g.shadowBlur = 12; }
    g.fillStyle = color;
    g.fillText(str, x, y);
    g.restore();
  }

  destroy() {
    cancelAnimationFrame(this._raf);
    this._listeners.forEach(([t, e, f, o]) => t.removeEventListener(e, f, o));
    this._timers.forEach(clearTimeout);
    this.ro.disconnect();
    this.onDestroy?.();
    this.root.innerHTML = '';
  }
}
