/* ------------------------------------------------------------------ */
/* High-bay warehouse: 4 double rack rows / 3 aisles / 12 levels.      */
/* Uprights, beams, push-through bars, row-end guards and roughly      */
/* 2.5k pallets with varied loads — all instanced, deterministic.      */
/* ------------------------------------------------------------------ */

import * as THREE from 'three';
import { RACKS, RACK_BAY_W } from '../layout';
import { rng, canvasTexture } from '../util';

const M4 = new THREE.Matrix4();
const Q = new THREE.Quaternion();
const S = new THREE.Vector3();
const P = new THREE.Vector3();
const C = new THREE.Color();

function setInst(mesh: THREE.InstancedMesh, i: number, x: number, y: number, z: number, sy = 1, ry = 0): void {
  P.set(x, y, z);
  S.set(1, sy, 1);
  Q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry);
  M4.compose(P, Q, S);
  mesh.setMatrixAt(i, M4);
}

/* load palette: cardboard browns, foil gray, IBC white, drum blue */
const LOAD_COLORS = [
  0x8a6f4d, 0x7d6547, 0x96795a, 0x6f5a40, // cartons
  0x9ba098, 0x8f948c, // foil-wrapped
  0xa9aeab, // IBC white
  0x3a5a8c, 0x2f4a74, // drums / blue goods
  0x5d6b53, // olive
];

/* EUR pallet: deck boards with gaps + blocks, drawn once */
function palletTexture(): THREE.CanvasTexture {
  return canvasTexture(128, 128, (ctx, W, H) => {
    ctx.fillStyle = '#2c2318'; // gaps/shadow between boards
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#9a7f5b';
    for (let i = 0; i < 5; i++) {
      ctx.fillRect(0, i * 26 + 2, W, 20); // deck boards
    }
    ctx.fillStyle = 'rgba(60,45,30,0.6)';
    for (const bx of [8, W / 2 - 8, W - 24]) {
      ctx.fillRect(bx, 0, 16, H); // blocks showing through the gaps
    }
    ctx.fillStyle = 'rgba(255,240,210,0.10)';
    for (let i = 0; i < 5; i++) ctx.fillRect(0, i * 26 + 2, W, 3); // board top edge
  });
}

/* carton sides: kraft base + tape strip + label patch — kept bright,
   the per-instance color tints it (foil gray, IBC white, drum blue …) */
function cartonTexture(): THREE.CanvasTexture {
  return canvasTexture(128, 128, (ctx, W, H) => {
    ctx.fillStyle = '#cfc4b2';
    ctx.fillRect(0, 0, W, H);
    /* kraft paper noise */
    const rnd = rng(23);
    for (let i = 0; i < 300; i++) {
      const g = 170 + rnd() * 60;
      ctx.fillStyle = `rgba(${g},${g - 12},${g - 40},0.25)`;
      ctx.fillRect(rnd() * W, rnd() * H, 2, 2);
    }
    /* tape strip across the top edge */
    ctx.fillStyle = 'rgba(120,100,70,0.85)';
    ctx.fillRect(W / 2 - 7, 0, 14, H);
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    ctx.fillRect(W / 2 - 7, 0, 3, H);
    /* shipping label */
    ctx.fillStyle = '#e8e6df';
    ctx.fillRect(14, H - 44, 44, 30);
    ctx.fillStyle = '#3a3a38';
    for (let k = 0; k < 4; k++) ctx.fillRect(18, H - 39 + k * 6, 36 - k * 7, 2.5);
    ctx.fillStyle = '#b4ff39';
    ctx.fillRect(14, H - 47, 44, 3);
  });
}

