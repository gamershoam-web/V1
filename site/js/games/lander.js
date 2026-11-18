// Lunar Lander — thrust & rotate against gravity with limited fuel; land softly on a flat pad.
import { CanvasGame, Particles, rand, clamp, makeStars, drawStars } from './canvas.js';
import { icon } from '../icons.js';

const G = 24, THRUST = 62, ROT = 2.4, BURN = 55;
const SAFE_VY = 38, SAFE_VX = 22, SAFE_ANG = 0.26;

export default class LunarLander extends CanvasGame {
  constructor(root, ctx) {
    super(root, ctx, 800, 500);
    this.readyText = ['LUNAR LANDER', '← → / A D rotate · ↑ / W / Space thrust', 'Land gently and upright on a lit pad. Smaller pads score more.'];
    this.parts = new Particles();
    this.stars = makeStars(120, this.W, this.H);
    this.level = 1; this.score = 0; this.fuel = 1000;
    this.newLevel();
    this.addTouchButtons([
      { label: icon('rotateL'), code: 'ArrowLeft', aria: 'Rotate left' },
      { label: icon('thrust'), code: 'ArrowUp', aria: 'Thrust' },
      { label: icon('rotateR'), code: 'ArrowRight', aria: 'Rotate right' },
    ]);
  }

  newLevel() {
    const { W, H } = this;
    const step = 20;
    const pts = [];
    let y = H - rand(60, 140);
    for (let x = 0; x <= W; x += step) { pts.push([x, y]); y = clamp(y + rand(-34, 34), H - 210, H - 30); }
    // Carve landing pads (narrower pads = bigger multiplier).
    const padDefs = [{ w: 5, mult: 2 }, { w: 4, mult: 3 }, { w: 3, mult: 5 }];
    const slots = [];
    const segCount = pts.length - 1;
    this.pads = [];
    padDefs.sort(() => Math.random() - 0.5).forEach((p) => {
      for (let tries = 0; tries < 40; tries++) {
        const i = Math.floor(rand(1, segCount - p.w - 1));
        if (slots.some(([a, b]) => i < b + 2 && i + p.w > a - 2)) continue;
        const py = pts[i][1];
        for (let k = i; k <= i + p.w; k++) pts[k][1] = py;
        slots.push([i, i + p.w]);
        this.pads.push({ x1: pts[i][0], x2: pts[i + p.w][0], y: py, mult: p.mult });
        break;
      }
    });
    this.terrain = pts;
    this.lander = { x: rand(80, W - 80), y: 50, vx: rand(-40, 40), vy: 0, a: 0 };
    this.thrusting = false;
    this.landed = false;
    this.banner = null;
  }

  groundAt(x) {
    const step = this.terrain[1][0] - this.terrain[0][0];
    const i = clamp(Math.floor(x / step), 0, this.terrain.length - 2);
    const [x1, y1] = this.terrain[i], [, y2] = this.terrain[i + 1];
    return y1 + ((x - x1) / step) * (y2 - y1);
  }

  update(dt) {
    if (this.landed || this.crashed) return;
    const L = this.lander;
    if (this.keys.has('ArrowLeft') || this.keys.has('KeyA')) L.a -= ROT * dt;
    if (this.keys.has('ArrowRight') || this.keys.has('KeyD')) L.a += ROT * dt;
    L.a = clamp(L.a, -Math.PI / 2, Math.PI / 2);
    this.thrusting = (this.keys.has('ArrowUp') || this.keys.has('KeyW') || this.keys.has('Space')) && this.fuel > 0;
    L.vy += G * dt;
    if (this.thrusting) {
      L.vx += Math.sin(L.a) * THRUST * dt;
      L.vy -= Math.cos(L.a) * THRUST * dt;
      this.fuel = Math.max(0, this.fuel - BURN * dt);
      if (Math.random() < 0.6) {
        this.parts.list.push({ x: L.x - Math.sin(L.a) * 14, y: L.y + Math.cos(L.a) * 14, vx: -Math.sin(L.a) * 90 + rand(-25, 25), vy: Math.cos(L.a) * 90 + rand(-25, 25), life: 0.4, max: 0.4, color: Math.random() < 0.5 ? '#fb923c' : '#facc15', size: rand(1.5, 3) });
      }
      if ((this._thrustSnd = (this._thrustSnd || 0) - dt) <= 0) { this.ctx.audio.thrust(); this._thrustSnd = 0.11; }
    }
    L.x += L.vx * dt; L.y += L.vy * dt;
    if (L.x < 0) L.x += this.W; if (L.x > this.W) L.x -= this.W;
    if (L.y < 10) { L.y = 10; L.vy = Math.max(0, L.vy); }

    const ground = this.groundAt(L.x);
    if (L.y + 14 >= ground) {
      L.y = ground - 14;
      const pad = this.pads.find((p) => L.x - 10 >= p.x1 && L.x + 10 <= p.x2);
      const ok = pad && Math.abs(L.vy) < SAFE_VY && Math.abs(L.vx) < SAFE_VX && Math.abs(L.a) < SAFE_ANG;
      if (ok) this.land(pad); else this.crash(pad ? 'Too fast or tilted for a safe landing' : 'Missed the landing pad');
    }
    this.ctx.setInfo(`Level ${this.level} · Fuel ${Math.round(this.fuel)}`);
  }

  land(pad) {
    this.landed = true;
    const L = this.lander;
    const softness = Math.round((1 - Math.abs(L.vy) / SAFE_VY) * 50);
    L.vx = 0; L.vy = 0; L.a = 0;
    const pts = 100 * pad.mult + Math.round(this.fuel / 10) + softness;
    this.score += pts;
    this.ctx.setScore(this.score);
    this.ctx.audio.chime();
    this.banner = { text: `LANDED x${pad.mult}  +${pts}`, color: '#4ade80' };
    this.after(1800, () => {
      this.level++;
      this.fuel = Math.min(1000, this.fuel + 320);
      this.newLevel();
    });
  }

