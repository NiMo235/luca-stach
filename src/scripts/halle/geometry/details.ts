/* ------------------------------------------------------------------ */
/* Zone builds + atmosphere: visitor gallery (south), steel mezzanine  */
/* (east), placeholder volumes for Leitstand / Gefahrgut cage /        */
/* Pausenraum, emissive light strips (beat-pulsed), holo zone labels   */
/* and the local work lights. Details inside the volumes land in T-103 */
/* ------------------------------------------------------------------ */

import * as THREE from 'three';
import { GALLERY, MEZZ, LEITSTAND, CAGE, LOUNGE, RACKS, DOORS, HALL, COL, HOTSPOTS } from '../layout';
import { GeoBatch, canvasTexture, rng } from '../util';

export interface PulseTargets {
  acid: THREE.MeshBasicMaterial;
  cyan: THREE.MeshBasicMaterial;
  amber: THREE.MeshBasicMaterial;
  labels: THREE.SpriteMaterial[];
  beaconMat: THREE.MeshBasicMaterial;
  beaconLight: THREE.PointLight;
  labelSprites: THREE.Sprite[];
}

/* light/material handles the power-up sequence (power.ts) dims up */
export interface PowerHandles {
  aisleSpots: THREE.SpotLight[];
  coolSpots: THREE.SpotLight[];
  loungeLight: THREE.PointLight;
  leitstandLight: THREE.PointLight;
  doorGlow: THREE.PointLight;
  yardGlow: THREE.PointLight;
  coneMat: THREE.MeshBasicMaterial;
  poolMat: THREE.MeshBasicMaterial;
  monMat: THREE.MeshBasicMaterial;
  screenMat: THREE.MeshBasicMaterial;
}

const ACID = new THREE.Color(COL.acid);
const CYAN = new THREE.Color(COL.cyan);
const AMBER = new THREE.Color(COL.amber);

/* chain-link fence texture for the Gefahrgut cage */
function fenceTexture(): THREE.CanvasTexture {
  return canvasTexture(128, 128, (ctx, W, H) => {
    ctx.clearRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(150,160,165,0.9)';
    ctx.lineWidth = 2;
    for (let i = -H; i < W + H; i += 16) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i + H, H);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(i + H, 0);
      ctx.lineTo(i, H);
      ctx.stroke();
    }
  });
}

