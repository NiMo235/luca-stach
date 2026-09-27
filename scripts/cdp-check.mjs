import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL = 'http://localhost:4321/luca-stach/';
const outDir = path.join(os.tmpdir(), 'fd-shots');
mkdirSync(outDir, { recursive: true });

const chrome = spawn(CHROME, [
  '--headless=new',
  '--remote-debugging-port=9223',
  '--window-size=1600,900',
  '--hide-scrollbars',
  '--mute-audio',
  '--user-data-dir=' + path.join(os.tmpdir(), 'fd-chrome-profile'),
  'about:blank',
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getWsUrl() {
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch('http://localhost:9223/json');
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

await send('Runtime.enable');
await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 900, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: URL });
await sleep(2500);

/* skip the cold-boot typewriter, then wait for the world to be up */
await evaluate(`window.dispatchEvent(new KeyboardEvent('keydown'))`);
await sleep(4000);

const state = await evaluate(`({
  flightdeck: document.documentElement.classList.contains('flightdeck'),
  heroDone: document.documentElement.classList.contains('hero-done'),
  stations: document.querySelectorAll('[data-fly]').length,
  scrollMax: document.documentElement.scrollHeight - innerHeight,
})`);
console.log('STATE', JSON.stringify(state));

const PANEL_EXPR = `(() => {
  const s = document.querySelector('.station-active');
  if (!s) return null;
  const p = s.querySelector(':scope > div:not([aria-hidden="true"])');
  if (!p) return null;
  const r = p.getBoundingClientRect();
  return { id: s.id, w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.x), y: Math.round(r.y),
    wPct: +(r.width / innerWidth * 100).toFixed(1), hPct: +(r.height / innerHeight * 100).toFixed(1) };
})()`;

const shots = [];
for (let i = 0; i < 7; i++) shots.push({ name: `station-${i + 1}`, p: i / 6 });
shots.push({ name: 'transit-1-2', p: 1 / 12 });
shots.push({ name: 'transit-5-6', p: 5 / 6 + 1 / 24 });

for (const s of shots) {
  await evaluate(`window.scrollTo(0, ${s.p} * (document.documentElement.scrollHeight - innerHeight))`);
  await sleep(2400);
  const hud = await evaluate(`document.querySelector('[data-hud-station]')?.textContent`);
  const panel = await evaluate(PANEL_EXPR);
  const shot = await send('Page.captureScreenshot', { format: 'jpeg', quality: 70 });
  const file = path.join(outDir, `${s.name}.jpg`);
  writeFileSync(file, Buffer.from(shot.result.data, 'base64'));
  /* right-edge strip: a near-black 60px strip compresses to ~2-3 KB jpeg;
     content (world visible around the panel) makes it grow */
  const edge = await send('Page.captureScreenshot', {
    format: 'jpeg', quality: 70,
    clip: { x: 1600 - 60, y: 0, width: 60, height: 900, scale: 1 },
  });
  const edgeFile = path.join(outDir, `${s.name}-edge.jpg`);
  writeFileSync(edgeFile, Buffer.from(edge.result.data, 'base64'));
  console.log('SHOT', s.name, 'hud=', hud, 'panel=', JSON.stringify(panel), 'edgeKB=', (statSync(edgeFile).size / 1024).toFixed(1));
}

console.log('CONSOLE_ERRORS', consoleErrors.length ? JSON.stringify(consoleErrors, null, 1) : 'none');
ws.close();
chrome.kill();
process.exit(0);
