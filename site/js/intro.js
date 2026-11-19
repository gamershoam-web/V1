// Cinematic opening sequence: boot line -> logo assembles -> title flies in -> launch bar -> hyperspace jump.
// Tap, click or press any key to skip. In calm mode (see motion.js) the hyperspace jump becomes a soft fade.
import { audio } from './audio.js';

const STATUS = ['Initializing systems', 'Calibrating star charts', 'Pinging Orbitnetwork.cloud', 'Charging arcade cores', 'Ready for launch'];
const COLORS = ['#a5f3fc', '#c4b5fd', '#f9a8d4', '#ffffff', '#67e8f9'];

// `ready` (optional promise): the launch waits for it (the 3D scene finishing its build), up to MAX_WAIT ms after page load.
const MAX_WAIT = 7500;

export function runIntro({ onReveal, ready = null } = {}) {
  const el = document.getElementById('intro');
  if (!el) {
    document.body.classList.remove('intro-active');
    document.dispatchEvent(new CustomEvent('intro:reveal'));
    onReveal?.();
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const timers = [];
    const later = (ms, fn) => timers.push(setTimeout(fn, ms));
    const pct = el.querySelector('.intro-pct');
    const status = el.querySelector('.intro-status');
    const bar = el.querySelector('.intro-bar i');
    let launched = false, finished = false, raf = 0;
    let isReady = !ready;
    ready?.then(() => { isReady = true; }, () => { isReady = true; });

    // Hyperspace streaks (fewer on phones and low-power devices)
    const lite = document.documentElement.classList.contains('lite');
    // Lite: the title's glow filter switches on once its letters have finished writing
    later(Math.max(0, 3700 - performance.now()), () => el.querySelector('.wordmark')?.classList.add('wm-done'));
    el.querySelector('.intro-warp').innerHTML = Array.from({ length: lite ? 44 : 110 }, () => {
      const a = Math.round(Math.random() * 360);
      const d = (Math.random() * 0.3).toFixed(2);
      const l = Math.round(40 + Math.random() * 180);
      const s = (0.35 + Math.random() * 0.65).toFixed(2);
      return `<i style="--a:${a}deg;--d:${d}s;--l:${l}px;--s:${s};--c:${COLORS[Math.floor(Math.random() * COLORS.length)]}"></i>`;
    }).join('');

    // Launch bar progress (timed from page load, like the CSS animations)
    const start = 0;
    const DURATION = 2700;
    const tick = (now) => {
      const p = Math.min(1, Math.max(0, (now - start - 500) / DURATION));
      // Hold just short of 100% until the scene is actually ready
      const eased = Math.min(isReady ? 1 : 0.92, 1 - Math.pow(1 - p, 2.2));
      pct.textContent = `${Math.round(eased * 100)}%`;
      bar.style.transform = `scaleX(${eased})`;
      status.textContent = `${STATUS[Math.min(STATUS.length - 1, Math.floor(eased * (STATUS.length - 0.01)))]}${eased < 1 ? '…' : ''}`;
      if ((p < 1 || eased < 1) && !launched) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    const finish = () => {
      if (finished) return;
      finished = true;
      timers.forEach(clearTimeout);
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKey, true);
      el.remove();
      document.body.classList.remove('intro-active');
      resolve();
    };

    const launch = (fast = false, byUser = false) => {
      if (launched) return;
      launched = true;
      cancelAnimationFrame(raf);
      pct.textContent = '100%';
      bar.style.transform = 'scaleX(1)';
      status.textContent = STATUS[STATUS.length - 1];
      if (byUser) audio.whoosh();
      el.classList.add('launch');
      if (fast) el.classList.add('fast');
      later(fast ? 200 : 520, () => onReveal?.());
      later(fast ? 260 : 700, () => {
        el.classList.add('reveal');
        document.body.classList.remove('intro-active');
        document.dispatchEvent(new CustomEvent('intro:reveal'));
      });
      later(fast ? 1000 : 1700, finish);
    };

    const onKey = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      launch(true, true);
    };
    window.addEventListener('keydown', onKey, true);
    el.addEventListener('pointerdown', () => launch(true, true));

    const tryLaunch = () => {
      if (isReady || performance.now() > MAX_WAIT) { launch(); return; }
      ready.then(() => later(250, () => launch()), () => launch());
      later(Math.max(0, MAX_WAIT - performance.now()), () => launch());
    };
    later(Math.max(500, 3600 - performance.now()), tryLaunch);
  });
}