  crash(reason) {
    this.crashed = true;
    this.ctx.audio.explosion();
    this.parts.burst(this.lander.x, this.lander.y, '#fb923c', 50, 260, 1);
    this.parts.burst(this.lander.x, this.lander.y, '#e2e8f0', 20, 160, 1);
    this.banner = { text: 'CRASHED', color: '#f43f5e' };
    this.after(1300, () => this.end(this.score, { title: 'Module lost', message: `${reason}. You completed ${this.level - 1} landing${this.level === 2 ? '' : 's'}.` }));
  }

  draw(g, dt) {
    const { W, H } = this;
    this.parts.update(dt);
    g.fillStyle = '#04030c'; g.fillRect(0, 0, W, H);
    drawStars(g, this.stars, this.t, W, H);
    // Earth in the sky
    const eg = g.createRadialGradient(W - 110, 80, 4, W - 100, 90, 36);
    eg.addColorStop(0, '#93c5fd'); eg.addColorStop(0.6, '#1d4ed8'); eg.addColorStop(1, '#0b1a4a');
    g.fillStyle = eg; g.beginPath(); g.arc(W - 100, 90, 30, 0, Math.PI * 2); g.fill();

    // Terrain
    g.beginPath(); g.moveTo(0, H);
    this.terrain.forEach(([x, y]) => g.lineTo(x, y));
    g.lineTo(W, H); g.closePath();
    const tg = g.createLinearGradient(0, H - 220, 0, H);
    tg.addColorStop(0, '#475569'); tg.addColorStop(1, '#0f172a');
    g.fillStyle = tg; g.fill();
    g.strokeStyle = '#cbd5e1'; g.lineWidth = 1.5;
    g.beginPath(); this.terrain.forEach(([x, y], i) => g[i ? 'lineTo' : 'moveTo'](x, y)); g.stroke();
    for (const p of this.pads) {
      g.save(); g.shadowColor = '#4ade80'; g.shadowBlur = 14;
      g.strokeStyle = '#4ade80'; g.lineWidth = 4;
      g.beginPath(); g.moveTo(p.x1, p.y); g.lineTo(p.x2, p.y); g.stroke(); g.restore();
      this.text(g, `x${p.mult}`, (p.x1 + p.x2) / 2, p.y + 16, { size: 12, color: '#86efac', align: 'center' });
      const blink = Math.sin(this.t * 5) > 0;
      g.fillStyle = blink ? '#f87171' : '#7f1d1d';
      g.fillRect(p.x1 - 2, p.y - 6, 3, 6); g.fillRect(p.x2 - 1, p.y - 6, 3, 6);
    }

    // Lander
    if (!this.crashed) {
      const L = this.lander;
      g.save(); g.translate(L.x, L.y); g.rotate(L.a);
      if (this.thrusting) {
        const f = rand(10, 22);
        const fg = g.createLinearGradient(0, 10, 0, 10 + f);
        fg.addColorStop(0, '#fde68a'); fg.addColorStop(1, 'rgba(249,115,22,0)');
        g.fillStyle = fg; g.beginPath(); g.moveTo(-5, 10); g.lineTo(0, 10 + f); g.lineTo(5, 10); g.fill();
      }
      g.strokeStyle = '#e2e8f0'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(-8, 6); g.lineTo(-13, 14); g.moveTo(8, 6); g.lineTo(13, 14); g.moveTo(-16, 14); g.lineTo(-10, 14); g.moveTo(10, 14); g.lineTo(16, 14); g.stroke();
      g.fillStyle = '#cbd5e1'; g.fillRect(-9, -2, 18, 10);
      g.fillStyle = '#e2e8f0'; g.beginPath(); g.arc(0, -6, 9, Math.PI, 0); g.fill();
      g.fillStyle = '#22d3ee'; g.beginPath(); g.arc(0, -7, 4, 0, Math.PI * 2); g.fill();
      g.restore();
    }
    this.parts.draw(g);

    // HUD
    const L = this.lander;
    const alt = Math.max(0, Math.round(this.groundAt(L.x) - L.y - 14));
    const ok = (v, lim) => (Math.abs(v) < lim ? '#4ade80' : '#f87171');
    this.text(g, `ALT ${alt}`, 16, 22, { size: 13, color: '#e2e8f0' });
    this.text(g, `H-SPD ${Math.round(L.vx)}`, 16, 42, { size: 13, color: ok(L.vx, SAFE_VX) });
    this.text(g, `V-SPD ${Math.round(L.vy)}`, 16, 62, { size: 13, color: ok(L.vy, SAFE_VY) });
    this.text(g, `ANGLE ${Math.round((L.a * 180) / Math.PI)}°`, 16, 82, { size: 13, color: ok(L.a, SAFE_ANG) });
    this.text(g, 'FUEL', 180, 22, { size: 12, color: '#94a3b8' });
    g.fillStyle = 'rgba(255,255,255,0.1)'; g.fillRect(222, 15, 150, 12);
    g.fillStyle = this.fuel < 200 ? '#f87171' : '#facc15'; g.fillRect(222, 15, 150 * (this.fuel / 1000), 12);
    this.text(g, `LEVEL ${this.level}`, W / 2, 22, { size: 13, color: '#a78bfa', align: 'center' });
    if (this.banner) this.text(g, this.banner.text, W / 2, H / 2 - 60, { size: 32, color: this.banner.color, align: 'center', glow: this.banner.color, weight: 900 });
  }
}
