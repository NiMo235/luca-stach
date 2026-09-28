import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

/* T-103: screenshots of the zoned hall (1440×900 + 1280×800).
   Requires `astro preview --port 4325`. Output: docs/concepts/shots/T-103/
   - all 7 stations
   - minimap open + collapsed
   - hotspot hover (pointer cursor + brighten)
   - hotspot tap: before/after with a different station active
   - 1280×800 sample (minimap defaults to collapsed < 1360 px)        */

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL = 'http://localhost:4325/luca-stach/';
const outDir = path.resolve('docs/concepts/shots/T-103');
mkdirSync(outDir, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const chrome = spawn(CHROME, [
  '--headless=new',
  '--remote-debugging-port=9227',
  '--window-size=1440,900',
  '--hide-scrollbars',
  '--mute-audio',
  '--user-data-dir=' + path.join(process.env.TEMP ?? '/tmp', 'fd-chrome-t103'),
  'about:blank',
], { stdio: 'ignore' });

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
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

let msgId = 0;
const pending = new Map();
const consoleErrors = [];
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  if (m.method === 'Runtime.exceptionThrown') consoleErrors.push('EXC: ' + JSON.stringify(m.params.exceptionDetails?.exception?.description ?? m.params).slice(0, 300));
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') consoleErrors.push('ERR: ' + m.params.args.map(a => a.value ?? a.description ?? '').join(' ').slice(0, 300));
};
const send = (method, params = {}) => new Promise((res) => {
  const id = ++msgId;
  pending.set(id, res);
  ws.send(JSON.stringify({ id, method, params }));
});
const evaluate = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  return r.result?.result?.value;
};
const shot = async (name) => {
  const s = await send('Page.captureScreenshot', { format: 'jpeg', quality: 80 });
  writeFileSync(path.join(outDir, `${name}.jpg`), Buffer.from(s.result.data, 'base64'));
  console.log('SHOT', name);
};
const scrollToStation = async (i) => {
  await evaluate(`window.scrollTo(0, ${i / 6} * (document.documentElement.scrollHeight - innerHeight))`);
  await sleep(2800);
};
const activeStation = () => evaluate(`document.querySelector('[data-hud-station]')?.textContent`);

await send('Runtime.enable');
await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: URL });
await sleep(2000);

/* skip the cold boot, wait for the world */
await evaluate(`window.dispatchEvent(new KeyboardEvent('keydown'))`);
let up = false;
for (let i = 0; i < 80; i++) {
  const ready = await evaluate(`document.querySelector('[data-tc-parts]')?.textContent !== '—'`);
  if (ready) { up = true; break; }
  await sleep(200);
}
console.log('world up:', up);
await sleep(3500); // power-up completes

/* minimap starts open at 1440 px — one shot at BOOT, then collapsed */
await shot('station-01-boot-mapopen');
await evaluate(`document.querySelector('.halle-map-toggle').click()`);
await sleep(400);
await shot('minimap-collapsed');
await evaluate(`document.querySelector('.halle-map-toggle').click()`);
await sleep(400);

/* all 7 stations (map open) */
await scrollToStation(1);
await shot('station-02-proof');
await scrollToStation(2);
await shot('station-03-log');
await scrollToStation(3);
await shot('station-04-work');
await scrollToStation(4);
await shot('station-05-stack');
await scrollToStation(5);
await shot('station-06-beyond');
await scrollToStation(6);
await shot('station-07-dock');

/* hotspot hover: back to BOOT, find the WORK hotspot on screen, hover it */
await scrollToStation(0);
const hs = await evaluate(`window.__halleDebug.hotspots()`);
const target = hs.find((h) => h.station === 3 && h.sx > 500 && h.sx < 1300 && h.sy > 150 && h.sy < 800)
  ?? hs.find((h) => h.station !== 0 && h.sx > 500 && h.sx < 1300 && h.sy > 150 && h.sy < 800);
console.log('hover target:', JSON.stringify(target));
if (target) {
  await evaluate(`window.dispatchEvent(new PointerEvent('pointermove', { clientX: ${target.sx}, clientY: ${target.sy} }))`);
  await sleep(600);
  await shot('hotspot-hover');
  /* hotspot tap: pointerdown/up on body (bubbles to the window listeners) */
  const before = await activeStation();
  await evaluate(`document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: ${target.sx}, clientY: ${target.sy} }))`);
  await evaluate(`document.body.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: ${target.sx}, clientY: ${target.sy} }))`);
  await sleep(700);
  await shot('hotspot-click-before'); // mid-flight, panel of the old station leaving
  await sleep(2600);
  const after = await activeStation();
  console.log('station before/after tap:', before, '→', after);
  await shot('hotspot-click-after');
}

/* 1280×800 sample: minimap defaults to collapsed below 1360 px */
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: URL });
await sleep(2000);
await evaluate(`window.dispatchEvent(new KeyboardEvent('keydown'))`);
await sleep(2500);
await evaluate(`window.dispatchEvent(new KeyboardEvent('keydown'))`); // skip power-up too
await sleep(1500);
await scrollToStation(3);
await shot('r1280-work-mapcollapsed');
await evaluate(`document.querySelector('.halle-map-toggle').click()`);
await sleep(400);
await shot('r1280-work-mapopen');
await scrollToStation(5);
await shot('r1280-beyond-mapopen');

const stats = await evaluate(`({
  tris: document.querySelector('[data-tc-tris]')?.textContent,
  parts: document.querySelector('[data-tc-parts]')?.textContent,
  fps: document.querySelector('[data-tc-fps]')?.textContent,
})`);
console.log('STATS', JSON.stringify(stats));
console.log('CONSOLE_ERRORS', consoleErrors.length ? JSON.stringify(consoleErrors, null, 1) : 'none');
ws.close();
chrome.kill();
process.exit(0);
