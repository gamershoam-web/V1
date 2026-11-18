// Black Hole Pong — classic Pong vs AI; a central gravity well bends the ball's path.
import { CanvasGame, Particles, clamp, makeStars, drawStars } from './canvas.js';

const WIN = 7;

export default class BlackHolePong extends CanvasGame {
  constructor(root, ctx) {
    super(root, ctx, 800, 480);
    this.readyText = ['BLACK HOLE PONG', 'Move: mouse / touch drag, or W S / ↑ ↓', `First to ${WIN} wins. Mind the gravity well!`];
    this.ph = 92; this.pw = 12;
    this.py = this.H / 2; this.ay = this.H / 2; this.targetY = this.H / 2;
    this.ps = 0; this.as = 0;
    this.parts = new Particles();
    this.stars = makeStars(90, this.W, this.H);
    this.trail = [];
    this.serve(1);
  }

  serve(dir) {
    this.ball = { x: this.W / 2 + dir * 160, y: this.H / 2 + (Math.random() - 0.5) * 200, vx: 0, vy: 0 };
    this.speed = 360;
    this.waiting = 0.9;
    this.serveDir = dir;
    this.trail = [];
  }

  onPointerMove(p) { this.targetY = p.y; this.usePointer = true; }
  onPointerDown(p) { this.targetY = p.y; this.usePointer = true; }

