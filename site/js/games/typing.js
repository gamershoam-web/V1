// Laser Typing Defense — type the word on a descending alien ship to fire at it.
import { CanvasGame, Particles, rand, makeStars, drawStars } from './canvas.js';

const SHORT = ['orbit', 'laser', 'comet', 'star', 'nova', 'moon', 'alien', 'probe', 'mars', 'void', 'warp', 'ion', 'flux', 'core', 'beam', 'zap', 'dock', 'hull', 'jet', 'ray', 'sky', 'dust', 'gas', 'ufo', 'byte'];
const MEDIUM = ['rocket', 'galaxy', 'nebula', 'quasar', 'pulsar', 'plasma', 'photon', 'meteor', 'cosmic', 'saturn', 'jupiter', 'gravity', 'eclipse', 'shuttle', 'orbital', 'stellar', 'crater', 'lunar', 'cyborg', 'reactor', 'thruster', 'module'];
const LONG = ['asteroid', 'starship', 'wormhole', 'supernova', 'andromeda', 'telescope', 'satellite', 'spacesuit', 'hyperdrive', 'astronaut', 'blackhole', 'cosmonaut', 'interstellar', 'constellation', 'mothership', 'antimatter'];

export default class LaserTyping extends CanvasGame {
  constructor(root, ctx) {
    super(root, ctx, 720, 520);
    this.readyText = ['LASER TYPING DEFENSE', 'Type the word on an alien ship to lock on and fire', 'Protect the base: 3 shield charges'];
    this.ships = []; this.lasers = [];
    this.parts = new Particles();
    this.stars = makeStars(110, this.W, this.H);
    this.target = null; this.score = 0; this.kills = 0; this.wave = 1; this.hp = 3;
    this.spawnT = 0.5; this.combo = 0; this.cannonAng = -Math.PI / 2; this.flash = 0;

    const bar = document.createElement('div');
    bar.className = 'typing-bar';
    bar.innerHTML = '<input class="typing-input" type="text" placeholder="Type here…" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" aria-label="Type the words">';
    root.appendChild(bar);
    this.input = bar.querySelector('input');
    this.on(this.input, 'input', () => {
      const v = this.input.value.toLowerCase();
      this.input.value = '';
      for (const ch of v) if (/[a-z]/.test(ch)) this.typeChar(ch);
    });
    this.on(this.input, 'keydown', (e) => { if (e.key === 'Escape') this.input.blur(); });
    this.on(this.canvas, 'pointerup', () => this.input.focus({ preventScroll: true }));
    this.after(50, () => this.input.focus({ preventScroll: true }));
  }

  begin() { super.begin(); this.input.focus({ preventScroll: true }); }

  typeChar(ch) {
    if (this.state === 'ready') this.begin();
    if (this.state !== 'play') return;
    if (!this.target) {
      const cands = this.ships.filter((s) => !s.dead && s.word[0] === ch).sort((a, b) => b.y - a.y);
      if (!cands.length) { this.miss(); return; }
      this.target = cands[0];
      this.target.typed = 0;
    }
    const t = this.target;
    if (t.word[t.typed] === ch) {
      t.typed++;
      this.fire(t);
      if (t.typed >= t.word.length) this.destroyShip(t);
    } else this.miss();
  }

  miss() { this.combo = 0; this.ctx.audio.error(); this.flash = 0.15; }

  fire(t) {
    const bx = this.W / 2, by = this.H - 34;
    this.cannonAng = Math.atan2(t.y - by, t.x - bx);
    this.lasers.push({ x1: bx, y1: by, x2: t.x + rand(-10, 10), y2: t.y + 10, life: 0.12 });
    this.ctx.audio.laser();
  }

  destroyShip(s) {
    s.dead = true;
    this.target = null;
    this.combo++;
    this.kills++;
    const pts = s.word.length * 10 * Math.min(4, 1 + Math.floor(this.combo / 5));
    this.score += pts;
    this.ctx.setScore(this.score);
    this.parts.burst(s.x, s.y, s.color, 34, 220);
    this.parts.burst(s.x, s.y, '#fff', 10, 120);
    this.ctx.audio.explosion();
    if (this.kills % 10 === 0) { this.wave++; this.waveBanner = 2; this.ctx.audio.chime(); }
  }

  spawn() {
    const w = this.wave;
    const r = Math.random();
    const pool = w < 2 ? SHORT : w < 4 ? (r < 0.6 ? SHORT : MEDIUM) : w < 6 ? (r < 0.3 ? SHORT : r < 0.8 ? MEDIUM : LONG) : (r < 0.5 ? MEDIUM : LONG);
    const used = new Set(this.ships.filter((s) => !s.dead).map((s) => s.word[0]));
    let word = pool[Math.floor(Math.random() * pool.length)];
    for (let i = 0; i < 8 && used.has(word[0]); i++) word = pool[Math.floor(Math.random() * pool.length)];
    const half = word.length * 6 + 30;
    this.ships.push({
      word, typed: 0, x: rand(half, this.W - half), y: -20,
      vy: 14 + w * 3.2 + rand(0, 6), wob: rand(0, 6),
      color: ['#f472b6', '#4ade80', '#facc15', '#38bdf8', '#c084fc'][Math.floor(Math.random() * 5)],
    });
  }

