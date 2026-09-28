/* ------------------------------------------------------------------ */
/* Hall shell: concrete floor (joints, lane markings, zone numbers     */
/* baked into one canvas texture), sandwich-panel walls, steel         */
/* columns, roof with trusses + skylight bands, cable trays,           */
/* sectional doors and the truck yard outside the north wall.          */
/* ------------------------------------------------------------------ */

import * as THREE from 'three';
import { HALL, DOORS, COL } from '../layout';
import { GeoBatch, canvasTexture, rng } from '../util';
import { MARK_LANES } from '../sim/graph';

const PXM = 2048 / HALL.L; // floor texture: ~17 px per meter

/* ---- floor texture: concrete + joints + markings + zone numbers ---- */
function floorTexture(aniso: number): THREE.CanvasTexture {
  return canvasTexture(
    2048,
    1024,
    (ctx, W, H) => {
      const X = (x: number) => (x + HALL.L / 2) * PXM;
      const Z = (z: number) => (z + HALL.W / 2) * PXM;
      const rnd = rng(101);

      ctx.fillStyle = '#1e2124';
      ctx.fillRect(0, 0, W, H);

      /* concrete noise + large soft patches */
      for (let i = 0; i < 2600; i++) {
        const g = 20 + rnd() * 20;
        ctx.fillStyle = `rgba(${g},${g + 2},${g + 5},${0.25 + rnd() * 0.4})`;
        ctx.fillRect(rnd() * W, rnd() * H, 1 + rnd() * 3, 1 + rnd() * 3);
      }
      for (let i = 0; i < 26; i++) {
        const g = rnd() < 0.5 ? 20 : 44;
        const grd = ctx.createRadialGradient(0, 0, 0, 0, 0, 60 + rnd() * 160);
        grd.addColorStop(0, `rgba(${g},${g},${g + 3},0.10)`);
        grd.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.save();
        ctx.translate(rnd() * W, rnd() * H);
        ctx.fillStyle = grd;
        ctx.fillRect(-220, -220, 440, 440);
        ctx.restore();
      }

      /* expansion joints every 6 m */
      ctx.strokeStyle = 'rgba(8,9,10,0.55)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let x = -54; x < 60; x += 6) {
        ctx.moveTo(X(x), 0);
        ctx.lineTo(X(x), H);
      }
      for (let z = -24; z < 30; z += 6) {
        ctx.moveTo(0, Z(z));
        ctx.lineTo(W, Z(z));
      }
      ctx.stroke();

      const line = (
        x0: number,
        z0: number,
        x1: number,
        z1: number,
        color: string,
        wM: number,
        dash: number[] = [],
      ) => {
        ctx.strokeStyle = color;
        ctx.lineWidth = Math.max(1.5, wM * PXM);
        ctx.setLineDash(dash.map((d) => d * PXM));
        ctx.beginPath();
        ctx.moveTo(X(x0), Z(z0));
        ctx.lineTo(X(x1), Z(z1));
        ctx.stroke();
        ctx.setLineDash([]);
      };

      /* AGV loop: rounded rectangle in the central/eastern hall */
      const lp = { x0: -22, x1: 32, z0: -13, z1: 13, r: 9 };
      ctx.strokeStyle = 'rgba(180,255,57,0.42)';
      ctx.lineWidth = 0.16 * PXM;
      ctx.setLineDash([1.4 * PXM, 0.9 * PXM]);
      ctx.beginPath();
      ctx.roundRect(X(lp.x0), Z(lp.z0), (lp.x1 - lp.x0) * PXM, (lp.z1 - lp.z0) * PXM, lp.r * PXM);
      ctx.stroke();
      ctx.setLineDash([]);

      /* spur lanes: drawn 1:1 from the sim graph (graph wins — the
         texture follows the network, T-102) */
      ctx.strokeStyle = 'rgba(180,255,57,0.30)';
      ctx.lineWidth = 0.12 * PXM;
      ctx.setLineDash([1.0 * PXM, 0.8 * PXM]);
      for (const lane of MARK_LANES) {
        ctx.beginPath();
        lane.forEach(([x, z], i) => {
          if (i === 0) ctx.moveTo(X(x), Z(z));
          else ctx.lineTo(X(x), Z(z));
        });
        ctx.stroke();
      }
      ctx.setLineDash([]);

      /* pedestrian walkway along the south side + crossings */
      line(-58, 26.4, 34, 26.4, 'rgba(232,236,228,0.5)', 0.12);
      line(-58, 28.6, 34, 28.6, 'rgba(232,236,228,0.5)', 0.12);
      for (const cx of [-30, 20]) {
        for (let k = 0; k < 5; k++) {
          ctx.fillStyle = 'rgba(232,236,228,0.42)';
          ctx.fillRect(X(cx - 1.5 + k * 0.75), Z(23.4), 0.45 * PXM, 3 * PXM);
        }
      }

      /* floor glyphs: canvas-top maps to world north, so upright canvas
         text reads upright for a viewer looking north (the DOCK camera
         faces TOR 1 → "01" must NOT be pre-flipped) */
      const floorText = (label: string, x: number, z: number) => {
        ctx.save();
        ctx.translate(X(x), Z(z));
        ctx.fillText(label, 0, 0);
        ctx.restore();
      };

      /* staging boxes + numbers in front of the dock doors */
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      DOORS.forEach((d, i) => {
        const label = i < 4 ? `0${i + 1}` : i === 4 ? 'GA' : 'GB';
        ctx.strokeStyle = 'rgba(232,236,228,0.34)';
        ctx.lineWidth = 0.1 * PXM;
        ctx.strokeRect(X(d.x - 3), Z(-27.5), 6 * PXM, 5 * PXM);
        ctx.font = `700 ${2.2 * PXM}px "JetBrains Mono", monospace`;
        ctx.fillStyle = 'rgba(232,236,228,0.30)';
        floorText(label, d.x, -25);
      });

      /* aisle letters at the south end of each rack aisle */
      ctx.font = `700 ${2.6 * PXM}px "JetBrains Mono", monospace`;
      ctx.fillStyle = 'rgba(180,255,57,0.34)';
      ['A', 'B', 'C'].forEach((a, i) => {
        floorText(a, [-55.4, -49.6, -43.8][i], 18.6);
      });

      /* hazard striping around the Gefahrgut cage */
      const hz = (x0: number, z0: number, wM: number, hM: number) => {
        ctx.save();
        ctx.beginPath();
        ctx.rect(X(x0), Z(z0), wM * PXM, hM * PXM);
        ctx.clip();
        ctx.fillStyle = 'rgba(255,179,92,0.30)';
        ctx.fillRect(X(x0), Z(z0), wM * PXM, hM * PXM);
        ctx.fillStyle = 'rgba(10,13,10,0.55)';
        for (let k = -8; k < 16; k++) {
          ctx.save();
          ctx.translate(X(x0) + k * 1.1 * PXM, Z(z0));
          ctx.rotate(Math.PI / 4);
          ctx.fillRect(-0.25 * PXM, -4 * PXM, 0.5 * PXM, 8 * PXM);
          ctx.restore();
        }
        ctx.restore();
      };
      hz(43.4, -29.8, 15.4, 0.7);
      hz(43.4, -19.2, 15.4, 0.7);
      hz(43.4, -29.8, 0.7, 11.3); /* west + east edges (T-103) */
      hz(58.1, -29.8, 0.7, 11.3);

      /* faint wear: tire arcs near the crossing */
      ctx.strokeStyle = 'rgba(12,13,14,0.20)';
      for (let i = 0; i < 9; i++) {
        ctx.lineWidth = (0.2 + rnd() * 0.3) * PXM;
        ctx.beginPath();
        ctx.arc(X(-2 + rnd() * 16), Z(-6 + rnd() * 12), (3 + rnd() * 7) * PXM, rnd() * 6.3, rnd() * 6.3 + 1.2);
        ctx.stroke();
      }
    },
    { aniso },
  );
}

