#!/usr/bin/env node
/* ------------------------------------------------------------------ */
/* Headless test for the HALLE simulation (T-102) — no browser, no     */
/* three.js. Runs the fixed-step world (10 Hz) for 10 min of sim time  */
/* and checks:                                                         */
/*   1. no deadlocks — every AGV moves at least once per 60 s window   */
/*      (parked/charging and deliberately held AGVs are exempt)        */
/*   2. no collisions — min center distance (same-edge gap, block      */
/*      separation, stop lines) never drops below 1.6 m                */
/*   3. throughput — completed orders > 0                              */
/* then a 60 s hold test: one AGV is held, a queue must form behind    */
/* it, and after release the queue must dissolve again.                */
/* T-104 adds the pack sim: phase C drives the Leitstand queueing      */
/* model (manual vs pipeline — throughput >= 2.5×, queue drains),      */
/* phase D drives the Prüfstraße at 35 % (consistent counters, bounded */
/* siding via the Klärfall reset).                                     */
/*                                                                     */
/*   node scripts/check-halle-sim.mjs                                  */
/* ------------------------------------------------------------------ */

import { createSim } from '../src/scripts/halle/sim/world.ts';
import { createPackSim } from '../src/scripts/halle/sim/packages.ts';

const STEP = 0.1;
const MIN_DIST = 1.6; // design floor: stop lines/fork merges keep >= ~2.0
const MOVE_WINDOW = 600; // 60 s in ticks

let failures = 0;
const fail = (msg) => {
  failures++;
  console.error('FAIL', msg);
};
const ok = (msg) => console.log('  ok', msg);

/* ---------- phase A: 10 min free-running ---------- */
{
  const sim = createSim(1337);
  const lastMoveTick = sim.agvs.map(() => 0);
  let minDist = Infinity;
  let minDistInfo = '';
  let movingSum = 0; // "in Fahrt": working (not parked) and actually moving
  let fleetSamples = 0;

  for (let tick = 0; tick < 6000; tick++) {
    sim.step();
    for (const a of sim.agvs) {
      if (a.state !== 'parked' && a.v > 0.05) movingSum++;
      fleetSamples++;
      const moved = Math.hypot(a.x - a.px, a.z - a.pz) > 0.005;
      if (moved || a.edge >= 0) {
        if (moved) lastMoveTick[a.id] = tick;
      }
      /* deadlock watch: not parked, not held, no movement for 60 s */
      if (
        a.state !== 'parked' &&
        !a.hold &&
        a.v < 0.02 &&
        tick - lastMoveTick[a.id] > MOVE_WINDOW
      ) {
        fail(`deadlock: AGV ${a.id} has not moved for 60 s (t=${sim.time.toFixed(0)}, state=${a.state})`);
        lastMoveTick[a.id] = tick; // report once per window
      }
    }
    /* collision watch */
    for (let i = 0; i < sim.agvs.length; i++) {
      for (let j = i + 1; j < sim.agvs.length; j++) {
        const a = sim.agvs[i];
        const b = sim.agvs[j];
        const d = Math.hypot(a.x - b.x, a.z - b.z);
        if (d < minDist) {
          minDist = d;
          minDistInfo = `AGV ${i} & ${j} at t=${sim.time.toFixed(1)}`;
        }
        if (d < MIN_DIST) {
          fail(`collision: AGV ${i} & ${j} at ${d.toFixed(2)} m (t=${sim.time.toFixed(1)})`);
          i = sim.agvs.length; // one report is enough
          break;
        }
      }
    }
  }

  console.log('phase A: 10 min free run');
  console.log(`  completed orders: ${sim.stats.completed}`);
  console.log(`  in transit: ${sim.stats.inTransit} · queue: ${sim.stats.queueLen} · avg dwell: ${sim.stats.avgDwell.toFixed(1)} s`);
  console.log(`  min center distance: ${minDist.toFixed(2)} m (${minDistInfo})`);
  const movingShare = movingSum / fleetSamples;
  console.log(`  in Fahrt (moving share, phase A avg): ${(movingShare * 100).toFixed(1)} %`);
  if (sim.stats.completed > 0) ok('orders completed > 0');
  else fail('no orders completed in 10 min');
  if (minDist >= MIN_DIST) ok(`min distance ${minDist.toFixed(2)} m >= ${MIN_DIST} m`);
  if (movingShare >= 0.7) ok(`moving share ${(movingShare * 100).toFixed(1)} % >= 70 %`);
  else fail(`fleet too static: only ${(movingShare * 100).toFixed(1)} % moving (< 70 %)`);
}

