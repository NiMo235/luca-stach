import { initShaderBackground } from './shader-bg';
import { initHeroScene } from './heroScene';
import { initScrambleEffects } from './scramble';
import { initMicro } from './micro';
import { initTerminal } from './terminal';
import { initRoi } from './roi';
import { initSequencer } from './sequencer';

const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ------------------------------------------------------------------ */
/* Cinematic cold boot: typewriter init overlay + typed hero intro     */
/* ------------------------------------------------------------------ */
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function makeTypewriter(skipped: () => boolean) {
  /* human cadence: random per-char jitter, pauses on spaces/punctuation */
  const typeText = async (el: HTMLElement, text: string, base = 26) => {
    for (let i = 0; i < text.length; i++) {
      if (skipped()) {
        el.textContent = text;
        return;
      }
      el.textContent = text.slice(0, i + 1);
      const ch = text[i];
      let d = base + Math.random() * 55;
      if (ch === ' ') d += 50;
      if ('.:/—-·'.includes(ch)) d += 40;
      await sleep(d);
    }
  };
  const typeLine = async (parent: HTMLElement, text: string, cls = '', base?: number) => {
    const p = document.createElement('p');
    if (cls) p.className = cls;
    const span = document.createElement('span');
    const caret = document.createElement('span');
    caret.className = 'hero-caret';
    p.append(span, caret);
    parent.appendChild(p);
    await typeText(span, text, base);
    caret.remove();
    return p;
  };
  return { typeText, typeLine };
}

/* typed hero terminal — shared by the cold boot and the ls/whoami egg */
async function typeHeroIntro(instant: boolean): Promise<void> {
  const boot = document.querySelector<HTMLElement>('[data-hero-boot]');
  if (!boot) return;

  const prompt = boot.dataset.prompt ?? 'whoami';
  const answer = boot.dataset.answer ?? '';
  let lines: string[] = [];
  try {
    lines = JSON.parse(boot.dataset.lines ?? '[]');
  } catch {
    return;
  }
  const kickerEl = boot.querySelector<HTMLElement>('[data-boot-kicker]');
  const caretEl = boot.querySelector<HTMLElement>('[data-boot-caret]');
  const linesEl = boot.querySelector<HTMLElement>('[data-boot-lines]');
  if (!kickerEl || !linesEl) return;

  if (instant) {
    kickerEl.textContent = prompt;
    caretEl?.remove();
    const a = document.createElement('p');
    a.className = 'text-acid glow-acid font-bold';
    a.textContent = answer;
    linesEl.appendChild(a);
    for (const line of lines) {
      const p = document.createElement('p');
      p.className = 'text-dim';
      p.textContent = line;
      linesEl.appendChild(p);
    }
    return;
  }

  const { typeText, typeLine } = makeTypewriter(() => false);
  await sleep(300);
  await typeText(kickerEl, prompt, 70);

  caretEl?.remove();

  const answerLine = document.createElement('p');
  answerLine.className = 'text-acid glow-acid font-bold';
  linesEl.appendChild(answerLine);
  await typeLine(answerLine, answer, '', 32);

  for (const line of lines) {
    const p = document.createElement('p');
    p.className = 'text-dim';
    linesEl.appendChild(p);
    await typeLine(p, line, '', 16);
    await sleep(200);
  }
}

function coldBoot(ready: Promise<unknown> | null): void {
  const root = document.documentElement;
  const overlay = document.querySelector<HTMLElement>('[data-boot-overlay]');
  const done = () => root.classList.add('hero-done');

  if (!overlay || prefersReducedMotion || !document.querySelector('[data-hero-boot]')) {
    done();
    return;
  }

  let skipped = false;
  const markSkipped = () => {
    skipped = true;
  };
  window.addEventListener('keydown', markSkipped);
  window.addEventListener('pointerdown', markSkipped);
  window.addEventListener('wheel', markSkipped);

  const { typeLine } = makeTypewriter(() => skipped);

  const run = async () => {
    root.classList.add('booting');
    const linesBox = overlay.querySelector<HTMLElement>('[data-boot-overlay-lines]');
    let initLines: string[] = [];
    try {
      initLines = JSON.parse(overlay.dataset.initLines ?? '[]');
    } catch {
      /* empty */
    }
    const granted = overlay.dataset.initGranted ?? 'ACCESS GRANTED';

    await sleep(400);
    if (linesBox) {
      for (const line of initLines) {
        await typeLine(linesBox, line, line.includes('[') ? '' : 'text-paper', 13);
        if (!skipped) await sleep(110);
      }
      if (!skipped) await sleep(400);
      await typeLine(linesBox, granted, 'boot-granted', 45);
      if (!skipped) await sleep(700);
    }

    /* hold the curtain until the flight world is actually up (max 2.2s) */
    if (ready && !skipped) await Promise.race([ready, sleep(2200)]);

    /* overlay fades while the hero terminal types on — one continuous motion */
    root.classList.remove('booting');
    await typeHeroIntro(skipped);
    done();
  };

  run()
    .catch(done)
    .finally(() => {
      window.removeEventListener('keydown', markSkipped);
      window.removeEventListener('pointerdown', markSkipped);
      window.removeEventListener('wheel', markSkipped);
    });
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
        typeHeroIntro(false)
          .catch(() => {})
          .finally(() => {
            root.classList.add('hero-done');
            busy = false;
          });
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
let worldReady: Promise<unknown> | null = null;

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
  worldReady = import('./flightdeck')
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
  worldReady = import('./scrollfx')
    .then((m) => m.initScrollFx())
    .catch(() => {});
}

coldBoot(worldReady);
setupScrollEffects();
setupNavHighlight();
setupCursor();
setupTerminalEasterEgg();

initScrambleEffects(prefersReducedMotion);
initMicro();

/* station toys: interactive terminal, ROI model, sequencer */
initTerminal(prefersReducedMotion);
initRoi(prefersReducedMotion);
initSequencer();
