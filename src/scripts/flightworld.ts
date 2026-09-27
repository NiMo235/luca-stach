/* ------------------------------------------------------------------ */
/* Flight world: the 3D space the camera flies through.                */
/* One continuous morphing corridor — no scene swaps. A themes[]       */
/* table (accent / fog / tint / world-speed per station) is lerped     */
/* every frame from overall progress, and per-station object sets      */
/* (terminal hologram, data towers, commit-node timeline, container    */
/* yard, skill constellation, soundwave rings, docking platform) live  */
/* at their station's z-range and fade in/out with camera proximity.   */
/* Gate rings are pre-tinted toward the accent of the station they     */
/* lead into. Additive acid + paper on ink, palette break to amber     */
/* at BEYOND/DOCK.                                                     */
/* ------------------------------------------------------------------ */

import * as THREE from 'three';

const ACID = new THREE.Color('#b4ff39');
const ACID_CYAN = new THREE.Color('#7dffd8');
const PAPER = new THREE.Color('#e8ece4');
const PAPER_DIM = new THREE.Color('#8a9186');
const WARM = new THREE.Color('#ffb35c');
const INK = new THREE.Color('#0a0d0a');
const WHITE = new THREE.Color('#ffffff');
const WARM_TINT = new THREE.Color('#ffcf9a');

const STATIONS = 7;
const SEG = 36; // distance between stations on z

/* camera keyframes: each docked position sits INSIDE its station's
   scenery (between the data towers, alongside the commit path, in the
   container yard, within the constellation, in the ring set, on final
   approach). Stations stay 36 units apart on z; lateral/vertical
   offsets make every station feel spatially distinct. */
const CAM_KEYS = [
  new THREE.Vector3(0, 0.4, 8), // 01 BOOT — facing the terminal hologram
  new THREE.Vector3(-2.2, -8.0, -SEG), // 02 PROOF — threading the towers
  new THREE.Vector3(2.5, 1.0, -SEG * 2), // 03 LOG — alongside the commit path
  new THREE.Vector3(-1.2, -8.0, -SEG * 3), // 04 WORK — inside the yard
  new THREE.Vector3(1.8, 1.3, -SEG * 4), // 05 STACK — inside the constellation
  new THREE.Vector3(0, -1.8, -SEG * 5), // 06 BEYOND — inside the ring set
  new THREE.Vector3(0, -2.6, -SEG * 6), // 07 DOCK — final approach descent
];
const LOOK_KEYS = [
  new THREE.Vector3(3.5, 1.0, -14),
  new THREE.Vector3(-4.5, -8.0, -50),
  new THREE.Vector3(1.0, 1.0, -94),
  new THREE.Vector3(2.0, -8.0, -124),
  new THREE.Vector3(-1.0, 0.5, -162),
  new THREE.Vector3(0, -2.6, -196),
  new THREE.Vector3(2.5, -4.2, -230), // deck sits left of the contact readout
];

const BASE_FOV = 75;
const PUNCH_FOV = 92;

/* ---- per-station world themes (lerped continuously) ---- */
interface Theme {
  accent: THREE.Color; // gates ahead, streaks, packets, acid wireframes
  fog: THREE.Color; // fog + clear color
  fogDensity: number;
  tint: THREE.Color; // multiplier for stars / network nodes / grids
  speed: number; // world time-scale (DOCK slows everything down)
}
const themes: Theme[] = [
  { accent: ACID, fog: INK, fogDensity: 0.011, tint: WHITE, speed: 1 }, // 01 BOOT
  { accent: ACID, fog: INK, fogDensity: 0.012, tint: WHITE, speed: 1 }, // 02 PROOF
  { accent: ACID, fog: INK, fogDensity: 0.011, tint: WHITE, speed: 1 }, // 03 LOG
  { accent: ACID_CYAN, fog: INK, fogDensity: 0.0125, tint: WHITE, speed: 1.05 }, // 04 WORK
  { accent: ACID, fog: INK, fogDensity: 0.0095, tint: WHITE, speed: 0.9 }, // 05 STACK
  { accent: WARM, fog: new THREE.Color('#1a0f06'), fogDensity: 0.02, tint: WARM_TINT, speed: 1 }, // 06 BEYOND
  { accent: WARM, fog: new THREE.Color('#140c06'), fogDensity: 0.016, tint: WARM_TINT, speed: 0.45 }, // 07 DOCK
];

type FadeMat = THREE.MeshBasicMaterial | THREE.LineBasicMaterial | THREE.PointsMaterial;

interface StationSet {
  i: number;
  group: THREE.Group;
  mats: FadeMat[];
  tick?: (fade: number, wdt: number, t: number, dist: number) => void;
}

export interface FlightWorld {
  /** advance & render one frame: p in [0,1], transit intensity 0..1 */
  update(p: number, transit: number, dt: number, now: number): void;
  /** beat pulse from the audio engine (0..1 kick envelope start) */
  pulse(): void;
  /** normalized docked camera drift (-1..1) for panel counter-parallax */
  drift: { x: number; y: number };
  camera: THREE.PerspectiveCamera;
}

