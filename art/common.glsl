#version 300 es
precision highp float;
uniform vec2 uRes;
out vec4 fragColor;
#define PI 3.14159265
#define TAU 6.2831853
float hash11(float p){ p = fract(p*.1031); p *= p+33.33; p *= p+p; return fract(p); }
float hash21(vec2 p){ vec3 p3 = fract(vec3(p.xyx)*.1031); p3 += dot(p3, p3.yzx+33.33); return fract((p3.x+p3.y)*p3.z); }
vec2 hash22(vec2 p){ vec3 p3 = fract(vec3(p.xyx)*vec3(.1031,.1030,.0973)); p3 += dot(p3, p3.yzx+33.33); return fract((p3.xx+p3.yz)*p3.zy); }
float noise(vec2 p){ vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.-2.*f);
  return mix(mix(hash21(i),hash21(i+vec2(1,0)),u.x), mix(hash21(i+vec2(0,1)),hash21(i+vec2(1,1)),u.x), u.y); }
float hash31(vec3 p){ p = fract(p*.1031); p += dot(p, p.zyx+31.32); return fract((p.x+p.y)*p.z); }
float noise3(vec3 p){ vec3 i=floor(p), f=fract(p); vec3 u=f*f*(3.-2.*f);
  return mix(mix(mix(hash31(i),hash31(i+vec3(1,0,0)),u.x),mix(hash31(i+vec3(0,1,0)),hash31(i+vec3(1,1,0)),u.x),u.y),
             mix(mix(hash31(i+vec3(0,0,1)),hash31(i+vec3(1,0,1)),u.x),mix(hash31(i+vec3(0,1,1)),hash31(i+vec3(1,1,1)),u.x),u.y),u.z); }
float fbm(vec2 p){ float a=.5, s=0.; mat2 m=mat2(1.6,1.2,-1.2,1.6); for(int i=0;i<6;i++){ s+=a*noise(p); p=m*p; a*=.5; } return s; }
float fbm3(vec3 p){ float a=.5, s=0.; for(int i=0;i<5;i++){ s+=a*noise3(p); p=p*2.03+vec3(1.7,9.2,3.1); a*=.5; } return s; }
mat2 rot(float a){ float c=cos(a), s=sin(a); return mat2(c,-s,s,c); }
float smin(float a, float b, float k){ float h = clamp(.5+.5*(b-a)/k,0.,1.); return mix(b,a,h)-k*h*(1.-h); }
vec3 aces(vec3 x){ return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14),0.,1.); }
vec3 toSRGB(vec3 c){ return pow(clamp(c,0.,1.), vec3(1./2.2)); }
vec3 grain(vec3 c, vec2 fc, float amt){ float n = hash21(fc*1.37+17.) - .5; return c + n*amt; }
float vignette(vec2 uv, float k){ uv = uv*2.-1.; return 1. - k*dot(uv*vec2(.85,1.),uv*vec2(.85,1.)); }
mat3 camLook(vec3 ro, vec3 ta){ vec3 f=normalize(ta-ro), r=normalize(cross(f,vec3(0,1,0))), u=cross(r,f); return mat3(r,u,f); }
