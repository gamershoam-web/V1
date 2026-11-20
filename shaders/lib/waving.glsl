#ifndef WAVING_GLSL
#define WAVING_GLSL
// shared by gbuffers and the shadow pass so shadows match the animated geometry

vec3 wavingOffset(vec3 worldPos, int id, bool topVertex) {
#ifdef WAVING_PLANTS
    float t = frameTimeCounter * WAVING_SPEED;
    float wind = 0.6 + 0.4 * sin(t * 0.37 + worldPos.x * 0.02) + rainStrength * 0.8;
    if (id == ID_LEAVES) {
        vec3 p = worldPos * vec3(0.7, 0.5, 0.7);
        return vec3(sin(t * 1.7 + p.x + p.y), sin(t * 1.3 + p.z) * 0.4, cos(t * 1.5 + p.z + p.y)) * 0.025 * wind;
    }
    if ((id == ID_PLANT && topVertex) || id == ID_PLANT_TALL) {
        float k = id == ID_PLANT_TALL && !topVertex ? 0.5 : 1.0;
        vec2 p = worldPos.xz;
        vec2 o = vec2(sin(t * 2.1 + p.x * 0.9 + p.y * 0.4), cos(t * 1.8 + p.y * 0.8 - p.x * 0.3)) * 0.08;
        o += vec2(sin(t * 5.3 + p.x * 2.0), cos(t * 4.7 + p.y * 2.0)) * 0.02;
        return vec3(o.x, 0.0, o.y) * wind * k;
    }
#endif
    return vec3(0.0);
}

#endif
