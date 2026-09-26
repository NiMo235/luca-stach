/* ------------------------------------------------------------------ */
/* Three.js hero scene: interactive "logistics network"                */
/* Auto-rotating particle graph (~90 nodes, thin edges, bright         */
/* shipment packets travelling random edges). Pointer drag rotates     */
/* with inertia; gentle parallax + float otherwise. Raycast hover      */
/* brightens/pulses the nearest node. Acid + dim paper, transparent.   */
/* ------------------------------------------------------------------ */

import * as THREE from 'three';

const NODE_COUNT = 90;
const PACKET_COUNT = 14;
const ACID = new THREE.Color('#b4ff39');
const PAPER_DIM = new THREE.Color('#8a9186');

export function mountHero3d(canvas: HTMLCanvasElement, host: HTMLElement): void {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: false,
    powerPreference: 'high-performance',
  });
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 50);
  camera.position.z = 5.4;

  const group = new THREE.Group();
  scene.add(group);

  /* ---- nodes ---- */
  const nodePos = new Float32Array(NODE_COUNT * 3);
  const nodeCol = new Float32Array(NODE_COUNT * 3);
  const baseCol = new Float32Array(NODE_COUNT * 3);
  for (let i = 0; i < NODE_COUNT; i++) {
    // slightly squashed sphere with a loose core/shell split
    const r = 1.4 + Math.random() * 1.3;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    nodePos[i * 3] = r * Math.sin(phi) * Math.cos(theta) * 1.35;
    nodePos[i * 3 + 1] = r * Math.cos(phi) * 0.85;
    nodePos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    const c = Math.random() < 0.16 ? ACID : PAPER_DIM;
    const dim = c === ACID ? 0.75 + Math.random() * 0.25 : 0.2 + Math.random() * 0.35;
    baseCol[i * 3] = c.r * dim;
    baseCol[i * 3 + 1] = c.g * dim;
    baseCol[i * 3 + 2] = c.b * dim;
  }
  nodeCol.set(baseCol);

  const nodeGeo = new THREE.BufferGeometry();
  nodeGeo.setAttribute('position', new THREE.BufferAttribute(nodePos, 3));
  nodeGeo.setAttribute('color', new THREE.BufferAttribute(nodeCol, 3));
  const nodes = new THREE.Points(
    nodeGeo,
    new THREE.PointsMaterial({
      size: 0.055,
      vertexColors: true,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    }),
  );
  group.add(nodes);

  /* ---- edges: connect each node to its 2 nearest neighbours ---- */
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
  const linePos = new Float32Array(edges.length * 6);
  edges.forEach(([a, b], k) => {
    linePos.set(nodePos.subarray(a * 3, a * 3 + 3), k * 6);
    linePos.set(nodePos.subarray(b * 3, b * 3 + 3), k * 6 + 3);
  });
  const lineGeo = new THREE.BufferGeometry();
  lineGeo.setAttribute('position', new THREE.BufferAttribute(linePos, 3));
  group.add(
    new THREE.LineSegments(
      lineGeo,
      new THREE.LineBasicMaterial({
        color: PAPER_DIM,
        transparent: true,
        opacity: 0.14,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    ),
  );

  /* ---- packets: shipments travelling along random edges ---- */
  const packets = Array.from({ length: PACKET_COUNT }, () => ({
    edge: (Math.random() * edges.length) | 0,
    t: Math.random(),
    speed: 0.25 + Math.random() * 0.4,
  }));
  const packetPos = new Float32Array(PACKET_COUNT * 3);
  const packetGeo = new THREE.BufferGeometry();
  packetGeo.setAttribute('position', new THREE.BufferAttribute(packetPos, 3));
  group.add(
    new THREE.Points(
      packetGeo,
      new THREE.PointsMaterial({
        size: 0.09,
        color: ACID,
        transparent: true,
        opacity: 0.95,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        sizeAttenuation: true,
      }),
    ),
  );

  /* ---- sizing ---- */
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const resize = () => {
    const w = host.clientWidth;
    const h = host.clientHeight;
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  resize();
  window.addEventListener('resize', resize);

  /* ---- interaction state ---- */
  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  let velY = 0;
  let velX = 0;
  let parX = 0;
  let parY = 0;
  let tParX = 0;
  let tParY = 0;

  const raycaster = new THREE.Raycaster();
  raycaster.params.Points.threshold = 0.14;
  const ndc = new THREE.Vector2(2, 2);
  let hovered = -1;

  const interactive = (e: PointerEvent): boolean =>
    Boolean((e.target as HTMLElement | null)?.closest('a, button, [role="button"], input, textarea'));

  host.addEventListener('pointerdown', (e) => {
    if (interactive(e) || e.button !== 0) return;
    dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
    e.preventDefault();
    host.setPointerCapture(e.pointerId);
  });
  host.addEventListener('pointermove', (e) => {
    if (dragging) {
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      velY = dx * 0.0045;
      velX = dy * 0.0032;
      group.rotation.y += velY;
      group.rotation.x = THREE.MathUtils.clamp(group.rotation.x + velX, -0.6, 0.6);
    } else if (!interactive(e)) {
      const r = host.getBoundingClientRect();
      tParX = ((e.clientX - r.left) / r.width - 0.5) * 0.35;
      tParY = ((e.clientY - r.top) / r.height - 0.5) * 0.22;
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -(((e.clientY - r.top) / r.height) * 2 - 1));
    }
  });
  const endDrag = (e: PointerEvent) => {
    if (!dragging) return;
    dragging = false;
    try {
      host.releasePointerCapture(e.pointerId);
    } catch {
      /* pointer already released */
    }
  };
  host.addEventListener('pointerup', endDrag);
  host.addEventListener('pointercancel', endDrag);

  /* ---- visibility gating ---- */
  let visible = true;
  new IntersectionObserver(
    (entries) => {
      visible = entries[0]?.isIntersecting ?? true;
    },
    { rootMargin: '100px' },
  ).observe(host);

  const setHover = (i: number) => {
    if (hovered === i) return;
    if (hovered >= 0) nodeCol.set(baseCol.subarray(hovered * 3, hovered * 3 + 3), hovered * 3);
    hovered = i;
    (nodeGeo.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
  };

  let raf = 0;
  let prev = performance.now();

  const frame = (now: number) => {
    raf = requestAnimationFrame(frame);
    if (document.hidden || !visible) {
      prev = now;
      return;
    }
    const dt = Math.min((now - prev) / 1000, 0.05);
    prev = now;
    const t = now * 0.001;

    // inertia + auto rotation + parallax + float
    if (!dragging) {
      group.rotation.y += velY + dt * 0.07;
      group.rotation.x = THREE.MathUtils.clamp(group.rotation.x + velX, -0.6, 0.6);
      velY *= 0.955;
      velX *= 0.955;
      parX += (tParX - parX) * 0.04;
      parY += (tParY - parY) * 0.04;
    }
    group.rotation.x = THREE.MathUtils.clamp(group.rotation.x, -0.6, 0.6);
    group.rotation.z = parX * 0.12;
    group.position.x = parX * 0.35;
    group.position.y = Math.sin(t * 0.5) * 0.08 - parY * 0.25;

    // packets
    for (let k = 0; k < PACKET_COUNT; k++) {
      const p = packets[k];
      p.t += dt * p.speed;
      if (p.t >= 1) {
        p.edge = (Math.random() * edges.length) | 0;
        p.t = 0;
      }
      const [a, b] = edges[p.edge];
      for (let c = 0; c < 3; c++) {
        packetPos[k * 3 + c] =
          nodePos[a * 3 + c] + (nodePos[b * 3 + c] - nodePos[a * 3 + c]) * p.t;
      }
    }
    (packetGeo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;

    // hover raycast (skip while dragging)
    if (!dragging) {
      raycaster.setFromCamera(ndc, camera);
      const hits = raycaster.intersectObject(nodes);
      setHover(hits.length ? (hits[0].index ?? -1) : -1);
    } else {
      setHover(-1);
    }
    if (hovered >= 0) {
      const pulse = 0.75 + 0.45 * Math.sin(t * 9);
      nodeCol[hovered * 3] = ACID.r * pulse;
      nodeCol[hovered * 3 + 1] = ACID.g * pulse;
      nodeCol[hovered * 3 + 2] = ACID.b * pulse;
      (nodeGeo.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
    }

    renderer.render(scene, camera);
  };
  raf = requestAnimationFrame(frame);

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) prev = performance.now();
  });
}
