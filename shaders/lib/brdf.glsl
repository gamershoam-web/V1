#ifndef BRDF_GLSL
#define BRDF_GLSL
// -------------------------------------------------------------------------------------
//  LabPBR 1.3 material decoding + Cook-Torrance GGX BRDF with conductor Fresnel.
// -------------------------------------------------------------------------------------

struct Material {
    vec3  albedo;
    float roughness;     // alpha = perceptual^2
    float smoothness;
    vec3  f0;
    bool  metal;
    bool  hardcodedMetal;
    vec3  n, k;          // complex IOR for hardcoded metals
    float porosity;
    float sss;
    float emission;
    float ao;
};

// LabPBR hardcoded metals 230..237: iron gold aluminum chrome copper lead platinum silver
void labHardcodedMetal(int idx, out vec3 n, out vec3 k) {
    if      (idx == 0) { n = vec3(2.9114, 2.9497, 2.5845); k = vec3(3.0893, 2.9318, 2.7670); }
    else if (idx == 1) { n = vec3(0.18299, 0.42108, 1.3734); k = vec3(3.4242, 2.3459, 1.7704); }
    else if (idx == 2) { n = vec3(1.3456, 0.96521, 0.61722); k = vec3(7.4746, 6.3995, 5.3031); }
    else if (idx == 3) { n = vec3(3.1071, 3.1812, 2.3230); k = vec3(3.3314, 3.3291, 3.1350); }
    else if (idx == 4) { n = vec3(0.27105, 0.67693, 1.31640); k = vec3(3.6092, 2.6248, 2.2921); }
    else if (idx == 5) { n = vec3(1.9100, 1.8300, 1.4400); k = vec3(3.5100, 3.4000, 3.1800); }
    else if (idx == 6) { n = vec3(2.3757, 2.0847, 1.8453); k = vec3(4.2655, 3.7153, 3.1365); }
    else               { n = vec3(0.15943, 0.14512, 0.13547); k = vec3(3.9291, 3.1900, 2.3808); }
}

vec3 fresnelConductor(float cosT, vec3 n, vec3 k) {
    float c2 = cosT * cosT;
    vec3 nk2 = n * n + k * k;
    vec3 tnc = 2.0 * n * cosT;
    vec3 rs = (nk2 - tnc + c2) / (nk2 + tnc + c2);
    vec3 rp = (nk2 * c2 - tnc + 1.0) / (nk2 * c2 + tnc + 1.0);
    return saturate(0.5 * (rs + rp));
}

vec3 fresnelSchlick(float cosT, vec3 f0) {
    return f0 + (1.0 - f0) * pow5(1.0 - saturate(cosT));
}
vec3 fresnelSchlickRoughness(float cosT, vec3 f0, float roughness) {
    return f0 + (max(vec3(1.0 - roughness), f0) - f0) * pow5(1.0 - saturate(cosT));
}

vec3 materialFresnel(Material m, float cosT) {
    if (m.hardcodedMetal) return fresnelConductor(saturate(cosT), m.n, m.k);
    return fresnelSchlick(cosT, m.f0);
}

Material decodeMaterial(vec3 albedo, vec4 spec, float ao) {
    Material m;
    m.albedo = albedo;
    m.ao = ao;
#ifdef LABPBR
    m.smoothness = spec.r;
    m.roughness  = max(sqr(1.0 - spec.r), 0.002);
    int g = int(spec.g * 255.0 + 0.5);
    m.metal = g >= 230;
    m.hardcodedMetal = g >= 230 && g <= 237;
    m.n = vec3(0.0); m.k = vec3(0.0);
    if (m.hardcodedMetal) {
        labHardcodedMetal(g - 230, m.n, m.k);
        m.f0 = fresnelConductor(1.0, m.n, m.k);
    } else if (m.metal) {
        m.f0 = albedo;
    } else {
        m.f0 = vec3(max(spec.g, 0.02));
    }
    int b = int(spec.b * 255.0 + 0.5);
    m.porosity = b <= 64 ? float(b) / 64.0 : 0.0;
    m.sss      = b >  64 ? float(b - 65) / 190.0 : 0.0;
    int a = int(spec.a * 255.0 + 0.5);
    m.emission = a < 255 ? float(a) / 254.0 : 0.0;
#else
    m.smoothness = 0.0; m.roughness = 1.0; m.metal = false; m.hardcodedMetal = false;
    m.n = vec3(0.0); m.k = vec3(0.0); m.f0 = vec3(0.02);
    m.porosity = 0.0; m.sss = 0.0; m.emission = 0.0;
#endif
    return m;
}

