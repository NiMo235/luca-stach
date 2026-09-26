import { initShaderBackground } from './shader-bg';
import { initHeroScene } from './heroScene';
import { initScrambleEffects } from './scramble';
import { initMicro } from './micro';

const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ------------------------------------------------------------------ */
/* Hero boot: typed terminal intro                                     */
/* ------------------------------------------------------------------ */
function bootHero(): void {
  const root = document.documentElement;
  const boot = document.querySelector<HTMLElement>('[data-hero-boot]');
  if (!boot) {
    root.classList.add('hero-done');
    return;
  }

  if (prefersReducedMotion) {
    root.classList.add('hero-done');
    return;
  }

  const prompt = boot.dataset.prompt ?? 'whoami';
  const answer = boot.dataset.answer ?? '';
  let lines: string[] = [];
  try {
    lines = JSON.parse(boot.dataset.lines ?? '[]');
  } catch {
    root.classList.add('hero-done');
    return;
  }
  const kickerEl = boot.querySelector<HTMLElement>('[data-boot-kicker]');
  const caretEl = boot.querySelector<HTMLElement>('[data-boot-caret]');
  const linesEl = boot.querySelector<HTMLElement>('[data-boot-lines]');

  if (!kickerEl || !linesEl) {
    root.classList.add('hero-done');
    return;
  }

  const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
  const typeText = async (el: HTMLElement, text: string, speed: number) => {
    for (let i = 0; i < text.length; i++) {
      el.textContent = text.slice(0, i + 1);
      await sleep(speed);
    }
  };
  // type into an inner span so the trailing caret is not wiped by textContent writes
  const typeLine = async (parent: HTMLElement, text: string, speed: number) => {
    const span = document.createElement('span');
    const caret = document.createElement('span');
    caret.className = 'hero-caret';
    parent.appendChild(span);
    parent.appendChild(caret);
    await typeText(span, text, speed);
    caret.remove();
  };

  const run = async () => {
    await sleep(350);
    await typeText(kickerEl, prompt, 70);

    // move caret into the lines block
    caretEl?.remove();

    const answerLine = document.createElement('p');
    answerLine.className = 'text-acid glow-acid font-bold';
    linesEl.appendChild(answerLine);
    await typeLine(answerLine, answer, 26);

    for (const line of lines) {
      const p = document.createElement('p');
      p.className = 'text-dim';
      linesEl.appendChild(p);
      await typeLine(p, line, 12);
      await sleep(90);
    }

    await sleep(450);
    root.classList.add('hero-done');
  };

  run().catch(() => root.classList.add('hero-done'));
}

/* ------------------------------------------------------------------ */
/* Reveal on scroll + count-up + skill bars (single observer)          */
/* ------------------------------------------------------------------ */
function setupScrollEffects(): void {
  const revealEls = document.querySelectorAll<HTMLElement>('.reveal');
  const counters = document.querySelectorAll<HTMLElement>('[data-countup]');

  const animateCount = (el: HTMLElement) => {
    const target = Number(el.dataset.value ?? '0');
    const decimals = Number(el.dataset.decimals ?? '0');
    if (prefersReducedMotion || target === 0) {
      el.textContent = target.toFixed(decimals);
      return;
    }
    const duration = 1400;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 4);
      el.textContent = (target * eased).toFixed(decimals);
      if (t < 1) requestAnimationFrame(tick);
      else el.textContent = target.toFixed(decimals);
    };
    requestAnimationFrame(tick);
  };

  if (!('IntersectionObserver' in window) || prefersReducedMotion) {
    revealEls.forEach((el) => el.classList.add('is-visible'));
    counters.forEach((el) => {
      el.textContent = Number(el.dataset.value ?? '0').toFixed(Number(el.dataset.decimals ?? '0'));
    });
    return;
  }

  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const el = entry.target as HTMLElement;
        el.classList.add('is-visible');
        el.querySelectorAll<HTMLElement>('[data-countup]').forEach(animateCount);
        if (el.hasAttribute('data-countup')) animateCount(el);
        io.unobserve(el);
      }
    },
    { threshold: 0.18, rootMargin: '0px 0px -6% 0px' },
  );

  revealEls.forEach((el) => io.observe(el));
  counters.forEach((el) => {
    // observe the stat tile so the counter fires with its reveal
    const tile = el.closest('.reveal') ?? el;
    io.observe(tile);
  });
}

/* ------------------------------------------------------------------ */
/* Active nav section highlight                                        */
/* ------------------------------------------------------------------ */
function setupNavHighlight(): void {
  const links = document.querySelectorAll<HTMLAnchorElement>('[data-navlink]');
  if (!links.length || !('IntersectionObserver' in window)) return;

  const byId = new Map<string, HTMLAnchorElement>();
  links.forEach((l) => {
    const id = l.dataset.navlink;
    if (id) byId.set(id, l);
  });

  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        links.forEach((l) => l.classList.remove('is-active'));
        const link = byId.get(entry.target.id);
        link?.classList.add('is-active');
      }
    },
    { rootMargin: '-40% 0px -55% 0px' },
  );

  byId.forEach((_, id) => {
    const section = document.getElementById(id);
    if (section) io.observe(section);
  });
}

