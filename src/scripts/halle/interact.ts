/* ------------------------------------------------------------------ */
/* T-104 — die Inhalte werden interaktiv. Vier kausale Abläufe in der  */
/* Halle, jeder mit einem zugänglichen DOM-Zwilling im Panel:          */
/*                                                                     */
/*   LOG   5 Lebensstationen als Paletten im Regalgang B; Tap holt die */
/*         Palette per Shuttle auf die Präsentationsbühne und hebt den */
/*         Eintrag im LOG-Panel hervor.                                */
/*   PROOF Holo-Schalter MANUELL | PIPELINE am Leitstand + ROI-Event   */
/*         steuert Ankunftsrate/Bearbeitungszeit der Angebots-Sim.     */
/*   WORK  Scanner-Portal schaltet die Fehlerquote durch (5/18/35 %);  */
/*         ausgeleitete Pakete stapeln sich am Abstellgleis.           */
/*   DOCK  MAIL/IN/CV-Paletten vor TOR 1: Tap löst die echte Aktion    */
/*         SYNCHRON im Tap-Handler aus (Popup-Blocker!), danach läuft  */
/*         die Verlade-Animation (AGV → LKW → Signal grün → Abfahrt).  */
/*                                                                     */
/* Der DOM bleibt die Quelle der Wahrheit: hrefs/Dateinamen werden aus */
/* den bestehenden Contact-Links gelesen, Panels bleiben voll bedien-  */
/* bar. Dieses Modul ist reine Zusatz-Ebene.                           */
/* ------------------------------------------------------------------ */

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Sim } from './sim/world';
import type { PackSim } from './sim/packages';
import { COL, DOORS, RACKS, LEITSTAND } from './layout';
import type { DockSignal } from './geometry/zones';
import { canvasTexture } from './util';

/* raycast-only hit volumes: opacity 0 renders nothing but still hits */
const HIT_MAT = new THREE.MeshBasicMaterial({
  transparent: true,
  opacity: 0,
  depthWrite: false,
  colorWrite: false,
});

function palletGeometry(): THREE.BufferGeometry {
  const deck = new THREE.BoxGeometry(1.15, 0.12, 0.95);
  deck.translate(0, 0.06, 0);
  const load = new THREE.BoxGeometry(1.0, 0.52, 0.82);
  load.translate(0, 0.38, 0);
  return mergeGeometries([deck, load])!;
}

function labelPlane(text: string, w: number, h: number, color = '#b4ff39'): THREE.Mesh {
  const tex = labelTexture(text, color);
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide }),
  );
  return m;
}

function labelTexture(text: string, color: string): THREE.CanvasTexture {
  return canvasTexture(256, 64, (ctx, W, H) => {
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(6,10,8,0.78)';
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.9;
    ctx.lineWidth = 3;
    ctx.strokeRect(3, 3, W - 6, H - 6);
    ctx.globalAlpha = 1;
    ctx.fillStyle = color;
    ctx.font = '700 30px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, W / 2, H / 2 + 1);
  });
}

function textSprite(text: string, color: string, w = 1.9, h = 0.48): THREE.Sprite {
  const mat = new THREE.SpriteMaterial({
    map: labelTexture(text, color),
    transparent: true,
    depthWrite: false,
  });
  const s = new THREE.Sprite(mat);
  s.scale.set(w, h, 1);
  return s;
}

export interface InteractCtx {
  scene: THREE.Scene;
  sim: Sim;
  packSim: PackSim;
  dockSignal: DockSignal;
  /** carries the data attributes (data-log) with language-neutral content */
  canvas: HTMLCanvasElement;
}

