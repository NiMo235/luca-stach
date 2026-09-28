import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

/* T-105 verification: shifts, layers, T-104 follow-ups.
   Requires `astro preview --port 4325`. Output: docs/concepts/shots/T-105/
   Boot smoke test first: aborts if html.flightdeck is not active or the
   world never renders (a boot ReferenceError once hid behind the
   classic fallback in T-104). Checks: shift/layer controls do not
   overlap panels, shift + layer state applies and persists, EN page has
   no German control labels, no console errors. */

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = 'http://localhost:4325/luca-stach/';
const outDir = path.resolve('docs/concepts/shots/T-105');
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
    '--remote-debugging-port=9228',
    '--window-size=1440,900',
    '--hide-scrollbars',
    '--mute-audio',
    '--user-data-dir=' + path.join(process.env.TEMP ?? '/tmp', 'fd-chrome-t105'),
    'about:blank',
  ],
  { stdio: 'ignore' },
);

async function getWsUrl() {
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch('http://localhost:9228/json');
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
const setSize = (w, h) =>
  send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
await setSize(1440, 900);
await send('Page.navigate', { url: BASE });
await sleep(1500);
await evaluate(`localStorage.clear()`);
await send('Page.navigate', { url: BASE });
await sleep(2000);

/* ---- boot smoke test: abort hard if the hall did not come up ---- */
if (!(await bootWorld())) {
  console.error('BOOT SMOKE TEST FAILED — aborting (classic fallback active?)');
  console.error('CONSOLE_ERRORS', JSON.stringify(consoleErrors));
  ws.close();
  chrome.kill();
  process.exit(2);
}
const canvasOk = await evaluate(`(() => { const c = document.getElementById('flight-canvas');
  return !!c && getComputedStyle(c).display !== 'none' && c.width > 0; })()`);
if (canvasOk) ok('boot smoke: flightdeck active, canvas rendering');
else fail('boot smoke: canvas not rendering');

/* ---- controls overlap check (shift group + layer toggle vs panels) ---- */
const ctrlOverlap = async () =>
  evaluate(`(() => {
    const els = [...document.querySelectorAll('.halle-shift, .halle-layers-toggle, .halle-map-toggle')];
    const panels = [...document.querySelectorAll(
      ':is(#top,#proof,#log,#work,#stack,#beyond,#contact) > div:not([aria-hidden="true"])')];
    const hits = [];
    for (const el of els) { const t = el.getBoundingClientRect();
      for (const p of panels) { const r = p.getBoundingClientRect();
        if (r.bottom < 0 || r.top > innerHeight || r.width === 0) continue;
        const ox = Math.min(t.right, r.right) - Math.max(t.left, r.left);
        const oy = Math.min(t.bottom, r.bottom) - Math.max(t.top, r.top);
        if (ox > 1 && oy > 1) hits.push({ el: el.className, panel: p.parentElement.id }); } }
    return hits;
  })()`);

/* ---- T-104 follow-ups ---- */
await scrollToStation(2);
await evaluate(`window.__halleDebug.log(2)`);
await sleep(7000);
await shot('fix-log-buehne');
await scrollToStation(1);
await shot('fix-proof');

/* ---- shifts at BOOT ---- */
await scrollToStation(0);
for (const s of ['morning', 'late', 'night']) {
  await evaluate(`document.querySelector('[data-shift="${s}"]').click()`);
  await sleep(2600);
  const st = await evaluate(`window.__halleDebug.atmo().shift`);
  const pressed = await evaluate(`document.querySelector('[data-shift="${s}"]').getAttribute('aria-pressed')`);
  if (st === s && pressed === 'true') ok(`shift ${s} applied (aria-pressed)`);
  else fail(`shift ${s} not applied: ${st} / ${pressed}`);
  await shot(`boot-${s}`);
}
await evaluate(`document.querySelector('[data-shift="morning"]').click()`);
await sleep(2000);
await scrollToStation(3);
await shot('work-morning');
await evaluate(`document.querySelector('[data-shift="night"]').click()`);
await sleep(2000);

/* ---- layers ---- */
await shot('work-data-on');
await evaluate(`window.__halleDebug.layer('data', false)`);
await sleep(600);
await shot('work-data-off');
await evaluate(`window.__halleDebug.layer('data', true)`);
await evaluate(`window.__halleDebug.layer('auto', true)`);
await sleep(600);
await shot('work-layer-auto');
await evaluate(`window.__halleDebug.layer('auto', false)`);
await evaluate(`window.__halleDebug.layer('hazmat', true)`);
await sleep(900);
await scrollToStation(6);
await shot('dock-layer-hazmat');
await evaluate(`window.__halleDebug.layer('hazmat', false)`);
await scrollToStation(0);
await evaluate(`window.__halleDebug.layer('roof', false)`);
await sleep(1200);
await shot('boot-roof-off');
await evaluate(`window.__halleDebug.layer('roof', true)`);

/* ---- persistence: reload keeps shift + layers ---- */
await evaluate(`document.querySelector('[data-shift="late"]').click()`);
await evaluate(`window.__halleDebug.layer('auto', true)`);
await sleep(300);
await send('Page.navigate', { url: BASE });
await sleep(1500);
await bootWorld();
const persisted = await evaluate(`window.__halleDebug.atmo()`);
if (persisted?.shift === 'late' && persisted?.layers?.auto === true) ok('shift + layers persist across reload');
else fail(`persistence broken: ${JSON.stringify(persisted)}`);
await evaluate(`localStorage.clear()`);

/* ---- overlap at 1440 and 1280, every station ---- */
for (const [w, h] of [[1440, 900], [1280, 800]]) {
  await setSize(w, h);
  await sleep(800);
  let bad = [];
  for (let i = 0; i < 7; i++) {
    await scrollToStation(i);
    const hits = await ctrlOverlap();
    if (hits.length) bad.push({ station: i, hits });
  }
  if (bad.length === 0) ok(`no control/panel overlap at ${w}×${h}`);
  else fail(`overlap at ${w}×${h}: ${JSON.stringify(bad)}`);
}
await setSize(1280, 800);
await scrollToStation(5);
await evaluate(`document.querySelector('.halle-layers-toggle').click()`);
await sleep(400);
await shot('r1280-beyond-layers-open');
await setSize(1440, 900);

/* ---- EN page: control labels translated ---- */
await send('Page.navigate', { url: BASE + 'en/' });
await sleep(4000);
const en = await evaluate(`(() => {
  const txt = [...document.querySelectorAll('.halle-shift button, #halle-layers button')].map(b => b.textContent.trim()).join('|');
  return { txt, german: ['Früh','Spät','Nacht','Ebenen','Dach','Datenströme','Automatisierung','Gefahrgut'].filter(s => txt.includes(s)) };
})()`);
console.log('EN controls:', en.txt);
if (en.german.length === 0) ok('EN control labels translated');
else fail(`German labels on EN page: ${JSON.stringify(en.german)}`);

console.log('CONSOLE_ERRORS (total)', consoleErrors.length ? JSON.stringify(consoleErrors, null, 1) : 'none');
if (consoleErrors.length) fail('console errors present');
ws.close();
chrome.kill();
if (failures > 0) {
  console.error(`T-105 CDP: ${failures} FAILURES`);
  process.exit(1);
}
console.log('T-105 CDP: PASS');
process.exit(0);
