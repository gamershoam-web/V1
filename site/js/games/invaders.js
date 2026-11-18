// Galactic Invaders Blitz — wave shooter with diving squadrons, destructible bunkers and laser upgrades.
import { CanvasGame, Particles, clamp, rand, makeStars, drawStars } from './canvas.js';

const SPRITES = [
  ['..X.....X..', '...X...X...', '..XXXXXXX..', '.XX.XXX.XX.', 'XXXXXXXXXXX', 'X.XXXXXXX.X', 'X.X.....X.X', '...XX.XX...'],
  ['...XXXXX...', '.XXXXXXXXX.', 'XXX..X..XXX', 'XXXXXXXXXXX', '..XX...XX..', '.XX.XXX.XX.', 'XX.......XX', '.X.......X.'],
  ['....XXX....', '..XXXXXXX..', '.XX.XXX.XX.', 'XXXXXXXXXXX', '.X.XXXXX.X.', 'X.........X', '.X.......X.', '..X.....X..'],
];
const ROW_TYPE = [2, 1, 1, 0, 0];
const ROW_COLOR = ['#f472b6', '#c084fc', '#c084fc', '#22d3ee', '#22d3ee'];
const ROW_PTS = [30, 20, 20, 10, 10];
const BUNKER = ['..XXXXXXXXXX..', '.XXXXXXXXXXXX.', 'XXXXXXXXXXXXXX', 'XXXXXXXXXXXXXX', 'XXXXXXXXXXXXXX', 'XXXX......XXXX', 'XXX........XXX'];

export default class InvadersBlitz extends CanvasGame {
  constructor(root, ctx) {
    super(root, ctx, 560, 680);
    this.readyText = ['GALACTIC INVADERS BLITZ', '← → / A D move · Space fire (hold) · Touch: drag to move, auto-fire', 'Catch L for laser upgrades, R for rapid fire'];
    this.parts = new Particles();
    this.stars = makeStars(100, this.W, this.H);
    this.px = this.W / 2; this.lives = 3; this.score = 0; this.wave = 1;
    this.laser = 1; this.rapidT = 0; this.cool = 0; this.inv = 0;
    this.shots = []; this.bombs = []; this.drops = [];
    this.ufo = null; this.ufoT = rand(12, 20);
    this.setupWave();
  }

  setupWave() {
    this.aliens = [];
    const top = 90 + Math.min(4, this.wave - 1) * 14;
    for (let r = 0; r < 5; r++) for (let c = 0; c < 9; c++) {
      this.aliens.push({ r, c, slotX: c * 48, slotY: r * 40, x: 0, y: 0, alive: true, dive: null });
    }
    this.fx = 40; this.fy = top; this.dir = 1;
    this.stepT = 0; this.frame = 0;
    this.diveT = rand(4, 7);
    this.bombT = 1.2;
    this.bunkers = [0, 1, 2, 3].map((i) => ({
      x: 70 + i * 128, y: this.H - 150,
      cells: BUNKER.map((row) => [...row].map((ch) => ch === 'X')),
    }));
    this.shots = []; this.bombs = [];
    this.banner = 1.6;
  }

  onPointerDown(p) { this.targetX = p.x; }
  onPointerMove(p) { if (this.pointer.down) this.targetX = p.x; }
  onBegin() { if (this.pointer.down) this.targetX = this.pointer.x; }

  fire() {
    const rate = this.rapidT > 0 ? 0.16 : 0.38;
    if (this.cool > 0) return;
    this.cool = rate;
    const y = this.H - 70;
    const spread = this.laser === 1 ? [[0, 0]] : this.laser === 2 ? [[-8, 0], [8, 0]] : [[-10, -90], [0, 0], [10, 90]];
    spread.forEach(([dx, vx]) => this.shots.push({ x: this.px + dx, y, vx, vy: -560 }));
    this.ctx.audio.laser();
  }

  alienPos(a) {
    if (a.dive) return [a.dive.x, a.dive.y];
    return [this.fx + a.slotX, this.fy + a.slotY];
  }

