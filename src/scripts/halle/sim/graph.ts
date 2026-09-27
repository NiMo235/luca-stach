/* ------------------------------------------------------------------ */
/* Wegenetz der Halle — three-free, shared between runtime, the        */
/* headless sim test and the floor-texture painter (shell.ts draws the */
/* lane markings FROM this data: if marking and graph disagree, the    */
/* graph wins and the texture follows).                                */
/*                                                                     */
/* Construction: every road is one-way; all cycles are directed loops  */
/* (main loop counter-clockwise seen from above with z south), spurs   */
/* are dead-end parking slots off one-way apron roads. Deadlocks are   */
/* prevented by construction + a dispatcher transit cap (world.ts).    */
/*                                                                     */
/* Explicit .ts extension on imports: loaded by Node directly.         */
/* ------------------------------------------------------------------ */

export interface SimNode {
  id: string;
  x: number;
  z: number;
  /** AGVs stop here for loading/unloading/charging/parking */
  dwell: boolean;
}

export interface SimEdge {
  from: number;
  to: number;
  /** polyline incl. both endpoints, world coords */
  pts: Array<[number, number]>;
  len: number;
}

/* ---- node table ---------------------------------------------------- */

const NODE_DEFS: Array<[string, number, number, boolean?]> = [
  // main loop (counter-clockwise: west on the north side, east on the south)
  ['N2', 23, -13],
  ['J1', 12, -13],
  ['N1', -13, -13],
  ['W2', -22, -4],
  ['W1', -22, 4],
  ['S2', -13, 13],
  ['S1', 23, 13],
  ['E2', 32, 4],
  ['E1', 32, -4],
  // dock branch (one-way west along the doors, returns via DC1 -> N1)
  ['PK', 14, -20, true], // pack station
  ['D4', 10, -25, true], // TOR 4 — outbound (AUSLAGERUNG drop)
  ['D3', -10, -25, true],
  ['D2', -30, -25, true],
  ['D1', -50, -25, true],
  ['DC1', -40, -20],
  // rack branch (one-way west along the rack south face, back east on a
  // parallel lane 2.8 m south, rejoining the loop at S2)
  ['RS1', -26, 17],
  ['RC', -43.8, 17, true], // aisle C transfer
  ['RB', -49.6, 17, true], // aisle B transfer
  ['RA', -55.4, 17, true], // aisle A transfer
  ['RAO', -55.4, 19.8],
  ['RBO', -49.6, 19.8],
  ['RS2', -24, 19.5],
  // apron (Ladeplatz) inside the loop: two one-way roads, dead-end spurs
  ['APE', -16, 6],
  ['AR1', -8, 6],
  ['AR2', 0, 6],
  ['AR3', 8, 6],
  ['APX', 17, 5],
  ['BPE', -16, 0],
  ['BR1', -8, 0],
  ['BR2', 0, 0],
  ['BR3', 8, 0],
  ['BPX', 14, 0],
];

/* parking slots: 2 rows of 10, x = -15 … 15.6 step 3.4 */
const SLOT_XS = [-15, -11.6, -8.2, -4.8, -1.4, 2, 5.4, 8.8, 12.2, 15.6];

export const NODES: SimNode[] = NODE_DEFS.map(([id, x, z, dwell]) => ({
  id,
  x,
  z,
  dwell: dwell === true,
}));
/* slot nodes appended after the static ones */
const SOUTH_LANE = ['APE', 'AR1', 'AR2', 'AR3', 'APX'];
const NORTH_LANE = ['BPE', 'BR1', 'BR2', 'BR3', 'BPX'];
const southLaneX = [-16, -8, 0, 8, 17];
const slotLane: number[] = []; // slot index -> lane node index (filled below)

function nearestLane(x: number): number {
  let best = 0;
  let bd = Infinity;
  southLaneX.forEach((lx, i) => {
    const d = Math.abs(lx - x);
    if (d < bd) {
      bd = d;
      best = i;
    }
  });
  return best;
}

SLOT_XS.forEach((x, k) => {
  NODES.push({ id: `SK${k}`, x, z: 9.5, dwell: true });
  slotLane.push(nearestLane(x));
});
const NK_BASE = NODES.length;
SLOT_XS.forEach((x, k) => {
  NODES.push({ id: `NK${k}`, x, z: -3, dwell: true });
});

const IDX = new Map<string, number>();
NODES.forEach((n, i) => IDX.set(n.id, i));
const NI = (id: string): number => {
  const i = IDX.get(id);
  if (i === undefined) throw new Error(`unknown node ${id}`);
  return i;
};

/* ---- edge table ---------------------------------------------------- */

const EDGE_PAIRS: Array<[string, string]> = [
  // main loop
  ['N2', 'J1'], ['J1', 'N1'], ['N1', 'W2'], ['W2', 'W1'], ['W1', 'S2'],
  ['S2', 'S1'], ['S1', 'E2'], ['E2', 'E1'], ['E1', 'N2'],
  // dock branch
  ['J1', 'PK'], ['PK', 'D4'], ['D4', 'D3'], ['D3', 'D2'], ['D2', 'D1'],
  ['D1', 'DC1'], ['DC1', 'N1'],
  // rack branch
  ['W1', 'RS1'], ['RS1', 'RC'], ['RC', 'RB'], ['RB', 'RA'], ['RA', 'RAO'],
  ['RAO', 'RBO'], ['RBO', 'RS2'], ['RS2', 'S2'],
  // apron roads (entry from the west straight, exit to the south/east)
  ['W1', 'APE'], ['APE', 'AR1'], ['AR1', 'AR2'], ['AR2', 'AR3'], ['AR3', 'APX'],
  ['APX', 'S1'],
  ['W2', 'BPE'], ['BPE', 'BR1'], ['BR1', 'BR2'], ['BR2', 'BR3'], ['BR3', 'BPX'],
  ['BPX', 'E2'],
];

