/* ------------------------------------------------------------------ */
/* Paket-Sim (T-103) — three-free, deterministic. Two independent      */
/* systems with path parameters instead of the AGV graph:              */
/*                                                                     */
/* 1. Förderloop (WORK): packages ride an oval roller conveyor. At the */
/*    scanner portal a quota (5/18/35 %, cycled per tap, T-104) is     */
/*    flagged red; red packages are pushed onto the rejection siding   */
/*    (Abstellgleis) at the diverter and stack there (max MAX_SIDING). */
/*    A red parcel at a full siding triggers the "Klärfall" reset: the */
/*    stack is collected and the slots rejoin the belt on wrap. Slots  */
/*    stay evenly spaced — no collisions by construction.              */
/* 2. Quote lanes (PROOF): small data packets on two elevated bands    */
/*    between the hall and the Leitstand — manual lane (slow, inbound) */
/*    and pipeline lane (3× faster, outbound). Pure visual for now;    */
/*    the mode switch lands in T-104.                                  */
/*                                                                     */
/* Explicit .ts imports: consistent with the Node-loadable sim files.  */
/* ------------------------------------------------------------------ */

import { CONV, QLANE } from '../layout.ts';
import { rng } from './rand.ts';

/* ---- conveyor path -------------------------------------------------- */

const STRAIGHT = CONV.x1 - CONV.x0; // 19 m per straight
const ARC = Math.PI * CONV.r; // semicircle arc length
const LOOP_LEN = 2 * STRAIGHT + 2 * ARC;
const ZC = (CONV.zN + CONV.zS) / 2; // arc center z

/* chain slots: evenly spaced, same speed → order is stable */
export const CONV_COUNT = 26;
const SPACING = LOOP_LEN / CONV_COUNT;
const BELT_SPEED = 0.9; // m/s
const DIV_S = CONV.divX - CONV.x0; // arclength of the diverter on the north straight
const SCAN_S = CONV.scanX - CONV.x0; // scanner portal arclength
const BRANCH_LEN = CONV.zN - CONV.beltW / 2 - CONV.stubZ; // belt edge → siding end

/* T-104: the scanner portal cycles the error quota 5 → 18 → 35 → 5 %.
   Diverted parcels stack on the siding (max MAX_SIDING); the next red
   parcel at a full siding triggers the "Klärfall"-Reset. */
export const ERR_QUOTAS = [0.05, 0.18, 0.35];
export const MAX_SIDING = 6;

export interface ConvPack {
  visible: boolean;
  x: number;
  y: number;
  z: number;
  ry: number;
  red: boolean;
}

interface Slot {
  red: boolean;
  div: boolean; // currently diverted
  bs: number; // branch distance (when diverted)
  stackIdx: number; // stack slot on the siding (-1 while on the belt)
  lastS: number; // chain position last tick (scanner counting)
}

/* siding stack: two columns × three rows along the stub */
function stackPos(k: number, out: { x: number; z: number }): void {
  out.x = CONV.divX + (k < 3 ? -0.26 : 0.26);
  out.z = CONV.zN - CONV.beltW / 2 - 0.55 - (k % 3) * 0.62;
}

/** point on the oval for arclength s (0 at the west end of the north straight) */
function loopPos(s: number, out: { x: number; z: number; ry: number }): void {
  s = ((s % LOOP_LEN) + LOOP_LEN) % LOOP_LEN;
  if (s < STRAIGHT) {
    out.x = CONV.x0 + s;
    out.z = CONV.zN;
    out.ry = Math.PI / 2; // heading +x
  } else if (s < STRAIGHT + ARC) {
    const a = (s - STRAIGHT) / CONV.r; // 0..π, east arc
    out.x = CONV.x1 + Math.sin(a) * CONV.r;
    out.z = ZC - Math.cos(a) * CONV.r;
    out.ry = Math.PI / 2 + a;
  } else if (s < 2 * STRAIGHT + ARC) {
    const d = s - STRAIGHT - ARC;
    out.x = CONV.x1 - d;
    out.z = CONV.zS;
    out.ry = -Math.PI / 2; // heading -x
  } else {
    const a = (s - 2 * STRAIGHT - ARC) / CONV.r; // west arc
    out.x = CONV.x0 - Math.sin(a) * CONV.r;
    out.z = ZC + Math.cos(a) * CONV.r;
    out.ry = Math.PI / 2 + a;
  }
}

