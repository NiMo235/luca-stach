/* CDP verification for the 4 station toys. Drives each toy via
   Runtime.evaluate and screenshots the result to %TEMP%/fd-shots. */
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = 'http://localhost:4321/luca-stach/';
const outDir = path.join(os.tmpdir(), 'fd-shots');
mkdirSync(outDir, { recursive: true });

const chrome = spawn(CHROME, [
  '--headless=new',
  '--remote-debugging-port=9226',
  '--window-size=1600,900',
  '--hide-scrollbars',
  '--mute-audio',
  '--autoplay-policy=no-user-gesture-required',
  '--user-data-dir=' + path.join(os.tmpdir(), 'fd-chrome-profile-toys'),
  'about:blank',
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
  if (r.result?.exceptionDetails) consoleErrors.push('EVAL-EXC: ' + JSON.stringify(r.result.exceptionDetails).slice(0, 300));
  return r.result?.result?.value;
};
const shot = async (name) => {
  const s = await send('Page.captureScreenshot', { format: 'jpeg', quality: 72 });
  writeFileSync(path.join(outDir, `${name}.jpg`), Buffer.from(s.result.data, 'base64'));
  console.log('SHOT', name);
};
const scrollToStation = async (i) => {
  await evaluate(`window.scrollTo(0, (${i}/6) * (document.documentElement.scrollHeight - innerHeight))`);
  await sleep(2200);
};

await send('Runtime.enable');
await send('Page.enable');

/* ============ flightdeck mode (1600×900, DE) ============ */
await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 900, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: BASE });
await sleep(2500);
await evaluate(`window.dispatchEvent(new KeyboardEvent('keydown'))`);
await sleep(4000);
console.log('FD', JSON.stringify(await evaluate(`({
  flightdeck: document.documentElement.classList.contains('flightdeck'),
  heroDone: document.documentElement.classList.contains('hero-done'),
})`)));

/* ---- TOY 1: BOOT terminal ---- */
await evaluate(`(() => {
  const inp = document.querySelector('[data-term-input]');
  inp.value = 'help';
  inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
})()`);
await sleep(1500);
const term = await evaluate(`({
  out: document.querySelector('[data-term-out]')?.innerText.slice(0, 200),
  visible: getComputedStyle(document.querySelector('[data-terminal]')).display,
})`);
console.log('TOY1-TERMINAL', JSON.stringify(term));
await shot('toy1-boot-terminal');

/* ---- TOY 2: PROOF ROI calculator + tower coupling ---- */
await scrollToStation(1);
await evaluate(`(() => {
  const q = document.querySelector('[data-roi-quotes]');
  q.value = 40; q.dispatchEvent(new Event('input', { bubbles: true }));
})()`);
await sleep(1400); /* count-up + tower lerp */
const roi = await evaluate(`({
  hours: document.querySelector('[data-roi-hours]')?.textContent,
  payback: document.querySelector('[data-roi-payback]')?.textContent,
})`);
console.log('TOY2-ROI', JSON.stringify(roi));
await shot('toy2-proof-roi');

/* ---- TOY 3: WORK warehouse game ---- */
await scrollToStation(3);
const wh1 = await evaluate(`(() => {
  const pkgs = () => [...document.querySelectorAll('[data-wh-queue] .wh-pkg')];
  pkgs()[0].click();
  document.querySelector('[data-slot="0"]').click();
  return { queue: pkgs().length };
})()`);
await sleep(700);
const wh2 = await evaluate(`(() => {
  const pkgs = () => [...document.querySelectorAll('[data-wh-queue] .wh-pkg')];
  pkgs()[0].click();
  document.querySelector('[data-slot="5"]').click();
  return document.querySelector('[data-wh-count]')?.textContent;
})()`);
await sleep(700);
const wh3 = await evaluate(`(() => {
  document.querySelector('[data-wh-optimize]').click();
  return document.querySelector('[data-wh-count]')?.textContent;
})()`);
await sleep(900);
const whState = await evaluate(`({
  count: document.querySelector('[data-wh-count]')?.textContent,
  stored: [...document.querySelectorAll('[data-wh-grid] .wh-pkg')].map(p => p.textContent),
  queue: document.querySelectorAll('[data-wh-queue] .wh-pkg').length,
})`);
console.log('TOY3-WH', JSON.stringify({ wh1, wh2, wh3, ...whState }));
await shot('toy3-work-warehouse');

