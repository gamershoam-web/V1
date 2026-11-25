import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';
import { env } from './env.js';

export function initReveals() {
  // headline line reveals
  document.querySelectorAll('[data-split]').forEach((el) => {
    if (env.reduced) return;
    SplitText.create(el, {
      type: 'lines',
      linesClass: 'sline',
      mask: 'lines',
      autoSplit: true,
      onSplit(self) {
        return gsap.from(self.lines, {
          yPercent: 115,
          duration: 1.3,
          ease: 'expo.out',
          stagger: 0.09,
          scrollTrigger: { trigger: el, start: 'top 88%', once: true },
        });
      },
    });
  });

  // manifesto: word-by-word scrubbed illumination
  const manifesto = document.querySelector('.js-words');
  if (manifesto) {
    SplitText.create(manifesto, {
      type: 'words',
      wordsClass: 'w',
      autoSplit: true,
      onSplit(self) {
        if (env.reduced) { gsap.set(self.words, { opacity: 1 }); return null; }
        return gsap.to(self.words, {
          opacity: 1,
          stagger: 0.12,
          ease: 'none',
          scrollTrigger: { trigger: manifesto, start: 'top 78%', end: 'bottom 42%', scrub: true },
        });
      },
    });
  }

  // generic fade-up blocks
  if (!env.reduced) {
    ScrollTrigger.batch('[data-reveal]', {
      start: 'top 90%',
      once: true,
      onEnter: (batch) => gsap.to(batch, { opacity: 1, y: 0, duration: 1.2, ease: 'expo.out', stagger: 0.12 }),
    });
  }

  // label slide-in
  if (!env.reduced) {
    document.querySelectorAll('.section .label, .contact .label').forEach((el) => {
      gsap.from(el, { opacity: 0, x: -20, duration: 1, ease: 'expo.out', scrollTrigger: { trigger: el, start: 'top 92%', once: true } });
    });
  }

  // fragments: diagonal strip drifts with scroll
  const track = document.querySelector('.fragments__track');
  if (track && !env.reduced) {
    gsap.fromTo(track, { x: () => window.innerWidth * 0.1 }, {
      x: () => -(track.scrollWidth - window.innerWidth * 0.95),
      ease: 'none',
      scrollTrigger: { trigger: '.fragments__strip', start: 'top bottom', end: 'bottom top', scrub: true, invalidateOnRefresh: true },
    });
    gsap.fromTo(track.querySelectorAll('img'), { xPercent: -8 }, {
      xPercent: 8, ease: 'none',
      scrollTrigger: { trigger: '.fragments__strip', start: 'top bottom', end: 'bottom top', scrub: true },
    });
  }

  // work rows slide in
  if (!env.reduced) {
    gsap.utils.toArray('.work__item').forEach((item) => {
      gsap.from(item.querySelector('a'), { yPercent: 40, opacity: 0, duration: 1.2, ease: 'expo.out', scrollTrigger: { trigger: item, start: 'top 94%', once: true } });
    });
  }

  // stat counters
  document.querySelectorAll('[data-count]').forEach((el) => {
    const end = Number(el.dataset.count);
    if (env.reduced) { el.textContent = String(end); return; }
    const o = { v: 0 };
    gsap.to(o, {
      v: end, duration: 2.2, ease: 'power3.out',
      scrollTrigger: { trigger: el, start: 'top 90%', once: true },
      onUpdate: () => { el.textContent = String(Math.round(o.v)); },
    });
  });

  // contact: rising footer word + CTA pop
  if (!env.reduced) {
    gsap.from('.footer__word', { yPercent: 40, ease: 'none', scrollTrigger: { trigger: '.footer', start: 'top bottom', end: 'bottom bottom', scrub: true } });
    gsap.from('.contact__cta', { scale: 0, rotate: -40, duration: 1.4, ease: 'elastic.out(1, 0.6)', scrollTrigger: { trigger: '.contact__row', start: 'top 85%', once: true } });
  }
}

export function initServices() {
  document.querySelectorAll('.service').forEach((details) => {
    const summary = details.querySelector('summary');
    const body = details.querySelector('.service__body');
    summary.addEventListener('click', (e) => {
      e.preventDefault();
      if (gsap.isTweening(body)) return;
      if (details.open) {
        gsap.fromTo(body, { height: body.offsetHeight }, {
          height: 0, duration: env.reduced ? 0 : 0.6, ease: 'expo.inOut',
          onComplete: () => { details.open = false; gsap.set(body, { clearProps: 'height' }); ScrollTrigger.refresh(); },
        });
      } else {
        details.open = true;
        gsap.fromTo(body, { height: 0 }, {
          height: 'auto', duration: env.reduced ? 0 : 0.8, ease: 'expo.out',
          onComplete: () => { gsap.set(body, { clearProps: 'height' }); ScrollTrigger.refresh(); },
        });
      }
    });
  });
}

/** Fit a single-line element's font-size so its natural width spans the container. */
export function fitText(selector, ratio = 1) {
  const els = document.querySelectorAll(selector);
  const fit = () => {
    els.forEach((el) => {
      const parent = el.parentElement;
      const cs = getComputedStyle(parent);
      const avail = (parent.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)) * ratio;
      const isFlex = getComputedStyle(el).display.includes('flex');
      el.style.fontSize = '100px';
      el.style.width = 'max-content';
      el.style.display = isFlex ? 'inline-flex' : 'inline-block';
      el.style.justifyContent = 'flex-start';
      const w = el.getBoundingClientRect().width;
      el.style.width = '';
      el.style.display = '';
      el.style.justifyContent = '';
      if (w > 0) el.style.fontSize = `${((100 * avail) / w).toFixed(2)}px`;
    });
  };
  fit();
  let t;
  let lastW = window.innerWidth;
  window.addEventListener('resize', () => {
    if (window.innerWidth === lastW) return;
    lastW = window.innerWidth;
    clearTimeout(t);
    t = setTimeout(() => { fit(); ScrollTrigger.refresh(); }, 150);
  });
  return fit;
}
