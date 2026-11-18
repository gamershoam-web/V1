// Orbit Colony — a persistent space-mining colony builder.
// Build modules, balance energy, research tech, trade on a live market, take contracts, launch expeditions,
// survive random events and warp to new systems for permanent Dark Matter bonuses. Saves automatically
// and keeps producing while you are away (up to 8 hours).
import { icon } from '../../icons.js';
import { ColonyView3D } from './colony3d.js';

const VERSION = 1;
const OFFLINE_CAP = 8 * 3600;
const RES = {
  credits: { name: 'Credits', icon: 'coin', color: '#fde68a' },
  ore: { name: 'Ore', icon: 'ore', color: '#d6c6b0' },
  ice: { name: 'Ice', icon: 'ice', color: '#a5f3fc' },
  alloys: { name: 'Alloys', icon: 'alloy', color: '#cbd5e1' },
  rp: { name: 'Research', icon: 'flask', color: '#c4b5fd' },
};

const BUILDINGS = [
  { id: 'solar', name: 'Solar Array', desc: 'Generates 6 energy.', cost: { credits: 60 }, growth: 1.15 },
  { id: 'drone', name: 'Mining Drone Bay', desc: 'Drones mine 1.2 ore/s. Uses 2 energy.', cost: { credits: 50 }, growth: 1.15 },
  { id: 'harvester', name: 'Ice Harvester', desc: 'Harvests 0.8 ice/s from comets. Uses 2 energy.', cost: { credits: 90, ore: 20 }, growth: 1.16 },
  { id: 'cargo', name: 'Cargo Bay', desc: '+500 storage for ore, ice and alloys.', cost: { credits: 150, ore: 50 }, growth: 1.25 },
  { id: 'habitat', name: 'Habitat Ring', desc: 'Room for 6 colonists. Colonists pay taxes and staff labs. Uses 1 energy.', cost: { credits: 140, ice: 30 }, growth: 1.17 },
  { id: 'lab', name: 'Research Lab', desc: '0.35 research/s. Needs 2 colonists. Uses 3 energy.', cost: { credits: 260, ore: 60 }, growth: 1.2 },
  { id: 'refinery', name: 'Refinery', desc: 'Turns 2 ore/s into 0.7 alloys/s. Uses 4 energy.', cost: { credits: 240, ore: 80 }, growth: 1.18, tech: 'metallurgy' },
  { id: 'port', name: 'Trade Port', desc: '+10% market prices each (max 5).', cost: { credits: 600, alloys: 40 }, growth: 1.5, max: 5, tech: 'metallurgy' },
  { id: 'reactor', name: 'Fusion Reactor', desc: 'Generates 45 energy.', cost: { credits: 1800, alloys: 180 }, growth: 1.3, tech: 'fusion' },
  { id: 'shipyard', name: 'Shipyard', desc: 'Builds one expedition ship.', cost: { credits: 1200, alloys: 150 }, growth: 1.6, max: 4, tech: 'deepspace' },
];
const BMAP = Object.fromEntries(BUILDINGS.map((b) => [b.id, b]));
const ENERGY = { solar: 6, reactor: 45, drone: -2, harvester: -2, habitat: -1, lab: -3, refinery: -4 };

const TECHS = [
  { id: 'drones2', name: 'Efficient Drones', cost: 20, desc: 'Drones mine 50% faster.' },
  { id: 'metallurgy', name: 'Metallurgy', cost: 40, desc: 'Unlocks Refinery and Trade Port.' },
  { id: 'solar2', name: 'Solar Coatings', cost: 60, desc: 'Solar arrays produce 50% more.' },
  { id: 'habitat2', name: 'Habitat Modules', cost: 90, desc: 'Habitats hold 50% more colonists.' },
  { id: 'automation', name: 'Automation', cost: 140, desc: 'Auto-sells ore and ice when storage is full.' },
  { id: 'refining2', name: 'Advanced Refining', cost: 200, desc: 'Refineries produce 60% more alloys.' },
  { id: 'fusion', name: 'Fusion Power', cost: 320, desc: 'Unlocks the Fusion Reactor.' },
  { id: 'defense', name: 'Point Defense', cost: 380, desc: 'Pirate raids steal 75% less.' },
  { id: 'deepspace', name: 'Deep Space Flight', cost: 420, desc: 'Unlocks Shipyards and expeditions.' },
  { id: 'labs2', name: 'Quantum Labs', cost: 600, desc: 'Labs produce 75% more research.' },
  { id: 'trade2', name: 'Trade Agreements', cost: 750, desc: 'All market prices +25%.' },
  { id: 'drones3', name: 'Asteroid Lasers', cost: 1100, desc: 'Drones mine twice as fast.' },
  { id: 'ice2', name: 'Cryo Processing', cost: 1100, desc: 'Ice harvesting doubled.' },
  { id: 'alloys2', name: 'Nanofabrication', cost: 1600, desc: 'Alloy output doubled.' },
  { id: 'warp', name: 'Warp Theory', cost: 3000, desc: 'Unlocks the Warp Drive (prestige).' },
];
const TMAP = Object.fromEntries(TECHS.map((t) => [t.id, t]));

const BASE_PRICE = { ore: 2, ice: 3, alloys: 14 };
const EXPEDITIONS = [
  { id: 'survey', name: 'Asteroid Survey', mins: 2, fuel: 60, desc: 'Charts nearby rocks for rich ore.', reward: () => ({ ore: Math.round(rand(300, 650)), rp: Math.round(rand(5, 15)) }) },
  { id: 'derelict', name: 'Derelict Station', mins: 6, fuel: 160, desc: 'Salvage alloys and old research data.', reward: () => ({ alloys: Math.round(rand(80, 160)), rp: Math.round(rand(40, 90)), credits: Math.round(rand(300, 700)) }) },
  { id: 'nebula', name: 'Nebula Expedition', mins: 15, fuel: 400, desc: 'Deep science run. Big research payoff.', reward: () => ({ rp: Math.round(rand(250, 450)), credits: Math.round(rand(1500, 3000)) }) },
];

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const fmt = (n) => {
  n = Math.floor(n);
  if (Math.abs(n) < 10000) return n.toLocaleString('en-US');
  const units = ['K', 'M', 'B', 'T'];
  let u = -1;
  while (Math.abs(n) >= 1000 && u < units.length - 1) { n /= 1000; u++; }
  return `${n.toFixed(n < 100 ? 1 : 0)}${units[u]}`;
};
const fmtRate = (n) => `${n >= 0 ? '+' : ''}${Math.abs(n) < 10 ? n.toFixed(1) : fmt(n)}/s`;
const fmtDur = (s) => {
  s = Math.max(0, Math.ceil(s));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  if (h) return `${h}h ${String(m).padStart(2, '0')}m`;
  return m ? `${m}m ${String(s % 60).padStart(2, '0')}s` : `${s}s`;
};

function freshState(prev = {}) {
  return {
    v: VERSION, started: true, t: Date.now(),
    res: { credits: 150, ore: 0, ice: 0, alloys: 0, rp: 0 },
    pop: 0,
    b: { solar: 1, drone: 1 },
    tech: {},
    prices: { ...BASE_PRICE },
    offers: [], offersAt: 0,
    expeditions: [],
    lifetime: 0, level: 1,
    warps: prev.warps || 0, dm: prev.dm || 0,
    log: [],
    events: [],
    nextEvent: rand(70, 120),
    clicks: 0,
  };
}

