/* ------------------------------------------------------------------ */
/* Render-Schicht für die Simulation (T-102) — alles instanced, keine  */
/* Pro-Frame-Allokationen. Liest den Sim-Zustand (world.ts) und        */
/* interpoliert zwischen den 10-Hz-Ticks.                              */
/*                                                                     */
/* AGVs werfen KEINE echten Schatten: instanced Fake-Kontaktschatten   */
/* (die statische Shadow-Map bleibt autoUpdate=false).                 */
/* ------------------------------------------------------------------ */

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Sim } from './world';
import { AGV_COUNT, AGV_GO } from './agents';
import { PALLET_COUNT } from './world';
import { COL } from '../layout';
import { canvasTexture } from '../util';

const STATUS_COLORS = [
  new THREE.Color(COL.acid), // GO
  new THREE.Color(0xff9a1f), // WAIT — signal orange, not beige
  new THREE.Color(0xff3524), // HOLD
];

export interface SimRender {
  agvMesh: THREE.InstancedMesh; // raycast target
  update(alpha: number): void;
  setHover(id: number): void;
  setFocus(id: number, label: string, held: boolean): void; // -1 hides the tag
  dispose(): void;
}

function agvBodyGeometry(): THREE.BufferGeometry {
  const base = new THREE.BoxGeometry(1.28, 0.42, 1.9);
  base.translate(0, 0.32, 0);
  const deck = new THREE.BoxGeometry(0.98, 0.2, 1.2);
  deck.translate(0, 0.62, -0.1);
  const mast = new THREE.BoxGeometry(1.1, 0.34, 0.12);
  mast.translate(0, 0.45, 0.92);
  return mergeGeometries([base, deck, mast])!;
}

function palletGeometry(): THREE.BufferGeometry {
  const deck = new THREE.BoxGeometry(1.15, 0.12, 0.95);
  deck.translate(0, 0.06, 0);
  const load = new THREE.BoxGeometry(1.0, 0.52, 0.82);
  load.translate(0, 0.38, 0);
  return mergeGeometries([deck, load])!;
}

