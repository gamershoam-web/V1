// Starfighter: Void Siege — full 3D space combat.
// Defend Orbit Station across 10 waves (bosses on waves 5 and 10). Hangar upgrades between waves.
import * as THREE from 'three';
import { createSkyCube, makePlanet, makeSun, makeAsteroidGeometries, glowTexture, makeGlowSprite, seededRandom } from '../../space-assets.js';
import { icon } from '../../icons.js';

const TOTAL_WAVES = 10;
const ARENA = 950;
const STATION_R = 46;
const SUN_DIR = new THREE.Vector3(-0.55, 0.42, -0.72).normalize();
const V = () => new THREE.Vector3();
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rand = (a, b) => a + Math.random() * (b - a);

const UPGRADES = [
  { id: 'laser', name: 'Laser Power', desc: '+25% laser damage per level', max: 5, base: 350 },
  { id: 'rate', name: 'Fire Control', desc: 'Faster twin-laser fire rate', max: 5, base: 300 },
  { id: 'hull', name: 'Hull Plating', desc: '+30 maximum hull', max: 5, base: 300 },
  { id: 'shield', name: 'Shield Capacitor', desc: '+30 shield and faster recharge', max: 5, base: 350 },
  { id: 'missiles', name: 'Missile Racks', desc: '+2 homing missiles per wave', max: 4, base: 400 },
  { id: 'engine', name: 'Engines', desc: '+10% speed, boost and turning', max: 4, base: 400 },
];
const upgradeCost = (u, lvl) => Math.round(u.base * (1 + lvl * 0.85));

const ENEMY = {
  fighter: { hp: 40, speed: 88, radius: 5, score: 100, credits: 60, turn: 1.9 },
  interceptor: { hp: 26, speed: 128, radius: 4.2, score: 150, credits: 80, turn: 2.6 },
  bomber: { hp: 140, speed: 46, radius: 7.5, score: 250, credits: 130, turn: 0.9 },
};

function waveDef(w) {
  return {
    fighter: 3 + w * 2,
    bomber: w >= 2 ? Math.floor(w / 2) + 1 : 0,
    interceptor: w >= 4 ? w - 2 : 0,
    boss: w === 5 || w === 10,
  };
}

/* ------------------------------------------------------------------ models */
const MAT = {};
function materials() {
  if (MAT.ready) return MAT;
  Object.assign(MAT, {
    ready: true,
    hull: new THREE.MeshStandardMaterial({ color: 0xdfe5ee, metalness: 0.6, roughness: 0.35 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x2b3240, metalness: 0.55, roughness: 0.5 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x0a1222, metalness: 0.9, roughness: 0.06, envMapIntensity: 2.2 }),
    cyan: new THREE.MeshStandardMaterial({ color: 0x22d3ee, emissive: 0x22d3ee, emissiveIntensity: 2 }),
    enemyHull: new THREE.MeshStandardMaterial({ color: 0x3a3f4a, metalness: 0.7, roughness: 0.4 }),
    enemyPlate: new THREE.MeshStandardMaterial({ color: 0x7a2a2a, metalness: 0.5, roughness: 0.45 }),
    red: new THREE.MeshStandardMaterial({ color: 0xff3b3b, emissive: 0xff2a2a, emissiveIntensity: 2.4 }),
    orange: new THREE.MeshStandardMaterial({ color: 0xff9a3b, emissive: 0xff7a1a, emissiveIntensity: 2.2 }),
    station: new THREE.MeshStandardMaterial({ color: 0xc9ced6, metalness: 0.6, roughness: 0.45 }),
    solar: new THREE.MeshStandardMaterial({ color: 0x1b2f66, metalness: 0.6, roughness: 0.3, envMapIntensity: 2 }),
    window: new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0xffd9a0, emissiveIntensity: 1.4 }),
  });
  return MAT;
}

function buildPlayerShip(glow) {
  const M = materials();
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.5, 7, 12), M.hull);
  body.rotation.x = Math.PI / 2;
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.5, 2.6, 12), M.hull);
  nose.rotation.x = -Math.PI / 2; nose.position.z = -4.8;
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.62, 16, 12), M.glass);
  canopy.scale.set(1, 0.7, 1.9); canopy.position.set(0, 0.55, -1.3);
  g.add(body, nose, canopy);
  [-1, 1].forEach((s) => {
    const wing = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.14, 2.2), M.hull);
    wing.position.set(s * 2.6, -0.15, 1.1); wing.rotation.y = s * 0.32;
    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.2, 1.6), M.cyan);
    tip.position.set(s * 4.7, -0.15, 1.7);
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.4, 1.5), M.dark);
    fin.position.set(s * 0.7, 0.8, 2.9); fin.rotation.z = s * -0.3;
    const gun = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 2.2, 8), M.dark);
    gun.rotation.x = Math.PI / 2; gun.position.set(s * 2.3, -0.3, -0.6);
    const engine = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.5, 1.6, 12), M.dark);
    engine.rotation.x = Math.PI / 2; engine.position.set(s * 0.75, 0, 3.6);
    g.add(wing, tip, fin, gun, engine);
  });
  const glows = [-1, 1].map((s) => {
    const sp = makeGlowSprite(glow, 0x67e8f9, 2.6, 0.95);
    sp.position.set(s * 0.75, 0, 4.6);
    g.add(sp);
    return sp;
  });
  return { group: g, glows, guns: [new THREE.Vector3(-2.3, -0.3, -1.9), new THREE.Vector3(2.3, -0.3, -1.9)] };
}

// Enemy models face +Z (Object3D.lookAt convention).
function buildEnemy(type, glow) {
  const M = materials();
  const g = new THREE.Group();
  if (type === 'bomber') {
    const body = new THREE.Mesh(new THREE.BoxGeometry(5, 3, 10), M.enemyHull);
    const plate = new THREE.Mesh(new THREE.BoxGeometry(5.4, 0.6, 6), M.enemyPlate); plate.position.y = 1.6;
    const cockpit = new THREE.Mesh(new THREE.BoxGeometry(2, 1.2, 1.8), M.red); cockpit.position.set(0, 0.8, 4.8);
    g.add(body, plate, cockpit);
    [-1, 1].forEach((s) => {
      const pod = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 7, 10), M.enemyHull);
      pod.rotation.x = Math.PI / 2; pod.position.set(s * 4, -0.4, -0.5);
      const gl = makeGlowSprite(glow, 0xff7a3a, 4, 0.9); gl.position.set(s * 4, -0.4, -4.4);
      g.add(pod, gl);
    });
  } else {
    const len = type === 'interceptor' ? 6 : 5;
    const body = new THREE.Mesh(new THREE.ConeGeometry(type === 'interceptor' ? 0.7 : 1.1, len, 6), M.enemyHull);
    body.rotation.x = Math.PI / 2;
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.45, 10, 8), M.red); eye.position.set(0, 0.35, 0.8);
    g.add(body, eye);
    const span = type === 'interceptor' ? 2.6 : 3.4;
    [-1, 1].forEach((s) => {
      const wing = new THREE.Mesh(new THREE.BoxGeometry(span, 0.14, 2.2), M.enemyPlate);
      wing.position.set(s * span * 0.55, 0, -1); wing.rotation.y = s * -0.5; wing.rotation.z = s * 0.25;
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.8, 2.6), M.enemyHull);
      blade.position.set(s * span * 1.02, 0.3, -1.4);
      g.add(wing, blade);
    });
    const gl = makeGlowSprite(glow, 0xff5533, 2.4, 0.9); gl.position.z = -len / 2 - 0.2;
    g.add(gl);
  }
  return g;
}