export default class Colony {
  constructor(root, ctx) {
    this.root = root;
    this.ctx = ctx;
    this.listeners = [];
    this.timers = [];
    this.tab = 'build';
    const saved = ctx.storage.load();
    this.s = saved?.started && saved.v === VERSION ? saved : freshState();
    this.s.events = this.s.events || [];

    root.innerHTML = `
      <div class="col-root">
        <div class="col-resbar" data-resbar></div>
        <div class="col-main">
          <div class="col-view">
            <canvas class="col-canvas"></canvas>
            <div class="col-level" data-level></div>
            <div class="col-events" data-events></div>
            <div class="col-log" data-log></div>
          </div>
          <div class="col-panel">
            <div class="col-tabs" role="tablist">
              ${[['build', 'build', 'Build'], ['research', 'flask', 'Research'], ['market', 'chart', 'Market'], ['missions', 'rocket', 'Missions'], ['warp', 'warp', 'Warp']]
                .map(([id, ic, label]) => `<button type="button" role="tab" data-tab="${id}">${icon(ic)}<span>${label}</span></button>`).join('')}
            </div>
            <div class="col-body" data-body></div>
          </div>
        </div>
      </div>`;
    this.$ = (sel) => root.querySelector(sel);
    // 3D colony view when WebGL is available; the original 2D drawing otherwise
    const canvas2d = this.$('.col-canvas');
    this.view3d = ColonyView3D.create(this.$('.col-view'), this);
    if (this.view3d) {
      canvas2d.remove();
      this.canvas = this.view3d.canvas;
      this.g = null;
    } else {
      this.canvas = canvas2d;
      this.g = canvas2d.getContext('2d');
    }
    root.querySelectorAll('[data-tab]').forEach((b) => this.on(b, 'click', () => { this.tab = b.dataset.tab; this.ctx.audio.click(); this.renderPanel(true); }));
    this.on(this.$('[data-body]'), 'click', (e) => this.onPanelClick(e));
    this.on(this.$('[data-body]'), 'pointerdown', () => { this.pressing = true; });
    this.on(window, 'pointerup', () => { this.pressing = false; });
    this.on(window, 'pointercancel', () => { this.pressing = false; });
    if (!this.view3d) this.on(this.canvas, 'pointerdown', (e) => this.onCanvasTap(e));

    this.initScene();
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(this.$('.col-view'));
    this.resize();

    // Offline progress
    const away = Math.min(OFFLINE_CAP, Math.max(0, (Date.now() - (this.s.t || Date.now())) / 1000));
    if (saved?.started && away > 30) this.offline(away);
    else if (!saved?.started) this.welcome();

    if (!this.s.offers.length) this.rollOffers();
    this.renderResources();
    this.renderPanel(true);
    this.last = performance.now();
    this.saveTimer = setInterval(() => this.persist(), 5000);
    this.renderLog();
    this.uiTimer = setInterval(() => { this.renderResources(); this.renderPanel(false); this.renderLog(); }, 400);
    this.raf = requestAnimationFrame((t) => this.loop(t));
    this.on(window, 'beforeunload', () => this.persist());
    this.on(document, 'visibilitychange', () => { if (document.hidden) this.persist(); });
  }

  on(t, e, f, o) { t.addEventListener(e, f, o); this.listeners.push([t, e, f, o]); }

  /* ---------- economy ---------- */
  has(t) { return !!this.s.tech[t]; }
  count(id) { return this.s.b[id] || 0; }
  dmMult() { return (1 + this.s.dm * 0.1) * (1 + (this.s.science || 0) * 0.05); }
  scienceCost() { return Math.round(400 * Math.pow(1.6, this.s.science || 0)); }
  storageCap() { return 500 + this.count('cargo') * 500; }
  popCap() { return Math.floor(this.count('habitat') * 6 * (this.has('habitat2') ? 1.5 : 1)); }
  flare() { return this.s.events.some((e) => e.type === 'flare') ? 2 : 1; }

  rates() {
    const s = this.s;
    let prod = (this.count('solar') * 6 * (this.has('solar2') ? 1.5 : 1)) * this.flare() + this.count('reactor') * 45;
    let use = 0;
    for (const [id, e] of Object.entries(ENERGY)) if (e < 0) use += -e * this.count(id);
    const eff = use > 0 ? Math.min(1, prod / use) : 1;
    const dm = this.dmMult();
    const ore = this.count('drone') * 1.2 * (this.has('drones2') ? 1.5 : 1) * (this.has('drones3') ? 2 : 1) * eff * dm;
    const ice = this.count('harvester') * 0.8 * (this.has('ice2') ? 2 : 1) * eff * dm;
    const refineOre = this.count('refinery') * 2 * eff;
    const alloys = this.count('refinery') * 0.7 * (this.has('refining2') ? 1.6 : 1) * (this.has('alloys2') ? 2 : 1) * eff * dm;
    const staffed = Math.min(this.count('lab'), Math.floor(s.pop / 2));
    const rp = staffed * 0.35 * (this.has('labs2') ? 1.75 : 1) * eff * dm;
    const credits = s.pop * 0.22 * dm;
    const iceUse = s.pop * 0.01;
    return { energyProd: prod, energyUse: use, eff, ore: ore - refineOre, oreGross: ore, refineOre, ice: ice - iceUse, iceGross: ice, iceUse, alloys, rp, credits, staffed };
  }

  price(r) {
    const mult = (1 + Math.min(5, this.count('port')) * 0.1) * (this.has('trade2') ? 1.25 : 1) * (this.s.events.some((e) => e.type === 'trader') ? 1.5 : 1);
    return this.s.prices[r] * mult;
  }

  tick(dt) {
    const s = this.s, r = this.rates(), cap = this.storageCap();
    s.res.credits += r.credits * dt;
    this.earn(r.credits * dt);
    // Refineries only run while there is ore to process
    const oreIn = r.oreGross * dt;
    const needOre = r.refineOre * dt;
    const usableOre = Math.min(needOre, s.res.ore + oreIn);
    const refineK = needOre > 0 ? usableOre / needOre : 1;
    s.res.ore = Math.min(cap, Math.max(0, s.res.ore + oreIn - usableOre));
    s.res.alloys = Math.min(cap, s.res.alloys + r.alloys * refineK * dt);
    s.res.ice = Math.min(cap, Math.max(0, s.res.ice + r.iceGross * dt - r.iceUse * dt));
    s.res.rp += r.rp * dt;
    // Population grows toward capacity while there is ice; starves slowly without it
    const pcap = this.popCap();
    if (s.res.ice > 1 && s.pop < pcap) s.pop = Math.min(pcap, s.pop + Math.max(0.05, pcap * 0.02) * dt);
    else if (s.res.ice <= 1 && s.pop > 0) s.pop = Math.max(0, s.pop - 0.02 * dt);
    if (s.pop > pcap) s.pop = pcap;
    // Automation: sell overflow
    if (this.has('automation')) for (const k of ['ore', 'ice']) if (s.res[k] >= cap * 0.98) this.sell(k, s.res[k] * 0.25, true);
    // Market drift
    for (const k of Object.keys(BASE_PRICE)) {
      const p = s.prices[k] + (Math.random() - 0.5) * BASE_PRICE[k] * 0.04 * dt * 10;
      s.prices[k] = Math.min(BASE_PRICE[k] * 1.6, Math.max(BASE_PRICE[k] * 0.6, p * 0.995 + BASE_PRICE[k] * 0.005));
    }
  }

