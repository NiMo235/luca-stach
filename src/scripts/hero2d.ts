/* ------------------------------------------------------------------ */
/* Cheap 2D fallback hero background (small screens / save-data):      */
/* a lightweight drifting particle field with proximity lines.         */
/* ------------------------------------------------------------------ */

export function mountHero2d(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    canvas.remove();
    return;
  }
  const host = canvas.parentElement ?? canvas;
  const dpr = Math.min(window.devicePixelRatio || 1, 1.5);

  let w = 0;
  let h = 0;
  const resize = () => {
    w = host.clientWidth;
    h = host.clientHeight;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  resize();
  window.addEventListener('resize', resize);

  const COUNT = 42;
  const pts = Array.from({ length: COUNT }, () => ({
    x: Math.random() * w,
    y: Math.random() * h,
    vx: (Math.random() - 0.5) * 0.25,
    vy: (Math.random() - 0.5) * 0.25,
  }));

  let visible = true;
  new IntersectionObserver(
    (entries) => {
      visible = entries[0]?.isIntersecting ?? true;
    },
    { rootMargin: '100px' },
  ).observe(host);

  const frame = () => {
    requestAnimationFrame(frame);
    if (document.hidden || !visible) return;
    ctx.clearRect(0, 0, w, h);

    for (const p of pts) {
      p.x += p.vx;
      p.y += p.vy;
      if (p.x < 0 || p.x > w) p.vx *= -1;
      if (p.y < 0 || p.y > h) p.vy *= -1;
    }

    for (let i = 0; i < COUNT; i++) {
      for (let j = i + 1; j < COUNT; j++) {
        const dx = pts[i].x - pts[j].x;
        const dy = pts[i].y - pts[j].y;
        const d2 = dx * dx + dy * dy;
        if (d2 < 110 * 110) {
          const a = (1 - Math.sqrt(d2) / 110) * 0.12;
          ctx.strokeStyle = `rgba(138, 145, 134, ${a})`;
          ctx.beginPath();
          ctx.moveTo(pts[i].x, pts[i].y);
          ctx.lineTo(pts[j].x, pts[j].y);
          ctx.stroke();
        }
      }
    }
    ctx.fillStyle = 'rgba(180, 255, 57, 0.55)';
    for (const p of pts) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 1.4, 0, Math.PI * 2);
      ctx.fill();
    }
  };
  requestAnimationFrame(frame);
}
