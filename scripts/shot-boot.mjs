import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const outDir = path.join(os.tmpdir(), 'fd-shots');
mkdirSync(outDir, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const chrome = spawn(CHROME, [
  '--headless=new',
  '--remote-debugging-port=9224',
  '--window-size=1600,900',
  '--hide-scrollbars',
  '--mute-audio',
  '--user-data-dir=' + path.join(os.tmpdir(), 'fd-chrome-profile-2'),
  'about:blank',
], { stdio: 'ignore' });

async function getWsUrl() {
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch('http://localhost:9224/json');
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
  const s = await send('Page.captureScreenshot', { format: 'jpeg', quality: 72 });
  const file = path.join(outDir, `${name}.jpg`);
  writeFileSync(file, Buffer.from(s.result.data, 'base64'));
  console.log('SHOT', name, '->', file);
};

await send('Runtime.enable');
await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 900, deviceScaleFactor: 1, mobile: false });

// 1) GATE (encrypted build served at 127.0.0.1:4455)
await send('Page.navigate', { url: 'http://127.0.0.1:4455/' });
await sleep(2500);
await shot('gate-early');
await sleep(4000);
await shot('gate-typed');

// 2) BOOT SEQUENCE (plain build via astro preview at /luca-stach/)
await send('Page.navigate', { url: 'http://localhost:4321/luca-stach/' });
await sleep(2000);
await shot('boot-2s');
await sleep(4000);
await shot('boot-6s');
await sleep(5000);
await shot('boot-11s');
await sleep(6000);
await shot('boot-17s');
const state = await evaluate(`({
  booting: document.documentElement.classList.contains('booting'),
  heroDone: document.documentElement.classList.contains('hero-done'),
  overlayVisible: getComputedStyle(document.getElementById('boot-overlay')).opacity,
})`);
console.log('FINAL_STATE', JSON.stringify(state));

console.log('CONSOLE_ERRORS', consoleErrors.length ? JSON.stringify(consoleErrors, null, 1) : 'none');
ws.close();
chrome.kill();
process.exit(0);
