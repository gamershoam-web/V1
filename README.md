# Abyssal Pathtracer

A Minecraft shader pack for **Iris** (1.6+) and **OptiFine** (HD U H-series, 1.17+), built around physically based light transport.

| Feature | Implementation |
|---|---|
| Shadows | 16384² atlas with two cascades (near ±48 blocks, far ±`shadowDistance`). PCSS uses a physically sized sun (0.267°): blocker search, penumbra `w = 2·d_blocker·tan θ`, then a Vogel-disk PCF. Screen-space ray-marched contact shadows, colored translucent shadows, and analytic water caustics stored in `shadowcolor0`. |
| Global illumination | A world-space voxel volume (512×256×512 by default) is rasterized in the shadow geometry shader. A DDA path tracer runs up to 8 cosine-weighted bounces with sun/moon next-event estimation through the shadow map, emissive voxels, sky radiance when a ray escapes, and Russian roulette. |
| Denoising | SVGF: bilinear temporal reprojection with depth and normal rejection, luminance moments and variance, then 4 edge-avoiding à-trous passes (step 1, 2, 4, 8). |
| Atmosphere | Single scattering (Rayleigh, Mie, ozone), calibrated for multiple scattering. Kasten–Young air mass for sunlight color. Limb-darkened sun disk, shaded moon, stars. |
| Volumetrics | 256-step ray march with height fog, animated density noise and aerial Rayleigh haze. Integration is energy-conserving (Hillaire). A dual-lobe phase function plus a shadow-map test at every step produce crepuscular rays. Underwater scattering also picks up the caustics. |
| Reflections | Three layers: screen-space trace with binary refinement → voxel ray tracing for off-screen geometry → physical sky. Glossy reflections sample GGX VNDF, and TAA resolves the noise. |
| Water | Wave-sum surface, Snell refraction offset, Beer–Lambert absorption, single-scatter in-scatter, Fresnel, total internal reflection when viewed from below, GGX sun glint. Glass and ice get a second refraction layer. |
| Materials | Full LabPBR 1.3: smoothness, F0, the 230–237 hardcoded metals using complex-IOR Fresnel, porosity, SSS, emission. 512-step POM with per-tile wrapping, linear refinement and 128-step soft self-shadowing. Geometric specular AA (Tokuyoshi–Kaplanyan). Rain wetness and puddles. |
| SSS | Shadow-map thickness, Beer–Lambert transmission and a forward Henyey–Greenstein lobe for leaves, plants and LabPBR SSS materials. |
| Post | TAA (Catmull-Rom history, YCoCg variance clipping, luminance weighting); log-average auto exposure; bloom as a sum of 7 Gaussian mip tiles approximating a lens point-spread function, merged energy-conservingly; ACES filmic (RRT+ODT fit) with grading done in AP1. |

## Installation

1. Zip the `shaders/` folder (or the whole repository; the loaders look for `shaders/` at the root).
2. Put the zip in `.minecraft/shaderpacks/`.
3. Select it under *Video Settings → Shader Packs*. Pick a profile on the main options screen.

A LabPBR resource pack (with `_n` and `_s` textures) is needed for normal maps, POM and specular materials. Without one, everything falls back to flat, rough, non-metal materials. Emissive blocks still glow through hardcoded emission.

## Profiles and hardware

"Zero performance compromise" isn't physically possible at these settings. The **Unrestricted** default is the exact spec of this pack and needs a flagship GPU:

| Profile | Shadow atlas | GI | Volumetrics | POM | Approx. shadow VRAM |
|---|---|---|---|---|---|
| Unrestricted (default) | 16384² | 8 bounces, 512×256×512 voxels | 256 steps | 512 / 128 shadow | ~4 GB |
| Extreme | 8192² | 4 bounces, 256³ | 128 | 256 / 64 | ~1 GB |
| High | 4096² | 2 bounces, 256×128×256 | 64 | 128 / 32 | ~256 MB |
| Balanced | 4096² | 1 bounce, 128³ | 32 | 64 | ~256 MB |

The voxel volume shares the shadow atlas: its height is clamped automatically when a smaller atlas can't hold every slice.

## Pipeline

```
shadow (vsh/gsh/fsh)  cascade 0 + cascade 1 rasterisation, terrain voxelisation, caustics
gbuffers_*            albedo/AO, oct normals, LabPBR specular, lightmap/material/POM shadow
gbuffers_water        forward-lit translucents (premultiplied) + surface info
deferred              voxel path traced GI (raw)
deferred1             SVGF temporal accumulation + variance
deferred2..5          SVGF à-trous wavelet (1, 2, 4, 8)
deferred6             opaque lighting resolve + sky
composite             volumetric fog / atmosphere / underwater ray march
composite1            water & glass refraction/absorption, reflections, fog application
composite2            TAA + auto exposure
composite3..5         bloom downsample + separable blur
final                 bloom merge, exposure, ACES filmic, sRGB, dither
```

Buffer layout: [`shaders/lib/buffers.glsl`](shaders/lib/buffers.glsl). Shadow atlas layout: [`shaders/lib/shadowspace.glsl`](shaders/lib/shadowspace.glsl) and [`shaders/lib/voxel.glsl`](shaders/lib/voxel.glsl).

## Source layout

```
shaders/
  shaders.properties  block.properties  lang/en_us.lang
  lib/        settings (every option), shadows/PCSS, voxel DDA, PTGI, atmosphere,
              volumetrics, BRDF/LabPBR, POM, water, reflections, tonemap, ...
  programs/   the real implementation of every stage
  *.vsh/*.gsh/*.fsh, world-1/, world1/   thin generated entry points per dimension
tools/
  generate_wrappers.py   regenerates the entry points (run after adding a program)
  validate.py            offline compile + link check of every stage via glslang
```

## Development

```
python3 tools/generate_wrappers.py
python3 tools/validate.py            # needs glslangValidator (apt install glslang-tools)
```

`validate.py` resolves `#include` the same way the loaders do, injects the loader macros (`MC_RENDER_STAGE_*`, …), compiles all 207 stages for the overworld, Nether and End, then links each program to check that interfaces match from vsh to gsh to fsh.

## Known limitations

- The pack passes the glslang compile and link checks, but no in-game test session has been run against every driver. Iris rewrites sources, and vendor GLSL compilers can be stricter or more lenient than glslang.
- Non-full blocks (slabs, stairs, walls) are voxelized as full cells for GI. Thin blocks (fences, doors, panes, plants, rails…) are excluded from the volume (`block.10020`).
- Small emitters fill a whole voxel cell, so their radiance is scaled down to their real flame area. A vanilla lightmap term (`LIGHTMAP_BLOCKLIGHT`) reduces noise next to them.
- Entities don't occlude or bounce GI because only terrain is voxelized. They still receive GI and cast shadows.