/* ---------- phase B: 60 s hold → queue forms → release → dissolves --- */
{
  const sim = createSim(1337);
  for (let i = 0; i < 900; i++) sim.step(); // 90 s warm-up

  const id = sim.firstWorkingAgv();
  if (id < 0) {
    fail('no working AGV found for the hold test');
  } else {
    sim.toggleHold(id);
    let maxQueue = 0;
    let stoodWhileHeld = true;
    for (let i = 0; i < 600; i++) {
      sim.step();
      /* while the hold is active (first 8 s), the AGV must stand —
         the first 2 s are the physical braking distance */
      if (i >= 20 && i < 75 && sim.agvs[id].v > 0.02) stoodWhileHeld = false;
      let q = 0;
      for (const a of sim.agvs) {
        if (a.id !== id && !a.hold && a.state !== 'parked' && a.edge >= 0 && a.v < 0.02) q++;
      }
      if (q > maxQueue) maxQueue = q;
    }
    console.log('phase B: 60 s hold');
    console.log(`  held AGV ${id} · max queue while held: ${maxQueue}`);
    if (stoodWhileHeld) ok('held AGV stands during the hold window');
    else fail('held AGV moved while held');
    if (maxQueue >= 2) ok(`congestion visible (${maxQueue} waiting)`);
    else fail(`no congestion formed behind held AGV (queue=${maxQueue})`);

    sim.toggleHold(id); // release
    for (let i = 0; i < 900; i++) sim.step();
    const stuck = sim.agvs.filter(
      (a) => a.state !== 'parked' && !a.hold && a.v < 0.02 && sim.time - a.lastMove > 60,
    );
    if (stuck.length === 0) ok('congestion dissolved after release');
    else fail(`congestion did not dissolve: AGVs stuck: ${stuck.map((a) => a.id).join(',')}`);
    console.log(`  completed orders total: ${sim.stats.completed}`);
  }
}

/* ---------- phase C: Leitstand model — manual vs pipeline (T-104) --- */
{
  const pack = createPackSim(4711);
  pack.setRates(10, 25); // ROI defaults: 10 quotes/day, 25 min per quote

  /* manual: arrivals (0.5/s) outpace service (0.36/s) — queue builds.
     Throughput is measured in a saturated window (after warm-up). */
  pack.setMode('manual');
  for (let t = 0; t < 600; t++) pack.advance(0.1); // 60 s warm-up
  const qWarm = pack.queueLen;
  const m0 = pack.servedTotal;
  for (let t = 0; t < 1200; t++) pack.advance(0.1); // 120 s measured
  const servedMan = pack.servedTotal - m0;
  const qAtSwitch = pack.queueLen;

  /* pipeline: 3× service rate. Measure while the backlog still
     saturates the service (30 s), then run on — the queue must drain. */
  pack.setMode('pipeline');
  const p0 = pack.servedTotal;
  for (let t = 0; t < 300; t++) pack.advance(0.1); // 30 s, still saturated
  const servedPipe = pack.servedTotal - p0;
  for (let t = 0; t < 1200; t++) pack.advance(0.1); // 120 s more
  const qPipeEnd = pack.queueLen;

  const rateMan = servedMan / 120;
  const ratePipe = servedPipe / 30;
  const ratio = ratePipe / rateMan;
  console.log('phase C: Leitstand model (quotes=10/day, t=25 min)');
  console.log(`  manual:   queue ${qWarm.toFixed(1)} → ${qAtSwitch.toFixed(1)} · rate ${rateMan.toFixed(3)}/s`);
  console.log(`  pipeline: rate ${ratePipe.toFixed(3)}/s (${ratio.toFixed(2)}×) · queue after drain ${qPipeEnd.toFixed(2)}`);
  if (qAtSwitch > 3) ok(`manual queue builds (${qAtSwitch.toFixed(1)} > 3)`);
  else fail(`manual queue did not build (${qAtSwitch.toFixed(1)})`);
  if (ratio >= 2.5) ok(`pipeline throughput ${ratio.toFixed(2)}× >= 2.5× manual`);
  else fail(`pipeline throughput only ${ratio.toFixed(2)}× (< 2.5×)`);
  if (qPipeEnd < 1) ok(`pipeline drains the queue (${qPipeEnd.toFixed(2)} < 1)`);
  else fail(`pipeline did not drain the queue (${qPipeEnd.toFixed(2)})`);
}

