import gsap from 'gsap';
import { env, lerp, clamp } from './env.js';

export function initWork() {
  const list = document.querySelector('.work__list');
  const items = [...list.querySelectorAll('.work__item')];
  const preview = document.querySelector('.work__preview');
  const inner = preview.querySelector('.work__preview-inner');
  const imgs = [...inner.querySelectorAll('img')];
  if (env.touch) return;

  // make sure previews are decoded before the first hover
  imgs.forEach((img) => { img.loading = 'eager'; });

  let active = -1;
  let shown = false;
  const pos = { x: window.innerWidth / 2, y: window.innerHeight / 2, tx: 0, ty: 0, rot: 0 };

  function show(i) {
    if (!shown) {
      shown = true;
      pos.x = pos.tx; pos.y = pos.ty;
      gsap.set(preview, { visibility: 'visible' });
      gsap.to(inner, { scale: 1, duration: 0.7, ease: 'expo.out', overwrite: true });
    }
    if (i === active) return;
    imgs.forEach((img, k) => {
      if (k === i) gsap.to(img, { opacity: 1, scale: 1, duration: 0.7, ease: 'expo.out', overwrite: true });
      else gsap.to(img, { opacity: 0, scale: 1.15, duration: 0.5, ease: 'power2.out', overwrite: true });
    });
    active = i;
  }
  function hide() {
    if (!shown) return;
    shown = false;
    active = -1;
    gsap.to(inner, { scale: 0, duration: 0.5, ease: 'power3.inOut', overwrite: true, onComplete: () => { if (!shown) gsap.set(preview, { visibility: 'hidden' }); } });
  }

  items.forEach((item, i) => item.addEventListener('mouseenter', () => show(i)));
  list.addEventListener('mouseleave', hide);
  window.addEventListener('pointermove', (e) => { pos.tx = e.clientX; pos.ty = e.clientY; }, { passive: true });
  window.addEventListener('scroll', () => { if (shown && !list.matches(':hover')) hide(); }, { passive: true });

  gsap.ticker.add(() => {
    if (!shown && !gsap.isTweening(inner)) return;
    const px = pos.x;
    pos.x = lerp(pos.x, pos.tx, 0.14);
    pos.y = lerp(pos.y, pos.ty, 0.14);
    pos.rot = lerp(pos.rot, clamp((pos.x - px) * 0.35, -12, 12), 0.12);
    preview.style.transform = `translate3d(${pos.x.toFixed(1)}px, ${pos.y.toFixed(1)}px, 0) rotate(${pos.rot.toFixed(2)}deg)`;
  });
}