  update(dt) {
    const { W, H } = this;
    // Player paddle
    let kb = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) kb -= 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) kb += 1;
    if (kb) { this.usePointer = false; this.py += kb * 560 * dt; } else if (this.usePointer) this.py += (this.targetY - this.py) * Math.min(1, dt * 18);
    this.py = clamp(this.py, this.ph / 2, H - this.ph / 2);

    // AI paddle: tracks with limited speed; reacts when ball approaches.
    const b = this.ball;
    const aiSpeed = 300 + this.ps * 22;
    const goal = b.vx > 0 ? b.y + Math.sin(this.t * 2) * 18 : H / 2;
    const d = goal - this.ay;
    this.ay += clamp(d, -aiSpeed * dt, aiSpeed * dt);
    this.ay = clamp(this.ay, this.ph / 2, H - this.ph / 2);

    if (this.waiting > 0) {
      this.waiting -= dt;
      if (this.waiting <= 0) {
        const a = (Math.random() - 0.5) * 0.8;
        b.vx = Math.cos(a) * this.speed * this.serveDir;
        b.vy = Math.sin(a) * this.speed;
        this.ctx.audio.zap();
      }
      return;
    }

    // Gravity well: acceleration toward the centre, direction-only (speed stays constant).
    const cx = W / 2, cy = H / 2;
    const dx = cx - b.x, dy = cy - b.y;
    const dist2 = Math.max(dx * dx + dy * dy, 55 * 55);
    if (dist2 < 230 * 230) {
      const acc = 2.4e6 / dist2;
      const dd = Math.sqrt(dist2);
      b.vx += (dx / dd) * acc * dt;
      b.vy += (dy / dd) * acc * dt;
    }
    const mag = Math.hypot(b.vx, b.vy);
    b.vx = (b.vx / mag) * this.speed; b.vy = (b.vy / mag) * this.speed;
    if (Math.abs(b.vx) < this.speed * 0.45) {
      b.vx = Math.sign(b.vx || 1) * this.speed * 0.45;
      b.vy = Math.sign(b.vy || 1) * Math.sqrt(this.speed ** 2 - b.vx ** 2);
    }

    b.x += b.vx * dt; b.y += b.vy * dt;
    this.trail.push([b.x, b.y]); if (this.trail.length > 18) this.trail.shift();

    if (b.y < 8) { b.y = 8; b.vy = Math.abs(b.vy); this.ctx.audio.bounce(); }
    if (b.y > H - 8) { b.y = H - 8; b.vy = -Math.abs(b.vy); this.ctx.audio.bounce(); }

    const hitPaddle = (px, py, dir) => {
      const off = clamp((b.y - py) / (this.ph / 2), -1, 1);
      const ang = off * (Math.PI / 3);
      this.speed = Math.min(820, this.speed * 1.05);
      b.vx = Math.cos(ang) * this.speed * dir;
      b.vy = Math.sin(ang) * this.speed;
      this.parts.burst(px, b.y, dir > 0 ? '#22d3ee' : '#f472b6', 12, 140, 0.4);
      this.ctx.audio.hit();
    };
    if (b.vx < 0 && b.x < 30 + 8 && b.x > 14 && Math.abs(b.y - this.py) < this.ph / 2 + 8) { b.x = 38; hitPaddle(30, this.py, 1); }
    if (b.vx > 0 && b.x > W - 38 && b.x < W - 14 && Math.abs(b.y - this.ay) < this.ph / 2 + 8) { b.x = W - 38; hitPaddle(W - 30, this.ay, -1); }

    if (b.x < -20 || b.x > W + 20) {
      const playerScored = b.x > W;
      if (playerScored) { this.ps++; this.ctx.audio.pickup(); } else { this.as++; this.ctx.audio.error(); }
      this.parts.burst(playerScored ? W - 10 : 10, b.y, playerScored ? '#4ade80' : '#f43f5e', 30, 200);
      this.ctx.setScore(this.ps * 100);
      this.ctx.setInfo(`You ${this.ps} – ${this.as} AI`);
      if (this.ps >= WIN || this.as >= WIN) {
        const won = this.ps >= WIN;
        this.after(600, () => this.end(this.ps * 100 + (won ? 500 : 0), {
          won, title: won ? 'Gravity tamed!' : 'Pulled into the void',
          message: `Final score: You ${this.ps} – ${this.as} AI${won ? ' (+500 win bonus)' : ''}`,
        }));
        this.state = 'dying';
      } else this.serve(playerScored ? -1 : 1);
    }
  }

  draw(g, dt) {
    const { W, H } = this;
    this.parts.update(dt);
    g.fillStyle = '#05030f'; g.fillRect(0, 0, W, H);
    drawStars(g, this.stars, this.t, W, H);

    // Centre line
    g.strokeStyle = 'rgba(148,130,255,0.25)'; g.setLineDash([10, 14]); g.lineWidth = 2;
    g.beginPath(); g.moveTo(W / 2, 0); g.lineTo(W / 2, H / 2 - 90); g.moveTo(W / 2, H / 2 + 90); g.lineTo(W / 2, H); g.stroke();
    g.setLineDash([]);

    // Black hole with accretion disk
    const cx = W / 2, cy = H / 2;
    const halo = g.createRadialGradient(cx, cy, 20, cx, cy, 230);
    halo.addColorStop(0, 'rgba(168,85,247,0.35)'); halo.addColorStop(0.4, 'rgba(124,58,237,0.1)'); halo.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = halo; g.beginPath(); g.arc(cx, cy, 230, 0, Math.PI * 2); g.fill();
    g.save(); g.translate(cx, cy);
    for (let i = 0; i < 26; i++) {
      const a = this.t * (1.2 + (i % 5) * 0.2) + i * 0.7;
      const r = 34 + (i % 7) * 7;
      g.strokeStyle = `hsla(${280 + (i % 4) * 25},95%,${55 + (i % 3) * 10}%,${0.35 + (i % 3) * 0.15})`;
      g.lineWidth = 2;
      g.beginPath(); g.ellipse(0, 0, r, r * 0.45, -0.3, a, a + 1.2); g.stroke();
    }
    g.fillStyle = '#000'; g.shadowColor = '#f472b6'; g.shadowBlur = 25;
    g.beginPath(); g.arc(0, 0, 24, 0, Math.PI * 2); g.fill();
    g.restore();

    // Paddles
    const paddle = (x, y, c) => {
      g.save(); g.shadowColor = c; g.shadowBlur = 20; g.fillStyle = c;
      g.beginPath(); g.roundRect(x - this.pw / 2, y - this.ph / 2, this.pw, this.ph, 6); g.fill(); g.restore();
    };
    paddle(24, this.py, '#22d3ee');
    paddle(W - 24, this.ay, '#f472b6');

    // Ball + trail
    const b = this.ball;
    this.trail.forEach(([x, y], i) => {
      g.fillStyle = `rgba(250,204,21,${(i / this.trail.length) * 0.4})`;
      g.beginPath(); g.arc(x, y, 3 + (i / this.trail.length) * 4, 0, Math.PI * 2); g.fill();
    });
    g.save(); g.shadowColor = '#facc15'; g.shadowBlur = 18; g.fillStyle = '#fef3c7';
    g.beginPath(); g.arc(b.x, b.y, 8, 0, Math.PI * 2); g.fill(); g.restore();
    this.parts.draw(g);

    this.text(g, String(this.ps), W / 2 - 60, 36, { size: 34, color: '#22d3ee', align: 'center', glow: '#22d3ee' });
    this.text(g, String(this.as), W / 2 + 60, 36, { size: 34, color: '#f472b6', align: 'center', glow: '#f472b6' });
    this.text(g, 'YOU', 24, H - 16, { size: 11, color: '#64748b' });
    this.text(g, 'AI', W - 24, H - 16, { size: 11, color: '#64748b', align: 'right' });
  }
}
