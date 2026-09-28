/* ------------------------------------------------------------------ */
/* Zone fit-out (T-103): turns the T-101 placeholder volumes into the  */
/* actual motifs — PROOF data lanes, WORK conveyor loop + Prüfstraße,  */
/* Gefahrgut signage/containment/shower, STACK skill bins, BEYOND      */
/* lounge gear, DOCK seals + traffic lights, BOOT info stelae.         */
/* Everything merged/instanced, no external assets.                    */
/* ------------------------------------------------------------------ */

import * as THREE from 'three';
import { GALLERY, MEZZ, LEITSTAND, CAGE, LOUNGE, DOORS, HALL, COL, CONV, QLANE } from '../layout';
import { GeoBatch, canvasTexture } from '../util';

export interface StackDatum {
  name: string;
  level: number;
}
export interface StackData {
  tools: StackDatum[];
  methods: StackDatum[];
}

export interface ZoneHandles {
  /** emissive/basic materials that ride a power-up group */
  powerMats: Array<{ mat: THREE.MeshBasicMaterial; group: number }>;
  /** scanner light curtain — index.ts oscillates the opacity */
  scanMat: THREE.MeshBasicMaterial;
  /** extra zone accent lights riding a power group (no shadows) */
  lights: Array<{ light: THREE.Light; group: number }>;
  /** TOR 1 traffic-light lenses — the DOCK interaction flips them (T-104) */
  dockSignal: DockSignal;
}

const ACID = new THREE.Color(COL.acid);
const CYAN = new THREE.Color(COL.cyan);

const steel = new THREE.MeshStandardMaterial({ color: 0x39424a, metalness: 0.85, roughness: 0.42 });
const darkSteel = new THREE.MeshStandardMaterial({ color: 0x22282e, metalness: 0.8, roughness: 0.5 });
const beltSteel = new THREE.MeshStandardMaterial({ color: 0x3d454e, metalness: 0.75, roughness: 0.45 });
const rollerSteel = new THREE.MeshStandardMaterial({ color: 0x8b939e, metalness: 0.9, roughness: 0.3 });
const foam = new THREE.MeshStandardMaterial({ color: 0x17191c, metalness: 0.1, roughness: 0.9 });

/* ============================ PROOF ================================= */
/* Two elevated data bands from the hall floor into the Leitstand glass
   and back out: manual lane (cyan, inbound) + pipeline (acid, outbound).
   Packets are animated by sim/packages.ts. */
function buildProof(scene: THREE.Scene, powerMats: ZoneHandles['powerMats']): void {
  const g = new GeoBatch();
  const len = QLANE.x1 - QLANE.x0;
  const cx = (QLANE.x0 + QLANE.x1) / 2;
  for (const z of [QLANE.zIn, QLANE.zOut]) {
    g.box(len, 0.07, 0.5, cx, QLANE.y - 0.05, z); // band
    g.box(0.5, 0.1, 0.5, QLANE.x1 - 0.05, QLANE.y - 0.02, z); // port into the glass
  }
  /* supports + cross bars */
  for (let x = QLANE.x0 + 2; x < QLANE.x1 - 1; x += 6.4) {
    for (const z of [QLANE.zIn, QLANE.zOut]) g.box(0.09, QLANE.y - 0.08, 0.09, x, (QLANE.y - 0.08) / 2, z);
    g.box(0.09, 0.09, QLANE.zOut - QLANE.zIn + 0.5, x, QLANE.y - 0.12, (QLANE.zIn + QLANE.zOut) / 2);
  }
  /* portal frame at the hall end — the bands don't end mid-air */
  g.box(0.12, 4.3, 0.12, QLANE.x0, 2.15, QLANE.zIn - 0.35);
  g.box(0.12, 4.3, 0.12, QLANE.x0, 2.15, QLANE.zOut + 0.35);
  g.box(0.12, 0.12, QLANE.zOut - QLANE.zIn + 0.82, QLANE.x0, 4.24, (QLANE.zIn + QLANE.zOut) / 2);
  scene.add(g.mesh(steel, true, false));

  /* glowing top edges: cyan = manual (inbound), acid = pipeline */
  const cyanLane = new THREE.MeshBasicMaterial({ color: CYAN.clone().multiplyScalar(0.55) });
  const acidLane = new THREE.MeshBasicMaterial({ color: ACID.clone().multiplyScalar(0.5) });
  const glow = new GeoBatch();
  glow.box(len, 0.02, 0.34, cx, QLANE.y + 0.005, QLANE.zIn);
  scene.add(glow.mesh(cyanLane, false, false));
  const glow2 = new GeoBatch();
  glow2.box(len, 0.02, 0.34, cx, QLANE.y + 0.005, QLANE.zOut);
  scene.add(glow2.mesh(acidLane, false, false));
  powerMats.push({ mat: cyanLane, group: 3 }, { mat: acidLane, group: 3 });
}

/* ============================ WORK ================================== */
/* Oval roller conveyor between the AGV loop and the dock lane, with a
   scanner portal (Prüfstraße) + diverter + rejection siding on the
   north straight and three pick stations on the south side. */
