// Black monolith, ember halo, wet reflective floor, fog
float sdBox(vec3 p, vec3 b){ vec3 q=abs(p)-b; return length(max(q,0.))+min(max(q.x,max(q.y,q.z)),0.); }
float mapM(vec3 p){ vec3 q=p-vec3(0.,1.55,0.); q.xz*=rot(.55); return sdBox(q, vec3(.42,1.55,.11))-.01; }
vec3 nM(vec3 p){ vec2 e=vec2(.001,0.); return normalize(vec3(mapM(p+e.xyy)-mapM(p-e.xyy),mapM(p+e.yxy)-mapM(p-e.yxy),mapM(p+e.yyx)-mapM(p-e.yyx))); }
vec3 bg(vec3 rd){
  // ring of light behind the slab
  vec3 c = vec3(.012,.008,.01);
  vec2 a = vec2(rd.x, rd.y-.13);
  float r = length(a);
  c += vec3(1.,.36,.1)*1.8*smoothstep(.006,0.,abs(r-.19));
  c += vec3(1.,.35,.12)*.55*exp(-abs(r-.19)*18.);
  c += vec3(.9,.25,.08)*.05*exp(-r*4.);
  return c;
}
float traceM(vec3 ro, vec3 rd){ float t=0.; for(int i=0;i<120;i++){ float d=mapM(ro+rd*t); if(d<.0005) return t; t+=d; if(t>40.) break; } return -1.; }
vec3 shadeM(vec3 ro, vec3 rd){
  float t = traceM(ro,rd);
  vec3 c = bg(rd);
  if(t>0.){
    vec3 p=ro+rd*t, n=nM(p);
    float fr = pow(1.-clamp(dot(n,-rd),0.,1.),4.);
    c = vec3(.01) + bg(reflect(rd,n))*(.04+.9*fr);
    // edge rim from halo
    c += vec3(1.,.4,.15)*.25*pow(1.-abs(dot(n,normalize(vec3(0.,.2,-1.)))),6.)*smoothstep(0.,2.,p.y);
  }
  return c;
}
void mainImage(out vec4 o, vec2 fc){
  vec2 uv = (fc - .5*uRes)/uRes.y; vec2 q = fc/uRes;
  vec3 ro = vec3(0.,1.25,6.5), rd = camLook(ro, vec3(0.,1.75,0.))*normalize(vec3(uv,1.75));
  vec3 col;
  float tf = -ro.y/rd.y;
  float tm = traceM(ro,rd);
  if(rd.y<0. && (tm<0. || tf<tm)){
    vec3 p = ro+rd*tf;
    vec3 n = normalize(vec3(.02*(noise(p.xz*6.)-.5), 1., .02*(noise(p.xz*6.+3.)-.5)));
    vec3 rr = reflect(rd,n);
    float wet = smoothstep(.35,.65,fbm(p.xz*.7));
    vec3 refl = shadeM(p+n*.002, rr);
    float fr = .04+.96*pow(1.-clamp(dot(n,-rd),0.,1.),5.);
    col = refl*mix(.25,.95,wet)*mix(.4,1.,fr) + vec3(.008,.006,.006);
    col *= exp(-.03*tf*tf*.02);
    // contact shadow
    col *= mix(.25,1., smoothstep(.0,.9,length((p.xz)*vec2(.9,2.))));
    col = mix(col, vec3(.05,.02,.015), 1.-exp(-tf*.045));
  } else col = shadeM(ro,rd);
  // volumetric haze from the halo
  col += vec3(1.,.35,.1)*.035*exp(-length(uv-vec2(0.,.1))*3.);
  col = aces(col*1.15);
  col *= vignette(q,.4);
  col = toSRGB(col);
  o = vec4(grain(col, fc, .03),1.);
}