/* ---- quote lanes ---------------------------------------------------- */
/* T-104: the Leitstand is a real (tiny) queueing model. The ROI sliders
   (toy:roi) set the arrival rate (quotes/day) and the service time
   (min/quote, manual). The holo switch picks the mode: PIPELINE serves
   3× faster (−67 % Laufzeit, per the thesis measurement). Deterministic,
   continuous flow — the headless test (check-halle-sim) drives it. */

export const QUOTE_COUNT = 12; // 6 per lane
const QUOTE_SPEED_MAN = 1.0; // m/s on the bands in manual mode
const QUOTE_SPEED_PIPE = 3.0; // 3× in pipeline mode
const ARR_K = 0.05; // arrivals per sim-second = quotesPerDay * ARR_K
const SRV_K = 9.0; // service rate per sim-second = SRV_K / minutes
export const PIPE_FACTOR = 3;

export type LeitstandMode = 'manual' | 'pipeline';

export interface QuotePack {
  x: number;
  y: number;
  z: number;
  lane: number;
}

export interface PackSim {
  conv: ConvPack[];
  quote: QuotePack[];
  /** rejected parcels currently parked on the siding (visible proof) */
  sidingCount: number;
  /* Prüfstraße error quota (T-104) */
  readonly errQuota: number;
  /** parcels that crossed the scanner (model counter) */
  readonly checked: number;
  /** parcels pushed onto the siding (model counter) */
  readonly diverted: number;
  /** cycle 5 → 18 → 35 → 5 %, re-rolls the belt verdicts; returns the new quota */
  cycleErrQuota(): number;
  /* Leitstand model (T-104) */
  readonly mode: LeitstandMode;
  /** request backlog (model, may be fractional; display floors it) */
  readonly queueLen: number;
  /** total served requests since init (model) */
  readonly servedTotal: number;
  /** Ø minutes per quote in the current mode (model) */
  readonly avgT: number;
  setMode(m: LeitstandMode): void;
  setRates(quotesPerDay: number, minutes: number): void;
  advance(dt: number): void;
}

