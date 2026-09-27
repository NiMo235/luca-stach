import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

/* T-102: screenshots of the LIVING hall (1440×900).
   Requires `astro preview` on :4325. Output: docs/concepts/shots/T-102/
   - power-up at ~0.5 s / ~1.5 s / done
   - WORK + LOG with the simulation running
   - 3-frame motion sequence at WORK (1 s apart)
   - one held AGV with congestion (triggered via __halleDebug)        */

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL = 'http://localhost:4325/luca-stach/';
const outDir = path.resolve('docs/concepts/shots/T-102');
mkdirSync(outDir, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const chrome = spawn(CHROME, [
  '--headless=new',
  '--remote-debugging-port=9226',
  '--window-size=1440,900',
  '--hide-scrollbars',
  '--mute-audio',
  '--user-data-dir=' + path.join(process.env.TEMP ?? '/tmp', 'fd-chrome-t102'),
  'about:blank',
], { stdio: 'ignore' });

async function getWsUrl() {
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch('http://localhost:9226/json');
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

await send('Runtime.enable');
await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: URL });
await sleep(2000);

/* skip the cold boot, then catch the power-up as soon as the world is up */
await evaluate(`window.dispatchEvent(new KeyboardEvent('keydown'))`);
let up = false;
for (let i = 0; i < 80; i++) {
  const ready = await evaluate(`document.querySelector('[data-tc-parts]')?.textContent !== '—'`);
  if (ready) { up = true; break; }
  await sleep(200);
}
console.log('world up:', up);

await sleep(500);
await shot('powerup-0.5s');
await sleep(1000);
await shot('powerup-1.5s');
await sleep(2200);
await shot('powerup-done');

/* WORK with running sim: 3 frames 1 s apart (motion sequence) */
await evaluate(`window.scrollTo(0, ${3 / 6} * (document.documentElement.scrollHeight - innerHeight))`);
await sleep(2600);
await shot('work-anim-1');
await sleep(1000);
await shot('work-anim-2');
await sleep(1000);
await shot('work-anim-3');

/* LOG with running sim */
await evaluate(`window.scrollTo(0, ${2 / 6} * (document.documentElement.scrollHeight - innerHeight))`);
await sleep(2600);
await shot('log-live');

/* held AGV + congestion: pick a working AGV that is ON SCREEN in the
   left half (not behind the work panel), hold it, watch the queue grow */
await evaluate(`window.scrollTo(0, ${3 / 6} * (document.documentElement.scrollHeight - innerHeight))`);
await sleep(2200);
const held = await evaluate(`(() => {
  const cands = window.__halleDebug.working()
    .map((id) => window.__halleDebug.probe(id))
    .filter((p) => p && p.sx > 120 && p.sx < 780 && p.sy > 260 && p.sy < 800);
  cands.sort((a, b) => b.sy - a.sy); // lowest on screen first = closest
  if (!cands.length) return -1;
  return window.__halleDebug.holdId(cands[0].id) ? cands[0].id : -1;
})()`);
console.log('held AGV:', held);
await sleep(4500);
const heldProbe = await evaluate(`window.__halleDebug.probe(${held})`);
console.log('held probe:', JSON.stringify(heldProbe));
await shot('agv-hold-stau');
await sleep(5000);
await shot('agv-hold-released');

const stats = await evaluate(`({
  tris: document.querySelector('[data-tc-tris]')?.textContent,
  parts: document.querySelector('[data-tc-parts]')?.textContent,
  fps: document.querySelector('[data-tc-fps]')?.textContent,
  sim: window.__halleDebug.stats(),
  telemetry: document.querySelector('.hud-tc-sim')?.textContent?.trim(),
})`);
console.log('STATS', JSON.stringify(stats));

console.log('CONSOLE_ERRORS', consoleErrors.length ? JSON.stringify(consoleErrors, null, 1) : 'none');
ws.close();
chrome.kill();
process.exit(0);
