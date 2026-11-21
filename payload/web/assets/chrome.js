/* V1 liquid chrome: one WebGL fragment shader shared by setup, settings and the live wallpaper.
   V1Chrome(canvas, {style, scale, fps, cx, cy, size, mouse}) -> {start, stop, frame, set, destroy}
   - scale: render resolution relative to CSS pixels (wallpaper uses ~0.6, the GPU cost drops with the square)
   - fps:   frame cap; frames between ticks are skipped entirely, not rendered and thrown away */
(function () {
  "use strict";

  var VS = "attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}";
  var FS = [
    "precision highp float;",
    "uniform vec2 r;uniform float t;uniform vec2 m;uniform float mono;uniform vec2 c;uniform float sz;",
    "float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}",
    "float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);",
    " return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y);}",
    "float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<5;i++){v+=a*n(p);p=p*2.03+vec2(1.7,9.2);a*=.5;}return v;}",
    "void main(){",
    " vec2 uv=(gl_FragCoord.xy-.5*r)/r.y; uv-=c; uv+=m*.06; uv/=sz;",
    " float tt=t*.35;",
    " vec2 q=vec2(fbm(uv*1.4+tt*.3),fbm(uv*1.4+vec2(5.2,1.3)-tt*.25));",
    " vec2 w=vec2(fbm(uv*1.4+2.6*q+vec2(1.7,9.2)+tt*.4),fbm(uv*1.4+2.6*q+vec2(8.3,2.8)-tt*.2));",
    " float f=fbm(uv*1.4+2.8*w);",
    " float d=length(uv*vec2(.9,1.25))+(f-.5)*.9;",
    " float body=smoothstep(.50,.40,d);",
    " float band=sin(f*22.+w.x*6.+tt*2.);",
    " float spec=pow(abs(band),7.);",
    " vec3 film=.55+.45*cos(6.2831*(vec3(.0,.33,.67)+f*1.6+w.y*.8+tt*.15));",
    " film=mix(film,vec3(dot(film,vec3(.30,.40,.30)))*vec3(.92,.97,1.06),mono);",
    " vec3 col=mix(vec3(.03,.04,.07),vec3(.80,.88,1.),spec);",
    " col=mix(col,film,.42*smoothstep(.15,.95,abs(band))*smoothstep(.2,.7,f));",
    " col+=pow(max(0.,1.-abs(band)),18.)*vec3(.6,.9,1.)*.7;",
    " col*=body;",
    " col+=vec3(.05,.35,.55)*mix(1.,.35,mono)*smoothstep(1.1,.2,d)*.12;",
    " gl_FragColor=vec4(col,1.);",
    "}"
  ].join("\n");

  function V1Chrome(canvas, opts) {
    opts = opts || {};
    var o = {
      style: opts.style || "chrome",
      scale: opts.scale || 1,
      fps: opts.fps || 60,
      cx: opts.cx == null ? 0.28 : opts.cx,
      cy: opts.cy == null ? 0.06 : opts.cy,
      size: opts.size || 1,
      mouse: opts.mouse !== false
    };
    var gl = null;
    try { gl = canvas.getContext("webgl", { antialias: false, alpha: false, preserveDrawingBuffer: !!opts.still, powerPreference: "low-power" }); } catch (e) { gl = null; }

    var running = false, raf = 0, last = 0, clock = opts.time || 0, prev = 0;
    var mx = 0, my = 0, tx = 0, ty = 0;
    var U = null;

    if (gl) {
      var sh = function (type, src) {
        var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { throw new Error(gl.getShaderInfoLog(s)); }
        return s;
      };
      try {
        var pr = gl.createProgram();
        gl.attachShader(pr, sh(gl.VERTEX_SHADER, VS));
        gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FS));
        gl.linkProgram(pr);
        if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) { throw new Error(gl.getProgramInfoLog(pr)); }
        gl.useProgram(pr);
        var b = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, b);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
        var loc = gl.getAttribLocation(pr, "p");
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
        U = {};
        ["r", "t", "m", "mono", "c", "sz"].forEach(function (k) { U[k] = gl.getUniformLocation(pr, k); });
      } catch (err) {
        if (window.console) { console.warn("V1Chrome: falling back to a still gradient", err); }
        gl = null;
      }
    }
    if (!gl) {
      canvas.style.background = "radial-gradient(60% 70% at 66% 42%, #3a5a7a 0%, #16263a 35%, #060a10 70%)";
    }

    if (o.mouse && canvas.parentElement) {
      canvas.parentElement.addEventListener("pointermove", function (e) {
        var R = canvas.getBoundingClientRect();
        if (!R.width) { return; }
        tx = (e.clientX - R.left) / R.width - 0.5;
        ty = -((e.clientY - R.top) / R.height - 0.5);
      });
    }

    function size() {
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      var w = Math.max(1, Math.round(canvas.clientWidth * dpr * o.scale));
      var h = Math.max(1, Math.round(canvas.clientHeight * dpr * o.scale));
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
      return [w, h];
    }

    function frame(t) {
      if (!gl || !canvas.clientWidth) { return; }
      var s = size();
      mx += (tx - mx) * 0.05; my += (ty - my) * 0.05;
      gl.viewport(0, 0, s[0], s[1]);
      gl.uniform2f(U.r, s[0], s[1]);
      gl.uniform1f(U.t, t);
      gl.uniform2f(U.m, mx, my);
      gl.uniform1f(U.mono, o.style === "mono" ? 1 : 0);
      gl.uniform2f(U.c, o.cx, o.cy);
      gl.uniform1f(U.sz, o.size);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    function loop(now) {
      if (!running) { return; }
      raf = requestAnimationFrame(loop);
      var minGap = 1000 / o.fps - 2;
      if (now - last < minGap) { return; }
      var dt = prev ? Math.min(now - prev, 100) : 16;
      prev = now; last = now;
      clock += dt / 1000;
      frame(clock);
    }

    return {
      get hasGL() { return !!gl; },
      start: function () {
        if (running || !gl) { return; }
        running = true; prev = 0; last = 0;
        raf = requestAnimationFrame(loop);
      },
      stop: function () { running = false; cancelAnimationFrame(raf); },
      frame: function (t) { if (t != null) { clock = t; } frame(clock); },
      set: function (k, v) { o[k] = v; if (!running) { frame(clock); } },
      destroy: function () {
        this.stop();
        if (gl && gl.getExtension("WEBGL_lose_context")) { gl.getExtension("WEBGL_lose_context").loseContext(); }
      }
    };
  }

  window.V1Chrome = V1Chrome;
})();