function buildWork(scene: THREE.Scene, powerMats: ZoneHandles['powerMats']): {
  scanMat: THREE.MeshBasicMaterial;
} {
  const frame = new GeoBatch();
  const midX = (CONV.x0 + CONV.x1) / 2;
  const sLen = CONV.x1 - CONV.x0;

  /* belt frames (straights) + half-disc end platforms */
  for (const z of [CONV.zN, CONV.zS]) {
    frame.box(sLen, 0.1, CONV.beltW, midX, CONV.beltY - 0.09, z);
    /* side rails */
    frame.box(sLen, 0.07, 0.05, midX, CONV.beltY + 0.06, z - CONV.beltW / 2 - 0.02);
    frame.box(sLen, 0.07, 0.05, midX, CONV.beltY + 0.06, z + CONV.beltW / 2 + 0.02);
    /* legs */
    for (let x = CONV.x0 + 0.6; x <= CONV.x1 - 0.4; x += 3.2) {
      frame.box(0.08, CONV.beltY - 0.14, 0.08, x, (CONV.beltY - 0.14) / 2, z - CONV.beltW / 2 + 0.1);
      frame.box(0.08, CONV.beltY - 0.14, 0.08, x, (CONV.beltY - 0.14) / 2, z + CONV.beltW / 2 - 0.1);
    }
  }
  /* end arcs: solid half-disc platforms the rollers wrap around */
  for (const ex of [CONV.x0, CONV.x1]) {
    const disc = new THREE.CylinderGeometry(CONV.r + CONV.beltW / 2, CONV.r + CONV.beltW / 2, 0.1, 24);
    frame.add(disc, ex, CONV.beltY - 0.09, (CONV.zN + CONV.zS) / 2);
    frame.box(0.1, CONV.beltY - 0.14, 0.1, ex, (CONV.beltY - 0.14) / 2, (CONV.zN + CONV.zS) / 2);
  }
  scene.add(frame.mesh(beltSteel, true, false));

  /* rollers: merged cylinders across both straights */
  const rollers = new GeoBatch();
  for (const z of [CONV.zN, CONV.zS]) {
    for (let x = CONV.x0 + 0.25; x <= CONV.x1 - 0.2; x += 0.45) {
      rollers.cyl(0.035, 0.035, CONV.beltW - 0.08, 8, x, CONV.beltY - 0.02, z, Math.PI / 2);
    }
  }
  scene.add(rollers.mesh(rollerSteel, false, false));

  /* acid edge strips along the outer rails */
  const edgeMat = new THREE.MeshBasicMaterial({ color: ACID.clone().multiplyScalar(0.5) });
  const edges = new GeoBatch();
  edges.box(sLen, 0.025, 0.025, midX, CONV.beltY + 0.1, CONV.zN - CONV.beltW / 2 - 0.02);
  edges.box(sLen, 0.025, 0.025, midX, CONV.beltY + 0.1, CONV.zS + CONV.beltW / 2 + 0.02);
  scene.add(edges.mesh(edgeMat, false, false));
  powerMats.push({ mat: edgeMat, group: 2 });

  /* cyan under-glow strips — the loop reads from across the dark hall */
  const underMat = new THREE.MeshBasicMaterial({ color: CYAN.clone().multiplyScalar(0.4) });
  const under = new GeoBatch();
  for (const z of [CONV.zN, CONV.zS]) under.box(sLen, 0.03, 0.06, midX, CONV.beltY - 0.17, z);
  scene.add(under.mesh(underMat, false, false));
  powerMats.push({ mat: underMat, group: 2 });

  /* scanner portal on the north straight */
  const portal = new GeoBatch();
  portal.box(0.18, 2.5, 0.18, CONV.scanX, 1.25, CONV.zN - CONV.beltW / 2 - 0.25);
  portal.box(0.18, 2.5, 0.18, CONV.scanX, 1.25, CONV.zN + CONV.beltW / 2 + 0.25);
  portal.box(0.22, 0.24, CONV.beltW + 0.75, CONV.scanX, 2.55, CONV.zN);
  scene.add(portal.mesh(darkSteel, true, false));
  /* light curtain — additive, opacity oscillates in the render loop */
  const scanMat = new THREE.MeshBasicMaterial({
    color: CYAN.clone(),
    transparent: true,
    opacity: 0.16,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const curtain = new THREE.Mesh(new THREE.PlaneGeometry(CONV.beltW + 0.4, 1.5), scanMat);
  curtain.rotation.y = Math.PI / 2;
  curtain.position.set(CONV.scanX, CONV.beltY + 0.78, CONV.zN);
  scene.add(curtain);

  /* diverter arm + amber marker at the branch point */
  const div = new GeoBatch();
  div.box(0.1, 0.5, 1.25, CONV.divX, CONV.beltY + 0.35, CONV.zN, 0.55);
  div.box(0.24, 0.9, 0.24, CONV.divX + 0.45, 0.45, CONV.zN + CONV.beltW / 2 + 0.35);
  scene.add(div.mesh(darkSteel, true, false));
  const divMark = new THREE.Mesh(
    new THREE.SphereGeometry(0.07, 8, 6),
    new THREE.MeshBasicMaterial({ color: COL.amber }),
  );
  divMark.position.set(CONV.divX + 0.45, 1.0, CONV.zN + CONV.beltW / 2 + 0.35);
  scene.add(divMark);

  /* rejection siding (Abstellgleis): stub belt north off the diverter */
  const stubLen = CONV.zN - CONV.beltW / 2 - CONV.stubZ;
  const stub = new GeoBatch();
  stub.box(CONV.beltW, 0.1, stubLen, CONV.divX, CONV.beltY - 0.09, CONV.zN - CONV.beltW / 2 - stubLen / 2);
  stub.box(0.05, 0.07, stubLen, CONV.divX - CONV.beltW / 2 - 0.02, CONV.beltY + 0.06, CONV.zN - CONV.beltW / 2 - stubLen / 2);
  stub.box(0.05, 0.07, stubLen, CONV.divX + CONV.beltW / 2 + 0.02, CONV.beltY + 0.06, CONV.zN - CONV.beltW / 2 - stubLen / 2);
  stub.box(CONV.beltW + 0.3, 0.5, 0.08, CONV.divX, CONV.beltY + 0.2, CONV.stubZ - 0.06); // end stop
  for (const dz of [0.7, stubLen - 0.5]) {
    stub.box(0.08, CONV.beltY - 0.14, 0.08, CONV.divX - CONV.beltW / 2 + 0.1, (CONV.beltY - 0.14) / 2, CONV.zN - CONV.beltW / 2 - dz);
    stub.box(0.08, CONV.beltY - 0.14, 0.08, CONV.divX + CONV.beltW / 2 - 0.1, (CONV.beltY - 0.14) / 2, CONV.zN - CONV.beltW / 2 - dz);
  }
  scene.add(stub.mesh(beltSteel, true, false));
  const stubRollers = new GeoBatch();
  for (let d = 0.3; d < stubLen - 0.2; d += 0.45) {
    stubRollers.cyl(0.035, 0.035, CONV.beltW - 0.08, 8, CONV.divX, CONV.beltY - 0.02, CONV.zN - CONV.beltW / 2 - d, 0, Math.PI / 2);
  }
  scene.add(stubRollers.mesh(rollerSteel, false, false));

  /* three pick stations along the south side */
  const pickLight = new THREE.MeshBasicMaterial({ color: ACID.clone().multiplyScalar(0.5) });
  const desks = new GeoBatch();
  const totes = new GeoBatch();
  for (const px of [-10, -2, 4]) {
    const pz = CONV.zS + 1.35; // between belt and AGV lane
    desks.box(1.6, 0.07, 0.7, px, 0.8, pz);
    desks.box(0.08, 0.8, 0.08, px - 0.7, 0.4, pz - 0.28);
    desks.box(0.08, 0.8, 0.08, px + 0.7, 0.4, pz - 0.28);
    desks.box(0.08, 0.8, 0.08, px - 0.7, 0.4, pz + 0.28);
    desks.box(0.08, 0.8, 0.08, px + 0.7, 0.4, pz + 0.28);
    /* task light posts + strip */
    desks.box(0.06, 1.9, 0.06, px - 0.75, 0.95, pz + 0.3);
    desks.box(0.06, 1.9, 0.06, px + 0.75, 0.95, pz + 0.3);
    /* tote bin beside the desk */
    totes.box(0.55, 0.4, 0.4, px + 1.15, 0.2, pz);
  }
  scene.add(desks.mesh(darkSteel, true, false));
  scene.add(totes.mesh(new THREE.MeshStandardMaterial({ color: 0x7a6748, roughness: 0.85 }), true, false));
  const strips = new GeoBatch();
  for (const px of [-10, -2, 4]) strips.box(1.55, 0.04, 0.04, px, 1.92, CONV.zS + 1.65);
  scene.add(strips.mesh(pickLight, false, false));
  powerMats.push({ mat: pickLight, group: 2 });

  return { scanMat };
}

/* ========================== GEFAHRGUT =============================== */
/* ADR/GHS diamonds (class 3 + 8, pictograms — language-neutral), spill
   trays with extra drums, emergency shower with green-cross sign. */
function adrTexture(cls: 3 | 8): THREE.CanvasTexture {
  return canvasTexture(256, 256, (ctx, W, H) => {
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.rotate(Math.PI / 4);
    const s = W * 0.62;
    ctx.fillStyle = '#e8760a';
    ctx.fillRect(-s / 2, -s / 2, s, s);
    ctx.strokeStyle = '#111';
    ctx.lineWidth = 7;
    ctx.strokeRect(-s / 2, -s / 2, s, s);
    ctx.restore();

    ctx.strokeStyle = '#111';
    ctx.fillStyle = '#111';
    ctx.lineWidth = 7;
    ctx.lineCap = 'round';
    if (cls === 3) {
      /* flame pictogram */
      ctx.beginPath();
      ctx.moveTo(128, 62);
      ctx.bezierCurveTo(150, 92, 158, 104, 158, 126);
      ctx.bezierCurveTo(158, 148, 144, 162, 128, 162);
      ctx.bezierCurveTo(112, 162, 98, 148, 98, 126);
      ctx.bezierCurveTo(98, 106, 112, 96, 118, 78);
      ctx.bezierCurveTo(122, 92, 130, 96, 132, 104);
      ctx.closePath();
      ctx.fill();
    } else {
      /* corrosion: two bars, drops eating into them */
      ctx.fillRect(88, 108, 80, 10);
      ctx.fillRect(88, 150, 80, 10);
      for (const [dx, dy] of [
        [104, 92],
        [124, 82],
        [144, 92],
      ]) {
        ctx.beginPath();
        ctx.arc(dx, dy, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillRect(dx - 2, dy - 22, 4, 18);
      }
      ctx.beginPath();
      ctx.moveTo(104, 104);
      ctx.lineTo(112, 112);
      ctx.moveTo(144, 104);
      ctx.lineTo(136, 112);
      ctx.stroke();
    }
    /* class digit in the bottom corner of the diamond */
    ctx.font = '700 44px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(String(cls), 128, 214);
  });
}

function buildCage(scene: THREE.Scene, powerMats: ZoneHandles['powerMats']): void {
  const cx = (CAGE.x0 + CAGE.x1) / 2;

  /* big legible ADR diamonds on the south fence (facing the hall) and
     one of each class on the west fence */
  const adr3 = new THREE.MeshBasicMaterial({ map: adrTexture(3), transparent: true });
  const adr8 = new THREE.MeshBasicMaterial({ map: adrTexture(8), transparent: true });
  const mkPlate = (mat: THREE.MeshBasicMaterial, x: number, y: number, z: number, ry: number) => {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(1.05, 1.05), mat);
    p.position.set(x, y, z);
    p.rotation.y = ry;
    scene.add(p);
  };
  mkPlate(adr3, cx - 2.2, 2.5, CAGE.z1 + 0.07, 0);
  mkPlate(adr8, cx + 2.2, 2.5, CAGE.z1 + 0.07, 0);
  mkPlate(adr3, CAGE.x0 - 0.07, 2.5, CAGE.z0 + 3, -Math.PI / 2);
  mkPlate(adr8, CAGE.x0 - 0.07, 2.5, CAGE.z0 + 6.4, -Math.PI / 2);

  /* spill trays (Auffangwannen) with extra drums, south row inside */
  const trayMat = new THREE.MeshStandardMaterial({ color: 0x8a8f2e, metalness: 0.4, roughness: 0.6 });
  const drumMat = new THREE.MeshStandardMaterial({ color: 0x39577e, metalness: 0.35, roughness: 0.5 });
  const trays = new GeoBatch();
  const drums = new GeoBatch();
  for (const tx of [CAGE.x0 + 3.4, CAGE.x0 + 7.6]) {
    const tz = CAGE.z1 - 2.2;
    trays.box(2.7, 0.13, 1.5, tx, 0.07, tz);
    trays.box(2.7, 0.16, 0.08, tx, 0.14, tz - 0.71);
    trays.box(2.7, 0.16, 0.08, tx, 0.14, tz + 0.71);
    trays.box(0.08, 0.16, 1.5, tx - 1.31, 0.14, tz);
    trays.box(0.08, 0.16, 1.5, tx + 1.31, 0.14, tz);
    for (let b = 0; b < 4; b++) {
      drums.cyl(0.3, 0.3, 0.88, 9, tx - 0.62 + (b % 2) * 1.24, 0.58, tz - 0.33 + ((b >> 1) % 2) * 0.66);
    }
  }
  scene.add(trays.mesh(trayMat, true, true));
  scene.add(drums.mesh(drumMat, true, true));

  /* emergency shower just inside the south fence + green cross sign */
  const sx = CAGE.x0 + 1.3;
  const sz = CAGE.z1 - 1.3;
  const shower = new GeoBatch();
  shower.cyl(0.05, 0.06, 2.6, 8, sx, 1.3, sz);
  shower.cyl(0.04, 0.04, 0.5, 6, sx + 0.22, 2.5, sz, 0, Math.PI / 2);
  shower.cyl(0.16, 0.05, 0.18, 10, sx + 0.44, 2.38, sz);
  shower.box(0.03, 0.7, 0.03, sx + 0.12, 1.5, sz + 0.1); // pull rod
  scene.add(shower.mesh(new THREE.MeshStandardMaterial({ color: 0x2f7d4a, metalness: 0.4, roughness: 0.5 }), true, false));
  const crossTex = canvasTexture(128, 128, (ctx, W, H) => {
    ctx.fillStyle = '#0d7a3f';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#e8f4ea';
    ctx.fillRect(W / 2 - 14, 22, 28, H - 44);
    ctx.fillRect(22, H / 2 - 14, W - 44, 28);
  });
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.5), new THREE.MeshBasicMaterial({ map: crossTex }));
  sign.position.set(sx, 2.15, sz + 0.1);
  scene.add(sign);
  /* yellow floor ring under the shower */
  const ringTex = canvasTexture(128, 128, (ctx, W, H) => {
    ctx.strokeStyle = 'rgba(232,196,60,0.9)';
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.arc(W / 2, H / 2, 52, 0, Math.PI * 2);
    ctx.stroke();
  });
  const ring = new THREE.Mesh(
    new THREE.PlaneGeometry(1.7, 1.7),
    new THREE.MeshBasicMaterial({ map: ringTex, transparent: true, depthWrite: false }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(sx + 0.35, 0.03, sz);
  scene.add(ring);

  powerMats.push({ mat: adr3, group: 0 }, { mat: adr8, group: 0 });
}

export { buildProof, buildWork, buildCage };

/* ============================ STACK ================================= */
/* Skill shelves on the mezzanine: one bin per tool/method, fill height
   = level (1–5), names as a canvas-label atlas (single draw call).
   Tool names are proper nouns (language-neutral); method names arrive
   via parameter (i18n), never hardcoded. */
function buildStack(
  scene: THREE.Scene,
  stackData: StackData | null,
  powerMats: ZoneHandles['powerMats'],
): void {
  const tools = stackData?.tools ?? [];
  const methods = stackData?.methods ?? [];
  interface Bin extends StackDatum {
    kind: number; // 0 tool (acid), 1 method (cyan)
  }
  const bins: Bin[] = [
    ...tools.map((t) => ({ ...t, kind: 0 })),
    ...methods.map((m) => ({ ...m, kind: 1 })),
  ];
  if (bins.length === 0) return;

  /* two shelf units facing west toward the STACK viewpoint */
  const SHELF_X = 52.2; // unit center
  const UNITS = [
    { z0: 4.2, z1: 13.2, per: [4, 4] }, // tools: 2 rows × 4
    { z0: 15.6, z1: 24.6, per: [3, 2] }, // methods: 3 + 2
  ];
  const LEVELS_Y = [MEZZ.y + 0.35, MEZZ.y + 1.5];
  const BIN_W = 1.7;
  const BIN_H = 0.85;
  const BIN_D = 1.15;

  const frame = new GeoBatch();
  const fillAcid = new GeoBatch();
  const fillCyan = new GeoBatch();
  const labelPlanes: THREE.BufferGeometry[] = [];
  const binMeta: Bin[] = [];

  let bi = 0;
  for (const u of UNITS) {
    const w = u.z1 - u.z0;
    const cz = (u.z0 + u.z1) / 2;
    /* posts + 3 shelf boards + back panel */
    for (const pz of [u.z0 + 0.06, u.z1 - 0.06]) {
      frame.box(0.09, 3.0, 0.09, SHELF_X - BIN_D / 2, MEZZ.y + 1.5, pz);
      frame.box(0.09, 3.0, 0.09, SHELF_X + BIN_D / 2, MEZZ.y + 1.5, pz);
    }
    for (const ly of [MEZZ.y + 0.28, MEZZ.y + 1.43, MEZZ.y + 2.58]) {
      frame.box(BIN_D + 0.15, 0.07, w, SHELF_X, ly, cz);
    }
    frame.box(0.06, 2.9, w, SHELF_X + BIN_D / 2 + 0.05, MEZZ.y + 1.45, cz); // back

    for (let row = 0; row < u.per.length; row++) {
      const n = u.per[row];
      for (let k = 0; k < n; k++) {
        const bin = bins[bi++];
        if (!bin) break;
        binMeta.push(bin);
        const bz = u.z0 + (w / n) * (k + 0.5);
        const baseY = LEVELS_Y[row];
        /* bin side cheeks + front lip */
        frame.box(BIN_D, BIN_H, 0.05, SHELF_X, baseY + BIN_H / 2, bz - BIN_W / 2);
        frame.box(BIN_D, BIN_H, 0.05, SHELF_X, baseY + BIN_H / 2, bz + BIN_W / 2);
        frame.box(0.05, 0.18, BIN_W, SHELF_X - BIN_D / 2 + 0.03, baseY + 0.09, bz);
        /* fill level = skill level */
        const fh = Math.max(0.1, (Math.min(5, Math.max(1, bin.level)) / 5) * (BIN_H - 0.16));
        const fg = new THREE.BoxGeometry(BIN_D - 0.3, fh, BIN_W - 0.24);
        fg.translate(SHELF_X, baseY + 0.08 + fh / 2, bz);
        (bin.kind === 0 ? fillAcid : fillCyan).add(fg);
        /* label plane above the bin front, facing the viewpoint (west).
           4:1 aspect matches the 512×128 atlas cells */
        const lg = new THREE.PlaneGeometry(1.6, 0.4);
        const uv = lg.getAttribute('uv') as THREE.BufferAttribute;
        const col = binMeta.length - 1 - Math.floor((binMeta.length - 1) / 4) * 4;
        const rowA = Math.floor((binMeta.length - 1) / 4);
        for (let vi = 0; vi < uv.count; vi++) {
          uv.setXY(vi, (col + uv.getX(vi)) / 4, 1 - (rowA + (1 - uv.getY(vi))) / 4);
        }
        lg.rotateY(-Math.PI / 2);
        lg.translate(SHELF_X - BIN_D / 2 - 0.06, baseY + BIN_H + 0.26, bz);
        labelPlanes.push(lg);
      }
    }
  }
  scene.add(frame.mesh(steel, true, false));

  const fillAcidMat = new THREE.MeshBasicMaterial({ color: ACID.clone().multiplyScalar(0.55) });
  const fillCyanMat = new THREE.MeshBasicMaterial({ color: CYAN.clone().multiplyScalar(0.6) });
  scene.add(fillAcid.mesh(fillAcidMat, false, false));
  scene.add(fillCyan.mesh(fillCyanMat, false, false));
  powerMats.push({ mat: fillAcidMat, group: 2 }, { mat: fillCyanMat, group: 2 });

  /* label atlas: 4×4 cells of 512×128 (wide enough for one-line names) */
  const atlas = canvasTexture(2048, 512, (ctx) => {
    ctx.clearRect(0, 0, 2048, 512);
    binMeta.forEach((bin, i) => {
      const col = i % 4;
      const row = Math.floor(i / 4);
      const x0 = col * 512;
      const y0 = row * 128;
      const accent = bin.kind === 0 ? '#b4ff39' : '#7dffd8';
      ctx.fillStyle = 'rgba(6,10,8,0.72)';
      ctx.fillRect(x0 + 4, y0 + 4, 504, 120);
      ctx.strokeStyle = accent;
      ctx.globalAlpha = 0.8;
      ctx.lineWidth = 3;
      ctx.strokeRect(x0 + 4, y0 + 4, 504, 120);
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#e8ece4';
      ctx.textAlign = 'center';
      /* shrink the font until the name fits on one line */
      let fs = 42;
      ctx.font = `600 ${fs}px "JetBrains Mono", monospace`;
      while (fs > 24 && ctx.measureText(bin.name).width > 460) {
        fs -= 3;
        ctx.font = `600 ${fs}px "JetBrains Mono", monospace`;
      }
      ctx.fillText(bin.name, x0 + 256, y0 + 58);
      /* level pips */
      for (let p = 0; p < 5; p++) {
        ctx.fillStyle = p < bin.level ? accent : 'rgba(232,236,228,0.18)';
        ctx.fillRect(x0 + 256 - 70 + p * 32, y0 + 84, 24, 12);
      }
    });
  });
  const labelMat = new THREE.MeshBasicMaterial({ map: atlas, transparent: true });
  const labelBatch = new GeoBatch();
  for (const g of labelPlanes) labelBatch.add(g);
  scene.add(labelBatch.mesh(labelMat, false, false));
}

/* ============================ BEYOND ================================ */
/* Lounge fit-out: 4-deck DJ pult + mixer, podcast table with two mic
   arms, gym rack + bench + barbell on the west wall (in view of the
   BEYOND camera), warm accents. */
function buildLounge(
  scene: THREE.Scene,
  powerMats: ZoneHandles['powerMats'],
  lights: ZoneHandles['lights'],
): void {
  const dark = new THREE.MeshStandardMaterial({ color: 0x24282d, metalness: 0.6, roughness: 0.5 });
  const gymMetal = new THREE.MeshStandardMaterial({ color: 0x99a1aa, metalness: 0.8, roughness: 0.35 });
  const deckGlowAmber = new THREE.MeshBasicMaterial({ color: new THREE.Color(COL.amber) });
  const deckGlowCyan = new THREE.MeshBasicMaterial({ color: CYAN.clone().multiplyScalar(0.7) });

  /* DJ pult against the south wall — widened for four decks + mixer */
  const dj = new GeoBatch();
  dj.box(4.2, 0.08, 0.95, -40.5, 0.98, 27.85); // top
  dj.box(4.2, 0.9, 0.12, -40.5, 0.5, 28.25); // back panel
  dj.box(0.12, 0.9, 0.9, -42.5, 0.5, 27.85); // sides
  dj.box(0.12, 0.9, 0.9, -38.5, 0.5, 27.85);
  scene.add(dj.mesh(dark, true, false));

  /* four decks (disc + glow ring) + central mixer with sliders */
  const discs = new GeoBatch();
  const ringsA = new GeoBatch();
  const ringsC = new GeoBatch();
  const deckXs = [-42.0, -41.25, -39.75, -39.0];
  deckXs.forEach((dx, i) => {
    discs.cyl(0.23, 0.23, 0.035, 18, dx, 1.05, 27.8);
    (i % 2 === 0 ? ringsA : ringsC).cyl(0.26, 0.26, 0.018, 18, dx, 1.045, 27.8);
    /* tone arm hint */
    discs.box(0.03, 0.02, 0.24, dx + 0.2, 1.07, 27.62, 0.5);
  });
  scene.add(discs.mesh(dark, false, false));
  scene.add(ringsA.mesh(deckGlowAmber, false, false));
  scene.add(ringsC.mesh(deckGlowCyan, false, false));
  const mixer = new GeoBatch();
  mixer.box(0.42, 0.06, 0.5, -40.5, 1.05, 27.8);
  for (let k = 0; k < 4; k++) mixer.box(0.03, 0.02, 0.3, -40.64 + k * 0.1, 1.09, 27.8);
  scene.add(mixer.mesh(darkSteel, false, false));
  powerMats.push({ mat: deckGlowAmber, group: 4 }, { mat: deckGlowCyan, group: 4 });

  /* podcast table deep in the room (out of the camera's near field),
     two stools + jointed mic arms: base, two segments with a visible
     joint ball, mic body + pop-filter head */
  const pod = new GeoBatch();
  pod.cyl(0.68, 0.68, 0.05, 20, -53.6, 0.74, 25.7); // round top
  pod.cyl(0.06, 0.08, 0.72, 8, -53.6, 0.37, 25.7); // leg
  pod.cyl(0.2, 0.24, 0.44, 10, -53.6, 0.22, 26.8); // stool S
  pod.cyl(0.2, 0.24, 0.44, 10, -53.6, 0.22, 24.6); // stool N
  scene.add(pod.mesh(dark, true, false));
  const mics = new GeoBatch();
  for (const dir of [1, -1]) {
    const bz = 25.7 + dir * 0.35; // arm base on the table edge
    mics.cyl(0.04, 0.05, 0.07, 8, -53.6, 0.8, bz); // table clamp base
    mics.cyl(0.016, 0.016, 0.4, 6, -53.6, 0.98, 25.7 + dir * 0.46, 0.6 * dir); // lower arm
    const joint = new THREE.SphereGeometry(0.032, 8, 6);
    joint.translate(-53.6, 1.16, 25.7 + dir * 0.57);
    mics.add(joint);
    mics.cyl(0.014, 0.014, 0.36, 6, -53.6, 1.24, 25.7 + dir * 0.83, 1.1 * dir); // upper arm
    mics.cyl(0.026, 0.03, 0.14, 8, -53.6, 1.3, 25.7 + dir * 1.05, 1.35 * dir); // mic body
    const head = new THREE.SphereGeometry(0.045, 10, 8);
    head.translate(-53.6, 1.32, 25.7 + dir * 1.14);
    mics.add(head); // pop-filter ball
  }
  scene.add(mics.mesh(darkSteel, false, false));

  /* gym corner on the WEST wall (in view of the BEYOND camera) */
  const gym = new GeoBatch();
  gym.box(0.14, 1.95, 0.14, -57.2, 0.98, 21.9); // rack uprights
  gym.box(0.14, 1.95, 0.14, -57.2, 0.98, 22.9);
  gym.box(0.14, 0.1, 1.1, -57.2, 1.92, 22.4); // crossbar
  gym.box(0.3, 0.06, 0.16, -57.05, 1.42, 21.9); // J-hooks
  gym.box(0.3, 0.06, 0.16, -57.05, 1.42, 22.9);
  gym.box(1.15, 0.12, 0.36, -55.9, 0.42, 22.4); // bench pad
  gym.box(0.1, 0.36, 0.3, -56.3, 0.18, 22.4);
  gym.box(0.1, 0.36, 0.3, -55.5, 0.18, 22.4);
  scene.add(gym.mesh(dark, true, false));
  /* bar + plates read bright against the dark west wall */
  const gymB = new GeoBatch();
  gymB.cyl(0.025, 0.025, 2.0, 8, -57.0, 1.48, 22.4, Math.PI / 2); // barbell bar
  for (const pz of [21.62, 21.78, 23.02, 23.18]) {
    gymB.cyl(0.21, 0.21, 0.07, 14, -57.0, 1.48, pz, Math.PI / 2); // plates
  }
  scene.add(gymB.mesh(gymMetal, true, false));

  /* warm accent light over the gym corner (rides the lounge group) */
  const gymLight = new THREE.PointLight(0xffc890, 46, 13, 1.9);
  gymLight.position.set(-55.2, 2.8, 22.4);
  scene.add(gymLight);
  lights.push({ light: gymLight, group: 4 });

  /* two extra warm wall dots on the south wall */
  const sconce = new GeoBatch();
  sconce.box(0.3, 0.08, 0.06, -44, 2.5, LOUNGE.z1 - 0.24);
  sconce.box(0.3, 0.08, 0.06, -37.5, 2.5, LOUNGE.z1 - 0.24);
  scene.add(sconce.mesh(deckGlowAmber, false, false));
}

/* ============================= DOCK ================================= */
/* Dock seals + two-lens traffic lights at the four big gates. The
   truck from T-102 docks at TOR 1 (sim). TOR 1's lenses get dedicated
   materials (T-104): the DOCK interaction flips red ↔ green when a
   contact pallet is loaded. */
export interface DockSignal {
  red: THREE.MeshBasicMaterial;
  green: THREE.MeshBasicMaterial;
}

function buildDock(scene: THREE.Scene): { signal0: DockSignal } {
  const seals = new GeoBatch();
  const housings = new GeoBatch();
  for (const d of DOORS.slice(0, 4)) {
    /* dock seal: two side pads + head pad, slightly proud of the wall */
    seals.box(0.45, d.h, 0.42, d.x - d.w / 2 + 0.1, d.h / 2, HALL.Z0 + 0.25);
    seals.box(0.45, d.h, 0.42, d.x + d.w / 2 - 0.1, d.h / 2, HALL.Z0 + 0.25);
    seals.box(d.w, 0.5, 0.42, d.x, d.h + 0.15, HALL.Z0 + 0.25);
    /* traffic light housing beside the opening */
    housings.box(0.26, 0.62, 0.16, d.x + d.w / 2 + 0.62, 3.1, HALL.Z0 + 0.14);
  }
  scene.add(seals.mesh(foam, true, false));
  scene.add(housings.mesh(darkSteel, true, false));

  /* lenses: TOR 1 dedicated (switchable), TOR 2–4 batched: red lit */
  const lensGeo = new THREE.CylinderGeometry(0.075, 0.075, 0.04, 10);
  lensGeo.rotateX(Math.PI / 2);
  const sig0: DockSignal = {
    red: new THREE.MeshBasicMaterial({ color: 0xff3524 }), // idle: red
    green: new THREE.MeshBasicMaterial({ color: 0x1a2a12 }), // green off
  };
  const l0x = DOORS[0].x + DOORS[0].w / 2 + 0.62;
  const l0z = HALL.Z0 + 0.24;
  const r0 = new THREE.Mesh(lensGeo, sig0.red);
  r0.position.set(l0x, 3.24, l0z);
  const g0 = new THREE.Mesh(lensGeo, sig0.green);
  g0.position.set(l0x, 2.98, l0z);
  scene.add(r0, g0);

  const redOn = new GeoBatch();
  const greenOff = new GeoBatch();
  DOORS.slice(1, 4).forEach((d) => {
    const lx = d.x + d.w / 2 + 0.62;
    const lz = HALL.Z0 + 0.24;
    redOn.cyl(0.075, 0.075, 0.04, 10, lx, 3.24, lz, Math.PI / 2);
    greenOff.cyl(0.075, 0.075, 0.04, 10, lx, 2.98, lz, Math.PI / 2);
  });
  scene.add(redOn.mesh(new THREE.MeshBasicMaterial({ color: 0xff3524 }), false, false));
  scene.add(greenOff.mesh(new THREE.MeshBasicMaterial({ color: 0x1a2a12 }), false, false));
  return { signal0: sig0 };
}

/* ============================= BOOT ================================= */
/* Visitor gallery fine polish: two info stelae with abstract holo
   screens (lines/graphic only — language-neutral). */
function steleTexture(): THREE.CanvasTexture {
  return canvasTexture(128, 96, (ctx, W, H) => {
    ctx.fillStyle = '#07110d';
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(180,255,57,0.85)';
    ctx.lineWidth = 2;
    ctx.strokeRect(4, 4, W - 8, H - 8);
    ctx.fillStyle = 'rgba(180,255,57,0.8)';
    ctx.fillRect(12, 12, 44, 6);
    ctx.fillStyle = 'rgba(125,255,216,0.5)';
    for (let k = 0; k < 5; k++) ctx.fillRect(12, 30 + k * 11, 30 + ((k * 37) % 70), 4);
    ctx.strokeStyle = 'rgba(125,255,216,0.7)';
    ctx.beginPath();
    for (let x = 0; x <= 8; x++) {
      const px = 70 + x * 6;
      const py = 78 - Math.sin(x * 1.1) * 16;
      if (x === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
  });
}

function buildGallery(scene: THREE.Scene, powerMats: ZoneHandles['powerMats']): void {
  const tex = steleTexture();
  const screenMat = new THREE.MeshBasicMaterial({ map: tex });
  screenMat.color.setScalar(1.2);
  const stands = new GeoBatch();
  const screens: THREE.BufferGeometry[] = [];
  for (const sx of [-27.6, -24.6]) {
    stands.box(0.55, 0.06, 0.42, sx, GALLERY.y + 0.03, 27.9);
    stands.box(0.09, 1.0, 0.09, sx, GALLERY.y + 0.53, 27.98);
    const pg = new THREE.PlaneGeometry(0.85, 0.62);
    pg.rotateX(-0.38);
    pg.translate(sx, GALLERY.y + 1.28, 27.86);
    screens.push(pg);
    /* screen housing */
    const hg = new THREE.BoxGeometry(0.95, 0.72, 0.06);
    hg.rotateX(-0.38);
    hg.translate(sx, GALLERY.y + 1.28, 27.9);
    stands.add(hg);
  }
  scene.add(stands.mesh(darkSteel, true, false));
  const batch = new GeoBatch();
  for (const g of screens) batch.add(g);
  scene.add(batch.mesh(screenMat, false, false));
  powerMats.push({ mat: screenMat, group: 0 });
}

/* ========================== orchestrator ============================ */

export function buildZones(scene: THREE.Scene, stackData: StackData | null): ZoneHandles {
  const powerMats: ZoneHandles['powerMats'] = [];
  const lights: ZoneHandles['lights'] = [];
  buildProof(scene, powerMats);
  const { scanMat } = buildWork(scene, powerMats);
  buildCage(scene, powerMats);
  buildStack(scene, stackData, powerMats);
  buildLounge(scene, powerMats, lights);
  const { signal0 } = buildDock(scene);
  buildGallery(scene, powerMats);

  /* cool accent light over the STACK mezzanine shelves (no shadow) */
  const mezzLight = new THREE.PointLight(0x9fc4ff, 60, 18, 1.9);
  mezzLight.position.set(50.6, MEZZ.y + 3.2, 14.4);
  scene.add(mezzLight);
  lights.push({ light: mezzLight, group: 2 });

  return { powerMats, scanMat, lights, dockSignal: signal0 };
}
