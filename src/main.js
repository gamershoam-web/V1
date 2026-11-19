import '@fontsource-variable/archivo/wdth.css';
import '@fontsource/instrument-serif/400-italic.css';
import '@fontsource-variable/jetbrains-mono/index.css';
import 'lenis/dist/lenis.css';
import './styles/main.css';

import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';

import { env, loadImage } from './modules/env.js';
import { initSmooth, startScroll, stopScroll } from './modules/smooth.js';
import { runLoader } from './modules/loader.js';
import { initHero } from './modules/hero.js';
import { initJourney } from './modules/journey.js';
import { initWork } from './modules/work.js';
import { initDissolve } from './modules/dissolve.js';
import { initKinetic } from './modules/kinetic.js';
import { initProduct } from './modules/product.js';
import { initFluid } from './modules/fluid.js';
import { initArchive } from './modules/archive.js';
import { initMarquee } from './modules/marquee.js';
import { initHeader, initMenu, initAnchors, initCursor, initMagnetic, initCopy } from './modules/ui.js';
import { initLessons } from './modules/lessons.js';
import { initReveals, initServices, fitText } from './modules/reveals.js';

gsap.registerPlugin(ScrollTrigger, SplitText);

function safe(name, fn) {
  try { return fn(); } catch (err) { console.error(`[${name}]`, err); return null; }
}

async function boot() {
  initSmooth();
  stopScroll();

  const fontsReady = document.fonts ? document.fonts.ready : Promise.resolve();
  await Promise.race([fontsReady, new Promise((r) => setTimeout(r, 2500))]);

  safe('fit', () => { fitText('.hero__word', 1); fitText('.footer__word', 0.98); });

  const hero = safe('hero', initHero);
  const journey = safe('journey', initJourney);
  safe('work', initWork);
  const dissolve = safe('dissolve', initDissolve);
  safe('kinetic', initKinetic);
  const product = safe('product', initProduct);
  safe('fluid', initFluid);
  safe('services', initServices);
  const archive = safe('archive', initArchive);
  safe('marquee', initMarquee);
  safe('reveals', initReveals);

  safe('header', initHeader);
  const menu = safe('menu', initMenu) || { close() {} };
  safe('anchors', () => initAnchors(menu, archive));
  safe('cursor', initCursor);
  safe('magnetic', initMagnetic);
  safe('copy', initCopy);
  safe('lessons', initLessons);

  const tasks = [
    fontsReady,
    hero && hero.ready,
    journey && journey.ready,
    dissolve && dissolve.ready,
    product && product.ready,
    loadImage('/media/chrome.webp'),
    loadImage('/media/glass-sm.webp'),
    loadImage('/media/spheres.webp'),
  ].filter(Boolean);

  await runLoader(tasks);
  document.documentElement.classList.remove('is-loading');
  startScroll();
  ScrollTrigger.refresh();
  if (hero) hero.intro();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();

export { env };
