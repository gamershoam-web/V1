import Lenis from 'lenis';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { env } from './env.js';

export let lenis = null;
const listeners = new Set();

export function initSmooth() {
  ScrollTrigger.config({ ignoreMobileResize: true });
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  window.scrollTo(0, 0);

  if (!env.reduced) {
    lenis = new Lenis({ lerp: 0.085, smoothWheel: true, wheelMultiplier: 1, anchors: false });
    lenis.on('scroll', (l) => {
      ScrollTrigger.update();
      listeners.forEach((fn) => fn(l.scroll, l.velocity, l.direction, l.limit));
    });
    gsap.ticker.add((time) => lenis.raf(time * 1000));
    gsap.ticker.lagSmoothing(0);
  } else {
    let last = window.scrollY;
    window.addEventListener('scroll', () => {
      const y = window.scrollY;
      const limit = document.documentElement.scrollHeight - window.innerHeight;
      listeners.forEach((fn) => fn(y, y - last, Math.sign(y - last) || 1, limit));
      last = y;
    }, { passive: true });
  }
}

export function onScroll(fn) { listeners.add(fn); return () => listeners.delete(fn); }

export function stopScroll() { if (lenis) lenis.stop(); }
export function startScroll() { if (lenis) lenis.start(); }

export function scrollTo(target, opts = {}) {
  const el = typeof target === 'string' ? document.querySelector(target) : target;
  if (!el) return;
  if (lenis) {
    lenis.scrollTo(el, { duration: 1.8, easing: (t) => 1 - Math.pow(1 - t, 4), ...opts });
  } else {
    el.scrollIntoView({ behavior: env.reduced ? 'auto' : 'smooth', block: 'start' });
  }
}
