// Live 3D art for the arcade: animated cover scenes for the full games and rotating 3D icons for every game.
// One shared WebGL renderer draws each visible view into its own 2D canvas (viewport + scissor on a
// grow-only buffer, then drawImage), at ~30 fps, only while views are on screen. SVG art stays underneath
// as the fallback until a view's first 3D frame is ready.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { createSkyCube, makePlanet, makeAsteroidGeometries, glowTexture, makeGlowSprite, seededRandom } from './space-assets.js';
import { buildPlayerShip, buildEnemy, buildStation } from './games/big/models.js';
import { ALL_GAMES } from './games/index.js';
import { Motion } from './motion.js';

const TAU = Math.PI * 2;
const COLOR = Object.fromEntries(ALL_GAMES.map((g) => [g.id, g.color]));

/* ------------------------------------------------------------------ materials */
const glossy = (color, o = {}) => new THREE.MeshPhysicalMaterial({ color, roughness: 0.28, metalness: 0.12, clearcoat: 1, clearcoatRoughness: 0.12, ...o });
const metal = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.85, ...o });
const glow = (color, k = 2) => new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: k, roughness: 0.4 });
const additive = (color, opacity = 0.9) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false });
const shade = (hex, k) => new THREE.Color(hex).lerp(new THREE.Color(k < 0 ? 0x05030f : 0xffffff), Math.abs(k));

function labelTexture(text, bg, fg = '#ffffff') {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, 128, 128);
  g.fillStyle = fg; g.font = '800 72px "Exo 2", Inter, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 64, 70);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/* ------------------------------------------------------------------ icon scenes */
