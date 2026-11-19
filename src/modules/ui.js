import gsap from 'gsap';
import { env, lerp } from './env.js';
import { onScroll, scrollTo, stopScroll, startScroll } from './smooth.js';

export function initHeader() {
  const header = document.getElementById('header');
  const lightSections = [...document.querySelectorAll('[data-header="light"]')];
  const bar = document.querySelector('.scroll-progress span');
  let lastY = 0;

  const update = (y, limit) => {
    header.classList.toggle('is-scrolled', y > 40);
    if (!document.documentElement.classList.contains('menu-open')) {
      if (y > 160 && y > lastY + 2) header.classList.add('is-hidden');
      else if (y < lastY - 2 || y <= 160) header.classList.remove('is-hidden');
    }
    lastY = y;
    const line = header.offsetHeight * 0.5;
    const light = lightSections.some((s) => {
      const r = s.getBoundingClientRect();
      return r.top <= line && r.bottom >= line;
    });
    header.classList.toggle('is-light', light);
    if (bar && limit > 0) bar.style.transform = `scaleX(${Math.min(1, y / limit)})`;
  };
  onScroll((y, v, d, limit) => update(y, limit));
  update(window.scrollY, document.documentElement.scrollHeight - window.innerHeight);
}

export function initMenu() {
  const html = document.documentElement;
  const burger = document.querySelector('.burger');
  const menu = document.getElementById('menu');
  const set = (open) => {
    html.classList.toggle('menu-open', open);
    burger.setAttribute('aria-expanded', String(open));
    burger.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    menu.setAttribute('aria-hidden', String(!open));
    if (open) stopScroll(); else startScroll();
  };
  burger.addEventListener('click', () => set(!html.classList.contains('menu-open')));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && html.classList.contains('menu-open')) set(false); });
  return { close: () => { if (html.classList.contains('menu-open')) set(false); } };
}

export function initAnchors(menu, archive) {
  document.querySelectorAll('[data-scroll-to]').forEach((a) => {
    a.addEventListener('click', (e) => {
      const href = a.getAttribute('href');
      if (!href || !href.startsWith('#')) return;
      e.preventDefault();
      menu.close();
      const slide = a.dataset.slide;
      if (slide !== undefined && archive) archive.goTo(Number(slide));
      const target = href === '#top' ? document.body : document.querySelector(href);
      // wait a frame so a closing menu releases the scroll lock first
      requestAnimationFrame(() => scrollTo(href === '#top' ? 0 : target));
    });
  });
}

export function initCursor() {
  if (env.touch) return;
  const root = document.querySelector('.cursor');
  const dot = root.querySelector('.cursor__dot');
  const ring = root.querySelector('.cursor__ring');
  const label = root.querySelector('.cursor__label');
  const p = { x: -100, y: -100, rx: -100, ry: -100 };
  let seen = false;
  window.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    p.x = e.clientX; p.y = e.clientY;
    if (!seen) { seen = true; p.rx = p.x; p.ry = p.y; root.classList.remove('is-hidden'); }
  }, { passive: true });
  document.addEventListener('mouseleave', () => root.classList.add('is-hidden'));
  document.addEventListener('mouseenter', () => root.classList.remove('is-hidden'));

  document.addEventListener('mouseover', (e) => {
    const t = e.target.closest('a, button, summary, [data-cursor], [data-cursor-hide]');
    root.classList.remove('is-hover', 'has-label', 'is-hidden');
    if (!t) return;
    if (t.hasAttribute('data-cursor-hide')) { root.classList.add('is-hidden'); return; }
    if (t.dataset.cursor) { label.textContent = t.dataset.cursor; root.classList.add('has-label'); }
    else root.classList.add('is-hover');
  });

  gsap.ticker.add(() => {
    p.rx = lerp(p.rx, p.x, 0.18);
    p.ry = lerp(p.ry, p.y, 0.18);
    dot.style.transform = `translate3d(${p.x}px, ${p.y}px, 0)`;
    ring.style.transform = `translate3d(${p.rx.toFixed(1)}px, ${p.ry.toFixed(1)}px, 0)`;
  });
}

export function initMagnetic() {
  if (env.touch) return;
  document.querySelectorAll('[data-magnetic]').forEach((el) => {
    const strength = el.classList.contains('contact__cta') ? 0.35 : 0.25;
    const xTo = gsap.quickTo(el, 'x', { duration: 0.6, ease: 'power3.out' });
    const yTo = gsap.quickTo(el, 'y', { duration: 0.6, ease: 'power3.out' });
    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect();
      xTo((e.clientX - (r.left + r.width / 2)) * strength);
      yTo((e.clientY - (r.top + r.height / 2)) * strength);
    });
    el.addEventListener('pointerleave', () => {
      gsap.to(el, { x: 0, y: 0, duration: 1, ease: 'elastic.out(1, 0.4)', overwrite: true });
    });
  });
}

export function initClock() {
  const els = document.querySelectorAll('.js-clock');
  let fmt;
  try {
    fmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Lisbon', hour: '2-digit', minute: '2-digit' });
  } catch (e) {
    fmt = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' });
  }
  const tick = () => { const t = fmt.format(new Date()); els.forEach((el) => { el.textContent = t; }); };
  tick();
  setInterval(tick, 15000);
}

export function initCopy() {
  document.querySelectorAll('[data-copy]').forEach((btn) => {
    const original = btn.textContent;
    btn.addEventListener('click', async () => {
      const text = btn.dataset.copy;
      let ok = false;
      try { await navigator.clipboard.writeText(text); ok = true; } catch (e) {
        const ta = document.createElement('textarea');
        ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select();
        try { ok = document.execCommand('copy'); } catch (err) { ok = false; }
        ta.remove();
      }
      btn.textContent = ok ? 'Copied ✓' : text;
      btn.classList.toggle('is-done', ok);
      setTimeout(() => { btn.textContent = original; btn.classList.remove('is-done'); }, 2200);
    });
  });
}
