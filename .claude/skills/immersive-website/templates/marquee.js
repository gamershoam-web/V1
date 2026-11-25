import gsap from 'gsap';
import { env, watchVisibility } from './env.js';
import { onScroll } from './smooth.js';

export function initMarquee() {
  const wrap = document.querySelector('.marquee');
  const first = wrap.querySelector('.marquee__track');
  // clone enough copies to cover wide screens seamlessly
  const copies = [first];
  for (let i = 0; i < 2; i++) {
    const c = first.cloneNode(true);
    c.setAttribute('aria-hidden', 'true');
    wrap.appendChild(c);
    copies.push(c);
  }
  let x = 0;
  let boost = 0;
  let dir = 1;
  let visible = false;
  watchVisibility(wrap, (v) => { visible = v; });
  onScroll((y, velocity, direction) => {
    boost = Math.min(Math.abs(velocity) * 0.6, 30);
    dir = direction >= 0 ? 1 : -1;
  });
  if (env.reduced) return;
  gsap.ticker.add((t, delta) => {
    if (!visible) return;
    const w = first.offsetWidth;
    if (!w) return;
    const dt = Math.min(delta / 1000, 0.05);
    boost *= 0.92;
    x -= (70 + boost * 60) * dt * dir;
    if (x <= -w) x += w;
    if (x > 0) x -= w;
    const tx = `translate3d(${x.toFixed(2)}px,0,0)`;
    copies.forEach((c) => { c.style.transform = tx; });
  });
}
