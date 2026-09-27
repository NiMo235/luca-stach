/* ------------------------------------------------------------------ */
/* Simulations-Welt — three-free, deterministisch (Seed), fixed        */
/* Timestep 10 Hz mit Accumulator + Render-Interpolation.              */
/*                                                                     */
/* Läuft im Main-Thread; pausiert automatisch, weil der Render-Loop    */
/* (flightdeck.ts) update() bei document.hidden nicht ruft. Der        */
/* Headless-Test (scripts/check-halle-sim.mjs) ruft step() direkt.     */
/* ------------------------------------------------------------------ */

import {
  NODES,
  EDGES,
  SLOT_NODES,
  SLOT_COUNT,
  DOOR_NODES,
  AISLE_NODES,
  NODE,
  routeNodes,
  edgeBetween,
} from './graph.ts';
import {
  AGV_COUNT,
  createAgv,
  stepAgv,
  edgePos,
  edgeHeading,
  HOLD_TIMEOUT,
  EXIT_ROOM,
  createShuttles,
  stepShuttle,
  createRbgs,
  stepRbg,
  createTrucks,
  stepTruck,
  TRUCK_DOCK_Z,
} from './agents.ts';
import type { Agv, Leg, Shuttle, Rbg, Truck } from './agents.ts';
import {
  createOrders,
  AISLE_SLOTS,
  DOOR_SLOTS,
  INBOUND_DOORS,
} from './orders.ts';
import type { OrderSystem, Order } from './orders.ts';
import { rng } from './rand.ts';
import { DOORS, RACKS } from '../layout.ts';

const STEP = 0.1; // 10 Hz
const MAX_TRANSIT = 16; // dispatcher cap — deadlock prevention headroom
const LOAD_T = 3.5;
const UNLOAD_T = 3.5;
const PACK_T = 5.0;

/* pallet pool */
export const PALLET_COUNT = 56;

export interface Pallet {
  mode: 'free' | 'slot' | 'agv' | 'rbg' | 'gone';
  x: number;
  y: number;
  z: number;
  ry: number;
  agv: number; // carrier
  rbg: number;
}

interface SlotRef {
  pallet: number; // pool id or -1
}

export interface SimStats {
  completed: number;
  inTransit: number;
  avgDwell: number; // s, exp. moving average of wait+dwell per order
  queueLen: number;
}

export interface Sim {
  time: number;
  agvs: Agv[];
  shuttles: Shuttle[];
  rbgs: Rbg[];
  trucks: Truck[];
  pallets: Pallet[];
  stats: SimStats;
  orders: OrderSystem;
  /** fixed-step advance; accumulate real dt, step at 10 Hz */
  advance(dt: number): void;
  /** one raw 10 Hz step (used by advance + the headless test) */
  step(): void;
  /** interpolation alpha for the renderer (0..1 within current step) */
  alpha(): number;
  toggleHold(id: number): boolean;
  holdCount(): number;
  /** test hook: first working AGV id or -1 */
  firstWorkingAgv(): number;
}