export function createPackSim(seed = 4711): PackSim {
  const rnd = rng(seed);

  /* Prüfstraße state (T-104): quota cycles, siding stacks to MAX_SIDING */
  let quotaIdx = 1; // start at 18 % — the T-103 default
  let checked = 0;
  let diverted = 0;
  let siding = 0;

  const slots: Slot[] = [];
  for (let i = 0; i < CONV_COUNT; i++) {
    slots.push({
      red: rnd() < ERR_QUOTAS[quotaIdx],
      div: false,
      bs: 0,
      stackIdx: -1,
      lastS: (i * SPACING) % LOOP_LEN,
    });
  }
  const conv: ConvPack[] = [];
  for (let i = 0; i < CONV_COUNT; i++) {
    conv.push({ visible: true, x: 0, y: CONV.beltY + 0.22, z: 0, ry: 0, red: slots[i].red });
  }

  /* collect a siding parcel: slot rejoins the belt on wrap, new verdict */
  const collectSlot = (i: number): void => {
    const slot = slots[i];
    slot.div = false;
    slot.bs = 0;
    slot.stackIdx = -1;
    slot.red = rnd() < ERR_QUOTAS[quotaIdx];
    conv[i].red = slot.red;
    conv[i].visible = false;
  };

  const quote: QuotePack[] = [];
  for (let i = 0; i < QUOTE_COUNT; i++) {
    const lane = i % 2;
    quote.push({
      x: QLANE.x0 + ((QLANE.x1 - QLANE.x0) / (QUOTE_COUNT / 2)) * Math.floor(i / 2),
      y: QLANE.y + 0.14,
      z: lane === 0 ? QLANE.zIn : QLANE.zOut,
      lane,
    });
  }

  let baseS = 0;
  /* Leitstand model state (T-104) */
  let mode: LeitstandMode = 'manual';
  let quotesPerDay = 10;
  let minutes = 25;
  let queueLen = 0;
  let servedTotal = 0;
  const tmp = { x: 0, z: 0, ry: 0 };
  const stackTmp = { x: 0, z: 0 };

  return {
    conv,
    quote,
    get sidingCount() {
      return siding;
    },
    get errQuota() {
      return ERR_QUOTAS[quotaIdx];
    },
    get checked() {
      return checked;
    },
    get diverted() {
      return diverted;
    },
    cycleErrQuota() {
      quotaIdx = (quotaIdx + 1) % ERR_QUOTAS.length;
      for (let i = 0; i < CONV_COUNT; i++) {
        const slot = slots[i];
        if (!slot.div) {
          slot.red = rnd() < ERR_QUOTAS[quotaIdx];
          conv[i].red = slot.red;
        }
      }
      return ERR_QUOTAS[quotaIdx];
    },
    get mode() {
      return mode;
    },
    get queueLen() {
      return queueLen;
    },
    get servedTotal() {
      return servedTotal;
    },
    get avgT() {
      return minutes / (mode === 'pipeline' ? PIPE_FACTOR : 1);
    },
    setMode(m) {
      mode = m;
    },
    setRates(q, m) {
      if (q > 0) quotesPerDay = q;
      if (m > 0) minutes = m;
    },
    advance(dt) {
      baseS = (baseS + BELT_SPEED * dt) % LOOP_LEN;
      for (let i = 0; i < CONV_COUNT; i++) {
        const slot = slots[i];
        const p = conv[i];
        const s = (baseS + i * SPACING) % LOOP_LEN;
        if (slot.div) {
          /* diverted: slide down the stub, then park on the stack slot —
             it stays until the Klärfall reset collects the whole stack */
          if (slot.bs < BRANCH_LEN) {
            slot.bs = Math.min(BRANCH_LEN, slot.bs + BELT_SPEED * dt);
          }
          if (slot.bs >= BRANCH_LEN && slot.stackIdx >= 0) {
            stackPos(slot.stackIdx, stackTmp);
            p.x = stackTmp.x;
            p.z = stackTmp.z;
          } else {
            p.x = CONV.divX;
            p.z = CONV.zN - CONV.beltW / 2 - slot.bs;
          }
          p.visible = true;
          p.y = CONV.beltY + 0.22;
          p.ry = 0;
          slot.lastS = s;
          continue;
        }
        /* scanner: count every visible parcel crossing the portal — and
           this is where the verdict lands: fresh roll per pass, so red
           parcels keep flowing instead of the belt running out of them */
        if (p.visible && slot.lastS < SCAN_S && s >= SCAN_S) {
          checked++;
          slot.red = rnd() < ERR_QUOTAS[quotaIdx];
          p.red = slot.red;
        }
        /* diverter: red parcels leave the loop onto the siding */
        if (slot.red && slot.lastS < DIV_S && s >= DIV_S) {
          if (siding >= MAX_SIDING) {
            /* siding full → Klärfall: the stack is cleared, slots rejoin */
            for (let j = 0; j < CONV_COUNT; j++) {
              if (slots[j].div && slots[j].stackIdx >= 0) collectSlot(j);
            }
            siding = 0;
          }
          slot.div = true;
          slot.bs = 0;
          slot.stackIdx = siding++;
          diverted++;
          slot.lastS = s;
          continue;
        }
        /* hidden slots wait for their chain position to wrap past 0 */
        if (!p.visible && s < SPACING * 0.5) p.visible = true;
        loopPos(s, tmp);
        p.x = tmp.x;
        p.z = tmp.z;
        p.y = CONV.beltY + 0.22;
        p.ry = tmp.ry;
        slot.lastS = s;
      }

      /* quote packets: mode sets the band speed; the model below decides
         how much work actually gets through (queue builds / drains) */
      const speed = mode === 'pipeline' ? QUOTE_SPEED_PIPE : QUOTE_SPEED_MAN;
      for (const q of quote) {
        const dir = q.lane === 0 ? 1 : -1;
        q.x += dir * speed * dt;
        if (q.x > QLANE.x1) q.x = QLANE.x0;
        if (q.x < QLANE.x0) q.x = QLANE.x1;
      }

      /* queueing model: arrivals in, service out; pipeline serves 3× */
      queueLen += quotesPerDay * ARR_K * dt;
      const srvRate = (SRV_K / minutes) * (mode === 'pipeline' ? PIPE_FACTOR : 1);
      const served = Math.min(queueLen, srvRate * dt);
      queueLen -= served;
      servedTotal += served;
    },
  };
}