// Each returns { group, update(t, view) }. Objects fit within a radius of ~1.6 around the origin.
const ICONS = {
  wordle(A) {
    const g = new THREE.Group();
    const tiles = [['O', A], ['R', shade(A, -0.45).getStyle()], ['B', '#334155'], ['I', shade(A, 0.25).getStyle()]].map(([ch, col], i) => {
      const m = new THREE.Mesh(new RoundedBoxGeometry(1, 1, 0.34, 3, 0.12), glossy(0xffffff, { map: labelTexture(ch, new THREE.Color(col).getStyle()) }));
      m.position.set(i % 2 ? 0.56 : -0.56, i < 2 ? 0.56 : -0.56, 0);
      g.add(m);
      return m;
    });
    return { group: g, update(t) { tiles.forEach((m, i) => { const k = ((t * 0.5 + i * 0.22) % 1.8); m.rotation.x = k < 0.5 ? (k / 0.5) * TAU : 0; }); } };
  },
  sketch(A) {
    const g = new THREE.Group();
    const pencil = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 2, 6), glossy(A));
    const wood = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.45, 6), glossy(0xf1d3a1, { clearcoat: 0.2 })); wood.position.y = -1.22; wood.rotation.x = Math.PI;
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.16, 6), metal(0x1f2937)); tip.position.y = -1.42; tip.rotation.x = Math.PI;
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.21, 0.2, 16), metal(0xd1d5db)); band.position.y = 1.08;
    const eraser = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.25, 16), glossy(0xf9a8d4)); eraser.position.y = 1.3;
    pencil.add(body, wood, tip, band, eraser);
    pencil.rotation.z = -0.75; pencil.position.set(0.45, 0.35, 0.2);
    const curve = new THREE.CatmullRomCurve3([[-1.5, -0.9, 0], [-1, -0.2, 0.2], [-0.5, -0.9, 0], [0, -0.2, 0.2], [0.4, -0.8, 0], [0.75, -0.6, 0]].map((p) => new THREE.Vector3(...p)));
    const tubeGeo = new THREE.TubeGeometry(curve, 80, 0.06, 8, false);
    const tube = new THREE.Mesh(tubeGeo, glow(0xf472b6, 1.6));
    const total = tubeGeo.index.count;
    g.add(pencil, tube);
    return { group: g, update(t) { const k = (t * 0.45) % 1.3; tubeGeo.setDrawRange(0, Math.floor(Math.min(1, k) * total / 6) * 6); pencil.position.x = 0.45 + Math.sin(t * 3) * 0.05; } };
  },
  dodger(A, art) {
    const g = new THREE.Group();
    const craft = new THREE.Group();
    const ship = buildPlayerShip(art.glowTex).group;
    ship.scale.setScalar(0.27);
    craft.add(ship);
    craft.rotation.x = 1.05; // nose up the screen, seen from above
    craft.position.y = -0.45;
    const geos = makeAsteroidGeometries(3, 5);
    const rockMat = new THREE.MeshStandardMaterial({ color: 0xa8815f, roughness: 0.95, flatShading: true });
    const rocks = geos.map((geo, i) => { const r = new THREE.Mesh(geo, rockMat); r.scale.setScalar(0.3 + i * 0.07); g.add(r); return { r, x: [-1.05, 1.0, 0.05][i], ph: i / 3 }; });
    g.add(craft);
    return { group: g, update(t) {
      craft.rotation.y = Math.sin(t * 2) * 0.45; craft.position.x = Math.sin(t * 2) * 0.45;
      rocks.forEach((o) => { const k = (t * 0.4 + o.ph) % 1; o.r.position.set(o.x + (o.x ? 0 : Math.sin(t) * 0.3), 1.9 - k * 3.8, -0.3); o.r.rotation.set(t, t * 0.7, 0); o.r.visible = k > 0.04 && k < 0.96; });
    } };
  },
  pong(A) {
    const g = new THREE.Group();
    const hole = new THREE.Mesh(new THREE.SphereGeometry(0.48, 32, 16), new THREE.MeshBasicMaterial({ color: 0x000000 }));
    const diskTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d'); const grd = x.createRadialGradient(128, 128, 60, 128, 128, 128); grd.addColorStop(0, 'rgba(255,240,220,1)'); grd.addColorStop(0.35, 'rgba(251,146,60,0.9)'); grd.addColorStop(0.7, 'rgba(168,85,247,0.6)'); grd.addColorStop(1, 'rgba(168,85,247,0)'); x.fillStyle = grd; x.fillRect(0, 0, 256, 256); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
    const disk = new THREE.Mesh(new THREE.RingGeometry(0.55, 1.35, 64), new THREE.MeshBasicMaterial({ map: diskTex, transparent: true, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
    disk.rotation.x = -1.2;
    const photon = new THREE.Mesh(new THREE.TorusGeometry(0.52, 0.025, 8, 64), additive(0xfde68a, 0.9));
    const paddles = [-1, 1].map((s) => { const p = new THREE.Mesh(new RoundedBoxGeometry(0.18, 0.95, 0.22, 2, 0.06), s < 0 ? glossy(A) : glossy(0xf472b6)); p.position.x = s * 1.55; g.add(p); return p; });
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.11, 16, 12), glow(0xfde047, 2.5));
    g.add(hole, disk, photon, ball);
    return { group: g, update(t) {
      const k = t * 1.2;
      ball.position.set(Math.cos(k) * 1.3, Math.sin(k * 2) * 0.25, Math.sin(k) * 0.5);
      paddles[0].position.y = Math.sin(t * 1.6) * 0.3; paddles[1].position.y = Math.cos(t * 1.4) * 0.3;
      disk.rotation.z = t * 0.6;
    } };
  },
  typing(A) {
    const g = new THREE.Group();
    const ufo = new THREE.Group();
    const saucer = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 20), glossy(A)); saucer.scale.set(1.15, 0.28, 1.15);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.48, 32, 16, 0, TAU, 0, Math.PI / 2), new THREE.MeshPhysicalMaterial({ color: 0xbbf7d0, roughness: 0, transmission: 0.6, thickness: 0.3, clearcoat: 1 }));
    dome.position.y = 0.12;
    const lights = Array.from({ length: 8 }, (_, i) => { const l = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), glow(0xffffff, 2)); const a = (i / 8) * TAU; l.position.set(Math.cos(a) * 1.02, 0, Math.sin(a) * 1.02); ufo.add(l); return l; });
    ufo.add(saucer, dome);
    ufo.position.y = 0.7;
    const beam = new THREE.Mesh(new THREE.ConeGeometry(0.55, 1.5, 24, 1, true), additive(0x67e8f9, 0.35));
    beam.position.y = -0.2;
    const key = new THREE.Mesh(new RoundedBoxGeometry(1.1, 0.3, 0.8, 3, 0.1), glossy(0x1e293b)); key.position.y = -1.05;
    const keyTop = new THREE.Mesh(new RoundedBoxGeometry(0.9, 0.08, 0.6, 2, 0.04), glow(A, 0.8)); keyTop.position.y = -0.88;
    g.add(ufo, beam, key, keyTop);
    return { group: g, update(t) {
      ufo.position.y = 0.7 + Math.sin(t * 2) * 0.08; ufo.rotation.y = t;
      lights.forEach((l, i) => { l.material.emissiveIntensity = 0.6 + (Math.sin(t * 6 + i) > 0.6 ? 2.5 : 0); });
      const fire = (t * 1.3) % 1 < 0.35;
      beam.material.opacity = fire ? 0.4 : 0.06; keyTop.position.y = fire ? -0.91 : -0.88;
    } };
  },
  q2048(A) {
    const g = new THREE.Group();
    const vals = [['2', shade(A, -0.4)], ['4', shade(A, -0.15)], ['8', new THREE.Color(A)], ['16', new THREE.Color(0xdb2777)]];
    const cubes = vals.map(([v, c], i) => {
      const m = new THREE.Mesh(new RoundedBoxGeometry(0.95, 0.95, 0.95, 3, 0.16), glossy(0xffffff, { map: labelTexture(v, c.getStyle()) }));
      m.position.set(i % 2 ? 0.55 : -0.55, i < 2 ? 0.55 : -0.55, 0);
      g.add(m);
      return m;
    });
    return { group: g, update(t) { const k = (t * 0.7) % 2; const s = k > 1.6 ? 1 + Math.sin((k - 1.6) / 0.4 * Math.PI) * 0.18 : 1; cubes[3].scale.setScalar(s); cubes.forEach((c, i) => { c.rotation.y = Math.sin(t + i) * 0.15; }); } };
  },
  lander(A) {
    const g = new THREE.Group();
    const moon = new THREE.Mesh(new THREE.SphereGeometry(3, 48, 24, 0, TAU, 0, 0.38), new THREE.MeshStandardMaterial({ color: 0x4b5563, roughness: 1, flatShading: true, envMapIntensity: 0.3 }));
    moon.position.y = -4.15;
    const pad = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.04, 8, 48), glow(0x4ade80, 2)); pad.rotation.x = Math.PI / 2; pad.position.y = -1.32;
    const lm = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.55, 0.45, 8), metal(0xd4a017, { roughness: 0.45 }));
    const cabin = new THREE.Mesh(new RoundedBoxGeometry(0.62, 0.48, 0.55, 2, 0.08), metal(0xd1d5db)); cabin.position.y = 0.45;
    const win = new THREE.Mesh(new THREE.CircleGeometry(0.1, 16), glow(A, 1.5)); win.position.set(0, 0.48, 0.28);
    lm.add(body, cabin, win);
    [0, 1, 2, 3].forEach((i) => {
      const a = (i / 4) * TAU + Math.PI / 4;
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.75, 6), metal(0xe5e7eb));
      leg.position.set(Math.cos(a) * 0.55, -0.32, Math.sin(a) * 0.55); leg.rotation.set(Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5);
      const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.03, 12), metal(0xe5e7eb)); foot.position.set(Math.cos(a) * 0.72, -0.66, Math.sin(a) * 0.72);
      lm.add(leg, foot);
    });
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.6, 16, 1, true), additive(0xfb923c, 0.9)); flame.rotation.x = Math.PI; flame.position.y = -0.55;
    lm.add(flame);
    g.add(moon, pad, lm);
    lm.scale.setScalar(1.25);
    return { group: g, update(t) { const k = (t * 0.25) % 1; lm.position.y = 0.95 - Math.min(1, k * 1.4) * 1.4; flame.scale.set(1, 0.7 + Math.random() * 0.6, 1); flame.visible = k < 0.68; lm.rotation.y = t * 0.3; } };
  },
  breaker(A) {
    const g = new THREE.Group();
    const cols = [shade(A, 0.35), new THREE.Color(A), shade(A, -0.35)];
    const bricks = [];
    for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) {
      const b = new THREE.Mesh(new RoundedBoxGeometry(0.7, 0.3, 0.35, 2, 0.07), glossy(cols[r]));
      b.position.set(-1.14 + c * 0.76, 1 - r * 0.36, 0);
      g.add(b); bricks.push(b);
    }
    const paddle = new THREE.Mesh(new RoundedBoxGeometry(1.1, 0.18, 0.35, 2, 0.08), glossy(0xe2e8f0)); paddle.position.y = -1.2;
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 12), glow(0xfde047, 2.5));
    g.add(paddle, ball);
    return { group: g, update(t) {
      const k = (t * 0.8) % 1, hit = bricks[Math.floor(t * 0.8) % bricks.length];
      ball.position.set(Math.sin(t * 1.3) * 0.9, -1.05 + Math.sin(k * Math.PI) * 1.4, 0.1);
      paddle.position.x = ball.position.x * 0.8;
      bricks.forEach((b) => { b.scale.setScalar(1); b.visible = true; });
      if (k > 0.45 && k < 0.6) hit.scale.setScalar(1 + (k - 0.45) * 4);
    } };
  },
  memory(A, art) {
    const g = new THREE.Group();
    const pts = [[-1.2, 0.4, 0], [-0.5, 1.1, 0.2], [0.4, 0.6, -0.1], [1.2, 0.9, 0.1], [0.8, -0.6, 0.2], [-0.4, -0.8, 0]].map((p) => new THREE.Vector3(...p));
    const lineMat = new THREE.MeshBasicMaterial({ color: A, transparent: true, opacity: 0.45 });
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1], len = a.distanceTo(b);
      const l = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, len, 6), lineMat);
      l.position.copy(a).add(b).multiplyScalar(0.5);
      l.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
      g.add(l);
    }
    const stars = pts.map((p, i) => {
      const s = new THREE.Mesh(new THREE.OctahedronGeometry(0.16, 0), glow(i % 2 ? A : 0xffffff, 1.5));
      s.position.copy(p);
      const halo = makeGlowSprite(art.glowTex, A, 0.9, 0.7); halo.position.copy(p);
      g.add(s, halo);
      return { s, halo };
    });
    return { group: g, update(t) { const active = Math.floor(t * 2) % stars.length; stars.forEach((o, i) => { const on = i === active; o.s.scale.setScalar(on ? 1.7 : 1); o.halo.scale.setScalar(on ? 1.6 : 0.8); o.s.rotation.y = t * 2; }); } };
  },
  mines(A) {
    const g = new THREE.Group();
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.75, 32, 20), metal(0x374151, { roughness: 0.3 }));
    g.add(core);
    const dirs = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1], [0.7, 0.7, 0], [-0.7, 0.7, 0], [0.7, -0.7, 0], [-0.7, -0.7, 0], [0, 0.7, 0.7], [0, -0.7, -0.7]];
    dirs.forEach((d) => {
      const v = new THREE.Vector3(...d).normalize();
      const spike = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.11, 0.42, 8), metal(0x9ca3af));
      spike.position.copy(v).multiplyScalar(0.92);
      spike.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), v);
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), glow(0xf43f5e, 1.5));
      tip.position.copy(v).multiplyScalar(1.15);
      g.add(spike, tip);
    });
    const light = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 8), glow(0xff3344, 3)); light.position.set(0, 0.35, 0.68);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.45, 0.025, 8, 80), additive(new THREE.Color(A), 0.7)); ring.rotation.x = 1.25;
    g.add(light, ring);
    return { group: g, update(t) { light.visible = (t % 1.2) < 0.25; ring.scale.setScalar(1 + ((t * 0.6) % 1) * 0.15); ring.material.opacity = 0.7 - ((t * 0.6) % 1) * 0.5; core.rotation.y = t * 0.4; } };
  },
  invaders(A) {
    const g = new THREE.Group();
    const frames = [
      ['..X.....X..', '...X...X...', '..XXXXXXX..', '.XX.XXX.XX.', 'XXXXXXXXXXX', 'X.XXXXXXX.X', 'X.X.....X.X', '...XX.XX...'],
      ['..X.....X..', 'X..X...X..X', 'X.XXXXXXX.X', 'XXX.XXX.XXX', 'XXXXXXXXXXX', '.XXXXXXXXX.', '..X.....X..', '.X.......X.'],
    ];
    const s = 0.24;
    const mats = glossy(A);
    const meshes = frames.map((rows) => {
      const cells = [];
      rows.forEach((row, r) => [...row].forEach((ch, c) => { if (ch === 'X') cells.push([c, r]); }));
      const m = new THREE.InstancedMesh(new RoundedBoxGeometry(s * 0.96, s * 0.96, s * 1.6, 1, 0.03), mats, cells.length);
      const mat4 = new THREE.Matrix4();
      cells.forEach(([c, r], i) => { mat4.makeTranslation((c - 5) * s, (3.5 - r) * s, 0); m.setMatrixAt(i, mat4); });
      g.add(m);
      return m;
    });
    const eyes = [-1, 1].map((k) => { const e = new THREE.Mesh(new THREE.BoxGeometry(s, s, s * 1.7), glossy(0x05030f)); e.position.set(k * 1.5 * s * 1.33, 0.5 * s, 0); g.add(e); return e; });
    void eyes;
    return { group: g, update(t) { const f = Math.floor(t * 2.5) % 2; meshes[0].visible = f === 0; meshes[1].visible = f === 1; g.position.y = Math.sin(t * 2) * 0.08; } };
  },
  trivia(A) {
    const g = new THREE.Group();
    const rings = [1.5, 1.15, 0.82].map((r, i) => {
      const m = new THREE.Mesh(new THREE.TorusGeometry(r, 0.07 - i * 0.012, 12, 96), glossy(i === 1 ? 0xa855f7 : A, { emissive: new THREE.Color(i === 1 ? 0xa855f7 : A), emissiveIntensity: 0.35 }));
      g.add(m); return m;
    });
    const qCurve = new THREE.CatmullRomCurve3([[-0.32, 0.45, 0], [-0.2, 0.68, 0], [0.1, 0.72, 0], [0.32, 0.5, 0], [0.22, 0.22, 0], [0, 0.05, 0], [0, -0.18, 0]].map((p) => new THREE.Vector3(...p)));
    const q = new THREE.Mesh(new THREE.TubeGeometry(qCurve, 48, 0.09, 10, false), glossy(0xffffff, { emissive: new THREE.Color(0xe0f2fe), emissiveIntensity: 0.5 }));
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.11, 16, 12), q.material); dot.position.y = -0.45;
    const qg = new THREE.Group(); qg.add(q, dot); qg.position.y = 0.05;
    g.add(qg);
    return { group: g, update(t) { rings[0].rotation.set(t * 0.5, t * 0.3, 0); rings[1].rotation.set(-t * 0.7, 0, t * 0.4); rings[2].rotation.set(0, t * 0.9, -t * 0.5); qg.rotation.y = Math.sin(t) * 0.6; } };
  },
  starfighter(A, art) {
    const g = new THREE.Group();
    const ship = buildPlayerShip(art.glowTex).group;
    ship.scale.setScalar(0.3); ship.rotation.y = Math.PI * 0.8;
    g.add(ship);
    return { group: g, update(t) { ship.rotation.z = Math.sin(t * 1.4) * 0.4; ship.position.y = Math.sin(t * 2) * 0.08; } };
  },
  conquest(A) {
    const g = new THREE.Group();
    const planet = new THREE.Mesh(new THREE.SphereGeometry(0.8, 40, 24), glossy(0x3b82f6, { map: labelTexture('', '#2563eb') }));
    const band = new THREE.Mesh(new THREE.TorusGeometry(1.25, 0.05, 10, 96), glow(A, 1.2)); band.rotation.x = 1.3;
    const ships = [0, 1, 2].map((i) => { const s = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.3, 4), glow(i === 1 ? 0xef4444 : 0x93c5fd, 1.5)); g.add(s); return s; });
    g.add(planet, band);
    return { group: g, update(t) {
      planet.rotation.y = t * 0.4;
      ships.forEach((s, i) => { const a = t * (0.9 + i * 0.2) + i * 2.1, r = 1.55 + i * 0.12; s.position.set(Math.cos(a) * r, Math.sin(a * 1.3) * 0.3, Math.sin(a) * r); s.rotation.set(0, -a, Math.PI / 2); });
    } };
  },
  colony(A) {
    const g = new THREE.Group();
    const rock = new THREE.Mesh(makeAsteroidGeometries(1, 9)[0], new THREE.MeshStandardMaterial({ color: 0x8b8178, roughness: 1, flatShading: true }));
    rock.scale.set(1.3, 0.75, 1.1); rock.position.y = -0.35;
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.38, 24, 12, 0, TAU, 0, Math.PI / 2), new THREE.MeshPhysicalMaterial({ color: 0xe0f2fe, roughness: 0.05, transmission: 0.5, clearcoat: 1 }));
    dome.position.set(-0.35, 0.28, 0.1);
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.9, 10), metal(0xcbd5e1)); tower.position.set(0.45, 0.62, 0);
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 8), glow(0xff3344, 3)); beacon.position.set(0.45, 1.1, 0);
    const panel = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.03, 0.35), new THREE.MeshStandardMaterial({ color: 0x1e3a8a, metalness: 0.6, roughness: 0.3 })); panel.position.set(0.1, 0.3, -0.45); panel.rotation.x = -0.4;
    const drone = new THREE.Mesh(new THREE.SphereGeometry(0.08, 12, 8), glow(A, 2.5));
    g.add(rock, dome, tower, beacon, panel, drone);
    return { group: g, update(t) { beacon.visible = (t % 1.4) < 0.3; drone.position.set(Math.cos(t * 1.4) * 1.5, 0.5 + Math.sin(t * 2.8) * 0.2, Math.sin(t * 1.4) * 0.9); g.rotation.y = Math.sin(t * 0.4) * 0.5; } };
  },
};

