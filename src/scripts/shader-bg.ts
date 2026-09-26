/* ------------------------------------------------------------------ */
/* Full-viewport WebGL shader background                               */
/* Custom GLSL: faint acid plasma drifting over a faint grid,          */
/* gently warped around the pointer. Falls back to the plain CSS       */
/* grid/noise (canvas removed) when WebGL or motion is unavailable.    */
/* ------------------------------------------------------------------ */

const VERT = `
attribute vec2 a_pos;
void main() {
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;

const FRAG = `
precision mediump float;
uniform vec2 u_res;
uniform float u_time;
uniform vec2 u_mouse;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),
    f.y
  );
}
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * noise(p);
    p = p * 2.03 + vec2(13.7, 9.2);
    a *= 0.5;
  }
  return v;
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_res.xy;
  vec2 asp = vec2(u_res.x / u_res.y, 1.0);
  vec2 p = uv * asp * 2.2;

  vec2 m = u_mouse;
  vec2 dm = (uv - m) * asp;
  float md = length(dm);
  p += (dm / max(md, 0.001)) * 0.28 * exp(-md * 5.5);

  float t = u_time * 0.06;
  float warp = fbm(p * 1.4 - t * 0.7);
  float n = fbm(p + vec2(t, -t * 0.55) + warp * 0.9);

  vec2 g = fract(gl_FragCoord.xy / 48.0);
  float grid = (1.0 - smoothstep(0.0, 0.05, min(g.x, g.y))) * 0.5;

  vec3 ink = vec3(0.040, 0.051, 0.040);
  vec3 acid = vec3(0.706, 1.0, 0.224);

  float glow = smoothstep(0.42, 0.95, n) * 0.85;
  float mGlow = exp(-md * 4.5);

  vec3 col = ink;
  col += acid * glow * 0.14;
  col += acid * grid * 0.045;
  col += acid * mGlow * 0.05 * (0.4 + 0.6 * glow);

  float vig = smoothstep(1.05, 0.25, length((uv - 0.5) * asp * 1.4));
  col *= mix(0.82, 1.0, vig);

  gl_FragColor = vec4(col, 1.0);
}
`;

export function initShaderBackground(prefersReducedMotion: boolean): void {
  if (prefersReducedMotion) return;

  const canvas = document.getElementById('bg-shader') as HTMLCanvasElement | null;
  if (!canvas) return;

  const gl = canvas.getContext('webgl', {
    antialias: false,
    depth: false,
    stencil: false,
    alpha: false,
    powerPreference: 'low-power',
  });
  if (!gl) {
    canvas.remove();
    return;
  }

  const compile = (type: number, src: string): WebGLShader | null => {
    const sh = gl.createShader(type);
    if (!sh) return null;
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) return null;
    return sh;
  };

  const vs = compile(gl.VERTEX_SHADER, VERT);
  const fs = compile(gl.FRAGMENT_SHADER, FRAG);
  const prog = gl.createProgram();
  if (!vs || !fs || !prog) {
    canvas.remove();
    return;
  }
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    canvas.remove();
    return;
  }
  gl.useProgram(prog);

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'a_pos');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

  const uRes = gl.getUniformLocation(prog, 'u_res');
  const uTime = gl.getUniformLocation(prog, 'u_time');
  const uMouse = gl.getUniformLocation(prog, 'u_mouse');

  const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  const resize = () => {
    const w = Math.floor(window.innerWidth * dpr);
    const h = Math.floor(window.innerHeight * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      gl.viewport(0, 0, w, h);
    }
  };
  resize();
  window.addEventListener('resize', resize);

  // smoothed pointer
  let mx = 0.5;
  let my = 0.5;
  let tx = 0.5;
  let ty = 0.5;
  window.addEventListener('pointermove', (e) => {
    tx = e.clientX / window.innerWidth;
    ty = 1 - e.clientY / window.innerHeight;
  });

  // render only while the hero is on (or barely off) screen
  let heroVisible = true;
  const hero = document.getElementById('top');
  if (hero && 'IntersectionObserver' in window) {
    new IntersectionObserver(
      (entries) => {
        heroVisible = entries[0]?.isIntersecting ?? true;
      },
      { rootMargin: '0px 0px 100% 0px' },
    ).observe(hero);
  }

  let raf = 0;
  let last = 0;
  let running = false;
  const FRAME_MS = 33; // ~30fps is plenty for a background

  const frame = (now: number) => {
    raf = requestAnimationFrame(frame);
    if (document.hidden || !heroVisible) {
      last = now;
      return;
    }
    if (now - last < FRAME_MS) return;
    last = now;
    mx += (tx - mx) * 0.06;
    my += (ty - my) * 0.06;
    gl.uniform2f(uRes, canvas.width, canvas.height);
    gl.uniform1f(uTime, now * 0.001);
    gl.uniform2f(uMouse, mx, my);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };

  const start = () => {
    if (!running) {
      running = true;
      raf = requestAnimationFrame(frame);
    }
  };
  const stop = () => {
    running = false;
    cancelAnimationFrame(raf);
  };
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stop();
    else start();
  });
  start();
}
