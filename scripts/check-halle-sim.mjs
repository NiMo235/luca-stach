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
/*                                                                     */
/*   node scripts/check-halle-sim.mjs                                  */
/* ------------------------------------------------------------------ */

import { createSim } from '../src/scripts/halle/sim/world.ts';

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

if (failures === 0) {
  console.log('HALLE sim test: PASS');
  process.exit(0);
} else {
  console.error(`HALLE sim test: ${failures} FAILURES`);
  process.exit(1);
}