export const EDGES: SimEdge[] = EDGE_PAIRS.map(([a, b]) => {
  const from = NI(a);
  const to = NI(b);
  const pts: Array<[number, number]> = [
    [NODES[from].x, NODES[from].z],
    [NODES[to].x, NODES[to].z],
  ];
  return { from, to, pts, len: dist2(pts[0], pts[1]) };
});

/* parking spurs: lane node -> slot and slot -> lane node (reverse out) */
SLOT_XS.forEach((_, k) => {
  const lane = NI(SOUTH_LANE[slotLane[k]]);
  const slot = NI(`SK${k}`);
  pushEdge(lane, slot);
  pushEdge(slot, lane);
});
SLOT_XS.forEach((_, k) => {
  const lane = NI(NORTH_LANE[slotLane[k]]);
  const slot = NI(`NK${k}`);
  pushEdge(lane, slot);
  pushEdge(slot, lane);
});

function dist2(a: [number, number], b: [number, number]): number {
  return Math.hypot(b[0] - a[0], b[1] - a[1]);
}
function pushEdge(from: number, to: number): void {
  const pts: Array<[number, number]> = [
    [NODES[from].x, NODES[from].z],
    [NODES[to].x, NODES[to].z],
  ];
  EDGES.push({ from, to, pts, len: dist2(pts[0], pts[1]) });
}

/* adjacency: node -> edge indices */
export const OUT_EDGES: number[][] = NODES.map(() => []);
EDGES.forEach((e, i) => OUT_EDGES[e.from].push(i));

export function edgeBetween(from: number, to: number): number {
  for (const ei of OUT_EDGES[from]) if (EDGES[ei].to === to) return ei;
  return -1;
}

/* ---- routing: Dijkstra over the directed graph (tiny net) ---------- */

export function routeNodes(from: number, to: number): number[] {
  const n = NODES.length;
  const dist = new Array<number>(n).fill(Infinity);
  const prev = new Array<number>(n).fill(-1);
  const done = new Array<boolean>(n).fill(false);
  dist[from] = 0;
  for (;;) {
    let u = -1;
    let du = Infinity;
    for (let i = 0; i < n; i++) {
      if (!done[i] && dist[i] < du) {
        du = dist[i];
        u = i;
      }
    }
    if (u < 0) break;
    done[u] = true;
    if (u === to) break;
    for (const ei of OUT_EDGES[u]) {
      const e = EDGES[ei];
      const nd = du + e.len;
      if (nd < dist[e.to]) {
        dist[e.to] = nd;
        prev[e.to] = u;
      }
    }
  }
  if (!done[to]) return [from];
  const path: number[] = [];
  for (let c = to; c !== -1; c = prev[c]) path.push(c);
  path.reverse();
  return path;
}

/* ---- named lookups used by orders/world ---------------------------- */

export const NODE = {
  PK: NI('PK'),
  D1: NI('D1'),
  D2: NI('D2'),
  D3: NI('D3'),
  D4: NI('D4'),
  RA: NI('RA'),
  RB: NI('RB'),
  RC: NI('RC'),
};
/** door index 0..2 (inbound) -> dwell node; door 3 is the outbound D4 */
export const DOOR_NODES = [NODE.D1, NODE.D2, NODE.D3, NODE.D4];
/** aisle index 0..2 (A/B/C) -> transfer node */
export const AISLE_NODES = [NODE.RA, NODE.RB, NODE.RC];
/** parking slot node indices (south row then north row) */
export const SLOT_NODES: number[] = [];
SLOT_XS.forEach((_, k) => SLOT_NODES.push(NI(`SK${k}`)));
SLOT_XS.forEach((_, k) => SLOT_NODES.push(NI(`NK${k}`)));
export const SLOT_COUNT = SLOT_NODES.length; // 20

/* ---- lane polylines for the floor texture (shell.ts) ----------------
   every drivable lane as a world-space polyline; the texture painter
   draws them as dashed acid lines so markings match the graph 1:1     */

export const MARK_LANES: Array<Array<[number, number]>> = [];
{
  const chain = (ids: string[]): Array<[number, number]> =>
    ids.map((id) => {
      const n = NODES[NI(id)];
      return [n.x, n.z] as [number, number];
    });
  MARK_LANES.push(chain(['J1', 'PK', 'D4', 'D3', 'D2', 'D1', 'DC1', 'N1']));
  MARK_LANES.push(chain(['W1', 'RS1', 'RC', 'RB', 'RA']));
  MARK_LANES.push(chain(['RA', 'RAO', 'RBO', 'RS2', 'S2']));
  MARK_LANES.push(chain(['W1', 'APE', 'AR1', 'AR2', 'AR3', 'APX', 'S1']));
  MARK_LANES.push(chain(['W2', 'BPE', 'BR1', 'BR2', 'BR3', 'BPX', 'E2']));
  /* spur ticks */
  SLOT_XS.forEach((x, k) => {
    const lane = NODES[NI(SOUTH_LANE[slotLane[k]])];
    MARK_LANES.push([
      [lane.x, lane.z],
      [x, 9.5],
    ]);
    const laneN = NODES[NI(NORTH_LANE[slotLane[k]])];
    MARK_LANES.push([
      [laneN.x, laneN.z],
      [x, -3],
    ]);
  });
}
