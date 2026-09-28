/* ------------------------------------------------------------------ */
/* Render layer for the package sim (T-103): instanced conveyor        */
/* parcels (red = rejected) with fake contact shadows on the belt,     */
/* plus the glowing quote packets on the two PROOF data lanes.         */
/* No per-frame allocations.                                           */
/* ------------------------------------------------------------------ */

import * as THREE from 'three';
import type { PackSim } from './packages';
import { CONV_COUNT, QUOTE_COUNT } from './packages';
import { COL } from '../layout';
import { canvasTexture } from '../util';

const PARCEL = new THREE.Color(0xa89a7c);
const PARCEL_RED = new THREE.Color(0xd93a24);
const QUOTE_MANUAL = new THREE.Color(COL.cyan);
const QUOTE_PIPE = new THREE.Color(COL.acid);

export interface PackRender {
  update(): void;
}

export function createPackRender(scene: THREE.Scene, packs: PackSim): PackRender {
  const m4 = new THREE.Matrix4();
  const P = new THREE.Vector3();
  const Q = new THREE.Quaternion();
  const S = new THREE.Vector3(1, 1, 1);
  const Y = new THREE.Vector3(0, 1, 0);

  /* conveyor parcels */
  const parcelMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    metalness: 0.05,
    roughness: 0.85,
  });
  const conv = new THREE.InstancedMesh(new THREE.BoxGeometry(0.55, 0.44, 0.42), parcelMat, CONV_COUNT);
  conv.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  conv.frustumCulled = false;
  scene.add(conv);

  /* fake contact shadows pinned to the belt surface */
  const shadowTex = canvasTexture(64, 64, (ctx, W, H) => {
    const g = ctx.createRadialGradient(W / 2, H / 2, 3, W / 2, H / 2, W / 2);
    g.addColorStop(0, 'rgba(255,255,255,0.8)');
    g.addColorStop(0.7, 'rgba(255,255,255,0.35)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  });
  const shadowMat = new THREE.MeshBasicMaterial({
    map: shadowTex,
    color: 0x000000,
    transparent: true,
    opacity: 0.45,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
  });
  const shadows = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), shadowMat, CONV_COUNT);
  shadows.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  shadows.frustumCulled = false;
  const qFlat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
  scene.add(shadows);

  /* quote packets: additive glow boxes */
  const quoteMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const quote = new THREE.InstancedMesh(new THREE.BoxGeometry(0.4, 0.2, 0.2), quoteMat, QUOTE_COUNT);
  quote.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  quote.frustumCulled = false;
  scene.add(quote);

  /* static per-instance colors */
  for (let i = 0; i < QUOTE_COUNT; i++) {
    quote.setColorAt(i, packs.quote[i].lane === 0 ? QUOTE_MANUAL : QUOTE_PIPE);
  }
  if (quote.instanceColor) quote.instanceColor.needsUpdate = true;
  let lastRed = -1;

  return {
    update() {
      for (let i = 0; i < CONV_COUNT; i++) {
        const p = packs.conv[i];
        if (!p.visible) {
          m4.makeScale(0, 0, 0);
          conv.setMatrixAt(i, m4);
          shadows.setMatrixAt(i, m4);
          continue;
        }
        P.set(p.x, p.y, p.z);
        Q.setFromAxisAngle(Y, p.ry);
        m4.compose(P, Q, S);
        conv.setMatrixAt(i, m4);
        /* shadow on the belt, stretched along travel */
        P.y = p.y - 0.21;
        m4.compose(P, Q, S.set(0.85, 0.7, 1));
        shadows.setMatrixAt(i, m4);
        S.set(1, 1, 1);
      }
      /* parcel colors follow the red flags (they change on respawn) */
      let flags = 0;
      for (let i = 0; i < CONV_COUNT; i++) if (packs.conv[i].red) flags |= 1 << i;
      if (flags !== lastRed) {
        for (let i = 0; i < CONV_COUNT; i++) {
          conv.setColorAt(i, packs.conv[i].red ? PARCEL_RED : PARCEL);
        }
        if (conv.instanceColor) conv.instanceColor.needsUpdate = true;
        lastRed = flags;
      }
      conv.instanceMatrix.needsUpdate = true;
      shadows.instanceMatrix.needsUpdate = true;

      for (let i = 0; i < QUOTE_COUNT; i++) {
        const q = packs.quote[i];
        P.set(q.x, q.y, q.z);
        Q.identity();
        m4.compose(P, Q, S);
        quote.setMatrixAt(i, m4);
      }
      quote.instanceMatrix.needsUpdate = true;
    },
  };
}
