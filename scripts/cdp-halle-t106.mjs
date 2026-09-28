import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

/* T-106 hardening checks: fallbacks + adaptive quality.
   Requires `astro preview --port 4325`. Output: docs/concepts/shots/T-106/
   (1) desktop 1440: hall boots, no console errors
   (2) 900 px width → classic view (no .flightdeck, canvas hidden)
   (3) prefers-reduced-motion → classic view
   (4) coarse pointer (touch emulation) at 1440 → classic view
   (5) no JavaScript → contact links + CV present in the static HTML
   (6) adaptive quality: throttled CPU steps the pixel ratio down */

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = 'http://localhost:4325/luca-stach/';
const outDir = path.resolve('docs/concepts/shots/T-106');
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
    '--remote-debugging-port=9229',
    '--window-size=1440,900',
    '--hide-scrollbars',
    '--mute-audio',
    '--user-data-dir=' + path.join(process.env.TEMP ?? '/tmp', 'fd-chrome-t106'),
    'about:blank',
  ],
  { stdio: 'ignore' },
);

async function getWsUrl() {
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch('http://localhost:9229/json');
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



await send('Runtime.enable'); await send('Page.enable');
const setSize = (w, h, mobile = false) =>
  send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile });
const isClassic = () => evaluate(`!document.documentElement.classList.contains('flightdeck') &&
  getComputedStyle(document.getElementById('flight-canvas')).display === 'none'`);

/* (1) desktop */
await setSize(1440, 900);
await send('Page.navigate', { url: BASE }); await sleep(1500);
await evaluate(`localStorage.clear()`);
await send('Page.navigate', { url: BASE }); await sleep(2000);
if (await bootWorld()) ok('(1) desktop: hall boots'); else fail('(1) hall did not boot');
const dpr0 = await evaluate(`window.devicePixelRatio`);

/* (2) narrow → classic */
await setSize(900, 800);
await send('Page.navigate', { url: BASE }); await sleep(3500);
if (await isClassic()) ok('(2) 900 px → classic view'); else fail('(2) 900 px still flightdeck');
await shot('fallback-900');

/* (3) reduced motion → classic */
await setSize(1440, 900);
await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
await send('Page.navigate', { url: BASE }); await sleep(3500);
if (await isClassic()) ok('(3) reduced motion → classic view'); else fail('(3) reduced motion still flightdeck');
await shot('fallback-reduced-motion');
await send('Emulation.setEmulatedMedia', { features: [] });

/* (4) coarse pointer → classic */
await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
await send('Emulation.setEmulatedMedia', { features: [{ name: 'pointer', value: 'coarse' }, { name: 'any-pointer', value: 'coarse' }] });
await send('Page.navigate', { url: BASE }); await sleep(3500);
if (await isClassic()) ok('(4) coarse pointer → classic view'); else fail('(4) coarse pointer still flightdeck');
await send('Emulation.setTouchEmulationEnabled', { enabled: false });
await send('Emulation.setEmulatedMedia', { features: [] });

/* (5) no JS → static contact content */
await send('Emulation.setScriptExecutionDisabled', { value: true });
await send('Page.navigate', { url: BASE }); await sleep(2500);
const nojs = await evaluate(`(() => ({
  mail: !!document.querySelector('a[href^="mailto:"]'),
  linkedin: !!document.querySelector('a[href*="linkedin.com"]'),
  cv: !!document.querySelector('a[download], a[href$=".pdf"]'),
  fd: document.documentElement.classList.contains('flightdeck'),
}))()`);
await send('Emulation.setScriptExecutionDisabled', { value: false });
/* evaluate is devtools-side and still works with page JS disabled */
if (nojs && nojs.mail && nojs.linkedin && nojs.cv && !nojs.fd) ok('(5) no JS: mail + LinkedIn + CV links present, no flightdeck');
else fail(`(5) no-JS content: ${JSON.stringify(nojs)}`);

/* (6) adaptive quality under a throttled CPU */
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 2, mobile: false });
await send('Emulation.setCPUThrottlingRate', { rate: 12 });
await send('Page.navigate', { url: BASE }); await sleep(2000);
await bootWorld();
let dprSeen = [];
for (let i = 0; i < 10; i++) {
  await sleep(2000);
  dprSeen.push(await evaluate(`document.getElementById('flight-canvas').width / innerWidth`));
}
await send('Emulation.setCPUThrottlingRate', { rate: 1 });
console.log('(6) canvas/innerWidth over time:', dprSeen.map((d) => d.toFixed(2)).join(' '), '· device dpr', dpr0);
const last = dprSeen[dprSeen.length - 1];
if (dprSeen[0] > 1.5 && last < dprSeen[0] - 0.2) ok(`(6) adaptive quality: pixel ratio ${dprSeen[0].toFixed(2)} → ${last.toFixed(2)}`);
else fail('(6) pixel ratio never stepped down under throttling');

console.log('CONSOLE_ERRORS (total)', consoleErrors.length ? JSON.stringify(consoleErrors, null, 1) : 'none');
if (consoleErrors.length) fail('console errors present');
ws.close(); chrome.kill();
if (failures > 0) { console.error(`T-106 CDP: ${failures} FAILURES`); process.exit(1); }
console.log('T-106 CDP: PASS'); process.exit(0);
