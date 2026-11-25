// Ember dunes under a huge low sun
float H(vec2 p){
  vec2 w = p + 6.*vec2(fbm(p*.025), fbm(p*.025+5.2));
  float s = sin(w.x*.16 + .9*sin(w.y*.05));
  float h = 2.6*pow(1.-abs(s), 1.5);
  h += 2.2*fbm(p*.018);
  h += .035*sin(p.x*2.6+p.y*1.1 + 3.*noise(p*.4));
  return h;
}
vec3 nH(vec2 p){ vec2 e=vec2(.02,0.); return normalize(vec3(H(p-e.xy)-H(p+e.xy), 2.*e.x, H(p-e.yx)-H(p+e.yx))); }
void mainImage(out vec4 o, vec2 fc){
  vec2 uv = (fc - .5*uRes)/uRes.y; vec2 q = fc/uRes;
  vec3 sun = normalize(vec3(.42,.05,1.));
  vec3 ro = vec3(3.,3.4,0.), rd = camLook(ro, ro+vec3(0.,-.04,1.))*normalize(vec3(uv,1.5));
  // sky
  float sd = max(dot(rd,sun),0.);
  vec3 sky = mix(vec3(.62,.18,.06), vec3(.02,.01,.016), pow(clamp(rd.y*4.+.01,0.,1.),.6));
  sky += vec3(1.,.5,.2)*pow(sd,40.)*.7 + vec3(1.,.4,.15)*pow(sd,6.)*.18;
  sky = mix(sky, vec3(1.,.5,.22)*1.6, smoothstep(.9978,.9981,sd));
  sky += vec3(.4,.3,.25)*.12*fbm(vec2(rd.x*3., rd.y*28.))*smoothstep(.25,.02,rd.y); // haze bands
  vec3 col = sky;
  float t = .5, hit = 0.;
  for(int i=0;i<700;i++){
    vec3 p = ro+rd*t; float h = p.y - H(p.xz);
    if(h<.0008*t){ hit=1.; break; }
    t += max(.22*h, .003*t); if(t>260.) break;
  }
  if(hit>.5){
    vec3 p = ro+rd*t, n = nH(p.xz);
    float dif = clamp(dot(n,sun),0.,1.);
    float sh = 1.; float st=.1; for(int i=0;i<60;i++){ vec3 sp=p+sun*st; float hh = sp.y-H(sp.xz); sh = min(sh, 12.*hh/st); st += clamp(hh,.05,1.2); if(sh<0.||st>60.) break; } sh = clamp(sh,0.,1.);
    vec3 alb = vec3(.78,.40,.22)*(.85+.3*noise(p.xz*3.));
    vec3 lin = vec3(1.,.5,.25)*2.6*dif*sh;
    lin += vec3(.16,.07,.07)*(.5+.5*n.y)*.35;                                   // sky ambient
    lin += vec3(.9,.35,.15)*.35*pow(clamp(1.-dot(n,-rd),0.,1.),3.)*sd;           // rim toward sun
    col = alb*lin;
    float fog = 1.-exp(-t*.0055);
    vec3 fogc = mix(vec3(.3,.09,.04), vec3(1.,.42,.16), pow(sd,10.));
    col = mix(col, fogc, fog);
  }
  col = aces(col*.75);
  col *= vignette(q,.28);
  col = toSRGB(col);
  o = vec4(grain(col, fc, .03),1.);
}
