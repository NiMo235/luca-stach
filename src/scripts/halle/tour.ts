/* ------------------------------------------------------------------ */
/* Scroll tour: 7 viewpoints on a 13-key CatmullRom (station i sits on */
/* key 2i, so docked progress p = i/6 exactly; odd keys are guide      */
/* points that keep the path out of racks / roof / mezzanine). Path    */
/* data lives in ./path so the Node collision test shares it. Docked   */
/* breathing (capped per station), mouse parallax (few degrees, no     */
/* drag), transit FOV punch.                                           */
/* ------------------------------------------------------------------ */

import * as THREE from 'three';
import { POS_KEYS, LOOK_KEYS, DRIFT_CAPS, DRIFT_MAX_X, DRIFT_MAX_Y, STATIONS } from './path';

const BASE_FOV = 68;
const PUNCH_FOV = 88;

export interface Tour {
  apply(camera: THREE.PerspectiveCamera, p: number, transit: number, dt: number, now: number): void;
  drift: { x: number; y: number };
}

/* breathing amplitude scale, lerped between neighbouring stations —
   keeps the docked camera clear of low ceilings (Pausenraum) */
function driftCapAt(p: number): number {
  const f = THREE.MathUtils.clamp(p, 0, 1) * (STATIONS - 1);
  const i0 = Math.min(Math.floor(f), STATIONS - 1);
  const i1 = Math.min(i0 + 1, STATIONS - 1);
  return THREE.MathUtils.lerp(DRIFT_CAPS[i0], DRIFT_CAPS[i1], f - i0);
}

export function createTour(): Tour {
  const posCurve = new THREE.CatmullRomCurve3(
    POS_KEYS.map((k) => new THREE.Vector3(...k)),
    false,
    'centripetal',
  );
  const lookCurve = new THREE.CatmullRomCurve3(
    LOOK_KEYS.map((k) => new THREE.Vector3(...k)),
    false,
    'centripetal',
  );

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

      /* docked breathing: slow micro-orbit (~30 s) + gentle bob,
         amplitude capped per station (low lounge ceiling etc.) */
      const dockAmt = 1 - THREE.MathUtils.smoothstep(transit, 0.02, 0.35);
      const cap = driftCapAt(cp);
      const orbA = (t * Math.PI * 2) / 30;
      const driftX = (Math.cos(orbA) * 1.15 + Math.sin(t * 0.43) * 0.22) * dockAmt * cap;
      const driftY = (Math.sin(orbA) * 0.85 + Math.cos(t * 0.31) * 0.22) * dockAmt * cap;
      tmpPos.x += driftX;
      tmpPos.y += driftY;
      drift.x = THREE.MathUtils.clamp(driftX / DRIFT_MAX_X, -1, 1);
      drift.y = THREE.MathUtils.clamp(driftY / DRIFT_MAX_Y, -1, 1);

      camera.position.copy(tmpPos);
      camera.lookAt(tmpLook);

      /* subtle banking through the curves — scaled by transit so the
         horizon is level while docked */
      posCurve.getTangent(cp, tmpTan);
      camera.rotateZ(THREE.MathUtils.clamp(-tmpTan.x * 0.22, -0.09, 0.09) * transit);

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
