// Sunlit arcade: plaster arches casting light on the floor
float sdBox(vec3 p, vec3 b){ vec3 q=abs(p)-b; return length(max(q,0.))+min(max(q.x,max(q.y,q.z)),0.); }
float archHole(vec3 p){ // repeated arched openings in YZ plane
  float z = mod(p.z+1.4, 2.8)-1.4;
  vec2 q = vec2(z, p.y);
  float rect = max(abs(q.x)-.85, abs(q.y-1.25)-1.25);
  float circ = length(q-vec2(0.,2.5))-.85;
  return min(rect, circ);
}
vec2 mapA(vec3 p){
  float floorD = p.y;
  float wallL = max(abs(p.x+2.)-.3, -archHole(p));
  wallL = max(wallL, p.y-4.6);
  float wallR = abs(p.x-2.2)-.3;
  float ceil = max(abs(p.y-4.75)-.15, abs(p.x)-2.6);
  // ceiling beams gaps
  ceil = max(ceil, -(abs(mod(p.z,1.4)-.7)-.38));
  float d = min(min(floorD, wallL), min(wallR, ceil));
  return vec2(d, d==floorD?1.:0.);
}
vec3 nA(vec3 p){ vec2 e=vec2(.001,0.); return normalize(vec3(mapA(p+e.xyy).x-mapA(p-e.xyy).x,mapA(p+e.yxy).x-mapA(p-e.yxy).x,mapA(p+e.yyx).x-mapA(p-e.yyx).x)); }
float shA(vec3 ro, vec3 rd){ float r=1., t=.02; for(int i=0;i<120;i++){ float h=mapA(ro+rd*t).x; r=min(r,16.*h/t); t+=clamp(h,.01,.5); if(r<.001||t>25.) break; } return clamp(r,0.,1.); }
void mainImage(out vec4 o, vec2 fc){
  vec2 uv = (fc - .5*uRes)/uRes.y; vec2 q = fc/uRes;
  vec3 ro = vec3(.55,1.55,6.), rd = camLook(ro, vec3(-.15,1.75,-6.))*normalize(vec3(uv,1.45));
  float t=0.; vec2 h;
  for(int i=0;i<220;i++){ h=mapA(ro+rd*t); if(h.x<.0006||t>60.) break; t+=h.x; }
  vec3 L = normalize(vec3(-1.,.85,-.45));
  vec3 col = vec3(1.,.8,.62)*1.4;
  if(t<60.){
    vec3 p=ro+rd*t, n=nA(p);
    float sh = shA(p+n*.003, L);
    float dif = clamp(dot(n,L),0.,1.)*sh;
    vec3 alb = vec3(.86,.62,.5);
    if(h.y>.5) alb = vec3(.72,.5,.4)*(.9+.1*noise(p.xz*4.));
    float ao=0.; for(int i=1;i<=5;i++){ float hh=.08*float(i); ao+=(hh-mapA(p+n*hh).x); } ao=clamp(1.-ao*1.5,0.,1.);
    vec3 lin = vec3(1.,.82,.62)*3.4*dif + vec3(.45,.42,.6)*.55*ao + vec3(.9,.55,.4)*.35*ao*clamp(-n.y*.5+.5,0.,1.);
    col = alb*lin;
    col = mix(col, vec3(.95,.72,.55), 1.-exp(-t*.025));
  }
  col = aces(col*.72); col = pow(col, vec3(1.12));
  col *= vignette(q,.3);
  col = toSRGB(col);
  o = vec4(grain(col, fc, .022),1.);
}
