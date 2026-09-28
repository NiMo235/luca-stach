/* ------------------------------------------------------------------ */
/* Holo-Hotspots (T-103): a floating diamond marker above each zone    */
/* label. Hover = brighten + pointer cursor, tap = dispatch            */
/* `halle:fly` (flightdeck.ts maps it to flyTo). The marker at the     */
/* currently docked station is dimmed. Instanced octahedra, raycast    */
/* against markers + the (large) label sprites.                        */
/* ------------------------------------------------------------------ */

import * as THREE from 'three';
import { HOTSPOTS, COL } from './layout';

export interface Hotspots {
  /** raycast targets: instanced diamonds first, then the label sprites */
  hitTargets: THREE.Object3D[];
  /** resolve a raycast hit list to a station index (or -1) */
  stationFromHits(hits: THREE.Intersection[]): number;
  /** per-frame: bobbing/rotation, dim current station, hover highlight.
      The markers scale down in the near field (like the labels) so a
      docked viewpoint never fills the frame with its own diamond */
  update(
    t: number,
    activeStation: number,
    hoverStation: number,
    powerLevel: number,
    camPos: THREE.Vector3,
  ): void;
  /** station -> world position (debug/shot hooks) */
  pos(i: number): { x: number; y: number; z: number };
}

const DIAMOND_Y_OFF = 1.55;

export function createHotspots(scene: THREE.Scene, labelSprites: THREE.Sprite[]): Hotspots {
  const geo = new THREE.OctahedronGeometry(0.5);
  geo.scale(1, 1.5, 1);
  const mat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.92,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const mesh = new THREE.InstancedMesh(geo, mat, HOTSPOTS.length);
  mesh.frustumCulled = false;
  const BASE = new THREE.Color(COL.acid);
  const init = new THREE.Color(COL.acid);
  for (let i = 0; i < HOTSPOTS.length; i++) mesh.setColorAt(i, init);
  scene.add(mesh);

  /* label sprite -> station lookup (sprites arrive in station order) */
  const spriteStation = new Map<THREE.Sprite, number>();
  labelSprites.forEach((s, i) => spriteStation.set(s, i));

  const m4 = new THREE.Matrix4();
  const P = new THREE.Vector3();
  const Q = new THREE.Quaternion();
  const S = new THREE.Vector3(1, 1, 1);
  const Y = new THREE.Vector3(0, 1, 0);
  const tmpC = new THREE.Color();

  return {
    hitTargets: [mesh, ...labelSprites],
    stationFromHits(hits) {
      for (const h of hits) {
        if (h.object === mesh && h.instanceId !== undefined) return h.instanceId;
        const st = spriteStation.get(h.object as THREE.Sprite);
        if (st !== undefined) return st;
      }
      return -1;
    },
    pos(i) {
      const h = HOTSPOTS[i];
      return { x: h.x, y: h.y + DIAMOND_Y_OFF, z: h.z };
    },
    update(t, activeStation, hoverStation, powerLevel, camPos) {
      for (let i = 0; i < HOTSPOTS.length; i++) {
        const h = HOTSPOTS[i];
        P.set(h.x, h.y + DIAMOND_Y_OFF + Math.sin(t * 0.9 + i * 1.3) * 0.18, h.z);
        Q.setFromAxisAngle(Y, t * 0.7 + i * 0.9);
        const dist = P.distanceTo(camPos);
        /* near-field scale-down (T-105: matches the label recipe —
           smaller with distance, hidden below ~9 m for foreign stations)
           so a fly-by or a neighbouring station never fills the frame
           with a diamond that is not tappable context; the DOCKED
           station stays visible but strongly dimmed + small */
        const dScale = THREE.MathUtils.clamp(dist / 40, 0.18, 0.55);
        const docked = i === activeStation;
        const near = docked ? 1 : THREE.MathUtils.smoothstep(dist, 3.5, 9);
        const sc = dScale * (docked ? 0.5 : near) * (i === hoverStation ? 1.45 : 1);
        S.set(sc, sc, sc);
        m4.compose(P, Q, S);
        mesh.setMatrixAt(i, m4);
        /* dim at the docked station, brighten on hover */
        const dim = docked ? 0.18 : near;
        const boost = i === hoverStation ? 1.9 : 1;
        tmpC.copy(BASE).multiplyScalar(dim * boost * powerLevel);
        mesh.setColorAt(i, tmpC);
      }
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    },
  };
}
