import { state } from "../state.mjs";

export function mapWeatherToAtmosphereMode(weather) {
  if (weather === "rainy") return 0;
  if (weather === "sunny") return 1;
  if (weather === "snowy") return 3;
  return 2;
}

export function createAiAtmosphereRenderer(canvas, visual) {
  const gl = canvas.getContext("webgl", {
    alpha: true,
    antialias: true,
    premultipliedAlpha: true,
    powerPreference: "high-performance"
  });

  if (!gl) {
    return null;
  }

  const vertexShaderSource = `
    attribute vec2 aPosition;
    varying vec2 vUv;

    void main() {
      vUv = aPosition * 0.5 + 0.5;
      gl_Position = vec4(aPosition, 0.0, 1.0);
    }
  `;

  const fragmentShaderSource = `
    precision mediump float;
    varying vec2 vUv;

    uniform vec2 uResolution;
    uniform float uTime;
    uniform float uMode;
    uniform vec2 uMouse;
    uniform vec2 uMouseVel;
    uniform sampler2D uTrail;

    float hash11(float p) {
      p = fract(p * 0.1031);
      p *= p + 33.33;
      p *= p + p;
      return fract(p);
    }

    float hash21(vec2 p) {
      vec3 p3 = fract(vec3(p.xyx) * 0.1031);
      p3 += dot(p3, p3.yzx + 33.33);
      return fract((p3.x + p3.y) * p3.z);
    }

    vec2 hash22(vec2 p) {
      float n = hash21(p);
      return vec2(n, hash21(p + n + 17.1));
    }

    float noise(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      float a = hash21(i);
      float b = hash21(i + vec2(1.0, 0.0));
      float c = hash21(i + vec2(0.0, 1.0));
      float d = hash21(i + vec2(1.0, 1.0));
      vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
    }

    float fbm(vec2 p) {
      float value = 0.0;
      float amp = 0.5;
      for (int i = 0; i < 6; i++) {
        value += amp * noise(p);
        p *= 2.02;
        amp *= 0.5;
      }
      return value;
    }

    float voronoi(vec2 x) {
      vec2 n = floor(x);
      vec2 f = fract(x);
      float md = 8.0;

      for (int j = -1; j <= 1; j++) {
        for (int i = -1; i <= 1; i++) {
          vec2 g = vec2(float(i), float(j));
          vec2 o = hash22(n + g);
          o = 0.5 + 0.5 * sin(uTime * 0.18 + 6.2831 * o);
          vec2 r = g + o - f;
          float d = dot(r, r);
          md = min(md, d);
        }
      }

      return sqrt(md);
    }

    vec3 cityBase(vec2 uv) {
      vec2 q = uv;
      q.y += sin(uv.x * 3.2 + uTime * 0.18) * 0.01;
      vec3 c1 = vec3(0.07, 0.09, 0.14);
      vec3 c2 = vec3(0.22, 0.15, 0.20);
      vec3 c3 = vec3(0.09, 0.16, 0.24);
      vec3 gradient = mix(c1, c2, smoothstep(0.0, 0.55, q.y));
      gradient = mix(gradient, c3, smoothstep(0.35, 1.0, q.x));

      float neon = fbm(q * vec2(6.0, 10.0) + vec2(0.0, uTime * 0.08));
      float glow = smoothstep(0.55, 1.0, neon);
      gradient += vec3(0.16, 0.06, 0.14) * glow * 0.75;
      gradient += vec3(0.04, 0.12, 0.18) * smoothstep(0.35, 1.0, noise(q * 8.0 + uTime * 0.02));
      return gradient;
    }

    vec2 rainNormal(vec2 uv, float t) {
      vec2 n = vec2(0.0);
      vec2 p1 = uv * vec2(2.8, 4.2);
      p1.y += t * 0.42;
      vec2 id1 = floor(p1);
      vec2 gv1 = fract(p1) - 0.5;
      float r1 = hash21(id1);
      gv1.x += (r1 - 0.5) * 0.36;
      gv1.y += sin(t * 2.2 + r1 * 6.2831) * 0.12;
      float d1 = length(gv1 * vec2(1.0, 1.8));
      float m1 = smoothstep(0.25, 0.0, d1);
      n += normalize(gv1 + 0.0001) * m1 * 0.08;

      vec2 p2 = uv * vec2(4.8, 6.3);
      p2.y += t * 0.66;
      vec2 id2 = floor(p2);
      vec2 gv2 = fract(p2) - 0.5;
      float r2 = hash21(id2 + 13.7);
      gv2.x += (r2 - 0.5) * 0.44;
      float d2 = length(gv2 * vec2(1.0, 2.2));
      float m2 = smoothstep(0.18, 0.0, d2);
      n += normalize(gv2 + 0.0001) * m2 * 0.05;

      return n;
    }

    vec3 renderRainy(vec2 uv) {
      float t = uTime;
      vec2 px = 1.0 / max(uResolution, vec2(1.0));
      float trail = texture2D(uTrail, uv).r;
      float trailX1 = texture2D(uTrail, uv + vec2(px.x * 2.0, 0.0)).r;
      float trailX2 = texture2D(uTrail, uv - vec2(px.x * 2.0, 0.0)).r;
      float trailY1 = texture2D(uTrail, uv + vec2(0.0, px.y * 2.0)).r;
      float trailY2 = texture2D(uTrail, uv - vec2(0.0, px.y * 2.0)).r;
      vec2 trailGrad = vec2(trailX1 - trailX2, trailY1 - trailY2);

      vec2 rn = rainNormal(uv, t) + trailGrad * 0.28;
      float clear = smoothstep(0.08, 0.75, trail);
      vec2 dUv = clamp(uv + rn * (1.0 - clear * 0.82), 0.0, 1.0);

      vec3 base = cityBase(dUv);
      vec3 sharp = cityBase(uv);
      vec3 col = mix(base, sharp, clear * 0.75);

      float mist = fbm(uv * 5.0 + vec2(0.0, t * 0.07));
      col += vec3(0.08, 0.1, 0.12) * (1.0 - clear) * mist * 0.55;
      col += vec3(0.02, 0.04, 0.08) * smoothstep(0.0, 1.0, uv.y) * 0.3;
      return col;
    }

    vec3 renderSunny(vec2 uv) {
      vec2 hazeUv = uv;
      float heatMask = smoothstep(0.48, 1.0, uv.y);
      float hazeNoise = fbm(uv * vec2(9.0, 14.0) + vec2(0.0, uTime * 0.35));
      hazeUv.x += (hazeNoise - 0.5) * 0.02 * heatMask;

      vec3 base = mix(vec3(0.92, 0.85, 0.72), vec3(0.96, 0.9, 0.78), smoothstep(0.0, 1.0, uv.y));
      base = mix(base, vec3(0.88, 0.79, 0.58), smoothstep(0.5, 1.0, hazeUv.y));

      vec2 lightPos = vec2(0.1, 0.04);
      vec2 toLight = uv - lightPos;
      float dist = length(toLight);
      float rays = 0.0;
      for (int i = 0; i < 24; i++) {
        float fi = float(i) / 24.0;
        vec2 sampleUv = lightPos + toLight * fi;
        float n = fbm(sampleUv * vec2(3.2, 5.0) + vec2(0.0, uTime * 0.04));
        rays += smoothstep(0.52, 0.95, n) * (1.0 - fi);
      }
      rays /= 24.0;
      float beam = exp(-dist * 2.8) * rays;
      base += vec3(1.0, 0.93, 0.74) * beam * 0.75;

      float dust = 0.0;
      for (int i = 0; i < 28; i++) {
        float fi = float(i);
        vec2 seed = hash22(vec2(fi, fi * 2.37));
        vec2 p = fract(vec2(seed.x + uTime * (0.002 + seed.y * 0.008), seed.y + uTime * (0.001 + seed.x * 0.006)));
        float d = length(uv - p);
        dust += smoothstep(0.015, 0.0, d) * (0.2 + 0.8 * seed.x);
      }
      base += vec3(1.0, 0.96, 0.86) * dust * 0.08;
      base += vec3(0.85, 0.62, 0.22) * heatMask * (hazeNoise - 0.5) * 0.12;
      return base;
    }

    vec3 renderCloudy(vec2 uv) {
      vec2 flow = uv * vec2(2.4, 1.6);
      flow += vec2(uTime * 0.03, -uTime * 0.015);
      float fogA = fbm(flow * 1.2);
      float fogB = fbm(flow * 2.8 + vec2(3.0, -2.0));
      float fog = mix(fogA, fogB, 0.45);

      vec3 fogColA = vec3(0.75, 0.79, 0.84);
      vec3 fogColB = vec3(0.58, 0.63, 0.71);
      vec3 col = mix(fogColA, fogColB, smoothstep(0.2, 0.9, fog));

      vec3 city = cityBase(uv);
      float l = dot(city, vec3(0.2126, 0.7152, 0.0722));
      vec3 diffuseCity = mix(city, vec3(l), 0.74);
      col = mix(col, diffuseCity + vec3(0.08), 0.34);

      float softBox = smoothstep(0.0, 0.6, 1.0 - abs(uv.y - 0.5));
      col += vec3(0.1, 0.11, 0.12) * softBox * 0.1;
      return col;
    }

    vec3 renderSnowy(vec2 uv) {
      vec3 col = mix(vec3(0.1, 0.14, 0.2), vec3(0.22, 0.26, 0.31), uv.y);
      col += vec3(0.05, 0.08, 0.11) * fbm(uv * 4.0 + uTime * 0.04);

      float snow = 0.0;
      float bokeh = 0.0;
      vec2 m = uMouse;
      float windPower = clamp(length(uMouseVel) * 45.0, 0.0, 2.0);

      for (int i = 0; i < 40; i++) {
        float fi = float(i);
        vec2 seed = hash22(vec2(fi * 1.17, fi * 3.71));
        float layer = fract(fi * 0.193);
        float speed = mix(0.08, 0.42, layer);
        vec2 p = fract(seed + vec2(sin(uTime * (0.07 + seed.x * 0.16)) * 0.08, -uTime * speed));
        vec2 delta = p - m;
        float repel = exp(-dot(delta, delta) * 45.0) * windPower;
        p += normalize(delta + 0.0001) * repel * 0.025;

        float size = mix(0.0025, 0.024, layer);
        float d = length(uv - p);
        float flake = smoothstep(size, 0.0, d);
        snow += flake * (0.35 + 0.65 * (1.0 - layer));

        float dofSize = mix(0.008, 0.05, layer * layer);
        float dof = smoothstep(dofSize, 0.0, d);
        bokeh += dof * layer;
      }

      col += vec3(0.82, 0.9, 1.0) * snow * 0.5;
      col += vec3(0.92, 0.95, 1.0) * bokeh * 0.32;

      float edgeDist = min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y));
      float edge = 1.0 - smoothstep(0.04, 0.22, edgeDist);
      float frostNoise = voronoi(uv * 16.0 + vec2(uTime * 0.04, -uTime * 0.03));
      float frost = edge * smoothstep(0.15, 0.85, frostNoise);
      col = mix(col, col + vec3(0.55, 0.62, 0.72) * 0.42, frost * 0.85);
      return col;
    }

    void main() {
      vec2 uv = vUv;
      vec3 color;

      if (uMode < 0.5) {
        color = renderRainy(uv);
      } else if (uMode < 1.5) {
        color = renderSunny(uv);
      } else if (uMode < 2.5) {
        color = renderCloudy(uv);
      } else {
        color = renderSnowy(uv);
      }

      float v = smoothstep(1.0, 0.18, distance(uv, vec2(0.5)));
      color *= mix(0.86, 1.0, v);
      gl_FragColor = vec4(color, 0.98);
    }
  `;

  const compileShader = (type, source) => {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const info = gl.getShaderInfoLog(shader) || "Shader compile error";
      gl.deleteShader(shader);
      throw new Error(info);
    }

    return shader;
  };

  let program;
  try {
    const vs = compileShader(gl.VERTEX_SHADER, vertexShaderSource);
    const fs = compileShader(gl.FRAGMENT_SHADER, fragmentShaderSource);
    program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(program) || "Program link error");
    }
  } catch {
    return null;
  }

  gl.useProgram(program);

  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);

  const aPosition = gl.getAttribLocation(program, "aPosition");
  gl.enableVertexAttribArray(aPosition);
  gl.vertexAttribPointer(aPosition, 2, gl.FLOAT, false, 0, 0);

  const uResolution = gl.getUniformLocation(program, "uResolution");
  const uTime = gl.getUniformLocation(program, "uTime");
  const uMode = gl.getUniformLocation(program, "uMode");
  const uMouse = gl.getUniformLocation(program, "uMouse");
  const uMouseVel = gl.getUniformLocation(program, "uMouseVel");
  const uTrail = gl.getUniformLocation(program, "uTrail");

  const trailCanvas = document.createElement("canvas");
  trailCanvas.width = 320;
  trailCanvas.height = 320;
  const trailCtx = trailCanvas.getContext("2d");
  if (!trailCtx) {
    return null;
  }

  const trailTexture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, trailTexture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, trailCanvas);

  const pointer = {
    x: 0.5,
    y: 0.5,
    px: 0.5,
    py: 0.5,
    vx: 0,
    vy: 0,
    lastMove: 0,
    down: false
  };

  const beginTime = performance.now();
  let mode = mapWeatherToAtmosphereMode(state.selections.weather);
  let rafId = 0;
  let running = false;
  let lastRender = 0;

  const updatePointer = (clientX, clientY) => {
    const rect = visual.getBoundingClientRect();
    if (!rect.width || !rect.height) {
      return;
    }

    const nx = (clientX - rect.left) / rect.width;
    const ny = (clientY - rect.top) / rect.height;
    const cx = Math.max(0, Math.min(1, nx));
    const cy = Math.max(0, Math.min(1, ny));
    pointer.vx = cx - pointer.x;
    pointer.vy = cy - pointer.y;
    pointer.px = pointer.x;
    pointer.py = pointer.y;
    pointer.x = cx;
    pointer.y = cy;
    pointer.lastMove = performance.now();
  };

  const paintTrail = () => {
    trailCtx.globalCompositeOperation = "source-over";
    trailCtx.fillStyle = "rgba(0,0,0,0.08)";
    trailCtx.fillRect(0, 0, trailCanvas.width, trailCanvas.height);

    const active = performance.now() - pointer.lastMove < 320;
    if (active) {
      const x = pointer.x * trailCanvas.width;
      const y = (1 - pointer.y) * trailCanvas.height;
      const px = pointer.px * trailCanvas.width;
      const py = (1 - pointer.py) * trailCanvas.height;

      trailCtx.strokeStyle = "rgba(255,255,255,0.55)";
      trailCtx.lineCap = "round";
      trailCtx.lineJoin = "round";
      trailCtx.lineWidth = 14 + Math.min(22, Math.hypot(pointer.vx, pointer.vy) * 520);
      trailCtx.beginPath();
      trailCtx.moveTo(px, py);
      trailCtx.lineTo(x, y);
      trailCtx.stroke();

      trailCtx.fillStyle = "rgba(255,255,255,0.28)";
      trailCtx.beginPath();
      trailCtx.arc(x, y, 18, 0, Math.PI * 2);
      trailCtx.fill();
    }

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, trailTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, trailCanvas);
  };

  const resize = () => {
    const rect = visual.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(2, Math.round(rect.width * dpr));
    canvas.height = Math.max(2, Math.round(rect.height * dpr));
    canvas.style.width = `${Math.max(1, rect.width)}px`;
    canvas.style.height = `${Math.max(1, rect.height)}px`;
    gl.viewport(0, 0, canvas.width, canvas.height);
    pointer.lastMove = performance.now();
  };

  const loop = (ts) => {
    if (!running) {
      return;
    }

    const idle = ts - pointer.lastMove > 2200;
    const targetFps = idle ? 12 : 48;
    const minFrameGap = 1000 / targetFps;

    if (ts - lastRender >= minFrameGap) {
      lastRender = ts;
      paintTrail();

      gl.useProgram(program);
      gl.uniform2f(uResolution, canvas.width, canvas.height);
      gl.uniform1f(uTime, (ts - beginTime) * 0.001);
      gl.uniform1f(uMode, mode);
      gl.uniform2f(uMouse, pointer.x, 1 - pointer.y);
      gl.uniform2f(uMouseVel, pointer.vx, -pointer.vy);
      gl.uniform1i(uTrail, 0);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      pointer.vx *= 0.9;
      pointer.vy *= 0.9;
    }

    rafId = window.requestAnimationFrame(loop);
  };

  const onPointerMove = (event) => {
    updatePointer(event.clientX, event.clientY);
  };
  const onPointerDown = (event) => {
    pointer.down = true;
    updatePointer(event.clientX, event.clientY);
  };
  const onPointerUp = () => {
    pointer.down = false;
  };
  const onPointerLeave = () => {
    pointer.down = false;
  };

  visual.addEventListener("pointermove", onPointerMove);
  visual.addEventListener("pointerdown", onPointerDown);
  visual.addEventListener("pointerup", onPointerUp);
  visual.addEventListener("pointerleave", onPointerLeave);
  window.addEventListener("resize", resize);

  resize();

  return {
    start: () => {
      if (running) {
        return;
      }
      running = true;
      pointer.lastMove = performance.now();
      rafId = window.requestAnimationFrame(loop);
    },
    stop: () => {
      running = false;
      if (rafId) {
        window.cancelAnimationFrame(rafId);
        rafId = 0;
      }
    },
    setWeather: (weather) => {
      mode = mapWeatherToAtmosphereMode(weather);
      pointer.lastMove = performance.now();
    },
    poke: () => {
      pointer.lastMove = performance.now();
    },
    destroy: () => {
      window.removeEventListener("resize", resize);
      visual.removeEventListener("pointermove", onPointerMove);
      visual.removeEventListener("pointerdown", onPointerDown);
      visual.removeEventListener("pointerup", onPointerUp);
      visual.removeEventListener("pointerleave", onPointerLeave);

      if (rafId) {
        window.cancelAnimationFrame(rafId);
      }

      gl.deleteTexture(trailTexture);
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    }
  };
}
