# Orbit Network Hub

A 3D space-themed gaming portal for the **Orbitnetwork.net** Minecraft server, with 12 playable arcade games.

- **Opening sequence**: a cinematic intro (logo assembles, title flies in, hyperspace jump into the hub). Tap or press any key to skip.
- **Animation modes**: Full or Calm (Command Deck > Settings). *Auto* picks Calm when the device asks for reduced motion
  (for example Windows with "Animation effects" turned off). Calm keeps everything animated but replaces the hyperspace
  jump, flashes, camera sweeps, parallax, screen shake and 3D tilt with gentle fades.
- **3D hub** (Three.js): realistic space generated on the GPU (Milky Way sky, sun with lens flare, Earth-like world with clouds and atmosphere, ringed gas giant, ice giant, asteroid belt) plus a wheel space station and the Minecraft voxel planet. Drag to orbit, scroll or pinch to zoom, click a planet to fly to it.
- **HUD**: glassmorphism UI, sound toggle, quick-navigation dock, XP/level and high scores saved in `localStorage`.
- **Minecraft portal**: live status from the mcsrvstat.us API, one-click IP copy, game-mode tabs, Java/Bedrock join guide and a Discord link.
- **Full games** (Arcade Sector > Full Games):
  - *Starfighter: Void Siege* — 3D space combat defending Orbit Station over 10 waves with capital-ship bosses, missiles and hangar upgrades.
  - *Galactic Conquest* — real-time planet-capture strategy against AI empires across a 12-sector campaign.
  - *Orbit Colony* — persistent mining-colony builder with research, trade, expeditions, events, prestige warps and offline progress. The colony is a live 3D scene (`js/games/big/colony3d.js`): every building stands on the asteroid's levelled top, drones fly to a tumbling rock field, the shipyard is an orbital dock; drag to look around, tap the rock to mine (2D view without WebGL).
