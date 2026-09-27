/* ------------------------------------------------------------------ */
/* Agenten der Halle — three-free, deterministisch, 10-Hz-Tick.        */
/*                                                                     */
/* AGV:    Kantenfahrt mit Mindestabstand, Knoten-Reservierung (1 AGV  */
/*         je Knoten), Halt per Besucher-Tap (hold) mit 8-s-Timeout.   */
/* Shuttle/RBG: Regalgang-Betrieb (horizontal + Hub), kosmetisch aber  */
/*         zustandsbasiert.                                            */
/* LKW:    anfahrt -> andocken -> be-/entladen -> abfahrt, je Tor.     */
/*                                                                     */
/* Explicit .ts imports: Node lädt dieses Modul direkt (Sim-Test).     */
/* ------------------------------------------------------------------ */

import { NODES, EDGES } from './graph.ts';

/* ---- tuning -------------------------------------------------------- */
export const AGV_COUNT = 32;
export const V_FREE = 2.8; // m/s
export const ACCEL = 1.7; // m/s²
export const DECEL = 2.8; // m/s²
export const GAP = 3.2; // min center distance on the same edge
export const STOPLINE = 3.2; // stop this far before a blocked node
export const RESERVE_DIST = 6.0; // reserve the next node within this range
export const TAIL_CLEAR = 2.6; // release the previous node after this
export const CROSSLINE = 0.9; // wait this far before a node whose exit is full
export const EXIT_ROOM = 5.0; // only enter an edge if its rearmost AGV is past this
export const HOLD_TIMEOUT = 8.0; // s (sim time)

export const AGV_GO = 0;
export const AGV_WAIT = 1;
export const AGV_HOLD = 2;

export interface Leg {
  node: number;
  dwell: number; // s at destination
  action: 'load' | 'unload' | 'pack' | 'park';
}

export interface Agv {
  id: number;
  /* locomotion */
  edge: number; // -1 = standing on `node`
  node: number;
  s: number;
  v: number;
  path: number[]; // node indices, path[0] = current node when edge=-1
  pi: number; // index of the node we are heading to
  /* work */
  legs: Leg[];
  state: 'parked' | 'working' | 'toPark';
  dwellT: number;
  orderId: number;
  pallet: number; // pool id or -1
  battery: number; // 0..100
  /* interaction */
  hold: boolean;
  holdUntil: number;
  /** standing on a node, waiting for exit-edge room */
  waitDepart: boolean;
  /* bookkeeping */
  x: number;
  z: number;
  px: number;
  pz: number;
  heading: number;
  status: number; // AGV_GO/WAIT/HOLD
  lastMove: number;
  waitAcc: number; // s spent standing while working (dwell stat)
  idleSince: number;
}

export interface AgvCtx {
  time: number;
  owner: Int32Array; // node -> agv id | -1
  predOnEdge: (a: Agv) => Agv | null;
  /** edge the AGV will take AFTER `node` (-1: node is a dwell stop) */
  exitEdge: (a: Agv, node: number) => number;
  /** true if every AGV on edge ei is past EXIT_ROOM (or edge empty) */
  edgeHasRoom: (ei: number, meId: number) => boolean;
  onArrive: (a: Agv) => void;
}

export function createAgv(id: number): Agv {
  return {
    id,
    edge: -1,
    node: 0,
    s: 0,
    v: 0,
    path: [],
    pi: 0,
    legs: [],
    state: 'parked',
    dwellT: 0,
    orderId: -1,
    pallet: -1,
    battery: 60,
    hold: false,
    holdUntil: 0,
    waitDepart: false,
    x: 0,
    z: 0,
    px: 0,
    pz: 0,
    heading: 0,
    status: AGV_WAIT,
    lastMove: 0,
    waitAcc: 0,
    idleSince: 0,
  };
}

/* position on edge polyline at arc length s (2-point polylines) */
export function edgePos(ei: number, s: number, out: { x: number; z: number }): void {
  const e = EDGES[ei];
  const [x0, z0] = e.pts[0];
  const [x1, z1] = e.pts[e.pts.length - 1];
  const t = e.len > 0 ? Math.min(1, s / e.len) : 0;
  out.x = x0 + (x1 - x0) * t;
  out.z = z0 + (z1 - z0) * t;
}

export function edgeHeading(ei: number): number {
  const e = EDGES[ei];
  const [x0, z0] = e.pts[0];
  const [x1, z1] = e.pts[e.pts.length - 1];
  return Math.atan2(x1 - x0, z1 - z0); // three.js yaw convention (y-up)
}

