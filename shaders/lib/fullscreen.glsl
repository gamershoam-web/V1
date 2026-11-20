#ifndef FULLSCREEN_GLSL
#define FULLSCREEN_GLSL
// Fullscreen pass scaffolding. Programs that need lighting define NEED_LIGHT before
// including; the (expensive) light context incl. a full atmosphere evaluation for the
// zenith/horizon colours is computed once per vertex and passed flat.

#ifdef VSH
out vec2 texcoord;
#ifdef NEED_LIGHT
flat out vec3 lcLightDir;
flat out vec3 lcLightColor;
flat out vec3 lcSunDir;
flat out vec3 lcSunIllum;
flat out vec3 lcZenith;
flat out vec3 lcHorizon;
#endif
void main() {
    gl_Position = ftransform();
    texcoord = (gl_TextureMatrix[0] * gl_MultiTexCoord0).xy;
#ifdef NEED_LIGHT
    LightContext c = buildLightContext(true);
    lcLightDir = c.lightDir;
    lcLightColor = c.lightColor;
    lcSunDir = c.sunDir;
    lcSunIllum = c.sunIllum;
    lcZenith = c.skyZenith;
    lcHorizon = c.skyHorizon;
#endif
}
#endif

#ifdef FSH
in vec2 texcoord;
#ifdef NEED_LIGHT
flat in vec3 lcLightDir;
flat in vec3 lcLightColor;
flat in vec3 lcSunDir;
flat in vec3 lcSunIllum;
flat in vec3 lcZenith;
flat in vec3 lcHorizon;
LightContext getLightContext() {
    LightContext c;
    c.lightDir = lcLightDir;
    c.lightColor = lcLightColor;
    c.sunDir = lcSunDir;
    c.sunIllum = lcSunIllum;
    c.skyZenith = lcZenith;
    c.skyHorizon = lcHorizon;
    return c;
}
#endif
#endif

#endif