/* ---------- phase D: Prüfstraße at 35 % (T-104) --------------------- */
{
  const pack = createPackSim(4711);
  const q1 = pack.cycleErrQuota(); // 18 % → 35 %
  const q2 = pack.cycleErrQuota(); // 35 % → 5 %
  const q3 = pack.cycleErrQuota(); // 5 % → 18 %
  if (q1 === 0.35 && q2 === 0.05 && q3 === 0.18) ok('quota cycles 5 → 18 → 35 → 5 %');
  else fail(`quota cycle broken: ${q1}/${q2}/${q3}`);

  pack.cycleErrQuota(); // back to 35 % for the measured run
  for (let t = 0; t < 3000; t++) pack.advance(0.1); // 300 s
  const { checked, diverted, sidingCount } = pack;
  const ratio = diverted / Math.max(checked, 1);
  console.log('phase D: Prüfstraße @ 35 % (300 s)');
  console.log(`  checked ${checked} · diverted ${diverted} (${(ratio * 100).toFixed(1)} %) · siding ${sidingCount}`);
  if (checked > 0 && diverted > 0 && diverted <= checked) {
    ok('counters consistent (0 < diverted <= checked)');
  } else {
    fail(`counters inconsistent: checked=${checked} diverted=${diverted}`);
  }
  if (ratio > 0.25 && ratio < 0.45) ok(`diversion ratio ${(ratio * 100).toFixed(1)} % near 35 %`);
  else fail(`diversion ratio off: ${(ratio * 100).toFixed(1)} % (expected ~35 %)`);
  if (sidingCount <= 6) ok(`siding bounded at ${sidingCount} <= 6 (Klärfall reset works)`);
  else fail(`siding overflow: ${sidingCount} > 6`);
}

/* ---------- phase E: shift profiles (T-105) --------------------------
   Nacht 0.25 · Spät 0.6 · Früh 1.0 scale the order generator. The fleet
   saturates above ~0.4 (MAX_TRANSIT), so Spät and Früh may tie; Nacht
   must be visibly calmer but still alive, and no profile may deadlock. */
{
  const res = {};
  for (const [name, rate] of [
    ['night', 0.25],
    ['late', 0.6],
    ['morning', 1.0],
  ]) {
    const sim = createSim(1337);
    sim.orders.setRate(rate);
    const lastMove = sim.agvs.map(() => 0);
    let mv = 0;
    let n = 0;
    let dead = 0;
    for (let tick = 0; tick < 6000; tick++) {
      sim.step();
      for (const a of sim.agvs) {
        if (a.state !== 'parked' && a.v > 0.05) mv++;
        n++;
        /* parked time is not stall time: the clock starts when the AGV
           leaves its slot (calm shifts park more AGVs for longer) */
        if (a.state === 'parked' || Math.hypot(a.x - a.px, a.z - a.pz) > 0.005) lastMove[a.id] = tick;
        if (a.state !== 'parked' && !a.hold && a.v < 0.02 && tick - lastMove[a.id] > MOVE_WINDOW) {
          dead++;
          lastMove[a.id] = tick;
        }
      }
    }
    res[name] = { completed: sim.stats.completed, moving: mv / n, dead };
  }
  console.log('phase E: shift profiles (10 min each)');
  for (const [k, v] of Object.entries(res)) {
    console.log(`  ${k}: ${v.completed} orders · ${(v.moving * 100).toFixed(1)} % moving · ${v.dead} stalls`);
  }
  const { night, late, morning } = res;
  if (night.completed < late.completed && late.completed <= morning.completed + 2) {
    ok('throughput Nacht < Spät <= Früh');
  } else {
    fail(`shift throughput not ordered: ${night.completed} / ${late.completed} / ${morning.completed}`);
  }
  if (night.moving >= 0.45) ok(`night shift still alive (${(night.moving * 100).toFixed(1)} % moving)`);
  else fail(`night shift too static: ${(night.moving * 100).toFixed(1)} %`);
  if (night.dead + late.dead + morning.dead === 0) ok('no stalls in any shift');
  else fail(`stalls: night ${night.dead} · late ${late.dead} · morning ${morning.dead}`);
}

if (failures === 0) {
  console.log('HALLE sim test: PASS');
  process.exit(0);
} else {
  console.error(`HALLE sim test: ${failures} FAILURES`);
  process.exit(1);
}
