---
name: immersive-website
description: Build award-style immersive 3D / WebGL scroll websites (Three.js + GSAP ScrollTrigger + Lenis) with liquid-chrome heroes, 3D image tunnels, particle dissolves, layered kinetic type, scroll-driven 3D products, metaball cursor effects, shader-rendered artwork, and VPS deployment with automatic backups. Use when the user asks for a "3D website", "animated/immersive website", "website like Awwwards / animation library references", scroll animation effects, or wants such a site deployed to a server.
---

# Immersive 3D website builder

Produces a polished, cinematic, scroll-driven site like Nocturne. Ready-made, tested modules live in `templates/`; reuse them instead of rewriting from scratch.

## Workflow

1. **Understand the brief.** If the user gives reference videos or images, extract frames with `ffmpeg -i in.mp4 -vf "fps=2,scale=270:-1,tile=8x2" sheet.png` and look at them. Pick a theme yourself if they didn't (default: dark ink `#0b0b0c`, bone `#ece8e1`, one accent such as ember `#ff5a1f`). Build an original brand; never clone a real site or brand.
2. **Scaffold:**
   ```bash
   npm init -y   # set "type": "module", scripts: dev/build/preview = vite
   npm i three gsap lenis @fontsource-variable/archivo @fontsource/instrument-serif @fontsource-variable/jetbrains-mono
   npm i -D vite
   ```
   Copy `templates/*.js` into `src/modules/`, `templates/main.css` into `src/styles/`, and `templates/vite.config.js` into the project root. Fonts: Archivo variable (`wdth.css`, use `font-stretch: 108–125%` for heavy display type), Instrument Serif italic for accent words, JetBrains Mono for small uppercase labels.
3. **Artwork.** Use an image generator if one is available. Otherwise render original art with shaders: `node scripts/render.js scripts/shaders/<name>.frag 1600 1000 out.png 2`. The included shaders are chrome, glass, eclipse, monolith, dunes, arches, spheres, ripple, topo, warp and ridges; copy one and change it for new scenes. Convert to WebP (full size plus a 720px `-sm` variant) with PIL, adding ~2 levels of noise to avoid banding. Keep files in `public/media/`.
4. **Compose sections** (see `references/sections.md`) in the order: loader → hero → manifesto → pinned tunnel → light strip section → list with hover preview → particle dissolve → kinetic type → pinned 3D product → metaball interaction → accordion + stats → slider → marquee → contact + giant footer wordmark. Alternate dark and light sections (`data-header="light"` flips the header colour).
5. **Boot order** (`main.js`): `initSmooth()` + `stopScroll()` → await fonts → `fitText` for giant wordmarks → init sections **in DOM order** (pins depend on it) → `runLoader(tasks)` → `startScroll()`, `ScrollTrigger.refresh()`, `hero.intro()`. Wrap each init in try/catch so one failure never blanks the page.
6. **Verify with Playwright** (Chromium plus SwiftShader WebGL works headless): screenshot every section at 1440×900 and on an iPhone 13. Fail on any `pageerror`. Check overlaps between 3D objects and headlines, text overflow on phones, and that pins, the menu, slider, dialogs and anchors work. Note that lerped scenes lag in software rendering.
7. **Deploy** (see `references/deploy.md`): commit `dist/` and run `scripts/install-on-server.sh <web_root>` on the VPS. It backs up the old site before replacing it. Find the real web root from the nginx `root` / Apache `DocumentRoot` first.

## Quality rules (non-negotiable)

- One WebGL renderer per section, rendering **only while visible** (IntersectionObserver). Cap DPR at 1.75 (1.5 on mobile) and reduce geometry and particle counts on mobile.
- Every WebGL section has a static `<img>` fallback (`html.no-webgl`), and `prefers-reduced-motion` disables smooth scroll and intros.
- Custom cursor only on `(hover: hover)`; use `touch-action: pan-y` on interactive stages, and touch fallbacks (inline thumbnails, auto-animating effects).
- Make all scroll motion scrubbed or lerped: never jumpy, never scroll-jacking for longer than ~3.5 viewport heights per pin.
- Use real content only. No fake testimonials, client logos or invented statistics; stats must describe true facts about the site.
- Semantics: skip link, focus-visible styles, `aria-label`s, a native `<dialog>` for drawers (`data-lenis-prevent` on its scroll area), alt text.
- `ScrollTrigger.config({ ignoreMobileResize: true })`, use `svh` heights, and `history.scrollRestoration = 'manual'`.
- Never print secrets. If SSH from the sandbox is blocked, give the user copy-paste commands instead of tunnelling around the network policy.
