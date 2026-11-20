// =====================================================================================
//  OPAQUE G-BUFFER  (terrain, block entities, entities, hand, basic, emissive)
//  colortex0 : albedo (sRGB) | AO
//  colortex1 : octahedral texture normal | octahedral geometry normal   (RGBA16)
//  colortex2 : LabPBR specular (smoothness w/ specular AA, F0, porosity/SSS, emission)
//  colortex3 : lightmap.xy | material id | POM self-shadow
// =====================================================================================
#include "/lib/common.glsl"
#include "/lib/waving.glsl"
#include "/lib/pom.glsl"

// =====================================================================================
#ifdef VSH
in vec4 mc_Entity;
in vec2 mc_midTexCoord;
in vec4 at_tangent;

out vec2 vUV;
out vec2 vLM;
out vec4 vColor;
out vec3 vPlayerPos;
out vec3 vNormal;
out vec4 vTangent;
out vec4 vTile;
flat out int vBlockId;

void main() {
    vUV    = (gl_TextureMatrix[0] * gl_MultiTexCoord0).xy;
    vLM    = normalizeLightmap((gl_TextureMatrix[1] * gl_MultiTexCoord1).xy);
    vColor = gl_Color;
#ifdef G_TERRAIN
    vBlockId = int(floor(mc_Entity.x + 0.5));
#else
    vBlockId = 0;
#endif

    vec3 viewPos = (gl_ModelViewMatrix * gl_Vertex).xyz;
#ifdef G_TERRAIN
    vec2 midUV = (gl_TextureMatrix[0] * vec4(mc_midTexCoord, 0.0, 1.0)).xy;
    vec2 halfSize = abs(vUV - midUV);
    vTile = vec4(midUV - halfSize, max(halfSize * 2.0, vec2(1e-6)));
    vec3 player = viewToPlayer(viewPos);
    player += wavingOffset(player + cameraPosition, vBlockId, vUV.y < midUV.y);
    viewPos = playerToView(player);
#else
    vTile = vec4(0.0, 0.0, 1.0, 1.0);
#endif
    vPlayerPos = viewToPlayer(viewPos);
    vNormal  = mat3(gbufferModelViewInverse) * normalize(gl_NormalMatrix * gl_Normal);
    // some geometry (lines, a few entity models) has no tangents: keep zero, fixed in FSH
    vTangent = vec4(mat3(gbufferModelViewInverse) * (gl_NormalMatrix * at_tangent.xyz),
                    at_tangent.w < 0.0 ? -1.0 : 1.0);

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
in vec4 vTangent;
in vec4 vTile;
flat in int vBlockId;

/* RENDERTARGETS: 0,1,2,3 */
layout(location = 0) out vec4 outAlbedo;
layout(location = 1) out vec4 outNormal;
layout(location = 2) out vec4 outSpecular;
layout(location = 3) out vec4 outInfo;

int materialFromBlock(int id) {
    if (id == ID_LEAVES) return MAT_LEAVES;
    if (id == ID_PLANT || id == ID_PLANT_TALL) return MAT_PLANT;
    if (id == ID_LAVA) return MAT_LAVA;
    if (id == ID_EMISSIVE || id == ID_END_LIGHT || id == ID_FIRE) return MAT_EMISSIVE;
    if (id == ID_TORCH || id == ID_SOUL || id == ID_REDSTONE || id == ID_DIM_EMIT) return MAT_SMALL_EMIT;
    return MAT_SOLID;
}

void main() {
    vec3 geoN = normalize(vNormal);
    if (!gl_FrontFacing) geoN = -geoN;
    vec3 T = vTangent.xyz - geoN * dot(vTangent.xyz, geoN);
    mat3 tbn;
    if (dot(T, T) > 1e-8) {
        T = normalize(T);
        tbn = mat3(T, cross(T, geoN) * vTangent.w, geoN);
    } else {
        tbn = tbnFromNormal(geoN);
    }

    vec2 uv = vUV;
    vec2 dx = dFdx(vUV), dy = dFdy(vUV);
    float pomShadow = 1.0;

#if defined G_TERRAIN && defined POM
    float dist = length(vPlayerPos);
    float fade = 1.0 - smoothstep(POM_DISTANCE * 0.75, POM_DISTANCE, dist);
    // packs without a normal map may bind an all-zero default: no height data -> no POM
    vec2 nProbe = textureGrad(normals, vUV, dx, dy).rg;
    if (fade > 0.0 && nProbe.r + nProbe.g > 0.004 && vBlockId != ID_PLANT && vBlockId != ID_PLANT_TALL) {
        vec3 viewTS = normalize(vPlayerPos) * tbn;
        vec2 local = (vUV - vTile.xy) / vTile.zw;
        vec3 hitTS;
        local = parallaxOcclusion(normals, local, vTile, viewTS, dx, dy, fade, hitTS);
        uv = tileWrap(local, vTile);
        vec3 lightTS = worldLightDir() * tbn;
        pomShadow = parallaxShadow(normals, hitTS, vTile, lightTS, dx, dy, fade);
    }
#endif

#ifdef G_BASIC
    vec4 albedo = vColor;
#else
    vec4 albedo = textureGrad(tex, uv, dx, dy);
#endif

    float ao = 1.0;
#ifdef G_TERRAIN
    albedo.rgb *= vColor.rgb;
    ao = mix(1.0, vColor.a, VANILLA_AO);  // separateAo = true -> vertex alpha is AO
#elif !defined G_BASIC
    albedo *= vColor;
#endif
#ifdef G_ENTITIES
    albedo.rgb = mix(albedo.rgb, entityColor.rgb, entityColor.a);
#endif
    if (albedo.a < 0.1) discard;

    // --------------------------------------------------------- normal mapping -------
    vec3 texN = geoN;
#if !defined G_BASIC && defined LABPBR
    vec4 nTex = textureGrad(normals, uv, dx, dy);
    if (nTex.r + nTex.g > 0.004) {
        vec2 xy = (nTex.rg * 2.0 - 1.0) * NORMAL_MAP_STRENGTH;
        vec3 nTS = vec3(xy, sqrt(saturate(1.0 - dot(xy, xy))));
        texN = normalize(tbn * normalize(nTS));
        ao *= nTex.b > 0.0 ? nTex.b : 1.0;
    }
#endif

    int mat = MAT_SOLID;
#ifdef G_TERRAIN
    mat = materialFromBlock(vBlockId);
    if (mat == MAT_PLANT) { texN = geoN = vec3(0.0, 1.0, 0.0); }
#elif defined G_HAND
    mat = MAT_HAND;
#elif defined G_ENTITIES
    mat = MAT_ENTITY;
#elif defined G_EMISSIVE
    mat = MAT_EMISSIVE;
#endif

    // --------------------------------------------------------- specular -------------
    vec4 spec = vec4(0.0);
#if !defined G_BASIC && defined LABPBR
    spec = textureGrad(specular, uv, dx, dy);
#endif

#ifdef HARDCODED_EMISSION
    int encodedEmission = int(spec.a * 255.0 + 0.5);
    if (encodedEmission == 0 || encodedEmission == 255) {
        float lum = luminance(albedo.rgb);
        float e = 0.0;
        if (mat == MAT_LAVA) e = 1.0;
        else if (mat == MAT_EMISSIVE) e = smoothstep(0.25, 0.75, lum) * 0.9 + 0.1;
        else if (mat == MAT_SMALL_EMIT) e = smoothstep(0.55, 0.85, maxOf(albedo.rgb)) * step(0.3, maxOf(albedo.rgb) - minOf(albedo.rgb) + lum * 0.5);
    #ifdef G_EMISSIVE
        e = 1.0;
    #endif
        if (e > 0.0) spec.a = e * 254.0 / 255.0;
    }
#endif

    // rain wetness: porous materials darken, smooth puddles on upward faces
    float wet = wetness * smoothstep(0.86, 0.96, vLM.y) * saturate(geoN.y);
    if (wet > 0.0 && mat == MAT_SOLID) {
        float porosity = int(spec.b * 255.0 + 0.5) <= 64 ? spec.b * 255.0 / 64.0 : 0.0;
        float puddle = smoothstep(0.45, 0.65, valueNoise3D(vec3((vPlayerPos.xz + cameraPosition.xz) * 0.35, 0.0)));
        albedo.rgb *= 1.0 - wet * porosity * 0.4;
        spec.r = mix(spec.r, 0.97, wet * mix(0.55, 1.0, puddle));
        if (spec.g < 0.02) spec.g = mix(spec.g, 0.02, wet);
        texN = normalize(mix(texN, geoN, wet * puddle));
    }

#ifdef SPECULAR_AA
    // geometric specular anti-aliasing (Tokuyoshi & Kaplanyan 2019)
    vec3 dndu = dFdx(texN), dndv = dFdy(texN);
    float variance = SPECULAR_AA_VARIANCE * (dot(dndu, dndu) + dot(dndv, dndv));
    float kernel = min(2.0 * variance, SPECULAR_AA_THRESHOLD);
    float a = sqr(1.0 - spec.r);
    float a2 = saturate(a * a + kernel);
    spec.r = 1.0 - sqrt(sqrt(a2));
#endif

    outAlbedo   = vec4(albedo.rgb, ao);
    outNormal   = vec4(encodeNormal(texN), encodeNormal(geoN));
    outSpecular = spec;
    outInfo     = vec4(vLM, float(mat) / 255.0, pomShadow);
}
#endif
