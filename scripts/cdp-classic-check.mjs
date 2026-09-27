import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const outDir = path.join(os.tmpdir(), 'fd-shots');
mkdirSync(outDir, { recursive: true });

const chrome = spawn(CHROME, [
  '--headless=new',
  '--remote-debugging-port=9225',
  '--window-size=1600,900',
  '--hide-scrollbars',
  '--mute-audio',
  '--user-data-dir=' + path.join(os.tmpdir(), 'fd-chrome-profile-3'),
  'about:blank',
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getWsUrl() {
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch('http://localhost:9225/json');
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
  console.log('SHOT', name);
};

await send('Runtime.enable');
await send('Page.enable');

/* 1) classic mode: narrow viewport must not engage the flight deck */
await send('Emulation.setDeviceMetricsOverride', { width: 900, height: 700, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: 'http://localhost:4321/luca-stach/' });
await sleep(2500);
await evaluate(`window.dispatchEvent(new KeyboardEvent('keydown'))`);
await sleep(3500);
const classic = await evaluate(`({
  flightdeck: document.documentElement.classList.contains('flightdeck'),
  sectionsInFlow: [...document.querySelectorAll('#proof,#log,#work,#stack,#beyond,#contact')].every((s) => getComputedStyle(s).position !== 'fixed'),
  corridorHidden: getComputedStyle(document.getElementById('flight-corridor')).display === 'none',
  scrollable: document.documentElement.scrollHeight > innerHeight * 3,
})`);
await evaluate(`window.scrollTo(0, document.getElementById('proof').offsetTop)`);
await sleep(800);
console.log('CLASSIC', JSON.stringify(classic));
await shot('classic-proof');

/* 2) EN locale flight deck */
await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 900, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: 'http://localhost:4321/luca-stach/en/' });
await sleep(2500);
await evaluate(`window.dispatchEvent(new KeyboardEvent('keydown'))`);
await sleep(4000);
await evaluate(`window.scrollTo(0, (3/6) * (document.documentElement.scrollHeight - innerHeight))`);
await sleep(2400);
const en = await evaluate(`({
  flightdeck: document.documentElement.classList.contains('flightdeck'),
  heading: document.querySelector('.station-active h2')?.textContent?.trim(),
  hud: document.querySelector('[data-hud-station]')?.textContent,
})`);
console.log('EN', JSON.stringify(en));
await shot('en-station-4');

console.log('CONSOLE_ERRORS', consoleErrors.length ? JSON.stringify(consoleErrors, null, 1) : 'none');
ws.close();
chrome.kill();
process.exit(0);