/* one fixed-step movement tick for a single AGV */
export function stepAgv(a: Agv, dt: number, ctx: AgvCtx): void {
  if (a.edge < 0) {
    /* standing on a node (dwell) — world.ts drives departures */
    a.v = 0;
    return;
  }
  const e = EDGES[a.edge];
  const next = e.to;

  /* stop-point search */
  let stopAt = e.len; // dwell destination: center may reach the node
  const pred = ctx.predOnEdge(a);
  const ownsNext = ctx.owner[next] === a.id;
  if (!ownsNext) {
    /* only the FRONTMOST AGV on an edge may claim the next node —
       otherwise a follower could claim it ahead of its predecessor
       and both would wait forever (ownership inversion) */
    if (!pred && e.len - a.s < RESERVE_DIST && ctx.owner[next] === -1) {
      ctx.owner[next] = a.id; // claim
    }
    if (ctx.owner[next] !== a.id) stopAt = Math.min(stopAt, Math.max(0, e.len - STOPLINE));
  }
  /* don't block the box: only cross into the node when the exit edge
     has room for the whole vehicle — wait just outside otherwise */
  if (ctx.owner[next] === a.id) {
    const e2 = ctx.exitEdge(a, next);
    if (e2 >= 0 && !ctx.edgeHasRoom(e2, a.id)) {
      stopAt = Math.min(stopAt, Math.max(0, e.len - CROSSLINE));
    }
  }
  if (pred) stopAt = Math.min(stopAt, pred.s - GAP);

  /* speed profile toward the stop point */
  let vt: number;
  if (a.hold) vt = 0;
  else {
    const room = stopAt - a.s;
    vt = room <= 0 ? 0 : Math.min(V_FREE, Math.sqrt(2 * DECEL * room));
  }
  const dv = vt - a.v;
  const maxDv = (dv > 0 ? ACCEL : DECEL) * dt;
  a.v += Math.abs(dv) < maxDv ? dv : Math.sign(dv) * maxDv;
  if (a.v < 0.001 && vt === 0) a.v = 0;

  a.px = a.x;
  a.pz = a.z;
  a.s += a.v * dt;
  if (a.s > e.len) a.s = e.len;

  const pos = { x: a.x, z: a.z };
  edgePos(a.edge, a.s, pos);
  a.x = pos.x;
  a.z = pos.z;
  a.heading = edgeHeading(a.edge);

  /* release the node behind once the tail has cleared it */
  if (ctx.owner[e.from] === a.id && a.s > TAIL_CLEAR) ctx.owner[e.from] = -1;

  if (a.v > 0.03) a.lastMove = ctx.time;
  else if (a.state === 'working') a.waitAcc += dt;

  /* battery */
  a.battery = Math.max(0, a.battery - (a.v > 0.03 ? 0.25 : 0.1) * dt);

  /* arrival: only possible when the node is owned (stop line else) */
  if (a.s >= e.len - 1e-4 && ctx.owner[next] === a.id) {
    ctx.onArrive(a);
  }

  /* status light */
  a.status = a.hold ? AGV_HOLD : a.v < 0.05 && a.state !== 'parked' ? AGV_WAIT : AGV_GO;
}

/* ---- shuttles (Regalgang-Ebenen) ------------------------------------ */

export interface Shuttle {
  aisle: number; // 0..2
  x: number;
  y: number;
  z: number;
  pz: number;
  tz: number;
  dwellT: number;
}

export function createShuttles(rnd: () => number): Shuttle[] {
  const xs = [-55.4, -49.6, -43.8];
  const out: Shuttle[] = [];
  for (let k = 0; k < 6; k++) {
    const aisle = k % 3;
    const level = k < 3 ? 3 : 7;
    const z = -13 + rnd() * 26;
    out.push({
      aisle,
      x: xs[aisle],
      y: 0.55 + level * 0.95,
      z,
      pz: z,
      tz: z,
      dwellT: rnd() * 2,
    });
  }
  return out;
}

export function stepShuttle(s: Shuttle, dt: number, rnd: () => number): void {
  s.pz = s.z;
  if (s.dwellT > 0) {
    s.dwellT -= dt;
    return;
  }
  const d = s.tz - s.z;
  const step = 2.2 * dt;
  if (Math.abs(d) <= step) {
    s.z = s.tz;
    s.tz = -13.5 + rnd() * 27;
    s.dwellT = 0.8 + rnd() * 2.4;
  } else {
    s.z += Math.sign(d) * step;
  }
}