export function createSim(seed = 1337): Sim {
  const rnd = rng(seed);
  const owner = new Int32Array(NODES.length).fill(-1);
  const slotTarget = new Int32Array(NODES.length).fill(-1); // slot node -> agv

  /* ---- pallets + visible buffer slots ---- */
  const pallets: Pallet[] = [];
  for (let i = 0; i < PALLET_COUNT; i++) {
    pallets.push({ mode: 'free', x: 0, y: -3, z: 0, ry: 0, agv: -1, rbg: -1 });
  }
  const freePallet = (): number => pallets.findIndex((p) => p.mode === 'free');

  /* door buffer slots: 3 per door, beside the dock lane */
  const doorSlotPos: Array<Array<[number, number]>> = [];
  for (let d = 0; d < 4; d++) {
    const dx = DOORS[d].x;
    const row: Array<[number, number]> = [];
    for (let k = 0; k < DOOR_SLOTS; k++) row.push([dx + (k - 1) * 1.7, -22.6]);
    doorSlotPos.push(row);
  }
  /* aisle transfer slots: 2 per aisle, just south of the transfer lane */
  const aisleSlotPos: Array<Array<[number, number]>> = [];
  for (let a = 0; a < 3; a++) {
    const ax = RACKS.aislesX[a];
    aisleSlotPos.push([
      [ax - 1.2, 18.4],
      [ax + 1.2, 18.4],
    ]);
  }
  const doorSlots: SlotRef[][] = [[], [], [], []];
  const aisleSlots: SlotRef[][] = [[], [], []];
  for (let d = 0; d < 4; d++) for (let k = 0; k < DOOR_SLOTS; k++) doorSlots[d].push({ pallet: -1 });
  for (let a = 0; a < 3; a++) for (let k = 0; k < AISLE_SLOTS; k++) aisleSlots[a].push({ pallet: -1 });

  const orders = createOrders(seed, freePallet);

  /* ---- AGV fleet: 20 parked on slots, 12 pre-seeded in transit ---- */
  const agvs: Agv[] = [];
  for (let i = 0; i < AGV_COUNT; i++) agvs.push(createAgv(i));

  /* park the first 20 on the apron slots */
  for (let i = 0; i < SLOT_COUNT; i++) {
    const a = agvs[i];
    a.node = SLOT_NODES[i];
    a.state = 'parked';
    a.battery = 80 + rnd() * 20;
    a.idleSince = i * 0.37;
    owner[a.node] = a.id;
    const n = NODES[a.node];
    a.x = a.px = n.x;
    a.z = a.pz = n.z;
    a.heading = i < 10 ? Math.PI : 0; // face the lane
  }

  /* pre-seed 12 AGVs mid-edge with synthetic in-flight work so the hall
     is busy from the first powered frame */
  const seedLegs: Array<{ from: string; to: string; frac: number; withPallet: boolean }> = [
    { from: 'D4', to: 'D3', frac: 0.5, withPallet: false },
    { from: 'D2', to: 'D1', frac: 0.4, withPallet: false },
    { from: 'D1', to: 'DC1', frac: 0.55, withPallet: true },
    { from: 'RS1', to: 'RC', frac: 0.45, withPallet: false },
    { from: 'RB', to: 'RA', frac: 0.5, withPallet: true },
    { from: 'RA', to: 'RAO', frac: 0.5, withPallet: false },
    { from: 'N2', to: 'J1', frac: 0.5, withPallet: true },
    { from: 'S2', to: 'S1', frac: 0.4, withPallet: true },
    { from: 'E1', to: 'N2', frac: 0.5, withPallet: false },
    { from: 'W2', to: 'W1', frac: 0.5, withPallet: true },
    { from: 'AR2', to: 'AR3', frac: 0.5, withPallet: false },
    { from: 'BPE', to: 'BR1', frac: 0.5, withPallet: true },
  ];
  const nameToIdx = new Map<string, number>();
  NODES.forEach((n, i) => nameToIdx.set(n.id, i));
  seedLegs.forEach((leg, k) => {
    const a = agvs[SLOT_COUNT + k];
    const from = nameToIdx.get(leg.from)!;
    const to = nameToIdx.get(leg.to)!;
    a.edge = edgeBetween(from, to);
    a.s = EDGES[a.edge].len * leg.frac;
    a.v = 1.2;
    a.state = 'working';
    a.battery = 55 + rnd() * 30;
    /* their work continues "somewhere": park after this edge */
    a.path = [from, to];
    a.pi = 1;
    a.legs = [];
    if (leg.withPallet) {
      const p = freePallet();
      if (p >= 0) {
        pallets[p].mode = 'agv';
        pallets[p].agv = a.id;
        a.pallet = p;
      }
    }
    const pos = { x: 0, z: 0 };
    edgePos(a.edge, a.s, pos);
    a.x = a.px = pos.x;
    a.z = a.pz = pos.z;
    a.heading = edgeHeading(a.edge);
    a.lastMove = 0;
  });

  /* ---- other entities ---- */
  const shuttles = createShuttles(rnd);
  const rbgs = createRbgs(rnd);
  const trucks = createTrucks(DOORS.slice(0, 4).map((d) => d.x), rnd);

  /* two pallets ride on the RBG carriages */
  rbgs.forEach((r, i) => {
    const p = freePallet();
    if (p >= 0) {
      pallets[p].mode = 'rbg';
      pallets[p].rbg = i;
    }
  });
  const truckUnloadTimer = [0, 0, 0, 0];

  /* ---- state ---- */
  let time = 0;
  let acc = 0;
  let rate = 1;
  const stats: SimStats = { completed: 0, inTransit: 0, avgDwell: 0, queueLen: 0 };

  /* edge occupancy for predecessor search, rebuilt per step */
  const edgeOcc: number[][] = EDGES.map(() => []);

  function predOnEdge(a: Agv): Agv | null {
    let best: Agv | null = null;
    let bs = Infinity;
    for (const id of edgeOcc[a.edge]) {
      const o = agvs[id];
      if (o.id === a.id || o.edge !== a.edge) continue;
      if (o.s > a.s && o.s < bs) {
        bs = o.s;
        best = o;
      }
    }
    return best;
  }

  /* ---- routing / legs ---- */
  function buildLegs(o: Order): Leg[] {
    const legs: Leg[] = [];
    if (o.type === 'EINLAGERUNG') {
      legs.push({ node: DOOR_NODES[o.pickupIdx], dwell: LOAD_T, action: 'load' });
      legs.push({ node: AISLE_NODES[o.dropIdx], dwell: UNLOAD_T, action: 'unload' });
    } else if (o.type === 'AUSLAGERUNG') {
      legs.push({ node: AISLE_NODES[o.pickupIdx], dwell: LOAD_T, action: 'load' });
      legs.push({ node: NODE.PK, dwell: PACK_T, action: 'pack' });
      legs.push({ node: NODE.D4, dwell: UNLOAD_T, action: 'unload' });
    } else {
      legs.push({ node: AISLE_NODES[o.pickupIdx], dwell: LOAD_T, action: 'load' });
      legs.push({ node: AISLE_NODES[o.dropIdx], dwell: UNLOAD_T, action: 'unload' });
    }
    return legs;
  }

  /* box rule helpers */
  function edgeHasRoom(ei: number, meId: number): boolean {
    for (const id of edgeOcc[ei]) {
      if (id === meId) continue;
      const o = agvs[id];
      if (o.edge === ei && o.s <= EXIT_ROOM) return false;
    }
    return true;
  }
  function exitEdge(a: Agv, node: number): number {
    if (a.legs.length > 0 && a.legs[0].node === node) return -1; // dwell stop
    /* a.path[a.pi] should be `node` (we are arriving there); resync just in case */
    if (a.path[a.pi] !== node) {
      const k = a.path.indexOf(node);
      if (k < 0) return -1;
      a.pi = k;
    }
    if (a.pi + 1 >= a.path.length) return -1;
    return edgeBetween(node, a.path[a.pi + 1]);
  }

  function depart(a: Agv): boolean {
    /* a stands on a.node, a.path[a.pi] is the next node */
    if (a.pi >= a.path.length) return false;
    const ei = edgeBetween(a.node, a.path[a.pi]);
    if (ei < 0) return false;
    if (!edgeHasRoom(ei, a.id)) return false; // exit blocked — wait at the node
    slotTarget[a.node] = -1; // free the parking reservation
    a.edge = ei;
    a.s = 0;
    a.dwellT = 0;
    a.heading = edgeHeading(ei);
    return true;
  }

  function setDestination(a: Agv, node: number): void {
    a.path = routeNodes(a.node, node);
    a.pi = 1;
  }

  /* route + depart toward a node; true if underway (or already there) */
  function goTo(a: Agv, node: number): boolean {
    setDestination(a, node);
    if (node === a.node) return true; // dwell branch handles in place
    return depart(a);
  }

  /* pallet helpers */
  function slotPut(slots: SlotRef[], pos: Array<[number, number]>, pallet: number): boolean {
    for (let k = 0; k < slots.length; k++) {
      if (slots[k].pallet === -1) {
        slots[k].pallet = pallet;
        const pl = pallets[pallet];
        pl.mode = 'slot';
        pl.x = pos[k][0];
        pl.z = pos[k][1];
        pl.y = 0;
        pl.ry = 0;
        return true;
      }
    }
    return false;
  }
  function slotTake(slots: SlotRef[]): number {
    for (let k = 0; k < slots.length; k++) {
      if (slots[k].pallet >= 0) {
        const p = slots[k].pallet;
        slots[k].pallet = -1;
        return p;
      }
    }
    return -1;
  }

  function onArrive(a: Agv): void {
    const n = EDGES[a.edge].to;
    a.edge = -1;
    a.node = n;
    a.v = 0;
    a.x = a.px = NODES[n].x;
    a.z = a.pz = NODES[n].z;

    if (a.legs.length > 0 && a.legs[0].node === n) {
      /* leg destination reached — dwell, then act */
      const leg = a.legs[0];
      a.dwellT = leg.dwell;
      return;
    }
    /* pass-through: continue along the path (exit edge was room-checked
       during approach; re-check — it may have filled since) */
    if (a.pi < a.path.length) {
      const nextNode = a.path[a.pi];
      if (nextNode === n) a.pi++;
      if (a.pi < a.path.length) {
        if (!depart(a)) a.waitDepart = true;
        return;
      }
    }
    /* no more path: park here briefly, dispatcher will re-route */
    a.dwellT = 0.5;
  }

  /* executed when the dwell timer of a leg destination expires */
  function finishLeg(a: Agv): void {
    const leg = a.legs.shift()!;
    const o = activeOrders.get(a.orderId);
    if (leg.action === 'load') {
      /* pick up the pallet the order reserved (visual: slot -> AGV) */
      let p = -1;
      if (o) {
        if (o.type === 'EINLAGERUNG') p = takeFromDoorBuffer(o.pickupIdx, a.id);
        else p = takeFromAisleBuffer(o.pickupIdx, a.id);
        if (p < 0) p = freePallet(); // virtual stock via RBG
        if (p >= 0) {
          pallets[p].mode = 'agv';
          pallets[p].agv = a.id;
          a.pallet = p;
        }
      }
    } else if (leg.action === 'unload') {
      const p = a.pallet;
      a.pallet = -1;
      if (p >= 0) {
        const pl = pallets[p];
        pl.agv = -1;
        if (o && (o.type === 'EINLAGERUNG' || o.type === 'UMLAGERUNG')) {
          if (!slotPut(aisleSlots[o.dropIdx], aisleSlotPos[o.dropIdx], p)) {
            pl.mode = 'gone'; // rack swallowed it directly
          }
        } else {
          pl.mode = 'gone'; // onto the truck at TOR 4
        }
        if (pl.mode === 'gone') recycleSoon(p);
      }
      if (o) {
        activeOrders.delete(a.orderId);
        orders.complete(o);
        stats.completed++;
        const dwell = a.waitAcc + LOAD_T + UNLOAD_T;
        stats.avgDwell = stats.avgDwell === 0 ? dwell : stats.avgDwell * 0.9 + dwell * 0.1;
        a.waitAcc = 0;
      }
      a.orderId = -1;
    }
    /* 'pack' keeps the pallet on the AGV */
  }

  /* reservations made at dispatch so two AGVs never target one pallet */
  const doorReserved: number[][] = [[], [], [], []]; // pallet ids
  const aisleReserved: number[][] = [[], [], []];
  function takeFromDoorBuffer(d: number, agvId: number): number {
    const res = doorReserved[d];
    for (let i = 0; i < res.length; i++) {
      if (true) {
        const p = res[i];
        /* find in slots and remove */
        for (const s of doorSlots[d]) {
          if (s.pallet === p) {
            s.pallet = -1;
            res.splice(i, 1);
            return p;
          }
        }
        res.splice(i, 1);
      }
    }
    return slotTake(doorSlots[d]);
  }
  function takeFromAisleBuffer(a: number, agvId: number): number {
    const res = aisleReserved[a];
    for (let i = 0; i < res.length; i++) {
      const p = res[i];
      for (const s of aisleSlots[a]) {
        if (s.pallet === p) {
          s.pallet = -1;
          res.splice(i, 1);
          return p;
        }
      }
      res.splice(i, 1);
    }
    return slotTake(aisleSlots[a]);
  }

  /* pallets that "vanished" into rack/truck return to the pool slowly,
     so the visible stock doesn't flicker */
  const recycleQueue: Array<{ p: number; at: number }> = [];
  function recycleSoon(p: number): void {
    recycleQueue.push({ p, at: time + 2 });
  }

  const activeOrders = new Map<number, Order>();

  function transitCount(): number {
    let c = 0;
    for (const a of agvs) if (a.state === 'working' || a.state === 'toPark') c++;
    return c;
  }

  function dispatch(): void {
    let transit = transitCount();
    /* assign queued orders to the longest-parked AGVs first */
    for (;;) {
      if (transit >= MAX_TRANSIT || orders.queue.length === 0) break;
      const idle = agvs
        .filter((a) => a.state === 'parked' && a.battery > 30 && !a.hold)
        .sort((x, y) => x.idleSince - y.idleSince)[0];
      if (!idle) break;
      const o = orders.dispatch()!;
      /* reserve the source pallet so the visual stays causal */
      if (o.type === 'EINLAGERUNG') {
        const p = peekSlot(doorSlots[o.pickupIdx]);
        if (p < 0) {
          orders.queue.unshift(o);
          break;
        }
        doorReserved[o.pickupIdx].push(p);
      } else {
        const p = peekSlot(aisleSlots[o.pickupIdx]);
        if (p >= 0) aisleReserved[o.pickupIdx].push(p);
      }
      activeOrders.set(o.id, o);
      idle.orderId = o.id;
      idle.legs = buildLegs(o);
      idle.state = 'working';
      if (!goTo(idle, idle.legs[0].node)) idle.waitDepart = true;
      transit++;
    }
  }
  function peekSlot(slots: SlotRef[]): number {
    for (const s of slots) if (s.pallet >= 0) return s.pallet;
    return -1;
  }

  /* free slot for a returning AGV */
  function freeParkSlot(): number {
    for (const sn of SLOT_NODES) {
      if (owner[sn] === -1 && slotTarget[sn] === -1) return sn;
    }
    return -1;
  }

  function step(): void {
    time += STEP;

    /* rebuild edge occupancy */
    for (const occ of edgeOcc) occ.length = 0;
    for (const a of agvs) if (a.edge >= 0) edgeOcc[a.edge].push(a.id);

    /* order generation + dispatch */
    orders.step(time);
    dispatch();

    /* AGVs */
    for (const a of agvs) {
      if (a.hold && time >= a.holdUntil) a.hold = false;

      if (a.edge < 0) {
        /* standing on a node */
        if (a.waitDepart) {
          if (!a.hold && depart(a)) a.waitDepart = false;
        } else if (a.legs.length > 0 && a.legs[0].node === a.node && !a.hold) {
          a.dwellT -= STEP;
          if (a.dwellT <= 0) {
            finishLeg(a);
            if (a.legs.length > 0) {
              if (!goTo(a, a.legs[0].node)) a.waitDepart = true;
            } else {
              afterWork(a);
            }
          }
        } else if (a.dwellT > 0 && a.legs.length === 0 && !a.hold) {
          a.dwellT -= STEP;
          if (a.dwellT <= 0) afterWork(a);
        } else if (a.state === 'parked') {
          a.idleSince = Math.min(a.idleSince, time);
          /* charging */
          if (a.battery < 100) a.battery = Math.min(100, a.battery + 5 * STEP);
        }
        a.status = a.hold ? 2 : a.state === 'parked' ? 1 : a.status;
      } else {
        stepAgv(a, STEP, { time, owner, predOnEdge, exitEdge, edgeHasRoom, onArrive });
      }
    }

    /* shuttles / RBGs */
    for (const s of shuttles) stepShuttle(s, STEP, rnd);
    rbgs.forEach((r, i) => {
      stepRbg(r, STEP, rnd);
      const pl = pallets.find((p) => p.mode === 'rbg' && p.rbg === i);
      if (pl) {
        pl.x = r.x;
        pl.z = r.z;
        pl.y = r.liftY + 0.35;
      }
    });

    /* trucks: pallet spawn while unloading at inbound doors */
    trucks.forEach((tr) => {
      stepTruck(tr, STEP, rnd, () => {});
      if (tr.phase === 'work' && tr.door < INBOUND_DOORS) {
        truckUnloadTimer[tr.door] -= STEP;
        if (truckUnloadTimer[tr.door] <= 0) {
          truckUnloadTimer[tr.door] = 2.6 + rnd() * 1.2;
          const p = freePallet();
          if (p >= 0) slotPut(doorSlots[tr.door], doorSlotPos[tr.door], p);
        }
      }
    });

    /* pallet recycling */
    for (let i = recycleQueue.length - 1; i >= 0; i--) {
      if (time >= recycleQueue[i].at) {
        pallets[recycleQueue[i].p].mode = 'free';
        recycleQueue.splice(i, 1);
      }
    }

    /* pallets ride on AGVs */
    for (const a of agvs) {
      if (a.pallet >= 0) {
        const pl = pallets[a.pallet];
        pl.x = a.x;
        pl.z = a.z;
        pl.y = 0.62;
        pl.ry = a.heading;
      }
    }

    /* stats */
    stats.inTransit = transitCount();
    stats.queueLen = orders.queue.length;
  }

  /* after all legs are done: next order or park */
  function afterWork(a: Agv): void {
    if (a.state === 'toPark') {
      a.state = 'parked';
      a.idleSince = time;
      return;
    }
    /* battery low or dispatcher wants the slot? park; else keep working */
    const needCharge = a.battery < 25;
    const slot = freeParkSlot();
    if (needCharge && slot >= 0) {
      slotTarget[slot] = a.id;
      a.state = 'toPark';
      a.legs = [{ node: slot, dwell: 0, action: 'park' }];
      if (!goTo(a, slot)) a.waitDepart = true;
      return;
    }
    if (!needCharge && orders.queue.length > 0) {
      /* pick up work immediately from where we stand */
      const o = orders.dispatch()!;
      if (o.type === 'EINLAGERUNG') {
        const p = peekSlot(doorSlots[o.pickupIdx]);
        if (p < 0) {
          orders.queue.unshift(o);
          parkOrIdle(a, slot);
          return;
        }
        doorReserved[o.pickupIdx].push(p);
      } else {
        const p = peekSlot(aisleSlots[o.pickupIdx]);
        if (p >= 0) aisleReserved[o.pickupIdx].push(p);
      }
      activeOrders.set(o.id, o);
      a.orderId = o.id;
      a.legs = buildLegs(o);
      a.state = 'working';
      if (!goTo(a, a.legs[0].node)) a.waitDepart = true;
      return;
    }
    parkOrIdle(a, slot);
  }

  function parkOrIdle(a: Agv, slot: number): void {
    if (slot >= 0 && transitCount() > 6) {
      slotTarget[slot] = a.id;
      a.state = 'toPark';
      a.legs = [{ node: slot, dwell: 0, action: 'park' }];
      if (!goTo(a, slot)) a.waitDepart = true;
    } else {
      /* stay useful: wander the loop as filler traffic */
      a.state = 'working';
      a.legs = [];
      const wander = [NODE.PK, NODE.RC, NODE.D2, NODE.RB][a.id % 4];
      a.legs = [{ node: wander, dwell: 1.5, action: 'pack' }];
      if (!goTo(a, wander)) a.waitDepart = true;
    }
  }

  return {
    get time() {
      return time;
    },
    agvs,
    shuttles,
    rbgs,
    trucks,
    pallets,
    stats,
    orders,
    advance(dt: number) {
      acc += dt * rate;
      let n = 0;
      while (acc >= STEP && n < 40) {
        step();
        acc -= STEP;
        n++;
      }
      if (n >= 40) acc = 0; // hiccup guard
    },
    step,
    alpha() {
      return Math.min(1, acc / STEP);
    },
    toggleHold(id: number): boolean {
      const a = agvs[id];
      if (!a) return false;
      a.hold = !a.hold;
      if (a.hold) a.holdUntil = time + HOLD_TIMEOUT;
      return a.hold;
    },
    holdCount() {
      let c = 0;
      for (const a of agvs) if (a.hold) c++;
      return c;
    },
    firstWorkingAgv() {
      for (const a of agvs) if (a.state === 'working' && a.edge >= 0) return a.id;
      return -1;
    },
    /** debug/test: which AGV owns node */
    ownerOf(node: number): number {
      return owner[node];
    },
    /* test/power hook: 0 = frozen … 1 = full rate */
    setRate(r: number) {
      rate = Math.max(0, Math.min(1, r));
    },
  } as Sim & { setRate(r: number): void };
}

/* door dock z for the renderer */
export { TRUCK_DOCK_Z };