  earn(n) {
    if (n <= 0) return;
    this.s.lifetime += n;
    const lvl = Math.max(1, Math.floor(Math.log(Math.max(1, this.s.lifetime) / 250) / Math.log(2.2)) + 1);
    if (lvl > this.s.level) {
      for (let l = this.s.level + 1; l <= lvl; l++) this.pendingXP = (this.pendingXP || 0) + 10 + l * 4;
      this.s.level = lvl;
      this.logMsg(`Colony reached level ${lvl}!`, 'good');
      if (!this.silent) this.flushXP();
    }
  }

  flushXP() {
    if (!this.pendingXP) return;
    this.ctx.awardXP(this.pendingXP, `Colony level ${this.s.level}`);
    this.pendingXP = 0;
    this.ctx.audio.chime();
  }

  cost(b) {
    const n = this.count(b.id);
    return Object.fromEntries(Object.entries(b.cost).map(([k, v]) => [k, Math.ceil(v * Math.pow(b.growth, n))]));
  }
  canAfford(cost) { return Object.entries(cost).every(([k, v]) => this.s.res[k] >= v); }
  pay(cost) { Object.entries(cost).forEach(([k, v]) => { this.s.res[k] -= v; }); }

  build(id) {
    const b = BMAP[id];
    if (!b || (b.tech && !this.has(b.tech)) || (b.max && this.count(id) >= b.max)) return;
    const cost = this.cost(b);
    if (!this.canAfford(cost)) { this.ctx.audio.error(); return; }
    this.pay(cost);
    this.s.b[id] = this.count(id) + 1;
    this.ctx.audio.pickup();
    this.burst(id);
    this.logMsg(`Built ${b.name} #${this.s.b[id]}`);
    this.renderPanel(true);
  }

  research(id) {
    const t = TMAP[id];
    if (!t || this.has(id) || this.s.res.rp < t.cost) { this.ctx.audio.error(); return; }
    this.s.res.rp -= t.cost;
    this.s.tech[id] = true;
    this.ctx.audio.chime();
    this.logMsg(`Research complete: ${t.name}`, 'good');
    this.renderPanel(true);
  }

  applyScience() {
    const c = this.scienceCost();
    if (this.s.res.rp < c) { this.ctx.audio.error(); return; }
    this.s.res.rp -= c;
    this.s.science = (this.s.science || 0) + 1;
    this.ctx.audio.chime();
    this.logMsg(`Applied Science level ${this.s.science}: +${this.s.science * 5}% production`, 'good');
    this.renderPanel(true);
  }

  sell(k, amount, auto = false) {
    amount = Math.min(this.s.res[k], amount);
    if (amount < 1) { if (!auto) this.ctx.audio.error(); return; }
    const gain = amount * this.price(k);
    this.s.res[k] -= amount;
    this.s.res.credits += gain;
    this.earn(gain);
    // Selling pushes the price down a little
    this.s.prices[k] = Math.max(BASE_PRICE[k] * 0.6, this.s.prices[k] * (1 - Math.min(0.15, amount / 5000)));
    if (!auto) { this.ctx.audio.tone({ freq: 880, type: 'triangle', dur: 0.08, vol: 0.08 }); this.floatText(`+${fmt(gain)} cr`, '#fde68a'); }
  }

  /* ---------- contracts, expeditions, events ---------- */
  rollOffers() {
    const lvl = this.s.level;
    const kinds = ['ore', 'ice'];
    if (this.has('metallurgy')) kinds.push('alloys');
    this.s.offers = Array.from({ length: 3 }, () => {
      const k = pick(kinds);
      const amt = Math.round(({ ore: 150, ice: 100, alloys: 40 }[k]) * Math.pow(1.6, lvl - 1) * rand(0.8, 1.3));
      const reward = Math.round(amt * BASE_PRICE[k] * rand(1.8, 2.6));
      return { k, amt, reward, rp: Math.round(rand(4, 10) * lvl), expires: Date.now() + 6 * 60000 };
    });
    this.s.offersAt = Date.now() + 3 * 60000;
  }

  fulfil(i) {
    const o = this.s.offers[i];
    if (!o || this.s.res[o.k] < o.amt) { this.ctx.audio.error(); return; }
    this.s.res[o.k] -= o.amt;
    this.s.res.credits += o.reward;
    this.s.res.rp += o.rp;
    this.earn(o.reward);
    this.s.offers.splice(i, 1);
    this.ctx.audio.chime();
    this.logMsg(`Contract fulfilled: +${fmt(o.reward)} credits, +${o.rp} research`, 'good');
    this.renderPanel(true);
  }

  launch(id) {
    const ex = EXPEDITIONS.find((e) => e.id === id);
    const busy = this.s.expeditions.length;
    if (!ex || busy >= this.count('shipyard') || this.s.res.ice < ex.fuel) { this.ctx.audio.error(); return; }
    this.s.res.ice -= ex.fuel;
    this.s.expeditions.push({ id, endsAt: Date.now() + ex.mins * 60000 });
    this.ctx.audio.whoosh();
    this.logMsg(`${ex.name} launched (${ex.mins} min)`);
    this.renderPanel(true);
  }

  checkExpeditions() {
    const now = Date.now();
    const done = this.s.expeditions.filter((e) => e.endsAt <= now);
    if (!done.length) return;
    this.s.expeditions = this.s.expeditions.filter((e) => e.endsAt > now);
    for (const d of done) {
      const ex = EXPEDITIONS.find((e) => e.id === d.id);
      const reward = ex.reward();
      Object.entries(reward).forEach(([k, v]) => { this.s.res[k] = (this.s.res[k] || 0) + v; if (k === 'credits') this.earn(v); });
      this.logMsg(`${ex.name} returned: ${Object.entries(reward).map(([k, v]) => `+${fmt(v)} ${RES[k].name.toLowerCase()}`).join(', ')}`, 'good');
      this.ctx.toast(`${ex.name} returned with cargo`, { icon: 'rocket' });
      this.ctx.audio.chime();
    }
    this.renderPanel(true);
  }

  randomEvent() {
    const s = this.s;
    const opts = ['flare', 'meteor', 'trader'];
    if (s.res.credits > 400) opts.push('pirates');
    const type = pick(opts);
    if (type === 'flare') { s.events.push({ type, until: Date.now() + 45000 }); this.logMsg('Solar flare! Solar output doubled for 45 seconds.', 'event'); }
    if (type === 'trader') { s.events.push({ type, until: Date.now() + 60000 }); this.logMsg('A trade convoy arrived: market prices +50% for 60 seconds.', 'event'); }
    if (type === 'meteor') {
      const gain = Math.round(Math.min(this.storageCap() - s.res.ore, 60 + this.rates().oreGross * 40));
      s.res.ore += Math.max(0, gain);
      this.logMsg(`Meteor shower! Drones collected ${fmt(gain)} extra ore.`, 'event');
      this.meteorFx = 3;
    }
    if (type === 'pirates') {
      const loss = Math.round(s.res.credits * rand(0.05, 0.1) * (this.has('defense') ? 0.25 : 1));
      s.res.credits -= loss;
      this.logMsg(`Pirate raid! They stole ${fmt(loss)} credits.${this.has('defense') ? ' Point defense drove them off quickly.' : ' Research Point Defense to protect the colony.'}`, 'bad');
      this.ctx.audio.error();
      this.pirateFx = 3;
    }
    this.ctx.toast(this.s.log[0].text, { icon: type === 'pirates' ? 'alert' : 'sparkle' });
  }

