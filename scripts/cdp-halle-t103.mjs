import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

/* T-103 Runde 1: screenshots of the zoned hall.
   Requires `astro preview --port 4325`. Output: docs/concepts/shots/T-103/
   - all 7 stations with the minimap COLLAPSED (default everywhere now)
   - DOCK + PROOF additionally with the minimap open (solid bg, x icon)
   - hotspot hover + hotspot tap before/after
   - 1280×800: DOCK collapsed + open, WORK collapsed                  */

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
  '--user-data-dir=' + path.join(process.env.TEMP ?? '/tmp', 'fd-chrome-t103r1'),
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
const bootWorld = async () => {
  await evaluate(`window.dispatchEvent(new KeyboardEvent('keydown'))`);
  let up = false;
  for (let i = 0; i < 80; i++) {
    const ready = await evaluate(`document.querySelector('[data-tc-parts]')?.textContent !== '—'`);
    if (ready) { up = true; break; }
    await sleep(200);
  }
  console.log('world up:', up);
  await sleep(3500); // power-up completes
};
const setMap = async (open) => {
  const isOpen = await evaluate(`document.querySelector('#halle-map')?.dataset.collapsed === 'false'`);
  if (isOpen !== open) await evaluate(`document.querySelector('.halle-map-toggle').click()`);
  await sleep(400);
};

await send('Runtime.enable');
await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: URL });
await sleep(1500);
/* deterministic minimap state: forget any stored toggle, then reload */
await evaluate(`localStorage.clear()`);
await send('Page.navigate', { url: URL });
await sleep(2000);
await bootWorld();

/* all 7 stations, minimap collapsed (default) — panel content must be
   fully reachable exactly like in main */
const names = ['boot', 'proof', 'log', 'work', 'stack', 'beyond', 'dock'];
for (let i = 0; i < 7; i++) {
  await scrollToStation(i);
  await shot(`station-0${i + 1}-${names[i]}`);
  if (i === 1 || i === 6) {
    await setMap(true);
    await shot(`station-0${i + 1}-${names[i]}-mapopen`);
    await setMap(false);
  }
}

/* hotspot hover + tap: back to BOOT, hover/tap the WORK hotspot */
await scrollToStation(0);
const hs = await evaluate(`window.__halleDebug.hotspots()`);
const target = hs.find((h) => h.station === 3 && h.sx > 500 && h.sx < 1300 && h.sy > 150 && h.sy < 800)
  ?? hs.find((h) => h.station !== 0 && h.sx > 500 && h.sx < 1300 && h.sy > 150 && h.sy < 800);
console.log('hover target:', JSON.stringify(target));
if (target) {
  await shot('hotspot-click-before');
  await evaluate(`window.dispatchEvent(new PointerEvent('pointermove', { clientX: ${target.sx}, clientY: ${target.sy} }))`);
  await sleep(600);
  await shot('hotspot-hover');
  const before = await activeStation();
  await evaluate(`document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: ${target.sx}, clientY: ${target.sy} }))`);
  await evaluate(`document.body.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: ${target.sx}, clientY: ${target.sy} }))`);
  await sleep(3300);
  const after = await activeStation();
  console.log('station before/after tap:', before, '→', after);
  await shot('hotspot-click-after');
}

/* 1280×800: DOCK collapsed + open, WORK collapsed */
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: URL });
await sleep(1500);
await evaluate(`localStorage.clear()`);
await send('Page.navigate', { url: URL });
await sleep(2000);
await evaluate(`window.dispatchEvent(new KeyboardEvent('keydown'))`);
await sleep(2500);
await evaluate(`window.dispatchEvent(new KeyboardEvent('keydown'))`); // skip power-up too
await sleep(1500);
await scrollToStation(6);
await shot('r1280-dock');
await setMap(true);
await shot('r1280-dock-mapopen');
await setMap(false);
await scrollToStation(3);
await shot('r1280-work');

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
