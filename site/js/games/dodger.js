// Asteroid Dodger — pseudo-3D lanes; switch lanes to dodge asteroids and grab plasma shields.
import { CanvasGame, Particles, rand } from './canvas.js';
import { icon } from '../icons.js';

const LANES = 5;

export default class AsteroidDodger extends CanvasGame {
  constructor(root, ctx) {
    super(root, ctx, 420, 640);
    this.readyText = ['ASTEROID DODGER', '← → / A D, swipe or tap a side to switch lanes', 'Blue orbs = plasma shield (blocks one hit)'];
    this.hy = 150; this.by = 560; this.laneW = 74;
    this.lane = 2; this.px = 2;
    this.rocks = []; this.orbs = [];
    this.speed = 0.42; this.dist = 0; this.bonus = 0; this.shield = 0;
    this.spawnT = 0.6; this.parts = new Particles();
    this.warp = Array.from({ length: 70 }, () => ({ a: rand(0, Math.PI * 2), d: rand(0, 1), s: rand(0.3, 1) }));
    this.addTouchButtons([{ label: icon('left'), code: 'ArrowLeft', aria: 'Move left' }, { label: icon('right'), code: 'ArrowRight', aria: 'Move right' }]);
    this.shake = 0;
  }

  proj(z) { return 1 / (1 + z * 6); }
  laneX(l, p) { return this.W / 2 + (l - (LANES - 1) / 2) * this.laneW * p; }
  yAt(p) { return this.hy + (this.by - this.hy) * p; }

  onKey(e) {
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') this.move(-1);
    if (e.code === 'ArrowRight' || e.code === 'KeyD') this.move(1);
  }

  onPointerDown(p) { this.swipeX = p.x; this.swiped = false; }
  onPointerMove(p) {
    if (!this.pointer.down || this.swiped || this.swipeX == null) return;
    const dx = p.x - this.swipeX;
    if (Math.abs(dx) > 30) { this.move(Math.sign(dx)); this.swiped = true; }
  }
  onPointerUp(p) {
    if (!this.swiped && this.swipeX != null) this.move(p.x < this.W / 2 ? -1 : 1);
    this.swipeX = null;
  }

  move(d) {
    const n = Math.max(0, Math.min(LANES - 1, this.lane + d));
    if (n !== this.lane) { this.lane = n; this.ctx.audio.tone({ freq: 520 + n * 60, type: 'triangle', dur: 0.06, vol: 0.08 }); }
  }

  spawn() {
    const lanes = [0, 1, 2, 3, 4].sort(() => Math.random() - 0.5);
    const count = Math.random() < Math.min(0.55, 0.15 + this.dist / 600) ? 2 : 1;
    for (let i = 0; i < count; i++) {
      const pts = Array.from({ length: 9 }, () => rand(0.72, 1.1));
      this.rocks.push({ lane: lanes[i], z: 1, rot: rand(0, 6), vr: rand(-2, 2), size: rand(30, 42), pts, hue: rand(15, 35) });
    }
    if (Math.random() < 0.12) this.orbs.push({ lane: lanes[count], z: 1 });
  }

