#!/usr/bin/env node
/* ------------------------------------------------------------------ */
/* Collision test for the HALLE scroll tour — no browser needed.       */
/* Samples the camera spline (shared with runtime via path.ts) in      */
/* 2000 steps, inflates each sample by the max docked breathing drift  */
/* and a small body radius, then tests against the hall AABBs from     */
/* colliders.ts. Must report 0 hits.                                   */
/*                                                                     */
/*   node scripts/check-halle-collision.mjs                            */
/* ------------------------------------------------------------------ */

import * as THREE from 'three';
import { POS_KEYS, DRIFT_CAPS, DRIFT_MAX_X, DRIFT_MAX_Y, STATIONS } from '../src/scripts/halle/path.ts';
import { hallColliders } from '../src/scripts/halle/colliders.ts';

const SAMPLES = 2000;
const BODY_R = 0.25; // camera "body" radius on top of the drift envelope

const curve = new THREE.CatmullRomCurve3(
  POS_KEYS.map((k) => new THREE.Vector3(...k)),
  false,
  'centripetal',
);
const colliders = hallColliders();

/* replicate flightdeck.ts: p -> transit (0 docked … 1 mid-gate) */
function transitAt(p) {
  const f = p * (STATIONS - 1);
  const station = Math.min(STATIONS - 1, Math.max(0, Math.round(f)));
  const segDist = Math.abs(f - station);
  return Math.min(1, Math.max(0, (segDist - 0.06) / 0.3));
}

function smoothstep(x, a, b) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/* replicate tour.ts driftCapAt */
function driftCapAt(p) {
  const f = Math.min(1, Math.max(0, p)) * (STATIONS - 1);
  const i0 = Math.min(Math.floor(f), STATIONS - 1);
  const i1 = Math.min(i0 + 1, STATIONS - 1);
  return DRIFT_CAPS[i0] + (DRIFT_CAPS[i1] - DRIFT_CAPS[i0]) * (f - i0);
}

function hitsAABB(px, py, pz, r, box) {
  return (
    px + r > box.min[0] && px - r < box.max[0] &&
    py + r > box.min[1] && py - r < box.max[1] &&
    pz + r > box.min[2] && pz - r < box.max[2]
  );
}

const pt = new THREE.Vector3();
const hits = [];

for (let i = 0; i <= SAMPLES; i++) {
  const p = i / SAMPLES;
  curve.getPoint(p, pt);

  const transit = transitAt(p);
  const dockAmt = 1 - smoothstep(transit, 0.02, 0.35);
  const cap = driftCapAt(p);
  const dx = DRIFT_MAX_X * dockAmt * cap;
  const dy = DRIFT_MAX_Y * dockAmt * cap;

  /* test the drift envelope corners (±dx, ±dy) plus center */
  const corners = [
    [0, 0],
    [dx, dy],
    [dx, -dy],
    [-dx, dy],
    [-dx, -dy],
  ];
  for (const [ox, oy] of corners) {
    const px = pt.x + ox;
    const py = pt.y + oy;
    const pz = pt.z;
    for (const box of colliders) {
      if (hitsAABB(px, py, pz, BODY_R, box)) {
        hits.push({
          p: +p.toFixed(4),
          at: [px, py, pz].map((v) => +v.toFixed(2)),
          box: box.name,
        });
      }
    }
  }
}

if (hits.length === 0) {
  console.log(`HALLE collision test: 0 hits (${SAMPLES + 1} samples × 5 envelope points × ${colliders.length} AABBs)`);
  process.exit(0);
} else {
  console.error(`HALLE collision test: ${hits.length} HITS`);
  const byBox = new Map();
  for (const h of hits) {
    if (!byBox.has(h.box)) byBox.set(h.box, []);
    byBox.get(h.box).push(h);
  }
  for (const [name, list] of byBox) {
    const ps = list.map((h) => h.p);
    console.error(
      `  ${name}: ${list.length} hits, p ${Math.min(...ps)} … ${Math.max(...ps)}, e.g. at (${list[0].at.join(', ')})`,
    );
  }
  process.exit(1);
}
