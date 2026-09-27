/* ------------------------------------------------------------------ */
/* Zone builds + atmosphere: visitor gallery (south), steel mezzanine  */
/* (east), placeholder volumes for Leitstand / Gefahrgut cage /        */
/* Pausenraum, emissive light strips (beat-pulsed), holo zone labels   */
/* and the local work lights. Details inside the volumes land in T-103 */
/* ------------------------------------------------------------------ */

import * as THREE from 'three';
import { GALLERY, MEZZ, LEITSTAND, CAGE, LOUNGE, RACKS, DOORS, COL } from '../layout';
import { GeoBatch, canvasTexture } from '../util';

export interface PulseTargets {
  acid: THREE.MeshBasicMaterial;
  cyan: THREE.MeshBasicMaterial;
  amber: THREE.MeshBasicMaterial;
  labels: THREE.SpriteMaterial[];
  beaconMat: THREE.MeshBasicMaterial;
  beaconLight: THREE.PointLight;
  labelSprites: THREE.Sprite[];
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
    ctx.fillText('LEITSTAND', 24, 40);
    ctx.fillStyle = 'rgba(180,255,57,0.7)';
    ctx.font = '14px "JetBrains Mono", monospace';
    ctx.fillText('-67% · 5 PROZESSE · 1.4', 280, 160);
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

export function buildDetails(scene: THREE.Scene): { parts: number; pulse: PulseTargets } {
  let parts = 0;
  const add = (o: THREE.Object3D) => {
    scene.add(o);
    parts++;
  };

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

  /* shared emissive materials — the pulse targets */
  const acidMat = new THREE.MeshBasicMaterial({ color: ACID.clone() });
  const cyanMat = new THREE.MeshBasicMaterial({ color: CYAN.clone().multiplyScalar(0.85) });
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

    /* acid strip under the gallery front edge */
    const strip = new GeoBatch();
    strip.box(w, 0.05, 0.05, cx, GALLERY.y - 0.32, GALLERY.z0 + 0.02);
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
    /* placeholder skill shelves on the deck, along the east wall */
    for (let k = 0; k < 3; k++) {
      const sx = MEZZ.x1 - 2.2;
      const sz = MEZZ.z0 + 4 + k * 8;
      g.box(0.9, 2.6, 3.2, sx, MEZZ.y + 1.3, sz);
    }
    add(g.mesh(deckMat, true, true));

    const strip = new GeoBatch();
    strip.box(0.06, 0.06, d, MEZZ.x0 + 0.05, MEZZ.y - 0.28, cz);
    strip.box(w, 0.06, 0.06, cx, MEZZ.y - 0.28, MEZZ.z0 + 0.05);
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
    /* console desks inside */
    g.box(3.6, 0.12, 0.9, cx - 2, fy + 0.78, cz + 1.5);
    g.box(0.12, 0.78, 0.9, cx - 3.6, fy + 0.39, cz + 1.5);
    g.box(0.12, 0.78, 0.9, cx - 0.4, fy + 0.39, cz + 1.5);
    g.box(3.6, 0.12, 0.9, cx + 2.4, fy + 0.78, cz - 1.8);
    g.box(0.12, 0.78, 0.9, cx + 0.8, fy + 0.39, cz - 1.8);
    g.box(0.12, 0.78, 0.9, cx + 4.0, fy + 0.39, cz - 1.8);
    add(g.mesh(darkSteel, true, true));

    /* glass walls on the two hall-facing sides */
    const gW = new THREE.Mesh(new THREE.PlaneGeometry(w, LEITSTAND.h - 0.3), glass);
    gW.rotation.y = Math.PI / 2;
    gW.position.set(LEITSTAND.x0 + 0.08, fy + LEITSTAND.h / 2, cz);
    add(gW);
    const gS = new THREE.Mesh(new THREE.PlaneGeometry(d, LEITSTAND.h - 0.3), glass);
    gS.position.set(cx, fy + LEITSTAND.h / 2, LEITSTAND.z0 + 0.08);
    add(gS);

    /* holo screen on the inner back wall */
    const screen = new THREE.Mesh(
      new THREE.PlaneGeometry(6.4, 2.4),
      new THREE.MeshBasicMaterial({ map: screenTexture() }),
    );
    screen.rotation.y = -Math.PI / 2;
    screen.position.set(LEITSTAND.x1 - 0.4, fy + 1.9, cz);
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

    /* ADR diamond plates on the fence */
    const adrMat = new THREE.MeshBasicMaterial({ color: 0xd97a1e });
    const adr = new GeoBatch();
    adr.box(0.34, 0.34, 0.03, cx - 3, 2.6, CAGE.z1 + 0.03);
    adr.box(0.34, 0.34, 0.03, cx + 3, 2.6, CAGE.z1 + 0.03);
    add(adr.mesh(adrMat, false, false));

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

    /* warm ceiling light panels + wall strip */
    const warm = new GeoBatch();
    warm.box(3.4, 0.06, 1.4, cx - 5, 3.1, cz - 1.5);
    warm.box(3.4, 0.06, 1.4, cx + 4, 3.1, cz + 1);
    warm.box(w - 1, 0.05, 0.05, cx, 2.95, LOUNGE.z1 - 0.22);
    add(warm.mesh(amberMat, false, false));

    /* sofa, table, DJ desk placeholder */
    const furn = new GeoBatch();
    furn.box(3.2, 0.45, 1.1, cx - 4, 0.42, cz + 1.8); // sofa seat
    furn.box(3.2, 0.65, 0.3, cx - 4, 0.75, cz + 2.3); // backrest
    furn.box(1.1, 0.45, 2.2, cx - 5.8, 0.42, cz + 0.2); // side seat
    furn.box(1.4, 0.4, 0.8, cx - 3.4, 0.2, cz - 0.4); // table
    furn.box(2.4, 0.95, 0.8, cx + 5, 0.48, LOUNGE.z1 - 1.2); // DJ desk
    furn.box(0.9, 1.4, 0.5, LOUNGE.x1 - 1.2, 0.7, cz + 2.2); // gym rack hint
    add(furn.mesh(fabric, true, true));

    /* glowing platter discs on the DJ desk */
    const platters = new GeoBatch();
    platters.cyl(0.28, 0.28, 0.04, 16, cx + 4.4, 0.98, LOUNGE.z1 - 1.2);
    platters.cyl(0.28, 0.28, 0.04, 16, cx + 5.6, 0.98, LOUNGE.z1 - 1.2);
    add(platters.mesh(amberMat, false, false));
  }