/* static holo screen content for the Leitstand placeholder */
function screenTexture(): THREE.CanvasTexture {
  return canvasTexture(512, 192, (ctx, W, H) => {
    ctx.fillStyle = '#04110f';
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(125,255,216,0.8)';
    ctx.lineWidth = 2;
    ctx.strokeRect(6, 6, W - 12, H - 12);
    const bars = [0.62, 0.33, 0.78, 0.45, 0.9, 0.55, 0.7];
    bars.forEach((b, i) => {
      ctx.fillStyle = i % 3 === 0 ? 'rgba(180,255,57,0.85)' : 'rgba(125,255,216,0.55)';
      ctx.fillRect(24 + i * 34, H - 26 - b * 120, 20, b * 120);
    });
    ctx.strokeStyle = 'rgba(125,255,216,0.5)';
    ctx.beginPath();
    for (let x = 0; x <= 24; x++) {
      const px = 280 + x * 9;
      const py = 96 - Math.sin(x * 0.55) * 34 - x * 1.2;
      if (x === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
    ctx.font = '700 22px "JetBrains Mono", monospace';
    ctx.fillStyle = 'rgba(125,255,216,0.9)';
    ctx.fillText('CTRL · 02', 24, 40);
    ctx.fillStyle = 'rgba(180,255,57,0.7)';
    ctx.font = '14px "JetBrains Mono", monospace';
    ctx.fillText('-67% · 5 · 1.4', 280, 160);
  });
}

function labelSprite(text: string, color: THREE.Color, x: number, y: number, z: number): {
  sprite: THREE.Sprite;
  mat: THREE.SpriteMaterial;
} {
  const tex = canvasTexture(512, 128, (ctx, W, H) => {
    ctx.clearRect(0, 0, W, H);
    const css = `#${color.getHexString()}`;
    ctx.fillStyle = css;
    ctx.fillRect(18, 30, 26, 26);
    ctx.font = '700 52px "JetBrains Mono", monospace';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = css;
    ctx.shadowBlur = 18;
    ctx.fillText(text, 66, 46);
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 0.55;
    ctx.fillRect(66, 84, W - 100, 3);
  });
  const mat = new THREE.SpriteMaterial({
    map: tex,
    transparent: true,
    opacity: 0.85,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(7.6, 1.9, 1);
  sprite.position.set(x, y, z);
  return { sprite, mat };
}

/* small operator monitor: dark glass, cyan waveform + bars */
function monitorTexture(): THREE.CanvasTexture {
  return canvasTexture(128, 96, (ctx, W, H) => {
    ctx.fillStyle = '#061312';
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(125,255,216,0.75)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let x = 0; x <= 20; x++) {
      const px = 8 + x * 5.6;
      const py = 60 - Math.sin(x * 0.9) * 18 - x * 0.6;
      if (x === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
    ctx.fillStyle = 'rgba(180,255,57,0.75)';
    for (let k = 0; k < 5; k++) ctx.fillRect(10 + k * 9, 78 - k * 4, 5, k * 4 + 4);
    ctx.fillStyle = 'rgba(125,255,216,0.5)';
    ctx.fillRect(8, 8, 40, 5);
  });
}

export function buildDetails(scene: THREE.Scene): { parts: number; pulse: PulseTargets; power: PowerHandles } {
  let parts = 0;
  const add = (o: THREE.Object3D) => {
    scene.add(o);
    parts++;
  };
  /* refs the power-up sequence needs (filled below) */
  const power = {} as PowerHandles;

  const steel = new THREE.MeshStandardMaterial({ color: 0x39424a, metalness: 0.85, roughness: 0.42 });
  const darkSteel = new THREE.MeshStandardMaterial({ color: 0x22282e, metalness: 0.8, roughness: 0.5 });
  const deckMat = new THREE.MeshStandardMaterial({ color: 0x2a3036, metalness: 0.7, roughness: 0.55 });
  const glass = new THREE.MeshPhysicalMaterial({
    color: 0x9fd8e8,
    transparent: true,
    opacity: 0.16,
    roughness: 0.08,
    metalness: 0,
    side: THREE.DoubleSide,
  });
  const fabric = new THREE.MeshStandardMaterial({ color: 0x2e3336, roughness: 0.95 });

  /* shared emissive materials — the pulse targets. Acid runs at ~50%
     base intensity: an accent, not a key light (round-2 feedback) */
  const acidMat = new THREE.MeshBasicMaterial({ color: ACID.clone().multiplyScalar(0.5) });
  const cyanMat = new THREE.MeshBasicMaterial({ color: CYAN.clone().multiplyScalar(0.55) });
  const amberMat = new THREE.MeshBasicMaterial({ color: AMBER.clone() });

  /* ================= visitor gallery (south, BOOT) ================= */
  {
    const w = GALLERY.x1 - GALLERY.x0;
    const d = GALLERY.z1 - GALLERY.z0;
    const cx = (GALLERY.x0 + GALLERY.x1) / 2;
    const cz = (GALLERY.z0 + GALLERY.z1) / 2;
    const g = new GeoBatch();
    g.box(w, 0.28, d, cx, GALLERY.y - 0.14, cz); // deck slab
    g.box(w, 0.3, 0.22, cx, GALLERY.y - 0.3, GALLERY.z0 + 0.1); // front edge beam
    for (let x = GALLERY.x0 + 2; x <= GALLERY.x1 - 1; x += 6) {
      g.box(0.22, GALLERY.y, 0.22, x, GALLERY.y / 2, cz); // support columns
    }
    /* stairs down at the east end */
    for (let s = 0; s < 10; s++) {
      g.box(1.6, 0.14, 1.1, GALLERY.x1 + 0.8 + s * 0.62, GALLERY.y - 0.4 - s * 0.4, cz);
    }
    add(g.mesh(steel, true, true));

    const rail = new GeoBatch();
    rail.box(w, 0.06, 0.08, cx, GALLERY.y + 1.12, GALLERY.z0 + 0.06); // handrail
    add(rail.mesh(darkSteel, false, false));

    const balustrade = new THREE.Mesh(new THREE.PlaneGeometry(w, 1.05), glass);
    balustrade.position.set(cx, GALLERY.y + 0.56, GALLERY.z0 + 0.06);
    add(balustrade);

    /* acid strip under the gallery front edge — only the eastern part:
       the BOOT viewpoint hovers right above the west end, where even a
       thin strip reads as a glaring beam across the frame */
    const strip = new GeoBatch();
    strip.box(12, 0.035, 0.035, GALLERY.x1 - 6, GALLERY.y - 0.32, GALLERY.z0 + 0.02);
    add(strip.mesh(acidMat, false, false));
  }

  /* ================= mezzanine (east, STACK) ================= */
  {
    const w = MEZZ.x1 - MEZZ.x0;
    const d = MEZZ.z1 - MEZZ.z0;
    const cx = (MEZZ.x0 + MEZZ.x1) / 2;
    const cz = (MEZZ.z0 + MEZZ.z1) / 2;
    const g = new GeoBatch();
    g.box(w, 0.22, d, cx, MEZZ.y - 0.11, cz); // deck
    for (let x = MEZZ.x0 + 1; x <= MEZZ.x1 - 1; x += 7) {
      for (let z = MEZZ.z0 + 1; z <= MEZZ.z1 - 1; z += 8.5) {
        g.box(0.2, MEZZ.y, 0.2, x, MEZZ.y / 2, z);
      }
    }
    /* railing on the open edges (west, north, south) */
    const rail = (x0: number, z0: number, x1: number, z1: number) => {
      const len = Math.hypot(x1 - x0, z1 - z0);
      const ang = Math.atan2(x1 - x0, z1 - z0);
      for (const h of [0.5, 0.85, 1.15]) {
        g.box(0.045, 0.045, len, (x0 + x1) / 2, MEZZ.y + h, (z0 + z1) / 2, ang);
      }
      const n = Math.floor(len / 2);
      for (let k = 0; k <= n; k++) {
        g.box(0.05, 1.15, 0.05, x0 + ((x1 - x0) * k) / n, MEZZ.y + 0.58, z0 + ((z1 - z0) * k) / n, ang);
      }
    };
    rail(MEZZ.x0, MEZZ.z0, MEZZ.x0, MEZZ.z1);
    rail(MEZZ.x0, MEZZ.z0, MEZZ.x1, MEZZ.z0);
    rail(MEZZ.x0, MEZZ.z1, MEZZ.x1, MEZZ.z1);
    /* stair down at the southwest corner */
    for (let s = 0; s < 12; s++) {
      g.box(1.4, 0.13, 1.0, MEZZ.x0 - 0.7 - s * 0.58, MEZZ.y - 0.45 - s * 0.5, MEZZ.z0 + 3);
    }
    /* skill shelves are built by zones.ts (T-103) with bins + fills */
    add(g.mesh(deckMat, true, true));

    /* acid strip under the deck — only the north run; the west-edge
       strip crossed the PROOF frame as a glaring horizontal bar */
    const strip = new GeoBatch();
    strip.box(w, 0.04, 0.04, cx, MEZZ.y - 0.28, MEZZ.z0 + 0.05);
    add(strip.mesh(acidMat, false, false));
  }

  /* ================= Leitstand (east, PROOF) ================= */
  {
    const w = LEITSTAND.x1 - LEITSTAND.x0;
    const d = LEITSTAND.z1 - LEITSTAND.z0;
    const cx = (LEITSTAND.x0 + LEITSTAND.x1) / 2;
    const cz = (LEITSTAND.z0 + LEITSTAND.z1) / 2;
    const fy = LEITSTAND.floorY;
    const g = new GeoBatch();
    g.box(w, 0.25, d, cx, fy - 0.12, cz); // floor slab
    g.box(w, 0.2, d, cx, fy + LEITSTAND.h, cz); // roof slab
    for (const [px, pz] of [
      [LEITSTAND.x0 + 0.4, LEITSTAND.z0 + 0.4],
      [LEITSTAND.x1 - 0.4, LEITSTAND.z0 + 0.4],
      [LEITSTAND.x0 + 0.4, LEITSTAND.z1 - 0.4],
      [LEITSTAND.x1 - 0.4, LEITSTAND.z1 - 0.4],
    ]) {
      g.box(0.28, fy, 0.28, px, fy / 2, pz);
    }
    /* two operator desks in a half-round facing the big holo screen
       (east wall); screens face west so the PROOF camera reads the
       glowing fronts through the glass */
    const desks: Array<{ cx: number; cz: number; ry: number; mons: number }> = [
      { cx: cx - 0.8, cz: cz - 1.9, ry: 0.42, mons: 3 },
      { cx: cx - 0.8, cz: cz + 1.9, ry: -0.42, mons: 4 },
    ];
    for (const d of desks) {
      g.box(2.9, 0.1, 0.85, d.cx, fy + 0.78, d.cz, d.ry); // top
      for (const s of [-1.15, 1.15]) {
        const lx = d.cx + Math.cos(d.ry) * s;
        const lz = d.cz - Math.sin(d.ry) * s;
        g.box(0.1, 0.78, 0.7, lx, fy + 0.39, lz, d.ry); // leg panel
      }
      /* modesty shelf under the top */
      g.box(2.4, 0.06, 0.5, d.cx, fy + 0.42, d.cz, d.ry);
    }
    add(g.mesh(darkSteel, true, true));

    /* operator monitors: 7 screens across the two desks (canvas texture
       with charts/queues, language-neutral), riding the Leitstand power
       group */
    const monTex = monitorTexture();
    const monMat = new THREE.MeshBasicMaterial({ map: monTex });
    monMat.color.setScalar(1.25); // lift past ACES compression a touch
    power.monMat = monMat;
    const monScreens = new GeoBatch();
    const monStands = new GeoBatch();
    for (const d of desks) {
      for (let k = 0; k < d.mons; k++) {
        const off = (k - (d.mons - 1) / 2) * 0.78;
        const mx = d.cx + Math.cos(d.ry) * off;
        const mz = d.cz - Math.sin(d.ry) * off;
        const mry = -Math.PI / 2 + d.ry;
        const pg = new THREE.PlaneGeometry(0.72, 0.46);
        monScreens.add(pg, mx, fy + 1.26, mz, mry);
        monStands.box(0.06, 0.24, 0.06, mx, fy + 0.94, mz);
        monStands.box(0.3, 0.03, 0.2, mx, fy + 0.83, mz);
      }
    }
    add(monScreens.mesh(monMat, false, false));
    add(monStands.mesh(darkSteel, false, false));

    /* glass walls on the two hall-facing sides */
    const gW = new THREE.Mesh(new THREE.PlaneGeometry(w, LEITSTAND.h - 0.3), glass);
    gW.rotation.y = Math.PI / 2;
    gW.position.set(LEITSTAND.x0 + 0.08, fy + LEITSTAND.h / 2, cz);
    add(gW);
    const gS = new THREE.Mesh(new THREE.PlaneGeometry(d, LEITSTAND.h - 0.3), glass);
    gS.position.set(cx, fy + LEITSTAND.h / 2, LEITSTAND.z0 + 0.08);
    add(gS);

    /* holo screen on the inner back wall — larger + brighter, it is
       the PROOF motif */
    const screenMat = new THREE.MeshBasicMaterial({ map: screenTexture() });
    screenMat.color.setScalar(1.45);
    power.screenMat = screenMat;
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(8.2, 3.0), screenMat);
    screen.rotation.y = -Math.PI / 2;
    screen.position.set(LEITSTAND.x1 - 0.4, fy + 2.05, cz);
    add(screen);

    /* cyan trim under the roof slab */
    const strip = new GeoBatch();
    strip.box(w, 0.05, 0.05, cx, fy + LEITSTAND.h - 0.15, LEITSTAND.z0 + 0.05);
    strip.box(0.05, 0.05, d, LEITSTAND.x0 + 0.05, fy + LEITSTAND.h - 0.15, cz);
    add(strip.mesh(cyanMat, false, false));
  }

  /* ================= Gefahrgut cage (northeast) ================= */
  const beaconMat = new THREE.MeshBasicMaterial({ color: 0xff3524 });
  {
    const w = CAGE.x1 - CAGE.x0;
    const d = CAGE.z1 - CAGE.z0;
    const cx = (CAGE.x0 + CAGE.x1) / 2;
    const cz = (CAGE.z0 + CAGE.z1) / 2;
    const fenceMat = new THREE.MeshStandardMaterial({
      map: fenceTexture(),
      transparent: true,
      alphaTest: 0.35,
      side: THREE.DoubleSide,
      metalness: 0.6,
      roughness: 0.5,
      color: 0x9aa4a9,
    });
    fenceMat.map!.repeat.set(w / 2, 2);
    fenceMat.map!.wrapS = fenceMat.map!.wrapT = THREE.RepeatWrapping;
    const mkFence = (len: number, x: number, z: number, ry: number) => {
      const f = new THREE.Mesh(new THREE.PlaneGeometry(len, 4), fenceMat);
      f.rotation.y = ry;
      f.position.set(x, 2, z);
      add(f);
    };
    mkFence(w, cx, CAGE.z0, 0);
    mkFence(w, cx, CAGE.z1, 0);
    mkFence(d, CAGE.x0, cz, Math.PI / 2);
    mkFence(d, CAGE.x1, cz, Math.PI / 2);

    const posts = new GeoBatch();
    for (const [px, pz] of [
      [CAGE.x0, CAGE.z0],
      [CAGE.x1, CAGE.z0],
      [CAGE.x0, CAGE.z1],
      [CAGE.x1, CAGE.z1],
      [cx, CAGE.z0],
      [cx, CAGE.z1],
    ]) {
      posts.box(0.12, 4.2, 0.12, px, 2.1, pz);
    }
    add(posts.mesh(darkSteel, true, false));

    /* stored drums + IBCs inside */
    const stock = new GeoBatch();
    for (let k = 0; k < 6; k++) {
      const px = CAGE.x0 + 2 + (k % 3) * 4.2;
      const pz = CAGE.z0 + 3 + Math.floor(k / 3) * 3.6;
      stock.box(1.1, 0.15, 1.1, px, 0.08, pz);
      for (let b = 0; b < 4; b++) {
        stock.cyl(0.31, 0.31, 0.88, 9, px - 0.26 + (b % 2) * 0.52, 0.6, pz - 0.26 + ((b >> 1) % 2) * 0.52);
      }
    }
    stock.box(1.2, 1.15, 1.0, CAGE.x1 - 2.4, 0.58, CAGE.z0 + 2.6); // IBC
    stock.box(1.2, 1.15, 1.0, CAGE.x1 - 2.4, 0.58, CAGE.z0 + 4.4);
    const drumMat = new THREE.MeshStandardMaterial({ color: 0x39577e, metalness: 0.35, roughness: 0.5 });
    add(stock.mesh(drumMat, true, true));

    /* legible ADR/GHS diamonds + trays + shower: zones.ts (T-103) */

    /* beacon pole — the material/light blink in the update loop */
    const pole = new GeoBatch();
    pole.cyl(0.05, 0.06, 4.6, 6, CAGE.x0 + 0.6, 2.3, CAGE.z1 - 0.6);
    add(pole.mesh(darkSteel, false, false));
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), beaconMat);
    bulb.position.set(CAGE.x0 + 0.6, 4.7, CAGE.z1 - 0.6);
    add(bulb);
  }
  const beaconLight = new THREE.PointLight(0xff3524, 0, 22, 2);
  beaconLight.position.set(CAGE.x0 + 0.6, 4.7, CAGE.z1 - 0.6);
  scene.add(beaconLight);

  /* ================= Pausenraum (southwest, BEYOND) ================= */
  {
    const w = LOUNGE.x1 - LOUNGE.x0;
    const d = LOUNGE.z1 - LOUNGE.z0;
    const cx = (LOUNGE.x0 + LOUNGE.x1) / 2;
    const cz = (LOUNGE.z0 + LOUNGE.z1) / 2;
    const walls = new GeoBatch();
    walls.box(w, 3.1, 0.18, cx, 1.55, LOUNGE.z1 - 0.1); // south inner wall
    walls.box(0.18, 3.1, d, LOUNGE.x1 - 0.1, 1.55, cz); // east inner wall
    walls.box(w, 0.18, d, cx, 3.2, cz); // flat roof
    add(walls.mesh(new THREE.MeshStandardMaterial({ color: 0x4a4438, roughness: 0.9 }), true, true));

    /* warm ceiling light panels — pushed to the west half so the
       BEYOND camera reads them as light islands with depth, not as a
       lampshade glued to the lens + wall strip */
    const warm = new GeoBatch();
    warm.box(3.4, 0.06, 1.4, -52.5, 3.1, 23.2);
    warm.box(3.4, 0.06, 1.4, -46.5, 3.1, 26.6);
    warm.box(w - 1, 0.05, 0.05, cx, 2.95, LOUNGE.z1 - 0.22);
    add(warm.mesh(amberMat, false, false));

    /* sofa, table (DJ pult + gym move to zones.ts, T-103) */
    const furn = new GeoBatch();
    furn.box(3.2, 0.45, 1.1, cx - 4, 0.42, cz + 1.8); // sofa seat
    furn.box(3.2, 0.65, 0.3, cx - 4, 0.75, cz + 2.3); // backrest
    furn.box(1.1, 0.45, 2.2, cx - 5.8, 0.42, cz + 0.2); // side seat
    furn.box(1.4, 0.4, 0.8, cx - 3.4, 0.2, cz - 0.4); // table
    /* record shelf on the south wall + low bench near the east wall */
    furn.box(4.2, 1.5, 0.35, -51, 0.95, 28.5);
    furn.box(4.0, 0.04, 0.28, -51, 0.7, 28.48);
    furn.box(4.0, 0.04, 0.28, -51, 1.2, 28.48);
    furn.box(2.2, 0.5, 0.6, -36, 0.25, 27.5);
    add(furn.mesh(fabric, true, true));

    /* vinyl rows on the shelf — small acid/amber spines */
    const vinyl = new GeoBatch();
    for (let k = 0; k < 12; k++) {
      vinyl.box(0.24, 0.3, 0.05, -52.6 + k * 0.29, 1.36, 28.42);
    }
    add(vinyl.mesh(cyanMat, false, false));

    /* floor lamp in the west corner — warm glow dot */
    const lampPole = new GeoBatch();
    lampPole.cyl(0.03, 0.05, 1.5, 6, -55.5, 0.75, 27.8);
    add(lampPole.mesh(darkSteel, false, false));
    const lampDot = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), amberMat);
    lampDot.position.set(-55.5, 1.58, 27.8);
    add(lampDot);

    /* glowing platter discs on the DJ desk are part of the 4-deck
       pult in zones.ts (T-103) */
  }

  /* ================= light strips — always mounted ON structure =====
     (floating mid-air lines read as rendering bugs) */
  {
    const strips = new GeoBatch();
    for (const ax of RACKS.aislesX) {
      /* mounted on top of the rack top beams (beam top ≈ 11.07), thin
         and shortened to the northern aisle half — the south end came
         too close to the BOOT viewpoint and read as a glare beam */
      strips.box(0.09, 0.045, 18, ax, 11.12, -5);
    }
    /* wall-mounted strip above the south walkway — thin, it runs
       right past the BOOT viewpoint */
    strips.box(92, 0.04, 0.04, -12, 7.6, 29.66);
    add(strips.mesh(acidMat, false, false));

    const cyanStrips = new GeoBatch();
    /* slung under the cable tray at z = -6 (tray underside ≈ 12.5) */
    cyanStrips.box(54, 0.05, 0.05, 5, 12.4, -6.42);
    /* wall-mounted on the east wall, above the mezzanine */
    cyanStrips.box(0.05, 0.07, 24, 59.66, 8.4, 14);
    add(cyanStrips.mesh(cyanMat, false, false));
  }

  /* ================= high-bay luminaires: fixtures + fake volumetrics
     + light pools on the floor ================= */
  {
    /* lamp positions: above the three rack aisles, the crossing and
       the dock approach — matches the spot lights below */
    const lamps: Array<[number, number]> = [];
    for (const ax of RACKS.aislesX) {
      for (const z of [-10, 0, 10]) lamps.push([ax, z]);
    }
    lamps.push([10, 0], [-14, 0], [-38, -22], [-50, -22], [47, 22]); // last one: cone over the Leitstand

    const fixGeo = new THREE.CylinderGeometry(0.42, 0.34, 0.28, 10);
    const fixMat = new THREE.MeshStandardMaterial({ color: 0x2a2f35, metalness: 0.8, roughness: 0.4 });
    const fixtures = new THREE.InstancedMesh(fixGeo, fixMat, lamps.length);
    const lensGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.05, 10);
    const lenses = new THREE.InstancedMesh(lensGeo, acidMat, lamps.length);
    const m4 = new THREE.Matrix4();
    lamps.forEach(([x, z], i) => {
      m4.makeTranslation(x, 12.3, z);
      fixtures.setMatrixAt(i, m4);
      m4.makeTranslation(x, 12.14, z);
      lenses.setMatrixAt(i, m4);
    });
    fixtures.instanceMatrix.needsUpdate = true;
    lenses.instanceMatrix.needsUpdate = true;
    add(fixtures);
    add(lenses);

    /* fake light cones: additive, soft-edged via vertex-alpha texture */
    const coneTex = canvasTexture(64, 128, (ctx, W, H) => {
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, 'rgba(255,255,255,0.55)');
      g.addColorStop(0.6, 'rgba(255,255,255,0.14)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    });
    const coneMat = new THREE.MeshBasicMaterial({
      map: coneTex,
      color: 0x9fb872,
      transparent: true,
      opacity: 0.16,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
    });
    power.coneMat = coneMat;
    const coneGeo = new THREE.CylinderGeometry(0.34, 3.6, 12.1, 12, 1, true);
    /* remap uv so v=1 (bright) is at the top of the cone */
    const cones = new THREE.InstancedMesh(coneGeo, coneMat, lamps.length);
    lamps.forEach(([x, z], i) => {
      m4.makeTranslation(x, 6.1, z);
      cones.setMatrixAt(i, m4);
    });
    cones.instanceMatrix.needsUpdate = true;
    add(cones);

    /* warm pools of light on the floor under each lamp */
    const poolTex = canvasTexture(128, 128, (ctx, W, H) => {
      const g = ctx.createRadialGradient(W / 2, H / 2, 4, W / 2, H / 2, W / 2);
      g.addColorStop(0, 'rgba(255,255,255,0.5)');
      g.addColorStop(0.55, 'rgba(255,255,255,0.16)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    });
    const poolMat = new THREE.MeshBasicMaterial({
      map: poolTex,
      color: 0x8aa056,
      transparent: true,
      opacity: 0.5,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    power.poolMat = poolMat;
    const pools = new THREE.InstancedMesh(new THREE.PlaneGeometry(9.5, 9.5), poolMat, lamps.length);
    const qFlat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
    const P = new THREE.Vector3();
    const ONE = new THREE.Vector3(1, 1, 1);
    lamps.forEach(([x, z], i) => {
      P.set(x, 0.03, z);
      m4.compose(P, qFlat, ONE);
      pools.setMatrixAt(i, m4);
    });
    pools.instanceMatrix.needsUpdate = true;
    add(pools);
  }

  /* ================= fake AO: soft contact-shadow decals =============
     one instanced quad with a radial black gradient, stretched under
     racks, gallery, mezzanine, Leitstand, cage, doors and pallets */
  {
    const aoTex = canvasTexture(128, 128, (ctx, W, H) => {
      const g = ctx.createRadialGradient(W / 2, H / 2, 6, W / 2, H / 2, W / 2);
      g.addColorStop(0, 'rgba(255,255,255,0.85)');
      g.addColorStop(0.7, 'rgba(255,255,255,0.35)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    });
    const aoMat = new THREE.MeshBasicMaterial({
      map: aoTex,
      color: 0x000000,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
    });
    const blobs: Array<[number, number, number, number]> = []; // x, z, sx, sz
    for (const rx of RACKS.rowsX) {
      blobs.push([rx, (RACKS.z0 + RACKS.z1) / 2, RACKS.depth + 2.4, RACKS.z1 - RACKS.z0 + 2.5]);
    }
    blobs.push([-39, 26.8, 36, 6.5]); // visitor gallery
    blobs.push([47, 15, 24, 28]); // mezzanine footprint
    blobs.push([47, 22, 16, 12]); // Leitstand
    blobs.push([51, -24, 15.5, 11.5]); // Gefahrgut cage
    blobs.push([-45.5, 24.75, 26, 9.5]); // Pausenraum
    for (const d of DOORS) blobs.push([d.x, HALL.Z0 + 1.2, d.w + 2.5, 4]);
    /* staged floor pallets at the rack front */
    const rndAO = rng(77);
    for (let k = 0; k < 14; k++) blobs.push([-36 + rndAO() * 7, -8 + rndAO() * 20, 2.2, 2.6]);

    const ao = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), aoMat, blobs.length);
    const qFlat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
    const m4 = new THREE.Matrix4();
    const P = new THREE.Vector3();
    const SC = new THREE.Vector3();
    blobs.forEach(([x, z, sx, sz], i) => {
      P.set(x, 0.02, z);
      SC.set(sx, sz, 1);
      m4.compose(P, qFlat, SC);
      ao.setMatrixAt(i, m4);
    });
    ao.instanceMatrix.needsUpdate = true;
    add(ao);
  }

  /* ================= local work lights ================= */
  const aisleSpots: THREE.SpotLight[] = [];
  for (const ax of RACKS.aislesX) {
    const spot = new THREE.SpotLight(0xc9ff70, 540, 36, 0.66, 0.6, 1.7);
    spot.position.set(ax, 12.2, 0);
    spot.target.position.set(ax, 0, 0);
    scene.add(spot, spot.target);
    aisleSpots.push(spot);
  }
  /* cool wash over the WORK crossing — contrast to the acid aisles */
  const coolSpots: THREE.SpotLight[] = [];
  for (const [x, z] of [
    [10, 0],
    [-14, 0],
  ]) {
    const cool = new THREE.SpotLight(0x9fc4ff, 330, 40, 0.72, 0.7, 1.7);
    cool.position.set(x, 12.4, z);
    cool.target.position.set(x, 0, z);
    scene.add(cool, cool.target);
    coolSpots.push(cool);
  }
  const loungeLight = new THREE.PointLight(COL.amber, 75, 24, 1.9);
  loungeLight.position.set((LOUNGE.x0 + LOUNGE.x1) / 2, 2.9, (LOUNGE.z0 + LOUNGE.z1) / 2);
  scene.add(loungeLight);
  const leitstandLight = new THREE.PointLight(COL.cyan, 80, 22, 1.9);
  leitstandLight.position.set((LEITSTAND.x0 + LEITSTAND.x1) / 2 - 2, LEITSTAND.floorY + 2.4, (LEITSTAND.z0 + LEITSTAND.z1) / 2);
  scene.add(leitstandLight);
  /* cold spill from the yard through the open TOR 1 */
  const doorGlow = new THREE.PointLight(0xffc98a, 42, 24, 1.8);
  doorGlow.position.set(DOORS[0].x, 3.4, -28);
  scene.add(doorGlow);
  /* …and a warm yard light outside, so truck + asphalt read through the opening */
  const yardGlow = new THREE.PointLight(0xffc98a, 90, 34, 1.8);
  yardGlow.position.set(DOORS[0].x - 4, 5.5, -37);
  scene.add(yardGlow);

  /* ================= holo zone labels (positions shared with the
     interactive hotspot markers, hotspots.ts) ================= */
  const labels: THREE.SpriteMaterial[] = [];
  const labelSprites: THREE.Sprite[] = [];
  const mk = (text: string, color: THREE.Color, x: number, y: number, z: number) => {
    const { sprite, mat } = labelSprite(text, color, x, y, z);
    labels.push(mat);
    labelSprites.push(sprite);
    add(sprite);
  };
  const LABEL_TEXTS = ['01 · BOOT', '02 · PROOF', '03 · LOG', '04 · WORK', '05 · STACK', '06 · BEYOND', '07 · DOCK'];
  const LABEL_COLS = [ACID, CYAN, ACID, CYAN, ACID, AMBER, AMBER];
  HOTSPOTS.forEach((h, i) => mk(LABEL_TEXTS[i], LABEL_COLS[i], h.x, h.y, h.z));

  return {
    parts,
    pulse: { acid: acidMat, cyan: cyanMat, amber: amberMat, labels, beaconMat, beaconLight, labelSprites },
    power: Object.assign(power, {
      aisleSpots,
      coolSpots,
      loungeLight,
      leitstandLight,
      doorGlow,
      yardGlow,
    }),
  };
}
