import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

/* T-104 verification: screenshots + interaction checks.
   Requires `astro preview --port 4325`. Output: docs/concepts/shots/T-104/

   Shots (1440×900): log-vorher, log-buehne, proof-manuell, proof-pipeline,
   work-35, dock-verladung, dock-lkw-abfahrt
   Shots (1280×800): r1280-log, r1280-proof, r1280-work, r1280-dock

   Checks:
   (a) window.scrollY identical before/after the LOG pallet tap
   (b) DOCK tap on CV fires the real <a download> action SYNCHRONOUSLY
       inside the tap handler (capture-spy + preventDefault, window.open
       stubbed — nothing actually opens/downloads)
   (c) classic view at 900 px: no console errors, no warehouse block
   (d) EN page: no German strings from the new T-104 keys
   plus: minimap toggle does not overlap panel bottom edges (DOCK/BEYOND)
   at 1440×900 and 1280×800.                                        */

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = 'http://localhost:4325/luca-stach/';
const outDir = path.resolve('docs/concepts/shots/T-104');
mkdirSync(outDir, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const fail = (msg) => {
  failures++;
  console.error('FAIL', msg);
};
const ok = (msg) => console.log('  ok', msg);

const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    '--remote-debugging-port=9227',
    '--window-size=1440,900',
    '--hide-scrollbars',
    '--mute-audio',
    '--user-data-dir=' + path.join(process.env.TEMP ?? '/tmp', 'fd-chrome-t104'),
    'about:blank',
  ],
  { stdio: 'ignore' },
);

async function getWsUrl() {
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch('http://localhost:9227/json');
      const list = await res.json();
      const page = list.find((t) => t.type === 'page');
      if (page) return page.webSocketDebuggerUrl;
    } catch {}
    await sleep(250);
  }
  throw new Error('chrome devtools not reachable');
}

const ws = new WebSocket(await getWsUrl());
await new Promise((res, rej) => {
  ws.onopen = res;
  ws.onerror = rej;
});

let msgId = 0;
const pending = new Map();
const consoleErrors = [];
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m);
    pending.delete(m.id);
  }
  if (m.method === 'Runtime.exceptionThrown') {
    consoleErrors.push(
      'EXC: ' +
        JSON.stringify(m.params.exceptionDetails?.exception?.description ?? m.params).slice(0, 300),
    );
  }
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
    consoleErrors.push(
      'ERR: ' + m.params.args.map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 300),
    );
  }
};
const send = (method, params = {}) =>
  new Promise((res) => {
    const id = ++msgId;
    pending.set(id, res);
    ws.send(JSON.stringify({ id, method, params }));
  });
const evaluate = async (expr) => {
  const r = await send('Runtime.evaluate', {
    expression: expr,
    returnByValue: true,
    awaitPromise: true,
  });
  if (r.result?.exceptionDetails) {
    console.error('EVAL-EXC', JSON.stringify(r.result.exceptionDetails).slice(0, 300));
  }
  return r.result?.result?.value;
};
const shot = async (name) => {
  const s = await send('Page.captureScreenshot', { format: 'jpeg', quality: 80 });
  writeFileSync(path.join(outDir, `${name}.jpg`), Buffer.from(s.result.data, 'base64'));
  console.log('SHOT', name);
};
/* stations: 0 boot · 1 proof · 2 log · 3 work · 4 stack · 5 beyond · 6 dock */
const scrollToStation = async (i) => {
  await evaluate(
    `window.scrollTo(0, ${i / 6} * (document.documentElement.scrollHeight - innerHeight))`,
  );
  await sleep(2800);
};
const bootWorld = async () => {
  let up = false;
  for (let i = 0; i < 80; i++) {
    const ready = await evaluate(
      `document.documentElement.classList.contains('flightdeck') && document.querySelector('[data-tc-parts]')?.textContent !== '—'`,
    );
    if (ready) {
      up = true;
      break;
    }
    await sleep(250);
  }
  console.log('world up:', up);
  if (!up) fail('flightdeck world did not boot');
  await sleep(3500); // power-up completes
  return up;
};
/* overlap check: minimap toggle vs the visible station panels */
const mapOverlap = async () =>
  evaluate(`(() => {
    const t = document.querySelector('.halle-map-toggle')?.getBoundingClientRect();
    if (!t) return { error: 'no toggle' };
    const panels = [...document.querySelectorAll(
      ':is(#top,#proof,#log,#work,#stack,#beyond,#contact) > div:not([aria-hidden="true"])'
    )];
    const hits = [];
    for (const p of panels) {
      const r = p.getBoundingClientRect();
      if (r.bottom < 0 || r.top > innerHeight || r.width === 0) continue; // off-screen
      const ox = Math.min(t.right, r.right) - Math.max(t.left, r.left);
      const oy = Math.min(t.bottom, r.bottom) - Math.max(t.top, r.top);
      if (ox > 0 && oy > 0) hits.push({ panel: p.parentElement.id, ox: +ox.toFixed(1), oy: +oy.toFixed(1) });
    }
    return { toggle: { left: +t.left.toFixed(0), top: +t.top.toFixed(0), right: +t.right.toFixed(0), bottom: +t.bottom.toFixed(0) }, hits };
  })()`);

