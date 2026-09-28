/* ------------------------------------------------------------------ */
/* Atmosphere (T-105) — the Villa-Ravine controls, translated into     */
/* logistics:                                                          */
/*                                                                     */
/* SCHICHT (Früh/Spät/Nacht): three presets that change LIGHT and      */
/* OPERATION. Crossfade ~1.5 s (colors, sun position, fog, exposure).  */
/* The static shadow map re-renders ONCE at the end of a shift change, */
/* never per frame. The shift also scales the order generator, the     */
/* Leitstand arrival rate and the conveyor pace. Default: NACHT (the   */
/* classic look); the choice persists in localStorage (try/catch).     */
/*                                                                     */
/* LAYER: DACH (roof skin/trusses off → sky), DATENSTRÖME (data flow   */
/* above the goods flow at ~4 m: reserved AGV edges, quote lanes,      */
/* Prüfstraße→DOCK, truck departures — 3 draw calls), AUTOMATISIERUNG  */
/* (human workplaces amber, automated paths acid), GEFAHRGUT (cage     */
/* highlighted, everything else desaturated via a backdrop-filter      */
/* overlay). Defaults: roof + data ON, others off. Persisted.          */
/*                                                                     */
/* Owns its DOM wiring (like minimap.ts): [data-shift] buttons, the    */
/* [data-layer] checkboxes + collapse toggle. No DOM → world still     */
/* works, hooks are reachable via window.__halleDebug.                 */
/* ------------------------------------------------------------------ */

import * as THREE from 'three';
import { COL, CAGE, CONV, QLANE, RACKS } from './layout';
import { GeoBatch } from './util';
import { EDGES, edgeBetween } from './sim/graph';
import { AGV_COUNT, edgePos, edgeHeading } from './sim/agents';
import type { Sim } from './sim/world';
import type { PackSim } from './sim/packages';

export type ShiftName = 'morning' | 'late' | 'night';
export type LayerName = 'roof' | 'data' | 'auto' | 'hazmat';

const LS_SHIFT = 'halle:shift';
const LS_LAYERS = 'halle:layers';
const FADE_S = 1.5;

interface ShiftPreset {
  rate: number; // order generation × Leitstand demand
  pace: number; // conveyor belt pace
  sun: number;
  sunInt: number;
  sunPos: [number, number, number];
  hemiSky: number;
  hemiGround: number;
  hemiInt: number;
  fog: number; // fog + clear color (seamless horizon when the roof is off)
  fogDensity: number;
  exposure: number;
  envInt: number; // multiplier on the base environmentIntensity formula
  skyGlass: number; // skylight glass color
  hallSpot: number; // interior high-bay spot multiplier
  cone: number; // fake volumetric cone opacity multiplier
  pool: number; // floor light-pool opacity multiplier
  yardColor: number;
  yard: number; // yard/door glow intensity multiplier
  manual: number; // human workplace lights (pick stations, Leitstand monitors)
}

/* NACHT is the classic T-101..T-104 look — values mirror the originals */
const SHIFTS: Record<ShiftName, ShiftPreset> = {
  morning: {
    rate: 1.0,
    pace: 1.0,
    sun: 0xcfe2ff,
    sunInt: 5.2,
    sunPos: [55, 30, -55], // low from the north-east: shafts + stripe shadows through the skylights
    hemiSky: 0xa9c2e0,
    hemiGround: 0x33382e,
    hemiInt: 1.15,
    fog: 0x87a0bd,
    fogDensity: 0.0034,
    exposure: 1.12,
    envInt: 2.3,
    skyGlass: 0xcfe0f2,
    hallSpot: 0.3,
    cone: 0.25,
    pool: 0.2,
    yardColor: 0xcfd8e8,
    yard: 0.45,
    manual: 1,
  },
  late: {
    rate: 0.6,
    pace: 0.8,
    sun: 0xffb469,
    sunInt: 3.6,
    sunPos: [-60, 18, 45], // golden, low from the south-west — long shadows
    hemiSky: 0x7c6a52,
    hemiGround: 0x201a12,
    hemiInt: 0.72,
    fog: 0x33241c,
    fogDensity: 0.005,
    exposure: 1.22,
    envInt: 1.45,
    skyGlass: 0xe09a52,
    hallSpot: 0.8,
    cone: 0.75,
    pool: 0.75,
    yardColor: 0xffab54,
    yard: 1.35,
    manual: 1,
  },
  night: {
    rate: 0.25,
    pace: 0.55,
    sun: 0xa8bce0,
    sunInt: 2.0,
    sunPos: [14, 70, 20],
    hemiSky: 0x24303e,
    hemiGround: 0x11150f,
    hemiInt: 0.5,
    fog: 0x070a0e,
    fogDensity: 0.0062,
    exposure: 1.28,
    envInt: 1.0,
    skyGlass: 0x121e30,
    hallSpot: 1.0,
    cone: 1,
    pool: 1,
    yardColor: 0xffc98a,
    yard: 1,
    manual: 0, // human workplaces dark — the machines keep running
  },
};

