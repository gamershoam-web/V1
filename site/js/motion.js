// Animation preference: 'auto' (follow the device), 'full' or 'calm'.
// Calm keeps the site animated (icons, glows, fades, the intro) but swaps intense motion
// (hyperspace jump, flashes, camera sweeps, parallax, screen shake, 3D tilt) for gentle fades.
// The class on <html> is first set by an inline script in index.html to avoid a flash.
import { Store } from './storage.js';

const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
const listeners = new Set();

export const Motion = {
  get setting() { return Store.motion; },
  get osReduce() { return mq.matches; },
  get mode() {
    const s = Store.motion;
    return s === 'full' || s === 'calm' ? s : (mq.matches ? 'calm' : 'full');
  },
  get calm() { return this.mode === 'calm'; },
  apply() {
    const root = document.documentElement;
    root.classList.toggle('motion-calm', this.calm);
    root.classList.toggle('motion-full', !this.calm);
    listeners.forEach((fn) => fn(this.mode));
  },
  set(setting) {
    Store.setMotion(setting);
    this.apply();
  },
  onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
};

mq.addEventListener?.('change', () => { if (Store.motion === 'auto') Motion.apply(); });
