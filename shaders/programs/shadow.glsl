// =====================================================================================
//  SHADOW PASS
//  * Rasterises every triangle twice into the two shadow cascades of the atlas
//  * Voxelises terrain into the PTGI volume (right half of shadowcolor1)
//  * Writes translucent tint + analytic water caustics into shadowcolor0
// =====================================================================================
#define VOXEL_NO_TRACE
#include "/lib/common.glsl"
#include "/lib/shadowspace.glsl"
#include "/lib/voxel.glsl"
#include "/lib/waving.glsl"
#include "/lib/water.glsl"

// =====================================================================================
#ifdef VSH
in vec4 mc_Entity;
in vec2 mc_midTexCoord;

out vec2 vUV;
out vec2 vMidUV;
out vec4 vColor;
out vec3 vPlayerPos;
out vec3 vNormal;
flat out int vBlockId;
flat out int vTerrain;

void main() {
    vUV     = (gl_TextureMatrix[0] * gl_MultiTexCoord0).xy;
    vMidUV  = (gl_TextureMatrix[0] * vec4(mc_midTexCoord, 0.0, 1.0)).xy;
    vColor  = gl_Color;
    vBlockId = int(floor(mc_Entity.x + 0.5));

    bool terrain = abs(mc_Entity.x) > 0.5;
#ifdef MC_RENDER_STAGE_TERRAIN_SOLID
    if (renderStage != MC_RENDER_STAGE_NONE) {
        terrain = renderStage == MC_RENDER_STAGE_TERRAIN_SOLID ||
                  renderStage == MC_RENDER_STAGE_TERRAIN_CUTOUT ||
                  renderStage == MC_RENDER_STAGE_TERRAIN_CUTOUT_MIPPED ||
                  renderStage == MC_RENDER_STAGE_TERRAIN_TRANSLUCENT;
    }
#endif
    vTerrain = terrain ? 1 : 0;

    vec3 playerPos = (shadowModelViewInverse * shadowProjectionInverse * ftransform()).xyz;
    if (terrain) playerPos += wavingOffset(playerPos + cameraPosition, vBlockId, vUV.y < vMidUV.y);
    vPlayerPos = playerPos;
    vNormal = mat3(shadowModelViewInverse) * (gl_NormalMatrix * gl_Normal);
    gl_Position = vec4(playerPos, 1.0);
}
#endif

// =====================================================================================
#ifdef GSH
layout(triangles) in;
layout(triangle_strip, max_vertices = 10) out;

uniform sampler2D tex;

in vec2 vUV[];
in vec2 vMidUV[];
in vec4 vColor[];
in vec3 vPlayerPos[];
in vec3 vNormal[];
flat in int vBlockId[];
flat in int vTerrain[];

out vec2 gUV;
out vec4 gColor;
out vec3 gPlayerPos;
flat out int gBlockId;
flat out int gLayer;
flat out vec4 gVoxel;

void emitCascade(int c) {
    vec3 clip[3];
    vec2 lo = vec2( 1e9), hi = vec2(-1e9);
    for (int i = 0; i < 3; i++) {
        clip[i] = shadowViewToClip(playerToShadowView(vPlayerPos[i]));
        vec2 s = clip[i].xy * cascadeScale(c);
        lo = min(lo, s); hi = max(hi, s);
    }
    // reject triangles completely outside this cascade's footprint
    if (any(greaterThan(lo, vec2(1.0))) || any(lessThan(hi, vec2(-1.0)))) return;
    for (int i = 0; i < 3; i++) {
        gl_Position = vec4(clipToCascadeNDC(clip[i], c), 1.0);
        gUV = vUV[i]; gColor = vColor[i]; gPlayerPos = vPlayerPos[i];
        gBlockId = vBlockId[i]; gLayer = c; gVoxel = vec4(0.0);
        EmitVertex();
    }
    EndPrimitive();
}