  update(dt) {
    const { W, H } = this;
    // Player movement
    let mv = 0;
    if (this.keys.has('ArrowLeft') || this.keys.has('KeyA')) mv -= 1;
    if (this.keys.has('ArrowRight') || this.keys.has('KeyD')) mv += 1;
    if (mv) { this.px += mv * 330 * dt; this.targetX = null; } else if (this.targetX != null && this.pointer.down) this.px += clamp(this.targetX - this.px, -420 * dt, 420 * dt);
    this.px = clamp(this.px, 24, W - 24);
    this.cool -= dt; this.rapidT -= dt; this.inv -= dt;
    if (this.keys.has('Space') || this.keys.has('ArrowUp') || (this.pointer.down && this.inv < 1.6)) this.fire();

    // Formation movement
    const alive = this.aliens.filter((a) => a.alive);
    const formation = alive.filter((a) => !a.dive);
    const speed = (26 + this.wave * 6) * (1 + (45 - alive.length) / 18);
    this.fx += this.dir * speed * dt;
    if (formation.length) {
      const xs = formation.map((a) => this.fx + a.slotX);
      if (Math.max(...xs) > W - 40 && this.dir > 0) { this.dir = -1; this.fy += 16; }
      if (Math.min(...xs) < 18 && this.dir < 0) { this.dir = 1; this.fy += 16; }
    }
    this.stepT += dt; if (this.stepT > 0.45) { this.stepT = 0; this.frame ^= 1; }

    // Diving squadrons
    this.diveT -= dt;
    if (this.diveT <= 0 && formation.length > 3) {
      this.diveT = rand(Math.max(2.5, 6 - this.wave * 0.4), Math.max(4, 9 - this.wave * 0.5));
      const cols = {};
      formation.forEach((a) => { if (!cols[a.c] || cols[a.c].r < a.r) cols[a.c] = a; });
      const bottoms = Object.values(cols).sort(() => Math.random() - 0.5).slice(0, Math.min(3, 1 + Math.floor(this.wave / 2)));
      bottoms.forEach((a, k) => {
        const [x, y] = this.alienPos(a);
        a.dive = { x, y, t: -k * 0.3, phase: rand(0, 6), returning: false, shot: false };
      });
      this.ctx.audio.tone({ freq: 900, type: 'sawtooth', dur: 0.4, vol: 0.06, slide: -600 });
    }
    for (const a of alive) {
      if (!a.dive) continue;
      const d = a.dive;
      d.t += dt;
      if (d.t < 0) continue;
      if (!d.returning) {
        d.y += (150 + this.wave * 12) * dt;
        d.x += Math.sin(d.t * 3 + d.phase) * 160 * dt + clamp(this.px - d.x, -60, 60) * dt;
        if (!d.shot && d.y > 280) { d.shot = true; this.bombs.push({ x: d.x, y: d.y + 10, vy: 320 }); }
        if (d.y > H + 30) { d.returning = true; d.y = -30; }
      } else {
        const [tx, ty] = [this.fx + a.slotX, this.fy + a.slotY];
        d.x += (tx - d.x) * Math.min(1, dt * 3);
        d.y += (ty - d.y) * Math.min(1, dt * 3);
        if (Math.hypot(tx - d.x, ty - d.y) < 3) a.dive = null;
      }
    }

    // Formation bombs
    this.bombT -= dt;
    if (this.bombT <= 0 && formation.length) {
      this.bombT = Math.max(0.35, 1.3 - this.wave * 0.1) * rand(0.6, 1.3);
      const cols = {};
      formation.forEach((a) => { if (!cols[a.c] || cols[a.c].r < a.r) cols[a.c] = a; });
      const shooters = Object.values(cols);
      const s = shooters[Math.floor(Math.random() * shooters.length)];
      const [x, y] = this.alienPos(s);
      this.bombs.push({ x: x + 11, y: y + 18, vy: 220 + this.wave * 15 });
    }

    // UFO bonus ship
    this.ufoT -= dt;
    if (this.ufoT <= 0 && !this.ufo) { this.ufo = { x: -40, vx: 120 }; this.ufoT = rand(18, 28); }
    if (this.ufo) { this.ufo.x += this.ufo.vx * dt; if (this.ufo.x > W + 50) this.ufo = null; }

    // Projectiles
    for (const s of this.shots) { s.x += s.vx * dt; s.y += s.vy * dt; }
    for (const b of this.bombs) b.y += b.vy * dt;
    for (const d of this.drops) d.y += 120 * dt;

    // Shots vs aliens / ufo / bunkers
    for (const s of this.shots) {
      if (this.hitBunker(s.x, s.y, 2)) { s.dead = true; continue; }
      if (this.ufo && Math.abs(s.x - this.ufo.x) < 26 && Math.abs(s.y - 50) < 12) {
        s.dead = true;
        const pts = [100, 150, 200, 300][Math.floor(Math.random() * 4)];
        this.addScore(pts);
        this.parts.burst(this.ufo.x, 50, '#facc15', 40, 220);
        this.ctx.audio.explosion();
        this.ufo = null;
        continue;
      }
      for (const a of alive) {
        if (!a.alive) continue;
        const [x, y] = this.alienPos(a);
        if (s.x > x - 2 && s.x < x + 24 && s.y > y - 2 && s.y < y + 20) {
          a.alive = false; s.dead = true;
          this.addScore(ROW_PTS[a.r] * (a.dive ? 2 : 1));
          this.parts.burst(x + 11, y + 8, ROW_COLOR[a.r], 18, 160, 0.5);
          this.ctx.audio.explosion();
          if (Math.random() < 0.08) this.drops.push({ x: x + 11, y: y + 10, type: Math.random() < 0.6 ? 'L' : 'R' });
          break;
        }
      }
    }
    // Bombs vs bunkers / player
    for (const b of this.bombs) {
      if (this.hitBunker(b.x, b.y, 3)) { b.dead = true; continue; }
      if (this.inv <= 0 && Math.abs(b.x - this.px) < 20 && b.y > H - 72 && b.y < H - 44) { b.dead = true; this.playerHit(); }
    }
    // Divers ramming the player
    for (const a of alive) {
      if (!a.alive || !a.dive) continue;
      if (this.inv <= 0 && Math.abs(a.dive.x + 11 - this.px) < 26 && Math.abs(a.dive.y + 8 - (H - 58)) < 18) {
        a.alive = false; this.parts.burst(a.dive.x, a.dive.y, ROW_COLOR[a.r], 20); this.playerHit();
      }
      this.hitBunker(a.dive.x + 11, a.dive.y + 8, 8);
    }
    // Drops
    for (const d of this.drops) {
      if (Math.abs(d.x - this.px) < 24 && d.y > H - 76 && d.y < H - 40) {
        d.got = true;
        if (d.type === 'L') { this.laser = Math.min(3, this.laser + 1); this.ctx.toast(`Laser upgraded to level ${this.laser}`, { icon: '🔫' }); } else this.rapidT = 10;
        this.ctx.audio.pickup();
      }
    }

    this.shots = this.shots.filter((s) => !s.dead && s.y > -10 && s.x > -10 && s.x < W + 10);
    this.bombs = this.bombs.filter((b) => !b.dead && b.y < H + 10);
    this.drops = this.drops.filter((d) => !d.got && d.y < H + 10);

    // Formation reached the base?
    if (formation.some((a) => this.fy + a.slotY > H - 120)) { this.lives = 0; this.playerHit(true); }

    if (!this.aliens.some((a) => a.alive)) {
      this.wave++;
      this.addScore(250);
      this.ctx.audio.chime();
      this.setupWave();
    }
    this.ctx.setInfo(`Wave ${this.wave} · Lives ${this.lives} · Laser L${this.laser}`);
  }

