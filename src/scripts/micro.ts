/* ------------------------------------------------------------------ */
/* Physics-feel micro-interactions (desktop fine pointers only)        */
/* Magnetic pull on CTAs/contact tiles, 3D tilt on work cards,         */
/* acid particle trail behind the existing custom cursor.              */
/* ------------------------------------------------------------------ */

const finePointer = () =>
  window.matchMedia('(pointer: fine)').matches &&
  !window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---- magnetic pull ---- */
function setupMagnetic(): void {
  const els = Array.from(document.querySelectorAll<HTMLElement>('[data-magnetic]'));
  if (!els.length) return;

  const states = new Map<HTMLElement, { x: number; y: number; tx: number; ty: number }>();
  els.forEach((el) => states.set(el, { x: 0, y: 0, tx: 0, ty: 0 }));

  let running = false;
  const loop = () => {
    let active = false;
    states.forEach((s, el) => {
      s.x += (s.tx - s.x) * 0.18;
      s.y += (s.ty - s.y) * 0.18;
      if (
        Math.abs(s.x) > 0.05 ||
        Math.abs(s.y) > 0.05 ||
        Math.abs(s.tx) > 0.05 ||
        Math.abs(s.ty) > 0.05
      ) {
        active = true;
      }
      el.style.transform = `translate(${s.x.toFixed(2)}px, ${s.y.toFixed(2)}px)`;
    });
    if (active) requestAnimationFrame(loop);
    else running = false;
  };
  const kick = () => {
    if (!running) {
      running = true;
      requestAnimationFrame(loop);
    }
  };

  els.forEach((el) => {
    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2);
      const dy = e.clientY - (r.top + r.height / 2);
      const dist = Math.hypot(dx, dy);
      const radius = Math.max(r.width, 130);
      const s = states.get(el)!;
      if (dist < radius) {
        const f = 1 - dist / radius;
        s.tx = dx * 0.32 * f;
        s.ty = dy * 0.32 * f;
      } else {
        s.tx = 0;
        s.ty = 0;
      }
      kick();
    });
    el.addEventListener('pointerleave', () => {
      const s = states.get(el)!;
      s.tx = 0;
      s.ty = 0;
      kick();
    });
  });
}

/* ---- 3D tilt on work cards ---- */
function setupTilt(): void {
  document.querySelectorAll<HTMLElement>('[data-tilt]').forEach((card) => {
    card.classList.add('tilt-on');
    let rx = 0;
    let ry = 0;
    let trx = 0;
    let try_ = 0;
    let hovering = false;
    let raf = 0;

    const loop = () => {
      rx += (trx - rx) * 0.14;
      ry += (try_ - ry) * 0.14;
      card.style.transform = `perspective(900px) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg)`;
      if (hovering || Math.abs(rx) > 0.05 || Math.abs(ry) > 0.05) {
        raf = requestAnimationFrame(loop);
      } else {
        card.style.transform = '';
        raf = 0;
      }
    };
    const kick = () => {
      if (!raf) raf = requestAnimationFrame(loop);
    };

    card.addEventListener('pointermove', (e) => {
      const r = card.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width;
      const py = (e.clientY - r.top) / r.height;
      trx = (0.5 - py) * 6.5;
      try_ = (px - 0.5) * 8.5;
      card.style.setProperty('--gx', `${(px * 100).toFixed(1)}%`);
      card.style.setProperty('--gy', `${(py * 100).toFixed(1)}%`);
      hovering = true;
      card.classList.add('is-tilting');
      kick();
    });
    card.addEventListener('pointerleave', () => {
      hovering = false;
      trx = 0;
      try_ = 0;
      card.classList.remove('is-tilting');
      kick();
    });
  });
}

/* ---- cursor particle trail ---- */
function setupCursorTrail(): void {
  const canvas = document.getElementById('cursor-trail') as HTMLCanvasElement | null;
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  document.documentElement.classList.add('trail-on');

  const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  const resize = () => {
    canvas.width = Math.floor(window.innerWidth * dpr);
    canvas.height = Math.floor(window.innerHeight * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  resize();
  window.addEventListener('resize', resize);

  interface Dot {
    x: number;
    y: number;
    life: number;
  }
  const dots: Dot[] = [];
  let lastX = -1;
  let lastY = -1;

  window.addEventListener('pointermove', (e) => {
    if (lastX >= 0 && Math.hypot(e.clientX - lastX, e.clientY - lastY) < 7) return;
    lastX = e.clientX;
    lastY = e.clientY;
    if (dots.length > 70) dots.shift();
    dots.push({ x: e.clientX, y: e.clientY, life: 1 });
  });
  document.addEventListener('mouseleave', () => dots.splice(0));

  const frame = () => {
    requestAnimationFrame(frame);
    if (document.hidden) return;
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    for (let i = dots.length - 1; i >= 0; i--) {
      const d = dots[i];
      d.life -= 0.028;
      if (d.life <= 0) {
        dots.splice(i, 1);
        continue;
      }
      ctx.beginPath();
      ctx.arc(d.x, d.y, 2.6 * d.life, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(180, 255, 57, ${(d.life * 0.45).toFixed(3)})`;
      ctx.fill();
    }
  };
  requestAnimationFrame(frame);
}

export function initMicro(): void {
  if (!finePointer()) return;
  setupMagnetic();
  setupTilt();
  setupCursorTrail();
}