- **Mini games**: AstroWordle, Nebula Sketch, Asteroid Dodger, Black Hole Pong, Laser Typing Defense, Quantum 2048, Lunar Lander, Orbital Brick Breaker, Starlight Memory Matrix, Cosmic Minesweeper, Galactic Invaders Blitz and Wormhole Trivia. Each game is loaded only when opened, and the 3D render loop pauses while a game is open.
- **Icons**: a custom animated SVG icon set (`site/js/icons.js`); each game icon is tinted with its card's accent colour.
- **3D card art** (`site/js/art3d.js`): in the Arcade Sector the full-game covers are live 3D scenes (the fighter over a planet with raiders and the station, fleets flying between faction worlds, the mining colony under a ringed giant) that tilt toward the cursor, and every game icon is a small spinning glossy 3D model (it spins faster on hover). The Command Deck list and the game header use still 3D renders of the same icons. One shared WebGL renderer draws every view, only while it is on screen and at about 30 fps. Scenes are built one per frame with shaders compiled in the background, and on phones the hub pauses while the arcade is open. Without WebGL (or if a phone drops the graphics context, or a frame comes back blank) the SVG art is shown instead, and the 3D rebuilds itself when the context returns. Card text blends with each card's colour and glides in as the card scrolls into view.
- **Pilot accounts**: sign up / sign in from the HUD (or the cloud button in any game's header) to save XP, best scores and every game's progress to an account, then continue on any device. Progress keeps saving locally while playing and is uploaded a few seconds later; XP and best scores merge by taking the highest value, each game keeps its newest save, and if a device already has different progress the player chooses which to keep. Signing out clears the device back to a guest profile. Players are greeted with an animated "Welcome back, *name*" (guests get a "Welcome, pilot" card with a sign-in button). Accounts run on a small Python service (`server/orbit_api.py`, standard library only) behind nginx: scrypt-hashed passwords, HttpOnly session cookies, same-origin checks, and rate limits per IP and per account. Players can rename themselves and delete their account.
- **Performance**: the hub scene is built in small steps across frames (the sky one cube face at a time, each step waiting for the GPU to finish the last), shaders are compiled before the first frame, and nothing is drawn while the intro covers the screen. The intro's loading bar waits (up to 7.5 s) for the scene to be ready. Phones, tablets and low-power devices get **lite rendering** (class `lite` on `<html>`): no live backdrop blurs over the 3D scene, no SVG filters while text animates, lighter textures and resolution, no bloom. Add `?lite` to the URL to try it on a desktop.
- **Audio**: all sound effects are synthesized with the Web Audio API (no audio files).
- **Fonts**: self-hosted in `site/fonts` (no third-party requests): Exo 2 for the interface and Inter for body text.
- **Cursive wordmarks**: the logo, intro title and panel titles are drawn in the Sacramento script as animated SVG: wavy coloured lines weave together into the word, a neon pen writes it, then the ink glows in. Letter shapes are converted to SVG paths at build time (`scripts/build-wordmarks.mjs`); add a new text to `TEXTS` there and run `npm run build:wordmarks`.

## Customize

Edit `site/js/config.js`:

| Setting | Purpose |
| --- | --- |
| `serverIp` | Address shown and copied by the Join buttons |
| `bedrockPort` | Port shown in the Bedrock join guide |
| `discordUrl` | Discord invite used by every Discord button |

Game-mode descriptions are in `site/index.html` (search for `mode-card`).

## Structure

```
site/                 static site served by nginx (no build needed on the server)
  index.html
  css/app.css         custom sci-fi component styles
  css/tailwind.css    generated by Tailwind (do not edit by hand)
  vendor/             three.js
  fonts/              self-hosted Orbitron + Inter
  js/main.js          app bootstrap, navigation, HUD
  js/intro.js         opening sequence
  js/icons.js         SVG icon set (game icons, 2048 artwork, UI icons)
  js/scene.js         Three.js scene and camera rig
  js/minecraft.js     server status + IP copy
  js/arcade.js        arcade engine (game modal, scoring, XP)
  js/account.js       accounts + cloud save sync (merge rules live here)
  js/account-ui.js    HUD account chip, sign-in panel, game header cloud button, welcome greeting
  js/games/*.js       mini games; registry (full + mini) in games/index.js
  js/games/big/       full games: starfighter.js, conquest.js, colony.js
  js/space-assets.js  procedural sky, planets, sun, asteroids (shared by hub and Starfighter)
  js/covers.js        animated SVG cover art for the full games (fallback for the 3D covers)
  js/art3d.js         live 3D covers and icons (one shared renderer; models in games/big/models.js)
  js/wordmark.js      animated cursive wordmarks (paths in js/wordmark-data.js, generated)
src/tailwind.css      Tailwind entry file
server/orbit_api.py   account API (sign up, sign in, cloud saves; SQLite; Python standard library)
server/test_orbit_api.py  API tests: python3 -m unittest server/test_orbit_api.py
deploy/               deploy script, nginx config (+ shared locations snippet), systemd unit for the API
```

## Develop

```bash
npm install
npm run build      # copies three.js (+ add-ons) and fonts, generates wordmarks, rebuilds css/tailwind.css
npm run serve      # http://localhost:8080 (static only: the sign-in button stays hidden)
# Site + accounts on one origin:
python3 server/orbit_api.py --no-proxy --port 8080 --db /tmp/hub.db --static site
```

Re-run `npm run build:css` whenever you add Tailwind classes to HTML or JS. The site uses ES modules, so open it through a web server, not `file://`.

## Deploy

On the VPS (as root), run:

```bash
curl -fsSL https://raw.githubusercontent.com/gamershoam-web/V1/ccr-149e134a-e2c045/deploy/deploy.sh | bash
```

This installs nginx and the account API (systemd service `orbit-hub-api`, accounts database in
`/var/lib/orbit-hub/hub.db`, only reachable through nginx at `/api/`). Re-run it to update.

**HTTPS (recommended, the site has passwords now):** point a domain at the server (DNS `A` record, for example
`hub.orbitnetwork.net` -> the server's IP), then run the deploy once with the domain:

```bash
curl -fsSL https://raw.githubusercontent.com/gamershoam-web/V1/ccr-149e134a-e2c045/deploy/deploy.sh | DOMAIN=hub.orbitnetwork.net bash
```

It gets a free Let's Encrypt certificate (renewed automatically), serves the site on `https://` and sends the domain's
`http://` visitors there. The domain is remembered for later deploys. Until then the sign-in panel warns players that
the connection isn't encrypted. Back up `/var/lib/orbit-hub/hub.db` to keep accounts safe; check the API with
`systemctl status orbit-hub-api` and `journalctl -u orbit-hub-api`.

## Troubleshooting

Open the site with `?diag` (for example `http://your-server/?diag`) to show a diagnostics panel: build number,
animation mode, whether the device asks for reduced motion, WebGL status and scene build time, lite or full rendering,
fonts and browser details.

