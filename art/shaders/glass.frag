// Dispersive glass torus over light bars
float mapG(vec3 p){
  p.yz *= rot(1.0); p.xy *= rot(.35);
  vec2 q = vec2(length(p.xz)-1.05, p.y);
  return length(q)-.42;
}
vec3 nG(vec3 p){ vec2 e=vec2(.0007,0.); return normalize(vec3(mapG(p+e.xyy)-mapG(p-e.xyy),mapG(p+e.yxy)-mapG(p-e.yxy),mapG(p+e.yyx)-mapG(p-e.yyx))); }
vec3 envG(vec3 d){
  vec3 c = mix(vec3(.01,.01,.014), vec3(.05,.045,.055), smoothstep(-.4,.6,d.y));
  float y = d.y;
  c += vec3(1.,.4,.12)*2.4*smoothstep(.03,.0,abs(y-.18))*smoothstep(-.1,.0,d.z+1.);
  c += vec3(1.)*2.*smoothstep(.012,.0,abs(y+.06));
  c += vec3(.35,.45,1.)*1.2*smoothstep(.02,.0,abs(y-.42));
  c += vec3(1.,.95,.9)*2.5*smoothstep(.5,.75,d.y)*smoothstep(.6,.3,abs(d.x));
  c += vec3(1.,.35,.1)*.6*smoothstep(.2,.0,abs(d.x-.75))*smoothstep(.0,-.5,d.y);
  return c;
}
float trace(vec3 ro, vec3 rd, float s){ float t=0.; for(int i=0;i<160;i++){ float d=s*mapG(ro+rd*t); if(d<.0004) return t; t+=max(d,.0004); if(t>20.) break; } return -1.; }
vec3 refrCol(vec3 p, vec3 rd, vec3 n, float ior){
  vec3 r1 = refract(rd, n, 1./ior);
  vec3 ip = p - n*.004;
  float t2 = trace(ip, r1, -1.);
  if(t2<0.) return envG(r1);
  vec3 p2 = ip + r1*t2, n2 = -nG(p2);
  vec3 r2 = refract(r1, n2, ior);
  if(dot(r2,r2)<.01) r2 = reflect(r1, n2);
  // second object pass for the far side of the ring
  vec3 p3 = p2 - n2*.004;
  float t3 = trace(p3, r2, 1.);
  if(t3>0.){ vec3 p4=p3+r2*t3; vec3 n4=nG(p4); vec3 r4=refract(r2,n4,1./ior); return envG(r4)*.85 + envG(reflect(r2,n4))*.1; }
  return envG(r2)*exp(-t2*vec3(.05,.08,.12));
}
void mainImage(out vec4 o, vec2 fc){
  vec2 uv = (fc - .5*uRes)/uRes.y; vec2 q = fc/uRes;
  vec3 ro = vec3(0.,0.,7.6), rd = camLook(ro, vec3(0.))*normalize(vec3(uv,1.9));
  vec3 col = envG(rd);
  float t = trace(ro, rd, 1.);
  if(t>0.){
    vec3 p = ro+rd*t, n = nG(p);
    float fr = .04+.96*pow(1.-clamp(dot(n,-rd),0.,1.),5.);
    vec3 rc = vec3(refrCol(p,rd,n,1.46).r, refrCol(p,rd,n,1.5).g, refrCol(p,rd,n,1.55).b);
    col = mix(rc, envG(reflect(rd,n)), fr);
  }
  col = aces(col);
  col *= vignette(q,.4);
  col = toSRGB(col);
  o = vec4(grain(col, fc, .022),1.);
}