/* ------------------------------------------------------------------ cover scenes */
const COVERS = {
  starfighter(art) {
    const scene = new THREE.Scene();
    scene.background = art.sky();
    scene.environment = art.skyEnv();
    const sunDir = new THREE.Vector3(0.8, 0.5, -0.6).normalize();
    const light = new THREE.DirectionalLight(0xfff2e0, 3); light.position.copy(sunDir).multiplyScalar(10);
    const fill = new THREE.DirectionalLight(0x9db8ff, 1.1); fill.position.set(6, 5, 14);
    scene.add(light, fill, new THREE.AmbientLight(0x6070a0, 0.35));
    const sun = makeGlowSprite(art.glowTex, 0xffe1b0, 60, 1); sun.position.copy(sunDir).multiplyScalar(120); scene.add(sun);
    const planet = makePlanet(art.renderer, { type: 'earth', radius: 40, seed: 5, sunDir, segments: 64, atmosphere: { color: 0x5aa8ff, intensity: 1.6, power: 2.4, scale: 1.03 }, size: 1024 });
    planet.group.position.set(0, -46, -18);
    scene.add(planet.group);
    const station = buildStation().group; station.scale.setScalar(0.07); station.position.set(4, 3.5, -30); scene.add(station);
    const ship = buildPlayerShip(art.glowTex);
    scene.add(ship.group);
    const enemies = [0, 1, 2].map(() => { const e = buildEnemy('fighter', art.glowTex); e.scale.setScalar(0.8); scene.add(e); return e; });
    const bolts = Array.from({ length: 8 }, () => { const b = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 2.5), additive(0x8ff5ff, 1)); b.visible = false; scene.add(b); return { b, life: 0 }; });
    const camera = new THREE.PerspectiveCamera(42, 16 / 9, 0.1, 4000);
    let fireCd = 0, gun = 0, last = 0;
    return { scene, camera, update(t, view) {
      const dt = Math.min(0.1, t - last); last = t;
      const bank = Math.sin(t * 0.9) * 0.45;
      ship.group.position.set(Math.sin(t * 0.9) * 1.2, Math.sin(t * 1.3) * 0.4, 0);
      ship.group.rotation.set(Math.sin(t * 1.3) * 0.06, 0, bank);
      ship.glows.forEach((gl) => gl.scale.setScalar(2.4 + Math.random() * 0.6));
      enemies.forEach((e, i) => { const a = t * 0.6 + i * 2.1; e.position.set(-4 + Math.cos(a) * 5, 1.5 + Math.sin(a * 1.7) * 1.2, -24 - i * 4 + Math.sin(a) * 3); e.lookAt(ship.group.position); });
      fireCd -= dt;
      if (fireCd <= 0) { fireCd = 0.18; const slot = bolts.find((o) => o.life <= 0); if (slot) { slot.life = 0.9; slot.b.visible = true; slot.b.position.copy(ship.guns[gun].clone().applyEuler(ship.group.rotation).add(ship.group.position)); gun ^= 1; } }
      bolts.forEach((o) => { if (o.life > 0) { o.life -= dt; o.b.position.z -= dt * 55; if (o.life <= 0) o.b.visible = false; } });
      planet.surface.rotation.y = t * 0.01; if (planet.clouds) planet.clouds.rotation.y = t * 0.014;
      const px = view.pointer.x, py = view.pointer.y;
      camera.position.set(9 + px * 3, 4.6 - py * 2, 17);
      camera.lookAt(ship.group.position.x * 0.3 - 0.8, -0.4, -6);
    } };
  },
  conquest(art) {
    const scene = new THREE.Scene();
    scene.background = art.sky();
    scene.environment = art.skyEnv();
    const sunDir = new THREE.Vector3(-0.6, 0.7, 0.4).normalize();
    const light = new THREE.DirectionalLight(0xffffff, 2.6); light.position.copy(sunDir).multiplyScalar(10);
    scene.add(light, new THREE.AmbientLight(0x6070a0, 0.4));
    const defs = [
      [-6, 0, 2, 1.6, 'earth', 0x3b82f6], [-2.5, 0.5, -3, 1.0, 'ice', 0x3b82f6], [1, -0.3, 1.5, 0.9, 'rock', 0x94a3b8],
      [3.6, 0.4, -2.5, 1.2, 'gas', 0x94a3b8], [6.5, 0, 1.2, 1.7, 'rock', 0xef4444], [7.5, 0.6, -4.5, 1.0, 'ice', 0xef4444],
    ];
    const planets = defs.map(([x, y, z, r, type, col], i) => {
      const p = makePlanet(art.renderer, { type, radius: r, seed: 30 + i, sunDir, segments: 40, palette: 'jupiter', tint: i % 2 ? '#a8a29e' : '#b9a58c', size: 256 });
      p.group.position.set(x, y, z);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(r * 1.35, 0.05, 8, 96), glow(col, 0.9));
      ring.rotation.x = Math.PI / 2;
      p.group.add(ring);
      const halo = makeGlowSprite(art.glowTex, col, r * 5, 0.25);
      p.group.add(halo);
      scene.add(p.group);
      return p;
    });
    const routes = [[0, 2, 0x93c5fd], [1, 3, 0x93c5fd], [4, 2, 0xfca5a5], [5, 3, 0xfca5a5], [0, 1, 0x93c5fd]].map(([a, b, col]) => {
      const A = planets[a].group.position, B = planets[b].group.position;
      const mid = A.clone().add(B).multiplyScalar(0.5).add(new THREE.Vector3(0, 1.4, 0));
      const curve = new THREE.QuadraticBezierCurve3(A.clone(), mid, B.clone());
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(curve.getPoints(40)), new THREE.LineDashedMaterial({ color: col, dashSize: 0.25, gapSize: 0.2, transparent: true, opacity: 0.6 }));
      line.computeLineDistances();
      scene.add(line);
      const ships = Array.from({ length: 4 }, () => {
        const s = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.5, 4), glow(col, 1.1));
        s.add(makeGlowSprite(art.glowTex, col, 1.1, 0.8));
        scene.add(s);
        return s;
      });
      return { curve, ships };
    });
    const camera = new THREE.PerspectiveCamera(40, 16 / 9, 0.1, 4000);
    return { scene, camera, update(t, view) {
      planets.forEach((p, i) => { p.surface.rotation.y = t * (0.15 + i * 0.03); });
      routes.forEach((r, ri) => r.ships.forEach((s, i) => {
        const k = ((t * 0.18 + i * 0.07 + ri * 0.21) % 1);
        const p = r.curve.getPoint(k), n = r.curve.getPoint(Math.min(1, k + 0.01));
        s.position.copy(p);
        s.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), n.sub(p).normalize());
      }));
      const a = Math.sin(t * 0.15) * 0.25 + view.pointer.x * 0.35;
      camera.position.set(Math.sin(a) * 12.5 + 0.7, 6.2 - view.pointer.y * 2, Math.cos(a) * 12.5);
      camera.lookAt(0.7, -0.3, -0.5);
    } };
  },
  colony(art) {
    const scene = new THREE.Scene();
    scene.background = art.sky();
    scene.environment = art.skyEnv();
    const sunDir = new THREE.Vector3(-0.7, 0.6, 0.5).normalize();
    const light = new THREE.DirectionalLight(0xfff2e0, 3); light.position.copy(sunDir).multiplyScalar(10);
    scene.add(light, new THREE.AmbientLight(0x6070a0, 0.35));
    const giant = makePlanet(art.renderer, { type: 'gas', radius: 9, seed: 12, palette: 'jupiter', rings: true, sunDir, size: 512 });
    giant.group.position.set(14, 6, -30); giant.group.rotation.set(0.4, 0, 0.3);
    scene.add(giant.group);
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x8b8178, roughness: 1, flatShading: true });
    const geos = makeAsteroidGeometries(4, 21);
    const base = new THREE.Mesh(geos[0], rockMat); base.scale.set(4.2, 2.2, 3.4); base.position.y = -2.6;
    scene.add(base);
    const domeMat = new THREE.MeshPhysicalMaterial({ color: 0xe0f2fe, roughness: 0.05, transmission: 0.45, clearcoat: 1 });
    [[-1.6, 0.6], [-0.5, 1.2], [0.8, 0.9]].forEach(([x, z], i) => {
      const d = new THREE.Mesh(new THREE.SphereGeometry(0.6 - i * 0.1, 28, 14, 0, TAU, 0, Math.PI / 2), domeMat);
      d.position.set(x, -0.45, z); scene.add(d);
      const glowIn = new THREE.PointLight(0xffd9a0, 4, 3); glowIn.position.set(x, -0.2, z); scene.add(glowIn);
    });
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 2.4, 12), metal(0xcbd5e1)); tower.position.set(1.8, 0.6, -0.3); scene.add(tower);
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 8), glow(0xff3344, 3)); beacon.position.set(1.8, 1.9, -0.3); scene.add(beacon);
    const solarMat = new THREE.MeshStandardMaterial({ color: 0x1e3a8a, metalness: 0.6, roughness: 0.25 });
    [-1, 0, 1].forEach((k) => { const p = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.04, 0.5), solarMat); p.position.set(-2.4 + k * 1.0, -0.2, -1.2); p.rotation.x = -0.5; scene.add(p); });
    const rocks = [[-6, 1.5, -4], [-4.5, 3, -7], [5, 2.5, -5], [6, 0.5, -2]].map(([x, y, z], i) => { const r = new THREE.Mesh(geos[1 + (i % 3)], rockMat); r.position.set(x, y, z); r.scale.setScalar(0.6 + i * 0.15); scene.add(r); return r; });
    const drones = Array.from({ length: 6 }, (_, i) => { const d = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), glow(i % 2 ? 0x86efac : 0xa5f3fc, 3)); const h = makeGlowSprite(art.glowTex, i % 2 ? 0x4ade80 : 0x67e8f9, 0.9, 0.8); d.add(h); scene.add(d); return { d, rock: rocks[i % rocks.length], ph: i / 6 }; });
    const camera = new THREE.PerspectiveCamera(42, 16 / 9, 0.1, 4000);
    const from = new THREE.Vector3(1.8, 1.9, -0.3);
    return { scene, camera, update(t, view) {
      beacon.visible = (t % 1.4) < 0.3;
      rocks.forEach((r, i) => { r.rotation.set(t * 0.2 + i, t * 0.15, 0); });
      drones.forEach((o) => {
        const k = (t * 0.22 + o.ph) % 1, p = k < 0.5 ? k * 2 : (1 - k) * 2;
        const to = o.rock.position, mid = from.clone().add(to).multiplyScalar(0.5).add(new THREE.Vector3(0, 1.5, 0));
        const a = from.clone().lerp(mid, p), b = mid.clone().lerp(to, p);
        o.d.position.copy(a.lerp(b, p));
      });
      giant.surface.rotation.y = t * 0.04;
      const a = Math.sin(t * 0.12) * 0.3 + view.pointer.x * 0.4;
      camera.position.set(Math.sin(a) * 10, 3.2 - view.pointer.y * 1.5, Math.cos(a) * 10);
      camera.lookAt(0, -0.2, -1);
    } };
  },
};