  addScore(n) { this.score += n; this.ctx.setScore(this.score); }

  playerHit(fatal = false) {
    this.parts.burst(this.px, this.H - 58, '#22d3ee', 40, 240, 0.9);
    this.ctx.audio.explosion();
    if (!fatal) this.lives--;
    this.laser = Math.max(1, this.laser - 1);
    this.inv = 2;
    this.shake = 0.4;
    if (this.lives <= 0 && this.state === 'play') {
      this.state = 'dying';
      this.after(1000, () => this.end(this.score, { title: 'Earth has fallen', message: `You held out until wave ${this.wave}.` }));
    }
  }

  hitBunker(x, y, radius) {
    for (const b of this.bunkers) {
      const cs = 4;
      const lx = Math.floor((x - b.x) / cs), ly = Math.floor((y - b.y) / cs);
      if (lx < -radius || ly < -radius || lx >= 14 + radius || ly >= 7 + radius) continue;
      if (ly >= 0 && ly < 7 && lx >= 0 && lx < 14 && b.cells[ly][lx]) {
        for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) {
          const yy = ly + dy, xx = lx + dx;
          if (yy >= 0 && yy < 7 && xx >= 0 && xx < 14 && dx * dx + dy * dy <= radius * radius && Math.random() < 0.85) b.cells[yy][xx] = false;
        }
        return true;
      }
    }
    return false;
  }

  drawSprite(g, sprite, x, y, color, px = 2) {
    g.fillStyle = color;
    sprite.forEach((row, r) => { for (let c = 0; c < row.length; c++) if (row[c] === 'X') g.fillRect(x + c * px, y + r * px, px, px); });
  }

  draw(g, dt) {
    const { W, H } = this;
    this.parts.update(dt);
    if (this.banner > 0) this.banner -= dt;
    if (this.shake > 0) this.shake -= dt;
    g.save();
    if (this.shake > 0) g.translate(rand(-5, 5), rand(-5, 5));
    g.fillStyle = '#05030f'; g.fillRect(-10, -10, W + 20, H + 20);
    drawStars(g, this.stars, this.t, W, H, 10, dt);

    // Bunkers
    for (const b of this.bunkers) {
      g.fillStyle = '#4ade80';
      b.cells.forEach((row, r) => row.forEach((on, c) => { if (on) g.fillRect(b.x + c * 4, b.y + r * 4, 4, 4); }));
    }
    // Aliens
    g.save(); g.shadowBlur = 8;
    for (const a of this.aliens) {
      if (!a.alive) continue;
      const [x, y] = this.alienPos(a);
      g.shadowColor = ROW_COLOR[a.r];
      const sprite = SPRITES[ROW_TYPE[a.r]];
      const anim = this.frame ? sprite : sprite.map((row, i) => (i >= 6 ? row.split('').reverse().join('') : row));
      this.drawSprite(g, anim, x, y, a.dive ? '#fde047' : ROW_COLOR[a.r]);
    }
    g.restore();
    // UFO
    if (this.ufo) {
      g.save(); g.shadowColor = '#facc15'; g.shadowBlur = 14; g.fillStyle = '#facc15';
      g.beginPath(); g.ellipse(this.ufo.x, 50, 24, 8, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#fef9c3'; g.beginPath(); g.ellipse(this.ufo.x, 44, 10, 7, 0, Math.PI, 0); g.fill(); g.restore();
    }
    // Shots & bombs
    g.save(); g.shadowBlur = 10;
    g.fillStyle = '#22d3ee'; g.shadowColor = '#22d3ee';
    for (const s of this.shots) g.fillRect(s.x - 1.5, s.y - 8, 3, 14);
    g.fillStyle = '#f472b6'; g.shadowColor = '#f472b6';
    for (const b of this.bombs) { g.beginPath(); g.moveTo(b.x, b.y + 8); g.lineTo(b.x - 4, b.y); g.lineTo(b.x + 4, b.y); g.fill(); }
    g.restore();
    for (const d of this.drops) {
      g.save(); g.shadowBlur = 12; g.shadowColor = d.type === 'L' ? '#22d3ee' : '#facc15';
      g.fillStyle = g.shadowColor; g.beginPath(); g.roundRect(d.x - 11, d.y - 9, 22, 18, 5); g.fill(); g.restore();
      this.text(g, d.type, d.x, d.y + 1, { size: 12, color: '#05030f', align: 'center', weight: 900 });
    }
    // Player
    if (this.state !== 'dying' && (this.inv <= 0 || Math.floor(this.t * 12) % 2)) {
      const x = this.px, y = H - 58;
      g.save(); g.shadowColor = '#22d3ee'; g.shadowBlur = 16;
      g.fillStyle = '#e2e8f0';
      g.beginPath(); g.moveTo(x, y - 16); g.lineTo(x + 20, y + 10); g.lineTo(x - 20, y + 10); g.closePath(); g.fill();
      g.fillStyle = '#22d3ee'; g.fillRect(x - 3, y - 22, 6, 10);
      if (this.laser > 1) { g.fillStyle = '#a855f7'; g.fillRect(x - 16, y - 2, 4, 10); g.fillRect(x + 12, y - 2, 4, 10); }
      g.restore();
    }
    this.parts.draw(g);
    g.restore();

    g.strokeStyle = 'rgba(74,222,128,0.4)'; g.beginPath(); g.moveTo(0, H - 30); g.lineTo(W, H - 30); g.stroke();
    for (let i = 0; i < this.lives; i++) this.drawSprite(g, ['..X..', '.XXX.', 'XXXXX'], 14 + i * 22, H - 20, '#22d3ee', 3);
    this.text(g, `WAVE ${this.wave}`, W - 14, H - 14, { size: 12, color: '#a78bfa', align: 'right' });
    if (this.rapidT > 0) this.text(g, `RAPID ${Math.ceil(this.rapidT)}`, W / 2, H - 14, { size: 11, color: '#facc15', align: 'center' });
    if (this.banner > 0 && this.state === 'play') this.text(g, `WAVE ${this.wave}`, W / 2, H / 2, { size: 40, color: '#fff', align: 'center', glow: '#a855f7', weight: 900 });
  }
}