export function createWorld(canvas: HTMLCanvasElement): FlightWorld {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance',
  });
  renderer.setClearColor(themes[0].fog, 1);

  const scene = new THREE.Scene();
  const fog = new THREE.FogExp2(themes[0].fog.getHex(), themes[0].fogDensity);
  scene.fog = fog;

  const camera = new THREE.PerspectiveCamera(BASE_FOV, 1, 0.1, 400);
  camera.position.copy(CAM_KEYS[0]);

  const posCurve = new THREE.CatmullRomCurve3(CAM_KEYS, false, 'catmullrom', 0.35);
  const lookCurve = new THREE.CatmullRomCurve3(LOOK_KEYS, false, 'catmullrom', 0.35);

  const midZ = (-SEG * (STATIONS - 1)) / 2;

  const fadeMat = <T extends FadeMat>(m: T, base: number, color: THREE.Color): T => {
    m.color.copy(color);
    m.transparent = true;
    m.opacity = base;
    m.blending = THREE.AdditiveBlending;
    m.depthWrite = false;
    m.userData.base = base;
    return m;
  };

  /* ---- starfield ---- */
  const STAR_COUNT = 2000;
  const starPos = new Float32Array(STAR_COUNT * 3);
  const starCol = new Float32Array(STAR_COUNT * 3);
  for (let i = 0; i < STAR_COUNT; i++) {
    starPos[i * 3] = (Math.random() - 0.5) * 150;
    starPos[i * 3 + 1] = (Math.random() - 0.5) * 90;
    starPos[i * 3 + 2] = 30 - Math.random() * 320;
    const c = Math.random() < 0.14 ? ACID : Math.random() < 0.08 ? WARM : PAPER_DIM;
    const dim = 0.25 + Math.random() * 0.75;
    starCol[i * 3] = c.r * dim;
    starCol[i * 3 + 1] = c.g * dim;
    starCol[i * 3 + 2] = c.b * dim;
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  starGeo.setAttribute('color', new THREE.BufferAttribute(starCol, 3));
  const starMat = new THREE.PointsMaterial({
    size: 0.14,
    vertexColors: true,
    transparent: true,
    opacity: 0.9,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true,
  });
  scene.add(new THREE.Points(starGeo, starMat));

  /* ---- receding grid floor ---- */
  const grid = new THREE.GridHelper(560, 90, ACID.getHex(), PAPER_DIM.getHex());
  grid.position.set(0, -15, midZ);
  const gridMat = grid.material as THREE.LineBasicMaterial;
  gridMat.transparent = true;
  gridMat.opacity = 0.08;
  gridMat.blending = THREE.AdditiveBlending;
  gridMat.depthWrite = false;
  scene.add(grid);
  const gridCeil = new THREE.GridHelper(560, 90, ACID.getHex(), PAPER_DIM.getHex());
  gridCeil.position.set(0, 18, midZ);
  const gridCeilMat = gridCeil.material as THREE.LineBasicMaterial;
  gridCeilMat.transparent = true;
  gridCeilMat.opacity = 0.04;
  gridCeilMat.blending = THREE.AdditiveBlending;
  gridCeilMat.depthWrite = false;
  scene.add(gridCeil);

  /* ---- logistics-network centerpiece (hero3d recipe, scaled up) ---- */
  const NODE_COUNT = 90;
  const PACKET_COUNT = 16;
  const SCALE = 3.4;
  const netGroup = new THREE.Group();
  netGroup.position.set(0, 1.5, midZ);
  scene.add(netGroup);

  const nodePos = new Float32Array(NODE_COUNT * 3);
  const nodeCol = new Float32Array(NODE_COUNT * 3);
  for (let i = 0; i < NODE_COUNT; i++) {
    const r = (1.4 + Math.random() * 1.3) * SCALE;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    nodePos[i * 3] = r * Math.sin(phi) * Math.cos(theta) * 1.35;
    nodePos[i * 3 + 1] = r * Math.cos(phi) * 0.85;
    nodePos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    const c = Math.random() < 0.16 ? ACID : PAPER_DIM;
    const dim = c === ACID ? 0.75 + Math.random() * 0.25 : 0.2 + Math.random() * 0.35;
    nodeCol[i * 3] = c.r * dim;
    nodeCol[i * 3 + 1] = c.g * dim;
    nodeCol[i * 3 + 2] = c.b * dim;
  }
  const nodeGeo = new THREE.BufferGeometry();
  nodeGeo.setAttribute('position', new THREE.BufferAttribute(nodePos, 3));
  nodeGeo.setAttribute('color', new THREE.BufferAttribute(nodeCol, 3));
  const nodeMat = new THREE.PointsMaterial({
    size: 0.22,
    vertexColors: true,
    transparent: true,
    opacity: 0.95,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  netGroup.add(new THREE.Points(nodeGeo, nodeMat));

  const edges: Array<[number, number]> = [];
  const seen = new Set<string>();
  for (let i = 0; i < NODE_COUNT; i++) {
    const dists: Array<{ j: number; d: number }> = [];
    for (let j = 0; j < NODE_COUNT; j++) {
      if (j === i) continue;
      const dx = nodePos[i * 3] - nodePos[j * 3];
      const dy = nodePos[i * 3 + 1] - nodePos[j * 3 + 1];
      const dz = nodePos[i * 3 + 2] - nodePos[j * 3 + 2];
      dists.push({ j, d: dx * dx + dy * dy + dz * dz });
    }
    dists.sort((a, b) => a.d - b.d);
    for (const { j } of dists.slice(0, 2)) {
      const key = i < j ? `${i}-${j}` : `${j}-${i}`;
      if (!seen.has(key)) {
        seen.add(key);
        edges.push([i, j]);
      }
    }
  }
  const edgePos = new Float32Array(edges.length * 6);
  edges.forEach(([a, b], k) => {
    edgePos.set(nodePos.subarray(a * 3, a * 3 + 3), k * 6);
    edgePos.set(nodePos.subarray(b * 3, b * 3 + 3), k * 6 + 3);
  });
  const edgeGeo = new THREE.BufferGeometry();
  edgeGeo.setAttribute('position', new THREE.BufferAttribute(edgePos, 3));
  const edgeMat = new THREE.LineBasicMaterial({
    color: PAPER_DIM,
    transparent: true,
    opacity: 0.16,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  netGroup.add(new THREE.LineSegments(edgeGeo, edgeMat));

  const packets = Array.from({ length: PACKET_COUNT }, () => ({
    edge: (Math.random() * edges.length) | 0,
    t: Math.random(),
    speed: 0.2 + Math.random() * 0.35,
  }));
  const packetPos = new Float32Array(PACKET_COUNT * 3);
  const packetGeo = new THREE.BufferGeometry();
  packetGeo.setAttribute('position', new THREE.BufferAttribute(packetPos, 3));
  const packetMat = new THREE.PointsMaterial({
    size: 0.38,
    color: ACID,
    transparent: true,
    opacity: 0.95,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  netGroup.add(new THREE.Points(packetGeo, packetMat));

  /* ---- floating wireframes along the corridor ---- */
  const wireframes: THREE.Mesh[] = [];
  const acidWireMats: THREE.MeshBasicMaterial[] = [];
  const wireGeos = [
    new THREE.IcosahedronGeometry(1, 0),
    new THREE.TorusGeometry(1, 0.32, 8, 20),
    new THREE.OctahedronGeometry(1, 0),
  ];
  for (let i = 0; i < 14; i++) {
    const geo = wireGeos[i % wireGeos.length];
    const isAcid = i % 3 === 0;
    const mat = new THREE.MeshBasicMaterial({
      wireframe: true,
      color: isAcid ? ACID : PAPER,
      transparent: true,
      opacity: isAcid ? 0.2 : 0.08,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    if (isAcid) acidWireMats.push(mat);
    const m = new THREE.Mesh(geo, mat);
    const side = i % 2 === 0 ? 1 : -1;
    m.position.set(
      side * (10 + Math.random() * 14),
      (Math.random() - 0.5) * 16,
      6 - Math.random() * (SEG * (STATIONS - 1) + 30),
    );
    const s = 1.2 + Math.random() * 2.6;
    m.scale.setScalar(s);
    m.userData.spin = 0.05 + Math.random() * 0.2;
    m.userData.bob = Math.random() * Math.PI * 2;
    wireframes.push(m);
    scene.add(m);
  }

  /* ---- gate rings between stations, pre-tinted toward the target theme ---- */
  const gates: THREE.Mesh<THREE.TorusGeometry, THREE.MeshBasicMaterial>[] = [];
  for (let i = 0; i < STATIONS - 1; i++) {
    const mat = new THREE.MeshBasicMaterial({
      color: themes[i + 1].accent,
      transparent: true,
      opacity: 0.28,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const gate = new THREE.Mesh(new THREE.TorusGeometry(7.5, 0.05, 8, 72), mat);
    const a = CAM_KEYS[i];
    const b = CAM_KEYS[i + 1];
    gate.position.set((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
    const dir = new THREE.Vector3().subVectors(b, a).normalize();
    gate.lookAt(gate.position.clone().add(dir));
    scene.add(gate);
    gates.push(gate);
  }

  /* ---- warp streaks: segments stretched along z near the camera ---- */
  const STREAKS = 130;
  const streakPos = new Float32Array(STREAKS * 6);
  const streakSeed = Array.from({ length: STREAKS }, () => ({
    x: 0,
    y: 0,
    z: 0,
    speed: 0.5 + Math.random(),
  }));
  const streakGeo = new THREE.BufferGeometry();
  streakGeo.setAttribute('position', new THREE.BufferAttribute(streakPos, 3));
  const streakMat = new THREE.LineBasicMaterial({
    color: ACID,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  scene.add(new THREE.LineSegments(streakGeo, streakMat));

  const seedStreak = (k: number, zBase: number) => {
    const s = streakSeed[k];
    const ang = Math.random() * Math.PI * 2;
    const r = 3.5 + Math.random() * 11;
    s.x = Math.cos(ang) * r;
    s.y = Math.sin(ang) * r * 0.7;
    s.z = zBase - Math.random() * 140;
  };
  for (let k = 0; k < STREAKS; k++) seedStreak(k, camera.position.z + 5);

  /* ================================================================ */
  /* Per-station object sets                                           */
  /* ================================================================ */
  const stationSets: StationSet[] = [];
  const registerSet = (set: StationSet) => {
    for (const m of set.mats) m.userData.base = m.opacity;
    set.group.visible = false;
    scene.add(set.group);
    stationSets.push(set);
  };

  let beat = 0;

  /* ---- toy coupling: the ROI sliders grow the PROOF towers, the
     sequencer steps flash the BEYOND rings (flightdeck-only) ---- */
  let roiMixTarget = 0.31; // matches the slider defaults (10 quotes · 25 min)
  window.addEventListener('toy:roi', (e) => {
    const d = (e as CustomEvent<{ quotes: number; minutes: number }>).detail;
    if (!d) return;
    roiMixTarget = THREE.MathUtils.clamp((d.quotes / 50) * 0.5 + (d.minutes / 60) * 0.5, 0, 1);
  });
  let seqFlash = 0;
  window.addEventListener('toy:seq', () => {
    seqFlash = 1;
  });

  /* ---- 01 BOOT: giant terminal hologram ahead of the camera ---- */
  {
    const g = new THREE.Group();
    g.position.set(10, 1.2, -13); // far right of the left-docked hero panel: the typed lines stay clear of it
    const mats: FadeMat[] = [];

    /* frame + faint glass body */
    const frameMat = fadeMat(
      new THREE.LineBasicMaterial(),
      0.55,
      ACID,
    );
    g.add(new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(15, 9)), frameMat));
    mats.push(frameMat);
    const glassMat = fadeMat(new THREE.MeshBasicMaterial(), 0.035, ACID);
    g.add(new THREE.Mesh(new THREE.PlaneGeometry(15, 9), glassMat));
    mats.push(glassMat);

    /* scanlines: thin horizontal lines drifting slowly downward */
    const SCAN = 15;
    const scanPos = new Float32Array(SCAN * 6);
    for (let k = 0; k < SCAN; k++) {
      const y = -4.2 + k * 0.6;
      scanPos.set([-7.2, y, 0.02, 7.2, y, 0.02], k * 6);
    }
    const scanGeo = new THREE.BufferGeometry();
    scanGeo.setAttribute('position', new THREE.BufferAttribute(scanPos, 3));
    const scanMat = fadeMat(new THREE.LineBasicMaterial(), 0.16, ACID);
    const scanlines = new THREE.LineSegments(scanGeo, scanMat);
    g.add(scanlines);
    mats.push(scanMat);

    /* fake text lines near the top-left, like typed output */
    const textSegs: number[] = [];
    const widths = [5.2, 3.4, 6.1, 2.2, 4.6, 3.0];
    widths.forEach((w, k) => {
      const y = 3.4 - k * 0.85;
      textSegs.push(-6.6, y, 0.03, -6.6 + w, y, 0.03);
    });
    const textGeo = new THREE.BufferGeometry();
    textGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(textSegs), 3));
    const textMat = fadeMat(new THREE.LineBasicMaterial(), 0.4, ACID);
    g.add(new THREE.LineSegments(textGeo, textMat));
    mats.push(textMat);

    /* blinking cursor block (opacity driven in tick, not by fade loop) */
    const cursorMat = fadeMat(new THREE.MeshBasicMaterial(), 0.9, ACID);
    const cursor = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.95), cursorMat);
    cursor.position.set(-6.3, 3.4 - widths.length * 0.85, 0.04);
    g.add(cursor);

    registerSet({
      i: 0,
      group: g,
      mats,
      tick: (fade, wdt, t) => {
        scanlines.position.y = -((t * 0.22) % 0.6);
        cursorMat.opacity = (Math.sin(t * 4.2) > -0.2 ? 0.9 : 0.04) * fade;
      },
    });
  }

  /* ---- 02 PROOF: data towers, tallest = the 67% stat ---- */
  {
    const g = new THREE.Group();
    const mats: FadeMat[] = [];
    const heights = [5.2, 9.6, 3.4, 6.2, 4.2]; // tallest: -67% Angebotslaufzeit
    const towerMats: THREE.LineBasicMaterial[] = [];
    /* towers ring the docked camera (-2.2,-8,-36): ahead on both sides,
       one clipped past on the way in */
    const xs = [-9.5, -4.5, 1.5, 6.5, 10.5];
    const zs = [-38, -41, -34.5, -39, -44];
    const towers: Array<{
      line: THREE.LineSegments;
      fill: THREE.Mesh;
      h: number;
      s: number; // current lerped height factor (ROI toy coupling)
    }> = [];
    heights.forEach((h, k) => {
      const geo = new THREE.EdgesGeometry(new THREE.BoxGeometry(2.1, h, 2.1));
      const mat = fadeMat(new THREE.LineBasicMaterial(), 0.75, ACID);
      const tower = new THREE.LineSegments(geo, mat);
      tower.position.set(xs[k], -12 + h / 2, zs[k]);
      g.add(tower);
      towerMats.push(mat);
      const fillMat = fadeMat(new THREE.MeshBasicMaterial(), 0.05, ACID);
      const fill = new THREE.Mesh(new THREE.BoxGeometry(2.06, h - 0.06, 2.06), fillMat);
      fill.position.copy(tower.position);
      g.add(fill);
      mats.push(fillMat);
      towers.push({ line: tower, fill, h, s: 1 });
    });
    registerSet({
      i: 1,
      group: g,
      mats: [...mats, ...towerMats],
      tick: (fade, wdt, t, dist) => {
        /* towers ignite one after another as the camera closes in */
        const approach = THREE.MathUtils.clamp(1.5 - dist, 0, 1.5);
        towerMats.forEach((m, k) => {
          const ignite = THREE.MathUtils.smoothstep(approach * 1.6 - k * 0.18, 0, 1);
          m.opacity = (0.2 + 0.65 * ignite) * fade * (0.9 + 0.1 * Math.sin(t * 2 + k));
        });
        /* ROI toy: tower heights ease toward the slider-derived factor */
        const target = 0.55 + roiMixTarget;
        for (const tw of towers) {
          tw.s += (target - tw.s) * Math.min(1, wdt * 3.5);
          tw.line.scale.y = tw.s;
          tw.line.position.y = -12 + (tw.h * tw.s) / 2;
          tw.fill.scale.y = tw.s;
          tw.fill.position.y = tw.line.position.y;
        }
      },
    });
  }

  /* ---- 03 LOG: commit-node timeline strung along the flight path ---- */
  {
    const g = new THREE.Group();
    const mats: FadeMat[] = [];
    const nodes: THREE.Mesh<THREE.TorusGeometry, THREE.MeshBasicMaterial>[] = [];

    /* bright path line through the station's p-range */
    const pathPts: THREE.Vector3[] = [];
    for (let k = 0; k <= 40; k++) pathPts.push(posCurve.getPoint(0.245 + (k / 40) * 0.19));
    const pathMat = fadeMat(new THREE.LineBasicMaterial(), 0.5, ACID);
    g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pathPts), pathMat));
    mats.push(pathMat);

    /* 5 hexagonal commit nodes: Bundeswehr → KAM → DHBW → MyBriem → BizOps */
    const dotPos = new Float32Array(5 * 3);
    for (let k = 0; k < 5; k++) {
      const pk = 0.25 + k * 0.042;
      const pos = posCurve.getPoint(pk);
      pos.x += k % 2 === 0 ? 2.4 : -2.4;
      pos.y += 0.7;
      const mat = fadeMat(new THREE.MeshBasicMaterial(), 0.85, ACID);
      const node = new THREE.Mesh(new THREE.TorusGeometry(1.05, 0.07, 4, 6), mat);
      node.position.copy(pos);
      const tan = posCurve.getTangent(pk);
      node.lookAt(pos.clone().add(tan));
      g.add(node);
      nodes.push(node);
      mats.push(mat);
      dotPos.set([pos.x, pos.y, pos.z], k * 3);
    }
    const dotGeo = new THREE.BufferGeometry();
    dotGeo.setAttribute('position', new THREE.BufferAttribute(dotPos, 3));
    const dotMat = fadeMat(new THREE.PointsMaterial({ size: 0.5 }), 0.95, ACID);
    g.add(new THREE.Points(dotGeo, dotMat));
    mats.push(dotMat);

    registerSet({
      i: 2,
      group: g,
      mats,
      tick: (fade, wdt, t) => {
        nodes.forEach((n, k) => {
          n.scale.setScalar(1 + 0.1 * Math.sin(t * 2.2 + k * 1.15));
        });
      },
    });
  }

  /* ---- 04 WORK: hologram warehouse — container yard + route arcs ---- */
  {
    const g = new THREE.Group();
    const mats: FadeMat[] = [];
    /* stacks flank the docked camera (-1.2,-8,-108): left, right, and
       one far ahead-left so the forward vista stays open */
    const stacks = [
      new THREE.Vector3(-8, -11, -113),
      new THREE.Vector3(7.5, -11, -111),
      new THREE.Vector3(-4, -11, -127),
    ];
    const boxEdges = new THREE.EdgesGeometry(new THREE.BoxGeometry(3.2, 2.1, 2.2));
    const contMat = fadeMat(new THREE.LineBasicMaterial(), 0.4, ACID_CYAN);
    mats.push(contMat);
    const stackTops: THREE.Vector3[] = [];
    for (const base of stacks) {
      for (let cx = 0; cx < 2; cx++) {
        for (let cy = 0; cy < 3; cy++) {
          if (cx === 1 && cy === 2) continue; // uneven stacks read as real yards
          const c = new THREE.LineSegments(boxEdges, contMat);
          c.position.set(base.x + cx * 3.5, base.y + 1.05 + cy * 2.2, base.z);
          g.add(c);
        }
      }
      stackTops.push(new THREE.Vector3(base.x + 1.75, base.y + 3 * 2.2 + 1.05, base.z));
    }

    /* route lines arcing between stack tops, packets riding them */
    const arcs: THREE.QuadraticBezierCurve3[] = [];
    const arcPairs: Array<[number, number]> = [
      [0, 1],
      [1, 2],
      [2, 0],
    ];
    for (const [ai, bi] of arcPairs) {
      const a = stackTops[ai];
      const b = stackTops[bi];
      const mid = a.clone().lerp(b, 0.5);
      mid.y += 5.5;
      const curve = new THREE.QuadraticBezierCurve3(a, mid, b);
      arcs.push(curve);
      const arcMat = fadeMat(new THREE.LineBasicMaterial(), 0.45, ACID_CYAN);
      g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(curve.getPoints(24)), arcMat));
      mats.push(arcMat);
    }
    const WP = 8;
    const wPackets = Array.from({ length: WP }, (_, k) => ({
      arc: k % arcs.length,
      t: Math.random(),
      speed: 0.25 + Math.random() * 0.3,
    }));
    const wPacketPos = new Float32Array(WP * 3);
    const wPacketGeo = new THREE.BufferGeometry();
    wPacketGeo.setAttribute('position', new THREE.BufferAttribute(wPacketPos, 3));
    const wPacketMat = fadeMat(new THREE.PointsMaterial({ size: 0.3 }), 0.85, ACID_CYAN);
    g.add(new THREE.Points(wPacketGeo, wPacketMat));
    mats.push(wPacketMat);

    /* faint crane silhouette: two verticals + crossbeam */
    const cranePos = new Float32Array([
      13, -11, -118, 13, 0, -118,
      21, -11, -118, 21, 0, -118,
      12, 0, -118, 22, 0, -118,
    ]);
    const craneGeo = new THREE.BufferGeometry();
    craneGeo.setAttribute('position', new THREE.BufferAttribute(cranePos, 3));
    const craneMat = fadeMat(new THREE.LineBasicMaterial(), 0.35, ACID_CYAN);
    g.add(new THREE.LineSegments(craneGeo, craneMat));
    mats.push(craneMat);

    const tmpV = new THREE.Vector3();
    registerSet({
      i: 3,
      group: g,
      mats,
      tick: (fade, wdt) => {
        for (let k = 0; k < WP; k++) {
          const pk = wPackets[k];
          pk.t += wdt * pk.speed;
          if (pk.t >= 1) pk.t = 0;
          arcs[pk.arc].getPoint(pk.t, tmpV);
          wPacketPos.set([tmpV.x, tmpV.y, tmpV.z], k * 3);
        }
        (wPacketGeo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
      },
    });
  }

  /* ---- 05 STACK: skill constellation — particle spheres in orbit ---- */
  {
    const g = new THREE.Group();
    const mats: FadeMat[] = [];
    const center = new THREE.Vector3(0, 0.5, -SEG * 4);
    const pivots: Array<{ g: THREE.Group; speed: number }> = [];
    const SPHERES = 7;
    for (let k = 0; k < SPHERES; k++) {
      const radius = 0.55 + (k / SPHERES) * 1.15;
      const count = 70;
      const pos = new Float32Array(count * 3);
      for (let j = 0; j < count; j++) {
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        pos[j * 3] = radius * Math.sin(phi) * Math.cos(theta);
        pos[j * 3 + 1] = radius * Math.cos(phi);
        pos[j * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const mat = fadeMat(
        new THREE.PointsMaterial({ size: 0.09 }),
        0.8,
        k % 2 === 0 ? ACID : PAPER,
      );
      mats.push(mat);
      const pivot = new THREE.Group();
      pivot.position.copy(center);
      pivot.rotation.z = (k / SPHERES) * 1.1 - 0.5;
      pivot.rotation.x = (k % 3) * 0.35;
      const holder = new THREE.Group();
      const orbitR = 3.2 + k * 1.05;
      holder.position.set(orbitR, 0, 0);
      holder.add(new THREE.Points(geo, mat));
      holder.rotation.y = Math.random() * Math.PI;
      pivot.add(holder);
      pivot.rotation.y = Math.random() * Math.PI * 2;
      g.add(pivot);
      pivots.push({ g: pivot, speed: (k % 2 === 0 ? 1 : -1) * (0.06 + k * 0.014) });
    }
    registerSet({
      i: 4,
      group: g,
      mats,
      tick: (fade, wdt) => {
        for (const p of pivots) p.g.rotation.y += wdt * p.speed;
      },
    });
  }

  /* ---- 06 BEYOND: expanding soundwave rings (beat-synced) ---- */
  {
    const g = new THREE.Group();
    const mats: FadeMat[] = [];
    const RINGS = 6;
    const rings: THREE.Mesh<THREE.TorusGeometry, THREE.MeshBasicMaterial>[] = [];
    const ringCenter = new THREE.Vector3(0, -3.5, -SEG * 5 - 8);
    for (let k = 0; k < RINGS; k++) {
      const mat = fadeMat(new THREE.MeshBasicMaterial(), 0.55, WARM);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.035, 6, 48), mat);
      ring.position.copy(ringCenter);
      /* mostly flat, tilted toward the camera: expanding rings read as
         sonar waves sweeping past instead of an eye-level line */
      ring.rotation.x = -Math.PI / 2 + 0.55;
      g.add(ring);
      rings.push(ring);
      mats.push(mat);
    }
    registerSet({
      i: 5,
      group: g,
      mats,
      tick: (fade, wdt, t) => {
        /* constant slow pulse; the audio kick (beat) rides on top, the
           sequencer steps flash the ring color toward cyan */
        seqFlash = Math.max(0, seqFlash - wdt * 2.2);
        rings.forEach((r, k) => {
          const s = (t * 0.22 + k / RINGS) % 1;
          const scale = 1 + s * 15;
          r.scale.set(scale, scale, 1);
          r.material.opacity = (1 - s) * (0.5 + beat * 0.5) * fade;
          r.material.color.copy(WARM).lerp(ACID_CYAN, seqFlash * 0.55);
        });
      },
    });
  }

  /* ---- 07 DOCK: hexagonal landing platform + beacon + guides ---- */
  {
    const g = new THREE.Group();
    const mats: FadeMat[] = [];
    const deck = new THREE.Vector3(0, -4.5, -SEG * 6 - 14); // closer: the docked camera is on short final

    const rimMat = fadeMat(new THREE.LineBasicMaterial(), 0.8, WARM);
    g.add(
      (() => {
        const rim = new THREE.LineSegments(
          new THREE.EdgesGeometry(new THREE.CylinderGeometry(7, 7, 0.4, 6)),
          rimMat,
        );
        rim.position.copy(deck);
        return rim;
      })(),
    );
    mats.push(rimMat);
    const topMat = fadeMat(new THREE.MeshBasicMaterial({ wireframe: true }), 0.22, WARM);
    const top = new THREE.Mesh(new THREE.CircleGeometry(6.9, 6), topMat);
    top.rotation.x = -Math.PI / 2;
    top.position.set(deck.x, deck.y + 0.22, deck.z);
    g.add(top);
    mats.push(topMat);
    const innerMat = fadeMat(new THREE.MeshBasicMaterial(), 0.5, WARM);
    const inner = new THREE.Mesh(new THREE.TorusGeometry(3.6, 0.05, 4, 6), innerMat);
    inner.rotation.x = -Math.PI / 2;
    inner.position.set(deck.x, deck.y + 0.3, deck.z);
    g.add(inner);
    mats.push(innerMat);

    /* beacon pole + blinking light (light opacity driven in tick) */
    const polePos = new Float32Array([deck.x, deck.y + 0.2, deck.z, deck.x, deck.y + 3.2, deck.z]);
    const poleGeo = new THREE.BufferGeometry();
    poleGeo.setAttribute('position', new THREE.BufferAttribute(polePos, 3));
    const poleMat = fadeMat(new THREE.LineBasicMaterial(), 0.5, WARM);
    g.add(new THREE.LineSegments(poleGeo, poleMat));
    mats.push(poleMat);
    const beaconMat = fadeMat(new THREE.MeshBasicMaterial(), 1, WARM);
    const beacon = new THREE.Mesh(new THREE.OctahedronGeometry(0.4, 0), beaconMat);
    beacon.position.set(deck.x, deck.y + 3.4, deck.z);
    g.add(beacon);

    /* approach guides: two converging rows of dash segments */
    const guideSegs: number[] = [];
    for (let k = 0; k < 6; k++) {
      const z = deck.z + 14 - k * 2.3;
      const w = 6.2 - k * 0.8;
      guideSegs.push(-w, deck.y + 0.6, z, -w + 1.3, deck.y + 0.6, z);
      guideSegs.push(w - 1.3, deck.y + 0.6, z, w, deck.y + 0.6, z);
    }
    const guideGeo = new THREE.BufferGeometry();
    guideGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(guideSegs), 3));
    const guideMat = fadeMat(new THREE.LineBasicMaterial(), 0.5, WARM);
    g.add(new THREE.LineSegments(guideGeo, guideMat));
    mats.push(guideMat);

    registerSet({
      i: 6,
      group: g,
      mats,
      tick: (fade, wdt, t) => {
        const blink = Math.sin(t * 3.1) > 0 ? 1 : 0.08;
        beaconMat.opacity = blink * fade;
        beacon.scale.setScalar(1 + blink * 0.25);
        guideMat.opacity = (0.35 + 0.2 * Math.sin(t * 2.4)) * fade;
      },
    });
  }

  /* ---- sizing ---- */
  const dpr = Math.min(window.devicePixelRatio || 1, 1.75);
  const resize = () => {
    renderer.setPixelRatio(dpr);
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  };
  resize();
  window.addEventListener('resize', resize);

  let prevFov = BASE_FOV;

  const drift = { x: 0, y: 0 };

  const tmpPos = new THREE.Vector3();
  const tmpLook = new THREE.Vector3();
  const tmpTan = new THREE.Vector3();
  const tmpAccent = new THREE.Color();
  const tmpFog = new THREE.Color();
  const tmpTint = new THREE.Color();

  return {
    camera,
    drift,
    pulse() {
      beat = 1;
    },
    update(p, transit, dt, now) {
      const t = now * 0.001;

      /* ---- theme morph: blend themes[i] → themes[i+1] from progress ---- */
      const f = THREE.MathUtils.clamp(p, 0, 1) * (STATIONS - 1);
      const seg = Math.min(STATIONS - 2, Math.floor(f));
      const lt = THREE.MathUtils.smoothstep(f - seg, 0, 1);
      const themeA = themes[seg];
      const themeB = themes[seg + 1];
      tmpAccent.copy(themeA.accent).lerp(themeB.accent, lt);
      tmpFog.copy(themeA.fog).lerp(themeB.fog, lt);
      tmpTint.copy(themeA.tint).lerp(themeB.tint, lt);
      const worldSpeed = themeA.speed + (themeB.speed - themeA.speed) * lt;
      const wdt = dt * worldSpeed;

      fog.color.copy(tmpFog);
      fog.density = themeA.fogDensity + (themeB.fogDensity - themeA.fogDensity) * lt;
      renderer.setClearColor(tmpFog, 1);
      starMat.color.copy(tmpTint);
      nodeMat.color.copy(tmpTint);
      gridMat.color.copy(tmpTint);
      gridCeilMat.color.copy(tmpTint);
      edgeMat.color.copy(PAPER_DIM).multiply(tmpTint);
      streakMat.color.copy(tmpAccent);
      packetMat.color.copy(tmpAccent);
      for (const m of acidWireMats) m.color.copy(tmpAccent);

      /* camera along the spline */
      posCurve.getPoint(p, tmpPos);
      lookCurve.getPoint(p, tmpLook);

      /* the camera never parks: while docked, breathe (±0.3) and slowly
         micro-orbit the look target (radius ~1.5, ~30s period) */
      const dockAmt = 1 - THREE.MathUtils.smoothstep(transit, 0.02, 0.35);
      const orbA = (t * Math.PI * 2) / 30;
      const driftX = (Math.cos(orbA) * 1.5 + Math.sin(t * 0.43) * 0.3) * dockAmt;
      const driftY = (Math.sin(orbA) * 1.1 + Math.cos(t * 0.31) * 0.3) * dockAmt;
      tmpPos.x += driftX;
      tmpPos.y += driftY;
      drift.x = THREE.MathUtils.clamp(driftX / 1.8, -1, 1);
      drift.y = THREE.MathUtils.clamp(driftY / 1.4, -1, 1);

      camera.position.copy(tmpPos);
      camera.lookAt(tmpLook);
      posCurve.getTangent(p, tmpTan);
      camera.rotateZ(THREE.MathUtils.clamp(-tmpTan.x * 0.35, -0.12, 0.12));

      /* fov punch during transits */
      const fov = BASE_FOV + (PUNCH_FOV - BASE_FOV) * transit;
      if (Math.abs(fov - prevFov) > 0.05) {
        camera.fov = fov;
        camera.updateProjectionMatrix();
        prevFov = fov;
      }

      /* network centerpiece */
      netGroup.rotation.y += wdt * 0.07;
      netGroup.position.y = 1.5 + Math.sin(t * 0.5) * 0.4;
      for (let k = 0; k < PACKET_COUNT; k++) {
        const pk = packets[k];
        pk.t += wdt * pk.speed;
        if (pk.t >= 1) {
          pk.edge = (Math.random() * edges.length) | 0;
          pk.t = 0;
        }
        const [a, b] = edges[pk.edge];
        for (let c = 0; c < 3; c++) {
          packetPos[k * 3 + c] =
            nodePos[a * 3 + c] + (nodePos[b * 3 + c] - nodePos[a * 3 + c]) * pk.t;
        }
      }
      (packetGeo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;

      /* wireframes drift */
      for (const m of wireframes) {
        m.rotation.x += wdt * m.userData.spin;
        m.rotation.y += wdt * m.userData.spin * 0.7;
        m.position.y += Math.sin(t * 0.6 + m.userData.bob) * wdt * 0.15;
      }

      /* gates glow with transit + beat */
      for (const gate of gates) {
        gate.material.opacity = 0.22 + transit * 0.4 + beat * 0.3;
        gate.rotation.z += wdt * 0.15;
        const s = 1 + beat * 0.03;
        gate.scale.setScalar(s);
      }

      /* per-station sets: proximity fade + docked boost + ticks */
      for (const s of stationSets) {
        const dist = Math.abs(f - s.i);
        const fade = 1 - THREE.MathUtils.smoothstep(dist, 0.55, 1.5);
        if (fade <= 0.004) {
          s.group.visible = false;
          continue;
        }
        s.group.visible = true;
        /* docked boost: while parked at a station its scenery burns
           ~30-40% above the proximity baseline with a gentle pulse,
           and relaxes back as the transit carries the camera away */
        const near = 1 - THREE.MathUtils.smoothstep(dist, 0.04, 0.45);
        const boost = 1 + near * dockAmt * (0.32 + 0.08 * Math.sin(t * 2.1));
        const bf = Math.min(1.3, fade * boost);
        for (const m of s.mats) m.opacity = Math.min(1, (m.userData.base as number) * bf);
        s.tick?.(bf, wdt, t, dist);
      }

      /* warp streaks: dense & fast only during transits */
      streakMat.opacity = transit * 0.75;
      if (transit > 0.02) {
        const stretch = 0.4 + transit * 7;
        for (let k = 0; k < STREAKS; k++) {
          const s = streakSeed[k];
          s.z += wdt * s.speed * (6 + transit * 90);
          if (s.z > camera.position.z + 8) seedStreak(k, camera.position.z - 6);
          streakPos[k * 6] = s.x;
          streakPos[k * 6 + 1] = s.y;
          streakPos[k * 6 + 2] = s.z;
          streakPos[k * 6 + 3] = s.x;
          streakPos[k * 6 + 4] = s.y;
          streakPos[k * 6 + 5] = s.z + stretch;
        }
        (streakGeo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
      }

      /* beat-linked pulse on the field */
      beat = Math.max(0, beat - dt * 3.2);
      starMat.size = 0.14 * (1 + beat * 0.5);
      starMat.opacity = 0.9 + beat * 0.1;

      renderer.render(scene, camera);
    },
  };
}