/* sandwich-panel tile, repeated every 3 m on wall planes */
function wallTexture(): THREE.CanvasTexture {
  return canvasTexture(256, 256, (ctx, W, H) => {
    ctx.fillStyle = '#434a52';
    ctx.fillRect(0, 0, W, H);
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, 'rgba(255,255,255,0.06)');
    g.addColorStop(1, 'rgba(0,0,0,0.14)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(10,12,14,0.65)';
    ctx.lineWidth = 3;
    ctx.strokeRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(255,255,255,0.10)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(2, 3);
    ctx.lineTo(W - 2, 3);
    ctx.stroke();
  });
}

/* horizontal slats for the sectional doors */
function doorTexture(base: string): THREE.CanvasTexture {
  return canvasTexture(256, 256, (ctx, W, H) => {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, W, H);
    for (let y = 0; y < H; y += 32) {
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(0, y, W, 3);
      ctx.fillStyle = 'rgba(255,255,255,0.07)';
      ctx.fillRect(0, y + 3, W, 2);
    }
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillRect(0, 0, 10, H);
    ctx.fillRect(W - 10, 0, 10, H);
  });
}

function wallPlane(
  w: number,
  h: number,
  x: number,
  y: number,
  z: number,
  ry: number,
  mat: THREE.Material,
): THREE.Mesh {
  const g = new THREE.PlaneGeometry(w, h);
  /* scale UVs so the panel tile repeats every 3 m in both axes */
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, uv.getX(i) * (w / 3), uv.getY(i) * (h / 3));
  }
  const m = new THREE.Mesh(g, mat);
  m.rotation.y = ry;
  m.position.set(x, y, z);
  m.receiveShadow = true;
  return m;
}

