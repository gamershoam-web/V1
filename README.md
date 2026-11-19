# Nocturne: learn to build immersive 3D & animated websites

A cinematic, scroll-driven 3D website that teaches the techniques it's built with built with **Three.js**, **GSAP (ScrollTrigger + SplitText)** and **Lenis** smooth scrolling.
All artwork in `public/media/` was rendered procedurally with custom GPU shaders, so you have no stock-image licences to worry about.

## What's inside

| Section | Effect |
| --- | --- |
| Preloader | Real asset-progress counter with a curtain reveal |
| Hero | Live iridescent liquid-chrome blob (vertex-displaced, reacts to the mouse) behind a giant blend-mode wordmark |
| Manifesto | Word-by-word illumination scrubbed by scroll |
| The journey | Pinned 3D fly-through tunnel of floating artworks with chapter titles |
| Process | Diagonal image strip drifting with scroll |
| Effects library | Six effects with hover previews. Each one opens a breakdown drawer with steps, real code and a "See it live" jump |
| Craft | A painting-like landscape that dissolves into ~70k GPU particles |
| Motion | Giant layered "extruded" type whose depth rotates as you scroll |
| Product | Pinned 3D product (procedural model) with an exploded view and three story chapters |
| Interaction | Real-time metaball ink that inverts the headline under your cursor (auto-animates on phones) |
| Curriculum | Animated accordion of learning modules plus counting stats |
| Archive | Slider with clip-path transitions, rolling counter, drag/swipe, keyboard and thumbnails |
| Toolkit / Community | Scroll-velocity marquee of tools, Discord CTA, Instagram, copy-email button, giant footer wordmark |

Every section has a fallback when WebGL isn't available, `prefers-reduced-motion` is respected, and the custom cursor is disabled on touch devices.

## Develop

```bash
npm install
npm run dev       # http://localhost:5173
npm run build     # production build → dist/
npm run preview   # serve the build locally
```

## Make it yours

- **Brand name, copy, links:** everything lives in `index.html` (search for `Nocturne`, `WeenySnore@gmail.com`, `discord.gg` and `instagram.com`).
- **Effect breakdowns:** the `<template data-lesson>` blocks at the bottom of `index.html`. Add a new one plus a matching row in the effects list.
- **Colours and fonts:** CSS variables at the top of `src/styles/main.css` (`--ember`, `--ink`, `--bone`…).
- **Gallery slides:** titles are in `src/modules/archive.js`.
- **Images:** replace files in `public/media/`, keeping the names (`name.webp` for full size, `name-sm.webp` at 720px wide).

After editing, run `npm run build` and commit the updated `dist/` folder.

## Deploy to a VPS (with automatic backup of the old site)

The built site is committed in `dist/`, so the server does **not** need Node.js.

### Option A: run on the VPS (simplest)

```bash
ssh root@YOUR_SERVER_IP
git clone -b ccr-58e2b735-7kuwm8 https://github.com/gamershoam-web/V1.git /opt/nocturne
cd /opt/nocturne
sudo bash deploy/install-on-server.sh /var/www/html     # ← your web root
```

The installer:
1. backs up everything currently in the web root to `/var/backups/website/site-<date>.tar.gz` (verified, with a SHA-256 checksum) **before** touching anything,
2. replaces the old files with the new site and keeps `.well-known/` so HTTPS certificate renewals keep working,
3. fixes ownership and permissions, then reloads nginx or Apache if it finds one.

To update later: `cd /opt/nocturne && git pull && sudo bash deploy/install-on-server.sh /var/www/html`

### Option B: push from your computer

```bash
bash deploy/deploy.sh root@YOUR_SERVER_IP /var/www/html 22
```

### Roll back to the old website

```bash
sudo bash deploy/rollback.sh /var/www/html                       # restores the most recent backup
sudo bash deploy/rollback.sh /var/www/html /var/backups/website/site-20261119-203000.tar.gz
```

The site being replaced is saved first, so a rollback can also be undone.

### Not sure where your web root is?

```bash
grep -R "root " /etc/nginx/sites-enabled/ 2>/dev/null      # nginx
grep -R "DocumentRoot" /etc/apache2/sites-enabled/ 2>/dev/null  # Apache
```

`deploy/nginx-site.conf` is an optional, tuned nginx server block (caching + gzip). An `.htaccess` with the same rules is included for Apache.

## Artwork source

`art/` holds the GLSL shaders that rendered every image in `public/media/`. To re-render one at 2× supersampling with the bundled headless Chromium:

```bash
node art/render.js art/shaders/dunes.frag 1920 1080 dunes.png 2
```