void emitVoxel() {
#ifdef PTGI
    if (vTerrain[0] == 0) return;
    int type = blockIdToVoxelType(vBlockId[0]);
    if (type == VOXEL_EMPTY) return;

    vec3 e1 = vPlayerPos[1] - vPlayerPos[0];
    vec3 e2 = vPlayerPos[2] - vPlayerPos[0];
    if (length(cross(e1, e2)) < 1e-6) return;
    // outward face normal supplied by the vertex stream (independent of winding)
    vec3 n = normalize(vNormal[0]);
    bool axisAligned = maxOf(abs(n)) > 0.99;
    // full-cube faces must be axis aligned; slanted geometry only counts for emitters
    if (!axisAligned && !voxelIsEmitter(type) && type != VOXEL_LEAVES) return;

    vec3 triCenter = (vPlayerPos[0] + vPlayerPos[1] + vPlayerPos[2]) / 3.0;
    // faces lie on cell boundaries: the face belongs to the cell behind it
    ivec3 voxel = ivec3(floor(playerToVoxel(triCenter - n * 0.05)));
    if (!insideVoxelVolume(voxel)) return;

    vec3 albedo = textureLod(tex, vMidUV[0], 4.0).rgb * vColor[0].rgb;
    if (type == VOXEL_LEAVES) albedo = textureLod(tex, vMidUV[0], 2.0).rgb * vColor[0].rgb;
    albedo = srgbToLinear(albedo);
    vec4 data = vec4(sqrt(saturate(albedo)), float(type) / 255.0);

    vec2 texel = vec2(voxelToTexel(voxel)) + 0.5;
    float z = n.y > 0.5 ? -0.5 : 0.0; // top faces win the depth test (grass tops etc.)
    vec2 o[4] = vec2[4](vec2(-0.25, -0.25), vec2(0.25, -0.25), vec2(-0.25, 0.25), vec2(0.25, 0.25));
    for (int i = 0; i < 4; i++) {
        vec2 ndc = (texel + o[i]) / float(shadowMapResolution) * 2.0 - 1.0;
        gl_Position = vec4(ndc, z, 1.0);
        gUV = vMidUV[0]; gColor = vec4(1.0); gPlayerPos = triCenter;
        gBlockId = vBlockId[0]; gLayer = 2; gVoxel = data;
        EmitVertex();
    }
    EndPrimitive();
#endif
}

void main() {
#ifdef SHADOWS
    emitCascade(0);
    emitCascade(1);
#endif
    emitVoxel();
}
#endif

// =====================================================================================
#ifdef FSH
uniform sampler2D tex;

in vec2 gUV;
in vec4 gColor;
in vec3 gPlayerPos;
flat in int gBlockId;
flat in int gLayer;
flat in vec4 gVoxel;

/* RENDERTARGETS: 0,1 */
layout(location = 0) out vec4 shadowColorOut;
layout(location = 1) out vec4 voxelOut;

void main() {
    if (gLayer == 2) {
        shadowColorOut = vec4(1.0);
        voxelOut = gVoxel;
        return;
    }
    vec2 atlas = gl_FragCoord.xy / float(shadowMapResolution);
    vec4 rect = cascadeRect(gLayer);
    if (any(lessThan(atlas, rect.xy)) || any(greaterThanEqual(atlas, rect.zw))) discard;

    vec4 albedo = texture(tex, gUV);
    albedo.rgb *= gColor.rgb;   // separateAo: vertex alpha is AO for terrain
    voxelOut = vec4(0.0);

    if (gBlockId == ID_WATER) {
        vec3 L = normalize(mat3(shadowModelViewInverse) * vec3(0.0, 0.0, 1.0));
    #ifdef WATER_CAUSTICS
        float c = waterCaustics(gPlayerPos + cameraPosition, L);
    #else
        float c = 1.0;
    #endif
        shadowColorOut = vec4(vec3(c * 0.25), 0.25);
        return;
    }
    if (albedo.a < 0.1) discard;

    bool translucent = gBlockId == ID_GLASS || gBlockId == ID_ICE;
#ifdef MC_RENDER_STAGE_TERRAIN_TRANSLUCENT
    translucent = translucent || renderStage == MC_RENDER_STAGE_TERRAIN_TRANSLUCENT;
#endif
    if (translucent) {
        vec3 tint = srgbToLinear(albedo.rgb);
        // transmittance of a tinted slab: stronger tint for more opaque glass
        tint = mix(vec3(1.0), tint / max(maxOf(tint), 0.05), sqrt(albedo.a)) * (1.0 - albedo.a * 0.35);
        shadowColorOut = vec4(tint, 1.0);
    } else {
        shadowColorOut = vec4(1.0);
    }
}
#endif
