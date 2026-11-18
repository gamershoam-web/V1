// Orbital Brick Breaker — bounce a plasma core into alien shield bricks; catch power-ups.
import { CanvasGame, Particles, clamp, rand, makeStars, drawStars } from './canvas.js';

const COLS = 8, ROWS = 7;
const POWERS = {
  multi: { color: '#22d3ee', label: 'M' },
  wide: { color: '#a855f7', label: 'W' },
  slow: { color: '#4ade80', label: 'S' },
  life: { color: '#f472b6', label: '+' },
};

export default class BrickBreaker extends CanvasGame {
  constructor(root, ctx) {
    super(root, ctx, 480, 640);
    this.readyText = ['ORBITAL BRICK BREAKER', 'Move: mouse / drag or ← →  · Launch: click / Space', 'Power-ups: M multi-ball · W wide · S slow · + life'];
    this.parts = new Particles();
    this.stars = makeStars(80, this.W, this.H);
    this.level = 1; this.lives = 3; this.score = 0;
    this.px = this.W / 2; this.pw = 90; this.wideT = 0; this.slowT = 0;
    this.powerups = [];
    this.build();
    this.resetBall();
  }

  build() {
    const bw = (this.W - 40) / COLS, bh = 20;
    this.bricks = [];
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      if (this.level % 3 === 2 && (r + c) % 2 === 1 && r > 1) continue;
      if (this.level % 3 === 0 && Math.abs(c - (COLS - 1) / 2) < r * 0.6 - 1.5) continue;
      let hp = 1;
      if (r < 2) hp = this.level >= 2 ? 3 : 2;
      else if (r < 4 && this.level >= 2) hp = 2;
      this.bricks.push({ x: 20 + c * bw + 2, y: 70 + r * (bh + 6), w: bw - 4, h: bh, hp, max: hp });
    }
  }

  resetBall() {
    this.balls = [{ x: this.px, y: this.H - 52, vx: 0, vy: 0, stuck: true }];
  }

  baseSpeed() { return (360 + this.level * 30) * (this.slowT > 0 ? 0.7 : 1); }

  launch() {
    for (const b of this.balls) if (b.stuck) {
      const a = rand(-0.5, 0.5);
      b.vx = Math.sin(a) * this.baseSpeed(); b.vy = -Math.cos(a) * this.baseSpeed(); b.stuck = false;
      this.ctx.audio.zap();
    }
  }

  onKey(e) { if (e.code === 'Space' || e.code === 'ArrowUp') this.launch(); }
  onPointerDown(p) { this.px = p.x; this.usePointer = true; }
  onPointerMove(p) { this.px = p.x; this.usePointer = true; }
  onPointerUp() { this.launch(); }
  onBegin() { this.after(250, () => this.launch()); }

  update(dt) {
    const { W, H } = this;
    if (this.keys.has('ArrowLeft') || this.keys.has('KeyA')) this.px -= 620 * dt;
    if (this.keys.has('ArrowRight') || this.keys.has('KeyD')) this.px += 620 * dt;
    if (this.wideT > 0) this.wideT -= dt;
    if (this.slowT > 0) this.slowT -= dt;
    const targetW = this.wideT > 0 ? 140 : 90;
    this.pw += (targetW - this.pw) * Math.min(1, dt * 8);
    this.px = clamp(this.px, this.pw / 2, W - this.pw / 2);
    const py = H - 40;

    for (const b of this.balls) {
      if (b.stuck) { b.x = this.px; b.y = py - 12; continue; }
      const sp = Math.hypot(b.vx, b.vy), target = this.baseSpeed();
      if (Math.abs(sp - target) > 1) { b.vx *= target / sp; b.vy *= target / sp; }
      b.x += b.vx * dt; b.y += b.vy * dt;
      if (b.x < 7) { b.x = 7; b.vx = Math.abs(b.vx); this.ctx.audio.bounce(); }
      if (b.x > W - 7) { b.x = W - 7; b.vx = -Math.abs(b.vx); this.ctx.audio.bounce(); }
      if (b.y < 7) { b.y = 7; b.vy = Math.abs(b.vy); this.ctx.audio.bounce(); }
      // Paddle
      if (b.vy > 0 && b.y > py - 14 && b.y < py + 8 && Math.abs(b.x - this.px) < this.pw / 2 + 7) {
        const off = clamp((b.x - this.px) / (this.pw / 2), -1, 1);
        const a = off * 1.05;
        b.vx = Math.sin(a) * target; b.vy = -Math.cos(a) * target;
        b.y = py - 14;
        this.ctx.audio.hit();
      }
      // Bricks (one per frame per ball)
      for (const br of this.bricks) {
        if (br.hp <= 0) continue;
        const cx = clamp(b.x, br.x, br.x + br.w), cy = clamp(b.y, br.y, br.y + br.h);
        if ((b.x - cx) ** 2 + (b.y - cy) ** 2 > 49) continue;
        const ox = Math.min(b.x + 7 - br.x, br.x + br.w - (b.x - 7));
        const oy = Math.min(b.y + 7 - br.y, br.y + br.h - (b.y - 7));
        if (ox < oy) b.vx = -b.vx; else b.vy = -b.vy;
        this.hitBrick(br);
        break;
      }
      if (b.y > H + 10) b.dead = true;
    }
    this.balls = this.balls.filter((b) => !b.dead);
    if (!this.balls.length) {
      this.lives--;
      this.ctx.audio.error();
      if (this.lives <= 0) {
        this.state = 'dying';
        this.after(600, () => this.end(this.score, { title: 'Core lost', message: `You reached level ${this.level}.` }));
        return;
      }
      this.powerups = [];
      this.resetBall();
    }

    for (const p of this.powerups) {
      p.y += 150 * dt;
      if (p.y > py - 10 && p.y < py + 12 && Math.abs(p.x - this.px) < this.pw / 2 + 10) { p.got = true; this.applyPower(p.type); }
    }
    this.powerups = this.powerups.filter((p) => !p.got && p.y < H + 20);

    if (this.bricks.every((b) => b.hp <= 0)) {
      this.level++;
      this.score += 500;
      this.ctx.setScore(this.score);
      this.ctx.audio.chime();
      this.banner = 1.8;
      this.build();
      this.powerups = [];
      this.resetBall();
    }
    this.ctx.setInfo(`Level ${this.level} · Lives ${this.lives}`);
  }

  hitBrick(br) {
    br.hp--;
    this.score += 10;
    this.ctx.audio.tone({ freq: 400 + br.hp * 150, type: 'square', dur: 0.05, vol: 0.07 });
    if (br.hp <= 0) {
      this.score += 25 * br.max;
      this.parts.burst(br.x + br.w / 2, br.y + br.h / 2, this.brickColor(br), 16, 150, 0.5);
      if (Math.random() < 0.14) {
        const types = ['multi', 'multi', 'wide', 'slow', 'life'];
        this.powerups.push({ x: br.x + br.w / 2, y: br.y + br.h / 2, type: types[Math.floor(Math.random() * types.length)] });
      }
    }
    this.ctx.setScore(this.score);
  }

  applyPower(type) {
    this.ctx.audio.pickup();
    if (type === 'multi') {
      const extra = [];
      for (const b of this.balls.slice(0, 3)) {
        if (b.stuck) continue;
        [-0.4, 0.4].forEach((d) => {
          const a = Math.atan2(b.vx, -b.vy) + d;
          extra.push({ x: b.x, y: b.y, vx: Math.sin(a) * this.baseSpeed(), vy: -Math.cos(a) * this.baseSpeed() });
        });
      }
      this.balls.push(...extra.slice(0, 8 - this.balls.length));
    } else if (type === 'wide') this.wideT = 12;
    else if (type === 'slow') this.slowT = 10;
    else if (type === 'life') this.lives = Math.min(5, this.lives + 1);
  }

  brickColor(br) { return br.max === 3 ? (br.hp === 3 ? '#f472b6' : br.hp === 2 ? '#c084fc' : '#22d3ee') : br.max === 2 ? (br.hp === 2 ? '#a855f7' : '#22d3ee') : '#38bdf8'; }

  draw(g, dt) {
    const { W, H } = this;
    this.parts.update(dt);
    if (this.banner > 0) this.banner -= dt;
    g.fillStyle = '#05030f'; g.fillRect(0, 0, W, H);
    drawStars(g, this.stars, this.t, W, H);

    for (const br of this.bricks) {
      if (br.hp <= 0) continue;
      const c = this.brickColor(br);
      g.save();
      g.shadowColor = c; g.shadowBlur = 10;
      g.fillStyle = c; g.globalAlpha = 0.25 + 0.25 * (br.hp / br.max);
      g.beginPath(); g.roundRect(br.x, br.y, br.w, br.h, 5); g.fill();
      g.globalAlpha = 1; g.strokeStyle = c; g.lineWidth = 1.5; g.stroke();
      g.restore();
      // Hex shield pattern
      g.strokeStyle = 'rgba(255,255,255,0.18)';
      g.beginPath(); g.moveTo(br.x + 6, br.y + br.h / 2); g.lineTo(br.x + br.w - 6, br.y + br.h / 2); g.stroke();
    }

    for (const p of this.powerups) {
      const P = POWERS[p.type];
      g.save(); g.shadowColor = P.color; g.shadowBlur = 14; g.fillStyle = P.color;
      g.beginPath(); g.roundRect(p.x - 14, p.y - 9, 28, 18, 9); g.fill(); g.restore();
      this.text(g, P.label, p.x, p.y + 1, { size: 12, color: '#05030f', align: 'center', weight: 900 });
    }

    const py = H - 40;
    g.save(); g.shadowColor = '#22d3ee'; g.shadowBlur = 18;
    const pg = g.createLinearGradient(this.px - this.pw / 2, 0, this.px + this.pw / 2, 0);
    pg.addColorStop(0, '#22d3ee'); pg.addColorStop(1, '#a855f7');
    g.fillStyle = pg; g.beginPath(); g.roundRect(this.px - this.pw / 2, py - 6, this.pw, 12, 6); g.fill(); g.restore();

    for (const b of this.balls) {
      g.save(); g.shadowColor = '#facc15'; g.shadowBlur = 16;
      const bg = g.createRadialGradient(b.x - 2, b.y - 2, 1, b.x, b.y, 8);
      bg.addColorStop(0, '#fff'); bg.addColorStop(1, '#f97316');
      g.fillStyle = bg; g.beginPath(); g.arc(b.x, b.y, 7, 0, Math.PI * 2); g.fill(); g.restore();
    }
    this.parts.draw(g);

    this.text(g, `LV ${this.level}`, 14, 24, { size: 14, color: '#a78bfa' });
    for (let i = 0; i < this.lives; i++) { g.fillStyle = '#f472b6'; g.beginPath(); g.arc(W - 18 - i * 20, 24, 6, 0, Math.PI * 2); g.fill(); }
    if (this.wideT > 0) this.text(g, `WIDE ${Math.ceil(this.wideT)}`, W / 2 - 50, 24, { size: 11, color: '#c084fc', align: 'center' });
    if (this.slowT > 0) this.text(g, `SLOW ${Math.ceil(this.slowT)}`, W / 2 + 50, 24, { size: 11, color: '#4ade80', align: 'center' });
    if (this.balls.some((b) => b.stuck) && this.state === 'play') this.text(g, 'CLICK / SPACE TO LAUNCH', W / 2, H - 90, { size: 13, color: 'rgba(226,232,240,0.7)', align: 'center' });
    if (this.banner > 0) this.text(g, `LEVEL ${this.level}`, W / 2, H / 2, { size: 36, color: '#fff', align: 'center', glow: '#a855f7', weight: 900 });
  }
}
