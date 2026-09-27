/* regression: reduced-motion path + ls/whoami easter egg + cv command */
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const outDir = path.join(os.tmpdir(), 'fd-shots');
mkdirSync(outDir, { recursive: true });

const chrome = spawn(CHROME, [
  '--headless=new', '--remote-debugging-port=9228', '--window-size=1600,900',
  '--hide-scrollbars', '--mute-audio', '--autoplay-policy=no-user-gesture-required',
  '--user-data-dir=' + path.join(os.tmpdir(), 'fd-chrome-profile-toys3'),
  'about:blank',
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function getWsUrl() {
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch('http://localhost:9228/json');
      const page = (await res.json()).find((t) => t.type === 'page');
      if (page) return page.webSocketDebuggerUrl;
    } catch {}
    await sleep(250);
  }
  throw new Error('no devtools');
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
  const id = ++msgId; pending.set(id, res);
  ws.send(JSON.stringify({ id, method, params }));
});
const evaluate = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.result?.exceptionDetails) consoleErrors.push('EVAL-EXC: ' + JSON.stringify(r.result.exceptionDetails).slice(0, 300));
  return r.result?.result?.value;
};
const shot = async (name) => {
  const s = await send('Page.captureScreenshot', { format: 'jpeg', quality: 72 });
  writeFileSync(path.join(outDir, `${name}.jpg`), Buffer.from(s.result.data, 'base64'));
  console.log('SHOT', name);
};

await send('Runtime.enable');
await send('Page.enable');

/* ---- 1) reduced motion: classic mode, toys instant but functional ---- */
await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 900, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: 'http://localhost:4321/luca-stach/' });
await sleep(2500);
const rm = await evaluate(`({
  flightdeck: document.documentElement.classList.contains('flightdeck'),
  heroDone: document.documentElement.classList.contains('hero-done'),
  termVisible: getComputedStyle(document.querySelector('[data-terminal]')).display !== 'none',
})`);
console.log('REDUCED', JSON.stringify(rm));
/* terminal responds instantly (typing skipped) */
await evaluate(`(() => {
  const inp = document.querySelector('[data-term-input]');
  inp.value = 'skills';
  inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
})()`);
await sleep(400);
console.log('REDUCED-TERM', JSON.stringify(await evaluate(
  `document.querySelector('[data-term-out]')?.innerText.slice(0, 120)`)));
/* warehouse works instantly */
await evaluate(`(() => {
  document.querySelector('[data-wh-queue] .wh-pkg').click();
  document.querySelector('[data-slot="1"]').click();
})()`);
await sleep(300);
console.log('REDUCED-WH', JSON.stringify(await evaluate(
  `document.querySelector('[data-wh-count]')?.textContent`)));
/* roi updates instantly */
await evaluate(`(() => { const q = document.querySelector('[data-roi-minutes]'); q.value = 50; q.dispatchEvent(new Event('input', { bubbles: true })); })()`);
await sleep(200);
console.log('REDUCED-ROI', JSON.stringify(await evaluate(
  `document.querySelector('[data-roi-hours]')?.textContent`)));
await shot('toy-reduced');

/* ---- 2) easter egg regression: type ls in normal mode ---- */
await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
await send('Page.navigate', { url: 'http://localhost:4321/luca-stach/' });
await sleep(2500);
await evaluate(`window.dispatchEvent(new KeyboardEvent('keydown'))`);
await sleep(3500);
await evaluate(`(() => {
  for (const k of ['l', 's']) window.dispatchEvent(new KeyboardEvent('keydown', { key: k }));
})()`);
await sleep(600);
const egg = await evaluate(`({
  heroDoneMid: document.documentElement.classList.contains('hero-done'),
  bootVisible: getComputedStyle(document.querySelector('[data-hero-boot]')).display !== 'none',
})`);
console.log('EGG-MID', JSON.stringify(egg));
await sleep(4000);
console.log('EGG-AFTER', JSON.stringify(await evaluate(`({
  heroDone: document.documentElement.classList.contains('hero-done'),
})`)));

/* ---- 3) cv command: prints link (download offer fires) ---- */
await evaluate(`(() => {
  const inp = document.querySelector('[data-term-input]');
  inp.value = 'cv';
  inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
})()`);
await sleep(1500);
console.log('CV', JSON.stringify(await evaluate(`({
  out: document.querySelector('[data-term-out]')?.innerText.slice(-120),
  link: document.querySelector('[data-term-out] a.term-link')?.getAttribute('href'),
})`)));

console.log('CONSOLE_ERRORS', consoleErrors.length ? JSON.stringify(consoleErrors) : 'none');
ws.close();
chrome.kill();
process.exit(0);