await send('Runtime.enable');
await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', {
  width: 1440,
  height: 900,
  deviceScaleFactor: 1,
  mobile: false,
});
await send('Page.navigate', { url: BASE });
await sleep(1500);
await evaluate(`localStorage.clear()`);
await send('Page.navigate', { url: BASE });
await sleep(2000);
await bootWorld();

/* ================= LOG: pallet → stage, panel highlight ============= */
await scrollToStation(2);
const scrollY0 = await evaluate(`window.scrollY`);
await shot('log-vorher');
await evaluate(`window.__halleDebug.log(2)`);
/* the shuttle ride takes a few seconds (fetch → pull → carry → show);
   the panel highlight lands exactly when the pallet reaches the stage */
let logCheck = null;
for (let i = 0; i < 36; i++) {
  await sleep(500);
  logCheck = await evaluate(`({
    picked: document.querySelectorAll('#log .log-pick').length,
    scrollY: window.scrollY,
  })`);
  if (logCheck.picked === 1) break;
}
await shot('log-buehne');
console.log('(a) LOG check:', JSON.stringify(logCheck), '· scrollY before:', scrollY0);
if (logCheck.picked === 1) ok('LOG panel entry highlighted');
else fail(`LOG panel highlight missing (${logCheck.picked})`);
if (Math.abs(logCheck.scrollY - scrollY0) < 1) ok('(a) window.scrollY unchanged by LOG interaction');
else fail(`(a) window.scrollY moved: ${scrollY0} → ${logCheck.scrollY}`);

/* ================= PROOF: manual vs pipeline ======================== */
await scrollToStation(1);
await evaluate(`window.__halleDebug.leitstand('manual')`);
await sleep(5000);
const statMan = await evaluate(`window.__halleDebug.packStats()`);
await shot('proof-manuell');
await evaluate(`window.__halleDebug.leitstand('pipeline')`);
await sleep(5000);
const statPipe = await evaluate(`window.__halleDebug.packStats()`);
await shot('proof-pipeline');
console.log('PROOF manual:', JSON.stringify(statMan), '· pipeline:', JSON.stringify(statPipe));
if (statMan?.mode === 'manual' && statPipe?.mode === 'pipeline') ok('leitstand modes switch');
else fail('leitstand mode switch broken');
if (statPipe && statMan && statPipe.avgT < statMan.avgT) {
  ok(`avgT drops (${statMan.avgT} → ${statPipe.avgT} min)`);
} else {
  fail(`avgT did not drop (${statMan?.avgT} → ${statPipe?.avgT})`);
}

/* ================= WORK: 35 % error quota =========================== */
await scrollToStation(3);
const quota = await evaluate(`window.__halleDebug.errq()`); // 18 % → 35 %
await sleep(7000); // red parcels reach the diverter, siding stacks
const errqStats = await evaluate(`window.__halleDebug.errqStats()`);
await shot('work-35');
console.log('WORK quota:', quota, '· stats:', JSON.stringify(errqStats));
if (quota === 0.35 && errqStats?.quota === 0.35) ok('portal shows 35 %');
else fail(`quota mismatch: ${quota} / ${errqStats?.quota}`);
if (errqStats && errqStats.diverted >= 1 && errqStats.diverted <= errqStats.checked) {
  ok(`counters live (${errqStats.checked} checked / ${errqStats.diverted} diverted)`);
} else {
  fail(`counters off: ${JSON.stringify(errqStats)}`);
}