  /* ================= light strips along aisles + walkway ================= */
  {
    const strips = new GeoBatch();
    for (const ax of RACKS.aislesX) {
      strips.box(0.14, 0.05, RACKS.z1 - RACKS.z0 - 1, ax, 11.85, (RACKS.z0 + RACKS.z1) / 2);
    }
    strips.box(92, 0.06, 0.06, -12, 8.2, 27.6); // south walkway strip
    add(strips.mesh(acidMat, false, false));

    const cyanStrips = new GeoBatch();
    cyanStrips.box(54, 0.05, 0.05, 5, 9.6, -13.2); // north loop line, cyan
    cyanStrips.box(0.05, 0.05, 26, 32.2, 9.2, 0); // east spine
    add(cyanStrips.mesh(cyanMat, false, false));
  }

  /* ================= local work lights ================= */
  for (const ax of RACKS.aislesX) {
    const spot = new THREE.SpotLight(0xc9ff70, 380, 34, 0.62, 0.65, 1.8);
    spot.position.set(ax, 12.2, 0);
    spot.target.position.set(ax, 0, 0);
    scene.add(spot, spot.target);
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

  /* ================= holo zone labels ================= */
  const labels: THREE.SpriteMaterial[] = [];
  const labelSprites: THREE.Sprite[] = [];
  const mk = (text: string, color: THREE.Color, x: number, y: number, z: number) => {
    const { sprite, mat } = labelSprite(text, color, x, y, z);
    labels.push(mat);
    labelSprites.push(sprite);
    add(sprite);
  };
  mk('01 · BOOT', ACID, -38, 8.6, 26);
  mk('02 · PROOF', CYAN, 47, 8.6, 21.5);
  mk('03 · LOG', ACID, -49.6, 13.6, 12);
  mk('04 · WORK', CYAN, 6, 10.2, 0);
  mk('05 · STACK', ACID, 46, 10.8, 12);
  mk('06 · BEYOND', AMBER, -45, 7.6, 24.5);
  mk('07 · DOCK', AMBER, -50, 8.2, -26.5);

  return {
    parts,
    pulse: { acid: acidMat, cyan: cyanMat, amber: amberMat, labels, beaconMat, beaconLight, labelSprites },
  };
}