  /* ---------- warp (prestige) ---------- */
  dmGain() { return Math.floor(Math.sqrt(this.s.lifetime / 10000)); }

  warp() {
    if (!this.has('warp')) return;
    const gain = this.dmGain();
    if (gain < 1) { this.ctx.audio.error(); return; }
    if (!confirm(`Warp to a new star system? Your buildings, resources and research reset, and you gain ${gain} Dark Matter (+${gain * 10}% production forever).`)) return;
    const prev = { warps: this.s.warps + 1, dm: this.s.dm + gain };
    this.s = freshState(prev);
    this.rollOffers();
    this.ctx.audio.whoosh();
    this.ctx.awardXP(60, 'Warp jump');
    this.logMsg(`Warped to system ${this.s.warps + 1}. Dark Matter: ${this.s.dm} (+${this.s.dm * 10}% production).`, 'good');
    this.persist();
    this.renderPanel(true);
  }

  /* ---------- persistence ---------- */
  persist() {
    this.s.t = Date.now();
    this.ctx.storage.save(this.s);
    this.ctx.reportScore(this.s.lifetime);
  }

  offline(seconds) {
    const before = { ...this.s.res };
    const steps = Math.ceil(seconds / 10);
    const dt = seconds / steps;
    this.silent = true;
    for (let i = 0; i < steps; i++) this.tick(dt);
    this.silent = false;
    this.flushXP();
    const gains = Object.keys(RES).map((k) => [k, this.s.res[k] - before[k]]).filter(([, v]) => v >= 1);
    this.panel(`
      <p class="bg-kicker">Welcome back, commander</p>
      <h2 class="mt-2">While you were away</h2>
      <p class="text-sm text-slate-300 mt-2">Your colony kept working for ${fmtDur(seconds)}${seconds >= OFFLINE_CAP ? ' (8 hour limit)' : ''}.</p>
      <ul class="col-gains mt-4">${gains.length ? gains.map(([k, v]) => `<li>${icon(RES[k].icon)}<span>${RES[k].name}</span><b>+${fmt(v)}</b></li>`).join('') : '<li>Nothing much happened. Build more production!</li>'}</ul>
      <div class="bg-row mt-5"><button type="button" class="btn-neon flex-1" data-close>Collect</button></div>`);
  }

  welcome() {
    this.panel(`
      <p class="bg-kicker">New colony charter</p>
      <h2 class="mt-2">Orbit Colony</h2>
      <p class="text-sm text-slate-300 mt-3 leading-relaxed">You've been granted a mining claim on a lonely asteroid. Drones mine ore, solar arrays power everything, and colonists pay taxes and staff your labs.</p>
      <ul class="sf-controls mt-4">
        <li>Tap the asteroid to mine by hand, then <b>sell ore</b> in the Market for credits.</li>
        <li>Build more <b>drones</b> and <b>solar arrays</b>. Keep energy above use or everything slows down.</li>
        <li>Habitats bring colonists (they need ice). Colonists staff <b>Research Labs</b>.</li>
        <li>Research unlocks refineries, fusion, expeditions and eventually the <b>Warp Drive</b>.</li>
        <li>Your colony saves automatically and keeps producing while you're away.</li>
      </ul>
      <div class="bg-row mt-5"><button type="button" class="btn-neon flex-1" data-close>Found the colony</button></div>`);
  }

