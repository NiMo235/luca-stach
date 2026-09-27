/* ------------------------------------------------------------------ */
/* Flight deck rig — loaded only after main.ts gates pass.             */
/* Owns the scroll→camera mapping (lerped progress along a CatmullRom  */
/* spline), station activation (DOM panels), HUD telemetry, the        */
/* chromatic gate flash, anchor-click interception (flight instead of  */
/* jump) and the opt-in generative audio toggle.                       */
/* ------------------------------------------------------------------ */

const LERP = 0.08;

interface Station {
  id: string;
  el: HTMLElement;
}

const pad = (n: number, len: number) => String(n).padStart(len, '0');
const fmtAxis = (v: number) => `${v < 0 ? '-' : '+'}${Math.abs(v).toFixed(1).padStart(5, '0')}`;

export async function initFlightdeck(): Promise<boolean> {
  const canvas = document.getElementById('flight-canvas') as HTMLCanvasElement | null;
  const flash = document.getElementById('flight-flash');
  const hud = document.getElementById('flight-hud');
  if (!canvas || !flash || !hud) return false;

  /* ---- stations in corridor order (HUD button order is canonical) ---- */
  const flyButtons = Array.from(hud.querySelectorAll<HTMLButtonElement>('[data-fly]'));
  const stations: Station[] = [];
  for (const btn of flyButtons) {
    const el = document.getElementById(btn.dataset.fly ?? '');
    if (el) stations.push({ id: el.id, el });
  }
  if (stations.length < 2) return false;
  const N = stations.length;

  /* the floating holo readout inside each station section */
  const panelEls = stations.map((s) =>
    s.el.querySelector<HTMLElement>(':scope > div:not([aria-hidden="true"])'),
  );

  /* ---- world (lazy three.js chunk) ---- */
  let world: import('./flightworld').FlightWorld;
  try {
    const m = await import('./flightworld');
    world = m.createWorld(canvas);
  } catch {
    return false;
  }

  /* ---- HUD refs ---- */
  const elScroll = hud.querySelector<HTMLElement>('[data-hud-scroll]');
  const elVel = hud.querySelector<HTMLElement>('[data-hud-vel]');
  const elStation = hud.querySelector<HTMLElement>('[data-hud-station]');
  const elPos = hud.querySelector<HTMLElement>('[data-hud-pos]');
  const eq = hud.querySelector<HTMLElement>('.hud-eq');
  const audioBtn = hud.querySelector<HTMLButtonElement>('[data-audio-toggle]');

  /* ---- audio (opt-in, lazy) ---- */
  let audio: import('./audio').FlightAudio | null = null;
  let beatLevel = 0;
  audioBtn?.addEventListener('click', async () => {
    try {
      if (!audio) {
        const m = await import('./audio');
        audio = new m.FlightAudio();
        audio.onBeat = () => {
          beatLevel = 1;
          world.pulse();
        };
      }
      if (audio.running) {
        audio.stop();
        audioBtn.textContent = audioBtn.dataset.labelOff ?? '';
        audioBtn.setAttribute('aria-pressed', 'false');
        beatLevel = 0;
      } else {
        audio.start();
        audioBtn.textContent = audioBtn.dataset.labelOn ?? '';
        audioBtn.setAttribute('aria-pressed', 'true');
      }
    } catch {
      /* audio unavailable — leave it off */
    }
  });
  document.addEventListener('visibilitychange', () => {
    if (!audio) return;
    if (document.hidden) audio.suspend();
    else audio.resume();
  });

  /* ---- station activation ---- */
  let active = -1;
  let panelTimer = 0;
  let outTimer = 0;
  let outEl: HTMLElement | null = null;
  let pendingFocus: number | null = null;

  const activate = (i: number) => {
    const prev = active;
    active = i;
    stations.forEach((s, k) => s.el.classList.toggle('station-active', k === i));
    flyButtons.forEach((b, k) => b.classList.toggle('is-active', k === i));

    /* outgoing panel recedes into depth instead of vanishing outright */
    if (prev >= 0 && prev !== i) {
      const prevEl = stations[prev].el;
      window.clearTimeout(outTimer);
      outEl?.classList.remove('panel-out');
      prevEl.classList.add('panel-out');
      outEl = prevEl;
      outTimer = window.setTimeout(() => {
        prevEl.classList.remove('panel-out');
        if (outEl === prevEl) outEl = null;
      }, 420);
    }

    const panel = stations[i].el;
    panel.classList.remove('panel-in');
    void panel.offsetWidth; /* restart the materialize animation */
    panel.classList.add('panel-in');
    window.clearTimeout(panelTimer);
    panelTimer = window.setTimeout(() => panel.classList.remove('panel-in'), 700);

    /* gate-crossing chromatic flash */
    flash.classList.remove('flash');
    void flash.offsetWidth;
    flash.classList.add('flash');

    if (elStation) elStation.textContent = `${pad(i + 1, 2)}/${pad(N, 2)}`;

    if (pendingFocus === i) {
      pendingFocus = null;
      const heading = panel.querySelector<HTMLElement>('h1, h2');
      if (heading) {
        heading.tabIndex = -1;
        heading.focus({ preventScroll: true });
      }
    }
  };

  /* ---- flight navigation: intercept in-page anchors + HUD buttons ---- */
  const stationIndex = (id: string) => stations.findIndex((s) => s.id === id);
  const flyTo = (i: number, focus: boolean) => {
    if (i < 0) return;
    if (focus) pendingFocus = i;
    const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    window.scrollTo({ top: (i / (N - 1)) * max, behavior: 'auto' });
    history.replaceState(null, '', `#${stations[i].id}`);
  };
  flyButtons.forEach((btn, i) =>
    btn.addEventListener('click', () => flyTo(i, true)),
  );
  document.addEventListener('click', (e) => {
    const a = (e.target as HTMLElement | null)?.closest?.('a[href^="#"]');
    if (!a) return;
    const i = stationIndex(a.getAttribute('href')!.slice(1));
    if (i < 0) return;
    e.preventDefault();
    flyTo(i, false);
  });

  /* ---- main loop ---- */
  const doc = document.documentElement;
  const targetP = () => {
    const max = Math.max(1, doc.scrollHeight - window.innerHeight);
    return Math.min(1, Math.max(0, window.scrollY / max));
  };

  let p = targetP();
  let prev = performance.now();
  let vel = 0;
  const hudCache = { scroll: '', vel: '', pos: '' };

  /* panel float state: pointer position (lerped) drives the tilt */
  const ptr = { x: 0, y: 0, tx: 0, ty: 0 };
  window.addEventListener('pointermove', (e) => {
    ptr.tx = (e.clientX / window.innerWidth) * 2 - 1;
    ptr.ty = (e.clientY / window.innerHeight) * 2 - 1;
  });

  const frame = (now: number) => {
    requestAnimationFrame(frame);
    if (document.hidden) {
      prev = now;
      return;
    }
    const dt = Math.min((now - prev) / 1000, 0.05);
    prev = now;

    const target = targetP();
    p += (target - p) * LERP;
    if (Math.abs(target - p) < 0.00004) p = target;

    /* station + transit intensity (0 docked … 1 mid-gate) */
    const f = p * (N - 1);
    const station = Math.min(N - 1, Math.max(0, Math.round(f)));
    const segDist = Math.abs(f - station); // 0..0.5
    const transit = Math.min(1, Math.max(0, (segDist - 0.06) / 0.3));
    if (station !== active) activate(station);

    /* fake velocity from progress delta */
    const inst = Math.abs(target - p) * LERP * 60;
    vel += (inst - vel) * 0.12;

    world.update(p, transit, dt, now);

    /* panel float: gentle bob + pointer tilt + counter-parallax against
       the camera drift — the readout behaves like an object in space.
       transform only, written once per frame for the active panel. */
    const panel = active >= 0 ? panelEls[active] : null;
    if (panel) {
      ptr.x += (ptr.tx - ptr.x) * 0.06;
      ptr.y += (ptr.ty - ptr.y) * 0.06;
      const t = now * 0.001;
      const bobY = Math.sin((t * Math.PI * 2) / 6) * 4;
      const bobX = Math.sin((t * Math.PI * 2) / 9 + 1.3) * 2;
      const tiltX = -ptr.y * 2.4 + world.drift.y * 1.4;
      const tiltY = ptr.x * 2.6 - world.drift.x * 1.4;
      const parX = -world.drift.x * 12 + bobX;
      const parY = -world.drift.y * 9 + bobY;
      panel.style.transform = `rotateX(${tiltX.toFixed(2)}deg) rotateY(${tiltY.toFixed(2)}deg) translate3d(${parX.toFixed(1)}px, ${parY.toFixed(1)}px, 0)`;
    }

    /* beat decay for the HUD equalizer */
    beatLevel = Math.max(0, beatLevel - dt * 3.4);
    eq?.style.setProperty('--beat', beatLevel.toFixed(3));

    /* telemetry text (only on change) */
    const s = `${pad(Math.round(p * 100), 3)}%`;
    if (s !== hudCache.scroll && elScroll) {
      elScroll.textContent = s;
      hudCache.scroll = s;
    }
    const v = `${Math.min(9.9, vel * 30).toFixed(1)}c`;
    if (v !== hudCache.vel && elVel) {
      elVel.textContent = v;
      hudCache.vel = v;
    }
    const cp = world.camera.position;
    const posStr = `X${fmtAxis(cp.x)} Y${fmtAxis(cp.y)} Z${fmtAxis(cp.z)}`;
    if (posStr !== hudCache.pos && elPos) {
      elPos.textContent = posStr;
      hudCache.pos = posStr;
    }
  };

  activate(Math.min(N - 1, Math.max(0, Math.round(p * (N - 1)))));
  requestAnimationFrame(frame);
  return true;
}