function buildBoss(glow, level) {
  const M = materials();
  const g = new THREE.Group();
  const hull = new THREE.Mesh(new THREE.BoxGeometry(26, 14, 120), M.enemyHull);
  const deck = new THREE.Mesh(new THREE.BoxGeometry(34, 4, 70), M.enemyPlate); deck.position.set(0, 8, -10);
  const prow = new THREE.Mesh(new THREE.ConeGeometry(13, 34, 4), M.enemyHull); prow.rotation.x = Math.PI / 2; prow.rotation.y = Math.PI / 4; prow.position.z = 76;
  const bridge = new THREE.Mesh(new THREE.BoxGeometry(10, 12, 14), M.enemyHull); bridge.position.set(0, 16, -34);
  const bridgeLights = new THREE.Mesh(new THREE.BoxGeometry(10.4, 1.2, 14.4), M.red); bridgeLights.position.set(0, 18, -34);
  g.add(hull, deck, prow, bridge, bridgeLights);
  for (let i = -2; i <= 2; i++) {
    const strip = new THREE.Mesh(new THREE.BoxGeometry(26.4, 0.8, 2), M.red); strip.position.set(0, 0, i * 20); g.add(strip);
  }
  [-1, 0, 1].forEach((s) => {
    const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(4, 5, 8, 12), M.dark); nozzle.rotation.x = Math.PI / 2; nozzle.position.set(s * 9, 0, -63);
    const gl = makeGlowSprite(glow, 0xff6a3a, 26, 0.9); gl.position.set(s * 9, 0, -68);
    g.add(nozzle, gl);
  });
  const turretSpots = [[-14, 9, 30], [14, 9, 30], [-14, 9, -14], [14, 9, -14]];
  const turrets = turretSpots.map(([x, y, z]) => {
    const t = new THREE.Group();
    const base = new THREE.Mesh(new THREE.CylinderGeometry(4, 4.5, 3, 12), M.dark);
    const head = new THREE.Mesh(new THREE.SphereGeometry(3.4, 14, 10), M.enemyPlate); head.position.y = 2.6;
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 7, 8), M.dark); barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 2.6, 4);
    const core = new THREE.Mesh(new THREE.SphereGeometry(1.1, 10, 8), M.orange); core.position.set(0, 4.4, 0);
    t.add(base, head, barrel, core);
    t.position.set(x, y, z);
    g.add(t);
    return { obj: t, hp: 280 + level * 25, maxHp: 280 + level * 25, alive: true, cd: rand(1, 3) };
  });
  const shield = new THREE.Mesh(
    new THREE.SphereGeometry(1, 32, 16),
    new THREE.MeshBasicMaterial({ color: 0xff5a8a, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
  );
  shield.scale.set(30, 22, 82);
  g.add(shield);
  return { group: g, turrets, shield };
}

function buildStation() {
  const M = materials();
  const g = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.TorusGeometry(38, 5, 18, 96), M.station);
  const windows = new THREE.Mesh(new THREE.TorusGeometry(38, 5.15, 4, 96, Math.PI * 2), M.window);
  windows.scale.set(1, 1, 0.12);
  const spin = new THREE.Group();
  spin.add(ring, windows);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const spoke = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 32, 10), M.dark);
    spoke.rotation.z = Math.PI / 2; spoke.rotation.y = -a; spoke.position.set(Math.cos(a) * 20, 0, Math.sin(a) * 20);
    spin.add(spoke);
  }
  spin.rotation.x = Math.PI / 2;
  g.add(spin);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(9, 9, 22, 24), M.station); hub.rotation.x = Math.PI / 2;
  g.add(hub);
  const truss = new THREE.Mesh(new THREE.BoxGeometry(150, 2, 2), M.dark); truss.position.z = -18;
  g.add(truss);
  [-1, 1].forEach((s) => [0, 1].forEach((k) => {
    const panel = new THREE.Mesh(new THREE.BoxGeometry(26, 0.5, 14), M.solar);
    panel.position.set(s * (52 + k * 28), 0, -18); g.add(panel);
  }));
  g.rotation.x = 0.25;
  return { group: g, spin };
}

/* ------------------------------------------------------------------ the game */
export default class Starfighter {
  constructor(root, ctx) {
    this.root = root;
    this.ctx = ctx;
    this.coarse = window.matchMedia('(pointer: coarse)').matches;
    this.save = ctx.storage.load() || {};
    this.timers = [];
    this.listeners = [];
    this.keys = new Set();
    this.steer = new THREE.Vector2();
    this.pointer = { x: 0, y: 0, inside: false, down: false };
    this.touch = { stick: null, fire: false, boost: false };
    this.paused = true;
    this.phase = 'briefing';

    root.innerHTML = `
      <div class="sf-root">
        <canvas class="sf-canvas"></canvas>
        <canvas class="sf-hud"></canvas>
        <div class="sf-vignette"></div>
        <div class="sf-top">
          <div class="sf-chip"><span class="sf-label">Wave</span><b data-wave>1 / ${TOTAL_WAVES}</b><span class="sf-sub" data-left></span></div>
          <div class="sf-station"><span class="sf-label">Orbit Station</span><div class="sf-bar"><i data-station></i></div></div>
          <div class="sf-chip right"><span class="sf-label">Credits</span><b data-credits>0</b><span class="sf-sub" data-score>Score 0</span></div>
        </div>
        <div class="sf-bottom">
          <div class="sf-bars">
            <div class="sf-meter"><span>Shield</span><div class="sf-bar shield"><i data-shield></i></div></div>
            <div class="sf-meter"><span>Hull</span><div class="sf-bar hull"><i data-hull></i></div></div>
            <div class="sf-meter"><span>Boost</span><div class="sf-bar energy"><i data-energy></i></div></div>
            <div class="sf-lives" data-lives></div>
          </div>
          <div class="sf-weapons">
            <div><span class="sf-label">Missiles</span><b data-missiles>0</b></div>
            <div><span class="sf-label">Speed</span><b data-speed>0</b></div>
            <div class="sf-lock" data-lock>NO LOCK</div>
          </div>
        </div>
        <div class="sf-banner" data-banner></div>
        <div class="sf-touch">
          <div class="sf-stick" data-stick><i></i></div>
          <div class="sf-buttons">
            <button type="button" data-tbtn="boost">BOOST</button>
            <button type="button" data-tbtn="missile">MSL</button>
            <button type="button" data-tbtn="fire" class="fire">FIRE</button>
          </div>
        </div>
        <button type="button" class="sf-pause-btn" data-pausebtn aria-label="Pause">${icon('pause')}</button>
      </div>`;
    this.$ = (s) => root.querySelector(s);
    this.canvas = this.$('.sf-canvas');
    this.hud = this.$('.sf-hud');
    this.hg = this.hud.getContext('2d');

    this.initThree();
    this.bindInput();
    this.resetRun();
    this.showBriefing();

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(root);
    this.resize();
    this.last = performance.now();
    this.raf = requestAnimationFrame((t) => this.loop(t));
    this.on(document, 'visibilitychange', () => { if (document.hidden && this.phase === 'play') this.pause(); });
  }

  on(t, e, f, o) { t.addEventListener(e, f, o); this.listeners.push([t, e, f, o]); }
  later(ms, fn) { const id = setTimeout(fn, ms); this.timers.push(id); return id; }

