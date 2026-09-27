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

/* one-time static scene count: geometry triangles (instances included),
   parts = meshes with every instance counted individually */
function countScene(scene: THREE.Scene): { tris: number; parts: number } {
  let tris = 0;
  let parts = 0;
  scene.traverse((o) => {
    const sprite = o as THREE.Sprite;
    if (sprite.isSprite) {
      parts += 1;
      tris += 2;
      return;
    }
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const inst = mesh as THREE.InstancedMesh;
    const n = inst.isInstancedMesh ? inst.count : 1;
    const g = mesh.geometry;
    const t = (g.index ? g.index.count : g.getAttribute('position').count) / 3;
    tris += t * n;
    parts += n;
  });
  return { tris: Math.round(tris), parts };
}

export function createWorld(canvas: HTMLCanvasElement): FlightWorld {
  const stage = createStage(canvas);
  const { renderer, scene, camera } = stage;

  try {
    /* geometry — one synchronous build, well under the 500 ms budget */
    buildShell(scene, renderer.capabilities.getMaxAnisotropy());
    buildRacks(scene);
    const { pulse } = buildDetails(scene);

    /* static scene: render the shadow map exactly once (scene.ts
       disabled autoUpdate; T-102 flips it back on for the sim) */
    renderer.shadowMap.needsUpdate = true;

    const tour = createTour();
    const stats = createStats(countScene(scene));

    const ACID = new THREE.Color(COL.acid);
    const CYAN = new THREE.Color(COL.cyan).multiplyScalar(0.85);
    const AMBER = new THREE.Color(COL.amber);

    const tmpV = new THREE.Vector3();
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

        /* holo labels: cap the on-screen size (scale by distance) and
           hide them in the near field, so fly-bys never fill the frame */
        pulse.labelSprites.forEach((s, i) => {
          s.position.y += Math.sin(t * 0.7 + i * 1.7) * dt * 0.06;
          const dist = tmpV.copy(s.position).distanceTo(camera.position);
          const sScale = THREE.MathUtils.clamp(dist / 22, 0.35, 1);
          s.scale.set(7.6 * sScale, 1.9 * sScale, 1);
          const near = THREE.MathUtils.smoothstep(dist, 8, 14);
          pulse.labels[i].opacity = (0.78 + beat * 0.22) * near;
        });

        /* Gefahrgut beacon blink — the only other motion in T-101 */
        const blink = Math.sin(t * 2.6) > 0.2 ? 1 : 0.06;
        pulse.beaconMat.color.setHex(0xff3524).multiplyScalar(0.25 + blink * 0.9);
        pulse.beaconLight.intensity = blink * 26;

        renderer.render(scene, camera);
        stats.frame(dt);
      },
    };
  } catch (err) {
    /* clean up the GL context + listeners so flightdeck's fallback to
       the classic view doesn't leak a dead renderer */
    stage.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
    throw err;
  }
}
