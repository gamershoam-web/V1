import gsap from 'gsap';
import { env } from './env.js';

/**
 * Animated preloader. `tasks` is an array of promises (never rejecting).
 * Resolves when the reveal starts so the hero intro can overlap it.
 */
export function runLoader(tasks) {
  const el = document.getElementById('loader');
  const num = el.querySelector('.loader__num');
  const bar = el.querySelector('.loader__bar span');
  const words = el.querySelectorAll('.loader__word > span');

  return new Promise((resolve) => {
    let done = 0;
    let target = 0;
    const total = Math.max(tasks.length, 1);
    tasks.forEach((p) => Promise.resolve(p).finally(() => { done += 1; target = done / total; }));
    if (!tasks.length) target = 1;
    const safety = setTimeout(() => { target = 1; }, 9000);

    gsap.fromTo(words, { yPercent: 105 }, { yPercent: 0, duration: 1.1, ease: 'expo.out', stagger: 0.08, delay: 0.1 });

    const minTime = env.reduced ? 0.2 : 1.5;
    const start = performance.now();
    const state = { p: 0 };
    let finished = false;

    const tick = () => {
      const elapsed = (performance.now() - start) / 1000;
      const goal = Math.min(target, Math.min(1, elapsed / minTime));
      state.p += (goal - state.p) * 0.09;
      if (goal - state.p < 0.003) state.p = goal;
      num.textContent = String(Math.round(state.p * 100));
      bar.style.transform = `scaleX(${state.p})`;
      if (state.p >= 1 && !finished) {
        finished = true;
        clearTimeout(safety);
        gsap.ticker.remove(tick);
        finish();
      }
    };
    gsap.ticker.add(tick);

    function finish() {
      const tl = gsap.timeline({
        onComplete: () => { el.remove(); },
      });
      tl.to(words, { yPercent: -105, duration: 0.7, ease: 'expo.in', stagger: 0.05 }, 0.15)
        .to([el.querySelector('.loader__count'), el.querySelector('.loader__bar'), el.querySelector('.loader__top')], { opacity: 0, duration: 0.4 }, 0.3)
        .to(el, { clipPath: 'inset(0% 0% 100% 0%)', duration: 1.1, ease: 'expo.inOut' }, 0.75)
        .add(() => resolve(), 0.95);
    }
  });
}