/* ---- TOY 4: BEYOND sequencer ---- */
await scrollToStation(5);
await evaluate(`(() => {
  document.querySelector('[data-seq-cell][data-track="3"][data-step="4"]').click();
  document.querySelector('[data-seq-cell][data-track="1"][data-step="0"]').click();
  document.querySelector('[data-seq-play]').click();
})()`);
await sleep(1600);
const seq = await evaluate(`({
  playing: document.querySelector('[data-seq]')?.classList.contains('is-playing'),
  btnLabel: document.querySelector('[data-seq-play]')?.textContent,
  hudAudio: document.querySelector('[data-audio-toggle]')?.textContent,
  hudPressed: document.querySelector('[data-audio-toggle]')?.getAttribute('aria-pressed'),
  playhead: !!document.querySelector('.seq-cell.is-now'),
  toggledOn: document.querySelector('[data-seq-cell][data-track="3"][data-step="4"]')?.classList.contains('is-on'),
})`);
console.log('TOY4-SEQ', JSON.stringify(seq));
await shot('toy4-beyond-sequencer');
await evaluate(`document.querySelector('[data-seq-play]').click()`); /* stop */
await sleep(600);
console.log('TOY4-STOP', JSON.stringify(await evaluate(`({
  playing: document.querySelector('[data-seq]')?.classList.contains('is-playing'),
  hudAudio: document.querySelector('[data-audio-toggle]')?.textContent,
})`)));

/* ============ EN locale quick pass ============ */
await send('Page.navigate', { url: BASE + 'en/' });
await sleep(2500);
await evaluate(`window.dispatchEvent(new KeyboardEvent('keydown'))`);
await sleep(4000);
await evaluate(`(() => {
  const inp = document.querySelector('[data-term-input]');
  inp.value = 'whoami';
  inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
})()`);
await sleep(2500);
console.log('EN-TERM', JSON.stringify(await evaluate(
  `document.querySelector('[data-term-out]')?.innerText.slice(0, 160)`)));
await shot('toy-en-terminal');

/* ============ classic mode (900px) ============ */
await send('Emulation.setDeviceMetricsOverride', { width: 900, height: 700, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: BASE });
await sleep(2500);
await evaluate(`window.dispatchEvent(new KeyboardEvent('keydown'))`);
await sleep(3000);
const classic = await evaluate(`({
  flightdeck: document.documentElement.classList.contains('flightdeck'),
  termVisible: getComputedStyle(document.querySelector('[data-terminal]')).display !== 'none',
  roiVisible: getComputedStyle(document.querySelector('[data-roi]')).display !== 'none',
  whVisible: getComputedStyle(document.querySelector('[data-wh]')).display !== 'none',
  seqVisible: getComputedStyle(document.querySelector('[data-seq]')).display !== 'none',
})`);
console.log('CLASSIC', JSON.stringify(classic));
/* drive warehouse in classic: store one package */
await evaluate(`(() => {
  document.querySelector('[data-wh-queue] .wh-pkg').click();
  document.querySelector('[data-slot="2"]').click();
})()`);
await sleep(600);
console.log('CLASSIC-WH', JSON.stringify(await evaluate(
  `document.querySelector('[data-wh-count]')?.textContent`)));
await evaluate(`document.getElementById('work').scrollIntoView()`);
await sleep(800);
await shot('toy-classic-work');

console.log('CONSOLE_ERRORS', consoleErrors.length ? JSON.stringify(consoleErrors, null, 1) : 'none');
ws.close();
chrome.kill();
process.exit(0);
