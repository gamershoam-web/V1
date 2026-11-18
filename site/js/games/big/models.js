// Shared 3D models (player fighter, enemies, capital ship, station) used by Starfighter and the 3D covers.
import * as THREE from 'three';
import { makeGlowSprite } from '../../space-assets.js';

const rand = (a, b) => a + Math.random() * (b - a);

/* ------------------------------------------------------------------ models */
export const MAT = {};
export function materials() {
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

export function buildPlayerShip(glow) {
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
export function buildEnemy(type, glow) {
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

export function buildBoss(glow, level) {
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

export function buildStation() {
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