// ---------------------------------------------------------------- GGX ---------------
float D_GGX(float NdotH, float a) {
    float a2 = a * a;
    float d = (NdotH * a2 - NdotH) * NdotH + 1.0;
    return a2 / (PI * d * d + 1e-7);
}
float V_SmithGGXCorrelated(float NdotV, float NdotL, float a) {
    float a2 = a * a;
    float gv = NdotL * sqrt(NdotV * NdotV * (1.0 - a2) + a2);
    float gl = NdotV * sqrt(NdotL * NdotL * (1.0 - a2) + a2);
    return 0.5 / max(gv + gl, 1e-6);
}

// specular lobe of a directional light with finite angular size (energy normalised)
vec3 specularGGX(Material m, vec3 N, vec3 V, vec3 L) {
    vec3  H = normalize(V + L);
    float NdotL = saturate(dot(N, L));
    float NdotV = max(dot(N, V), 1e-4);
    float NdotH = saturate(dot(N, H));
    float VdotH = saturate(dot(V, H));
    // widen roughness by the sun's angular radius (Karis' sphere-light normalisation)
    float a  = max(m.roughness, 0.0);
    float aL = saturate(a + sunAngularRadius * 0.5);
    float D  = D_GGX(NdotH, aL) * sqr(a / aL);
    float Vis = V_SmithGGXCorrelated(NdotV, NdotL, a);
    return D * Vis * materialFresnel(m, VdotH);
}

// Burley diffuse with energy split against the specular lobe
float diffuseBurley(float NdotL, float NdotV, float LdotH, float a) {
    float f90 = 0.5 + 2.0 * a * LdotH * LdotH;
    float l = 1.0 + (f90 - 1.0) * pow5(1.0 - NdotL);
    float v = 1.0 + (f90 - 1.0) * pow5(1.0 - NdotV);
    return l * v * INV_PI;
}

// Karis analytic environment BRDF approximation
vec2 envBRDFApprox(float NdotV, float roughness) {
    const vec4 c0 = vec4(-1.0, -0.0275, -0.572, 0.022);
    const vec4 c1 = vec4(1.0, 0.0425, 1.04, -0.04);
    vec4 r = sqrt(roughness) * c0 + c1;
    float a004 = min(r.x * r.x, exp2(-9.28 * NdotV)) * r.x + r.y;
    return vec2(-1.04, 1.04) * a004 + r.zw;
}

// GGX visible normal sampling (Heitz 2018)
vec3 sampleGGXVNDF(vec3 Ve, float a, vec2 xi) {
    vec3 Vh = normalize(vec3(a * Ve.x, a * Ve.y, Ve.z));
    float lensq = dot(Vh.xy, Vh.xy);
    vec3 T1 = lensq > 0.0 ? vec3(-Vh.y, Vh.x, 0.0) * inversesqrt(lensq) : vec3(1.0, 0.0, 0.0);
    vec3 T2 = cross(Vh, T1);
    float r = sqrt(xi.x);
    float phi = TAU * xi.y;
    float t1 = r * cos(phi);
    float t2 = r * sin(phi);
    float s = 0.5 * (1.0 + Vh.z);
    t2 = (1.0 - s) * sqrt(1.0 - t1 * t1) + s * t2;
    vec3 Nh = t1 * T1 + t2 * T2 + sqrt(max(0.0, 1.0 - t1 * t1 - t2 * t2)) * Vh;
    return normalize(vec3(a * Nh.x, a * Nh.y, max(0.0, Nh.z)));
}

#endif
