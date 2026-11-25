# Section recipes (template module → technique)

| Effect | Module | Core idea |
| --- | --- | --- |
| Preloader | `loader.js` | Counter = min(real asset progress, elapsed/1.5s); masked words; curtain `clip-path: inset(0 0 100% 0)` |
| Liquid chrome hero | `hero.js` | Icosahedron (merged verts) displaced along the normal by simplex noise in `onBeforeCompile`; normals rebuilt from two displaced neighbours; MeshPhysical metal + iridescence; PMREM env from emissive panels; wordmark with `mix-blend-mode: difference` |
| Word illumination | `reveals.js` | SplitText words, opacity 0.13 → 1, scrub |
| 3D tunnel | `journey.js` | Planes on a golden-angle spiral in z; pinned ScrollTrigger progress → lerped camera z; scene fog; fade planes near the lens; three overlay phrases on bell curves |
| Diagonal strip | `reveals.js` | Rotated (-7°) flex track, x scrubbed, inner image parallax |
| Hover preview list | `work.js` | Fixed preview follows the cursor with lerp; rotation from velocity; crossfade images; inline thumbs on touch |
| Particle dissolve | `dissolve.js` | Downscale an image on a canvas → one point per pixel (cover crop); delay = x·0.55 + rand; noise drift; crisp `<img>` on top fades out at the start |
| Kinetic layered type | `kinetic.js` | N stacked spans; alternate accent and background colours; translate depth·step along an angle scrubbed by scroll |
| 3D product | `product.js` | LatheGeometry from SplineCurve, grille CanvasTexture, torus rings; RoomEnvironment; exploded view via smoothstep window; radial-gradient contact shadow; step text swaps per third |
| Metaball ink | `fluid.js` | Raw WebGL2 fullscreen triangle; Σ r²/d², threshold with fwidth; trail of shrinking blobs; idle Lissajous path; canvas `mix-blend-mode: difference` |
| Accordion / stats | `reveals.js` | `<details>` with GSAP height animation; counters on enter |
| Slider | `archive.js` | Clip-path wipe, image scale/x parallax, rolling counter, drag / keys / thumbs |
| Marquee | `marquee.js` | Cloned tracks, speed boosted by Lenis velocity, flips with direction |
| Breakdown drawer | `lessons.js` | `<dialog>` + `<template data-lesson>`, GSAP slide-in, Esc / scrim close, prev/next, "See it live" |
| UI | `ui.js` | Hide-on-scroll header, light-section detection via rects, burger menu, magnetic buttons, cursor with labels (`data-cursor="View"`), copy-to-clipboard |

Typography scale: display `clamp(48px, 8.4vw, 150px)`, letter-spacing -0.045em, line-height 0.9; giant wordmarks sized by `fitText()` to exactly the container width.