export function createSimRender(scene: THREE.Scene, sim: Sim): SimRender {
  const m4 = new THREE.Matrix4();
  const P = new THREE.Vector3();
  const Q = new THREE.Quaternion();
  const S = new THREE.Vector3(1, 1, 1);
  const Y_AXIS = new THREE.Vector3(0, 1, 0);
  const tmpOff = new THREE.Vector3();

  /* ---- AGV bodies + status bars + fake contact shadows ---- */
  const bodyMat = new THREE.MeshStandardMaterial({
    color: 0x3a4450, // bright enough to read as a body even in dim zones
    metalness: 0.65,
    roughness: 0.45,
  });
  const agvMesh = new THREE.InstancedMesh(agvBodyGeometry(), bodyMat, AGV_COUNT);
  agvMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  agvMesh.frustumCulled = false;
  scene.add(agvMesh);

  /* status lights: FLAT strips, one on the deck and one along the mast's
     front top edge (visible even when a pallet rides on the deck).
     separate materials per instanced mesh — sharing a material across
     instanced meshes risks program/attribute cache mix-ups */
  const initColor = new THREE.Color(COL.acid);
  const barGeo = new THREE.BoxGeometry(1.05, 0.055, 0.14);
  const bars = new THREE.InstancedMesh(barGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }), AGV_COUNT);
  bars.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  bars.frustumCulled = false;
  for (let i = 0; i < AGV_COUNT; i++) bars.setColorAt(i, initColor);
  scene.add(bars);
  const stripGeo = new THREE.BoxGeometry(1.04, 0.075, 0.05);
  const strips = new THREE.InstancedMesh(stripGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }), AGV_COUNT);
  strips.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  strips.frustumCulled = false;
  for (let i = 0; i < AGV_COUNT; i++) strips.setColorAt(i, initColor);
  scene.add(strips);
  const STRIP_OFF = new THREE.Vector3(0, 0.665, 0.9); // mast top front edge
  const lastStatus = new Int8Array(AGV_COUNT).fill(-1);
  const lastHeading = new Float32Array(AGV_COUNT);

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
    opacity: 0.5,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
  });
  const SHADOW_COUNT = AGV_COUNT + 4; // AGVs + trucks
  const shadows = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), shadowMat, SHADOW_COUNT);
  shadows.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  shadows.frustumCulled = false;
  const qFlat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
  scene.add(shadows);

  /* ---- pallets (pool) ---- */
  const palletMat = new THREE.MeshStandardMaterial({
    color: 0x7a6748,
    metalness: 0.05,
    roughness: 0.85,
  });
  const palletMesh = new THREE.InstancedMesh(palletGeometry(), palletMat, PALLET_COUNT);
  palletMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  palletMesh.frustumCulled = false;
  scene.add(palletMesh);

  /* ---- shuttles (Regalgänge) ---- */
  const shuttleGeo = new THREE.BoxGeometry(1.05, 0.3, 1.5);
  const shuttleMat = new THREE.MeshStandardMaterial({
    color: 0x2f5a52,
    metalness: 0.6,
    roughness: 0.4,
    emissive: new THREE.Color(COL.cyan),
    emissiveIntensity: 0.85, // read clearly inside the dark aisles
  });
  const shuttles = new THREE.InstancedMesh(shuttleGeo, shuttleMat, sim.shuttles.length);
  shuttles.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  shuttles.frustumCulled = false;
  scene.add(shuttles);

  /* ---- RBGs (Gang A + C): Portalrahmen + Hubwerk ---- */
  const rbgMat = new THREE.MeshStandardMaterial({ color: 0x67727e, metalness: 0.8, roughness: 0.4 });
  const rbgLiftMat = new THREE.MeshStandardMaterial({
    color: 0x67727e,
    metalness: 0.7,
    roughness: 0.4,
    emissive: new THREE.Color(COL.acid),
    emissiveIntensity: 0.28, // Hubwerk glimmt — aus der Gangperspektive lesbar
  });
  const rbgUnits: Array<{ frame: THREE.Mesh; lift: THREE.Mesh }> = [];
  for (let i = 0; i < sim.rbgs.length; i++) {
    const up1 = new THREE.BoxGeometry(0.28, 11.4, 0.28);
    up1.translate(-1.35, 5.7, 0);
    const up2 = new THREE.BoxGeometry(0.28, 11.4, 0.28);
    up2.translate(1.35, 5.7, 0);
    const beam = new THREE.BoxGeometry(3.0, 0.32, 0.34);
    beam.translate(0, 11.35, 0);
    const frame = new THREE.Mesh(mergeGeometries([up1, up2, beam])!, rbgMat);
    const lift = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.4, 1.15), rbgLiftMat);
    scene.add(frame, lift);
    rbgUnits.push({ frame, lift });
  }

  /* ---- LKW: Trailer + Zugmaschine + Schlusslichter (instanced) ---- */
  const trailerGeo = new THREE.BoxGeometry(2.55, 2.7, 12.5);
  trailerGeo.translate(0, 1.75, 0);
  const trailerMat = new THREE.MeshStandardMaterial({ color: 0x2a3138, metalness: 0.5, roughness: 0.55 });
  const trailers = new THREE.InstancedMesh(trailerGeo, trailerMat, 4);
  trailers.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  trailers.frustumCulled = false;
  const cabGeo = new THREE.BoxGeometry(2.5, 2.5, 3.0);
  cabGeo.translate(0, 1.5, 0);
  const cabMat = new THREE.MeshStandardMaterial({ color: 0x39424a, metalness: 0.6, roughness: 0.45 });
  const cabs = new THREE.InstancedMesh(cabGeo, cabMat, 4);
  cabs.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  cabs.frustumCulled = false;
  const tailGeo = new THREE.BoxGeometry(0.22, 0.13, 0.07);
  const tailMat = new THREE.MeshBasicMaterial({ color: 0x8c1f16 });
  const tails = new THREE.InstancedMesh(tailGeo, tailMat, 8);
  tails.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  tails.frustumCulled = false;
  scene.add(trailers, cabs, tails);

  /* ---- hover ring + holo tag ---- */
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(1.4, 1.66, 28),
    new THREE.MeshBasicMaterial({
      color: COL.acid,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.06;
  ring.visible = false;
  scene.add(ring);

  const tagCanvas = document.createElement('canvas');
  tagCanvas.width = 256;
  tagCanvas.height = 64;
  const tagCtx = tagCanvas.getContext('2d')!;
  const tagTex = new THREE.CanvasTexture(tagCanvas);
  tagTex.colorSpace = THREE.SRGBColorSpace;
  const tagMat = new THREE.SpriteMaterial({
    map: tagTex,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const tag = new THREE.Sprite(tagMat);
  tag.scale.set(3.4, 0.85, 1);
  tag.visible = false;
  scene.add(tag);
  let tagText = '';
  let focusId = -1;
  let focusHeld = false;

  function drawTag(text: string, held: boolean): void {
    if (text === tagText && held === focusHeld) return;
    tagText = text;
    focusHeld = held;
    tagCtx.clearRect(0, 0, 256, 64);
    const c = held ? '#ff5a4a' : '#b4ff39';
    tagCtx.strokeStyle = c;
    tagCtx.globalAlpha = 0.9;
    tagCtx.lineWidth = 2;
    tagCtx.strokeRect(4, 8, 248, 48);
    tagCtx.fillStyle = c;
    tagCtx.font = '700 26px "JetBrains Mono", monospace';
    tagCtx.textAlign = 'center';
    tagCtx.textBaseline = 'middle';
    tagCtx.shadowColor = c;
    tagCtx.shadowBlur = 10;
    tagCtx.fillText(text, 128, 33);
    tagTex.needsUpdate = true;
  }

  let hoverId = -1;

  return {
    agvMesh,
    setHover(id: number) {
      hoverId = id;
    },
    setFocus(id: number, label: string, held: boolean) {
      focusId = id;
      if (id >= 0) drawTag(label, held);
    },
    update(alpha: number) {
      /* AGVs */
      for (let i = 0; i < AGV_COUNT; i++) {
        const a = sim.agvs[i];
        const x = a.px + (a.x - a.px) * alpha;
        const z = a.pz + (a.z - a.pz) * alpha;
        /* smooth the heading toward the edge direction */
        let dh = a.heading - lastHeading[i];
        if (dh > Math.PI) dh -= Math.PI * 2;
        if (dh < -Math.PI) dh += Math.PI * 2;
        lastHeading[i] += dh * Math.min(1, alpha + 0.12);
        Q.setFromAxisAngle(Y_AXIS, lastHeading[i]);
        P.set(x, 0, z);
        m4.compose(P, Q, S);
        agvMesh.setMatrixAt(i, m4);

        /* status bar rides on the deck */
        P.y = 0.76;
        m4.compose(P, Q, S);
        bars.setMatrixAt(i, m4);
        /* mast strip: flat light along the front top edge (offset
           rotated with the heading) */
        tmpOff.copy(STRIP_OFF).applyQuaternion(Q);
        P.set(x + tmpOff.x, tmpOff.y, z + tmpOff.z);
        m4.compose(P, Q, S);
        strips.setMatrixAt(i, m4);
        if (a.status !== lastStatus[i]) {
          lastStatus[i] = a.status;
          const c = STATUS_COLORS[a.status] ?? STATUS_COLORS[AGV_GO];
          bars.setColorAt(i, c);
          strips.setColorAt(i, c);
        }

        /* fake contact shadow */
        P.y = 0.028;
        m4.compose(P, qFlat, S.set(3.0, 2.5, 1));
        shadows.setMatrixAt(i, m4);
        S.set(1, 1, 1);
      }
      agvMesh.instanceMatrix.needsUpdate = true;
      bars.instanceMatrix.needsUpdate = true;
      strips.instanceMatrix.needsUpdate = true;
      if (bars.instanceColor) bars.instanceColor.needsUpdate = true;
      if (strips.instanceColor) strips.instanceColor.needsUpdate = true;

      /* pallets */
      for (let i = 0; i < PALLET_COUNT; i++) {
        const p = sim.pallets[i];
        if (p.mode === 'free' || p.mode === 'gone') {
          m4.makeScale(0, 0, 0);
          palletMesh.setMatrixAt(i, m4);
          continue;
        }
        if (p.mode === 'agv' && p.agv >= 0) {
          const a = sim.agvs[p.agv];
          P.set(a.px + (a.x - a.px) * alpha, 0.68, a.pz + (a.z - a.pz) * alpha);
          Q.setFromAxisAngle(Y_AXIS, lastHeading[p.agv]);
        } else if (p.mode === 'rbg' && p.rbg >= 0) {
          const r = sim.rbgs[p.rbg];
          P.set(r.x, r.plY + (r.liftY - r.plY) * alpha + 0.35, r.pz + (r.z - r.pz) * alpha);
          Q.identity();
        } else {
          P.set(p.x, p.y + 0.02, p.z);
          Q.setFromAxisAngle(Y_AXIS, p.ry);
        }
        m4.compose(P, Q, S);
        palletMesh.setMatrixAt(i, m4);
      }
      palletMesh.instanceMatrix.needsUpdate = true;

      /* shuttles */
      for (let i = 0; i < sim.shuttles.length; i++) {
        const s = sim.shuttles[i];
        P.set(s.x, s.y, s.pz + (s.z - s.pz) * alpha);
        Q.setFromAxisAngle(Y_AXIS, s.tz >= s.z ? 0 : Math.PI);
        m4.compose(P, Q, S);
        shuttles.setMatrixAt(i, m4);
      }
      shuttles.instanceMatrix.needsUpdate = true;

      /* RBGs */
      for (let i = 0; i < sim.rbgs.length; i++) {
        const r = sim.rbgs[i];
        const u = rbgUnits[i];
        u.frame.position.set(r.x, 0, r.pz + (r.z - r.pz) * alpha);
        u.lift.position.set(r.x, r.plY + (r.liftY - r.plY) * alpha + 0.2, u.frame.position.z);
      }

      /* trucks */
      for (let i = 0; i < 4; i++) {
        const t = sim.trucks[i];
        const z = t.pz + (t.z - t.pz) * alpha;
        const hidden = t.phase === 'away';
        const sc = hidden ? 0 : 1;
        P.set(t.x, 0, z);
        S.set(sc, sc, sc);
        m4.compose(P, Q.identity(), S);
        trailers.setMatrixAt(i, m4);
        P.z = z - 7.8;
        m4.compose(P, Q, S);
        cabs.setMatrixAt(i, m4);
        /* tail lights at the trailer rear */
        P.set(t.x - 1.0, 0.95, z - 6.3);
        m4.compose(P, Q, S);
        tails.setMatrixAt(i * 2, m4);
        P.x = t.x + 1.0;
        m4.compose(P, Q, S);
        tails.setMatrixAt(i * 2 + 1, m4);
        /* shadow slab under the trailer */
        P.set(t.x, 0.028, z - 2);
        m4.compose(P, qFlat, S.set(hidden ? 0 : 4.4, hidden ? 0 : 14, 1));
        shadows.setMatrixAt(AGV_COUNT + i, m4);
        S.set(1, 1, 1);
      }
      trailers.instanceMatrix.needsUpdate = true;
      cabs.instanceMatrix.needsUpdate = true;
      tails.instanceMatrix.needsUpdate = true;
      shadows.instanceMatrix.needsUpdate = true;

      /* hover ring */
      if (hoverId >= 0 && focusId < 0) {
        const a = sim.agvs[hoverId];
        ring.visible = true;
        ring.position.set(a.px + (a.x - a.px) * alpha, 0.06, a.pz + (a.z - a.pz) * alpha);
      } else if (focusId >= 0) {
        const a = sim.agvs[focusId];
        ring.visible = true;
        ring.position.set(a.px + (a.x - a.px) * alpha, 0.06, a.pz + (a.z - a.pz) * alpha);
      } else {
        ring.visible = false;
      }

      /* holo tag over the focused (held/hovered) AGV */
      if (focusId >= 0) {
        const a = sim.agvs[focusId];
        tag.visible = true;
        tag.position.set(a.px + (a.x - a.px) * alpha, 1.85, a.pz + (a.z - a.pz) * alpha);
      } else {
        tag.visible = false;
      }
    },
    dispose() {
      scene.remove(agvMesh, bars, strips, shadows, palletMesh, shuttles, trailers, cabs, tails, ring, tag);
      for (const u of rbgUnits) scene.remove(u.frame, u.lift);
    },
  };
}