/* ------------------------------------------------------------------ */
/* Custom cursor (desktop pointers only)                               */
/* ------------------------------------------------------------------ */
function setupCursor(): void {
  const fine = window.matchMedia('(pointer: fine)').matches;
  if (!fine || prefersReducedMotion) return;

  const dot = document.getElementById('cursor-dot');
  const ring = document.getElementById('cursor-ring');
  if (!dot || !ring) return;

  document.documentElement.classList.add('cursor-on');

  let mx = -100;
  let my = -100;
  let rx = -100;
  let ry = -100;

  window.addEventListener('mousemove', (e) => {
    mx = e.clientX;
    my = e.clientY;
    dot.style.transform = `translate(${mx - 3}px, ${my - 3}px)`;
  });

  const loop = () => {
    rx += (mx - rx) * 0.16;
    ry += (my - ry) * 0.16;
    const half = ring.offsetWidth / 2;
    ring.style.transform = `translate(${rx - half}px, ${ry - half}px)`;
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);

  const hoverables = document.querySelectorAll('a, button, [role="button"]');
  hoverables.forEach((el) => {
    el.addEventListener('mouseenter', () => ring.classList.add('is-active'));
    el.addEventListener('mouseleave', () => ring.classList.remove('is-active'));
  });

  document.addEventListener('mouseleave', () => {
    dot.style.opacity = '0';
    ring.style.opacity = '0';
  });
  document.addEventListener('mouseenter', () => {
    dot.style.opacity = '1';
    ring.style.opacity = '1';
  });
}

/* ------------------------------------------------------------------ */
/* Easter egg: type `ls` / `whoami` anywhere                           */
/* ------------------------------------------------------------------ */
function setupTerminalEasterEgg(): void {
  if (prefersReducedMotion) return;
  let buffer = '';
  let busy = false;

  window.addEventListener('keydown', (e) => {
    if (busy || e.metaKey || e.ctrlKey || e.altKey) return;
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;

    if (e.key.length === 1) buffer = (buffer + e.key).slice(-16);

    if (/(^|\s)(ls|whoami)$/.test(buffer)) {
      busy = true;
      const root = document.documentElement;
      root.classList.remove('hero-done');
      const boot = document.querySelector<HTMLElement>('[data-hero-boot]');
      const linesEl = boot?.querySelector<HTMLElement>('[data-boot-lines]');
      if (linesEl) linesEl.innerHTML = '';
      setTimeout(() => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
        bootHero();
        setTimeout(() => {
          busy = false;
        }, 600);
      }, 120);
    }
  });
}

/* ------------------------------------------------------------------ */
/* Flight deck gate: pointer fine + wide viewport + motion ok + WebGL  */
/* ------------------------------------------------------------------ */
function wantsFlightdeck(): boolean {
  if (prefersReducedMotion) return false;
  if (!window.matchMedia('(pointer: fine)').matches) return false;
  if (!window.matchMedia('(min-width: 1024px)').matches) return false;
  try {
    const probe = document.createElement('canvas');
    return Boolean(probe.getContext('webgl2') ?? probe.getContext('webgl'));
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ */
bootHero();
setupScrollEffects();
setupNavHighlight();
setupCursor();
setupTerminalEasterEgg();

initScrambleEffects(prefersReducedMotion);
initMicro();

if (wantsFlightdeck()) {
  /* Class first so CSS swaps to cockpit layout before the world loads;
     the plasma background, hero scene and GSAP scroll choreography are
     replaced by the flight rig. On any failure we restore classic. */
  const classic = () => {
    document.documentElement.classList.remove('flightdeck');
    initShaderBackground(prefersReducedMotion);
    initHeroScene(prefersReducedMotion);
    import('./scrollfx')
      .then((m) => m.initScrollFx())
      .catch(() => {});
  };
  document.documentElement.classList.add('flightdeck');
  import('./flightdeck')
    .then((m) => m.initFlightdeck())
    .then((ok) => {
      if (!ok) classic();
    })
    .catch(classic);
} else {
  /* WebGL / animation layer (all layers self-gate on reduced motion) */
  initShaderBackground(prefersReducedMotion);
  initHeroScene(prefersReducedMotion);

  /* GSAP + ScrollTrigger choreography — lazy chunk; the IntersectionObserver
     reveals above remain the fallback when this fails to load. */
  import('./scrollfx')
    .then((m) => m.initScrollFx())
    .catch(() => {});
}
