import gsap from 'gsap';

export const SLIDES = [
  { img: 'chrome', name: 'Iridescent Loop', cat: 'Real-time shader · 2026' },
  { img: 'glass', name: 'Refraction Study', cat: 'Lookdev · 2026' },
  { img: 'eclipse', name: 'Totality', cat: 'Album world · 2025' },
  { img: 'monolith', name: 'Signal', cat: 'Brand film · 2025' },
  { img: 'dunes', name: 'Ember Dunes', cat: 'Procedural terrain · 2024' },
  { img: 'arches', name: 'Arcade at Noon', cat: 'Architectural light · 2026' },
  { img: 'spheres', name: 'Still Life No. 4', cat: 'Studio composition · 2025' },
  { img: 'ripple', name: 'Liquid Gold', cat: 'Material study · 2025' },
  { img: 'topo', name: 'Terrain Lines', cat: 'Data cartography · 2024' },
  { img: 'warp', name: 'Pigment Drift', cat: 'Generative art · 2024' },
  { img: 'ridges', name: 'Night Ridges', cat: 'Matte painting · 2026' },
];

const pad = (n) => String(n).padStart(2, '0');

export function initArchive() {
  const root = document.querySelector('.slider');
  const frame = root.querySelector('.slider__frame');
  const holder = root.querySelector('.slider__slides');
  const thumbsEl = root.querySelector('.slider__thumbs');
  const cur = root.querySelector('.slider__cur');
  const nameEl = root.querySelector('.slider__name');
  const catEl = root.querySelector('.slider__cat');
  root.querySelector('.slider__total').textContent = pad(SLIDES.length);

  const slides = SLIDES.map((s, i) => {
    const el = document.createElement('div');
    el.className = 'slide' + (i === 0 ? ' is-active' : '');
    el.setAttribute('role', 'group');
    el.setAttribute('aria-roledescription', 'slide');
    el.setAttribute('aria-label', `${i + 1} of ${SLIDES.length}: ${s.name}`);
    el.innerHTML = `<img src="/media/${s.img}.webp" alt="${s.name} — ${s.cat}" loading="${i < 2 ? 'eager' : 'lazy'}" decoding="async" draggable="false" />`;
    holder.appendChild(el);
    return el;
  });
  const thumbs = SLIDES.map((s, i) => {
    const b = document.createElement('button');
    b.className = 'slider__thumb' + (i === 0 ? ' is-active' : '');
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-label', `Show ${s.name}`);
    b.setAttribute('aria-selected', i === 0 ? 'true' : 'false');
    b.innerHTML = `<img src="/media/${s.img}-sm.webp" alt="" loading="lazy" draggable="false" />`;
    b.addEventListener('click', () => goTo(i));
    thumbsEl.appendChild(b);
    return b;
  });

  let index = 0;
  let busy = false;
  let queued = null;

  function goTo(next, forcedDir) {
    next = (next + SLIDES.length) % SLIDES.length;
    if (next === index) return;
    if (busy) { queued = next; return; }
    busy = true;
    const dir = forcedDir || (next > index ? 1 : -1);
    const from = slides[index];
    const to = slides[next];
    const fromImg = from.querySelector('img');
    const toImg = to.querySelector('img');
    to.classList.add('is-active');
    gsap.set(to, { zIndex: 2, clipPath: dir > 0 ? 'inset(0% 0% 0% 100%)' : 'inset(0% 100% 0% 0%)' });
    gsap.set(from, { zIndex: 1 });

    const tl = gsap.timeline({
      defaults: { ease: 'expo.inOut' },
      onComplete: () => {
        from.classList.remove('is-active');
        gsap.set(from, { clearProps: 'zIndex,clipPath' });
        gsap.set(fromImg, { clearProps: 'transform' });
        busy = false;
        if (queued !== null) { const q = queued; queued = null; goTo(q); }
      },
    });
    tl.to(to, { clipPath: 'inset(0% 0% 0% 0%)', duration: 1.15 }, 0)
      .fromTo(toImg, { scale: 1.3, xPercent: dir * 12 }, { scale: 1, xPercent: 0, duration: 1.4, ease: 'expo.out' }, 0.1)
      .to(fromImg, { xPercent: -dir * 18, scale: 1.08, duration: 1.15 }, 0);

    // counter roll
    const oldNum = cur.querySelector('span');
    const newNum = document.createElement('span');
    newNum.textContent = pad(next + 1);
    gsap.set(newNum, { position: 'absolute', left: 0, top: 0, yPercent: dir * 100 });
    cur.style.position = 'relative';
    cur.appendChild(newNum);
    gsap.to(oldNum, { yPercent: -dir * 100, duration: 0.9, ease: 'expo.inOut', onComplete: () => oldNum.remove() });
    gsap.to(newNum, { yPercent: 0, duration: 0.9, ease: 'expo.inOut', onComplete: () => gsap.set(newNum, { clearProps: 'position,left,top' }) });

    // caption
    gsap.to([nameEl, catEl], { opacity: 0, y: -12, duration: 0.35, ease: 'power2.in', onComplete: () => {
      nameEl.textContent = SLIDES[next].name;
      catEl.textContent = SLIDES[next].cat;
      gsap.fromTo([nameEl, catEl], { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.8, ease: 'expo.out', stagger: 0.06 });
    } });

    thumbs[index].classList.remove('is-active');
    thumbs[index].setAttribute('aria-selected', 'false');
    thumbs[next].classList.add('is-active');
    thumbs[next].setAttribute('aria-selected', 'true');
    index = next;
  }

  root.querySelectorAll('.slider__btn').forEach((b) => b.addEventListener('click', () => goTo(index + Number(b.dataset.dir), Number(b.dataset.dir))));
  root.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); goTo(index + 1, 1); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); goTo(index - 1, -1); }
  });

  // drag / swipe
  let startX = null, startY = 0, pid = null;
  frame.addEventListener('pointerdown', (e) => { startX = e.clientX; startY = e.clientY; pid = e.pointerId; });
  window.addEventListener('pointerup', (e) => {
    if (startX === null || e.pointerId !== pid) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    startX = null;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) goTo(index + (dx < 0 ? 1 : -1), dx < 0 ? 1 : -1);
  });
  window.addEventListener('pointercancel', () => { startX = null; });

  return { goTo: (i) => goTo(i) };
}
