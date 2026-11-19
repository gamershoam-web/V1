// Studio composition: clay spheres, ember accent, cyclorama
float sdTorus(vec3 p, vec2 t){ return length(vec2(length(p.xz)-t.x,p.y))-t.y; }
float sdBox(vec3 p, vec3 b){ vec3 q=abs(p)-b; return length(max(q,0.))+min(max(q.x,max(q.y,q.z)),0.); }
vec2 mapS(vec3 p){
  float cyc = smin(p.y, p.z+3.2, 1.6);
  vec2 r = vec2(cyc, 0.);
  float s1 = length(p-vec3(-.75,1.05,-.2))-1.05; if(s1<r.x) r=vec2(s1,1.);
  float s2 = length(p-vec3(1.05,.42,.75))-.42; if(s2<r.x) r=vec2(s2,2.);
  vec3 tp = p-vec3(1.25,1.25,-1.15); tp.xy*=rot(.0); tp = tp.xzy; float to = sdTorus(tp, vec2(1.0,.075)); if(to<r.x) r=vec2(to,3.);
  vec3 bp = p-vec3(.25,.32,1.35); bp.xz*=rot(.6); float bx = sdBox(bp, vec3(.32))-.03; if(bx<r.x) r=vec2(bx,1.);
  float s3 = length(p-vec3(-2.25,.22,1.2))-.22; if(s3<r.x) r=vec2(s3,3.);
  return r;
}
vec3 nS(vec3 p){ vec2 e=vec2(.001,0.); return normalize(vec3(mapS(p+e.xyy).x-mapS(p-e.xyy).x,mapS(p+e.yxy).x-mapS(p-e.yxy).x,mapS(p+e.yyx).x-mapS(p-e.yyx).x)); }
float softSh(vec3 ro, vec3 rd, float k){ float r=1., t=.02; for(int i=0;i<90;i++){ float h=mapS(ro+rd*t).x; r=min(r,k*h/t); t+=clamp(h,.01,.3); if(r<.001||t>12.) break; } return clamp(r,0.,1.); }
float aoS(vec3 p, vec3 n){ float o=0., s=1.; for(int i=1;i<=6;i++){ float h=.05*float(i); o+=(h-mapS(p+n*h).x)*s; s*=.8; } return clamp(1.-2.2*o,0.,1.); }
void mainImage(out vec4 o, vec2 fc){
  vec2 uv = (fc - .5*uRes)/uRes.y; vec2 q = fc/uRes;
  vec3 ro = vec3(.4,2.6,7.6), rd = camLook(ro, vec3(-.1,.85,0.))*normalize(vec3(uv,2.05));
  float t=0.; vec2 h;
  for(int i=0;i<200;i++){ h=mapS(ro+rd*t); if(h.x<.0005||t>30.) break; t+=h.x; }
  vec3 col = vec3(.8,.77,.73);
  if(t<30.){
    vec3 p=ro+rd*t, n=nS(p);
    vec3 L = normalize(vec3(-.6,1.,.55));
    float dif = clamp(dot(n,L),0.,1.)*softSh(p+n*.002, L, 9.);
    float ao = aoS(p,n);
    vec3 alb = vec3(.80,.77,.72);
    if(h.y==1.) alb = vec3(.86,.84,.8);
    if(h.y==2.) alb = vec3(1.,.27,.06);
    if(h.y==3.) alb = vec3(.07,.07,.075);
    vec3 lin = vec3(1.,.96,.9)*2.1*dif + vec3(.62,.66,.75)*.62*ao*(.6+.4*n.y) + vec3(.9,.82,.75)*.25*ao*clamp(dot(n,normalize(vec3(.8,.2,.6))),0.,1.);
    col = alb*lin;
    if(h.y>=2.){ vec3 r = reflect(rd,n); float fr=.04+.96*pow(1.-clamp(dot(n,-rd),0.,1.),5.);
      float spec = pow(clamp(dot(r,L),0.,1.),60.)*softSh(p+n*.002, L, 9.);
      col += vec3(1.)*spec*1.5 + vec3(.8,.78,.75)*fr*.35*ao; }
    if(h.y==2.) col += vec3(1.,.3,.07)*.12; // subsurface-ish glow
    // bounce of ember onto floor
    col += vec3(1.,.3,.08)*.18*exp(-1.6*length(p-vec3(1.05,.0,.75)))*step(h.y,.5);
  }
  col = aces(col*.95);
  col *= vignette(q,.25);
  col = toSRGB(col);
  o = vec4(grain(col, fc, .022),1.);
}
