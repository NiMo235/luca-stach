/* ------------------------------------------------------------------ */
/* DIE HALLE — the flightdeck world: a procedural 120 × 60 m logistics */
/* hall at night. Static in T-101 (no AGVs / simulation yet), but      */
/* built like a real-time architectural model: PMREM environment,      */
/* ACESFilmic, physical materials, one soft-shadow key light through   */
/* the skylights, instanced high-bay racks, ~7 viewpoint scroll tour.  */
/* Implements the FlightWorld contract from ../flightworld (types.ts). */
/* ------------------------------------------------------------------ */

import * as THREE from 'three';
import type { FlightWorld } from './types';
import { createStage } from './scene';
import { buildShell } from './geometry/shell';
import { buildRacks } from './geometry/racks';
import { buildDetails } from './geometry/details';
import { createTour } from './tour';
import { createStats } from './stats';
import { COL } from './layout';

export type { FlightWorld } from './types';

export function createWorld(canvas: HTMLCanvasElement): FlightWorld {
  const { renderer, scene, camera } = createStage(canvas);

  /* geometry — one synchronous build, well under the 500 ms budget */
  let parts = 0;
  parts += buildShell(scene, renderer.capabilities.getMaxAnisotropy()).parts;
  parts += buildRacks(scene).parts;
  const { parts: detailParts, pulse } = buildDetails(scene);
  parts += detailParts;

  const tour = createTour();
  const stats = createStats(renderer, parts);

  const ACID = new THREE.Color(COL.acid);
  const CYAN = new THREE.Color(COL.cyan).multiplyScalar(0.85);
  const AMBER = new THREE.Color(COL.amber);

  let beat = 0;

  return {
    camera,
    drift: tour.drift,
    pulse() {
      beat = 1;
    },
    update(p, transit, dt, now) {
      const t = now * 0.001;

      tour.apply(camera, p, transit, dt, now);

      /* beat pulse: work-light strips + holo labels ride the kick */
      beat = Math.max(0, beat - dt * 3.2);
      const b = 1 + beat * 0.9;
      pulse.acid.color.copy(ACID).multiplyScalar(b);
      pulse.cyan.color.copy(CYAN).multiplyScalar(1 + beat * 0.7);
      pulse.amber.color.copy(AMBER).multiplyScalar(0.78 + beat * 0.42);
      for (const m of pulse.labels) m.opacity = 0.78 + beat * 0.22;

      /* Gefahrgut beacon blink + slow label bob — the only motion in T-101 */
      const blink = Math.sin(t * 2.6) > 0.2 ? 1 : 0.06;
      pulse.beaconMat.color.setHex(0xff3524).multiplyScalar(0.25 + blink * 0.9);
      pulse.beaconLight.intensity = blink * 26;
      pulse.labelSprites.forEach((s, i) => {
        s.position.y += Math.sin(t * 0.7 + i * 1.7) * dt * 0.06;
      });

      renderer.render(scene, camera);
      stats.frame(dt);
    },
  };
}
