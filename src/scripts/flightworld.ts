/* ------------------------------------------------------------------ */
/* Flight world: the 3D space the camera flies through.                */
/* Starfield, receding grid floor, a scaled-up "logistics network"     */
/* centerpiece (same node/edge/packet recipe as hero3d), floating      */
/* wireframe bodies, gate rings between stations and warp streaks      */
/* that stretch during transits. Additive acid + paper on ink.         */
/* ------------------------------------------------------------------ */

import * as THREE from 'three';

const ACID = new THREE.Color('#b4ff39');
const PAPER = new THREE.Color('#e8ece4');
const PAPER_DIM = new THREE.Color('#8a9186');
const WARM = new THREE.Color('#ffb35c');
const INK = new THREE.Color('#0a0d0a');

const STATIONS = 7;
const SEG = 36; // distance between stations on z

/* camera keyframes: swooping lateral offsets, descending corridor */
const CAM_KEYS = [
  new THREE.Vector3(0, 0.4, 8),
  new THREE.Vector3(7, -1.2, -SEG),
  new THREE.Vector3(-6, 1.8, -SEG * 2),
  new THREE.Vector3(8, -1.8, -SEG * 3),
  new THREE.Vector3(-8, 1.2, -SEG * 4),
  new THREE.Vector3(6, -0.8, -SEG * 5),
  new THREE.Vector3(0, 0.4, -SEG * 6),
];
const LOOK_KEYS = CAM_KEYS.map((v) => new THREE.Vector3(v.x * 0.25, v.y * 0.25, v.z - 22));

const BASE_FOV = 75;
const PUNCH_FOV = 92;

export interface FlightWorld {
  /** advance & render one frame: p in [0,1], transit intensity 0..1 */
  update(p: number, transit: number, dt: number, now: number): void;
  /** beat pulse from the audio engine (0..1 kick envelope start) */
  pulse(): void;
  camera: THREE.PerspectiveCamera;
}

export function createWorld(canvas: HTMLCanvasElement): FlightWorld {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance',
  });
  renderer.setClearColor(INK, 1);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(INK.getHex(), 0.011);

  const camera = new THREE.PerspectiveCamera(BASE_FOV, 1, 0.1, 400);
  camera.position.copy(CAM_KEYS[0]);

  const posCurve = new THREE.CatmullRomCurve3(CAM_KEYS, false, 'catmullrom', 0.35);
  const lookCurve = new THREE.CatmullRomCurve3(LOOK_KEYS, false, 'catmullrom', 0.35);

  const midZ = (-SEG * (STATIONS - 1)) / 2;

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
  const gridMat = grid.material as THREE.Material;
  gridMat.transparent = true;
  gridMat.opacity = 0.08;
  gridMat.blending = THREE.AdditiveBlending;
  gridMat.depthWrite = false;
  scene.add(grid);
  const gridCeil = new THREE.GridHelper(560, 90, ACID.getHex(), PAPER_DIM.getHex());
  gridCeil.position.set(0, 18, midZ);
  const gridCeilMat = gridCeil.material as THREE.Material;
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
  netGroup.add(
    new THREE.Points(
      nodeGeo,
      new THREE.PointsMaterial({
        size: 0.22,
        vertexColors: true,
        transparent: true,
        opacity: 0.95,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    ),
  );

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
  netGroup.add(
    new THREE.LineSegments(
      edgeGeo,
      new THREE.LineBasicMaterial({
        color: PAPER_DIM,
        transparent: true,
        opacity: 0.16,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    ),
  );

  const packets = Array.from({ length: PACKET_COUNT }, () => ({
    edge: (Math.random() * edges.length) | 0,
    t: Math.random(),
    speed: 0.2 + Math.random() * 0.35,
  }));
  const packetPos = new Float32Array(PACKET_COUNT * 3);
  const packetGeo = new THREE.BufferGeometry();
  packetGeo.setAttribute('position', new THREE.BufferAttribute(packetPos, 3));
  netGroup.add(
    new THREE.Points(
      packetGeo,
      new THREE.PointsMaterial({
        size: 0.38,
        color: ACID,
        transparent: true,
        opacity: 0.95,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    ),
  );

  /* ---- floating wireframes along the corridor ---- */
  const wireframes: THREE.Mesh[] = [];
  const wireGeos = [
    new THREE.IcosahedronGeometry(1, 0),
    new THREE.TorusGeometry(1, 0.32, 8, 20),
    new THREE.OctahedronGeometry(1, 0),
  ];
  for (let i = 0; i < 14; i++) {
    const geo = wireGeos[i % wireGeos.length];
    const mat = new THREE.MeshBasicMaterial({
      wireframe: true,
      color: i % 3 === 0 ? ACID : PAPER,
      transparent: true,
      opacity: i % 3 === 0 ? 0.2 : 0.08,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
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

  /* ---- gate rings between stations ---- */
  const gates: THREE.Mesh<THREE.TorusGeometry, THREE.MeshBasicMaterial>[] = [];
  for (let i = 0; i < STATIONS - 1; i++) {
    const mat = new THREE.MeshBasicMaterial({
      color: ACID,
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

  let beat = 0;
  let prevFov = BASE_FOV;

  const tmpPos = new THREE.Vector3();
  const tmpLook = new THREE.Vector3();
  const tmpTan = new THREE.Vector3();

  return {
    camera,
    pulse() {
      beat = 1;
    },
    update(p, transit, dt, now) {
      const t = now * 0.001;

      /* camera along the spline */
      posCurve.getPoint(p, tmpPos);
      lookCurve.getPoint(p, tmpLook);
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
      netGroup.rotation.y += dt * 0.07;
      netGroup.position.y = 1.5 + Math.sin(t * 0.5) * 0.4;
      for (let k = 0; k < PACKET_COUNT; k++) {
        const pk = packets[k];
        pk.t += dt * pk.speed;
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
        m.rotation.x += dt * m.userData.spin;
        m.rotation.y += dt * m.userData.spin * 0.7;
        m.position.y += Math.sin(t * 0.6 + m.userData.bob) * dt * 0.15;
      }

      /* gates glow with transit + beat */
      for (const gate of gates) {
        gate.material.opacity = 0.22 + transit * 0.4 + beat * 0.3;
        gate.rotation.z += dt * 0.15;
        const s = 1 + beat * 0.03;
        gate.scale.setScalar(s);
      }

      /* warp streaks: dense & fast only during transits */
      streakMat.opacity = transit * 0.75;
      if (transit > 0.02) {
        const stretch = 0.4 + transit * 7;
        for (let k = 0; k < STREAKS; k++) {
          const s = streakSeed[k];
          s.z += dt * s.speed * (6 + transit * 90);
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
