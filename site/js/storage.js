// Player progress (XP, high scores, settings) persisted in localStorage.
const KEY = 'orbitHub.v1';
const DEFAULTS = { xp: 0, best: {}, muted: false, visited: {}, motion: 'auto' };
const RANKS = ['Cadet', 'Pilot', 'Navigator', 'Lieutenant', 'Commander', 'Captain', 'Commodore', 'Admiral', 'Star Marshal', 'Galactic Legend'];
const listeners = new Set();

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY));
    if (raw && typeof raw === 'object') return { ...DEFAULTS, ...raw, best: { ...(raw.best || {}) }, visited: { ...(raw.visited || {}) } };
  } catch { /* storage unavailable */ }
  return { ...DEFAULTS, best: {}, visited: {} };
}

let state = load();

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* ignore */ }
  listeners.forEach((fn) => fn(state));
}

// Level n starts at 50*n*(n-1) XP: 0, 100, 300, 600, 1000, ...
const xpForLevel = (n) => 50 * n * (n - 1);

export const Store = {
  get xp() { return state.xp; },
  get muted() { return state.muted; },
  get motion() { return ['auto', 'full', 'calm'].includes(state.motion) ? state.motion : 'auto'; },
  levelInfo() {
    let level = 1;
    while (state.xp >= xpForLevel(level + 1)) level++;
    const floor = xpForLevel(level), next = xpForLevel(level + 1);
    return {
      level, xp: state.xp, floor, next,
      progress: (state.xp - floor) / (next - floor),
      rank: RANKS[Math.min(RANKS.length - 1, Math.floor((level - 1) / 2))],
    };
  },
  addXP(n) {
    if (!(n > 0)) return { leveledUp: false };
    const before = this.levelInfo().level;
    state.xp += Math.round(n);
    save();
    const after = this.levelInfo().level;
    return { leveledUp: after > before, level: after };
  },
  getBest(id) { return state.best[id] || 0; },
  allBest() { return { ...state.best }; },
  totalBest() { return Object.values(state.best).reduce((a, b) => a + b, 0); },
  submitScore(id, score) {
    const prev = state.best[id] || 0;
    const isNew = score > prev;
    if (isNew) { state.best[id] = score; save(); }
    return { best: Math.max(prev, score), isNew: isNew && score > 0 };
  },
  setMuted(m) { state.muted = !!m; save(); },
  setMotion(m) { state.motion = ['auto', 'full', 'calm'].includes(m) ? m : 'auto'; save(); },
  markVisited(id) {
    if (state.visited[id]) return false;
    state.visited[id] = true; save();
    return true;
  },
  reset() { const { muted, motion } = state; state = { ...DEFAULTS, best: {}, visited: {}, muted, motion }; save(); },
  // Progress that follows a player between devices (device settings like sound and motion stay local).
  exportProgress() { return { xp: state.xp, best: { ...state.best }, visited: { ...state.visited } }; },
  importProgress(p = {}) {
    state = {
      ...state,
      xp: Math.max(0, Math.round(Number(p.xp) || 0)),
      best: Object.fromEntries(Object.entries(p.best || {}).filter(([, v]) => Number.isFinite(v) && v >= 0)),
      visited: { ...(p.visited || {}) },
    };
    save();
  },
  subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
};
