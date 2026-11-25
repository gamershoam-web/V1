import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { env } from './env.js';

const FRONT = [255, 90, 31];
const BACK = [122, 26, 4];
const BONE = '#ece8e1';

export function initKinetic() {
  const section = document.querySelector('.kinetic');
  const stacks = [...section.querySelectorAll('.stack')];
  const layers = env.mobile ? 9 : 15;

  const built = stacks.map((stack) => {
    const text = stack.dataset.text;
    const spans = [];
    // back layers first so the front layer paints on top
    for (let d = layers - 1; d >= 0; d--) {
      const s = document.createElement('span');
      s.textContent = text;
      s.setAttribute('aria-hidden', 'true');
      if (d === 0) s.style.color = `rgb(${FRONT.join(',')})`;
      else if (d % 2 === 1) s.style.color = BONE;
      else {
        const t = d / (layers - 1);
        const c = FRONT.map((f, k) => Math.round(f + (BACK[k] - f) * t));
        s.style.color = `rgb(${c.join(',')})`;
      }
      s.dataset.depth = String(d);
      stack.appendChild(s);
      spans.push(s);
    }
    return { stack, spans };
  });

  const apply = (p) => {
    const angle = (135 - p * 90) * (Math.PI / 180);
    const mag = 0.35 + Math.sin(p * Math.PI) * 0.65;
    built.forEach(({ stack, spans }) => {
      const fs = parseFloat(getComputedStyle(stack).fontSize) || 100;
      const step = fs * 0.0105 * mag;
      const dx = Math.cos(angle) * step;
      const dy = Math.sin(angle) * step;
      spans.forEach((s) => {
        const d = +s.dataset.depth;
        s.style.transform = d ? `translate3d(${(dx * d).toFixed(2)}px, ${(dy * d).toFixed(2)}px, 0)` : '';
      });
    });
  };
  apply(0.5);
  if (env.reduced) return;

  ScrollTrigger.create({
    trigger: section, start: 'top bottom', end: 'bottom top', scrub: true,
    onUpdate: (self) => apply(self.progress),
  });
  gsap.fromTo(section.querySelector('.kinetic__row--a .stack'), { xPercent: 8 }, { xPercent: -14, ease: 'none', scrollTrigger: { trigger: section, start: 'top bottom', end: 'bottom top', scrub: true } });
  gsap.fromTo(section.querySelector('.kinetic__row--b .stack'), { xPercent: -10 }, { xPercent: 10, ease: 'none', scrollTrigger: { trigger: section, start: 'top bottom', end: 'bottom top', scrub: true } });
}
