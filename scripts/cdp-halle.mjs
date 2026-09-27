import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

/* T-101: screenshots of DIE HALLE at p = 0, 1/6, … 1 (1440×900).
   Requires `astro preview` on :4321. Output: docs/concepts/shots/T-101/ */

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL = 'http://localhost:4321/luca-stach/';
const outDir = path.resolve('docs/concepts/shots/T-101');
mkdirSync(outDir, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const chrome = spawn(CHROME, [
  '--headless=new',
  '--remote-debugging-port=9225',
  '--window-size=1440,900',
  '--hide-scrollbars',
  '--mute-audio',
  '--user-data-dir=' + path.join(process.env.TEMP ?? '/tmp', 'fd-chrome-halle'),
  'about:blank',
], { stdio: 'ignore' });

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

await send('Runtime.enable');
await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: URL });
await sleep(2500);

/* skip the cold boot, wait for the hall to build */
await evaluate(`window.dispatchEvent(new KeyboardEvent('keydown'))`);
await sleep(5000);

const state = await evaluate(`({
  flightdeck: document.documentElement.classList.contains('flightdeck'),
  heroDone: document.documentElement.classList.contains('hero-done'),
  tc: document.querySelector('.hud-titlecard')?.textContent?.trim(),
})`);
console.log('STATE', JSON.stringify(state));

const NAMES = ['boot', 'proof', 'log', 'work', 'stack', 'beyond', 'dock'];
for (let i = 0; i < 7; i++) {
  const p = i / 6;
  await evaluate(`window.scrollTo(0, ${p} * (document.documentElement.scrollHeight - innerHeight))`);
  await sleep(2600);
  const hud = await evaluate(`document.querySelector('[data-hud-station]')?.textContent`);
  const pos = await evaluate(`document.querySelector('[data-hud-pos]')?.textContent`);
  const shot = await send('Page.captureScreenshot', { format: 'jpeg', quality: 78 });
  writeFileSync(path.join(outDir, `p${i}-of-6-${NAMES[i]}.jpg`), Buffer.from(shot.result.data, 'base64'));
  console.log('SHOT', NAMES[i], 'hud=', hud, 'pos=', pos);
}

/* mid-transit spot checks (collision control) */
for (const [name, p] of [['transit-proof-log', 0.25], ['transit-beyond-dock', 11 / 12]]) {
  await evaluate(`window.scrollTo(0, ${p} * (document.documentElement.scrollHeight - innerHeight))`);
  await sleep(1400);
  const shot = await send('Page.captureScreenshot', { format: 'jpeg', quality: 78 });
  writeFileSync(path.join(outDir, `${name}.jpg`), Buffer.from(shot.result.data, 'base64'));
  console.log('SHOT', name);
}

/* back to BOOT for the stats readout */
await evaluate(`window.scrollTo(0, 0)`);
await sleep(2600);
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
