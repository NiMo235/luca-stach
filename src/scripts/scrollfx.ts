/* ------------------------------------------------------------------ */
/* GSAP + ScrollTrigger choreography                                   */
/* Dynamically imported so it never blocks initial paint; the existing */
/* IntersectionObserver reveals in main.ts stay as the fallback when   */
/* GSAP is unavailable or motion is reduced.                           */
/* ------------------------------------------------------------------ */

export async function initScrollFx(): Promise<boolean> {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;

  try {
    const { gsap } = await import('gsap');
    const { ScrollTrigger } = await import('gsap/ScrollTrigger');
    gsap.registerPlugin(ScrollTrigger);
    document.documentElement.classList.add('gsap');

    /* ---- staggered section reveals (inline styles override the       ----
       ---- .reveal CSS, so the CSS transition must not fight the tween) ---- */
    ScrollTrigger.batch('.reveal', {
      start: 'top 88%',
      once: true,
      onEnter: (batch) =>
        gsap.fromTo(
          batch,
          { y: 36, autoAlpha: 0 },
          {
            y: 0,
            autoAlpha: 1,
            duration: 0.9,
            ease: 'power3.out',
            stagger: 0.08,
            overwrite: true,
          },
        ),
    });

    /* ---- subtle parallax on decorative layers ---- */
    document.querySelectorAll<HTMLElement>('[data-parallax]').forEach((el) => {
      const strength = Number(el.dataset.parallax) || 12;
      gsap.fromTo(
        el,
        { y: -strength },
        {
          y: strength,
          ease: 'none',
          scrollTrigger: {
            trigger: el.closest('section') ?? el,
            start: 'top bottom',
            end: 'bottom top',
            scrub: 0.6,
          },
        },
      );
    });

    return true;
  } catch {
    return false;
  }
}