/* ------------------------------------------------------------------ manager */
class Art3D {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(1);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.setScissorTest(true);
    this.buf = { w: 1, h: 1 };
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    this.glowTex = glowTexture();
    this.views = new Map();
    this.scenes = new Map();
    this.snapshots = new Map();
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.io = new IntersectionObserver((entries) => {
      entries.forEach((e) => { const v = this.views.get(e.target); if (v) v.visible = e.isIntersecting; });
      this.kick();
    }, { rootMargin: '80px' });
    this.t0 = performance.now();
    this.last = 0;
    this.running = false;
  }

  sky() { return this._sky || (this._sky = createSkyCube(this.renderer, { size: 512, seed: 23 })); }

  skyEnv() {
    if (!this._skyEnv) {
      const pmrem = new THREE.PMREMGenerator(this.renderer);
      this._skyEnv = pmrem.fromCubemap(this.sky()).texture;
      pmrem.dispose();
    }
    return this._skyEnv;
  }

  // Icon scene: object group + studio lights + camera
  iconScene(id) {
    const key = `icon:${id}`;
    if (this.scenes.has(key)) return this.scenes.get(key);
    const A = COLOR[id] || '#22d3ee';
    const scene = new THREE.Scene();
    scene.environment = this.env;
    const key1 = new THREE.DirectionalLight(0xffffff, 2.2); key1.position.set(3, 4, 5);
    const rim = new THREE.DirectionalLight(new THREE.Color(A), 3); rim.position.set(-4, 2, -3);
    scene.add(key1, rim, new THREE.AmbientLight(0xffffff, 0.25));
    const built = (ICONS[id] || ICONS.memory)(A, this);
    const pivot = new THREE.Group();
    pivot.add(built.group);
    scene.add(pivot);
    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
    camera.position.set(0, 0.5, 7.2);
    camera.lookAt(0, 0, 0);
    let spin = 0;
    const s = { scene, camera, update(t, view, dt) {
      spin += dt * (view.hover ? 3.2 : 0);
      pivot.rotation.y = Math.sin(t * 0.7) * 0.45 + spin;
      pivot.rotation.x = 0.12 + Math.sin(t * 0.5) * 0.06;
      built.update(t, view);
    } };
    this.scenes.set(key, s);
    return s;
  }

  coverScene(id) {
    const key = `cover:${id}`;
    if (!this.scenes.has(key)) this.scenes.set(key, (COVERS[id] || COVERS.starfighter)(this));
    return this.scenes.get(key);
  }

  // Scene for a live view, built lazily: one new scene per frame, shaders compiled asynchronously.
  ensureScene(view) {
    const key = `${view.cover ? 'cover' : 'icon'}:${view.id}`;
    const ready = this.scenes.get(key);
    if (ready) return ready.pending ? null : ready;
    if (this.building) return null;
    this.building = true;
    let s;
    try {
      s = view.cover ? this.coverScene(view.id) : this.iconScene(view.id);
    } catch (e) {
      this.building = false;
      throw e;
    }
    s.pending = true;
    const done = () => { s.pending = false; this.building = false; this.kick(); };
    // Let the browser paint between building a scene and compiling it
    setTimeout(() => {
      try {
        if (this.renderer.extensions.has('KHR_parallel_shader_compile')) { this.renderer.compileAsync(s.scene, s.camera).then(done, done); return; }
        this.renderer.compile(s.scene, s.camera);
      } catch (e) { console.warn(e); }
      done();
    }, 0);
    return null;
  }

  scan(root = document) {
    root.querySelectorAll('canvas[data-cover3d], canvas[data-icon3d]').forEach((c) => {
      let view = this.views.get(c);
      if (!view) {
        const cover = !!c.dataset.cover3d;
        view = { canvas: c, ctx: c.getContext('2d'), cover, id: c.dataset.cover3d || c.dataset.icon3d, visible: false, hover: false, pointer: { x: 0, y: 0 }, target: { x: 0, y: 0 } };
        this.views.set(c, view);
        this.io.observe(c);
      }
      if (view.ready) c.parentElement?.classList.add('has-3d');
      // (re)bind pointer tracking to the card that currently holds this canvas
      const host = c.closest('.full-card, .game-card') || c.parentElement;
      if (view.host === host) return;
      view.host = host;
      host.addEventListener('pointerenter', (e) => { view.hover = e.pointerType === 'mouse' && !Motion.calm; });
      host.addEventListener('pointerleave', () => { view.hover = false; view.target.x = 0; view.target.y = 0; });
      host.addEventListener('pointermove', (e) => {
        if (e.pointerType !== 'mouse' || Motion.calm) return;
        const r = host.getBoundingClientRect();
        view.target.x = ((e.clientX - r.left) / r.width) * 2 - 1;
        view.target.y = ((e.clientY - r.top) / r.height) * 2 - 1;
      });
    });
    // forget canvases that were removed from the page
    for (const [c] of this.views) if (!c.isConnected) { this.io.unobserve(c); this.views.delete(c); }
    this.kick();
  }

  kick() {
    if (this.running) return;
    if (![...this.views.values()].some((v) => v.visible)) return;
    this.running = true;
    requestAnimationFrame((now) => this.frame(now));
  }

  ensureBuffer(w, h) {
    if (w <= this.buf.w && h <= this.buf.h) return;
    this.buf = { w: Math.max(w, this.buf.w), h: Math.max(h, this.buf.h) };
    this.renderer.setSize(this.buf.w, this.buf.h, false);
  }

  draw(view, t, dt) {
    const c = view.canvas;
    const dpr = view.cover ? Math.min(this.dpr, 1.5) : this.dpr;
    const w = Math.max(1, Math.round(c.clientWidth * dpr)), h = Math.max(1, Math.round(c.clientHeight * dpr));
    if (w < 4 || h < 4) return;
    let s;
    try { s = this.ensureScene(view); } catch (e) { console.warn('3D art failed for', view.id, e); view.failed = true; return; }
    if (!s) return;
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    this.ensureBuffer(w, h);
    view.pointer.x += (view.target.x - view.pointer.x) * 0.08;
    view.pointer.y += (view.target.y - view.pointer.y) * 0.08;
    s.update(t, view, dt);
    s.camera.aspect = w / h;
    s.camera.updateProjectionMatrix();
    this.renderer.setViewport(0, 0, w, h);
    this.renderer.setScissor(0, 0, w, h);
    this.renderer.clear();
    this.renderer.render(s.scene, s.camera);
    view.ctx.clearRect(0, 0, w, h);
    view.ctx.drawImage(this.canvas, 0, this.buf.h - h, w, h, 0, 0, w, h);
    if (!view.ready) { view.ready = true; c.classList.add('ready'); c.parentElement?.classList.add('has-3d'); }
  }

  frame(now) {
    const visible = [...this.views.values()].filter((v) => v.visible && !v.failed && v.canvas.isConnected);
    if (!visible.length) { this.running = false; return; }
    requestAnimationFrame((n) => this.frame(n));
    if (now - this.last < 32) return; // ~30 fps is plenty for card art
    const dt = Math.min(0.1, (now - (this.last || now)) / 1000);
    this.last = now;
    const t = (now - this.t0) / 1000;
    for (const v of visible) this.draw(v, t, dt);
  }

  // Still image of an icon (for small places like the game header and Command Deck list)
  snapshot(id, size = 96) {
    const key = `${id}:${size}`;
    if (this.snapshots.has(key)) return this.snapshots.get(key);
    const s = this.iconScene(id);
    this.ensureBuffer(size, size);
    s.update(1.3, { pointer: { x: 0, y: 0 }, hover: false }, 0);
    s.camera.aspect = 1; s.camera.updateProjectionMatrix();
    this.renderer.setViewport(0, 0, size, size);
    this.renderer.setScissor(0, 0, size, size);
    this.renderer.clear();
    this.renderer.render(s.scene, s.camera);
    const out = document.createElement('canvas');
    out.width = out.height = size;
    out.getContext('2d').drawImage(this.canvas, 0, this.buf.h - size, size, size, 0, 0, size, size);
    const url = out.toDataURL('image/png');
    this.snapshots.set(key, url);
    return url;
  }
}

let instance = null;
export function getArt3D() {
  if (instance !== null) return instance;
  try {
    instance = new Art3D();
  } catch (e) {
    console.warn('3D art disabled:', e);
    instance = false;
  }
  return instance;
}
