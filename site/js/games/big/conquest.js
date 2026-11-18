// Galactic Conquest — real-time planet-capture strategy with a 12-sector campaign.
import { icon } from '../../icons.js';

const FACTIONS = [
  { name: 'You', color: '#3b82f6', light: '#93c5fd' },
  { name: 'Crimson Dominion', color: '#ef4444', light: '#fca5a5', persona: 'aggressive' },
  { name: 'Amber Syndicate', color: '#f59e0b', light: '#fcd34d', persona: 'expansionist' },
  { name: 'Verdant Hive', color: '#22c55e', light: '#86efac', persona: 'defensive' },
];
const NEUTRAL = { color: '#94a3b8', light: '#cbd5e1' };

const SECTORS = [
  { name: 'Proxima Drift', ais: 1, planets: 10, level: 0, specials: [], desc: 'A lone rival. Learn to launch fleets and capture worlds.' },
  { name: 'Kepler Reach', ais: 1, planets: 12, level: 0, specials: ['forge'], desc: 'Forge worlds build ships 70% faster.' },
  { name: 'Vega Expanse', ais: 1, planets: 14, level: 1, specials: ['forge', 'fortress'], desc: 'Fortress worlds defend with 1.6× strength.' },
  { name: 'Orion Gate', ais: 2, planets: 15, level: 1, specials: ['forge', 'relay'], desc: 'Two empires. Relay worlds launch faster fleets.' },
  { name: 'Cygnus Rift', ais: 2, planets: 16, level: 1, specials: ['fortress', 'relay', 'forge'], desc: 'Let your rivals bleed each other dry.' },
  { name: 'Andromeda Shoals', ais: 2, planets: 17, level: 2, specials: ['forge', 'forge', 'relay'], desc: 'Rich forges sit between you and your foes.' },
  { name: 'Sirius Crown', ais: 2, planets: 18, level: 2, specials: ['fortress', 'fortress', 'forge', 'relay'], desc: 'Heavily fortified neutral systems.' },
  { name: 'Draco Abyss', ais: 3, planets: 18, level: 2, specials: ['forge', 'relay', 'fortress'], desc: 'Three empires. Strike while they fight.' },
  { name: 'Lyra Nexus', ais: 3, planets: 20, level: 3, specials: ['forge', 'forge', 'relay', 'fortress'], desc: 'Smarter rivals that defend their borders.' },
  { name: 'Perseus Arm', ais: 3, planets: 22, level: 3, specials: ['forge', 'relay', 'relay', 'fortress', 'fortress'], desc: 'A sprawling battlefield. Control the relays.' },
  { name: 'Centauri Bastion', ais: 3, planets: 22, level: 4, specials: ['fortress', 'fortress', 'fortress', 'forge', 'relay'], desc: 'Veteran empires with a head start.', aiBonus: 20 },
  { name: 'Galactic Core', ais: 3, planets: 24, level: 4, specials: ['forge', 'forge', 'fortress', 'fortress', 'relay', 'relay'], desc: 'The final battle for the galaxy.', aiBonus: 35 },
];
const AI_LEVELS = [
  { think: 3.4, reserve: 1.3, accuracy: 0.6 },
  { think: 2.6, reserve: 1.1, accuracy: 0.75 },
  { think: 2.0, reserve: 0.95, accuracy: 0.85 },
  { think: 1.5, reserve: 0.85, accuracy: 0.93 },
  { think: 1.15, reserve: 0.75, accuracy: 1 },
];
const FLEET_SPEED = 80;
const rand = (a, b) => a + Math.random() * (b - a);
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

