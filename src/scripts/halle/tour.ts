/* ------------------------------------------------------------------ */
/* Scroll tour: 7 viewpoints on a 13-key CatmullRom (station i sits on */
/* key 2i, so docked progress p = i/6 exactly; odd keys are guide      */
/* points that keep the path out of racks / roof / mezzanine). Docked  */
/* breathing, mouse parallax (few degrees, no drag), transit FOV punch */
/* ------------------------------------------------------------------ */

import * as THREE from 'three';
import { V3 } from './util';

const POS_KEYS = [
  V3(-38, 5.7, 25.5), // 01 BOOT — visitor gallery, view over the hall
  V3(-6, 6.8, 18), //    guide: over the loop, south-center
  V3(24, 5.0, 5), // 02 PROOF — in front of the Leitstand
  V3(-49.6, 4.8, 26), //    guide: swing south, aligned with aisle B
  V3(-49.6, 3.4, 13.5), // 03 LOG — inside the high-bay aisle
  V3(-44, 5.5, 22.5), //    guide: exit south of the racks
  V3(10, 6.5, 4), // 04 WORK — crossing, slightly elevated
  V3(30, 7.5, 10), //    guide: approach over the mezzanine edge
  V3(45, 8.6, 12), // 05 STACK — on the mezzanine
  V3(8, 7.0, 20), //    guide: cross back along the south side
  V3(-36.5, 2.5, 22.5), // 06 BEYOND — inside the warm Pausenraum
  V3(-18, 5.0, 8), //    guide: north again, east of the racks
  V3(-38, 3.8, -17), // 07 DOCK — facing the open TOR 1
];

const LOOK_KEYS = [
  V3(5, 4.5, -8), // 01 across the hall to the northeast
  V3(25, 3.5, 5),
  V3(53, 3.2, 24), // 02 past the Leitstand — the glass front sits left of the panel
  V3(-40, 5, 14), //    pan toward the rack block
  V3(-49.6, 5.2, -10), // 03 straight down the aisle
  V3(-20, 3, 4),
  V3(-8, 1.2, -10), // 04 down at the crossing + racks behind
  V3(40, 6.5, 10),
  V3(-20, 4, -2), // 05 from the mezzanine across the hall
  V3(-24, 3, 16),
  V3(-52, 2.0, 27), // 06 the warm Pausenraum corner
  V3(-40, 3, -18),
  V3(-50.5, 2.6, -29.5), // 07 the open TOR 1 and the yard beyond
];

const BASE_FOV = 68;
const PUNCH_FOV = 88;

export interface Tour {
  apply(camera: THREE.PerspectiveCamera, p: number, transit: number, dt: number, now: number): void;
  drift: { x: number; y: number };
}

export function createTour(): Tour {
  const posCurve = new THREE.CatmullRomCurve3(POS_KEYS, false, 'centripetal');
  const lookCurve = new THREE.CatmullRomCurve3(LOOK_KEYS, false, 'centripetal');

  const drift = { x: 0, y: 0 };
  const ptr = { x: 0, y: 0, tx: 0, ty: 0 };
  window.addEventListener('pointermove', (e) => {
    ptr.tx = (e.clientX / window.innerWidth) * 2 - 1;
    ptr.ty = (e.clientY / window.innerHeight) * 2 - 1;
  });

  const tmpPos = new THREE.Vector3();
  const tmpLook = new THREE.Vector3();
  const tmpTan = new THREE.Vector3();
  let prevFov = BASE_FOV;

  return {
    drift,
    apply(camera, p, transit, dt, now) {
      const t = now * 0.001;
      const cp = THREE.MathUtils.clamp(p, 0, 1);
      posCurve.getPoint(cp, tmpPos);
      lookCurve.getPoint(cp, tmpLook);

      /* docked breathing: slow micro-orbit (~30 s) + gentle bob */
      const dockAmt = 1 - THREE.MathUtils.smoothstep(transit, 0.02, 0.35);
      const orbA = (t * Math.PI * 2) / 30;
      const driftX = (Math.cos(orbA) * 1.15 + Math.sin(t * 0.43) * 0.22) * dockAmt;
      const driftY = (Math.sin(orbA) * 0.85 + Math.cos(t * 0.31) * 0.22) * dockAmt;
      tmpPos.x += driftX;
      tmpPos.y += driftY;
      drift.x = THREE.MathUtils.clamp(driftX / 1.4, -1, 1);
      drift.y = THREE.MathUtils.clamp(driftY / 1.05, -1, 1);

      camera.position.copy(tmpPos);
      camera.lookAt(tmpLook);

      /* subtle banking through the curves */
      posCurve.getTangent(cp, tmpTan);
      camera.rotateZ(THREE.MathUtils.clamp(-tmpTan.x * 0.22, -0.09, 0.09));

      /* mouse parallax: a few degrees, lerped — no drag, no controls */
      ptr.x += (ptr.tx - ptr.x) * Math.min(1, dt * 5);
      ptr.y += (ptr.ty - ptr.y) * Math.min(1, dt * 5);
      camera.rotateY(-ptr.x * 0.045);
      camera.rotateX(-ptr.y * 0.03);

      /* fov punch during transits */
      const fov = BASE_FOV + (PUNCH_FOV - BASE_FOV) * transit;
      if (Math.abs(fov - prevFov) > 0.05) {
        camera.fov = fov;
        camera.updateProjectionMatrix();
        prevFov = fov;
      }
    },
  };
}
