/* ------------------------------------------------------------------ */
/* Auftragsgenerator + Prioritäts-Queue — three-free, seeded.          */
/*                                                                     */
/* EINLAGERUNG:  LKW-Puffer am Tor  -> Regal-Übergabe (AGV trägt)      */
/* AUSLAGERUNG:  Regal-Übergabe     -> Pack (PK) -> TOR 4              */
/* UMLAGERUNG:   Regal A            -> Regal B (Füller, hält Betrieb)  */
/*                                                                     */
/* Puffer-Slots: 3 pro Tor (sichtbar vor der Rampe), 2 pro Regalgang.  */
/* Der Generator erzeugt nur Aufträge, deren Quelle/Ziel physisch      */
/* möglich ist (Palette vorhanden / Slot frei) — der Rest wartet.      */
/* ------------------------------------------------------------------ */

import { rng } from './rand.ts';

export type OrderType = 'EINLAGERUNG' | 'AUSLAGERUNG' | 'UMLAGERUNG';

export interface Order {
  id: number;
  type: OrderType;
  prio: number; // 0 normal, 1 eilig (jump queue)
  /** pickup: door index 0..2 for EINLAGERUNG, aisle 0..2 otherwise */
  pickupKind: 'door' | 'rack';
  pickupIdx: number;
  /** drop: aisle 0..2 for EINLAGERUNG/UMLAGERUNG; AUSLAGERUNG ends at D4 */
  dropIdx: number;
  /** pallet pool id reserved for this order (-1 until assigned) */
  pallet: number;
  createdAt: number;
}

export interface BufferState {
  /** pallets currently visible per door buffer (pallet ids) */
  door: number[][];
  /** pallets currently visible per aisle transfer (pallet ids) */
  aisle: number[][];
}

export const DOOR_SLOTS = 3;
export const AISLE_SLOTS = 2;
export const AISLE_COUNT = 3;
export const INBOUND_DOORS = 3; // D1..D3 receive; D4 ships

export interface OrderSystem {
  queue: Order[];
  buffers: BufferState;
  /** pull the highest-prio oldest feasible order (or null) */
  dispatch(): Order | null;
  complete(o: Order): void;
  count: number; // completed orders
  step(now: number): void;
}

export function createOrders(seed: number, palletFree: () => number): OrderSystem {
  const rnd = rng(seed ^ 0x5f3a);
  const buffers: BufferState = {
    door: [[], [], [], []],
    aisle: [[], [], []],
  };
  const queue: Order[] = [];
  let nextId = 1;
  let nextGen = 2.0; // first orders appear quickly after power-up

  const freeAisleSlot = (): number => {
    const opts: number[] = [];
    for (let a = 0; a < AISLE_COUNT; a++) if (buffers.aisle[a].length < AISLE_SLOTS) opts.push(a);
    return opts.length ? opts[(rnd() * opts.length) | 0] : -1;
  };
  const stockedAisle = (): number => {
    const opts: number[] = [];
    for (let a = 0; a < AISLE_COUNT; a++) if (buffers.aisle[a].length > 0) opts.push(a);
    return opts.length ? opts[(rnd() * opts.length) | 0] : -1;
  };
  const stockedDoor = (): number => {
    const opts: number[] = [];
    for (let d = 0; d < INBOUND_DOORS; d++) if (buffers.door[d].length > 0) opts.push(d);
    return opts.length ? opts[(rnd() * opts.length) | 0] : -1;
  };

  function generate(now: number): void {
    if (queue.length >= 12) return;
    const roll = rnd();
    const prio = rnd() < 0.15 ? 1 : 0;
    let o: Order | null = null;
    if (roll < 0.45) {
      /* EINLAGERUNG: braucht Palette am Tor + freien Regal-Slot */
      const d = stockedDoor();
      const a = freeAisleSlot();
      if (d >= 0 && a >= 0) {
        o = { id: nextId++, type: 'EINLAGERUNG', prio, pickupKind: 'door', pickupIdx: d, dropIdx: a, pallet: -1, createdAt: now };
      }
    } else if (roll < 0.85) {
      /* AUSLAGERUNG: Palette vom Übergabepunkt (oder virt. aus dem Regal) */
      const a = stockedAisle();
      const src = a >= 0 ? a : (rnd() * AISLE_COUNT) | 0;
      o = { id: nextId++, type: 'AUSLAGERUNG', prio, pickupKind: 'rack', pickupIdx: src, dropIdx: 3, pallet: -1, createdAt: now };
    } else {
      /* UMLAGERUNG */
      const a = stockedAisle();
      if (a >= 0) {
        let b = freeAisleSlot();
        if (b === a) b = -1;
        if (b >= 0) {
          o = { id: nextId++, type: 'UMLAGERUNG', prio, pickupKind: 'rack', pickupIdx: a, dropIdx: b, pallet: -1, createdAt: now };
        }
      }
    }
    if (o && o.pallet < 0) {
      /* reserve a pool pallet right away so the visual stays causal */
      const p = palletFree();
      if (p < 0) return;
      o.pallet = p;
      queue.push(o);
      if (o.prio) queue.sort((x, y) => y.prio - x.prio || x.createdAt - y.createdAt);
    }
  }

  return {
    queue,
    buffers,
    count: 0,
    dispatch() {
      return queue.shift() ?? null;
    },
    complete() {
      this.count++;
    },
    step(now: number) {
      if (now >= nextGen) {
        nextGen = now + 1.1 + rnd() * 0.9;
        generate(now);
      }
    },
  };
}
