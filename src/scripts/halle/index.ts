/* ------------------------------------------------------------------ */
/* DIE HALLE — the flightdeck world: a procedural 120 × 60 m logistics */
/* hall at night. T-102: the hall is ALIVE — 32 instanced AGVs with    */
/* edge reservation on a one-way network, shuttles, 2 RBGs, trucks at  */
/* the doors, pallet flow, a power-up intro after the cold boot and    */
/* tap-to-hold AGV interaction (visible congestion, 8 s timeout).      */
/* Implements the FlightWorld contract from ../flightworld (types.ts). */
/* ------------------------------------------------------------------ */

import * as THREE from 'three';
import type { FlightWorld } from './types';
import { createStage } from './scene';
import { buildShell } from './geometry/shell';
import { buildRacks } from './geometry/racks';
import { buildDetails } from './geometry/details';
import { createTour } from './tour';
import { createStats } from './stats';
import { createPower } from './power';
import { createSim } from './sim/world';
import { createSimRender } from './sim/render';
import { AGV_COUNT, AGV_WAIT } from './sim/agents';
import { createHotspots } from './hotspots';
import { createMinimap } from './minimap';
import { COL } from './layout';

export type { FlightWorld } from './types';

/* one-time static scene count: geometry triangles (instances included),
   parts = meshes with every instance counted individually */
function countScene(scene: THREE.Scene): { tris: number; parts: number } {
  let tris = 0;
  let parts = 0;
  scene.traverse((o) => {
    const sprite = o as THREE.Sprite;
    if (sprite.isSprite) {
      parts += 1;
      tris += 2;
      return;
    }
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const inst = mesh as THREE.InstancedMesh;
    const n = inst.isInstancedMesh ? inst.count : 1;
    const g = mesh.geometry;
    const t = (g.index ? g.index.count : g.getAttribute('position').count) / 3;
    tris += t * n;
    parts += n;
  });
  return { tris: Math.round(tris), parts };
}

const pad2 = (n: number) => String(n).padStart(2, '0');