  update(dt) {
    this.spawnT -= dt;
    const alive = this.ships.filter((s) => !s.dead).length;
    if (this.spawnT <= 0 && alive < 3 + Math.floor(this.wave / 2)) {
      this.spawn();
      this.spawnT = Math.max(1.0, 2.8 - this.wave * 0.22);
    }
    for (const s of this.ships) {
      if (s.dead) continue;
      s.y += s.vy * dt;
      s.x += Math.sin(this.t * 1.5 + s.wob) * 12 * dt;
      if (s.y > this.H - 60) {
        s.dead = true;
        if (this.target === s) this.target = null;
        this.hp--;
        this.combo = 0;
        this.parts.burst(s.x, this.H - 50, '#f43f5e', 40, 240);
        this.ctx.audio.explosion();
        this.shake = 0.4;
        if (this.hp <= 0) {
          this.state = 'dying';
          this.after(900, () => this.end(this.score, { title: 'Base overrun', message: `You reached wave ${this.wave} and destroyed ${this.kills} ships.` }));
        }
      }
    }
    this.ships = this.ships.filter((s) => !s.dead);
    this.ctx.setInfo(`Wave ${this.wave} · Shields ${Math.max(0, this.hp)}`);
  }

  draw(g, dt) {
    const { W, H } = this;
    this.parts.update(dt);
    for (const l of this.lasers) l.life -= dt;
    this.lasers = this.lasers.filter((l) => l.life > 0);
    if (this.flash > 0) this.flash -= dt;
    if (this.shake > 0) this.shake -= dt;
    if (this.waveBanner > 0) this.waveBanner -= dt;

    g.save();
    if (this.shake > 0) g.translate(rand(-5, 5), rand(-5, 5));
    g.fillStyle = '#05030f'; g.fillRect(-10, -10, W + 20, H + 20);
    drawStars(g, this.stars, this.t, W, H, 14, dt);

    // Base
    const grd = g.createLinearGradient(0, H - 50, 0, H);
    grd.addColorStop(0, 'rgba(34,211,238,0.25)'); grd.addColorStop(1, 'rgba(34,211,238,0.02)');
    g.fillStyle = grd; g.fillRect(0, H - 50, W, 50);
    g.strokeStyle = `rgba(34,211,238,${0.4 + this.hp * 0.15})`; g.lineWidth = 2;
    g.beginPath(); g.moveTo(0, H - 50); g.lineTo(W, H - 50); g.stroke();
    for (let i = 0; i < 3; i++) {
      g.fillStyle = i < this.hp ? '#22d3ee' : 'rgba(255,255,255,0.12)';
      g.fillRect(16 + i * 26, H - 22, 20, 8);
    }

    // Cannon
    g.save(); g.translate(W / 2, H - 34); g.rotate(this.cannonAng + Math.PI / 2);
    g.fillStyle = '#a855f7'; g.shadowColor = '#a855f7'; g.shadowBlur = 14;
    g.fillRect(-5, -28, 10, 28);
    g.restore();
    g.fillStyle = '#e2e8f0'; g.beginPath(); g.arc(W / 2, H - 30, 16, Math.PI, 0); g.fill();

    // Lasers
    g.save(); g.globalCompositeOperation = 'lighter';
    for (const l of this.lasers) {
      g.strokeStyle = `rgba(34,211,238,${l.life / 0.12})`; g.lineWidth = 3; g.shadowColor = '#22d3ee'; g.shadowBlur = 12;
      g.beginPath(); g.moveTo(l.x1, l.y1); g.lineTo(l.x2, l.y2); g.stroke();
    }
    g.restore();

    // Ships
    for (const s of this.ships) {
      const locked = s === this.target;
      g.save(); g.translate(s.x, s.y);
      g.shadowColor = s.color; g.shadowBlur = locked ? 24 : 10;
      g.fillStyle = s.color;
      g.beginPath(); g.ellipse(0, 0, 22, 8, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.8)';
      g.beginPath(); g.ellipse(0, -5, 9, 7, 0, Math.PI, 0); g.fill();
      g.restore();
      // Word label
      g.font = '700 16px Orbitron, sans-serif';
      const tw = g.measureText(s.word).width;
      const lx = s.x - tw / 2, ly = s.y + 26;
      g.fillStyle = locked ? 'rgba(34,211,238,0.2)' : 'rgba(5,3,15,0.7)';
      g.strokeStyle = locked ? '#22d3ee' : 'rgba(255,255,255,0.15)';
      g.beginPath(); g.roundRect(lx - 8, ly - 12, tw + 16, 24, 6); g.fill(); g.stroke();
      g.textBaseline = 'middle';
      const done = s.word.slice(0, locked ? s.typed : 0);
      g.fillStyle = '#22d3ee'; g.fillText(done, lx, ly);
      g.fillStyle = '#fff'; g.fillText(s.word.slice(done.length), lx + g.measureText(done).width, ly);
    }
    this.parts.draw(g);
    g.restore();

    if (this.flash > 0) { g.fillStyle = `rgba(244,63,94,${this.flash})`; g.fillRect(0, 0, W, H); }
    if (this.waveBanner > 0) this.text(g, `WAVE ${this.wave}`, W / 2, H / 2 - 40, { size: 40, color: '#fff', align: 'center', glow: '#a855f7', weight: 900 });
    if (this.combo >= 5) this.text(g, `COMBO x${Math.min(4, 1 + Math.floor(this.combo / 5))}`, W - 14, 22, { size: 14, color: '#facc15', align: 'right' });
  }
}