export interface AtmosphereCtx {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  hemi: THREE.HemisphereLight;
  moon: THREE.DirectionalLight;
  skyMat: THREE.MeshBasicMaterial;
  roof: THREE.Group;
  doorGlow: THREE.PointLight;
  yardGlow: THREE.PointLight;
  sim: Sim;
  packSim: PackSim;
}

export interface Atmosphere {
  /** lerp the crossfade, animate layer content; call once per frame.
      powerL2 = the power-up level of light group 2 (hemi + sun ride it) */
  update(dt: number, powerL2?: number): void;
  /* shift multipliers read by the main loop (index.ts) */
  readonly envInt: number;
  readonly hallSpot: number;
  readonly yardLight: number;
  readonly manual: number;
  readonly cone: number;
  readonly pool: number;
  readonly shift: ShiftName;
  readonly layers: Record<LayerName, boolean>;
  setShift(s: ShiftName, fade?: boolean): void;
  setLayer(l: LayerName, on: boolean): void;
}

/* working copy of a preset (mutable, lerped) */
interface WorkPreset {
  sun: THREE.Color;
  sunInt: number;
  sunPos: THREE.Vector3;
  hemiSky: THREE.Color;
  hemiGround: THREE.Color;
  hemiInt: number;
  fog: THREE.Color;
  fogDensity: number;
  exposure: number;
  envInt: number;
  skyGlass: THREE.Color;
  hallSpot: number;
  cone: number;
  pool: number;
  yardColor: THREE.Color;
  yard: number;
  manual: number;
}

const toWork = (p: ShiftPreset): WorkPreset => ({
  sun: new THREE.Color(p.sun),
  sunInt: p.sunInt,
  sunPos: new THREE.Vector3(...p.sunPos),
  hemiSky: new THREE.Color(p.hemiSky),
  hemiGround: new THREE.Color(p.hemiGround),
  hemiInt: p.hemiInt,
  fog: new THREE.Color(p.fog),
  fogDensity: p.fogDensity,
  exposure: p.exposure,
  envInt: p.envInt,
  skyGlass: new THREE.Color(p.skyGlass),
  hallSpot: p.hallSpot,
  cone: p.cone,
  pool: p.pool,
  yardColor: new THREE.Color(p.yardColor),
  yard: p.yard,
  manual: p.manual,
});

const lerpWork = (out: WorkPreset, a: WorkPreset, b: WorkPreset, k: number): void => {
  out.sun.lerpColors(a.sun, b.sun, k);
  out.sunInt = THREE.MathUtils.lerp(a.sunInt, b.sunInt, k);
  out.sunPos.lerpVectors(a.sunPos, b.sunPos, k);
  out.hemiSky.lerpColors(a.hemiSky, b.hemiSky, k);
  out.hemiGround.lerpColors(a.hemiGround, b.hemiGround, k);
  out.hemiInt = THREE.MathUtils.lerp(a.hemiInt, b.hemiInt, k);
  out.fog.lerpColors(a.fog, b.fog, k);
  out.fogDensity = THREE.MathUtils.lerp(a.fogDensity, b.fogDensity, k);
  out.exposure = THREE.MathUtils.lerp(a.exposure, b.exposure, k);
  out.envInt = THREE.MathUtils.lerp(a.envInt, b.envInt, k);
  out.skyGlass.lerpColors(a.skyGlass, b.skyGlass, k);
  out.hallSpot = THREE.MathUtils.lerp(a.hallSpot, b.hallSpot, k);
  out.cone = THREE.MathUtils.lerp(a.cone, b.cone, k);
  out.pool = THREE.MathUtils.lerp(a.pool, b.pool, k);
  out.yardColor.lerpColors(a.yardColor, b.yardColor, k);
  out.yard = THREE.MathUtils.lerp(a.yard, b.yard, k);
  out.manual = THREE.MathUtils.lerp(a.manual, b.manual, k);
};