  panel(html) {
    this.root.querySelector('.bg-overlay')?.remove();
    const el = document.createElement('div');
    el.className = 'bg-overlay';
    el.innerHTML = `<div class="bg-panel">${html}</div>`;
    this.$('.col-root').appendChild(el);
    el.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => { el.remove(); this.ctx.audio.click(); }));
    return el;
  }

  onEscape() {
    const ov = this.root.querySelector('.bg-overlay');
    if (ov) { ov.remove(); return true; }
    return false;
  }

  logMsg(text, kind = '') {
    this.s.log.unshift({ text, kind, at: Date.now() });
    this.s.log = this.s.log.slice(0, 30);
    this.renderLog();
  }

  /* ---------- UI ---------- */
  renderResources() {
    const s = this.s, r = this.rates(), cap = this.storageCap();
    const cell = (k, val, rate, extra = '') => `<div class="col-res" style="--rc:${RES[k].color}" title="${RES[k].name}">${icon(RES[k].icon)}<div><b>${fmt(val)}${extra}</b><span class="${rate < 0 ? 'neg' : ''}">${fmtRate(rate)}</span></div></div>`;
    const html = [
      cell('credits', s.res.credits, r.credits),
      cell('ore', s.res.ore, r.ore, `<small>/${fmt(cap)}</small>`),
      cell('ice', s.res.ice, r.ice, `<small>/${fmt(cap)}</small>`),
      cell('alloys', s.res.alloys, r.alloys, `<small>/${fmt(cap)}</small>`),
      cell('rp', s.res.rp, r.rp),
      `<div class="col-res ${r.eff < 1 ? 'warn' : ''}" style="--rc:#fbbf24" title="Energy">${icon('bolt')}<div><b>${fmt(r.energyProd)}<small>/${fmt(r.energyUse)}</small></b><span>${r.eff < 1 ? `${Math.round(r.eff * 100)}% power` : 'stable'}</span></div></div>`,
      `<div class="col-res" style="--rc:#86efac" title="Colonists">${icon('people')}<div><b>${Math.floor(s.pop)}<small>/${this.popCap()}</small></b><span>${r.staffed}/${this.count('lab')} labs staffed</span></div></div>`,
    ].join('');
    const bar = this.$('[data-resbar]');
    if (bar._html !== html) { bar.innerHTML = html; bar._html = html; }
    const lv = `<b>Level ${s.level}</b><span>System ${s.warps + 1}${s.dm ? ` · ${s.dm} DM` : ''}</span>`;
    const lvEl = this.$('[data-level]');
    if (lvEl._html !== lv) { lvEl.innerHTML = lv; lvEl._html = lv; lvEl.title = s.dm ? `${s.dm} Dark Matter: +${s.dm * 10}% production` : ''; }
    this.ctx.setScore(s.lifetime);
    this.ctx.setInfo(`Level ${s.level} · ${fmt(r.credits)} cr/s`);
    const ev = this.s.events.map((e) => `<span class="col-event">${e.type === 'flare' ? icon('bolt') : icon('coin')}${e.type === 'flare' ? 'Solar flare' : 'Trade convoy'} ${fmtDur((e.until - Date.now()) / 1000)}</span>`).join('');
    const evEl = this.$('[data-events]');
    if (evEl._html !== ev) { evEl.innerHTML = ev; evEl._html = ev; }
  }

  // Recent messages only (newest at the bottom); older ones dim, then drop off the view.
  renderLog() {
    const now = Date.now();
    const html = this.s.log.filter((l) => now - l.at < 45000).slice(0, 4)
      .map((l) => `<p class="${l.kind}${now - l.at > 15000 ? ' old' : ''}">${l.text}</p>`).join('');
    const el = this.$('[data-log]');
    if (el._html !== html) { el.innerHTML = html; el._html = html; }
  }

  costHTML(cost) {
    return Object.entries(cost).map(([k, v]) => `<span class="${this.s.res[k] >= v ? '' : 'short'}">${icon(RES[k].icon)}${fmt(v)}</span>`).join('');
  }

  renderPanel(force) {
    this.root.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('active', b.dataset.tab === this.tab));
    const body = this.$('[data-body]');
    let html = '';
    const s = this.s;
    if (this.tab === 'build') {
      html = BUILDINGS.map((b) => {
        const locked = b.tech && !this.has(b.tech);
        const maxed = b.max && this.count(b.id) >= b.max;
        const cost = this.cost(b);
        return `<div class="col-card ${locked ? 'locked' : ''}">
          <div class="col-card-head"><b>${b.name}</b><span class="col-count">×${this.count(b.id)}</span></div>
          <p>${locked ? `Requires research: ${TMAP[b.tech].name}` : b.desc}</p>
          ${locked ? '' : `<div class="col-card-foot"><div class="col-cost">${maxed ? '<span>Maximum built</span>' : this.costHTML(cost)}</div>
          <button type="button" class="btn-mini" data-build="${b.id}" ${maxed || !this.canAfford(cost) ? 'disabled' : ''}>Build</button></div>`}
        </div>`;
      }).join('');
    } else if (this.tab === 'research') {
      html = `<p class="col-note">${icon('flask')} ${fmt(s.res.rp)} research points</p>` + `<div class="col-card active">
          <div class="col-card-head"><b>Applied Science</b><span class="col-count">Level ${s.science || 0}</span></div>
          <p>Repeatable: +5% to all production per level (currently +${(s.science || 0) * 5}%).</p>
          <div class="col-card-foot"><span>${fmt(this.scienceCost())} RP</span><button type="button" class="btn-mini" data-science ${s.res.rp >= this.scienceCost() ? '' : 'disabled'}>Research</button></div>
        </div>` + TECHS.map((t) => {
        const done = this.has(t.id);
        return `<div class="col-card ${done ? 'done' : ''}">
          <div class="col-card-head"><b>${t.name}</b>${done ? `<span class="col-done">${icon('check')}Done</span>` : `<span class="col-count">${fmt(t.cost)} RP</span>`}</div>
          <p>${t.desc}</p>
          ${done ? '' : `<div class="col-card-foot"><span></span><button type="button" class="btn-mini" data-research="${t.id}" ${s.res.rp >= t.cost ? '' : 'disabled'}>Research</button></div>`}
        </div>`;
      }).join('');
    } else if (this.tab === 'market') {
      html = `<p class="col-note">Prices move over time. Selling a lot at once pushes prices down.</p>` + Object.keys(BASE_PRICE).map((k) => {
        const p = this.price(k), trend = s.prices[k] / BASE_PRICE[k];
        return `<div class="col-card">
          <div class="col-card-head"><b>${icon(RES[k].icon)} ${RES[k].name}</b><span class="col-count ${trend >= 1 ? 'up' : 'down'}">${p.toFixed(2)} cr ${trend >= 1 ? '▲' : '▼'}</span></div>
          <p>You have ${fmt(s.res[k])}</p>
          <div class="col-card-foot"><span></span><div class="bg-row">
            <button type="button" class="btn-mini" data-sell="${k}" data-frac="0.25" ${s.res[k] >= 1 ? '' : 'disabled'}>Sell 25%</button>
            <button type="button" class="btn-mini" data-sell="${k}" data-frac="1" ${s.res[k] >= 1 ? '' : 'disabled'}>Sell all</button>
          </div></div>
        </div>`;
      }).join('') + (this.has('automation') ? '<p class="col-note">Automation sells ore and ice automatically when storage is full.</p>' : '');
    } else if (this.tab === 'missions') {
      const refresh = Math.max(0, (s.offersAt - Date.now()) / 1000);
      html = `<h4 class="col-h">Contracts <small>new offers in ${fmtDur(refresh)}</small></h4>` + (s.offers.length ? s.offers.map((o, i) => `
        <div class="col-card">
          <div class="col-card-head"><b>Deliver ${fmt(o.amt)} ${RES[o.k].name.toLowerCase()}</b><span class="col-count">${fmtDur((o.expires - Date.now()) / 1000)}</span></div>
          <p>Reward: ${fmt(o.reward)} credits + ${o.rp} research</p>
          <div class="col-card-foot"><span>${fmt(s.res[o.k])} / ${fmt(o.amt)}</span><button type="button" class="btn-mini" data-fulfil="${i}" ${s.res[o.k] >= o.amt ? '' : 'disabled'}>Deliver</button></div>
        </div>`).join('') : '<p class="col-note">No open contracts right now.</p>');
      html += `<h4 class="col-h">Expeditions <small>${s.expeditions.length}/${this.count('shipyard')} ships out</small></h4>`;
      if (!this.has('deepspace')) html += '<p class="col-note">Research Deep Space Flight and build a Shipyard to launch expeditions.</p>';
      else {
        html += s.expeditions.map((e) => {
          const ex = EXPEDITIONS.find((x) => x.id === e.id);
          const left = (e.endsAt - Date.now()) / 1000;
          return `<div class="col-card active"><div class="col-card-head"><b>${icon('rocket')} ${ex.name}</b><span class="col-count">${fmtDur(left)}</span></div>
            <div class="col-progress"><i style="width:${Math.min(100, (1 - left / (ex.mins * 60)) * 100)}%"></i></div></div>`;
        }).join('');
        html += EXPEDITIONS.map((ex) => `<div class="col-card">
          <div class="col-card-head"><b>${ex.name}</b><span class="col-count">${ex.mins} min</span></div>
          <p>${ex.desc}</p>
          <div class="col-card-foot"><div class="col-cost"><span class="${s.res.ice >= ex.fuel ? '' : 'short'}">${icon('ice')}${ex.fuel} fuel</span></div>
          <button type="button" class="btn-mini" data-launch="${ex.id}" ${s.res.ice >= ex.fuel && s.expeditions.length < this.count('shipyard') ? '' : 'disabled'}>Launch</button></div>
        </div>`).join('');
      }
    } else if (this.tab === 'warp') {
      const gain = this.dmGain();
      html = `<div class="col-card">
        <div class="col-card-head"><b>${icon('warp')} Warp Drive</b><span class="col-count">System ${s.warps + 1}</span></div>
        <p>Jump your colony to a new star system. Buildings, resources and research reset, but you keep <b>Dark Matter</b>: each point adds +10% to all production, forever.</p>
        <p class="mt-2">Dark Matter now: <b>${s.dm}</b> · Lifetime credits: <b>${fmt(s.lifetime)}</b></p>
        <p>Warping now would give <b>${gain}</b> Dark Matter.${gain < 1 ? ' (Earn 10,000 lifetime credits for your first point.)' : ''}</p>
        <div class="col-card-foot"><span>${this.has('warp') ? '' : 'Requires research: Warp Theory'}</span>
        <button type="button" class="btn-mini" data-warp ${this.has('warp') && gain >= 1 ? '' : 'disabled'}>Warp</button></div>
      </div>
      <div class="col-card"><div class="col-card-head"><b>Colony records</b></div>
        <p>Level ${s.level} · ${s.warps} warps · ${fmt(s.clicks)} hand-mined rocks</p>
        <div class="col-card-foot"><span></span><button type="button" class="btn-mini col-danger" data-reset>Abandon colony</button></div></div>`;
    }
    // Don't swap the buttons out from under a press in progress (that would swallow the click).
    if (!force && this.pressing) return;
    if (force || body._tab !== this.tab || body._html !== html) {
      const scroll = body.scrollTop;
      body.innerHTML = html;
      body.scrollTop = body._tab === this.tab ? scroll : 0;
      body._html = html; body._tab = this.tab;
    }
  }

  onPanelClick(e) {
    const b = e.target.closest('button');
    if (!b || b.disabled) return;
    if (b.dataset.build) this.build(b.dataset.build);
    else if (b.dataset.research) this.research(b.dataset.research);
    else if (b.dataset.sell) this.sell(b.dataset.sell, this.s.res[b.dataset.sell] * Number(b.dataset.frac));
    else if (b.dataset.fulfil !== undefined) this.fulfil(Number(b.dataset.fulfil));
    else if (b.dataset.launch) this.launch(b.dataset.launch);
    else if (b.dataset.science !== undefined) this.applyScience();
    else if (b.dataset.warp !== undefined) this.warp();
    else if (b.dataset.reset !== undefined) {
      if (confirm('Abandon this colony and start over from scratch? Dark Matter is kept.')) {
        this.s = freshState({ warps: this.s.warps, dm: this.s.dm });
        this.rollOffers();
        this.persist();
        this.renderPanel(true);
      }
    }
    this.renderResources();
  }

  /* ---------- colony view ---------- */
  initScene() {
    const rnd = (() => { let a = 99; return () => { a = (a * 16807) % 2147483647; return a / 2147483647; }; })();
    this.stars = Array.from({ length: 220 }, () => ({ x: rnd(), y: rnd(), r: Math.pow(rnd(), 4) * 1.6 + 0.3, a: 0.3 + rnd() * 0.7 }));
    this.rocks = Array.from({ length: 9 }, (_, i) => ({ x: 0.7 + rnd() * 0.27, y: 0.15 + rnd() * 0.6, r: 6 + rnd() * 14, rot: rnd() * 6, spin: (rnd() - 0.5) * 0.4, pts: Array.from({ length: 8 }, () => 0.7 + rnd() * 0.35), id: i }));
    this.drones = [];
    this.floaters = [];
    this.particles = [];
    this.asteroidPts = Array.from({ length: 14 }, () => 0.86 + rnd() * 0.18);
  }

  resize() {
    if (this.view3d) { this.view3d.resize(); return; }
    const r = this.$('.col-view').getBoundingClientRect();
    this.vw = Math.max(1, r.width); this.vh = Math.max(1, r.height);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(this.vw * dpr); this.canvas.height = Math.round(this.vh * dpr);
    this.dpr = dpr;
  }

  // Home asteroid sized to the free space between the level pill (top) and the log (bottom).
  asteroidGeom() {
    const W = this.vw, H = this.vh, compact = W < 640;
    const top = 36, bottom = compact ? 44 : 64;
    const FLAT = 0.66, RISE = 0.62; // asteroid height and building height, in units of R
    const usable = Math.max(60, H - top - bottom);
    const R = Math.max(28, Math.min(W * (compact ? 0.26 : 0.24), usable / (FLAT * 2 + RISE)));
    const y = top + RISE * R + FLAT * R + (usable - (FLAT * 2 + RISE) * R) / 2;
    return { x: W * (compact ? 0.36 : 0.34), y, R, rx: R * 1.1, ry: R * FLAT };
  }

  // Height of the asteroid's top surface at x (relative to its centre): a gentle, slightly bumpy plateau.
  surfaceY(a, x) {
    const k = Math.max(0, 1 - (x / a.rx) ** 2);
    return -a.ry * Math.sqrt(k) * (0.97 + 0.025 * Math.sin((x / a.R) * 7.3));
  }

  onCanvasTap(e) {
    const r = this.canvas.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    const a = this.asteroidGeom();
    if (((x - a.x) / (a.rx * 1.08)) ** 2 + ((y - a.y) / (a.ry * 1.6)) ** 2 < 1.4) {
      this.mineByHand(x, y);
      for (let i = 0; i < 10; i++) this.particles.push({ x, y, vx: rand(-80, 80), vy: rand(-120, 20), life: 0.7, color: '#d6c6b0' });
    }
  }

  // A tap on the home asteroid (x, y in view pixels, for the "+ore" label)
  mineByHand(x, y) {
    const gain = Math.max(1, Math.round(3 + this.s.level * 2 * this.dmMult()));
    this.s.res.ore = Math.min(this.storageCap(), this.s.res.ore + gain);
    this.s.clicks++;
    this.floatText(`+${gain} ore`, '#e7dccb', x, y);
    this.ctx.audio.tone({ freq: rand(180, 260), type: 'square', dur: 0.05, vol: 0.06 });
    this.renderResources();
  }

  floatText(text, color, x, y) {
    if (this.view3d) { this.view3d.floatText(text, color, x, y); return; }
    const a = this.asteroidGeom();
    this.floaters.push({ text, color, x: x ?? a.x, y: y ?? a.y - a.ry - a.R * 0.5, life: 1.4 });
  }

  burst(id) {
    if (this.view3d) { this.view3d.celebrate(id); return; }
    const a = this.asteroidGeom();
    for (let i = 0; i < 24; i++) {
      const x = rand(-a.R, a.R) * 0.7;
      this.particles.push({ x: a.x + x, y: a.y + this.surfaceY(a, x), vx: rand(-90, 90), vy: rand(-140, -20), life: 0.9, color: id === 'solar' ? '#93c5fd' : '#67e8f9' });
    }
  }

  loop(now) {
    this.raf = requestAnimationFrame((t) => this.loop(t));
    const dt = Math.min(0.25, (now - this.last) / 1000);
    this.last = now;
    this.time = (this.time || 0) + dt;
    this.tick(dt);
    const s = this.s;
    s.events = s.events.filter((e) => e.until > Date.now());
    s.nextEvent -= dt;
    if (s.nextEvent <= 0) { s.nextEvent = rand(80, 150); if (this.s.lifetime > 200) this.randomEvent(); }
    if (Date.now() > s.offersAt || s.offers.some((o) => o.expires < Date.now())) {
      s.offers = s.offers.filter((o) => o.expires > Date.now());
      if (Date.now() > s.offersAt) this.rollOffers();
    }
    if (Math.floor(this.time * 2) !== Math.floor((this.time - dt) * 2)) this.checkExpeditions();
    if (this.view3d) this.view3d.frame(dt); else this.draw(dt);
  }

  draw(dt) {
    const g = this.g, W = this.vw, H = this.vh, t = this.time, s = this.s;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#02030a'); bg.addColorStop(1, '#060814');
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    for (const st of this.stars) { g.globalAlpha = st.a; g.fillStyle = '#e8eeff'; g.fillRect(st.x * W, st.y * H, st.r, st.r); }
    g.globalAlpha = 1;
    // Distant gas giant
    const gx = W * 0.86, gy = H * 0.2, gr = Math.min(W, H) * 0.16;
    const gg = g.createRadialGradient(gx - gr * 0.4, gy - gr * 0.4, gr * 0.1, gx, gy, gr);
    gg.addColorStop(0, '#f6d7a4'); gg.addColorStop(0.55, '#a5652f'); gg.addColorStop(1, '#1b0d05');
    g.fillStyle = gg; g.beginPath(); g.arc(gx, gy, gr, 0, Math.PI * 2); g.fill();
    g.save(); g.beginPath(); g.arc(gx, gy, gr, 0, Math.PI * 2); g.clip();
    g.globalAlpha = 0.25; g.fillStyle = '#5b3416';
    for (let k = -3; k < 4; k++) g.fillRect(gx - gr, gy + k * gr * 0.22 + Math.sin(k) * 3, gr * 2, gr * 0.06);
    g.restore(); g.globalAlpha = 1;

    // Asteroid field (mining targets)
    for (const r of this.rocks) {
      r.rot += r.spin * dt;
      g.save(); g.translate(r.x * W, r.y * H); g.rotate(r.rot);
      g.fillStyle = '#5d5853';
      g.beginPath();
      r.pts.forEach((k, i) => { const a = (i / r.pts.length) * Math.PI * 2; g[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r.r * k, Math.sin(a) * r.r * k); });
      g.closePath(); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.08)'; g.beginPath(); g.arc(-r.r * 0.3, -r.r * 0.3, r.r * 0.4, 0, Math.PI * 2); g.fill();
      g.restore();
    }

    // Home asteroid with the colony built on its surface
    const a = this.asteroidGeom();
    this.drawAsteroid(g, a, t);

    // Drones ferry ore between the field and the colony
    const want = Math.min(16, this.count('drone') + this.count('harvester'));
    while (this.drones.length < want) this.drones.push({ k: Math.random(), target: pick(this.rocks), speed: rand(0.15, 0.28), ice: this.drones.length >= this.count('drone') });
    this.drones.length = want;
    const eff = this.rates().eff;
    for (const d of this.drones) {
      d.k += dt * d.speed * (0.4 + 0.6 * eff);
      if (d.k > 1) { d.k -= 1; d.target = pick(this.rocks); }
      const out = d.k < 0.5;
      const p = out ? d.k * 2 : (1 - d.k) * 2;
      const sx = a.x + a.R * 0.1, sy = a.y + this.surfaceY(a, a.R * 0.1) - a.R * 0.12;
      const tx = d.target.x * W, ty = d.target.y * H;
      const mx = (sx + tx) / 2, my = Math.min(sy, ty) - 40;
      const x = (1 - p) * (1 - p) * sx + 2 * (1 - p) * p * mx + p * p * tx;
      const y = (1 - p) * (1 - p) * sy + 2 * (1 - p) * p * my + p * p * ty;
      g.fillStyle = d.ice ? '#a5f3fc' : '#86efac';
      g.shadowColor = g.fillStyle; g.shadowBlur = 8;
      g.beginPath(); g.arc(x, y, out ? 2 : 2.8, 0, Math.PI * 2); g.fill();
      g.shadowBlur = 0;
    }

    // Event visuals
    if (this.meteorFx > 0) {
      this.meteorFx -= dt;
      for (let i = 0; i < 3; i++) if (Math.random() < 0.5) this.particles.push({ x: rand(0, W), y: -10, vx: rand(-60, -20), vy: rand(160, 260), life: 1.6, color: '#fdba74', streak: true });
    }
    if (this.pirateFx > 0) {
      this.pirateFx -= dt;
      g.fillStyle = 'rgba(244,63,94,0.06)'; g.fillRect(0, 0, W, H);
    }

    // Particles and floating text
    for (const p of this.particles) {
      p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; if (!p.streak) p.vy += 120 * dt;
      g.globalAlpha = Math.max(0, Math.min(1, p.life));
      g.fillStyle = p.color; g.strokeStyle = p.color;
      if (p.streak) { g.lineWidth = 2; g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.x - p.vx * 0.08, p.y - p.vy * 0.08); g.stroke(); }
      else g.fillRect(p.x, p.y, 2, 2);
    }
    this.particles = this.particles.filter((p) => p.life > 0 && p.y < H + 20);
    g.globalAlpha = 1;
    g.textAlign = 'center'; g.font = '800 14px Inter, sans-serif';
    for (const f of this.floaters) {
      f.life -= dt; f.y -= 30 * dt;
      g.globalAlpha = Math.max(0, Math.min(1, f.life));
      g.fillStyle = f.color; g.fillText(f.text, f.x, f.y);
    }
    this.floaters = this.floaters.filter((f) => f.life > 0);
    g.globalAlpha = 1;
  }

  // Asteroid body plus colony buildings. Buildings stand on the surface in two rows:
  // tall equipment at the back (solar masts, lab dish, refinery), habitats at the front;
  // the shipyard is an orbital dock floating above. Everything scales with the asteroid.
  drawAsteroid(g, a, t) {
    const s = this.s;
    g.save(); g.translate(a.x, a.y);
    // body: noisy underside, smooth plateau on top
    const ag = g.createRadialGradient(-a.R * 0.45, -a.ry * 0.7, a.R * 0.1, 0, 0, a.R * 1.25);
    ag.addColorStop(0, '#a39a90'); ag.addColorStop(0.55, '#5e5751'); ag.addColorStop(1, '#221f1c');
    g.fillStyle = ag;
    g.beginPath();
    const n = this.asteroidPts.length;
    for (let i = 0; i <= n; i++) {
      const ang = (i / n) * Math.PI; // 0..PI: right edge, underside, left edge
      const k = this.asteroidPts[i % n];
      const bump = Math.sin(ang); // 0 at both ends, so the outline joins the plateau cleanly
      g.lineTo(Math.cos(ang) * a.rx * (1 + (k - 0.95) * 0.5 * bump), bump * a.ry * 1.15 * (1 + (k - 0.95) * bump));
    }
    for (let i = 0; i <= 28; i++) { const x = -a.rx + (i / 28) * a.rx * 2; g.lineTo(x, this.surfaceY(a, x)); }
    g.closePath(); g.fill();
    // rim light along the plateau and a few craters
    g.strokeStyle = 'rgba(255,240,220,0.18)'; g.lineWidth = Math.max(1, a.R * 0.02);
    g.beginPath(); for (let i = 2; i <= 26; i++) { const x = -a.rx + (i / 28) * a.rx * 2; g[i === 2 ? 'moveTo' : 'lineTo'](x, this.surfaceY(a, x)); } g.stroke();
    g.fillStyle = 'rgba(0,0,0,0.25)';
    [[-0.45, 0.35, 0.14], [0.4, 0.42, 0.1], [0.02, 0.62, 0.08], [0.72, 0.18, 0.06]].forEach(([x, y, r]) => { g.beginPath(); g.ellipse(x * a.R, y * a.ry, r * a.R, r * a.R * 0.45, 0, 0, Math.PI * 2); g.fill(); });

    const u = a.R / 64; // building unit
    const ground = (x, lift = 0) => this.surfaceY(a, x) + 2 * u - lift;
    const row = (items, from, to) => {
      const total = items.reduce((sum, it) => sum + it.w, 0) + Math.max(0, items.length - 1) * 4;
      const scale = Math.min(1, (to - from) / (total * u));
      let x = (from + to) / 2 - (total * u * scale) / 2;
      return items.map((it) => { const w = it.w * u * scale; const cx = x + w / 2; x += w + 4 * u * scale; return { ...it, cx, k: scale }; });
    };
    const flare = this.flare() > 1;

    // back row
    const back = [];
    for (let i = 0; i < Math.min(4, this.count('solar')); i++) back.push({ type: 'solar', w: 15, i });
    if (this.count('lab')) back.push({ type: 'lab', w: 14 });
    if (this.count('refinery')) back.push({ type: 'refinery', w: 12 });
    for (const m of row(back, -a.rx * 0.74, a.rx * 0.7)) {
      const y = ground(m.cx, 3 * u), k = u * m.k;
      if (m.type === 'solar') {
        g.strokeStyle = '#8391a7'; g.lineWidth = Math.max(1, 1.4 * k); g.beginPath(); g.moveTo(m.cx, y); g.lineTo(m.cx, y - 16 * k); g.stroke();
        g.save(); g.translate(m.cx, y - 18 * k); g.rotate(-0.3 + Math.sin(t * 0.3 + m.i) * 0.05);
        g.fillStyle = '#1e3a8a'; g.fillRect(-8 * k, -3 * k, 16 * k, 6 * k);
        g.strokeStyle = 'rgba(191,219,254,0.55)'; g.lineWidth = Math.max(0.5, 0.5 * k);
        for (let q = -8; q <= 8; q += 4) { g.beginPath(); g.moveTo(q * k, -3 * k); g.lineTo(q * k, 3 * k); g.stroke(); }
        if (flare) { g.fillStyle = 'rgba(253,224,71,0.35)'; g.fillRect(-8 * k, -3 * k, 16 * k, 6 * k); }
        g.restore();
      } else if (m.type === 'lab') {
        g.strokeStyle = '#cbd5e1'; g.lineWidth = Math.max(1, 1.6 * k); g.beginPath(); g.moveTo(m.cx, y); g.lineTo(m.cx, y - 20 * k); g.stroke();
        g.save(); g.translate(m.cx, y - 21 * k); g.rotate(Math.sin(t * 0.5) * 0.5 - 0.6);
        g.strokeStyle = '#e2e8f0'; g.lineWidth = Math.max(1, 2 * k); g.beginPath(); g.arc(0, 0, 7 * k, 0.2, Math.PI - 0.2); g.stroke();
        g.restore();
        g.fillStyle = (t % 2) < 1 ? '#c4b5fd' : '#7c3aed'; g.beginPath(); g.arc(m.cx, y - 23 * k, Math.max(1.2, 1.6 * k), 0, Math.PI * 2); g.fill();
      } else if (m.type === 'refinery') {
        g.fillStyle = '#64748b'; g.fillRect(m.cx - 5 * k, y - 28 * k, 10 * k, 28 * k);
        g.fillStyle = '#fb923c'; g.shadowColor = '#fb923c'; g.shadowBlur = 10; g.fillRect(m.cx - 5 * k, y - 19 * k, 10 * k, 2.5 * k); g.shadowBlur = 0;
        if (Math.random() < 0.35) this.particles.push({ x: a.x + m.cx + rand(-2, 2) * k, y: a.y + y - 30 * k, vx: rand(-6, 6), vy: rand(-30, -14), life: 1.1, color: 'rgba(148,163,184,0.55)' });
      }
    }

    // front row
    const front = [];
    if (this.count('reactor')) front.push({ type: 'reactor', w: 16 });
    front.push({ type: 'command', w: 24 });
    for (let i = 0; i < Math.min(4, this.count('habitat')); i++) front.push({ type: 'dome', w: 18 });
    for (const m of row(front, -a.rx * 0.84, a.rx * 0.84)) {
      const y = ground(m.cx), k = u * m.k;
      if (m.type === 'reactor') {
        const pulse = 0.6 + Math.sin(t * 3) * 0.3;
        g.fillStyle = '#475569'; g.beginPath(); g.arc(m.cx, y, 8 * k, Math.PI, 0); g.fill();
        g.fillStyle = `rgba(103,232,249,${pulse})`; g.shadowColor = '#67e8f9'; g.shadowBlur = 14;
        g.beginPath(); g.arc(m.cx, y - 4 * k, 3 * k, 0, Math.PI * 2); g.fill(); g.shadowBlur = 0;
      } else if (m.type === 'command') {
        g.fillStyle = '#cbd5e1'; g.fillRect(m.cx - 12 * k, y - 9 * k, 24 * k, 9 * k);
        g.fillStyle = '#94a3b8'; g.fillRect(m.cx - 12 * k, y - 3 * k, 24 * k, 3 * k);
        g.fillStyle = 'rgba(255,217,160,0.9)'; for (let q = 0; q < 3; q++) g.fillRect(m.cx - 8 * k + q * 6 * k, y - 7 * k, 2.5 * k, 2 * k);
        g.strokeStyle = '#cbd5e1'; g.lineWidth = Math.max(1, k); g.beginPath(); g.moveTo(m.cx + 8 * k, y - 9 * k); g.lineTo(m.cx + 8 * k, y - 16 * k); g.stroke();
        g.fillStyle = (t % 1.4) < 0.15 ? '#f87171' : '#7f1d1d'; g.beginPath(); g.arc(m.cx + 8 * k, y - 17 * k, Math.max(1.4, 1.8 * k), 0, Math.PI * 2); g.fill();
      } else if (m.type === 'dome') {
        const r = 9 * k;
        g.fillStyle = 'rgba(148,163,184,0.9)'; g.fillRect(m.cx - r, y - 1.5 * k, r * 2, 1.5 * k);
        const dg = g.createLinearGradient(m.cx - r, y - r, m.cx + r, y);
        dg.addColorStop(0, 'rgba(241,245,249,0.95)'); dg.addColorStop(1, 'rgba(148,163,184,0.85)');
        g.fillStyle = dg; g.beginPath(); g.arc(m.cx, y - 1.5 * k, r, Math.PI, 0); g.fill();
        g.fillStyle = 'rgba(255,217,160,0.9)';
        for (let q = 0; q < 3; q++) g.fillRect(m.cx - r * 0.55 + q * r * 0.45, y - r * 0.45, Math.max(1.2, 1.6 * k), Math.max(1.2, 1.6 * k));
      }
    }

    // orbital shipyard above the colony
    if (this.count('shipyard')) {
      const k = u * 0.8, cx = a.rx * 0.62, cy = -a.ry - 34 * u + Math.sin(t * 0.8) * 2 * u;
      g.strokeStyle = 'rgba(148,163,184,0.9)'; g.lineWidth = Math.max(1, 1.3 * k);
      g.strokeRect(cx - 16 * k, cy - 6 * k, 32 * k, 12 * k);
      g.beginPath(); for (let q = -16; q <= 16; q += 8) { g.moveTo(cx + q * k, cy - 6 * k); g.lineTo(cx + q * k, cy + 6 * k); } g.stroke();
      if (s.expeditions.length < this.count('shipyard')) {
        g.fillStyle = '#e2e8f0'; g.beginPath(); g.moveTo(cx - 11 * k, cy + 2 * k); g.lineTo(cx + 13 * k, cy); g.lineTo(cx - 11 * k, cy - 2 * k); g.closePath(); g.fill();
      }
      g.fillStyle = (t % 1.2) < 0.15 ? '#67e8f9' : '#164e63'; g.beginPath(); g.arc(cx + 16 * k, cy - 6 * k, Math.max(1.2, 1.5 * k), 0, Math.PI * 2); g.fill();
    }

    // hint until the player has mined by hand a few times
    if (s.clicks < 5) {
      g.globalAlpha = 0.55 + Math.sin(t * 3) * 0.25;
      g.fillStyle = '#e2e8f0'; g.textAlign = 'center';
      g.font = `700 ${Math.max(10, Math.min(13, a.R * 0.13))}px Inter, sans-serif`;
      g.fillText('TAP TO MINE', 0, a.ry * 0.45);
      g.globalAlpha = 1;
    }
    g.restore();
  }

  destroy() {
    this.persist();
    this.view3d?.dispose();
    cancelAnimationFrame(this.raf);
    clearInterval(this.saveTimer);
    clearInterval(this.uiTimer);
    this.timers.forEach(clearTimeout);
    this.listeners.forEach(([t, e, f, o]) => t.removeEventListener(e, f, o));
    this.ro.disconnect();
    this.root.innerHTML = '';
  }
}
