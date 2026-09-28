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
import { COL, DOORS } from './layout';
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
  const tex = canvasTexture(256, 64, (ctx, W, H) => {
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
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide }),
  );
  return m;
}

export interface InteractCtx {
  scene: THREE.Scene;
  sim: Sim;
  packSim: PackSim;
  dockSignal: DockSignal;
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
}

export function createInteract(ctx: InteractCtx): Interact {
  const { scene, sim, dockSignal } = ctx;
  const hitTargets: THREE.Object3D[] = [];
  const handlers = new Map<THREE.Object3D, () => void>();

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
      updateDock(dt);
    },
    requestDock,
    dockPalletPos(i) {
      return { x: dockXs[i], y: 0.8, z: DOCK_Z };
    },
  };
}