/* beam between two points (for trusses) */
function trussBeam(b: GeoBatch, a: THREE.Vector3, c: THREE.Vector3, r: number): void {
  const dir = new THREE.Vector3().subVectors(c, a);
  const len = dir.length();
  const g = new THREE.CylinderGeometry(r, r, len, 5);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  g.applyQuaternion(q);
  const mid = a.clone().add(c).multiplyScalar(0.5);
  b.add(g, mid.x, mid.y, mid.z);
}

export interface ShellPower {
  redMat: THREE.MeshBasicMaterial;
  greenMat: THREE.MeshBasicMaterial;
  yardHeadMat: THREE.MeshBasicMaterial;
  emergMat: THREE.MeshBasicMaterial;
}

export function buildShell(
  scene: THREE.Scene,
  maxAniso: number,
): { parts: number; power: ShellPower } {
  let parts = 0;
  const add = (o: THREE.Object3D) => {
    scene.add(o);
    parts++;
  };

  /* ---- floor ---- */
  const floorMat = new THREE.MeshStandardMaterial({
    map: floorTexture(maxAniso),
    roughness: 0.92,
    metalness: 0.04,
  });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(HALL.L, HALL.W), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  add(floor);

  /* ---- walls (north wall gets a real opening at the open TOR 1) ---- */
  const wallMat = new THREE.MeshStandardMaterial({
    map: wallTexture(),
    roughness: 0.85,
    metalness: 0.25,
  });
  const t1 = DOORS[0]; // open door
  const H = HALL.H;
  add(wallPlane(t1.x - t1.w / 2 - HALL.X0, H, (HALL.X0 + t1.x - t1.w / 2) / 2, H / 2, HALL.Z0, 0, wallMat));
  add(wallPlane(HALL.X1 - (t1.x + t1.w / 2), H, (HALL.X1 + t1.x + t1.w / 2) / 2, H / 2, HALL.Z0, 0, wallMat));
  add(wallPlane(t1.w, H - t1.h, t1.x, (H + t1.h) / 2, HALL.Z0, 0, wallMat)); // lintel
  add(wallPlane(HALL.L, H, 0, H / 2, HALL.Z1, Math.PI, wallMat)); // south
  add(wallPlane(HALL.W, H, HALL.X0, H / 2, 0, Math.PI / 2, wallMat)); // west
  add(wallPlane(HALL.W, H, HALL.X1, H / 2, 0, -Math.PI / 2, wallMat)); // east

  /* ---- wall columns (I-profile approximated by 3 plates), merged ---- */
  const colSteel = new THREE.MeshStandardMaterial({
    color: 0x3d454d,
    metalness: 0.85,
    roughness: 0.42,
  });
  const cols = new GeoBatch();
  for (let x = -55; x <= 55; x += 10) {
    for (const z of [HALL.Z0 + 0.35, HALL.Z1 - 0.35]) {
      cols.box(0.09, H, 0.42, x, H / 2, z);
      cols.box(0.34, H, 0.07, x, H / 2, z - 0.18);
      cols.box(0.34, H, 0.07, x, H / 2, z + 0.18);
    }
  }
  add(cols.mesh(colSteel, true, true));

  /* ---- roof: 4 slabs between the 3 skylight bands (bands are real
     gaps, so the key light drops visible shafts through them) ---- */
  const roofMat = new THREE.MeshStandardMaterial({
    color: 0x14181d,
    roughness: 0.9,
    metalness: 0.3,
  });
  const roofSpans: Array<[number, number]> = [
    [HALL.Z0, -21.3],
    [-18.7, -1.3],
    [1.3, 18.7],
    [21.3, HALL.Z1],
  ];
  const roofs = new GeoBatch();
  for (const [z0, z1] of roofSpans) {
    roofs.box(HALL.L, 0.25, z1 - z0, 0, H + 0.12, (z0 + z1) / 2);
  }
  add(roofs.mesh(roofMat, true, false));

  /* skylight glass: faint cold glow from the night sky */
  const skyMat = new THREE.MeshBasicMaterial({ color: 0x121e30 });
  const skyBatch = new GeoBatch();
  for (const z of [-20, 0, 20]) {
    skyBatch.box(HALL.L, 0.06, 2.6, 0, H + 0.3, z);
    /* raised curb frames */
    skyBatch.box(HALL.L, 0.5, 0.12, 0, H + 0.25, z - 1.36);
    skyBatch.box(HALL.L, 0.5, 0.12, 0, H + 0.25, z + 1.36);
  }
  const skyGlass = skyBatch.mesh(skyMat, false, false);
  add(skyGlass);

  /* ---- trusses spanning z every 10 m + purlins along x ---- */
  const trussMat = new THREE.MeshStandardMaterial({
    color: 0x2c343c,
    metalness: 0.8,
    roughness: 0.5,
  });
  const trusses = new GeoBatch();
  const A = new THREE.Vector3();
  const B = new THREE.Vector3();
  for (let x = -55; x <= 55; x += 10) {
    trussBeam(trusses, A.set(x, 12.0, HALL.Z0), B.set(x, 12.0, HALL.Z1), 0.09); // bottom chord
    trussBeam(trusses, A.set(x, 13.4, HALL.Z0), B.set(x, 13.4, HALL.Z1), 0.09); // top chord
    for (let z = -30; z < 30; z += 3) {
      trussBeam(trusses, A.set(x, 12.0, z), B.set(x, 13.4, Math.min(30, z + 3)), 0.045);
      trussBeam(trusses, A.set(x, 13.4, z), B.set(x, 12.0, Math.min(30, z + 3)), 0.045);
    }
  }
  for (const z of [-24, -12, -6, 6, 12, 24]) {
    trusses.box(HALL.L - 4, 0.16, 0.16, 0, 13.28, z); // purlins
  }
  add(trusses.mesh(trussMat, true, false));

  /* ---- cable trays under the roof ---- */
  const trayMat = new THREE.MeshStandardMaterial({
    color: 0x4a5158,
    metalness: 0.7,
    roughness: 0.55,
  });
  const trays = new GeoBatch();
  for (const z of [-6, 8]) {
    trays.box(112, 0.05, 0.06, 0, 12.55, z - 0.18);
    trays.box(112, 0.05, 0.06, 0, 12.55, z + 0.18);
    for (let x = -54; x <= 54; x += 1.6) trays.box(0.06, 0.04, 0.42, x, 12.52, z);
  }
  trays.box(0.06, 9.2, 0.06, 47, 7.9, 8); // drop down to the Leitstand zone
  trays.box(24, 0.05, 0.06, 47, 12.55, 8.18);
  add(trays.mesh(trayMat, false, false));

  /* ---- dock doors ---- */
  const doorMat = new THREE.MeshStandardMaterial({
    map: doorTexture('#4d565f'),
    roughness: 0.7,
    metalness: 0.5,
  });
  const hzDoorMat = new THREE.MeshStandardMaterial({
    map: doorTexture('#5e5648'),
    roughness: 0.7,
    metalness: 0.45,
  });
  const doorBatch = new GeoBatch();
  const hzBatch = new GeoBatch();
  const frameBatch = new GeoBatch();
  DOORS.forEach((d, i) => {
    /* frame rails */
    frameBatch.box(0.22, d.h + 0.4, 0.3, d.x - d.w / 2 - 0.1, (d.h + 0.4) / 2, HALL.Z0 + 0.05);
    frameBatch.box(0.22, d.h + 0.4, 0.3, d.x + d.w / 2 + 0.1, (d.h + 0.4) / 2, HALL.Z0 + 0.05);
    /* dock bumpers + leveler plate */
    frameBatch.box(0.5, 0.6, 0.3, d.x - d.w / 2 + 0.4, 0.3, HALL.Z0 + 0.2);
    frameBatch.box(0.5, 0.6, 0.3, d.x + d.w / 2 - 0.4, 0.3, HALL.Z0 + 0.2);
    frameBatch.box(d.w - 0.8, 0.08, 1.6, d.x, 0.04, HALL.Z0 + 1.0);
    if (d.open) {
      /* raised door pack above the opening */
      frameBatch.box(d.w, 0.9, 0.35, d.x, d.h + 0.55, HALL.Z0 + 0.15);
    } else {
      (i < 4 ? doorBatch : hzBatch).box(d.w, d.h, 0.12, d.x, d.h / 2, HALL.Z0 + 0.06);
    }
  });
  add(doorBatch.mesh(doorMat, true, true));
  add(hzBatch.mesh(hzDoorMat, true, true));
  add(frameBatch.mesh(colSteel, true, true));

  /* dock status lamps: green at the open TOR 1, red elsewhere */
  const lampGeo = new THREE.BoxGeometry(0.32, 0.14, 0.1);
  const redMat = new THREE.MeshBasicMaterial({ color: 0xff4a3c });
  const redLamps = new THREE.InstancedMesh(lampGeo, redMat, DOORS.length - 1);
  const m4 = new THREE.Matrix4();
  let ri = 0;
  DOORS.forEach((d, i) => {
    if (d.open) return;
    m4.makeTranslation(d.x, d.h + 0.35, HALL.Z0 + 0.35);
    redLamps.setMatrixAt(ri++, m4);
  });
  redLamps.instanceMatrix.needsUpdate = true;
  add(redLamps);
  const greenMat = new THREE.MeshBasicMaterial({ color: COL.acid });
  const greenLamp = new THREE.Mesh(lampGeo, greenMat);
  greenLamp.position.set(t1.x, t1.h + 0.35, HALL.Z0 + 0.35);
  add(greenLamp);

  /* emergency strips flanking the dock doors — first thing that powers
     up in the intro sequence (group 0) */
  const emergMat = new THREE.MeshBasicMaterial({ color: 0x3fae62 });
  const emerg = new GeoBatch();
  for (const d of DOORS) {
    emerg.box(0.07, d.h + 0.5, 0.07, d.x - d.w / 2 - 0.32, (d.h + 0.5) / 2, HALL.Z0 + 0.18);
    emerg.box(0.07, d.h + 0.5, 0.07, d.x + d.w / 2 + 0.32, (d.h + 0.5) / 2, HALL.Z0 + 0.18);
  }
  add(emerg.mesh(emergMat, false, false));

  /* ---- the yard outside (seen through the open TOR 1) ---- */
  const yardMat = new THREE.MeshStandardMaterial({ color: 0x101316, roughness: 0.98 });
  const yard = new THREE.Mesh(new THREE.PlaneGeometry(150, 46), yardMat);
  yard.rotation.x = -Math.PI / 2;
  yard.position.set(0, -0.02, -53);
  add(yard);

  /* yard light poles with cold sodium heads */
  const poleBatch = new GeoBatch();
  for (const px of [-52, -14, 26]) {
    poleBatch.cyl(0.09, 0.12, 8.5, 6, px, 4.25, -46);
    poleBatch.box(0.8, 0.14, 0.3, px + 0.3, 8.4, -46);
  }
  add(poleBatch.mesh(colSteel, false, false));
  const headMat = new THREE.MeshBasicMaterial({ color: 0xffc98a });
  const heads = new GeoBatch();
  for (const px of [-52, -14, 26]) heads.box(0.6, 0.08, 0.22, px + 0.5, 8.32, -46);
  add(heads.mesh(headMat, false, false));

  /* doors 02/03 get their trailers from the simulation now (T-102) —
     the yard stays otherwise empty for the animated truck traffic */

  /* distant city glow behind the yard */
  const glowTex = canvasTexture(256, 64, (ctx, W, H2) => {
    const g = ctx.createLinearGradient(0, H2, 0, 0);
    g.addColorStop(0, 'rgba(255,190,120,0.30)');
    g.addColorStop(0.4, 'rgba(140,120,160,0.12)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H2);
  });
  const glow = new THREE.Mesh(
    new THREE.PlaneGeometry(150, 16),
    new THREE.MeshBasicMaterial({
      map: glowTex,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    }),
  );
  glow.position.set(0, 6, -75.5);
  add(glow);

  /* warm yard light spilling through the open TOR 1 */
  const spillTex = canvasTexture(128, 128, (ctx, W, H2) => {
    const g = ctx.createRadialGradient(W / 2, H2 / 2, 4, W / 2, H2 / 2, W / 2);
    g.addColorStop(0, 'rgba(255,201,138,0.55)');
    g.addColorStop(1, 'rgba(255,201,138,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H2);
  });
  const spillMat = new THREE.MeshBasicMaterial({
    map: spillTex,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  spillMat.color.setRGB(1.9, 1.55, 1.1); // push the additive glow past ACES compression
  const spillFloor = new THREE.Mesh(new THREE.PlaneGeometry(11, 9), spillMat);
  spillFloor.rotation.x = -Math.PI / 2;
  spillFloor.position.set(t1.x, 0.03, HALL.Z0 + 3.4);
  add(spillFloor);
  const spillHaze = new THREE.Mesh(new THREE.PlaneGeometry(7.5, 5.2), spillMat);
  spillHaze.position.set(t1.x, 2.6, HALL.Z0 + 0.6);
  add(spillHaze);

  /* a tractor unit waiting on the yard, parked parallel to the wall —
     side silhouette + marker lights visible through the open TOR 1 */
  const truckMat = new THREE.MeshStandardMaterial({ color: 0x1e2329, roughness: 0.5, metalness: 0.5 });
  const truck = new GeoBatch();
  truck.box(2.55, 2.7, 8.5, -60, 1.75, -44, Math.PI / 2); // trailer, long side to the hall
  truck.box(2.5, 2.9, 3.4, -54.6, 1.7, -44, Math.PI / 2); // cab at the east end
  add(truck.mesh(truckMat, false, false));
  const markerMat = new THREE.MeshBasicMaterial({ color: 0xffb35c });
  const markers = new GeoBatch();
  markers.box(0.06, 0.08, 0.08, -55.7, 2.9, -45.1);
  markers.box(0.06, 0.08, 0.08, -55.7, 2.9, -42.9);
  markers.box(0.06, 0.14, 0.1, -55.7, 1.0, -45.0);
  markers.box(0.06, 0.14, 0.1, -55.7, 1.0, -43.0);
  add(markers.mesh(markerMat, false, false));

  /* second haze layer deeper in the yard — the opening reads as depth */
  const yardGlowTex = canvasTexture(128, 128, (ctx, W, H2) => {
    const g = ctx.createLinearGradient(0, H2, 0, 0);
    g.addColorStop(0, 'rgba(255,205,150,0.9)');
    g.addColorStop(0.45, 'rgba(220,170,120,0.45)');
    g.addColorStop(1, 'rgba(120,100,110,0.02)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H2);
  });
  const spillFar = new THREE.Mesh(
    new THREE.PlaneGeometry(7.5, 5.4),
    new THREE.MeshBasicMaterial({
      map: yardGlowTex,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  (spillFar.material as THREE.MeshBasicMaterial).color.setRGB(2.3, 1.9, 1.4);
  spillFar.position.set(t1.x, 2.55, HALL.Z0 - 3);
  add(spillFar);

  return { parts, power: { redMat, greenMat, yardHeadMat: headMat, emergMat } };
}