const copyWork = (dst: WorkPreset, src: WorkPreset): void => {
  lerpWork(dst, src, src, 1);
};

/* oriented thin box between two points (data lines / highlights) */
function seg(batch: GeoBatch, a: [number, number, number], b: [number, number, number], w: number): void {
  const dir = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const len = dir.length();
  if (len < 1e-4) return;
  const g = new THREE.BoxGeometry(w, w, len);
  g.applyQuaternion(
    new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir.normalize()),
  );
  g.translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
  batch.add(g);
}

/* the four static data-flow paths (y ≈ 4, above the goods flow) */
const DATA_PATHS: Array<Array<[number, number, number]>> = [
  // quote lane inbound (hall → Leitstand)
  [
    [QLANE.x0, 4, QLANE.zIn],
    [QLANE.x1, 4, QLANE.zIn],
  ],
  // quote lane outbound (Leitstand → hall)
  [
    [QLANE.x1, 4, QLANE.zOut],
    [QLANE.x0, 4, QLANE.zOut],
  ],
  // Prüfstraße → TOR 4 (DOCK outbound)
  [
    [CONV.scanX, 4, CONV.zN],
    [10, 4, -23.5],
    [10, 4, -29.2],
  ],
  // truck departure: out of TOR 1, bending east over the yard
  [
    [-50, 4, -29.2],
    [-50, 4.6, -52],
    [-28, 5.2, -58],
  ],
];