  update(dt) {
    this.speed = Math.min(1.1, 0.42 + this.dist / 1200);
    this.dist += this.speed * dt * 30;
    this.px += (this.lane - this.px) * Math.min(1, dt * 16);
    this.spawnT -= dt;
    if (this.spawnT <= 0) { this.spawn(); this.spawnT = Math.max(0.38, 0.6 - this.dist / 2500) / this.speed; }

    for (const r of this.rocks) { r.z -= this.speed * dt; r.rot += r.vr * dt; }
    for (const o of this.orbs) o.z -= this.speed * dt;

    for (const r of this.rocks) {
      if (!r.hit && r.z < 0.04 && r.z > -0.05 && Math.abs(r.lane - this.px) < 0.55) {
        r.hit = true;
        const p = this.proj(Math.max(0, r.z));
        this.parts.burst(this.laneX(r.lane, p), this.yAt(p), '#fb923c', 30, 220);
        this.shake = 0.35;
        if (this.shield > 0) {
          this.shield--; this.ctx.audio.zap(); this.ctx.audio.explosion();
        } else {
          this.ctx.audio.explosion();
          this.parts.burst(this.laneX(this.px, 1), this.by, '#22d3ee', 40, 260);
          this.dead = true;
          this.after(900, () => this.end(this.score(), { title: 'Hull breached', message: `You flew ${Math.floor(this.dist)} km.` }));
          this.state = 'dying';
        }
      }
    }
    for (const o of this.orbs) {
      if (!o.got && o.z < 0.05 && o.z > -0.05 && Math.abs(o.lane - this.px) < 0.55) {
        o.got = true; this.shield = Math.min(3, this.shield + 1); this.bonus += 50;
        this.ctx.audio.pickup();
        this.parts.burst(this.laneX(o.lane, 1), this.by, '#38bdf8', 24, 160);
      }
    }
    this.rocks = this.rocks.filter((r) => r.z > -0.15 && !r.hit);
    this.orbs = this.orbs.filter((o) => o.z > -0.15 && !o.got);
    this.ctx.setScore(this.score());
    this.ctx.setInfo(`Shields: ${this.shield}`);
  }

  idle(dt) { this.parts.update(dt); if (this.shake > 0) this.shake -= dt; }

  score() { return Math.floor(this.dist) + this.bonus; }

