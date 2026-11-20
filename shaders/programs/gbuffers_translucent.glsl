// =====================================================================================
//  TRANSLUCENT FORWARD PASS  (water, stained glass, ice, particles, weather, glint)
//  colortex4  : premultiplied forward-lit colour + coverage (blended "over")
//  colortex11 : octahedral surface normal | material id | smoothness (water & glass)
//  Water itself writes zero coverage: its look (refraction, absorption, scattering,
//  reflections) is resolved physically in composite1.
// =====================================================================================
#include "/lib/common.glsl"

uniform sampler2D shadowtex0;
uniform sampler2D shadowtex1;
uniform sampler2D shadowcolor0;
uniform sampler2D shadowcolor1;

#include "/lib/shadows.glsl"
#include "/lib/lighting.glsl"
#include "/lib/brdf.glsl"
#include "/lib/water.glsl"

// =====================================================================================
#ifdef VSH
in vec4 mc_Entity;
in vec4 at_tangent;

out vec2 vUV;
out vec2 vLM;
out vec4 vColor;
out vec3 vPlayerPos;
out vec3 vNormal;
flat out int vBlockId;
flat out vec3 vLightColor;
flat out vec3 vSkyZenith;
flat out vec3 vSkyHorizon;

void main() {
    vUV    = (gl_TextureMatrix[0] * gl_MultiTexCoord0).xy;
    vLM    = normalizeLightmap((gl_TextureMatrix[1] * gl_MultiTexCoord1).xy);
    vColor = gl_Color;
#ifdef G_WATER
    vBlockId = int(floor(mc_Entity.x + 0.5));
#else
    vBlockId = 0;
#endif
    vec3 viewPos = (gl_ModelViewMatrix * gl_Vertex).xyz;
    vPlayerPos = viewToPlayer(viewPos);
    vNormal = mat3(gbufferModelViewInverse) * normalize(gl_NormalMatrix * gl_Normal);

    LightContext c = buildLightContext(false);
    vLightColor = c.lightColor;
    vSkyZenith  = c.skyZenith;
    vSkyHorizon = c.skyHorizon;

    gl_Position = gl_ProjectionMatrix * vec4(viewPos, 1.0);
    gl_Position.xy += taaOffset() * gl_Position.w;
}
#endif

// =====================================================================================
#ifdef FSH
uniform sampler2D tex;
uniform sampler2D normals;
uniform sampler2D specular;

in vec2 vUV;
in vec2 vLM;
in vec4 vColor;
in vec3 vPlayerPos;
in vec3 vNormal;
flat in int vBlockId;
flat in vec3 vLightColor;
flat in vec3 vSkyZenith;
flat in vec3 vSkyHorizon;

#if defined G_WATER
/* RENDERTARGETS: 4,11 */
layout(location = 0) out vec4 outColor;
layout(location = 1) out vec4 outInfo;
#else
/* RENDERTARGETS: 4 */
layout(location = 0) out vec4 outColor;
#endif

void main() {
    vec4 albedo = texture(tex, vUV);
#ifdef G_WATER
    albedo.rgb *= vColor.rgb;   // separateAo: terrain vertex alpha holds AO, not coverage
#else
    albedo *= vColor;
#endif
#ifdef G_GLINT
    // additive enchantment glint: zero coverage, adds light
    outColor = vec4(srgbToLinear(albedo.rgb) * albedo.a * 2.0, 0.0);
    return;
#endif

    vec3 N = normalize(vNormal);
    if (!gl_FrontFacing) N = -N;

    LightContext ctx;
    ctx.lightDir = worldLightDir();
    ctx.sunDir = worldSunDir();
    ctx.lightColor = vLightColor;
    ctx.sunIllum = vLightColor;
    ctx.skyZenith = vSkyZenith;
    ctx.skyHorizon = vSkyHorizon;

#ifdef G_WATER
    if (vBlockId == ID_WATER) {
        vec3 wp = vPlayerPos + cameraPosition;
        float fade = 1.0 - smoothstep(48.0, 160.0, length(vPlayerPos));
        vec3 wn = abs(N.y) > 0.5 ? waterNormal(wp, fade) * vec3(1.0, sign(N.y), 1.0) : N;
        outColor = vec4(0.0);
        outInfo  = vec4(encodeNormal(wn), float(MAT_WATER) / 255.0, 1.0);
        return;
    }
#endif

    if (albedo.a < 0.004) discard;
    vec3 lin = srgbToLinear(albedo.rgb);
    float dither = temporalIGN(gl_FragCoord.xy);

    float NdotL = saturate(dot(N, ctx.lightDir));
    vec3 shadow = vec3(1.0);
#ifdef SHADOWS
  #if defined G_WATER
    float bd;
    shadow = NdotL > 0.0 ? shadowPCSS(vPlayerPos, N, NdotL, dither, bd) : vec3(0.0);
  #else
    shadow = shadowSimple(vPlayerPos + N * 0.05, false);
    NdotL = 0.6; // particles / weather scatter roughly isotropically
  #endif
#endif
    vec3 ambient = fallbackAmbient(N, vLM, ctx);
    vec3 lit = lin * (ctx.lightColor * shadow * NdotL * INV_PI + ambient);

#ifdef G_WATER
    // glass / ice / slime: glossy dielectric, specular handled in composite (colortex11)
    vec4 spec = texture(specular, vUV);
    float smoothness = spec.r > 0.0 ? spec.r : 0.96;
    outColor = vec4(lit, albedo.a);
    outInfo  = vec4(encodeNormal(N), float(MAT_GLASS) / 255.0, smoothness);
#elif defined G_WEATHER
    outColor = vec4(lit * 1.5 + ambient * 0.5, albedo.a * 0.45);
#else
    outColor = vec4(lit, albedo.a);
#endif
}
#endif