export function createWorld(canvas: HTMLCanvasElement): FlightWorld {
  const stage = createStage(canvas);
  const { renderer, scene, camera, hemi, moon } = stage;

  try {
    /* geometry — one synchronous build, well under the 500 ms budget */
    const shell = buildShell(scene, renderer.capabilities.getMaxAnisotropy());
    buildRacks(scene);
    const { pulse, power: dp } = buildDetails(scene);
    const sp = shell.power;

    /* static scene: the shadow map renders ONCE (scene.ts disabled
       autoUpdate). Moving agents get instanced fake contact shadows
       (sim/render.ts) instead of a dynamic shadow pass */
    renderer.shadowMap.needsUpdate = true;

    /* ---- simulation + its render layer ---- */
    const sim = createSim(1337);
    sim.setRate(0);
    const simR = createSimRender(scene, sim);

    /* holo hotspot markers above the zone labels (tap = fly) —
       created before the stats count so the title card stays exact */
    const hotspots = createHotspots(scene, pulse.labelSprites);

    /* minimap (DOM live layer; null when the markup is absent) */
    const minimap = createMinimap(sim);
    let mapAcc = 1; // force a first paint

    const tour = createTour();
    const stats = createStats(countScene(scene));

    /* ---- power-up intro: zone lights come up group by group ---- */
    const power = createPower();
    power.attachSkip();
    let powerStart = -1;

    type LightEntry = { light: THREE.Light; base: number; group: number };
    const lightEntries: LightEntry[] = [];
    const addLight = (light: THREE.Light, group: number) =>
      lightEntries.push({ light, base: light.intensity, group });
    addLight(dp.doorGlow, 0);
    addLight(dp.yardGlow, 0);
    addLight(pulse.beaconLight, 0);
    dp.aisleSpots.forEach((l) => addLight(l, 1));
    dp.coolSpots.forEach((l) => addLight(l, 2));
    addLight(hemi, 2);
    addLight(moon, 2);
    addLight(dp.leitstandLight, 3);
    addLight(dp.loungeLight, 4);

    /* materials whose color/intensity rides a power group */
    type MatEntry = { mat: THREE.MeshBasicMaterial; base: THREE.Color; group: number };
    const matEntries: MatEntry[] = [];
    const addMat = (mat: THREE.MeshBasicMaterial, group: number) =>
      matEntries.push({ mat, base: mat.color.clone(), group });
    addMat(sp.redMat, 0);
    addMat(sp.greenMat, 0);
    addMat(sp.emergMat, 0);
    addMat(sp.yardHeadMat, 0);
    addMat(dp.monMat, 3);
    addMat(dp.screenMat, 3);
    const CONE_OPACITY = 0.16;
    const POOL_OPACITY = 0.5;

    /* pulse base colors match the dimmed strip materials (details.ts) */
    const ACID = new THREE.Color(COL.acid).multiplyScalar(0.5);
    const CYAN = new THREE.Color(COL.cyan).multiplyScalar(0.55);
    const AMBER = new THREE.Color(COL.amber);
    const minLevel = (g: number) => 0.04 + 0.96 * g;

    /* ---- AGV tap / hover (canvas has pointer-events:none, so taps are
       filtered on window: anything landing on DOM panels, the HUD or
       interactive elements never reaches the raycast) ---- */
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const BLOCK_SEL = 'a,button,input,select,textarea,label,#flight-hud,#site-nav';
    const PANEL_SEL =
      ':is(#top,#proof,#log,#work,#stack,#beyond,#contact) > div:not([aria-hidden="true"])';
    const isFreeTap = (e: PointerEvent): boolean => {
      const el = e.target as Element | null;
      if (!el || !(el instanceof Element)) return false;
      return !el.closest(BLOCK_SEL) && !el.closest(PANEL_SEL);
    };
    const raycastAgv = (cx: number, cy: number): number => {
      ndc.set((cx / window.innerWidth) * 2 - 1, -(cy / window.innerHeight) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
      const hits = raycaster.intersectObject(simR.agvMesh);
      return hits.length > 0 && hits[0].instanceId !== undefined ? hits[0].instanceId : -1;
    };
    /* hotspot raycast — AGVs always win over hotspots (checked first) */
    const raycastHotspot = (cx: number, cy: number): number => {
      ndc.set((cx / window.innerWidth) * 2 - 1, -(cy / window.innerHeight) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
      return hotspots.stationFromHits(raycaster.intersectObjects(hotspots.hitTargets, false));
    };
    const flyToStation = (station: number) => {
      window.dispatchEvent(new CustomEvent('halle:fly', { detail: { station } }));
    };

    let downRec: { x: number; y: number; t: number; sy: number } | null = null;
    let hoverId = -1;
    let hoverStation = -1; // hotspot under the pointer (-1 = none)
    let focusId = -1; // held AGV with holo tag
    let lastHoverCheck = 0;
    const ptr = { x: -1, y: -1, moved: false };

    const statusWord = (id: number): string => {
      const a = sim.agvs[id];
      if (a.hold) return 'HOLD';
      return a.status === AGV_WAIT ? 'WAIT' : 'GO';
    };
    const tagLabel = (id: number) => `AGV-${pad2(id + 1)} · ${statusWord(id)}`;

    const toggleHold = (id: number) => {
      const held = sim.toggleHold(id);
      if (held) {
        focusId = id;
        simR.setFocus(id, tagLabel(id), true);
      } else if (focusId === id) {
        focusId = -1;
        simR.setFocus(-1, '', false);
      }
    };

    window.addEventListener(
      'pointerdown',
      (e) => {
        downRec = isFreeTap(e)
          ? { x: e.clientX, y: e.clientY, t: performance.now(), sy: window.scrollY }
          : null;
      },
      { passive: true },
    );
    window.addEventListener(
      'pointerup',
      (e) => {
        const d = downRec;
        downRec = null;
        if (!d) return;
        if (performance.now() - d.t > 600) return; // not a tap
        if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 9) return; // drag
        if (window.scrollY !== d.sy) return; // scroll gesture
        if (!isFreeTap(e)) return;
        const id = raycastAgv(e.clientX, e.clientY);
        if (id >= 0) {
          toggleHold(id);
          return;
        }
        const st = raycastHotspot(e.clientX, e.clientY);
        if (st >= 0) flyToStation(st);
      },
      { passive: true },
    );
    window.addEventListener(
      'pointermove',
      (e) => {
        ptr.x = e.clientX;
        ptr.y = e.clientY;
        ptr.moved = true;
      },
      { passive: true },
    );

    /* CDP/test hook: hold an AGV (used by the shot/test scripts) */
    (window as unknown as { __halleDebug?: unknown }).__halleDebug = {
      holdFirst(): number {
        const id = sim.firstWorkingAgv();
        if (id >= 0 && !sim.agvs[id].hold) toggleHold(id);
        return id;
      },
      holdNearest(x: number, z: number): number {
        let best = -1;
        let bd = Infinity;
        for (const a of sim.agvs) {
          if (a.state !== 'working') continue;
          const d = Math.hypot(a.x - x, a.z - z);
          if (d < bd) {
            bd = d;
            best = a.id;
          }
        }
        if (best >= 0 && !sim.agvs[best].hold) toggleHold(best);
        return best;
      },
      holdId(id: number): boolean {
        const a = sim.agvs[id];
        if (!a || a.state !== 'working' || a.hold) return false;
        toggleHold(id);
        return true;
      },
      stats: () => ({ ...sim.stats }),
      /* live entity positions for the shot scripts (shuttles/RBGs/trucks) */
      entities(): unknown {
        return {
          shuttles: sim.shuttles.map((s) => ({ aisle: s.aisle, x: s.x, y: +s.y.toFixed(1), z: +s.z.toFixed(1) })),
          rbgs: sim.rbgs.map((r) => ({ x: r.x, z: +r.z.toFixed(1), liftY: +r.liftY.toFixed(1) })),
          trucks: sim.trucks.map((t) => ({ door: t.door, phase: t.phase, z: +t.z.toFixed(1) })),
        };
      },
      /* project any world point to screen px (shot scripts) */
      project(x: number, y: number, z: number): unknown {
        tmpV.set(x, y, z).project(camera);
        return {
          sx: +(((tmpV.x + 1) / 2) * window.innerWidth).toFixed(0),
          sy: +(((1 - tmpV.y) / 2) * window.innerHeight).toFixed(0),
        };
      },
      /* probe for tests/shots: world pos + status + screen projection */
      probe(id: number): unknown {
        const a = sim.agvs[id];
        if (!a) return null;
        tmpV.set(a.x, 0.8, a.z).project(camera);
        return {
          id,
          x: +a.x.toFixed(2),
          z: +a.z.toFixed(2),
          state: a.state,
          status: a.status,
          hold: a.hold,
          sx: +(((tmpV.x + 1) / 2) * window.innerWidth).toFixed(0),
          sy: +(((1 - tmpV.y) / 2) * window.innerHeight).toFixed(0),
        };
      },
      working(): number[] {
        return sim.agvs.filter((a) => a.state === 'working').map((a) => a.id);
      },
      /* hotspot markers projected to screen px (shot scripts) */
      hotspots(): unknown {
        return [0, 1, 2, 3, 4, 5, 6].map((i) => {
          const w = hotspots.pos(i);
          tmpV.set(w.x, w.y, w.z).project(camera);
          return {
            station: i,
            sx: +(((tmpV.x + 1) / 2) * window.innerWidth).toFixed(0),
            sy: +(((1 - tmpV.y) / 2) * window.innerHeight).toFixed(0),
          };
        });
      },
    };

    /* ---- telemetry under the title card (model values, tagged) ---- */
    const elTcAgv = document.querySelector<HTMLElement>('[data-tc-agv]');
    const elTcTransit = document.querySelector<HTMLElement>('[data-tc-transit]');
    const elTcDwell = document.querySelector<HTMLElement>('[data-tc-dwell]');
    let telAcc = 0;
    const telCache = { agv: '', transit: '', dwell: '' };

    const tmpV = new THREE.Vector3();
    let beat = 0;

    return {
      camera,
      drift: tour.drift,
      pulse() {
        beat = 1;
      },
      update(p, transit, dt, now) {
        const t = now * 0.001;

        /* power-up: starts at the first update() after the cold boot */
        if (powerStart < 0) powerStart = now;
        if (!power.done) power.update((now - powerStart) / 1000);
        const L = power.levels;

        /* simulation: rate ramps up with the power; the fixed-step world
           pauses implicitly because update() is not called while hidden */
        sim.setRate(power.done ? 1 : Math.max(0, (power.progress - 0.12) / 0.8));
        sim.advance(dt);
        simR.update(sim.alpha());

        tour.apply(camera, p, transit, dt, now);

        /* lights ride their power group */
        for (const e of lightEntries) e.light.intensity = e.base * L[e.group];
        scene.environmentIntensity = 0.26 * (0.12 + 0.88 * L[2]);
        for (const e of matEntries) e.mat.color.copy(e.base).multiplyScalar(minLevel(L[e.group]));
        dp.coneMat.opacity = CONE_OPACITY * L[2];
        dp.poolMat.opacity = POOL_OPACITY * L[2];

        /* beat pulse: work-light strips + holo labels ride the kick */
        beat = Math.max(0, beat - dt * 3.2);
        const b = 1 + beat * 0.9;
        pulse.acid.color.copy(ACID).multiplyScalar(b * minLevel(L[1]));
        pulse.cyan.color.copy(CYAN).multiplyScalar((1 + beat * 0.7) * minLevel(L[3]));
        pulse.amber.color.copy(AMBER).multiplyScalar((0.78 + beat * 0.42) * minLevel(L[4]));

        /* holo labels: cap the on-screen size (scale by distance) and
           hide them in the near field, so fly-bys never fill the frame */
        pulse.labelSprites.forEach((s, i) => {
          s.position.y += Math.sin(t * 0.7 + i * 1.7) * dt * 0.06;
          const dist = tmpV.copy(s.position).distanceTo(camera.position);
          const sScale = THREE.MathUtils.clamp(dist / 22, 0.35, 1);
          s.scale.set(7.6 * sScale, 1.9 * sScale, 1);
          const near = THREE.MathUtils.smoothstep(dist, 8, 14);
          pulse.labels[i].opacity = (0.78 + beat * 0.22) * near * L[3];
        });

        /* Gefahrgut beacon blink */
        const blink = Math.sin(t * 2.6) > 0.2 ? 1 : 0.06;
        pulse.beaconMat.color.setHex(0xff3524).multiplyScalar((0.25 + blink * 0.9) * minLevel(L[0]));

        /* hotspot markers: bob + spin, dim at the docked station */
        const dockedStation = Math.min(6, Math.max(0, Math.round(p * 6)));
        hotspots.update(t, dockedStation, hoverStation, minLevel(L[3]));

        /* minimap live layer at 4 Hz (dots/camera reuse SVG elements) */
        if (minimap) {
          mapAcc += dt;
          if (mapAcc >= 0.25) {
            mapAcc = 0;
            camera.getWorldDirection(tmpV);
            minimap.update(
              camera.position.x,
              camera.position.z,
              THREE.MathUtils.radToDeg(Math.atan2(tmpV.x, -tmpV.z)),
              dockedStation,
            );
          }
        }

        /* held AGV expired (8 s timeout) → release the tag */
        if (focusId >= 0 && !sim.agvs[focusId].hold) {
          focusId = -1;
          simR.setFocus(-1, '', false);
        } else if (focusId >= 0) {
          simR.setFocus(focusId, tagLabel(focusId), true);
        }

        /* hover raycast (throttled): pointer cursor + ring on desktop.
           AGVs win over hotspots; both give a pointer cursor */
        if (ptr.moved && now - lastHoverCheck > 120) {
          ptr.moved = false;
          lastHoverCheck = now;
          const el = document.elementFromPoint(ptr.x, ptr.y);
          const overDom =
            el instanceof Element && (!!el.closest(BLOCK_SEL) || !!el.closest(PANEL_SEL));
          const id = overDom ? -1 : raycastAgv(ptr.x, ptr.y);
          const st = id >= 0 || overDom ? -1 : raycastHotspot(ptr.x, ptr.y);
          if (id !== hoverId) {
            hoverId = id;
            simR.setHover(id);
          }
          if (st !== hoverStation) hoverStation = st;
          const cursor = id >= 0 || st >= 0 ? 'pointer' : '';
          if (document.documentElement.style.cursor !== cursor) {
            document.documentElement.style.cursor = cursor;
          }
        }

        /* telemetry: 2 Hz, only on change */
        telAcc += dt;
        if (telAcc >= 0.5) {
          telAcc = 0;
          const a = String(AGV_COUNT);
          if (a !== telCache.agv && elTcAgv) {
            elTcAgv.textContent = a;
            telCache.agv = a;
          }
          const tr = String(sim.stats.inTransit);
          if (tr !== telCache.transit && elTcTransit) {
            elTcTransit.textContent = tr;
            telCache.transit = tr;
          }
          const dw = sim.stats.avgDwell; // starts at the model seed (DWELL_SEED)
          const ds = `${Math.floor(dw / 60)}:${pad2(Math.round(dw % 60))}`;
          if (ds !== telCache.dwell && elTcDwell) {
            elTcDwell.textContent = ds;
            telCache.dwell = ds;
          }
        }

        renderer.render(scene, camera);
        stats.frame(dt);
      },
    };
  } catch (err) {
    /* clean up the GL context + listeners so flightdeck's fallback to
       the classic view doesn't leak a dead renderer */
    stage.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
    throw err;
  }
}
