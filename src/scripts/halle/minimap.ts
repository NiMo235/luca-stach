/* ------------------------------------------------------------------ */
/* Minimap (T-103) — live SVG floor plan, bottom right, collapsible.   */
/* Owns the DOM side: collapse toggle (localStorage-persisted), zone   */
/* clicks → halle:fly, and the live layer (AGV dots colored by status, */
/* trucks at the doors, camera position + heading). Update is called   */
/* from the hall render loop, throttled to 4 Hz by the caller.         */
/* ------------------------------------------------------------------ */

import type { Sim } from './sim/world';
import { AGV_COUNT } from './sim/agents';

const LS_KEY = 'halle-map-collapsed';
const SVGNS = 'http://www.w3.org/2000/svg';
/* world → map coords (2 px per meter, mirrors FlightDeck.astro) */
const MX = (x: number) => (x + 60) * 2;
const MY = (z: number) => (z + 30) * 2;

const STATUS_FILL = ['#b4ff39', '#ff9a1f', '#ff3524']; // GO / WAIT / HOLD

export interface Minimap {
  update(camX: number, camZ: number, camAngleDeg: number, activeStation: number): void;
}

export function createMinimap(sim: Sim): Minimap | null {
  const root = document.getElementById('halle-map');
  if (!root) return null;
  const toggle = root.querySelector<HTMLButtonElement>('.halle-map-toggle');
  const agvLayer = root.querySelector<SVGGElement>('[data-mm-agvs]');
  const truckLayer = root.querySelector<SVGGElement>('[data-mm-trucks]');
  const camEl = root.querySelector<SVGPathElement>('[data-mm-cam]');
  const zoneEls = Array.from(root.querySelectorAll<SVGGElement>('.mm-zone'));
  if (!toggle || !agvLayer || !truckLayer || !camEl) return null;

  /* ---- collapse state (persisted; default collapsed below 1360 px) --
     a stored "open" is honored on wide screens only: below 1360 px the
     map ALWAYS starts collapsed (it would otherwise crowd the panels) */
  let collapsed = window.innerWidth < 1360;
  try {
    const stored = window.localStorage.getItem(LS_KEY);
    if (stored === '1') collapsed = true;
    if (stored === '0' && window.innerWidth >= 1360) collapsed = false;
  } catch {
    /* private mode etc. — keep the default */
  }
  const applyCollapsed = () => {
    root.dataset.collapsed = String(collapsed);
    toggle.setAttribute('aria-expanded', String(!collapsed));
  };
  toggle.addEventListener('click', () => {
    collapsed = !collapsed;
    applyCollapsed();
    try {
      window.localStorage.setItem(LS_KEY, collapsed ? '1' : '0');
    } catch {
      /* ignore */
    }
  });
  applyCollapsed();

  /* ---- zone clicks → fly ------------------------------------------- */
  const fly = (el: SVGGElement) => {
    const station = Number(el.dataset.station);
    if (Number.isFinite(station)) {
      window.dispatchEvent(new CustomEvent('halle:fly', { detail: { station } }));
    }
  };
  for (const z of zoneEls) {
    z.addEventListener('click', () => fly(z));
    z.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        fly(z);
      }
    });
  }

  /* ---- live layers (elements created once, reused every update) ----- */
  const agvDots: SVGCircleElement[] = [];
  for (let i = 0; i < AGV_COUNT; i++) {
    const c = document.createElementNS(SVGNS, 'circle');
    c.setAttribute('r', '1.7');
    c.setAttribute('class', 'mm-agv');
    agvLayer.appendChild(c);
    agvDots.push(c);
  }
  const truckRects: SVGRectElement[] = [];
  for (let i = 0; i < sim.trucks.length; i++) {
    const r = document.createElementNS(SVGNS, 'rect');
    r.setAttribute('class', 'mm-truck');
    r.setAttribute('width', '5');
    r.setAttribute('height', '25');
    truckLayer.appendChild(r);
    truckRects.push(r);
  }

  let lastActive = -1;

  return {
    update(camX, camZ, camAngleDeg, activeStation) {
      for (let i = 0; i < AGV_COUNT; i++) {
        const a = sim.agvs[i];
        const dot = agvDots[i];
        dot.setAttribute('cx', MX(a.x).toFixed(1));
        dot.setAttribute('cy', MY(a.z).toFixed(1));
        const parked = a.state === 'parked';
        dot.setAttribute('fill', STATUS_FILL[a.status] ?? STATUS_FILL[0]);
        dot.setAttribute('opacity', parked ? '0.35' : '0.95');
      }
      sim.trucks.forEach((t, i) => {
        const r = truckRects[i];
        const hidden = t.phase === 'away';
        r.setAttribute('x', (MX(t.x) - 2.5).toFixed(1));
        r.setAttribute('y', MY(t.z).toFixed(1));
        r.setAttribute('opacity', hidden ? '0' : '0.9');
      });
      camEl.setAttribute(
        'transform',
        `translate(${MX(camX).toFixed(1)} ${MY(camZ).toFixed(1)}) rotate(${camAngleDeg.toFixed(1)})`,
      );
      if (activeStation !== lastActive) {
        lastActive = activeStation;
        for (const z of zoneEls) {
          z.classList.toggle('is-active', Number(z.dataset.station) === activeStation);
        }
      }
    },
  };
}