export function createAtmosphere(ctx: AtmosphereCtx): Atmosphere {
  const { renderer, scene, hemi, moon, skyMat, roof, doorGlow, yardGlow, sim, packSim } = ctx;

  /* ================= shifts ================= */
  let shift: ShiftName = 'night';
  try {
    const s = window.localStorage.getItem(LS_SHIFT);
    if (s === 'morning' || s === 'late' || s === 'night') shift = s;
  } catch {
    /* private mode — default night */
  }

  const cur = toWork(SHIFTS.night);
  const from = toWork(SHIFTS.night);
  const toW = toWork(SHIFTS.night); // target as a working copy (no per-frame allocation)
  let mix = 1; // 1 = target reached
  let shadowPending = false;
  /* the power-up intro still owns the light ramp: index.ts hands the
     group-2 level in every frame and it multiplies hemi/sun here */
  let powerL2 = 1;

  const applySimRates = (p: ShiftPreset) => {
    sim.orders.setRate(p.rate);
    packSim.setDemand(p.rate);
    packSim.setPace(p.pace);
  };

  const applyFrame = () => {
    moon.color.copy(cur.sun);
    moon.intensity = cur.sunInt * powerL2;
    moon.position.copy(cur.sunPos);
    hemi.color.copy(cur.hemiSky);
    hemi.groundColor.copy(cur.hemiGround);
    hemi.intensity = cur.hemiInt * powerL2;
    (scene.fog as THREE.FogExp2).color.copy(cur.fog);
    (scene.fog as THREE.FogExp2).density = cur.fogDensity;
    renderer.setClearColor(cur.fog, 1);
    renderer.toneMappingExposure = cur.exposure;
    skyMat.color.copy(cur.skyGlass);
    doorGlow.color.copy(cur.yardColor);
    yardGlow.color.copy(cur.yardColor);
  };

  const setShift = (s: ShiftName, fade = true) => {
    if (s === shift && mix >= 1) return;
    shift = s;
    applySimRates(SHIFTS[s]);
    copyWork(toW, toWork(SHIFTS[s]));
    if (fade) {
      copyWork(from, cur);
      mix = 0;
      shadowPending = true;
    } else {
      copyWork(cur, toW);
      mix = 1;
      renderer.shadowMap.needsUpdate = true;
    }
    try {
      window.localStorage.setItem(LS_SHIFT, s);
    } catch {
      /* ignore */
    }
    syncShiftUi();
  };

  /* ================= layers ================= */
  const layers: Record<LayerName, boolean> = { roof: true, data: true, auto: false, hazmat: false };
  try {
    const raw = window.localStorage.getItem(LS_LAYERS);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Record<LayerName, boolean>>;
      for (const k of ['roof', 'data', 'auto', 'hazmat'] as LayerName[]) {
        if (typeof parsed[k] === 'boolean') layers[k] = parsed[k];
      }
    }
  } catch {
    /* keep defaults */
  }

  /* ---- DATENSTRÖME (3 draw calls when on) ---- */
  const dataGroup = new THREE.Group();
  scene.add(dataGroup);

  /* 1: static data lines, merged */
  const lineMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(COL.cyan).multiplyScalar(0.75),
    transparent: true,
    opacity: 0.75,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const lines = new GeoBatch();
  for (const path of DATA_PATHS) {
    for (let i = 0; i + 1 < path.length; i++) seg(lines, path[i], path[i + 1], 0.07);
  }
  dataGroup.add(lines.mesh(lineMat, false, false));

  /* 2: pulses travelling the paths (instanced) */
  const pathLen: number[] = [];
  const pathCum: number[][] = [];
  for (const path of DATA_PATHS) {
    const cum = [0];
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1];
      const b = path[i];
      cum.push(cum[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]));
    }
    pathCum.push(cum);
    pathLen.push(cum[cum.length - 1]);
  }
  const PULSES_PER_PATH = 4;
  const PULSE_COUNT = DATA_PATHS.length * PULSES_PER_PATH;
  const pulseMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(COL.cyan).multiplyScalar(1.6),
    transparent: true,
    opacity: 0.95,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const pulses = new THREE.InstancedMesh(new THREE.BoxGeometry(0.55, 0.1, 0.1), pulseMat, PULSE_COUNT);
  pulses.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  pulses.frustumCulled = false;
  dataGroup.add(pulses);
  const pulseDist = new Float32Array(PULSE_COUNT);
  for (let i = 0; i < PULSE_COUNT; i++) {
    const p = Math.floor(i / PULSES_PER_PATH);
    pulseDist[i] = (pathLen[p] / PULSES_PER_PATH) * (i % PULSES_PER_PATH);
  }

  /* 3: reserved-edge beams ahead of every AGV (instanced) */
  const beamMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(COL.cyan).multiplyScalar(1.1),
    transparent: true,
    opacity: 0.6,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const beamGeo = new THREE.BoxGeometry(0.09, 0.09, 1);
  beamGeo.translate(0, 0, 0.5); // origin at the beam start, +z forward
  const beams = new THREE.InstancedMesh(beamGeo, beamMat, AGV_COUNT);
  beams.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  beams.frustumCulled = false;
  dataGroup.add(beams);

  const m4 = new THREE.Matrix4();
  const P = new THREE.Vector3();
  const Q = new THREE.Quaternion();
  const S = new THREE.Vector3(1, 1, 1);
  const Y = new THREE.Vector3(0, 1, 0);
  const ePos = { x: 0, z: 0 };
  const BEAM_Y = 4;

  const setBeam = (i: number, edge: number, s0: number, s1: number) => {
    if (s1 - s0 < 0.4) {
      m4.makeScale(0, 0, 0);
      beams.setMatrixAt(i, m4);
      return;
    }
    edgePos(edge, s0, ePos);
    P.set(ePos.x, BEAM_Y, ePos.z);
    Q.setFromAxisAngle(Y, edgeHeading(edge));
    S.set(1, 1, s1 - s0);
    m4.compose(P, Q, S);
    beams.setMatrixAt(i, m4);
    S.set(1, 1, 1);
  };

  const updateDataflow = (dt: number) => {
    /* pulses */
    for (let i = 0; i < PULSE_COUNT; i++) {
      const p = Math.floor(i / PULSES_PER_PATH);
      const path = DATA_PATHS[p];
      const cum = pathCum[p];
      pulseDist[i] = (pulseDist[i] + 6.5 * dt) % pathLen[p];
      const d = pulseDist[i];
      let k = 1;
      while (k < cum.length - 1 && cum[k] < d) k++;
      const a = path[k - 1];
      const b = path[k];
      const span = cum[k] - cum[k - 1] || 1;
      const f = (d - cum[k - 1]) / span;
      P.set(a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f);
      Q.setFromAxisAngle(Y, Math.atan2(b[0] - a[0], b[2] - a[2]));
      m4.compose(P, Q, S.set(1, 1, 1));
      pulses.setMatrixAt(i, m4);
    }
    pulses.instanceMatrix.needsUpdate = true;

    /* reserved next edge per AGV: a short beam hovering ahead */
    for (let i = 0; i < AGV_COUNT; i++) {
      const a = sim.agvs[i];
      if (a.state === 'working' && a.edge >= 0) {
        const e = EDGES[a.edge];
        setBeam(i, a.edge, Math.min(a.s + 1.4, e.len), Math.min(a.s + 5.4, e.len));
      } else if (a.edge < 0 && a.state !== 'parked' && a.pi < a.path.length) {
        /* standing at a node, next leg reserved */
        const ei = edgeBetween(a.node, a.path[a.pi]);
        if (ei >= 0) setBeam(i, ei, 0.6, Math.min(4.2, EDGES[ei].len));
        else {
          m4.makeScale(0, 0, 0);
          beams.setMatrixAt(i, m4);
        }
      } else {
        m4.makeScale(0, 0, 0);
        beams.setMatrixAt(i, m4);
      }
    }
    beams.instanceMatrix.needsUpdate = true;
  };

  /* ---- AUTOMATISIERUNG: human amber, automated acid ---- */
  const autoGroup = new THREE.Group();
  scene.add(autoGroup);
  const amberMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(COL.amber),
    transparent: true,
    opacity: 0.8,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const acidMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(COL.acid).multiplyScalar(0.9),
    transparent: true,
    opacity: 0.8,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  {
    /* human workplaces: pick stations + the two Leitstand desks */
    const human = new GeoBatch();
    for (const px of [-10, -2, 4]) {
      human.box(1.9, 0.06, 1.1, px, 2.06, CONV.zS + 1.35);
    }
    const fy = 3.2; // LEITSTAND.floorY — desk tops at fy + 0.78
    const d1 = new THREE.BoxGeometry(3.1, 0.06, 1.05);
    d1.rotateY(0.42);
    d1.translate(46.2, fy + 1.12, 20.1);
    human.add(d1);
    const d2 = new THREE.BoxGeometry(3.1, 0.06, 1.05);
    d2.rotateY(-0.42);
    d2.translate(46.2, fy + 1.12, 23.9);
    human.add(d2);
    autoGroup.add(human.mesh(amberMat, false, false));

    /* automated paths: AGV main loop, RBG aisles A + C, conveyor */
    const auto = new GeoBatch();
    const LOOP: Array<[number, number]> = [
      [23, -13],
      [12, -13],
      [-13, -13],
      [-22, -4],
      [-22, 4],
      [-13, 13],
      [23, 13],
      [32, 4],
      [32, -4],
    ];
    for (let i = 0; i < LOOP.length; i++) {
      const a = LOOP[i];
      const b = LOOP[(i + 1) % LOOP.length];
      seg(auto, [a[0], 0.14, a[1]], [b[0], 0.14, b[1]], 0.12);
    }
    /* RBG aisles A + C */
    seg(auto, [RACKS.aislesX[0], 0.14, -15], [RACKS.aislesX[0], 0.14, 15], 0.12);
    seg(auto, [RACKS.aislesX[2], 0.14, -15], [RACKS.aislesX[2], 0.14, 15], 0.12);
    /* conveyor straights */
    seg(auto, [CONV.x0, CONV.beltY + 0.4, CONV.zN], [CONV.x1, CONV.beltY + 0.4, CONV.zN], 0.07);
    seg(auto, [CONV.x0, CONV.beltY + 0.4, CONV.zS], [CONV.x1, CONV.beltY + 0.4, CONV.zS], 0.07);
    autoGroup.add(auto.mesh(acidMat, false, false));
  }

  /* ---- GEFAHRGUT: cage highlight + desaturation overlay ---- */
  const hazMat = new THREE.MeshBasicMaterial({
    color: 0xe8760a,
    transparent: true,
    opacity: 0.5,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const hazGroup = new THREE.Group();
  scene.add(hazGroup);
  {
    const frame = new GeoBatch();
    const x0 = CAGE.x0 - 0.35;
    const x1 = CAGE.x1 + 0.35;
    const z0 = CAGE.z0 - 0.35;
    const z1 = CAGE.z1 + 0.35;
    const h = 4.4;
    for (const [px, pz] of [
      [x0, z0],
      [x1, z0],
      [x0, z1],
      [x1, z1],
    ]) {
      frame.box(0.09, h, 0.09, px, h / 2, pz);
    }
    for (const y of [0.08, h]) {
      frame.box(x1 - x0, 0.07, 0.07, (x0 + x1) / 2, y, z0);
      frame.box(x1 - x0, 0.07, 0.07, (x0 + x1) / 2, y, z1);
      frame.box(0.07, 0.07, z1 - z0, x0, y, (z0 + z1) / 2);
      frame.box(0.07, 0.07, z1 - z0, x1, y, (z0 + z1) / 2);
    }
    hazGroup.add(frame.mesh(hazMat, false, false));
  }
  const desatEl = document.getElementById('halle-desat');

  const applyLayers = () => {
    roof.visible = layers.roof;
    dataGroup.visible = layers.data;
    autoGroup.visible = layers.auto;
    hazGroup.visible = layers.hazmat;
    desatEl?.classList.toggle('is-on', layers.hazmat);
  };

  const setLayer = (l: LayerName, on: boolean) => {
    layers[l] = on;
    applyLayers();
    /* roof off → the sun/moon reaches the hall floor differently:
       one static shadow re-render, never per frame */
    renderer.shadowMap.needsUpdate = true;
    try {
      window.localStorage.setItem(LS_LAYERS, JSON.stringify(layers));
    } catch {
      /* ignore */
    }
    syncLayerUi();
  };

  /* ================= DOM wiring ================= */
  const shiftBtns = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-shift]'));
  const layerBtns = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-layer]'));
  function syncShiftUi(): void {
    for (const b of shiftBtns) b.setAttribute('aria-pressed', String(b.dataset.shift === shift));
  }
  function syncLayerUi(): void {
    for (const b of layerBtns) {
      const l = b.dataset.layer as LayerName;
      b.setAttribute('aria-pressed', String(!!layers[l]));
    }
  }
  for (const b of shiftBtns) {
    b.addEventListener('click', () => {
      const s = b.dataset.shift as ShiftName;
      if (s === 'morning' || s === 'late' || s === 'night') setShift(s);
    });
  }
  for (const b of layerBtns) {
    b.addEventListener('click', () => {
      const l = b.dataset.layer as LayerName;
      if (l in layers) setLayer(l, !layers[l]);
    });
  }
  /* layer menu collapse (same pattern as the minimap) */
  const layerRoot = document.getElementById('halle-layers');
  const layerToggle = layerRoot?.querySelector<HTMLButtonElement>('.halle-layers-toggle');
  if (layerRoot && layerToggle) {
    layerRoot.dataset.collapsed = 'true';
    layerToggle.setAttribute('aria-expanded', 'false');
    layerToggle.addEventListener('click', () => {
      const collapsed = layerRoot.dataset.collapsed === 'true';
      layerRoot.dataset.collapsed = String(!collapsed);
      layerToggle.setAttribute('aria-expanded', String(collapsed));
    });
  }

  /* ================= init ================= */
  /* stored shift: snap without a fade (the power-up intro runs anyway);
     the first shadow render happens with the final sun position */
  if (shift !== 'night') setShift(shift, false);
  else applySimRates(SHIFTS.night);
  applyLayers();
  applyFrame();
  syncShiftUi();
  syncLayerUi();

  let clock = 0;

  return {
    get envInt() {
      return cur.envInt;
    },
    get hallSpot() {
      return cur.hallSpot;
    },
    get yardLight() {
      return cur.yard;
    },
    get manual() {
      return cur.manual;
    },
    get cone() {
      return cur.cone;
    },
    get pool() {
      return cur.pool;
    },
    get shift() {
      return shift;
    },
    get layers() {
      return { ...layers };
    },
    setShift,
    setLayer,
    update(dt, pl2 = 1) {
      clock += dt;
      powerL2 = pl2;

      /* shift crossfade */
      if (mix < 1) {
        mix = Math.min(1, mix + dt / FADE_S);
        const k = mix * mix * (3 - 2 * mix);
        lerpWork(cur, from, toW, k);
        if (mix >= 1 && shadowPending) {
          shadowPending = false;
          /* exactly ONE shadow re-render per shift change, after the
             sun has reached its new position */
          renderer.shadowMap.needsUpdate = true;
        }
      }
      /* cheap setters: keeps the power-up ramp riding sun/hemi even
         when no shift change is running */
      applyFrame();

      if (layers.data) updateDataflow(dt);

      /* Gefahrgut frame pulse */
      if (layers.hazmat) {
        hazMat.opacity = 0.38 + 0.24 * (0.5 + 0.5 * Math.sin(clock * 3.1));
      }
    },
  };
}