  draw(g, dt) {
    const { W, H } = this;
    if (this.state === 'play') { this.parts.update(dt); if (this.shake > 0) this.shake -= dt; }
    g.save();
    if (this.shake > 0) g.translate(rand(-6, 6) * this.shake, rand(-6, 6) * this.shake);
    const bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#0b0626'); bg.addColorStop(0.3, '#1a0b3d'); bg.addColorStop(1, '#05030f');
    g.fillStyle = bg; g.fillRect(-10, -10, W + 20, H + 20);

    // Warp streaks from the vanishing point
    const vx = W / 2, vy = this.hy;
    const sp = this.state === 'play' ? this.speed : 0.2;
    for (const s of this.warp) {
      s.d += dt * sp * s.s * 0.9;
      if (s.d > 1) { s.d = 0; s.a = rand(0, Math.PI * 2); }
      const r1 = s.d * s.d * 520, r2 = r1 + 6 + sp * 30 * s.d;
      g.strokeStyle = `rgba(190,210,255,${0.15 + s.d * 0.6})`;
      g.lineWidth = 1 + s.d;
      g.beginPath();
      g.moveTo(vx + Math.cos(s.a) * r1, vy + Math.sin(s.a) * r1 * 0.7);
      g.lineTo(vx + Math.cos(s.a) * r2, vy + Math.sin(s.a) * r2 * 0.7);
      g.stroke();
    }
    // Horizon glow
    const hg = g.createRadialGradient(vx, vy, 0, vx, vy, 220);
    hg.addColorStop(0, 'rgba(168,85,247,0.55)'); hg.addColorStop(1, 'rgba(168,85,247,0)');
    g.fillStyle = hg; g.fillRect(0, 0, W, H);

    // Lane grid
    g.strokeStyle = 'rgba(34,211,238,0.35)'; g.lineWidth = 1.2;
    for (let l = -0.5; l <= LANES - 0.5; l++) {
      g.beginPath(); g.moveTo(this.laneX(l, this.proj(1)), this.yAt(this.proj(1))); g.lineTo(this.laneX(l, 1), this.by + 40); g.stroke();
    }
    const scroll = (this.t * sp * 2) % 0.2;
    for (let z = 1 - scroll; z > -0.05; z -= 0.2) {
      const p = this.proj(Math.max(0, z));
      g.strokeStyle = `rgba(168,85,247,${0.12 + p * 0.3})`;
      g.beginPath(); g.moveTo(this.laneX(-0.5, p), this.yAt(p)); g.lineTo(this.laneX(LANES - 0.5, p), this.yAt(p)); g.stroke();
    }

    // Objects back-to-front
    const objs = [...this.rocks.map((r) => ({ ...r, type: 'rock', ref: r })), ...this.orbs.map((o) => ({ ...o, type: 'orb' }))].sort((a, b) => b.z - a.z);
    for (const o of objs) {
      const p = this.proj(Math.max(0, o.z));
      const x = this.laneX(o.lane, p), y = this.yAt(p);
      if (o.type === 'rock') {
        const s = o.size * p;
        g.save(); g.translate(x, y - s * 0.6); g.rotate(o.rot);
        const grd = g.createRadialGradient(-s * 0.3, -s * 0.3, 1, 0, 0, s);
        grd.addColorStop(0, `hsl(${o.hue},35%,62%)`); grd.addColorStop(1, `hsl(${o.hue},30%,18%)`);
        g.fillStyle = grd;
        g.beginPath();
        o.pts.forEach((k, i) => { const a = (i / o.pts.length) * Math.PI * 2; g[i ? 'lineTo' : 'moveTo'](Math.cos(a) * s * k, Math.sin(a) * s * k); });
        g.closePath(); g.fill();
        g.fillStyle = 'rgba(0,0,0,0.25)';
        g.beginPath(); g.arc(s * 0.2, s * 0.1, s * 0.18, 0, Math.PI * 2); g.fill();
        g.restore();
      } else {
        const s = 14 * p + 2;
        g.save();
        g.shadowColor = '#38bdf8'; g.shadowBlur = 20;
        g.fillStyle = '#7dd3fc';
        g.beginPath(); g.arc(x, y - s, s, 0, Math.PI * 2); g.fill();
        g.strokeStyle = '#fff'; g.lineWidth = 2;
        g.beginPath(); g.arc(x, y - s, s * 0.55, this.t * 4, this.t * 4 + 4); g.stroke();
        g.restore();
      }
    }

    // Player ship
    if (!this.dead) {
      const x = this.laneX(this.px, 1), y = this.by;
      const tilt = (this.lane - this.px) * 0.35;
      g.save(); g.translate(x, y); g.rotate(tilt);
      const flame = 10 + Math.random() * 10;
      g.fillStyle = 'rgba(34,211,238,0.8)';
      g.beginPath(); g.moveTo(-8, 14); g.lineTo(0, 14 + flame); g.lineTo(8, 14); g.fill();
      g.shadowColor = '#a855f7'; g.shadowBlur = 16;
      g.fillStyle = '#e2e8f0';
      g.beginPath(); g.moveTo(0, -26); g.lineTo(22, 14); g.lineTo(8, 10); g.lineTo(0, 16); g.lineTo(-8, 10); g.lineTo(-22, 14); g.closePath(); g.fill();
      g.fillStyle = '#a855f7'; g.beginPath(); g.moveTo(0, -12); g.lineTo(6, 4); g.lineTo(-6, 4); g.fill();
      if (this.shield > 0) {
        g.strokeStyle = `rgba(56,189,248,${0.5 + Math.sin(this.t * 8) * 0.3})`; g.lineWidth = 3; g.shadowColor = '#38bdf8';
        g.beginPath(); g.arc(0, -2, 34, 0, Math.PI * 2); g.stroke();
      }
      g.restore();
    }
    this.parts.draw(g);
    g.restore();

    // HUD
    this.text(g, `${Math.floor(this.dist)} km`, 14, 24, { size: 16, color: '#e2e8f0' });
    this.text(g, `SPEED ${(this.speed * 100).toFixed(0)}%`, W - 14, 24, { size: 12, color: '#a78bfa', align: 'right' });
    for (let i = 0; i < this.shield; i++) {
      g.fillStyle = '#38bdf8'; g.beginPath(); g.arc(20 + i * 22, 50, 7, 0, Math.PI * 2); g.fill();
    }
  }
}
