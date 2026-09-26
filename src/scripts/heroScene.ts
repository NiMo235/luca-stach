/* ------------------------------------------------------------------ */
/* Hero scene orchestrator                                             */
/* Lazy-mounts the interactive 3D "logistics network" only when the    */
/* hero approaches the viewport. Small screens / coarse pointers /     */
/* data-saver get a cheap 2D canvas particle field instead.            */
/* ------------------------------------------------------------------ */

export function initHeroScene(prefersReducedMotion: boolean): void {
  if (prefersReducedMotion) return;

  const canvas = document.querySelector<HTMLCanvasElement>('[data-hero-3d]');
  const section = document.getElementById('top');
  if (!canvas || !section) return;

  const nav = navigator as Navigator & { connection?: { saveData?: boolean } };
  const cheap =
    window.matchMedia('(max-width: 768px)').matches ||
    window.matchMedia('(pointer: coarse)').matches ||
    Boolean(nav.connection?.saveData);

  let loaded = false;
  const io = new IntersectionObserver(
    (entries) => {
      if (loaded || !entries.some((e) => e.isIntersecting)) return;
      loaded = true;
      io.disconnect();
      const load = cheap
        ? import('./hero2d').then((m) => m.mountHero2d(canvas))
        : import('./hero3d').then((m) => m.mountHero3d(canvas, section));
      load.catch(() => canvas.remove());
    },
    { rootMargin: '250px' },
  );
  io.observe(section);
}
