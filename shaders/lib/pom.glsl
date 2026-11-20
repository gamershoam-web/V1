#ifndef POM_GLSL
#define POM_GLSL
// -------------------------------------------------------------------------------------
//  Parallax Occlusion Mapping on the texture atlas (LabPBR height in normals.a) with
//  per-tile wrapping, linear-interpolated intersection refinement and ray-marched
//  self-shadowing toward the sun.
// -------------------------------------------------------------------------------------

vec2 tileWrap(vec2 local, vec4 tile) { return fract(local) * tile.zw + tile.xy; }

float sampleHeight(sampler2D heightTex, vec2 local, vec4 tile, vec2 dx, vec2 dy) {
    return textureGrad(heightTex, tileWrap(local, tile), dx, dy).a;
}

// tile = (min.xy, size.zw) of the atlas sprite, viewTS = tangent-space view vector
// (pointing from the eye to the surface). Returns parallax-shifted local coords.
vec2 parallaxOcclusion(sampler2D heightTex, vec2 local, vec4 tile, vec3 viewTS,
                       vec2 dx, vec2 dy, float fade, out vec3 hitTS) {
    hitTS = vec3(local, 1.0);
    if (fade <= 0.0) return local;
    float h0 = sampleHeight(heightTex, local, tile, dx, dy);
    if (h0 >= 0.999) return local;

    float steps = mix(float(POM_STEPS), float(POM_STEPS) * 0.25, saturate(abs(viewTS.z)));
    int   n = int(steps);
    float layer = 1.0 / steps;
    vec2  shift = viewTS.xy / max(-viewTS.z, 0.05) * POM_DEPTH * fade;
    vec2  dUV = shift * layer;

    vec2  p = local;
    float rayH = 1.0;
    float h = h0;
    float prevH = h0, prevRay = 1.0;
    vec2  prevP = p;
    for (int i = 0; i < n; i++) {
        if (h >= rayH) break;
        prevP = p; prevRay = rayH; prevH = h;
        p += dUV;
        rayH -= layer;
        h = sampleHeight(heightTex, p, tile, dx, dy);
    }
    // linear refinement between the last two layers
    float after  = h - rayH;
    float before = prevH - prevRay;
    float w = saturate(after / (after - before + 1e-6));
    p = mix(p, prevP, w);
    rayH = mix(rayH, prevRay, w);
    hitTS = vec3(p, rayH);
    return p;
}

// soft self-shadowing: march from the POM hit point toward the light in tangent space
float parallaxShadow(sampler2D heightTex, vec3 hitTS, vec4 tile, vec3 lightTS,
                     vec2 dx, vec2 dy, float fade) {
#ifdef POM_SHADOWS
    if (fade <= 0.0 || lightTS.z <= 0.0) return 1.0;
    float startH = hitTS.z;
    if (startH >= 0.999) return 1.0;
    float layer = (1.0 - startH) / float(POM_SHADOW_STEPS);
    vec2  dUV = lightTS.xy / lightTS.z * POM_DEPTH * fade * layer;
    vec2  p = hitTS.xy;
    float rayH = startH;
    float shadow = 0.0;
    for (int i = 0; i < POM_SHADOW_STEPS; i++) {
        p += dUV;
        rayH += layer;
        if (rayH >= 1.0) break;
        float h = sampleHeight(heightTex, p, tile, dx, dy);
        // penumbra grows with the distance travelled along the ray
        shadow = max(shadow, (h - rayH) * (1.0 - float(i) / float(POM_SHADOW_STEPS)) * 24.0);
        if (shadow >= 1.0) break;
    }
    return 1.0 - saturate(shadow);
#else
    return 1.0;
#endif
}

#endif
