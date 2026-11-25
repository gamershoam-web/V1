import gsap from 'gsap';
import { env } from './env.js';
import { scrollTo, stopScroll, startScroll } from './smooth.js';

const pad = (n) => String(n).padStart(2, '0');

/** Side drawer with step-by-step breakdowns of each effect on the page. */
export function initLessons() {
  const dialog = document.getElementById('lesson');
  if (!dialog || typeof dialog.showModal !== 'function') return null;
  const panel = dialog.querySelector('.lesson__panel');
  const scrim = dialog.querySelector('.lesson__scrim');
  const scroller = dialog.querySelector('.lesson__scroll');
  const body = dialog.querySelector('.lesson__body');
  const count = dialog.querySelector('.lesson__count');
  const live = dialog.querySelector('.lesson__live');
  const templates = [...document.querySelectorAll('template[data-lesson]')];
  const total = templates.length;
  const html = document.documentElement;
  const dur = (d) => (env.reduced ? 0 : d);

  let current = 0;
  let closing = false;
  let opener = null;

  function render(i) {
    current = (i + total) % total;
    const tpl = templates[current];
    body.replaceChildren(tpl.content.cloneNode(true));
    count.textContent = `Breakdown ${pad(current + 1)} / ${pad(total)}`;
    const title = body.querySelector('.lesson__title');
    dialog.setAttribute('aria-label', `Effect breakdown: ${title ? title.textContent : ''}`);
    live.dataset.target = tpl.dataset.target;
    scroller.scrollTop = 0;
    if (!env.reduced) {
      gsap.from(body.children, { y: 26, opacity: 0, duration: 0.8, ease: 'expo.out', stagger: 0.045, delay: 0.08 });
    }
  }

  function open(i) {
    opener = document.activeElement;
    render(i);
    if (dialog.open) return;
    dialog.showModal();
    html.classList.add('has-dialog');
    stopScroll();
    gsap.fromTo(scrim, { opacity: 0 }, { opacity: 1, duration: dur(0.5), ease: 'power2.out' });
    gsap.fromTo(panel, { xPercent: 100 }, { xPercent: 0, duration: dur(0.9), ease: 'expo.out' });
  }

  function close(after) {
    if (!dialog.open || closing) return;
    closing = true;
    gsap.to(scrim, { opacity: 0, duration: dur(0.45), ease: 'power2.in' });
    gsap.to(panel, {
      xPercent: 100, duration: dur(0.6), ease: 'expo.in',
      onComplete: () => {
        dialog.close();
        html.classList.remove('has-dialog');
        startScroll();
        closing = false;
        if (after) after();
        else if (opener && opener.focus) opener.focus({ preventScroll: true });
      },
    });
  }

  function step(dir) {
    if (env.reduced) { render(current + dir); return; }
    gsap.to(body, {
      opacity: 0, x: -24 * dir, duration: 0.25, ease: 'power2.in',
      onComplete: () => {
        gsap.set(body, { opacity: 1, x: 0 });
        render(current + dir);
      },
    });
  }

  document.querySelectorAll('[data-lesson]').forEach((el) => {
    if (el.tagName === 'TEMPLATE') return;
    el.addEventListener('click', (e) => {
      e.preventDefault();
      open(Number(el.dataset.lesson));
    });
  });

  dialog.querySelector('.lesson__close').addEventListener('click', () => close());
  scrim.addEventListener('click', () => close());
  dialog.addEventListener('cancel', (e) => { e.preventDefault(); close(); });
  dialog.querySelectorAll('.lesson__nav').forEach((b) => b.addEventListener('click', () => step(Number(b.dataset.dir))));
  dialog.addEventListener('keydown', (e) => {
    if (e.target.closest('pre')) return;
    if (e.key === 'ArrowRight') step(1);
    if (e.key === 'ArrowLeft') step(-1);
  });
  live.addEventListener('click', () => {
    const target = live.dataset.target;
    close(() => requestAnimationFrame(() => scrollTo(target === '#top' ? 0 : target)));
  });

  return { open, close };
}