export function buildRacks(scene: THREE.Scene): { parts: number } {
  let parts = 0;
  const add = (o: THREE.Object3D) => {
    scene.add(o);
    parts++;
  };
  const rnd = rng(4711);

  const { rowsX, depth, levels, pitch, baseY, bays, uprightH, z0 } = RACKS;
  const face = depth / 2 - 0.1; // beam face offset from row center

  /* ---- uprights (instanced columns, two per frame position) ---- */
  const upGeo = new THREE.BoxGeometry(0.1, uprightH, 0.1);
  /* classic rack look: blue uprights, orange beams */
  const upMat = new THREE.MeshStandardMaterial({ color: 0x2e5194, metalness: 0.65, roughness: 0.42 });
  const nUp = rowsX.length * (bays + 1) * 2;
  const uprights = new THREE.InstancedMesh(upGeo, upMat, nUp);
  let ui = 0;
  for (const rx of rowsX) {
    for (let b = 0; b <= bays; b++) {
      const z = z0 + b * RACK_BAY_W;
      setInst(uprights, ui++, rx - face, uprightH / 2, z);
      setInst(uprights, ui++, rx + face, uprightH / 2, z);
    }
  }
  uprights.instanceMatrix.needsUpdate = true;
  uprights.castShadow = true;
  add(uprights);

  /* ---- beams (Traversen) ---- */
  const beamGeo = new THREE.BoxGeometry(0.09, 0.14, RACK_BAY_W - 0.08);
  const beamMat = new THREE.MeshStandardMaterial({ color: 0xc8681c, metalness: 0.45, roughness: 0.5 });
  const nBeam = rowsX.length * bays * levels * 2;
  const beams = new THREE.InstancedMesh(beamGeo, beamMat, nBeam);
  let bi = 0;
  for (const rx of rowsX) {
    for (let b = 0; b < bays; b++) {
      const z = z0 + (b + 0.5) * RACK_BAY_W;
      for (let l = 0; l < levels; l++) {
        const y = baseY + l * pitch;
        setInst(beams, bi++, rx - face, y, z);
        setInst(beams, bi++, rx + face, y, z);
      }
    }
  }
  beams.instanceMatrix.needsUpdate = true;
  beams.castShadow = true;
  add(beams);

  /* ---- push-through safety bars (Durchschubsicherung), row centers ---- */
  const barGeo = new THREE.BoxGeometry(0.05, 0.05, RACKS.z1 - RACKS.z0 - 0.4);
  const barMat = new THREE.MeshStandardMaterial({ color: 0x565f68, metalness: 0.8, roughness: 0.4 });
  const bars = new THREE.InstancedMesh(barGeo, barMat, rowsX.length * levels);
  let si = 0;
  for (const rx of rowsX) {
    for (let l = 0; l < levels; l++) {
      setInst(bars, si++, rx, baseY + l * pitch + 0.35, (z0 + RACKS.z1) / 2);
    }
  }
  bars.instanceMatrix.needsUpdate = true;
  add(bars);

  /* ---- row-end guards in industrial yellow (acid read as neon
     artifacts in the DOCK view) ---- */
  const guardGeo = new THREE.BoxGeometry(0.2, 0.5, 0.2);
  const guardMat = new THREE.MeshStandardMaterial({ color: 0x9c8a1c, metalness: 0.25, roughness: 0.65 });
  const guards = new THREE.InstancedMesh(guardGeo, guardMat, rowsX.length * 4);
  let gi = 0;
  for (const rx of rowsX) {
    for (const zEnd of [z0 - 0.35, RACKS.z1 + 0.35]) {
      setInst(guards, gi++, rx - face, 0.25, zEnd);
      setInst(guards, gi++, rx + face, 0.25, zEnd);
    }
  }
  guards.instanceMatrix.needsUpdate = true;
  guards.castShadow = true;
  add(guards);

  /* ---- pallets + loads ----
     slots: per row × bay × level × face, two EUR pallets per slot side */
  const slotList: Array<{ x: number; y: number; z: number }> = [];
  for (const rx of rowsX) {
    for (let b = 0; b < bays; b++) {
      for (let l = 0; l < levels; l++) {
        for (const sgn of [-1, 1]) {
          const y = baseY + l * pitch + 0.07;
          for (const dz of [-0.63, 0.63]) {
            /* sparser toward the top, a few gaps everywhere */
            const fillP = l < 4 ? 0.72 : l < 8 ? 0.55 : 0.34;
            if (rnd() > fillP) continue;
            slotList.push({
              x: rx + sgn * 0.52,
              y,
              z: z0 + (b + 0.5) * RACK_BAY_W + dz,
            });
          }
        }
      }
    }
  }
  /* staged pallets on the floor at the rack front (HRL-Eingang) */
  for (let k = 0; k < 14; k++) {
    slotList.push({
      x: -36 + rnd() * 7,
      y: 0.08,
      z: -8 + rnd() * 20,
    });
  }

  const nPal = slotList.length;
  const palGeo = new THREE.BoxGeometry(0.9, 0.15, 1.2);
  const palMat = new THREE.MeshStandardMaterial({ map: palletTexture(), roughness: 0.95, metalness: 0 });
  const pallets = new THREE.InstancedMesh(palGeo, palMat, nPal);
  const loadGeo = new THREE.BoxGeometry(0.82, 1, 1.1);
  const loadMat = new THREE.MeshStandardMaterial({
    map: cartonTexture(),
    color: 0xffffff,
    roughness: 0.8,
    metalness: 0.05,
  });
  const loads = new THREE.InstancedMesh(loadGeo, loadMat, nPal);

  const drumSlots: Array<{ x: number; y: number; z: number }> = [];
  let li = 0;
  slotList.forEach((s, i) => {
    setInst(pallets, i, s.x, s.y, s.z);
    const isDrum = s.y < 3.4 && rnd() < 0.16;
    if (isDrum) {
      drumSlots.push(s);
      return; // drums replace the box load (barrels sit on the pallet)
    }
    const h = 0.55 + rnd() * 0.75;
    setInst(loads, li, s.x, s.y + 0.075 + h / 2, s.z, h, (rnd() - 0.5) * 0.06);
    C.setHex(LOAD_COLORS[(rnd() * LOAD_COLORS.length) | 0]);
    C.multiplyScalar(0.78 + rnd() * 0.3); // tint the bright carton texture
    loads.setColorAt(li, C);
    li++;
  });
  loads.count = li;
  pallets.instanceMatrix.needsUpdate = true;
  loads.instanceMatrix.needsUpdate = true;
  if (loads.instanceColor) loads.instanceColor.needsUpdate = true;
  pallets.castShadow = true;
  loads.castShadow = true;
  add(pallets);
  add(loads);

  /* drums (barrels) on their own instanced cylinder */
  const drumGeo = new THREE.CylinderGeometry(0.31, 0.31, 0.88, 9);
  const drumMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5, metalness: 0.3 });
  const drums = new THREE.InstancedMesh(drumGeo, drumMat, Math.max(1, drumSlots.length * 4));
  let di = 0;
  for (const s of drumSlots) {
    for (let k = 0; k < 4; k++) {
      const dx = (k % 2) * 0.36 - 0.18;
      const dz = ((k >> 1) % 2) * 0.42 - 0.21;
      setInst(drums, di, s.x + dx, s.y + 0.075 + 0.44, s.z + dz);
      C.setHex(rnd() < 0.6 ? 0x3a5a8c : 0x6b7076).multiplyScalar(0.8 + rnd() * 0.35);
      drums.setColorAt(di, C);
      di++;
    }
  }
  drums.count = di;
  drums.instanceMatrix.needsUpdate = true;
  if (drums.instanceColor) drums.instanceColor.needsUpdate = true;
  drums.castShadow = true;
  add(drums);

  return { parts };
}
