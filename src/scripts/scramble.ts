/* ------------------------------------------------------------------ */
/* Decoder / text-scramble effects                                     */
/* Reads the final copy straight from the DOM so both locales work     */
/* unchanged. Hero headline resolves when the boot sequence finishes   */
/* (easter-egg reruns included); section headings scramble in on       */
/* scroll.                                                             */
/* ------------------------------------------------------------------ */

const GLYPHS = '!<>-_\\/[]{}=+*^?#01';

function scramble(el: HTMLElement, duration = 700, delay = 0): void {
  const original = el.dataset.scrambleText ?? el.textContent ?? '';
  el.dataset.scrambleText = original;

  // never run two scrambles on the same node at once
  if (el.dataset.scrambling === '1') return;
  el.dataset.scrambling = '1';

  const chars = [...original];
  const start = performance.now() + delay;

  const tick = (now: number) => {
    if (now < start) {
      requestAnimationFrame(tick);
      return;
    }
    const p = Math.min((now - start) / duration, 1);
    const resolved = Math.floor(p * chars.length);
    let out = '';
    for (let i = 0; i < chars.length; i++) {
      const c = chars[i];
      out += i < resolved || c === ' ' ? c : GLYPHS[(Math.random() * GLYPHS.length) | 0];
    }
    el.textContent = out;
    if (p < 1) {
      requestAnimationFrame(tick);
    } else {
      el.textContent = original;
      delete el.dataset.scrambling;
    }
  };
  requestAnimationFrame(tick);
}

export function initScrambleEffects(prefersReducedMotion: boolean): void {
  if (prefersReducedMotion) return;

  /* ---- hero headline: fires when the boot sequence completes ---- */
  const heroTargets = Array.from(document.querySelectorAll<HTMLElement>('[data-scramble-hero]'));
  if (heroTargets.length) {
    let done = document.documentElement.classList.contains('hero-done');
    const runHero = () => {
      heroTargets.forEach((el, i) => scramble(el, 900, 90 + i * 160));
    };
    if (done) runHero();
    // keep watching: the easter egg removes/re-adds hero-done to replay the boot
    new MutationObserver(() => {
      const nowDone = document.documentElement.classList.contains('hero-done');
      if (nowDone && !done) runHero();
      done = nowDone;
    }).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  }

  /* ---- section headings: quick scramble when scrolled into view ---- */
  const headings = document.querySelectorAll<HTMLElement>('[data-scramble]');
  if (headings.length && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          scramble(entry.target as HTMLElement, 620);
          io.unobserve(entry.target);
        }
      },
      { threshold: 0.4 },
    );
    headings.forEach((h) => io.observe(h));
  }
}