export interface Interact {
  /** raycast targets, priority between AGVs and hotspots */
  hitTargets: THREE.Object3D[];
  /** true when the hit object belongs to an interaction (consumed) */
  handleObject(obj: THREE.Object3D): boolean;
  /** cursor feedback: is this object interactive? */
  isInteractive(obj: THREE.Object3D | null): boolean;
  update(dt: number): void;
  /* debug/test hooks */
  requestDock(i: number): void;
  dockPalletPos(i: number): { x: number; y: number; z: number };
  requestLog(i: number): void;
  logPalletPos(i: number): { x: number; y: number; z: number };
  setLeitstand(mode: 'manual' | 'pipeline'): void;
  switchPos(): { x: number; y: number; z: number };
}

export function createInteract(ctx: InteractCtx): Interact {
  const { scene, sim, dockSignal, canvas } = ctx;
  const hitTargets: THREE.Object3D[] = [];
  const handlers = new Map<THREE.Object3D, () => void>();
  let clock = 0;

  /* ============================ DOCK =================================
     three contact pallets before TOR 1; tap fires the REAL action
     synchronously (the caller is the pointerup gesture handler), then
     the courier AGV loads the pallet onto the truck and it departs. */

  const DOCK_Z = -27.7;
  const dockXs = [DOORS[0].x - 3.4, DOORS[0].x, DOORS[0].x + 3.4];
  const DOCK_WORDS = ['MAIL', 'IN', 'CV'];
  const palletGeo = palletGeometry();

  /* hrefs come from the existing Contact panel — nothing hardcoded */
  const contactLinks: Array<HTMLAnchorElement | null> = [
    document.querySelector('#contact a[href^="mailto:"]'),
    document.querySelector('#contact a[target="_blank"]'),
    document.querySelector('#contact a[download]'),
  ];

  const dockPalletMat = new THREE.MeshStandardMaterial({
    color: 0x7a6748,
    metalness: 0.05,
    roughness: 0.85,
    emissive: new THREE.Color(COL.amber),
    emissiveIntensity: 0.12,
  });
  interface DockPallet {
    mesh: THREE.Mesh;
    taken: boolean;
  }
  const dockPallets: DockPallet[] = [];
  dockXs.forEach((x, i) => {
    const mesh = new THREE.Mesh(palletGeo, dockPalletMat);
    mesh.position.set(x, 0, DOCK_Z);
    scene.add(mesh);
    const label = labelPlane(DOCK_WORDS[i], 1.3, 0.33, '#ffb35c');
    label.position.set(x, 1.06, DOCK_Z + 0.52);
    scene.add(label);
    const hit = new THREE.Mesh(new THREE.BoxGeometry(1.9, 1.7, 1.6), HIT_MAT);
    hit.position.set(x, 0.75, DOCK_Z);
    scene.add(hit);
    hitTargets.push(hit);
    handlers.set(hit, () => requestDock(i));
    dockPallets.push({ mesh, taken: false });
  });

  /* courier AGV (choreographed, straight segments at TOR 1) */
  const courier = new THREE.Group();
  const courierBody = new THREE.Mesh(
    (() => {
      const base = new THREE.BoxGeometry(1.28, 0.42, 1.9);
      base.translate(0, 0.32, 0);
      const mast = new THREE.BoxGeometry(1.1, 0.34, 0.12);
      mast.translate(0, 0.45, 0.92);
      return mergeGeometries([base, mast])!;
    })(),
    new THREE.MeshStandardMaterial({ color: 0x3a4450, metalness: 0.65, roughness: 0.45 }),
  );
  const courierStrip = new THREE.Mesh(
    new THREE.BoxGeometry(1.05, 0.055, 0.14),
    new THREE.MeshBasicMaterial({ color: COL.amber }),
  );
  courierStrip.position.set(0, 0.76, 0);
  courier.add(courierBody, courierStrip);
  const COURIER_HOME = { x: -44.8, z: -26.2 };
  courier.position.set(COURIER_HOME.x, 0, COURIER_HOME.z);
  courier.rotation.y = Math.PI / 2;
  scene.add(courier);

  const setSignal = (green: boolean) => {
    dockSignal.red.color.setHex(green ? 0x3a1512 : 0xff3524);
    dockSignal.green.color.setHex(green ? COL.acid : 0x1a2a12);
  };

  type DockPhase = 'idle' | 'fetch' | 'grab' | 'waitTruck' | 'load' | 'back' | 'reset';
  const dock = { phase: 'idle' as DockPhase, i: -1, t: 0, heading: Math.PI / 2 };

  const moveToward = (
    o: { x: number; z: number; heading: number },
    tx: number,
    tz: number,
    speed: number,
    dt: number,
  ): boolean => {
    const dx = tx - o.x;
    const dz = tz - o.z;
    const d = Math.hypot(dx, dz);
    o.heading = Math.atan2(dx, dz);
    if (d <= speed * dt) {
      o.x = tx;
      o.z = tz;
      return true;
    }
    o.x += (dx / d) * speed * dt;
    o.z += (dz / d) * speed * dt;
    return false;
  };

  function requestDock(i: number): void {
    /* the real action fires synchronously — popup blockers only allow
       window.open/mailto/downloads inside the gesture handler */
    contactLinks[i]?.click();
    if (dock.phase !== 'idle') return; // one loading show at a time
    const p = dockPallets[i];
    if (!p || p.taken) return;
    dock.phase = 'fetch';
    dock.i = i;
    dock.t = 0;
    /* make sure a truck is on its way to TOR 1 */
    const tr = sim.trucks[0];
    if (tr.phase === 'away') tr.dur = Math.min(tr.dur, tr.t + 0.3);
  }

  function updateDock(dt: number): void {
    if (dock.phase === 'idle') return;
    const tr = sim.trucks[0];
    const p = dockPallets[dock.i];
    const px = dockXs[dock.i];
    const co = { x: courier.position.x, z: courier.position.z, heading: dock.heading };

    switch (dock.phase) {
      case 'fetch':
        if (moveToward(co, px, DOCK_Z + 0.95, 3.2, dt)) {
          dock.phase = 'grab';
          dock.t = 0;
        }
        break;
      case 'grab':
        dock.t += dt;
        if (dock.t >= 0.45) {
          p.taken = true;
          setSignal(true);
          dock.phase = tr.phase === 'dock' || tr.phase === 'work' ? 'load' : 'waitTruck';
        }
        break;
      case 'waitTruck':
        if (tr.phase === 'away') tr.dur = Math.min(tr.dur, tr.t + 0.3);
        if (tr.phase === 'dock' || tr.phase === 'work') dock.phase = 'load';
        break;
      case 'load':
        if (moveToward(co, px, -31.4, 2.4, dt)) {
          p.mesh.scale.setScalar(0); // swallowed by the trailer
          dock.phase = 'back';
        }
        if (co.z < -31.0) p.mesh.scale.setScalar(0);
        break;
      case 'back':
        if (moveToward(co, COURIER_HOME.x, COURIER_HOME.z, 3.2, dt)) {
          if (tr.phase === 'dock' || tr.phase === 'work') {
            tr.phase = 'leave'; // truck departs with the contact aboard
            tr.t = 0;
          }
          dock.phase = 'reset';
        }
        break;
      case 'reset':
        if (tr.phase === 'away') {
          tr.dur = Math.min(tr.dur, tr.t + 5); // a fresh truck rolls in soon
          p.taken = false;
          p.mesh.scale.setScalar(1);
          p.mesh.position.set(px, 0, DOCK_Z);
          setSignal(false);
          dock.phase = 'idle';
          dock.i = -1;
        }
        break;
    }
    dock.heading = co.heading;
    courier.position.x = co.x;
    courier.position.z = co.z;
    courier.rotation.y = dock.heading;
    /* the pallet rides on the courier */
    if (p.taken) {
      p.mesh.position.set(co.x, 0.64, co.z);
      p.mesh.rotation.y = dock.heading;
    }
  }

  /* ============================ LOG ==================================
     five highlighted pallets in high-bay aisle B, one per log entry
     (label: commit hash + year — language-neutral, from data-log).
     Tap: the aisle shuttle fetches the pallet onto the presentation
     stage at eye height (spot on), the matching LOG panel entry gets
     an acid frame and is scrolled into view INSIDE the panel (manual
     scrollTop — window.scrollY steers the camera and never moves). */

  interface LogDatum {
    hash: string;
    year: string;
  }
  let logData: LogDatum[] = [];
  try {
    logData = JSON.parse(canvas.dataset.log ?? '[]') as LogDatum[];
  } catch {
    logData = [];
  }

  const AISLE_X = RACKS.aislesX[1]; // aisle B — the LOG camera lives here
  const FACE_X = RACKS.rowsX[2] - RACKS.depth / 2 - 0.35; // east face, proud
  const LOG_BAYS = [0, 2, 4, 6, 8];
  const LOG_LEVELS = [3, 2, 4, 3, 2];
  const bayZ = (b: number) => RACKS.z0 + ((RACKS.z1 - RACKS.z0) / RACKS.bays) * (b + 0.5);
  const lvlY = (l: number) => RACKS.baseY + l * RACKS.pitch;
  const STAGE = { x: AISLE_X, y: 1.55, z: 9.5 }; // eye height, in view of the LOG camera
  const SHUTTLE_HOME = { y: 0.85, z: 13.6 };
  const SHOW_TIME = 6;

  interface LogPallet {
    mesh: THREE.Mesh;
    mat: THREE.MeshStandardMaterial;
    home: { x: number; y: number; z: number };
    carried: boolean;
  }
  const logPallets: LogPallet[] = [];
  const N_LOG = Math.min(5, logData.length || 5);
  for (let i = 0; i < N_LOG; i++) {
    const z = bayZ(LOG_BAYS[i % LOG_BAYS.length]);
    const y = lvlY(LOG_LEVELS[i % LOG_LEVELS.length]);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x8a6f4c,
      metalness: 0.05,
      roughness: 0.8,
      emissive: new THREE.Color(COL.acid),
      emissiveIntensity: 0.3, // highlighted stock
    });
    const mesh = new THREE.Mesh(palletGeo, mat);
    mesh.position.set(FACE_X, y, z);
    mesh.rotation.y = Math.PI / 2;
    scene.add(mesh);
    /* acid frame on the rack face */
    const frame = new THREE.Mesh(
      new THREE.PlaneGeometry(1.42, 0.92),
      new THREE.MeshBasicMaterial({
        color: COL.acid,
        transparent: true,
        opacity: 0.28,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    frame.rotation.y = -Math.PI / 2;
    frame.position.set(FACE_X - 0.55, y + 0.38, z);
    scene.add(frame);
    /* hash · year label (sprite — always readable down the aisle) */
    const d = logData[i];
    const label = textSprite(d ? (d.year ? `${d.hash} · ${d.year}` : d.hash) : `P-${i + 1}`, '#b4ff39');
    label.position.set(FACE_X - 0.8, y + 1.02, z);
    scene.add(label);
    const hit = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.3, 1.6), HIT_MAT);
    hit.position.set(FACE_X - 0.5, y + 0.4, z);
    scene.add(hit);
    hitTargets.push(hit);
    handlers.set(hit, () => requestLog(i));
    logPallets.push({ mesh, mat, home: { x: FACE_X, y, z }, carried: false });
  }

  /* presentation stage: pedestal + spot cone + floor pool (spot on demand) */
  const stage = new THREE.Group();
  const pedestal = new THREE.Mesh(
    new THREE.BoxGeometry(1.9, 0.5, 1.6),
    new THREE.MeshStandardMaterial({ color: 0x2b3138, metalness: 0.6, roughness: 0.5 }),
  );
  pedestal.position.set(STAGE.x, 0.25, STAGE.z);
  stage.add(pedestal);
  const spotCone = new THREE.Mesh(
    new THREE.ConeGeometry(1.6, 4.4, 20, 1, true),
    new THREE.MeshBasicMaterial({
      color: COL.acid,
      transparent: true,
      opacity: 0.1,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  spotCone.position.set(STAGE.x, 4.9, STAGE.z);
  const spotPool = new THREE.Mesh(
    new THREE.CircleGeometry(1.7, 24),
    new THREE.MeshBasicMaterial({
      color: COL.acid,
      transparent: true,
      opacity: 0.14,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  spotPool.rotation.x = -Math.PI / 2;
  spotPool.position.set(STAGE.x, 0.04, STAGE.z);
  spotCone.visible = spotPool.visible = false;
  stage.add(spotCone, spotPool);
  scene.add(stage);

  /* the aisle shuttle that fetches pallets (choreographed, aisle B) */
  const shuttle = new THREE.Group();
  const shuttleBody = new THREE.Mesh(
    new THREE.BoxGeometry(1.05, 0.3, 1.5),
    new THREE.MeshStandardMaterial({
      color: 0x2f5a52,
      metalness: 0.6,
      roughness: 0.4,
      emissive: new THREE.Color(COL.cyan),
      emissiveIntensity: 1.1,
    }),
  );
  shuttle.add(shuttleBody);
  shuttle.position.set(AISLE_X, SHUTTLE_HOME.y, SHUTTLE_HOME.z);
  scene.add(shuttle);

  /* ---- LOG panel twin (DOM) ---- */
  const logPanel = document.getElementById('log');
  const logScroller = logPanel?.querySelector<HTMLElement>(':scope > div:not([aria-hidden="true"])');
  let pickedEl: HTMLElement | null = null;
  const clearPick = () => {
    pickedEl?.classList.remove('log-pick');
    pickedEl = null;
  };
  const pickEntry = (i: number) => {
    clearPick();
    pickedEl = logPanel?.querySelector<HTMLElement>(`[data-log-entry="${i}"]`) ?? null;
    if (!pickedEl) return;
    pickedEl.classList.add('log-pick');
    /* scroll the PANEL, never the page: window.scrollY is the camera */
    if (logScroller) {
      const r = pickedEl.getBoundingClientRect();
      const s = logScroller.getBoundingClientRect();
      const delta = r.top - s.top - (logScroller.clientHeight - r.height) / 2;
      logScroller.scrollTo({ top: logScroller.scrollTop + delta, behavior: 'smooth' });
    }
  };

  type LogPhase = 'idle' | 'fetch' | 'pull' | 'carry' | 'show' | 'store' | 'push' | 'park';
  const logSt = { phase: 'idle' as LogPhase, i: -1, pending: -1, t: 0, showT: 0, glow: -1 };

  const moveZ = (tz: number, ty: number, dt: number): boolean => {
    const sz = 3.0 * dt;
    const sy = 1.6 * dt;
    const dz = tz - shuttle.position.z;
    const dy = ty - shuttle.position.y;
    let done = true;
    if (Math.abs(dz) > sz) {
      shuttle.position.z += Math.sign(dz) * sz;
      done = false;
    } else shuttle.position.z = tz;
    if (Math.abs(dy) > sy) {
      shuttle.position.y += Math.sign(dy) * sy;
      done = false;
    } else shuttle.position.y = ty;
    return done;
  };

  function requestLog(i: number): void {
    if (i < 0 || i >= logPallets.length) return;
    if (logSt.phase === 'idle') {
      logSt.phase = 'fetch';
      logSt.i = i;
      logSt.t = 0;
      return;
    }
    if (logSt.i === i && (logSt.phase === 'show' || logSt.phase === 'carry')) {
      logSt.showT = 0; // re-tap restarts the spotlight window
      return;
    }
    logSt.pending = i;
    if (logSt.phase === 'fetch') {
      /* no pallet on the fork yet — retarget directly */
      logSt.i = i;
      logSt.pending = -1;
    } else if (logSt.phase === 'show') {
      logSt.phase = 'store'; // next selection re-stores the current pallet
    }
  }

  function updateLog(dt: number): void {
    /* hover glow (DOM twin: hover/focus on a log entry) + shown pulse */
    for (let k = 0; k < logPallets.length; k++) {
      const lp = logPallets[k];
      const shown = logSt.i === k && (logSt.phase !== 'idle' && logSt.phase !== 'park');
      const hov = logSt.glow === k;
      lp.mat.emissiveIntensity =
        (shown ? 1.15 : hov ? 0.95 : 0.3) + (hov || shown ? Math.sin(clock * 5) * 0.15 : 0);
    }
    if (logSt.phase === 'idle') {
      if (logSt.pending >= 0) {
        logSt.i = logSt.pending;
        logSt.pending = -1;
        logSt.phase = 'fetch';
      }
      return;
    }
    const lp = logPallets[logSt.i];
    switch (logSt.phase) {
      case 'fetch':
        if (moveZ(lp.home.z, lp.home.y + 0.35, dt)) {
          logSt.phase = 'pull';
          logSt.t = 0;
        }
        break;
      case 'pull': {
        logSt.t += dt;
        const k = Math.min(1, logSt.t / 0.7);
        lp.mesh.position.x = lp.home.x + (AISLE_X - lp.home.x) * k;
        if (k >= 1) {
          lp.carried = true;
          logSt.phase = 'carry';
        }
        break;
      }
      case 'carry':
        if (moveZ(STAGE.z, STAGE.y, dt)) {
          logSt.phase = 'show';
          logSt.showT = 0;
          spotCone.visible = spotPool.visible = true;
          pickEntry(logSt.i);
        }
        break;
      case 'show':
        logSt.showT += dt;
        spotCone.material.opacity = 0.1 + Math.sin(clock * 2.4) * 0.03;
        if (logSt.showT >= SHOW_TIME) logSt.phase = 'store';
        break;
      case 'store':
        spotCone.visible = spotPool.visible = false;
        clearPick();
        if (moveZ(lp.home.z, lp.home.y + 0.35, dt)) {
          logSt.phase = 'push';
          logSt.t = 0;
        }
        break;
      case 'push': {
        logSt.t += dt;
        const k = Math.min(1, logSt.t / 0.7);
        lp.mesh.position.x = AISLE_X + (lp.home.x - AISLE_X) * k;
        if (k >= 1) {
          lp.carried = false;
          lp.mesh.position.set(lp.home.x, lp.home.y, lp.home.z);
          logSt.phase = 'park';
        }
        break;
      }
      case 'park':
        if (moveZ(SHUTTLE_HOME.z, SHUTTLE_HOME.y, dt)) {
          logSt.phase = 'idle';
          logSt.i = -1;
        }
        break;
    }
    /* the pallet rides on the shuttle */
    if (lp.carried) {
      lp.mesh.position.set(AISLE_X, shuttle.position.y + 0.32, shuttle.position.z);
      lp.mesh.rotation.y = 0;
    }
  }

  /* DOM twin wiring: click on a hash button = same request; hover/focus
     on an entry = pallet glows in the hall */
  document.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement | null)?.closest?.('[data-log-req]');
    if (btn) requestLog(Number((btn as HTMLElement).dataset.logReq));
  });
  const hoverIn = (e: Event) => {
    const el = (e.target as HTMLElement | null)?.closest?.('[data-log-entry]');
    logSt.glow = el ? Number((el as HTMLElement).dataset.logEntry) : -1;
  };
  const hoverOut = () => {
    logSt.glow = -1;
  };
  logPanel?.addEventListener('mouseover', hoverIn);
  logPanel?.addEventListener('mouseout', hoverOut);
  logPanel?.addEventListener('focusin', hoverIn);
  logPanel?.addEventListener('focusout', hoverOut);

  /* ============================ PROOF ================================
     Holo switch MANUELL | PIPELINE at the Leitstand console + readout
     (Ø t/quote, QUEUE). The ROI sliders (toy:roi) steer arrival rate
     and service time; the DOM twin in the PROOF panel mirrors it all. */

  const fdWords = (() => {
    try {
      return JSON.parse(canvas.dataset.fd ?? '{}') as Record<string, string>;
    } catch {
      return {} as Record<string, string>;
    }
  })();
  const W_MAN = (fdWords.manual ?? 'MANUELL').toUpperCase();
  const W_PIPE = (fdWords.pipeline ?? 'PIPELINE').toUpperCase();
  const W_QUEUE = (fdWords.queue ?? 'QUEUE').toUpperCase();

  const switchCanvas = document.createElement('canvas');
  switchCanvas.width = 512;
  switchCanvas.height = 128;
  const switchCtx = switchCanvas.getContext('2d')!;
  const switchTex = new THREE.CanvasTexture(switchCanvas);
  switchTex.colorSpace = THREE.SRGBColorSpace;

  const drawSwitch = () => {
    const ctx = switchCtx;
    const W = 512;
    const H = 128;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(6,10,8,0.82)';
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = '#b4ff39';
    ctx.globalAlpha = 0.85;
    ctx.lineWidth = 4;
    ctx.strokeRect(4, 4, W - 8, H - 8);
    ctx.globalAlpha = 1;
    const words = [W_MAN, W_PIPE];
    for (let k = 0; k < 2; k++) {
      const x0 = 10 + k * 250;
      const active = (k === 1) === (packSim.mode === 'pipeline');
      if (active) {
        ctx.fillStyle = '#b4ff39';
        ctx.fillRect(x0, 12, 236, H - 24);
      } else {
        ctx.strokeStyle = 'rgba(180,255,57,0.5)';
        ctx.lineWidth = 2;
        ctx.strokeRect(x0, 12, 236, H - 24);
      }
      ctx.fillStyle = active ? '#0a0d0a' : '#b4ff39';
      ctx.font = '700 34px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(words[k], x0 + 118, H / 2 + 2);
    }
    switchTex.needsUpdate = true;
  };
  drawSwitch();

  const switchMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(2.6, 0.65),
    new THREE.MeshBasicMaterial({ map: switchTex, transparent: true }),
  );
  switchMesh.position.set(LEITSTAND.x0 - 0.45, LEITSTAND.floorY + 1.5, 22);
  switchMesh.rotation.y = -Math.PI / 2; // faces west, toward the PROOF camera
  scene.add(switchMesh);
  /* console stand under the switch */
  const stand = new THREE.Mesh(
    new THREE.BoxGeometry(0.24, 1.4, 2.9),
    new THREE.MeshStandardMaterial({ color: 0x22282e, metalness: 0.8, roughness: 0.5 }),
  );
  stand.position.set(LEITSTAND.x0 - 0.3, LEITSTAND.floorY + 0.7, 22);
  scene.add(stand);
  const switchHit = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.6, 3.4), HIT_MAT);
  switchHit.position.set(LEITSTAND.x0 - 0.45, LEITSTAND.floorY + 1.5, 22);
  scene.add(switchHit);
  hitTargets.push(switchHit);

  /* holo readout above the switch */
  const readCanvas = document.createElement('canvas');
  readCanvas.width = 256;
  readCanvas.height = 96;
  const readCtx = readCanvas.getContext('2d')!;
  const readTex = new THREE.CanvasTexture(readCanvas);
  readTex.colorSpace = THREE.SRGBColorSpace;
  let readCache = '';
  const drawReadout = (avgT: string, queue: string) => {
    const key = `${avgT}|${queue}`;
    if (key === readCache) return;
    readCache = key;
    const ctx = readCtx;
    ctx.clearRect(0, 0, 256, 96);
    ctx.fillStyle = 'rgba(6,10,8,0.72)';
    ctx.fillRect(0, 0, 256, 96);
    ctx.strokeStyle = 'rgba(125,255,216,0.7)';
    ctx.lineWidth = 2;
    ctx.strokeRect(2, 2, 252, 92);
    ctx.fillStyle = '#7dffd8';
    ctx.font = '700 26px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(`Ø t  ${avgT} MIN`, 14, 30);
    ctx.fillText(`${W_QUEUE} ${queue}`, 14, 66);
    readTex.needsUpdate = true;
  };
  const readout = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: readTex, transparent: true, depthWrite: false }),
  );
  readout.scale.set(2.3, 0.86, 1);
  readout.position.set(LEITSTAND.x0 - 0.7, LEITSTAND.floorY + 2.5, 22);
  scene.add(readout);

  /* DOM twin (PROOF panel) */
  const lsToggle = document.querySelector<HTMLButtonElement>('[data-ls-toggle]');
  const lsModeEl = document.querySelector<HTMLElement>('[data-ls-mode]');
  const lsT = document.querySelector<HTMLElement>('[data-ls-t]');
  const lsQ = document.querySelector<HTMLElement>('[data-ls-q]');

  function setLeitstand(mode: 'manual' | 'pipeline'): void {
    packSim.setMode(mode);
    drawSwitch();
    if (lsToggle) lsToggle.setAttribute('aria-pressed', String(mode === 'pipeline'));
    if (lsModeEl) lsModeEl.textContent = mode === 'pipeline' ? (fdWords.pipeline ?? 'pipeline') : (fdWords.manual ?? 'manuell');
  }
  const toggleLeitstand = () => setLeitstand(packSim.mode === 'pipeline' ? 'manual' : 'pipeline');
  handlers.set(switchHit, toggleLeitstand);
  lsToggle?.addEventListener('click', toggleLeitstand);

  /* ROI sliders steer arrival rate + service time (roi.ts stays owner) */
  window.addEventListener('toy:roi', (e) => {
    const d = (e as CustomEvent<{ quotes?: number; minutes?: number }>).detail;
    if (d) packSim.setRates(Number(d.quotes), Number(d.minutes));
  });

  let lsAcc = 1;
  function updateProof(dt: number): void {
    lsAcc += dt;
    if (lsAcc < 0.5) return;
    lsAcc = 0;
    const avgT = packSim.avgT.toFixed(1);
    const q = String(Math.floor(packSim.queueLen)).padStart(3, '0');
    if (lsT) lsT.textContent = avgT;
    if (lsQ) lsQ.textContent = q;
    drawReadout(avgT, q);
  }

  /* ========================== public ================================ */

  return {
    hitTargets,
    handleObject(obj) {
      const fn = handlers.get(obj);
      if (fn) {
        fn();
        return true;
      }
      return false;
    },
    isInteractive(obj) {
      return obj !== null && handlers.has(obj);
    },
    update(dt) {
      clock += dt;
      updateDock(dt);
      updateLog(dt);
      updateProof(dt);
    },
    requestDock,
    dockPalletPos(i) {
      return { x: dockXs[i], y: 0.8, z: DOCK_Z };
    },
    requestLog,
    logPalletPos(i) {
      const lp = logPallets[i];
      const y = lp ? lp.mesh.position.y + 0.4 : 0;
      return lp ? { x: lp.mesh.position.x, y, z: lp.mesh.position.z } : { x: 0, y: 0, z: 0 };
    },
    setLeitstand,
    switchPos() {
      return { x: LEITSTAND.x0 - 0.45, y: LEITSTAND.floorY + 1.5, z: 22 };
    },
  };
}