/* ============ DOCK: synchronous real action on CV (b) =============== */
await scrollToStation(6);
/* wait for a truck actually standing at TOR 1 (phase dock/work) —
   the tap pokes an 'away' truck, but the shots need it at the door */
let truckBefore = null;
for (let i = 0; i < 70; i++) {
  truckBefore = await evaluate(`window.__halleDebug.truck()`);
  if (truckBefore && (truckBefore.phase === 'dock' || truckBefore.phase === 'work')) break;
  await sleep(500);
}
console.log('truck docked before tap:', JSON.stringify(truckBefore));
await evaluate(`(() => {
  window.__dockSpy = { clicks: [], opens: [], tTap: -1 };
  document.querySelectorAll('#contact a').forEach((a) => {
    a.addEventListener('click', (e) => {
      /* suppress the real download/popup/navigation for the test */
      e.preventDefault();
      window.__dockSpy.clicks.push({ href: a.getAttribute('href'), t: performance.now() });
    }, { capture: true });
  });
  window.open = (u) => { window.__dockSpy.opens.push(String(u)); return null; };
  return true;
})()`);
/* real tap path on the CV pallet (index 2): pointerdown/up at the
   projected screen position. dispatchEvent runs handlers synchronously,
   so if the spy is filled THE MOMENT it returns, the action fired
   inside the tap event — no popup blocker could intervene. */
const tapResult = await evaluate(`(() => {
  const p = window.__halleDebug.dockPallet(2);
  window.__dockSpy.tTap = performance.now();
  const opts = { bubbles: true, clientX: p.sx, clientY: p.sy };
  document.body.dispatchEvent(new PointerEvent('pointerdown', opts));
  document.body.dispatchEvent(new PointerEvent('pointerup', opts));
  const spy = window.__dockSpy;
  return {
    pos: p,
    clicks: spy.clicks.map((c) => ({ href: c.href, dt: +(c.t - spy.tTap).toFixed(2) })),
    opens: [...spy.opens],
    syncCount: spy.clicks.length + spy.opens.length, // read in the SAME task
    href: location.href,
  };
})()`);
console.log('(b) DOCK tap on CV:', JSON.stringify(tapResult), '· truck before:', JSON.stringify(truckBefore));
if (tapResult && tapResult.syncCount === 1) {
  const c = tapResult.clicks[0];
  ok(`(b) real action fired synchronously inside the tap handler (${c?.href}, +${c?.dt} ms)`);
} else {
  fail(`(b) synchronous action missing: ${JSON.stringify(tapResult)}`);
}
if (tapResult?.href.includes('/luca-stach')) ok('no navigation away from the page');
else fail(`page navigated: ${tapResult?.href}`);
await sleep(1800); // courier AGV carries the pallet toward the truck
await shot('dock-verladung');
/* the truck departs once the courier is back: wait for 'leave', then
   catch it mid-roll for the departure shot */
let truckAfter = null;
let departed = false;
for (let i = 0; i < 40; i++) {
  truckAfter = await evaluate(`window.__halleDebug.truck()`);
  if (truckAfter?.phase === 'leave') {
    departed = true;
    break;
  }
  await sleep(500);
}
await sleep(2200); // mid-departure
truckAfter = await evaluate(`window.__halleDebug.truck()`);
console.log('truck after tap:', JSON.stringify(truckAfter));
await shot('dock-lkw-abfahrt');
if (departed && truckAfter && truckAfter.z < (truckBefore?.z ?? 0) - 1) {
  ok(`truck departs after loading (z ${truckBefore?.z} → ${truckAfter.z})`);
} else {
  fail(`truck did not depart: ${JSON.stringify(truckBefore)} → ${JSON.stringify(truckAfter)}`);
}

/* ============ minimap toggle vs panel bottom (Punkt 6) ============== */
for (const [i, name] of [
  [6, 'dock'],
  [5, 'beyond'],
]) {
  await scrollToStation(i);
  const o = await mapOverlap();
  console.log(`map overlap @${name} (1440×900):`, JSON.stringify(o));
  if (o.hits && o.hits.length === 0) ok(`no toggle/panel overlap at ${name}`);
  else fail(`toggle overlaps panel at ${name}: ${JSON.stringify(o)}`);
}