  /* ---------- setup ---------- */
  initThree() {
    const r = this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.coarse ? 1.25 : 1.5));
    r.toneMapping = THREE.ACESFilmicToneMapping;
    const scene = this.scene = new THREE.Scene();
    const sky = createSkyCube(r, { size: this.coarse ? 512 : 1024, seed: 19 });
    scene.background = sky;
    const pmrem = new THREE.PMREMGenerator(r);
    scene.environment = pmrem.fromCubemap(sky).texture;
    pmrem.dispose();
    this.camera = new THREE.PerspectiveCamera(70, 1, 0.5, 8000);
    this.glow = glowTexture();

    const sun = makeSun({ radius: 70, withFlare: !this.coarse });
    sun.group.position.copy(SUN_DIR).multiplyScalar(3200);
    scene.add(sun.group);
    this.sunU = sun.uniforms;
    const light = new THREE.DirectionalLight(0xfff2e0, 2.8);
    light.position.copy(SUN_DIR).multiplyScalar(100);
    scene.add(light, light.target, new THREE.AmbientLight(0x6070a0, 0.25));

    const planet = makePlanet(r, { type: 'earth', radius: 900, seed: 12, sunDir: SUN_DIR, segments: 96, atmosphere: { color: 0x5aa8ff, intensity: 1.5, power: 2.4, scale: 1.03 }, size: this.coarse ? 1024 : 2048 });
    planet.group.position.set(400, -1600, -900);
    scene.add(planet.group);
    this.planet = planet;

    this.station = buildStation();
    scene.add(this.station.group);

    // Asteroid field (instanced) with per-rock collision data
    const geos = makeAsteroidGeometries(3, 77);
    const count = this.coarse ? 45 : 75;
    const per = Math.ceil(count / geos.length);
    const rmat = new THREE.MeshStandardMaterial({ color: 0x8a8279, roughness: 1, flatShading: true });
    this.rocks = [];
    this.rockMeshes = geos.map((geo) => { const m = new THREE.InstancedMesh(geo, rmat, per); scene.add(m); return m; });
    const rnd = seededRandom(5);
    for (let i = 0; i < per * geos.length; i++) {
      const dir = new THREE.Vector3(rnd() - 0.5, (rnd() - 0.5) * 0.5, rnd() - 0.5).normalize();
      const pos = dir.multiplyScalar(240 + rnd() * 520);
      const size = 6 + Math.pow(rnd(), 2) * 22;
      this.rocks.push({ pos, size, radius: size * 0.92, mesh: this.rockMeshes[i % geos.length], index: Math.floor(i / geos.length), rot: new THREE.Euler(rnd() * 6, rnd() * 6, rnd() * 6), spin: new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).multiplyScalar(0.3) });
    }
    this.updateRocks(0);

    // Space dust for a sense of speed
    const dn = 500, dpos = new Float32Array(dn * 3);
    for (let i = 0; i < dn * 3; i++) dpos[i] = rand(-60, 60);
    const dgeo = new THREE.BufferGeometry(); dgeo.setAttribute('position', new THREE.BufferAttribute(dpos, 3));
    this.dust = new THREE.Points(dgeo, new THREE.PointsMaterial({ color: 0xbfd4ff, size: 0.18, transparent: true, opacity: 0.55, depthWrite: false }));
    this.dust.frustumCulled = false;
    scene.add(this.dust);

    // Player
    this.ship = buildPlayerShip(this.glow);
    this.player = { obj: new THREE.Group() };
    this.player.obj.add(this.ship.group);
    scene.add(this.player.obj);

    // Pools
    this.bolts = [];
    this.boltGeo = new THREE.BoxGeometry(0.28, 0.28, 7);
    this.boltMat = new THREE.MeshBasicMaterial({ color: 0x8ff5ff, blending: THREE.AdditiveBlending, transparent: true, opacity: 0.95, depthWrite: false });
    this.enemyBoltMat = new THREE.MeshBasicMaterial({ color: 0xff6a6a, blending: THREE.AdditiveBlending, transparent: true, opacity: 0.95, depthWrite: false });
    this.flashes = [];
    this.sparkGeo = new THREE.BufferGeometry();
    this.sparkCap = 2500;
    this.sparkPos = new Float32Array(this.sparkCap * 3);
    this.sparkCol = new Float32Array(this.sparkCap * 3);
    this.sparkData = [];
    this.sparkGeo.setAttribute('position', new THREE.BufferAttribute(this.sparkPos, 3));
    this.sparkGeo.setAttribute('color', new THREE.BufferAttribute(this.sparkCol, 3));
    this.sparks = new THREE.Points(this.sparkGeo, new THREE.PointsMaterial({ size: 1.1, vertexColors: true, map: this.glow, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.sparks.frustumCulled = false;
    scene.add(this.sparks);
  }

  resetRun() {
    this.wave = 0;
    this.score = 0;
    this.credits = 0;
    this.lives = 3;
    this.levels = Object.fromEntries(UPGRADES.map((u) => [u.id, 0]));
    this.stationMax = 1600;
    this.stationHp = this.stationMax;
    (this.enemies || []).forEach((e) => this.scene.remove(e.obj));
    this.enemies = [];
    (this.projectiles || []).forEach((p) => this.scene.remove(p.obj));
    this.projectiles = [];
    (this.missileList || []).forEach((m) => this.scene.remove(m.obj));
    this.missileList = [];
    if (this.boss) { this.scene.remove(this.boss.group); this.boss = null; }
    this.spawnQueue = [];
    this.resetPlayer();
  }

  stats() {
    const L = this.levels;
    return {
      dmg: 11 * (1 + 0.25 * L.laser),
      rate: Math.max(0.07, 0.17 - L.rate * 0.02),
      hull: 100 + 30 * L.hull,
      shield: 60 + 30 * L.shield,
      shieldRegen: 7 + 3 * L.shield,
      missiles: 4 + 2 * L.missiles,
      speed: 1 + 0.1 * L.engine,
    };
  }

  resetPlayer() {
    const s = this.stats();
    const p = this.player;
    p.pos = new THREE.Vector3(0, 30, 140);
    p.quat = new THREE.Quaternion();
    p.speed = 60;
    p.throttle = 0.55;
    p.hull = s.hull; p.shield = s.shield; p.energy = 100;
    p.missiles = s.missiles;
    p.alive = true; p.invuln = 2.5;
    p.fireCd = 0; p.gun = 0; p.shieldDelay = 0;
    p.lock = null; p.lockT = 0; p.bank = 0;
    p.obj.visible = true;
    p.obj.position.copy(p.pos);
    p.obj.quaternion.copy(p.quat);
    this.camera.position.set(0, 36, 160);
    this.camera.lookAt(0, 30, 0);
  }

  /* ---------- input ---------- */
  bindInput() {
    const root = this.root;
    this.on(window, 'keydown', (e) => {
      if (e.target.tagName === 'INPUT') return;
      this.keys.add(e.code);
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
      if (e.code === 'KeyP') { this.phase === 'play' ? this.pause() : this.phase === 'paused' && this.resume(); }
      if ((e.code === 'KeyE' || e.code === 'KeyF') && this.phase === 'play') this.fireMissile();
    });
    this.on(window, 'keyup', (e) => this.keys.delete(e.code));
    this.on(window, 'blur', () => { this.keys.clear(); this.pointer.down = false; });
    this.on(this.hud, 'pointermove', (e) => {
      if (e.pointerType !== 'mouse') return;
      const r = this.hud.getBoundingClientRect();
      this.pointer.x = (e.clientX - r.left) / r.width * 2 - 1;
      this.pointer.y = (e.clientY - r.top) / r.height * 2 - 1;
      this.pointer.inside = true;
    });
    this.on(this.hud, 'pointerleave', () => { this.pointer.inside = false; });
    this.on(this.hud, 'pointerdown', (e) => {
      if (e.pointerType !== 'mouse') return;
      if (e.button === 0) this.pointer.down = true;
      if (e.button === 2 && this.phase === 'play') this.fireMissile();
    });
    this.on(window, 'pointerup', (e) => { if (e.pointerType === 'mouse' && e.button === 0) this.pointer.down = false; });
    this.on(this.hud, 'contextmenu', (e) => e.preventDefault());

    // Touch: virtual stick + buttons
    const stick = this.$('[data-stick]');
    const knob = stick.querySelector('i');
    this.on(stick, 'pointerdown', (e) => {
      e.preventDefault();
      stick.setPointerCapture(e.pointerId);
      this.touch.stick = { id: e.pointerId };
      this.moveStick(e, stick, knob);
    });
    this.on(stick, 'pointermove', (e) => { if (this.touch.stick?.id === e.pointerId) this.moveStick(e, stick, knob); });
    const endStick = (e) => { if (this.touch.stick?.id === e.pointerId) { this.touch.stick = null; this.steer.set(0, 0); knob.style.transform = ''; } };
    this.on(stick, 'pointerup', endStick);
    this.on(stick, 'pointercancel', endStick);
    root.querySelectorAll('[data-tbtn]').forEach((b) => {
      const k = b.dataset.tbtn;
      const press = (e) => { e.preventDefault(); b.classList.add('held'); if (k === 'missile') this.fireMissile(); else this.touch[k] = true; };
      const release = (e) => { e.preventDefault(); b.classList.remove('held'); if (k !== 'missile') this.touch[k] = false; };
      this.on(b, 'pointerdown', press);
      this.on(b, 'pointerup', release);
      this.on(b, 'pointerleave', release);
      this.on(b, 'pointercancel', release);
      this.on(b, 'contextmenu', (e) => e.preventDefault());
    });
    this.on(this.$('[data-pausebtn]'), 'click', () => { if (this.phase === 'play') this.pause(); });
  }

  moveStick(e, stick, knob) {
    const r = stick.getBoundingClientRect();
    let x = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
    let y = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
    const m = Math.hypot(x, y);
    if (m > 1) { x /= m; y /= m; }
    this.steer.set(x, y);
    knob.style.transform = `translate(${x * 34}px, ${y * 34}px)`;
  }

  onEscape() {
    if (this.phase === 'play') { this.pause(); return true; }
    if (this.phase === 'paused') { this.resume(); return true; }
    return false;
  }

  /* ---------- screens ---------- */
  overlay(html) {
    this.root.querySelector('.bg-overlay')?.remove();
    const el = document.createElement('div');
    el.className = 'bg-overlay';
    el.innerHTML = `<div class="bg-panel">${html}</div>`;
    this.root.querySelector('.sf-root').appendChild(el);
    return el;
  }
  closeOverlay() { this.root.querySelector('.bg-overlay')?.remove(); }

  controlsHTML() {
    return this.coarse
      ? `<ul class="sf-controls"><li>Left stick: steer</li><li><b>FIRE</b>: twin lasers · <b>MSL</b>: missile (lock on first)</li><li><b>BOOST</b>: burst of speed</li></ul>`
      : `<ul class="sf-controls">
          <li>Mouse: steer toward the cursor · <span class="bg-key">←↑↓→</span> also steer</li>
          <li><span class="bg-key">Click</span> / <span class="bg-key">Space</span> fire lasers</li>
          <li><span class="bg-key">Right-click</span> / <span class="bg-key">E</span> fire missile (hold the target in your sights to lock)</li>
          <li><span class="bg-key">W</span>/<span class="bg-key">S</span> throttle · <span class="bg-key">Shift</span> boost · <span class="bg-key">A</span>/<span class="bg-key">D</span> roll · <span class="bg-key">Esc</span> pause</li>
        </ul>`;
  }

  showBriefing() {
    this.phase = 'briefing';
    const el = this.overlay(`
      <p class="bg-kicker">Mission briefing</p>
      <h2 class="mt-2">Void Siege</h2>
      <p class="text-sm text-slate-300 mt-3 leading-relaxed">Raiders are converging on <b>Orbit Station</b>. Fly out, intercept every wave and keep the station alive.
        Bombers target the station with torpedoes; shoot them (and their torpedoes) down first. Capital ships arrive on waves 5 and 10: destroy their turrets to drop the shield, then hit the hull.</p>
      <h3 class="mt-5 mb-2">Controls</h3>
      ${this.controlsHTML()}
      ${this.save.bestWave ? `<p class="text-xs text-slate-400 mt-4">Your best: wave ${this.save.bestWave}${this.save.won ? ' (victory)' : ''}</p>` : ''}
      <div class="bg-row mt-5"><button type="button" class="btn-neon flex-1" data-go>Launch</button></div>`);
    el.querySelector('[data-go]').addEventListener('click', () => { this.ctx.audio.click(); this.startWave(1); });
  }

  pause() {
    if (this.phase !== 'play') return;
    this.phase = 'paused';
    this.keys.clear();
    this.pointer.down = false;
    const el = this.overlay(`
      <p class="bg-kicker">Paused</p>
      <h2 class="mt-2">Wave ${this.wave} of ${TOTAL_WAVES}</h2>
      <h3 class="mt-5 mb-2">Controls</h3>
      ${this.controlsHTML()}
      <div class="bg-row mt-5"><button type="button" class="btn-neon flex-1" data-resume>Resume</button><button type="button" class="btn-ghost" data-quit>Abandon mission</button></div>`);
    el.querySelector('[data-resume]').addEventListener('click', () => this.resume());
    el.querySelector('[data-quit]').addEventListener('click', () => this.finish(false, 'Mission abandoned'));
  }

  resume() {
    if (this.phase !== 'paused') return;
    this.closeOverlay();
    this.phase = 'play';
    this.last = performance.now();
  }

  showHangar() {
    this.phase = 'hangar';
    const render = () => {
      const s = this.stats();
      const repairCost = Math.ceil((this.stationMax - this.stationHp) / this.stationMax * 4) * 150;
      const el = this.overlay(`
        <p class="bg-kicker">Wave ${this.wave} cleared</p>
        <div class="flex items-end justify-between gap-3 mt-2"><h2>Hangar</h2><div class="sf-credits">${icon('star')} <b>${this.credits.toLocaleString()}</b> credits</div></div>
        <div class="sf-upgrades mt-4">
          ${UPGRADES.map((u) => {
            const lvl = this.levels[u.id], maxed = lvl >= u.max, cost = upgradeCost(u, lvl);
            return `<div class="sf-up">
              <div class="min-w-0"><p class="font-semibold text-sm">${u.name}</p><p class="text-xs text-slate-400">${u.desc}</p>
                <div class="sf-pips">${Array.from({ length: u.max }, (_, i) => `<i class="${i < lvl ? 'on' : ''}"></i>`).join('')}</div></div>
              <button type="button" class="btn-mini" data-buy="${u.id}" ${maxed || cost > this.credits ? 'disabled' : ''}>${maxed ? 'MAX' : `${cost.toLocaleString()} cr`}</button>
            </div>`;
          }).join('')}
          <div class="sf-up">
            <div class="min-w-0"><p class="font-semibold text-sm">Station Repairs</p><p class="text-xs text-slate-400">Station at ${Math.round(this.stationHp / this.stationMax * 100)}%</p></div>
            <button type="button" class="btn-mini" data-repair ${repairCost === 0 || repairCost > this.credits ? 'disabled' : ''}>${repairCost === 0 ? 'FULL' : `${repairCost.toLocaleString()} cr`}</button>
          </div>
        </div>
        <p class="text-xs text-slate-400 mt-3">Your fighter is fully repaired and re-armed for the next wave (${s.missiles} missiles).</p>
        <div class="bg-row mt-4"><button type="button" class="btn-neon flex-1" data-next>Launch wave ${this.wave + 1}</button></div>`);
      el.querySelectorAll('[data-buy]').forEach((b) => b.addEventListener('click', () => {
        const u = UPGRADES.find((x) => x.id === b.dataset.buy);
        const cost = upgradeCost(u, this.levels[u.id]);
        if (this.credits < cost || this.levels[u.id] >= u.max) return;
        this.credits -= cost; this.levels[u.id]++;
        this.ctx.audio.pickup();
        render();
      }));
      el.querySelector('[data-repair]').addEventListener('click', () => {
        if (repairCost > this.credits || repairCost === 0) return;
        this.credits -= repairCost; this.stationHp = this.stationMax;
        this.ctx.audio.pickup();
        render();
      });
      el.querySelector('[data-next]').addEventListener('click', () => { this.ctx.audio.click(); this.startWave(this.wave + 1); });
      this.updateDom();
    };
    render();
  }

  /* ---------- waves ---------- */
  startWave(n) {
    this.closeOverlay();
    this.wave = n;
    const s = this.stats();
    const p = this.player;
    p.hull = s.hull; p.shield = s.shield; p.energy = 100; p.missiles = s.missiles;
    if (!p.alive) this.resetPlayer();
    const def = waveDef(n);
    this.spawnQueue = [];
    const groups = [];
    for (const type of ['fighter', 'interceptor', 'bomber']) for (let i = 0; i < def[type]; i++) groups.push(type);
    groups.sort(() => Math.random() - 0.5);
    let t = 2;
    groups.forEach((type, i) => { this.spawnQueue.push({ type, at: t }); t += i % 3 === 2 ? 6 : 0.6; });
    if (def.boss) this.spawnQueue.push({ type: 'boss', at: 4 });
    this.waveTime = 0;
    this.phase = 'play';
    this.last = performance.now();
    this.banner(def.boss ? `WAVE ${n} · CAPITAL SHIP INBOUND` : `WAVE ${n}`, def.boss ? '#f472b6' : '#67e8f9');
    this.ctx.audio.whoosh();
  }

  spawn(type) {
    if (type === 'boss') return this.spawnBoss();
    const def = ENEMY[type];
    const a = rand(0, Math.PI * 2), elev = rand(-0.35, 0.35);
    const pos = new THREE.Vector3(Math.cos(a) * Math.cos(elev), Math.sin(elev), Math.sin(a) * Math.cos(elev)).multiplyScalar(ARENA - 80);
    const obj = buildEnemy(type, this.glow);
    obj.position.copy(pos);
    obj.lookAt(0, 0, 0);
    this.scene.add(obj);
    const w = this.wave;
    const e = {
      type, obj, pos, quat: obj.quaternion, vel: new THREE.Vector3(),
      hp: def.hp + w * (type === 'bomber' ? 10 : 3), radius: def.radius,
      speed: def.speed + w * 2.5, turn: def.turn, fireCd: rand(1, 3), burst: 0, state: 'attack', stateT: 0,
      orbitDir: Math.random() < 0.5 ? 1 : -1,
    };
    e.maxHp = e.hp;
    this.enemies.push(e);
  }

  spawnBoss() {
    const level = this.wave === 10 ? 2 : 1;
    const b = buildBoss(this.glow, level);
    b.angle = rand(0, Math.PI * 2);
    b.orbitR = 420;
    b.coreHp = b.coreMax = level === 2 ? 2600 : 1600;
    b.spawnCd = 10;
    b.alive = true;
    b.level = level;
    b.pos = new THREE.Vector3();
    b.group.position.set(Math.cos(b.angle) * 1400, 120, Math.sin(b.angle) * 1400);
    b.arriving = true;
    this.scene.add(b.group);
    this.boss = b;
    this.ctx.audio.tone({ freq: 70, type: 'sawtooth', dur: 1.6, vol: 0.18, slide: 30 });
  }

  /* ---------- combat ---------- */
  fireLasers() {
    const p = this.player, s = this.stats();
    if (p.fireCd > 0 || !p.alive) return;
    p.fireCd = s.rate;
    const gunLocal = this.ship.guns[p.gun];
    p.gun ^= 1;
    const pos = gunLocal.clone().applyQuaternion(p.quat).add(p.pos);
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(p.quat);
    this.addBolt(pos, dir, 620 + p.speed, s.dmg, true);
    this.ctx.audio.tone({ freq: 1500 + Math.random() * 200, type: 'sawtooth', dur: 0.09, vol: 0.05, slide: -1100 });
  }

  addBolt(pos, dir, speed, dmg, friendly) {
    let b = this.bolts.find((x) => !x.alive);
    if (!b) {
      const mesh = new THREE.Mesh(this.boltGeo, friendly ? this.boltMat : this.enemyBoltMat);
      this.scene.add(mesh);
      b = { mesh };
      this.bolts.push(b);
    }
    b.mesh.material = friendly ? this.boltMat : this.enemyBoltMat;
    b.alive = true; b.friendly = friendly; b.dmg = dmg; b.life = 1.5;
    b.pos = pos.clone(); b.vel = dir.clone().multiplyScalar(speed);
    b.mesh.visible = true;
    b.mesh.position.copy(pos);
    b.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
  }

  fireMissile() {
    const p = this.player;
    if (!p.alive || p.missiles <= 0 || this.phase !== 'play') { if (p.missiles <= 0) this.ctx.audio.error(); return; }
    p.missiles--;
    const obj = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 2.2, 8), materials().hull);
    body.rotation.x = Math.PI / 2;
    obj.add(body, makeGlowSprite(this.glow, 0xffb35c, 3, 0.95));
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(p.quat);
    const m = { obj, pos: p.pos.clone().add(new THREE.Vector3(0, -1.2, 0).applyQuaternion(p.quat)), vel: dir.multiplyScalar(p.speed + 120), target: p.lockT >= 1 ? p.lock : null, life: 6 };
    obj.position.copy(m.pos);
    this.scene.add(obj);
    this.missileList.push(m);
    this.ctx.audio.tone({ freq: 300, type: 'sawtooth', dur: 0.5, vol: 0.12, slide: 500 });
  }

  enemyFire(from, to, speed, dmg, kind = 'bolt') {
    const dir = to.clone().sub(from).normalize();
    if (kind === 'bolt') { this.addBolt(from, dir, speed, dmg, false); return; }
    const color = kind === 'torpedo' ? 0xff9a3b : 0xff4f9a;
    const obj = makeGlowSprite(this.glow, color, kind === 'torpedo' ? 7 : 6, 1);
    obj.position.copy(from);
    this.scene.add(obj);
    this.projectiles.push({ obj, pos: from.clone(), vel: dir.multiplyScalar(speed), dmg, kind, life: kind === 'torpedo' ? 9 : 5, hp: kind === 'torpedo' ? 12 : 0, radius: kind === 'torpedo' ? 3.5 : 3 });
  }

  damagePlayer(n) {
    const p = this.player;
    if (!p.alive || p.invuln > 0) return;
    p.shieldDelay = 2.5;
    if (p.shield > 0) { const a = Math.min(p.shield, n); p.shield -= a; n -= a; }
    p.hull -= n;
    this.hitFlash = Math.min(1, (this.hitFlash || 0) + 0.45);
    this.shake = Math.min(1, (this.shake || 0) + 0.35);
    this.ctx.audio.hit();
    if (p.hull <= 0) this.killPlayer();
  }

  killPlayer() {
    const p = this.player;
    p.alive = false;
    p.obj.visible = false;
    this.explode(p.pos, 1.6, 0x67e8f9);
    this.lives--;
    if (this.lives <= 0) { this.later(1800, () => this.finish(false, 'Your fighter was destroyed')); return; }
    this.banner(`FIGHTER LOST · ${this.lives} ${this.lives === 1 ? 'LIFE' : 'LIVES'} LEFT`, '#fb7185');
    this.later(2600, () => { if (this.phase === 'play' || this.phase === 'paused') { this.resetPlayer(); const s = this.stats(); this.player.missiles = Math.ceil(s.missiles / 2); } });
  }

  damageStation(n) {
    this.stationHp = Math.max(0, this.stationHp - n);
    this.stationHit = 0.6;
    if (this.stationHp <= 0 && this.phase === 'play') {
      this.explode(new THREE.Vector3(), 6, 0xffb35c);
      this.later(1500, () => this.finish(false, 'Orbit Station was destroyed'));
      this.phase = 'ending';
    }
  }

  killEnemy(e) {
    e.dead = true;
    this.scene.remove(e.obj);
    this.explode(e.pos, e.type === 'bomber' ? 1.4 : 0.9, 0xffa04a);
    const def = ENEMY[e.type];
    this.addScore(def.score, def.credits);
    if (this.player.lock === e) { this.player.lock = null; this.player.lockT = 0; }
  }

  addScore(points, credits) {
    this.score += points;
    this.credits += credits;
    this.ctx.setScore(this.score);
    this.hitMarker = 0.25;
  }

  explode(pos, scale = 1, color = 0xffa04a) {
    const flash = makeGlowSprite(this.glow, color, 1, 1);
    flash.position.copy(pos);
    this.scene.add(flash);
    this.flashes.push({ obj: flash, t: 0, life: 0.7, scale: 34 * scale });
    const c = new THREE.Color(color);
    const n = Math.round(60 * scale);
    for (let i = 0; i < n; i++) {
      const v = new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize().multiplyScalar(rand(10, 70) * scale);
      this.addSpark(pos, v, Math.random() < 0.3 ? new THREE.Color(1, 1, 0.85) : c, rand(0.5, 1.3));
    }
    this.ctx.audio.explosion();
    if (scale > 1) this.shake = Math.min(1, (this.shake || 0) + 0.3 * scale);
  }

  addSpark(pos, vel, color, life) {
    if (this.sparkData.length >= this.sparkCap) this.sparkData.shift();
    this.sparkData.push({ pos: pos.clone(), vel, color, life, max: life });
  }

  /* ---------- main loop ---------- */
  loop(now) {
    this.raf = requestAnimationFrame((t) => this.loop(t));
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.time = (this.time || 0) + dt;
    this.sunU.uTime.value = this.time;
    this.station.spin.rotation.z += dt * 0.12;
    this.planet.surface.rotation.y += dt * 0.003;
    if (this.planet.clouds) this.planet.clouds.rotation.y += dt * 0.004;
    if (this.phase === 'play') this.update(dt);
    else if (this.phase === 'briefing' || this.phase === 'hangar') this.idleCamera(dt);
    this.updateEffects(dt);
    this.renderer.render(this.scene, this.camera);
    this.drawHud();
    this.updateDom();
  }

  idleCamera(dt) {
    const t = this.time * 0.08;
    this.camera.position.set(Math.cos(t) * 230, 70 + Math.sin(t * 0.7) * 20, Math.sin(t) * 230);
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(0, 0, 0);
  }

  update(dt) {
    const p = this.player, s = this.stats();
    this.waveTime += dt;

    // Spawning
    while (this.spawnQueue.length && this.spawnQueue[0].at <= this.waveTime) this.spawn(this.spawnQueue.shift().type);

    // ----- Player flight -----
    if (p.alive) {
      p.invuln = Math.max(0, p.invuln - dt);
      let sx = 0, sy = 0;
      if (this.touch.stick) { sx = this.steer.x; sy = this.steer.y; }
      else if (this.pointer.inside) {
        sx = clamp(this.pointer.x / 0.55, -1, 1); sy = clamp(this.pointer.y / 0.55, -1, 1);
        const dz = 0.07;
        sx = Math.abs(sx) < dz ? 0 : sx; sy = Math.abs(sy) < dz ? 0 : sy;
      }
      if (this.keys.has('ArrowLeft')) sx = -1; if (this.keys.has('ArrowRight')) sx = 1;
      if (this.keys.has('ArrowUp')) sy = -1; if (this.keys.has('ArrowDown')) sy = 1;
      let roll = 0;
      if (this.keys.has('KeyA')) roll = 1; if (this.keys.has('KeyD')) roll = -1;
      if (this.keys.has('KeyW')) p.throttle = Math.min(1, p.throttle + dt * 0.8);
      if (this.keys.has('KeyS')) p.throttle = Math.max(0, p.throttle - dt * 0.8);

      // Boundary: steer back toward the station
      const out = p.pos.length() > ARENA;
      this.outOfBounds = out;
      const turnMul = s.speed;
      const yaw = -sx * 1.55 * turnMul, pitch = -sy * 1.25 * turnMul;
      const q = new THREE.Quaternion();
      q.setFromEuler(new THREE.Euler(pitch * dt, yaw * dt, roll * 1.8 * dt, 'YXZ'));
      p.quat.multiply(q);
      if (out) {
        const back = p.pos.clone().negate().normalize();
        const m = new THREE.Matrix4().lookAt(new THREE.Vector3(), back, new THREE.Vector3(0, 1, 0).applyQuaternion(p.quat)); // -Z (forward) toward the station
        p.quat.rotateTowards(new THREE.Quaternion().setFromRotationMatrix(m), dt * 1.4);
      }
      p.quat.normalize();
      p.bank += (-sx * 0.55 - p.bank) * Math.min(1, dt * 5);

      const boosting = (this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') || this.touch.boost) && p.energy > 2;
      if (boosting) p.energy = Math.max(0, p.energy - dt * 30); else p.energy = Math.min(100, p.energy + dt * 14);
      const target = (28 + p.throttle * 84) * s.speed * (boosting ? 1.85 : 1);
      p.speed += (target - p.speed) * Math.min(1, dt * 2.5);
      p.boosting = boosting;
      const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(p.quat);
      p.pos.addScaledVector(fwd, p.speed * dt);

      // Shields recharge after a short delay
      p.shieldDelay -= dt;
      if (p.shieldDelay <= 0) p.shield = Math.min(s.shield, p.shield + s.shieldRegen * dt);

      // Weapons
      p.fireCd -= dt;
      if (this.keys.has('Space') || this.pointer.down || this.touch.fire) this.fireLasers();

      // Missile lock: nearest enemy inside a 13 degree cone
      let best = null, bestAng = 0.23;
      for (const e of this.lockables()) {
        const to = e.pos.clone().sub(p.pos);
        const d = to.length();
        if (d > 700) continue;
        const ang = fwd.angleTo(to);
        if (ang < bestAng) { bestAng = ang; best = e; }
      }
      if (best && best === p.lock) p.lockT = Math.min(1, p.lockT + dt / 0.7);
      else { p.lock = best; p.lockT = 0; }

      // Collisions with rocks and the station
      for (const r of this.rocks) {
        const d = p.pos.distanceTo(r.pos);
        if (d < r.radius + 2.5) {
          const n = p.pos.clone().sub(r.pos).normalize();
          p.pos.copy(r.pos).addScaledVector(n, r.radius + 2.6);
          this.damagePlayer(8 + p.speed * 0.15);
          p.speed *= 0.35;
          this.sparksAt(p.pos, 0xd6c6b0);
        }
      }
      const sd = p.pos.length();
      if (sd < STATION_R) {
        p.pos.setLength(STATION_R + 0.5);
        this.damagePlayer(6);
        p.speed *= 0.4;
      }
      p.obj.position.copy(p.pos);
      p.obj.quaternion.copy(p.quat);
      this.ship.group.rotation.z = p.bank;
      const glowScale = 2 + (p.speed / 110) * 2.4 + (boosting ? 2 : 0);
      this.ship.glows.forEach((g) => { g.scale.setScalar(glowScale * (0.9 + Math.random() * 0.2)); });
    }

    // ----- Enemies -----
    const playerTarget = p.alive ? p.pos : null;
    for (const e of this.enemies) {
      if (e.dead) continue;
      e.fireCd -= dt; e.stateT -= dt;
      let goal;
      if (e.type === 'bomber') {
        const d = e.pos.length();
        if (d > 170) goal = e.pos.clone().negate().normalize();
        else {
          // orbit the station and launch torpedoes
          const tangent = new THREE.Vector3(-e.pos.z, 0, e.pos.x).normalize().multiplyScalar(e.orbitDir);
          goal = tangent.add(e.pos.clone().normalize().multiplyScalar((150 - d) / 60)).normalize();
          if (e.fireCd <= 0) { e.fireCd = rand(3.5, 5.5); this.enemyFire(e.pos.clone(), new THREE.Vector3(), 75, 70, 'torpedo'); }
        }
        if (playerTarget && e.pos.distanceTo(playerTarget) < 170 && Math.random() < dt * 1.2) this.enemyFire(e.pos.clone(), playerTarget.clone(), 330, 6);
      } else {
        const tgt = playerTarget || V();
        const to = tgt.clone().sub(e.pos);
        const dist = to.length();
        if (e.state === 'attack') {
          // lead the target
          const lead = playerTarget ? to.clone().addScaledVector(new THREE.Vector3(0, 0, -1).applyQuaternion(p.quat).multiplyScalar(p.speed), dist / 420) : to;
          goal = lead.normalize();
          const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(e.quat);
          if (playerTarget && dist < 300 && fwd.angleTo(goal) < 0.22 && e.fireCd <= 0) {
            this.enemyFire(e.pos.clone().addScaledVector(fwd, 4), e.pos.clone().addScaledVector(goal, 100), 420 + e.speed, e.type === 'interceptor' ? 5 : 7);
            e.burst++;
            e.fireCd = e.burst % 3 === 0 ? rand(1.0, 1.8) : 0.16;
            if (Math.random() < 0.3) this.ctx.audio.tone({ freq: 700, type: 'square', dur: 0.05, vol: 0.025, slide: -400 });
          }
          if (dist < 55 || (!playerTarget && dist < 140)) { e.state = 'evade'; e.stateT = rand(1.4, 2.6); e.evade = new THREE.Vector3(rand(-1, 1), rand(-0.5, 0.5), rand(-1, 1)).normalize(); }
        } else {
          goal = e.evade;
          if (e.stateT <= 0) e.state = 'attack';
        }
      }
      // avoid rocks and the station
      for (const r of this.rocks) {
        const d = e.pos.distanceTo(r.pos);
        if (d < r.radius + 22) goal = goal.clone().add(e.pos.clone().sub(r.pos).normalize().multiplyScalar(1.6)).normalize();
      }
      if (e.pos.length() < STATION_R + 30) goal = goal.clone().add(e.pos.clone().normalize().multiplyScalar(2)).normalize();
      const m = new THREE.Matrix4().lookAt(e.pos.clone().add(goal), e.pos, new THREE.Vector3(0, 1, 0));
      e.quat.rotateTowards(new THREE.Quaternion().setFromRotationMatrix(m), e.turn * dt);
      const f = new THREE.Vector3(0, 0, 1).applyQuaternion(e.quat);
      e.vel.copy(f).multiplyScalar(e.speed);
      e.pos.addScaledVector(e.vel, dt);
      e.obj.position.copy(e.pos);
    }
    this.enemies = this.enemies.filter((e) => !e.dead);

    // ----- Boss -----
    if (this.boss) this.updateBoss(dt);

    // ----- Projectiles -----
    this.updateBolts(dt);
    this.updateMissiles(dt);
    this.updateProjectiles(dt);
    this.updateRocks(dt);

    // ----- Wave complete? -----
    if (!this.spawnQueue.length && !this.enemies.length && !this.boss && this.phase === 'play' && this.waveTime > 3) this.waveComplete();

    // Camera
    this.updateCamera(dt);
  }

  lockables() {
    const list = this.enemies.filter((e) => !e.dead);
    const b = this.boss;
    if (b?.alive) {
      // Stable target objects so a missile lock can build up over several frames.
      b.turrets.forEach((t) => {
        if (!t.alive) return;
        t.target = t.target || { pos: V(), boss: true, turret: t, radius: 6 };
        t.obj.getWorldPosition(t.target.pos);
        list.push(t.target);
      });
      if (!b.turrets.some((t) => t.alive)) {
        b.coreTarget = b.coreTarget || { pos: V(), boss: true, core: true, radius: 30, maxHp: b.coreMax };
        b.coreTarget.pos.copy(b.group.position);
        b.coreTarget.hp = b.coreHp;
        list.push(b.coreTarget);
      }
    }
    return list;
  }

  updateBoss(dt) {
    const b = this.boss, p = this.player;
    if (b.arriving) {
      const goal = new THREE.Vector3(Math.cos(b.angle) * b.orbitR, 60, Math.sin(b.angle) * b.orbitR);
      b.group.position.lerp(goal, Math.min(1, dt * 0.35));
      b.group.lookAt(goal.clone().add(new THREE.Vector3(-Math.sin(b.angle), 0, Math.cos(b.angle))));
      if (b.group.position.distanceTo(goal) < 30) b.arriving = false;
    } else {
      b.angle += dt * 0.035;
      const pos = new THREE.Vector3(Math.cos(b.angle) * b.orbitR, 60 + Math.sin(b.angle * 2) * 25, Math.sin(b.angle) * b.orbitR);
      b.group.position.copy(pos);
      b.group.lookAt(pos.clone().add(new THREE.Vector3(-Math.sin(b.angle), 0, Math.cos(b.angle))));
    }
    b.shield.visible = b.turrets.some((t) => t.alive);
    b.shield.material.opacity = 0.08 + Math.sin(this.time * 3) * 0.04;
    // Turrets track and fire plasma at the player
    for (const t of b.turrets) {
      if (!t.alive) continue;
      t.cd -= dt;
      const wp = t.obj.getWorldPosition(V());
      if (p.alive) {
        t.obj.lookAt(p.pos);
        if (t.cd <= 0 && wp.distanceTo(p.pos) < 750) {
          t.cd = rand(1.4, 2.4) / b.level;
          const lead = p.pos.clone().addScaledVector(new THREE.Vector3(0, 0, -1).applyQuaternion(p.quat), p.speed * wp.distanceTo(p.pos) / 260);
          this.enemyFire(wp, lead, 260, 12, 'plasma');
        }
      }
    }
    b.spawnCd -= dt;
    if (b.spawnCd <= 0 && this.enemies.length < 10) {
      b.spawnCd = 14 - b.level * 2;
      for (let i = 0; i < 2; i++) {
        this.spawn('fighter');
        const e = this.enemies[this.enemies.length - 1];
        e.pos.copy(b.group.position).add(new THREE.Vector3(rand(-20, 20), -10, rand(-20, 20)));
      }
    }
  }

  hitBoss(pos, dmg) {
    const b = this.boss;
    if (!b?.alive) return false;
    for (const t of b.turrets) {
      if (!t.alive) continue;
      const wp = t.obj.getWorldPosition(V());
      if (wp.distanceTo(pos) < 7) {
        t.hp -= dmg;
        this.sparksAt(pos, 0xffa04a);
        if (t.hp <= 0) {
          t.alive = false; t.obj.visible = false;
          this.explode(wp, 1.3, 0xff9a3b);
          this.addScore(400, 150);
          if (!b.turrets.some((x) => x.alive)) this.banner('SHIELD DOWN · HIT THE HULL', '#fbbf24');
        }
        return true;
      }
    }
    // hull: three spheres along the ship's length
    const local = b.group.worldToLocal(pos.clone());
    const onHull = Math.abs(local.x) < 18 && Math.abs(local.y) < 14 && Math.abs(local.z) < 80;
    if (!onHull) return false;
    if (b.shield.visible) { this.sparksAt(pos, 0xff5a8a); return true; }
    b.coreHp -= dmg;
    this.sparksAt(pos, 0xffd27a);
    if (b.coreHp <= 0) this.killBoss();
    return true;
  }

  killBoss() {
    const b = this.boss;
    b.alive = false;
    const center = b.group.position.clone();
    for (let i = 0; i < 7; i++) this.later(i * 260, () => this.explode(center.clone().add(new THREE.Vector3(rand(-15, 15), rand(-8, 8), rand(-60, 60)).applyQuaternion(b.group.quaternion)), 2.2, i % 2 ? 0xffb35c : 0xff6a3a));
    this.later(1900, () => { this.scene.remove(b.group); if (this.boss === b) this.boss = null; });
    this.addScore(3000, 1000);
    this.banner('CAPITAL SHIP DESTROYED', '#fbbf24');
  }

  updateBolts(dt) {
    for (const b of this.bolts) {
      if (!b.alive) continue;
      b.life -= dt;
      b.pos.addScaledVector(b.vel, dt);
      b.mesh.position.copy(b.pos);
      if (b.life <= 0) { b.alive = false; b.mesh.visible = false; continue; }
      let hit = false;
      for (const r of this.rocks) if (b.pos.distanceTo(r.pos) < r.radius) { hit = true; this.sparksAt(b.pos, 0xd6c6b0); break; }
      if (!hit && b.friendly) {
        for (const e of this.enemies) {
          if (e.dead || b.pos.distanceTo(e.pos) > e.radius + 1.5) continue;
          e.hp -= b.dmg; hit = true;
          this.sparksAt(b.pos, 0xffd27a);
          this.hitMarker = 0.18;
          if (e.hp <= 0) this.killEnemy(e);
          break;
        }
        if (!hit) for (const pr of this.projectiles) {
          if (pr.kind === 'torpedo' && b.pos.distanceTo(pr.pos) < pr.radius + 2) { pr.hp -= b.dmg; hit = true; if (pr.hp <= 0) { pr.dead = true; this.explode(pr.pos, 0.6, 0xff9a3b); this.addScore(50, 20); } break; }
        }
        if (!hit && this.boss) hit = this.hitBoss(b.pos, b.dmg);
      } else if (!hit && this.player.alive && b.pos.distanceTo(this.player.pos) < 3.2) {
        hit = true;
        this.damagePlayer(b.dmg);
      }
      if (!hit && b.pos.length() < STATION_R - 4) hit = true;
      if (hit) { b.alive = false; b.mesh.visible = false; }
    }
  }

  updateMissiles(dt) {
    for (const m of this.missileList) {
      m.life -= dt;
      if (m.target && (m.target.dead || (m.target.turret && !m.target.turret.alive))) m.target = null;
      if (m.target) {
        const tp = m.target.turret ? m.target.turret.obj.getWorldPosition(V()) : m.target.core ? this.boss?.group.position.clone() : m.target.pos;
        if (tp) {
          const desired = tp.clone().sub(m.pos).normalize().multiplyScalar(300);
          m.vel.lerp(desired, Math.min(1, dt * 3));
        }
      } else m.vel.setLength(Math.min(320, m.vel.length() + dt * 200));
      m.pos.addScaledVector(m.vel, dt);
      m.obj.position.copy(m.pos);
      m.obj.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), m.vel.clone().normalize());
      if (Math.random() < 0.7) this.addSpark(m.pos, m.vel.clone().multiplyScalar(-0.1).add(new THREE.Vector3(rand(-2, 2), rand(-2, 2), rand(-2, 2))), new THREE.Color(1, 0.7, 0.35), 0.4);
      let hit = false;
      for (const e of this.enemies) if (!e.dead && m.pos.distanceTo(e.pos) < e.radius + 3) { e.hp -= 130; hit = true; if (e.hp <= 0) this.killEnemy(e); break; }
      if (!hit && this.boss) hit = this.hitBoss(m.pos, 160);
      if (!hit) for (const r of this.rocks) if (m.pos.distanceTo(r.pos) < r.radius) { hit = true; break; }
      if (hit || m.life <= 0) { m.dead = true; this.scene.remove(m.obj); this.explode(m.pos, 0.8, 0xffb35c); }
    }
    this.missileList = this.missileList.filter((m) => !m.dead);
  }

  updateProjectiles(dt) {
    const p = this.player;
    for (const pr of this.projectiles) {
      if (pr.dead) continue;
      pr.life -= dt;
      if (pr.kind === 'torpedo') {
        const desired = pr.pos.clone().negate().normalize().multiplyScalar(pr.vel.length());
        pr.vel.lerp(desired, Math.min(1, dt * 0.8));
      }
      pr.pos.addScaledVector(pr.vel, dt);
      pr.obj.position.copy(pr.pos);
      pr.obj.material.opacity = 0.7 + Math.sin(this.time * 20) * 0.3;
      if (pr.kind === 'torpedo' && pr.pos.length() < STATION_R + 2) { pr.dead = true; this.damageStation(pr.dmg); this.explode(pr.pos, 0.9, 0xff9a3b); continue; }
      if (pr.kind === 'plasma' && p.alive && pr.pos.distanceTo(p.pos) < pr.radius + 2.5) { pr.dead = true; this.damagePlayer(pr.dmg); this.sparksAt(pr.pos, 0xff4f9a); continue; }
      if (pr.life <= 0) pr.dead = true;
    }
    this.projectiles = this.projectiles.filter((pr) => { if (pr.dead) this.scene.remove(pr.obj); return !pr.dead; });
  }

  updateRocks(dt) {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
    for (const r of this.rocks) {
      r.rot.x += r.spin.x * dt; r.rot.y += r.spin.y * dt; r.rot.z += r.spin.z * dt;
      q.setFromEuler(r.rot); sc.setScalar(r.size);
      m.compose(r.pos, q, sc);
      r.mesh.setMatrixAt(r.index, m);
    }
    this.rockMeshes.forEach((mesh) => { mesh.instanceMatrix.needsUpdate = true; });
  }

  sparksAt(pos, color) {
    const c = new THREE.Color(color);
    for (let i = 0; i < 8; i++) this.addSpark(pos, new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).multiplyScalar(30), c, 0.35);
  }

  updateEffects(dt) {
    for (const f of this.flashes) {
      f.t += dt;
      const k = f.t / f.life;
      f.obj.scale.setScalar(f.scale * (0.3 + k * 1.2));
      f.obj.material.opacity = Math.max(0, 1 - k);
      if (k >= 1) { this.scene.remove(f.obj); f.dead = true; }
    }
    this.flashes = this.flashes.filter((f) => !f.dead);
    let n = 0;
    for (const s of this.sparkData) {
      s.life -= dt;
      if (s.life <= 0) continue;
      s.pos.addScaledVector(s.vel, dt);
      s.vel.multiplyScalar(0.97);
      const k = s.life / s.max;
      this.sparkPos.set([s.pos.x, s.pos.y, s.pos.z], n * 3);
      this.sparkCol.set([s.color.r * k, s.color.g * k, s.color.b * k], n * 3);
      n++;
      if (n >= this.sparkCap) break;
    }
    this.sparkData = this.sparkData.filter((s) => s.life > 0);
    this.sparkGeo.setDrawRange(0, n);
    this.sparkGeo.attributes.position.needsUpdate = true;
    this.sparkGeo.attributes.color.needsUpdate = true;
    this.hitFlash = Math.max(0, (this.hitFlash || 0) - dt * 1.6);
    this.shake = Math.max(0, (this.shake || 0) - dt * 2);
    this.hitMarker = Math.max(0, (this.hitMarker || 0) - dt);
    this.stationHit = Math.max(0, (this.stationHit || 0) - dt);
    // Space dust wraps around the camera
    const cam = this.camera.position, pos = this.dust.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      let x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      if (x - cam.x > 60) x -= 120; else if (x - cam.x < -60) x += 120;
      if (y - cam.y > 60) y -= 120; else if (y - cam.y < -60) y += 120;
      if (z - cam.z > 60) z -= 120; else if (z - cam.z < -60) z += 120;
      pos.setXYZ(i, x, y, z);
    }
    pos.needsUpdate = true;
  }

  updateCamera(dt) {
    const p = this.player;
    const cam = this.camera;
    const q = p.quat;
    const offset = new THREE.Vector3(0, 4.2, 15).applyQuaternion(q);
    const desired = p.pos.clone().add(offset);
    cam.position.lerp(desired, 1 - Math.exp(-dt * (p.alive ? 9 : 2)));
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
    cam.up.lerp(up, 1 - Math.exp(-dt * 6)).normalize();
    cam.lookAt(p.pos.clone().add(new THREE.Vector3(0, 0, -40).applyQuaternion(q)).add(up.clone().multiplyScalar(1.5)));
    if (this.shake > 0 && !this.ctx.calm) {
      cam.position.add(new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).multiplyScalar(this.shake * 1.2));
    }
    const fov = 70 + (p.boosting ? 9 : 0);
    cam.fov += (fov - cam.fov) * Math.min(1, dt * 4);
    cam.updateProjectionMatrix();
  }

  waveComplete() {
    const bonus = 500 * this.wave;
    const stationBonus = Math.round(this.stationHp / this.stationMax * 300);
    this.addScore(bonus, 200 * this.wave + stationBonus);
    this.ctx.audio.chime();
    this.save.bestWave = Math.max(this.save.bestWave || 0, this.wave);
    this.ctx.storage.save(this.save);
    this.ctx.reportScore(this.score);
    this.ctx.awardXP(15 + this.wave * 5, `Wave ${this.wave} cleared`);
    if (this.wave >= TOTAL_WAVES) { this.later(1200, () => this.finish(true, 'All ten waves repelled. Orbit Station is safe!')); this.phase = 'ending'; return; }
    this.phase = 'ending';
    this.banner(`WAVE ${this.wave} CLEARED · +${bonus}`, '#4ade80');
    this.later(1800, () => this.showHangar());
  }

  finish(won, message) {
    if (this.phase === 'over') return;
    this.phase = 'over';
    this.closeOverlay();
    if (won) { this.save.won = true; this.save.bestWave = TOTAL_WAVES; }
    this.ctx.storage.save(this.save);
    this.ctx.gameOver(this.score, { won, title: won ? 'Victory!' : 'Mission failed', message: `${message} You reached wave ${this.wave}.` });
  }

  banner(text, color) {
    const el = this.$('[data-banner]');
    el.textContent = text;
    el.style.color = color;
    el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
  }

  /* ---------- HUD ---------- */
  resize() {
    const r = this.root.getBoundingClientRect();
    const w = Math.max(1, r.width), h = Math.max(1, r.height);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.hud.width = Math.round(w * dpr); this.hud.height = Math.round(h * dpr);
    this.hudScale = dpr;
    this.size = { w, h };
  }

  project(v) {
    const p = v.clone().project(this.camera);
    const behind = p.z > 1 || new THREE.Vector3().subVectors(v, this.camera.position).dot(this.camera.getWorldDirection(V())) < 0;
    return { x: (p.x * 0.5 + 0.5) * this.size.w, y: (-p.y * 0.5 + 0.5) * this.size.h, behind };
  }

  drawHud() {
    const g = this.hg, { w, h } = this.size;
    g.setTransform(this.hudScale, 0, 0, this.hudScale, 0, 0);
    g.clearRect(0, 0, w, h);
    if (this.phase !== 'play' && this.phase !== 'ending') return;
    const p = this.player;
    const cx = w / 2, cy = h / 2;
    g.lineWidth = 1.5;

    // Boresight (where lasers go) and steering cursor
    if (p.alive) {
      const aim = this.project(p.pos.clone().add(new THREE.Vector3(0, 0, -260).applyQuaternion(p.quat)));
      g.strokeStyle = this.hitMarker > 0 ? '#ffffff' : 'rgba(103,232,249,0.9)';
      g.beginPath(); g.arc(aim.x, aim.y, 10, 0, Math.PI * 2); g.stroke();
      g.beginPath(); g.moveTo(aim.x - 18, aim.y); g.lineTo(aim.x - 12, aim.y); g.moveTo(aim.x + 12, aim.y); g.lineTo(aim.x + 18, aim.y);
      g.moveTo(aim.x, aim.y - 18); g.lineTo(aim.x, aim.y - 12); g.moveTo(aim.x, aim.y + 12); g.lineTo(aim.x, aim.y + 18); g.stroke();
      if (this.hitMarker > 0) {
        g.strokeStyle = '#fff'; g.lineWidth = 2;
        [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a, b]) => { g.beginPath(); g.moveTo(aim.x + a * 6, aim.y + b * 6); g.lineTo(aim.x + a * 12, aim.y + b * 12); g.stroke(); });
        g.lineWidth = 1.5;
      }
      if (this.pointer.inside && !this.touch.stick) {
        const mx = (this.pointer.x * 0.5 + 0.5) * w, my = (this.pointer.y * 0.5 + 0.5) * h;
        g.strokeStyle = 'rgba(255,255,255,0.35)';
        g.setLineDash([3, 5]); g.beginPath(); g.moveTo(cx, cy); g.lineTo(mx, my); g.stroke(); g.setLineDash([]);
        g.strokeStyle = 'rgba(255,255,255,0.8)';
        g.beginPath(); g.arc(mx, my, 5, 0, Math.PI * 2); g.stroke();
      }
    }

    // Targets
    const targets = this.lockables();
    for (const t of targets) {
      const s = this.project(t.pos);
      const dist = t.pos.distanceTo(p.pos);
      const onScreen = !s.behind && s.x > 0 && s.x < w && s.y > 0 && s.y < h;
      const color = t.boss ? '#f472b6' : t.type === 'bomber' ? '#fb923c' : '#f87171';
      if (onScreen) {
        const size = clamp(900 / Math.max(dist, 1) * (t.radius || 8), 9, 46);
        g.strokeStyle = color;
        const c = size * 0.4;
        [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a, b]) => {
          g.beginPath(); g.moveTo(s.x + a * size, s.y + b * (size - c)); g.lineTo(s.x + a * size, s.y + b * size); g.lineTo(s.x + a * (size - c), s.y + b * size); g.stroke();
        });
        if (t.hp !== undefined && t.maxHp) {
          g.fillStyle = 'rgba(255,255,255,0.15)'; g.fillRect(s.x - size, s.y + size + 4, size * 2, 3);
          g.fillStyle = color; g.fillRect(s.x - size, s.y + size + 4, size * 2 * Math.max(0, t.hp / t.maxHp), 3);
        }
        if (dist < 500) { g.fillStyle = 'rgba(255,255,255,0.6)'; g.font = '10px Inter, sans-serif'; g.textAlign = 'center'; g.fillText(`${Math.round(dist)}m`, s.x, s.y - size - 5); }
        // Lead indicator for the locked/nearest target
        if (t === p.lock && t.vel) {
          const lead = this.project(t.pos.clone().addScaledVector(t.vel, dist / (620 + p.speed)));
          if (!lead.behind) { g.strokeStyle = '#fde047'; g.beginPath(); g.arc(lead.x, lead.y, 5, 0, Math.PI * 2); g.stroke(); }
        }
        if (t === p.lock) {
          const k = p.lockT;
          g.save(); g.translate(s.x, s.y); g.rotate(this.time * 2);
          g.strokeStyle = k >= 1 ? '#fde047' : 'rgba(253,224,71,0.6)';
          g.lineWidth = k >= 1 ? 2.5 : 1.5;
          const rr = size + 8 + (1 - k) * 20;
          g.beginPath(); g.moveTo(0, -rr); g.lineTo(rr, 0); g.lineTo(0, rr); g.lineTo(-rr, 0); g.closePath(); g.stroke();
          g.restore();
        }
      } else {
        // Edge arrow
        let dx = s.x - cx, dy = s.y - cy;
        if (s.behind) { dx = -dx; dy = -dy; }
        const ang = Math.atan2(dy, dx);
        const R = Math.min(w, h) * 0.42;
        const ax = cx + Math.cos(ang) * R, ay = cy + Math.sin(ang) * R;
        g.save(); g.translate(ax, ay); g.rotate(ang);
        g.fillStyle = color; g.globalAlpha = 0.85;
        g.beginPath(); g.moveTo(10, 0); g.lineTo(-6, -7); g.lineTo(-6, 7); g.closePath(); g.fill();
        g.restore();
      }
    }

    // Station marker
    const st = this.project(new THREE.Vector3());
    if (!st.behind && st.x > 0 && st.x < w && st.y > 0 && st.y < h) {
      g.strokeStyle = this.stationHit > 0 ? '#fb7185' : 'rgba(103,232,249,0.7)';
      g.strokeRect(st.x - 14, st.y - 14, 28, 28);
      g.fillStyle = 'rgba(103,232,249,0.85)'; g.font = '700 10px "Exo 2", sans-serif'; g.textAlign = 'center';
      g.fillText('STATION', st.x, st.y - 20);
    }

    // Radar
    // On touch screens the bottom belongs to the stick and buttons, so the radar sits in the open sky below the top panels.
    const rr = this.coarse ? Math.min(48, w * 0.12) : Math.min(70, w * 0.14), rx = w / 2, ry = this.coarse ? 150 + rr : h - rr - 18;
    g.fillStyle = 'rgba(5,10,25,0.55)'; g.strokeStyle = 'rgba(103,232,249,0.35)';
    g.beginPath(); g.arc(rx, ry, rr, 0, Math.PI * 2); g.fill(); g.stroke();
    g.beginPath(); g.arc(rx, ry, rr / 2, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.moveTo(rx - rr, ry); g.lineTo(rx + rr, ry); g.moveTo(rx, ry - rr); g.lineTo(rx, ry + rr); g.stroke();
    const inv = p.quat.clone().invert();
    const blip = (pos, color, size) => {
      const local = pos.clone().sub(p.pos).applyQuaternion(inv);
      const d = Math.hypot(local.x, local.z);
      const range = 900;
      let bx = local.x / range * rr, by = local.z / range * rr;
      const m = Math.hypot(bx, by);
      if (m > rr - 3) { bx *= (rr - 3) / m; by *= (rr - 3) / m; }
      g.fillStyle = color;
      g.globalAlpha = local.y > 20 ? 1 : local.y < -20 ? 0.55 : 0.85;
      g.beginPath(); g.arc(rx + bx, ry + by, size, 0, Math.PI * 2); g.fill();
      g.globalAlpha = 1;
      return d;
    };
    blip(new THREE.Vector3(), '#67e8f9', 4);
    for (const t of targets) blip(t.pos, t.boss ? '#f472b6' : t.type === 'bomber' ? '#fb923c' : '#f87171', t.boss ? 3.5 : 2.4);
    for (const pr of this.projectiles) if (pr.kind === 'torpedo') blip(pr.pos, '#fde047', 1.6);
    g.fillStyle = '#fff'; g.beginPath(); g.moveTo(rx, ry - 5); g.lineTo(rx + 4, ry + 4); g.lineTo(rx - 4, ry + 4); g.fill();

    if (this.outOfBounds) {
      g.fillStyle = '#fbbf24'; g.font = '700 14px "Exo 2", sans-serif'; g.textAlign = 'center';
      g.fillText('LEAVING COMBAT ZONE · TURNING BACK', cx, h * 0.28);
    }
  }

  updateDom() {
    const p = this.player, s = this.stats();
    const set = (sel, v) => { const el = this.$(sel); if (el && el.textContent !== String(v)) el.textContent = v; };
    const bar = (sel, k) => { const el = this.$(sel); if (el) el.style.width = `${clamp(k, 0, 1) * 100}%`; };
    set('[data-wave]', `${Math.max(1, this.wave)} / ${TOTAL_WAVES}`);
    const left = this.enemies.length + this.spawnQueue.length + (this.boss ? 1 : 0);
    set('[data-left]', this.phase === 'play' ? `${left} hostile${left === 1 ? '' : 's'}` : '');
    set('[data-credits]', this.credits.toLocaleString());
    set('[data-score]', `Score ${this.score.toLocaleString()}`);
    bar('[data-station]', this.stationHp / this.stationMax);
    this.$('.sf-station').classList.toggle('hit', this.stationHit > 0);
    bar('[data-shield]', p.shield / s.shield);
    bar('[data-hull]', p.hull / s.hull);
    bar('[data-energy]', p.energy / 100);
    set('[data-missiles]', p.missiles);
    set('[data-speed]', Math.round(p.speed * 3));
    const lockEl = this.$('[data-lock]');
    const lockText = p.lock ? (p.lockT >= 1 ? 'LOCKED' : 'LOCKING…') : 'NO LOCK';
    if (lockEl.textContent !== lockText) { lockEl.textContent = lockText; lockEl.dataset.state = p.lockT >= 1 && p.lock ? 'on' : p.lock ? 'acq' : ''; }
    const lives = this.$('[data-lives]');
    if (lives.dataset.n !== String(this.lives)) { lives.dataset.n = this.lives; lives.innerHTML = Array.from({ length: 3 }, (_, i) => `<i class="${i < this.lives ? 'on' : ''}"></i>`).join(''); }
    this.$('.sf-vignette').style.opacity = String(Math.min(0.85, this.hitFlash || 0) + (p.alive && p.hull / s.hull < 0.3 ? 0.25 + Math.sin(this.time * 6) * 0.1 : 0));
    this.ctx.setInfo(this.phase === 'play' ? `Wave ${this.wave} · ${left} hostiles · Lives ${this.lives}` : '');
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.timers.forEach(clearTimeout);
    this.listeners.forEach(([t, e, f, o]) => t.removeEventListener(e, f, o));
    this.ro.disconnect();
    this.scene.traverse((o) => {
      o.geometry?.dispose?.();
      const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
      mats.forEach((m) => { m.map?.dispose?.(); m.dispose?.(); });
    });
    this.scene.background?.dispose?.();
    this.scene.environment?.dispose?.();
    this.renderer.dispose();
    this.renderer.forceContextLoss?.();
    Object.keys(MAT).forEach((k) => delete MAT[k]);
    this.root.innerHTML = '';
  }
}