/* ---- RBG (Regalbediengerät, Gang A + C) ------------------------------ */

export interface Rbg {
  x: number; // aisle center
  z: number;
  pz: number;
  liftY: number;
  plY: number; // prev lift
  tz: number;
  ty: number;
  phase: 'travel' | 'lift' | 'dwell' | 'lower';
  dwellT: number;
}

export function createRbgs(rnd: () => number): Rbg[] {
  return [-55.4, -43.8].map((x) => ({
    x,
    z: -10 + rnd() * 20,
    pz: 0,
    liftY: 0.4,
    plY: 0.4,
    tz: -13 + rnd() * 26,
    ty: 2 + rnd() * 8.5,
    phase: 'travel',
    dwellT: 0,
  }));
}

export function stepRbg(r: Rbg, dt: number, rnd: () => number): void {
  r.pz = r.z;
  r.plY = r.liftY;
  if (r.phase === 'dwell') {
    r.dwellT -= dt;
    if (r.dwellT <= 0) r.phase = 'lower';
    return;
  }
  if (r.phase === 'travel') {
    const d = r.tz - r.z;
    const step = 2.6 * dt;
    if (Math.abs(d) <= step) {
      r.z = r.tz;
      r.phase = 'lift';
    } else r.z += Math.sign(d) * step;
    return;
  }
  const target = r.phase === 'lift' ? r.ty : 0.4;
  const dY = target - r.liftY;
  const stepY = 1.5 * dt;
  if (Math.abs(dY) <= stepY) {
    r.liftY = target;
    if (r.phase === 'lift') {
      r.phase = 'dwell';
      r.dwellT = 1.6 + rnd() * 2.6;
    } else {
      r.phase = 'travel';
      r.tz = -13.5 + rnd() * 27;
      r.ty = 2 + rnd() * 8.5;
    }
  } else r.liftY += Math.sign(dY) * stepY;
}

/* ---- LKW (einer pro Tor, zeitversetzt) -------------------------------- */

export type TruckPhase = 'away' | 'approach' | 'dock' | 'work' | 'leave';

export interface Truck {
  door: number; // 0..3
  x: number;
  z: number;
  pz: number;
  phase: TruckPhase;
  t: number; // time in phase
  dur: number; // phase duration
}

export const TRUCK_DOCK_Z = -36.9;
export const TRUCK_FAR_Z = -62;

export function createTrucks(doorsX: number[], rnd: () => number): Truck[] {
  return doorsX.map((x, i) => ({
    door: i,
    x,
    z: TRUCK_FAR_Z,
    pz: TRUCK_FAR_Z,
    phase: 'away',
    t: 0,
    dur: 2 + i * 6.5 + rnd() * 5, // zeitversetzt
  }));
}

const APPROACH_T = 5.5;

export function stepTruck(
  tr: Truck,
  dt: number,
  rnd: () => number,
  onUnload: (door: number) => void,
): void {
  tr.pz = tr.z;
  tr.t += dt;
  if (tr.phase === 'away') {
    if (tr.t >= tr.dur) {
      tr.phase = 'approach';
      tr.t = 0;
    }
    return;
  }
  if (tr.phase === 'approach' || tr.phase === 'leave') {
    const k = Math.min(1, tr.t / APPROACH_T);
    const ease = k * k * (3 - 2 * k);
    tr.z =
      tr.phase === 'approach'
        ? TRUCK_FAR_Z + (TRUCK_DOCK_Z - TRUCK_FAR_Z) * ease
        : TRUCK_DOCK_Z + (TRUCK_FAR_Z - TRUCK_DOCK_Z) * ease;
    if (k >= 1) {
      tr.phase = tr.phase === 'approach' ? 'dock' : 'away';
      tr.t = 0;
      tr.dur = tr.phase === 'away' ? 7 + rnd() * 12 : 1.2;
    }
    return;
  }
  if (tr.phase === 'dock') {
    if (tr.t >= tr.dur) {
      tr.phase = 'work';
      tr.t = 0;
      tr.dur = 11 + rnd() * 7;
      onUnload(tr.door); // first pallet rolls out at dock time
    }
    return;
  }
  /* work: be-/entladen */
  if (tr.t >= tr.dur) {
    tr.phase = 'leave';
    tr.t = 0;
    return;
  }
}