/* ==================== 1280×800: shots + overlap ===================== */
await send('Emulation.setDeviceMetricsOverride', {
  width: 1280,
  height: 800,
  deviceScaleFactor: 1,
  mobile: false,
});
await send('Page.navigate', { url: BASE });
await sleep(1500);
await evaluate(`localStorage.clear()`);
await send('Page.navigate', { url: BASE });
await sleep(2000);
await bootWorld();
for (const [i, name] of [
  [2, 'log'],
  [1, 'proof'],
  [3, 'work'],
  [6, 'dock'],
]) {
  await scrollToStation(i);
  await shot(`r1280-${name}`);
}
for (const [i, name] of [
  [6, 'dock'],
  [5, 'beyond'],
]) {
  await scrollToStation(i);
  const o = await mapOverlap();
  console.log(`map overlap @${name} (1280×800):`, JSON.stringify(o));
  if (o.hits && o.hits.length === 0) ok(`no toggle/panel overlap at ${name} (1280)`);
  else fail(`toggle overlaps panel at ${name} (1280): ${JSON.stringify(o)}`);
}

/* ============ (c) classic view at 900 px: clean ===================== */
consoleErrors.length = 0;
await send('Emulation.setDeviceMetricsOverride', {
  width: 900,
  height: 700,
  deviceScaleFactor: 1,
  mobile: false,
});
await send('Page.navigate', { url: BASE });
await sleep(5000);
const classic = await evaluate(`(() => {
  const hidden = (el) => !!el && el.offsetParent === null; // display:none subtree
  return {
    flightdeck: document.documentElement.classList.contains('flightdeck'),
    whLeftovers: [...document.querySelectorAll('[class*="wh-"]')].length,
    workCases: document.querySelectorAll('#work article').length,
    lsTwinHidden: hidden(document.querySelector('[data-leitstand]')),
    errqHidden: hidden(document.querySelector('[data-errq]')),
  };
})()`);
console.log('(c) classic view @900px:', JSON.stringify(classic));
if (!classic.flightdeck) ok('(c) classic view stays classic at 900 px');
else fail('(c) flightdeck active at 900 px');
if (classic.whLeftovers === 0) ok('(c) no warehouse block in the DOM');
else fail(`(c) warehouse leftovers: ${classic.whLeftovers}`);
if (classic.workCases === 3) ok('work cases render (3)');
else fail(`work cases: ${classic.workCases}`);
if (classic.lsTwinHidden && classic.errqHidden) ok('DOM twins hidden outside flightdeck');
else fail('DOM twins visible in classic view');
if (consoleErrors.length === 0) ok('(c) no console errors in classic view');
else fail(`(c) console errors: ${JSON.stringify(consoleErrors)}`);

/* ============ (d) EN page: no German T-104 strings ================== */
await send('Page.navigate', { url: BASE + 'en/' });
await sleep(4000);
const i18nCheck = await evaluate(`(() => {
  const html = document.body.innerHTML;
  const german = ['Fehlerquote', 'geprüft', 'ausgeleitet', 'MANUELL', 'Modell',
    'in der Halle anfahren', 'angebots-pipeline'];
  const english = ['Error rate', 'Cycle the inspection line error rate', 'control room'];
  return {
    germanFound: german.filter((s) => html.includes(s)),
    englishMissing: english.filter((s) => !html.includes(s)),
  };
})()`);
console.log('(d) EN page:', JSON.stringify(i18nCheck));
if (i18nCheck.germanFound.length === 0) ok('(d) no German T-104 strings on the EN page');
else fail(`(d) German strings on EN page: ${JSON.stringify(i18nCheck.germanFound)}`);
if (i18nCheck.englishMissing.length === 0) ok('(d) EN T-104 strings present');
else fail(`(d) EN strings missing: ${JSON.stringify(i18nCheck.englishMissing)}`);

console.log('CONSOLE_ERRORS (total)', consoleErrors.length ? JSON.stringify(consoleErrors, null, 1) : 'none');
ws.close();
chrome.kill();
if (failures > 0) {
  console.error(`T-104 CDP: ${failures} FAILURES`);
  process.exit(1);
}
console.log('T-104 CDP: PASS');
process.exit(0);