function seeded(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/* ------------------------------------------------------------------ planet art */
const LOOKS = {
  terran: { base: ['#1e3a8a', '#1d4ed8', '#2f6f4f', '#3f7d3a'], blots: ['#2f6f4f', '#4d7c3a', '#8b7d5a', '#e5e7eb'] },
  rocky: { base: ['#57534e', '#78716c'], blots: ['#44403c', '#a8a29e', '#292524'] },
  desert: { base: ['#b45309', '#d97706'], blots: ['#92400e', '#fbbf24', '#78350f'] },
  ice: { base: ['#7dd3fc', '#bae6fd'], blots: ['#e0f2fe', '#38bdf8', '#f8fafc'] },
  gas: { base: ['#c2a173', '#e7d3a7'], bands: ['#8a6a43', '#f3e6c4', '#a77b4a'] },
  lava: { base: ['#3f0d0d', '#5a1010'], cracks: '#ff7a1a' },
  metal: { base: ['#475569', '#64748b'], blots: ['#94a3b8', '#334155'] },
};

function planetSprite(r, look, seed) {
  const R = Math.ceil(r * 2 + 8);
  const c = document.createElement('canvas');
  const scale = 2;
  c.width = c.height = R * scale;
  const g = c.getContext('2d');
  g.scale(scale, scale);
  const cx = R / 2, cy = R / 2;
  const rnd = seeded(seed);
  const L = LOOKS[look];
  g.save();
  g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.clip();
  const base = g.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
  base.addColorStop(0, L.base[0]); base.addColorStop(1, L.base[1] || L.base[0]);
  g.fillStyle = base; g.fillRect(cx - r, cy - r, r * 2, r * 2);
  if (L.bands) {
    for (let y = -r; y < r; y += 2) {
      g.fillStyle = L.bands[Math.floor((Math.sin(y * 0.35 + seed) * 0.5 + 0.5) * L.bands.length) % L.bands.length];
      g.globalAlpha = 0.55;
      g.fillRect(cx - r, cy + y + Math.sin(y * 0.2) * 1.5, r * 2, 2);
    }
    g.globalAlpha = 1;
  }
  if (L.blots) {
    for (let i = 0; i < r * 1.2; i++) {
      g.fillStyle = L.blots[Math.floor(rnd() * L.blots.length)];
      g.globalAlpha = 0.25 + rnd() * 0.45;
      g.beginPath();
      g.ellipse(cx + (rnd() - 0.5) * r * 2, cy + (rnd() - 0.5) * r * 2, rnd() * r * 0.45 + 1, rnd() * r * 0.25 + 1, rnd() * 3, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;
  }
  if (L.cracks) {
    g.strokeStyle = L.cracks; g.lineWidth = 1.2; g.shadowColor = L.cracks; g.shadowBlur = 6;
    for (let i = 0; i < 9; i++) {
      g.beginPath();
      let x = cx + (rnd() - 0.5) * r * 1.6, y = cy + (rnd() - 0.5) * r * 1.6;
      g.moveTo(x, y);
      for (let k = 0; k < 5; k++) { x += (rnd() - 0.5) * r * 0.5; y += (rnd() - 0.5) * r * 0.5; g.lineTo(x, y); }
      g.stroke();
    }
    g.shadowBlur = 0;
  }
  // Lighting: day side top-left, night side bottom-right, atmosphere rim
  const shade = g.createRadialGradient(cx - r * 0.45, cy - r * 0.45, r * 0.1, cx, cy, r * 1.25);
  shade.addColorStop(0, 'rgba(255,255,255,0.18)'); shade.addColorStop(0.45, 'rgba(0,0,0,0)'); shade.addColorStop(1, 'rgba(0,0,0,0.85)');
  g.fillStyle = shade; g.fillRect(cx - r, cy - r, r * 2, r * 2);
  g.restore();
  g.strokeStyle = look === 'lava' ? 'rgba(255,140,60,0.5)' : 'rgba(170,210,255,0.35)';
  g.lineWidth = 1.2;
  g.beginPath(); g.arc(cx, cy, r, Math.PI * 0.95, Math.PI * 1.75); g.stroke();
  return { canvas: c, size: R };
}

// Small vector badges for special worlds (drawn, not text, so they never render as emoji).
function drawBadge(g, type, x, y) {
  g.save();
  g.translate(x, y);
  g.beginPath();
  if (type === 'forge') { // flame
    g.moveTo(0, -6); g.bezierCurveTo(4, -2, 5, 2, 0, 6); g.bezierCurveTo(-5, 2, -4, -2, -1, -3); g.bezierCurveTo(-1, 0, 1, 0, 0, -6);
    g.fill();
  } else if (type === 'fortress') { // shield
    g.moveTo(0, -6); g.lineTo(5, -4); g.lineTo(4.4, 1.5); g.quadraticCurveTo(3, 4.5, 0, 6); g.quadraticCurveTo(-3, 4.5, -4.4, 1.5); g.lineTo(-5, -4); g.closePath();
    g.fill();
  } else { // relay: double chevron
    g.lineWidth = 1.8; g.lineCap = 'round'; g.lineJoin = 'round';
    g.moveTo(-5, -4); g.lineTo(-1, 0); g.lineTo(-5, 4); g.moveTo(0, -4); g.lineTo(4, 0); g.lineTo(0, 4);
    g.stroke();
  }
  g.restore();
}

/* ------------------------------------------------------------------ the game */
export default class Conquest {
  constructor(root, ctx) {
    this.root = root;
    this.ctx = ctx;
    this.save = Object.assign({ cleared: {}, scores: {} }, ctx.storage.load() || {});
    this.listeners = [];
    this.timers = [];
    this.fraction = 0.5;
    this.speed = 1;
    this.phase = 'campaign';
    this.selection = new Set();
    this.effects = [];

    root.innerHTML = `
      <div class="cq-root">
        <canvas class="cq-canvas"></canvas>
        <div class="cq-top">
          <div class="cq-title"><span class="cq-label" data-sector-label>Sector</span><b data-sector-name></b></div>
          <div class="cq-power" data-power></div>
          <div class="cq-controls">
            <span class="cq-time" data-time>0:00</span>
            <button type="button" class="btn-mini" data-speed title="Game speed">1×</button>
            <button type="button" class="btn-mini" data-pause title="Pause">${icon('pause')}</button>
          </div>
        </div>
        <div class="cq-bottom">
          <div class="seg" data-fractions>
            ${[0.25, 0.5, 0.75, 1].map((f, i) => `<button type="button" data-frac="${f}" title="Send ${f * 100}% (key ${i + 1})">${f * 100}%</button>`).join('')}
          </div>
          <button type="button" class="btn-mini" data-all>${icon('radar')}<span>Select all</span></button>
          <span class="cq-hint" data-hint></span>
        </div>
      </div>`;
    this.$ = (s) => root.querySelector(s);
    this.canvas = this.$('.cq-canvas');
    this.g = this.canvas.getContext('2d');

    this.bindInput();
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(root);
    this.resize();
    this.setFraction(0.5);
    this.showCampaign();
    this.last = performance.now();
    this.raf = requestAnimationFrame((t) => this.loop(t));
  }

  on(t, e, f, o) { t.addEventListener(e, f, o); this.listeners.push([t, e, f, o]); }
  later(ms, fn) { const id = setTimeout(fn, ms); this.timers.push(id); return id; }

  /* ---------- screens ---------- */
  overlay(html, wide = false) {
    this.closeOverlay();
    const el = document.createElement('div');
    el.className = 'bg-overlay';
    el.innerHTML = `<div class="bg-panel ${wide ? 'cq-wide' : ''}">${html}</div>`;
    this.$('.cq-root').appendChild(el);
    return el;
  }
  closeOverlay() { this.root.querySelector('.bg-overlay')?.remove(); }

  unlocked(i) { return i === 0 || this.save.cleared[i - 1] !== undefined; }

  showCampaign() {
    this.phase = 'campaign';
    this.planets = this.planets || [];
    const total = Object.values(this.save.scores).reduce((a, b) => a + b, 0);
    const stars = Object.values(this.save.cleared).reduce((a, b) => a + b, 0);
    const el = this.overlay(`
      <div class="flex items-end justify-between gap-3 flex-wrap">
        <div><p class="bg-kicker">Campaign</p><h2 class="mt-2">Galactic Conquest</h2></div>
        <div class="text-right text-xs text-slate-400">${stars} / 36 ★ · Score <b class="text-white">${total.toLocaleString()}</b></div>
      </div>
      <p class="text-sm text-slate-300 mt-3">Capture every world in a sector to conquer it. Faster victories earn more stars.</p>
      <details class="cq-how mt-3"><summary>How to play</summary>
        <ul class="sf-controls mt-2">
          <li><b>Select</b> one of your blue worlds, then <b>tap a target</b> to send a fleet (or drag from your world to the target).</li>
          <li>The <b>%</b> buttons (keys 1–4) choose how much of each selected garrison to send.</li>
          <li>Shift-click or <b>Select all</b> (key A) to attack from many worlds at once. Drag on empty space to box-select.</li>
          <li>Worlds produce ships over time; bigger worlds produce faster. Grey worlds are neutral and don't grow.</li>
          <li><b style="color:#fb923c">Forge</b> worlds produce 70% faster, <b style="color:#cbd5e1">Fortress</b> worlds defend at 1.6×, <b style="color:#67e8f9">Relay</b> worlds launch faster fleets.</li>
        </ul>
      </details>
      <div class="cq-sectors mt-4">
        ${SECTORS.map((s, i) => {
          const open = this.unlocked(i), st = this.save.cleared[i];
          return `<button type="button" class="cq-sector${open ? '' : ' locked'}${st !== undefined ? ' done' : ''}" data-sector="${i}" ${open ? '' : 'disabled'}>
            <span class="cq-num">${String(i + 1).padStart(2, '0')}</span>
            <span class="cq-sname">${s.name}</span>
            <span class="cq-sdesc">${open ? s.desc : 'Conquer the previous sector to unlock.'}</span>
            <span class="cq-meta"><span class="cq-foes">${Array.from({ length: s.ais }, (_, k) => `<i style="background:${FACTIONS[k + 1].color}"></i>`).join('')}</span>
              <span class="cq-stars">${[1, 2, 3].map((k) => `<i class="${st >= k ? 'on' : ''}">★</i>`).join('')}</span></span>
          </button>`;
        }).join('')}
      </div>`, true);
    el.querySelectorAll('[data-sector]').forEach((b) => b.addEventListener('click', () => { this.ctx.audio.click(); this.startSector(Number(b.dataset.sector)); }));
  }

  /* ---------- map generation ---------- */
  startSector(i) {
    this.closeOverlay();
    const S = SECTORS[i];
    this.sectorIndex = i;
    this.sector = S;
    const landscape = this.view.w >= this.view.h;
    this.W = landscape ? 1240 : 780;
    this.H = landscape ? 780 : 1240;
    this.fit();
    const rnd = seeded(1000 + i * 77);
    const planets = [];
    const margin = 60;
    const tryPlace = (r) => {
      for (let k = 0; k < 400; k++) {
        const p = { x: margin + rnd() * (this.W - margin * 2), y: margin + 40 + rnd() * (this.H - margin * 2 - 80), r };
        if (planets.every((q) => dist(p, q) > p.r + q.r + 42)) return p;
      }
      return null;
    };
    // Home worlds: spread around the map, player opposite the main rival
    const corners = landscape
      ? [[0.1, 0.75], [0.9, 0.25], [0.9, 0.8], [0.12, 0.2]]
      : [[0.25, 0.9], [0.75, 0.1], [0.85, 0.75], [0.15, 0.25]];
    for (let f = 0; f <= S.ais; f++) {
      const [fx, fy] = corners[f];
      planets.push({ x: fx * this.W, y: fy * this.H, r: 38, owner: f, ships: f === 0 ? 40 : 40 + (S.aiBonus || 0), type: 'normal', look: f === 0 ? 'terran' : ['desert', 'rocky', 'ice'][f - 1] });
    }
    const looks = ['rocky', 'desert', 'ice', 'gas', 'terran', 'rocky'];
    while (planets.length < S.planets) {
      const r = 16 + Math.pow(rnd(), 1.6) * 26;
      const p = tryPlace(r);
      if (!p) break;
      Object.assign(p, { owner: -1, ships: Math.round(4 + r * 0.45 + rnd() * (6 + i * 1.5)), type: 'normal', look: looks[Math.floor(rnd() * looks.length)] });
      planets.push(p);
    }
    // Special worlds: prefer contested middle positions
    const neutrals = planets.filter((p) => p.owner === -1).sort((a, b) => Math.abs(a.x - this.W / 2) + Math.abs(a.y - this.H / 2) - (Math.abs(b.x - this.W / 2) + Math.abs(b.y - this.H / 2)));
    S.specials.forEach((type, k) => {
      const p = neutrals[k];
      if (!p) return;
      p.type = type;
      p.look = type === 'forge' ? 'lava' : type === 'fortress' ? 'metal' : 'ice';
      p.ships = Math.round(p.ships * (type === 'fortress' ? 1.3 : 1.15));
    });
    planets.forEach((p, k) => {
      p.id = k;
      p.prod = p.r * 0.042 * (p.type === 'forge' ? 1.7 : 1);
      p.cap = Math.round(p.r * 6);
      p.sprite = planetSprite(p.r, p.look, k * 13 + i);
      p.pulse = 0;
    });
    this.planets = planets;
    this.fleets = [];
    this.effects = [];
    this.selection = new Set();
    this.time = 0;
    this.speed = 1;
    this.$('[data-speed]').textContent = '1×';
    this.ais = Array.from({ length: S.ais }, (_, k) => ({ id: k + 1, persona: FACTIONS[k + 1].persona, cfg: AI_LEVELS[S.level], cd: rand(1.5, 3) }));
    this.par = 50 + S.planets * 6 + S.ais * 30;
    this.bg = this.makeBackground();
    this.$('[data-sector-label]').textContent = `Sector ${String(i + 1).padStart(2, '0')}`;
    this.$('[data-sector-name]').textContent = S.name;
    this.phase = 'play';
    this.hint(this.coarse() ? 'Tap your world, then tap a target' : 'Click your world, then click a target · or drag');
    this.ctx.setScore(0);
    this.ctx.audio.whoosh();
  }

  makeBackground() {
    const c = document.createElement('canvas');
    c.width = this.W; c.height = this.H;
    const g = c.getContext('2d');
    g.fillStyle = '#03040a'; g.fillRect(0, 0, this.W, this.H);
    const rnd = seeded(this.sectorIndex * 991 + 5);
    const nebs = [['rgba(99,102,241,0.10)', 0.3, 0.3], ['rgba(190,60,90,0.07)', 0.75, 0.65], ['rgba(56,189,248,0.06)', 0.6, 0.2]];
    nebs.forEach(([col, fx, fy]) => {
      const x = fx * this.W, y = fy * this.H, R = Math.max(this.W, this.H) * 0.5;
      const grd = g.createRadialGradient(x, y, 0, x, y, R);
      grd.addColorStop(0, col); grd.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grd; g.fillRect(0, 0, this.W, this.H);
    });
    for (let i = 0; i < 900; i++) {
      const b = Math.pow(rnd(), 3);
      g.fillStyle = ['#ffffff', '#cfe0ff', '#ffe8c8', '#ffd2b0'][Math.floor(rnd() * 4)];
      g.globalAlpha = 0.25 + b * 0.75;
      g.beginPath(); g.arc(rnd() * this.W, rnd() * this.H, 0.4 + b * 1.3, 0, Math.PI * 2); g.fill();
    }
    g.globalAlpha = 1;
    return c;
  }

  /* ---------- input ---------- */
  coarse() { return window.matchMedia('(pointer: coarse)').matches; }

  bindInput() {
    const c = this.canvas;
    this.on(c, 'pointerdown', (e) => this.pointerDown(e));
    this.on(c, 'pointermove', (e) => this.pointerMove(e));
    this.on(c, 'pointerup', (e) => this.pointerUp(e));
    this.on(c, 'pointercancel', () => { this.drag = null; });
    this.on(c, 'dblclick', (e) => {
      const p = this.planetAt(this.toWorld(e));
      if (p && p.owner === 0) this.selectAll();
    });
    this.on(window, 'keydown', (e) => {
      if (this.phase !== 'play' && this.phase !== 'paused') return;
      const n = Number(e.key);
      if (n >= 1 && n <= 4) this.setFraction([0.25, 0.5, 0.75, 1][n - 1]);
      if (e.code === 'KeyA') this.selectAll();
      if (e.code === 'Space') { e.preventDefault(); this.phase === 'play' ? this.pause() : this.resume(); }
    });
    this.root.querySelectorAll('[data-frac]').forEach((b) => this.on(b, 'click', () => this.setFraction(Number(b.dataset.frac))));
    this.on(this.$('[data-all]'), 'click', () => this.selectAll());
    this.on(this.$('[data-speed]'), 'click', () => { this.speed = this.speed === 1 ? 2 : 1; this.$('[data-speed]').textContent = `${this.speed}×`; });
    this.on(this.$('[data-pause]'), 'click', () => { if (this.phase === 'play') this.pause(); });
  }

  toWorld(e) {
    const r = this.canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left - this.ox) / this.scale, y: (e.clientY - r.top - this.oy) / this.scale };
  }

  planetAt(pt, slop = 14) {
    let best = null, bd = Infinity;
    for (const p of this.planets) {
      const d = dist(pt, p);
      if (d < p.r + slop / this.scale * 1.5 + 6 && d < bd) { bd = d; best = p; }
    }
    return best;
  }

  pointerDown(e) {
    if (this.phase !== 'play') return;
    const pt = this.toWorld(e);
    const p = this.planetAt(pt);
    try { this.canvas.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    this.drag = { start: pt, cur: pt, planet: p, moved: false, box: !p && e.pointerType === 'mouse', shift: e.shiftKey };
  }

  pointerMove(e) {
    const pt = this.toWorld(e);
    this.hover = this.planetAt(pt);
    if (!this.drag) return;
    this.drag.cur = pt;
    if (dist(pt, this.drag.start) > 10 / this.scale) this.drag.moved = true;
  }

  pointerUp(e) {
    const d = this.drag;
    this.drag = null;
    if (!d || this.phase !== 'play') return;
    const pt = this.toWorld(e);
    const target = this.planetAt(pt);
    if (d.box && d.moved) {
      // Box select own planets
      const x1 = Math.min(d.start.x, pt.x), x2 = Math.max(d.start.x, pt.x), y1 = Math.min(d.start.y, pt.y), y2 = Math.max(d.start.y, pt.y);
      if (!d.shift) this.selection.clear();
      this.planets.forEach((p) => { if (p.owner === 0 && p.x > x1 && p.x < x2 && p.y > y1 && p.y < y2) this.selection.add(p.id); });
      this.ctx.audio.hover();
      return;
    }
    if (d.moved && d.planet && d.planet.owner === 0) {
      // Drag from own planet to a target
      if (!this.selection.has(d.planet.id)) { this.selection.clear(); this.selection.add(d.planet.id); }
      if (target && target !== d.planet) this.send(target);
      return;
    }
    if (d.moved) return;
    // Tap
    if (!target) { this.selection.clear(); return; }
    if (target.owner === 0 && (d.shift || this.selection.size === 0)) { this.selection.add(target.id); this.ctx.audio.hover(); return; }
    if (this.selection.has(target.id)) { this.selection.delete(target.id); return; }
    if (this.selection.size) { this.send(target); return; }
    if (target.owner === 0) this.selection.add(target.id);
  }

  setFraction(f) {
    this.fraction = f;
    this.root.querySelectorAll('[data-frac]').forEach((b) => b.classList.toggle('active', Number(b.dataset.frac) === f));
  }

  selectAll() {
    this.selection = new Set(this.planets.filter((p) => p.owner === 0).map((p) => p.id));
    this.ctx.audio.hover();
  }

  hint(t) { this.$('[data-hint]').textContent = t; }

  /* ---------- fleets ---------- */
  send(target, owner = 0, sources = null, fraction = this.fraction) {
    const from = sources || [...this.selection].map((id) => this.planets[id]).filter((p) => p.owner === owner);
    let sent = 0;
    for (const src of from) {
      if (src === target) continue;
      const n = Math.floor(src.ships * fraction);
      if (n < 1) continue;
      src.ships -= n;
      sent += n;
      this.launch(src, target, n, owner);
    }
    if (owner === 0) {
      if (sent) this.ctx.audio.tone({ freq: 520, type: 'triangle', dur: 0.12, vol: 0.1, slide: 260 });
      else this.ctx.audio.error();
    }
    return sent;
  }

  launch(src, target, n, owner) {
    const ang = Math.atan2(target.y - src.y, target.x - src.x);
    const speed = FLEET_SPEED * (src.type === 'relay' ? 1.6 : 1);
    const fleet = {
      owner, target, ships: n, speed,
      x: src.x + Math.cos(ang) * (src.r + 4), y: src.y + Math.sin(ang) * (src.r + 4),
      spread: Math.min(18, 4 + Math.sqrt(n) * 1.6),
      units: Array.from({ length: Math.min(22, Math.ceil(Math.sqrt(n) * 2)) }, () => ({ ox: rand(-1, 1), oy: rand(-1, 1), ph: rand(0, 6) })),
    };
    this.fleets.push(fleet);
  }

  arrive(f) {
    const t = f.target;
    if (t.owner === f.owner) { t.ships += f.ships; return; }
    const def = t.type === 'fortress' ? 1.6 : 1;
    const defense = t.ships * def;
    if (f.ships > defense) {
      const prev = t.owner;
      t.owner = f.owner;
      t.ships = f.ships - defense;
      this.effects.push({ type: 'capture', x: t.x, y: t.y, r: t.r, t: 0, color: FACTIONS[f.owner].color });
      if (f.owner === 0) { this.ctx.audio.chime(); this.ctx.setScore(this.planets.filter((p) => p.owner === 0).length); }
      else if (prev === 0) this.ctx.audio.lose();
      this.selection.delete(t.id);
    } else {
      t.ships = (defense - f.ships) / def;
      this.effects.push({ type: 'hit', x: t.x, y: t.y, r: t.r, t: 0, color: FACTIONS[f.owner].color });
      if (f.owner === 0 || t.owner === 0) this.ctx.audio.hit();
    }
  }

  /* ---------- AI ---------- */
  thinkAI(ai, dt) {
    ai.cd -= dt;
    if (ai.cd > 0) return;
    ai.cd = ai.cfg.think * rand(0.75, 1.25);
    const mine = this.planets.filter((p) => p.owner === ai.id);
    if (!mine.length) return;
    const incoming = new Map();
    for (const f of this.fleets) {
      const sign = f.owner === f.target.owner ? -1 : 1;
      if (f.target.owner === ai.id) incoming.set(f.target.id, (incoming.get(f.target.id) || 0) + sign * f.ships);
    }
    const reserveOf = (p) => p.r * 0.35 * ai.cfg.reserve * (ai.persona === 'defensive' ? 1.5 : 1) + Math.max(0, incoming.get(p.id) || 0);
    const surplus = (p) => Math.max(0, p.ships - reserveOf(p));

    // 1) Defend a world that is about to fall
    for (const p of mine) {
      const threat = incoming.get(p.id) || 0;
      const def = p.type === 'fortress' ? 1.6 : 1;
      if (threat > p.ships * def) {
        const helpers = mine.filter((q) => q !== p && surplus(q) > 3).sort((a, b) => dist(a, p) - dist(b, p)).slice(0, 2);
        if (helpers.length) { this.send(p, ai.id, helpers, 0.6); return; }
      }
    }
    // 2) Attack / expand: score every foreign world
    let best = null, bestScore = -Infinity;
    for (const t of this.planets) {
      if (t.owner === ai.id) continue;
      const near = mine.reduce((m, p) => Math.min(m, dist(p, t)), Infinity);
      const travel = near / FLEET_SPEED;
      const def = t.type === 'fortress' ? 1.6 : 1;
      const growth = t.owner >= 0 ? Math.min(t.cap, t.ships + t.prod * travel) : t.ships;
      const need = growth * def * 1.12 + 2;
      let value = t.prod * 10 + (t.type === 'forge' ? 6 : t.type === 'relay' ? 3 : 0);
      if (ai.persona === 'aggressive' && t.owner >= 0) value *= 1.6;
      if (ai.persona === 'expansionist' && t.owner === -1) value *= 1.5;
      if (t.owner === 0) value *= 1.15;
      let score = value / (need + 6) / (near / 260 + 1);
      if (Math.random() > ai.cfg.accuracy) score *= rand(0.3, 1.6);
      if (score > bestScore) { bestScore = score; best = { t, need }; }
    }
    if (!best) return;
    const sources = mine.filter((p) => surplus(p) > 2).sort((a, b) => dist(a, best.t) - dist(b, best.t)).slice(0, 4);
    const available = sources.reduce((s, p) => s + surplus(p), 0);
    if (available < best.need) return;
    let remaining = best.need;
    for (const src of sources) {
      if (remaining <= 0) break;
      const n = Math.min(Math.floor(surplus(src)), Math.ceil(remaining));
      if (n < 1) continue;
      src.ships -= n;
      remaining -= n;
      this.launch(src, best.t, n, ai.id);
    }
  }

  /* ---------- loop ---------- */
  loop(now) {
    this.raf = requestAnimationFrame((t) => this.loop(t));
    const rdt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.clock = (this.clock || 0) + rdt;
    if (this.phase === 'play') this.update(rdt * this.speed);
    this.draw(rdt);
  }

  update(dt) {
    this.time += dt;
    for (const p of this.planets) {
      if (p.owner >= 0 && p.ships < p.cap) p.ships = Math.min(p.cap, p.ships + p.prod * dt);
    }
    for (const f of this.fleets) {
      const dx = f.target.x - f.x, dy = f.target.y - f.y;
      const d = Math.hypot(dx, dy);
      if (d < f.target.r + 2) { f.done = true; this.arrive(f); continue; }
      const step = Math.min(d, f.speed * dt);
      f.x += dx / d * step; f.y += dy / d * step;
      f.ang = Math.atan2(dy, dx);
    }
    this.fleets = this.fleets.filter((f) => !f.done);
    for (const ai of this.ais) this.thinkAI(ai, dt);
    this.checkEnd();
  }

  strength() {
    const s = new Array(FACTIONS.length).fill(0);
    for (const p of this.planets) if (p.owner >= 0) s[p.owner] += p.ships;
    for (const f of this.fleets) s[f.owner] += f.ships;
    return s;
  }

  checkEnd() {
    const s = this.strength();
    const alive = (o) => this.planets.some((p) => p.owner === o) || this.fleets.some((f) => f.owner === o);
    if (!alive(0)) return this.endSector(false);
    const foes = this.ais.filter((a) => alive(a.id));
    if (!foes.length) this.endSector(true);
    this.power = s;
  }

  endSector(won) {
    this.phase = 'result';
    this.selection.clear();
    const i = this.sectorIndex;
    if (!won) {
      this.ctx.audio.lose();
      const el = this.overlay(`
        <p class="bg-kicker" style="color:#fb7185">Defeat</p>
        <h2 class="mt-2">${this.sector.name} has fallen</h2>
        <p class="text-sm text-slate-300 mt-3">Your last world was captured after ${this.fmtTime(this.time)}. Regroup and try a different opening: grab nearby neutral worlds early, and never leave your home world empty.</p>
        <div class="bg-row mt-5"><button type="button" class="btn-neon flex-1" data-retry>Retry sector</button><button type="button" class="btn-ghost" data-map>Campaign map</button></div>`);
      el.querySelector('[data-retry]').addEventListener('click', () => this.startSector(i));
      el.querySelector('[data-map]').addEventListener('click', () => this.showCampaign());
      return;
    }
    const stars = this.time <= this.par ? 3 : this.time <= this.par * 1.6 ? 2 : 1;
    const score = Math.round(1000 + i * 250 + stars * 400 + Math.max(0, this.par * 2 - this.time) * 5);
    const firstClear = this.save.cleared[i] === undefined;
    this.save.cleared[i] = Math.max(this.save.cleared[i] || 0, stars);
    this.save.scores[i] = Math.max(this.save.scores[i] || 0, score);
    this.ctx.storage.save(this.save);
    const total = Object.values(this.save.scores).reduce((a, b) => a + b, 0);
    this.ctx.reportScore(total);
    this.ctx.setScore(total);
    this.ctx.awardXP(firstClear ? 30 + i * 6 : 8, firstClear ? `Sector ${i + 1} conquered` : null);
    this.ctx.audio.chime();
    if (i === SECTORS.length - 1 && firstClear) {
      this.later(600, () => this.ctx.gameOver(total, { won: true, title: 'Galaxy conquered!', message: `All 12 sectors are yours. Campaign score ${total.toLocaleString()}.` }));
      return;
    }
    const el = this.overlay(`
      <p class="bg-kicker" style="color:#4ade80">Victory</p>
      <h2 class="mt-2">${this.sector.name} conquered</h2>
      <div class="cq-result-stars">${[1, 2, 3].map((k) => `<i class="${stars >= k ? 'on' : ''}" style="animation-delay:${k * 0.18}s">★</i>`).join('')}</div>
      <div class="grid grid-cols-3 gap-3 text-center mt-2">
        <div class="stat"><span>Time</span><b>${this.fmtTime(this.time)}</b></div>
        <div class="stat"><span>3★ under</span><b>${this.fmtTime(this.par)}</b></div>
        <div class="stat"><span>Score</span><b>${score.toLocaleString()}</b></div>
      </div>
      <div class="bg-row mt-5">
        ${i < SECTORS.length - 1 ? '<button type="button" class="btn-neon flex-1" data-next>Next sector</button>' : ''}
        <button type="button" class="btn-ghost" data-retry>Replay</button>
        <button type="button" class="btn-ghost" data-map>Campaign map</button>
      </div>`);
    el.querySelector('[data-next]')?.addEventListener('click', () => this.startSector(i + 1));
    el.querySelector('[data-retry]').addEventListener('click', () => this.startSector(i));
    el.querySelector('[data-map]').addEventListener('click', () => this.showCampaign());
  }

  fmtTime(t) { const s = Math.floor(t); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }

  pause() {
    if (this.phase !== 'play') return;
    this.phase = 'paused';
    const el = this.overlay(`
      <p class="bg-kicker">Paused</p>
      <h2 class="mt-2">${this.sector.name}</h2>
      <p class="text-sm text-slate-300 mt-3">Elapsed ${this.fmtTime(this.time)} · 3★ par ${this.fmtTime(this.par)}</p>
      <div class="bg-row mt-5"><button type="button" class="btn-neon flex-1" data-resume>Resume</button><button type="button" class="btn-ghost" data-retry>Restart sector</button><button type="button" class="btn-ghost" data-map>Campaign map</button></div>`);
    el.querySelector('[data-resume]').addEventListener('click', () => this.resume());
    el.querySelector('[data-retry]').addEventListener('click', () => this.startSector(this.sectorIndex));
    el.querySelector('[data-map]').addEventListener('click', () => this.showCampaign());
  }

  resume() { if (this.phase === 'paused') { this.closeOverlay(); this.phase = 'play'; } }

  onEscape() {
    if (this.phase === 'play') { this.pause(); return true; }
    if (this.phase === 'paused') { this.resume(); return true; }
    return false;
  }

  /* ---------- rendering ---------- */
  resize() {
    const r = this.root.getBoundingClientRect();
    this.view = { w: Math.max(1, r.width), h: Math.max(1, r.height) };
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(this.view.w * dpr);
    this.canvas.height = Math.round(this.view.h * dpr);
    this.dpr = dpr;
    this.fit();
  }

  fit() {
    if (!this.W) { this.W = 1240; this.H = 780; }
    const top = 64, bottom = 64;
    const availH = Math.max(50, this.view.h - top - bottom);
    this.scale = Math.min(this.view.w / this.W, availH / this.H);
    this.ox = (this.view.w - this.W * this.scale) / 2;
    this.oy = top + (availH - this.H * this.scale) / 2;
  }

  draw(rdt) {
    const g = this.g, dpr = this.dpr;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = '#02030a';
    g.fillRect(0, 0, this.view.w, this.view.h);
    if (!this.planets?.length) return;
    g.save();
    g.translate(this.ox, this.oy);
    g.scale(this.scale, this.scale);
    if (this.bg) g.drawImage(this.bg, 0, 0);
    const t = this.clock;
    const ui = 1 / this.scale;

    // Selection drag lines
    if (this.drag && this.drag.moved && this.drag.planet?.owner === 0) {
      const srcs = this.selection.has(this.drag.planet.id) ? [...this.selection].map((id) => this.planets[id]) : [this.drag.planet];
      const tgt = this.planetAt(this.drag.cur);
      const end = tgt || this.drag.cur;
      g.strokeStyle = 'rgba(147,197,253,0.75)'; g.lineWidth = 2 / this.scale + 1; g.setLineDash([8, 8]);
      g.lineDashOffset = -t * 40;
      srcs.forEach((s) => { g.beginPath(); g.moveTo(s.x, s.y); g.lineTo(end.x, end.y); g.stroke(); });
      g.setLineDash([]);
      if (tgt) { g.strokeStyle = '#93c5fd'; g.lineWidth = 3; g.beginPath(); g.arc(tgt.x, tgt.y, tgt.r + 10, 0, Math.PI * 2); g.stroke(); }
    }
    if (this.drag?.box && this.drag.moved) {
      const d = this.drag;
      g.fillStyle = 'rgba(59,130,246,0.1)'; g.strokeStyle = 'rgba(147,197,253,0.8)'; g.lineWidth = 1.5;
      g.fillRect(d.start.x, d.start.y, d.cur.x - d.start.x, d.cur.y - d.start.y);
      g.strokeRect(d.start.x, d.start.y, d.cur.x - d.start.x, d.cur.y - d.start.y);
    }
    // Hover preview: line from selection to hovered target
    if (!this.drag && this.hover && this.selection.size && !this.selection.has(this.hover.id) && this.phase === 'play') {
      g.strokeStyle = 'rgba(147,197,253,0.35)'; g.lineWidth = 1.5; g.setLineDash([4, 8]);
      [...this.selection].forEach((id) => { const s = this.planets[id]; g.beginPath(); g.moveTo(s.x, s.y); g.lineTo(this.hover.x, this.hover.y); g.stroke(); });
      g.setLineDash([]);
    }

    // Planets
    for (const p of this.planets) {
      const fac = p.owner >= 0 ? FACTIONS[p.owner] : NEUTRAL;
      // territory glow
      if (p.owner >= 0) {
        const grd = g.createRadialGradient(p.x, p.y, p.r, p.x, p.y, p.r * 2.6);
        grd.addColorStop(0, fac.color + '40'); grd.addColorStop(1, fac.color + '00');
        g.fillStyle = grd; g.beginPath(); g.arc(p.x, p.y, p.r * 2.6, 0, Math.PI * 2); g.fill();
      }
      const s = p.sprite;
      g.drawImage(s.canvas, p.x - s.size / 2, p.y - s.size / 2, s.size, s.size);
      // owner ring
      g.lineWidth = Math.max(2.5, 1.6 * ui);
      g.strokeStyle = fac.color;
      if (p.owner < 0) g.setLineDash([4, 6]);
      g.beginPath(); g.arc(p.x, p.y, p.r + 5, 0, Math.PI * 2); g.stroke();
      g.setLineDash([]);
      // production progress arc
      if (p.owner >= 0 && p.ships < p.cap) {
        g.strokeStyle = fac.light; g.globalAlpha = 0.6; g.lineWidth = 2;
        g.beginPath(); g.arc(p.x, p.y, p.r + 9, -Math.PI / 2, -Math.PI / 2 + (p.ships % 1) * Math.PI * 2); g.stroke();
        g.globalAlpha = 1;
      }
      // special type badge
      if (p.type !== 'normal') {
        const bs = Math.max(1, 9 * ui / 10);
        const bx = p.x + p.r * 0.75 + 4 * bs, by = p.y - p.r * 0.85 - 2 * bs;
        g.fillStyle = 'rgba(5,6,15,0.85)'; g.beginPath(); g.arc(bx, by, 10 * bs, 0, Math.PI * 2); g.fill();
        g.strokeStyle = p.type === 'forge' ? '#fb923c' : p.type === 'fortress' ? '#cbd5e1' : '#67e8f9'; g.lineWidth = 1.5; g.stroke();
        g.fillStyle = g.strokeStyle;
        g.save(); g.translate(bx, by); g.scale(bs, bs); drawBadge(g, p.type, 0, 0); g.restore();
      }
      // selection
      if (this.selection.has(p.id)) {
        g.strokeStyle = '#e0f2fe'; g.lineWidth = 2.5; g.setLineDash([10, 7]); g.lineDashOffset = -t * 30;
        g.beginPath(); g.arc(p.x, p.y, p.r + 14, 0, Math.PI * 2); g.stroke(); g.setLineDash([]);
      } else if (this.hover === p && this.phase === 'play') {
        g.strokeStyle = 'rgba(255,255,255,0.4)'; g.lineWidth = 1.5;
        g.beginPath(); g.arc(p.x, p.y, p.r + 12, 0, Math.PI * 2); g.stroke();
      }
      // ship count
      const n = Math.floor(p.ships);
      g.font = `800 ${Math.max(13 * ui, Math.min(22, p.r * 0.62))}px Inter, sans-serif`;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.lineWidth = Math.max(4, 3 * ui); g.strokeStyle = 'rgba(0,0,0,0.75)'; g.strokeText(String(n), p.x, p.y);
      g.fillStyle = '#fff'; g.fillText(String(n), p.x, p.y);
    }

    // Fleets
    for (const f of this.fleets) {
      const fac = FACTIONS[f.owner];
      const ang = f.ang ?? Math.atan2(f.target.y - f.y, f.target.x - f.x);
      const ca = Math.cos(ang), sa = Math.sin(ang);
      g.strokeStyle = fac.color + '55'; g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(f.x, f.y); g.lineTo(f.x - ca * 26, f.y - sa * 26); g.stroke();
      g.fillStyle = fac.light;
      for (const u of f.units) {
        const wob = Math.sin(t * 3 + u.ph) * 0.15;
        const lx = u.ox * f.spread * 0.6, ly = (u.oy + wob) * f.spread;
        const x = f.x + lx * ca - ly * sa, y = f.y + lx * sa + ly * ca;
        g.beginPath();
        g.moveTo(x + ca * 4.5, y + sa * 4.5);
        g.lineTo(x - ca * 3 - sa * 2.6, y - sa * 3 + ca * 2.6);
        g.lineTo(x - ca * 3 + sa * 2.6, y - sa * 3 - ca * 2.6);
        g.closePath(); g.fill();
      }
      if (f.ships >= 3) {
        g.font = `700 ${Math.max(11, 11 * ui)}px Inter, sans-serif`; g.textAlign = 'center';
        const ly = f.y - f.spread - 8 * Math.max(1, ui);
        g.lineWidth = Math.max(3, 2.5 * ui); g.strokeStyle = 'rgba(0,0,0,0.7)'; g.strokeText(String(f.ships), f.x, ly);
        g.fillStyle = fac.light; g.fillText(String(f.ships), f.x, ly);
      }
    }

    // Effects
    for (const e of this.effects) {
      e.t += rdt;
      const k = e.t / (e.type === 'capture' ? 0.9 : 0.4);
      if (k >= 1) { e.dead = true; continue; }
      g.strokeStyle = e.color; g.globalAlpha = 1 - k; g.lineWidth = e.type === 'capture' ? 4 : 2;
      g.beginPath(); g.arc(e.x, e.y, e.r + 6 + k * (e.type === 'capture' ? 60 : 16), 0, Math.PI * 2); g.stroke();
      g.globalAlpha = 1;
    }
    this.effects = this.effects.filter((e) => !e.dead);
    g.restore();

    // HUD values
    if (this.phase === 'play' || this.phase === 'paused') {
      this.$('[data-time]').textContent = this.fmtTime(this.time);
      const s = this.power || this.strength();
      const total = s.reduce((a, b) => a + b, 0) || 1;
      const html = s.map((v, i) => (i <= this.ais.length && v > 0 ? `<i style="flex:${v / total};background:${FACTIONS[i].color}" title="${FACTIONS[i].name}: ${Math.round(v)}"></i>` : '')).join('');
      if (this._powerHtml !== html) { this.$('[data-power]').innerHTML = html; this._powerHtml = html; }
      this.ctx.setInfo(`${this.fmtTime(this.time)} · ${this.planets.filter((p) => p.owner === 0).length}/${this.planets.length} worlds`);
    }
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.timers.forEach(clearTimeout);
    this.listeners.forEach(([t, e, f, o]) => t.removeEventListener(e, f, o));
    this.ro.disconnect();
    this.root.innerHTML = '';
  }
}
