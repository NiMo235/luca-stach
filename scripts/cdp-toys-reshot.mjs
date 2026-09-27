/* focused re-shots: scroll the station panel's internal scroll area so
   the ROI readout and the warehouse game are visible */
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const outDir = path.join(os.tmpdir(), 'fd-shots');
mkdirSync(outDir, { recursive: true });

const chrome = spawn(CHROME, [
  '--headless=new', '--remote-debugging-port=9227', '--window-size=1600,900',
  '--hide-scrollbars', '--mute-audio', '--autoplay-policy=no-user-gesture-required',
  '--user-data-dir=' + path.join(os.tmpdir(), 'fd-chrome-profile-toys2'),
  'about:blank',
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function getWsUrl() {
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch('http://localhost:9227/json');
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
  return r.result?.result?.value;
};
const shot = async (name) => {
  const s = await send('Page.captureScreenshot', { format: 'jpeg', quality: 72 });
  writeFileSync(path.join(outDir, `${name}.jpg`), Buffer.from(s.result.data, 'base64'));
  console.log('SHOT', name);
};
const PANEL = `(() => { const s = document.querySelector('.station-active'); return s?.querySelector(':scope > div:not([aria-hidden="true"])'); })()`;

await send('Runtime.enable');
await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 900, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: 'http://localhost:4321/luca-stach/' });
await sleep(2500);
await evaluate(`window.dispatchEvent(new KeyboardEvent('keydown'))`);
await sleep(4000);

/* PROOF: slider + panel scrolled to the calc readout */
await evaluate(`window.scrollTo(0, (1/6) * (document.documentElement.scrollHeight - innerHeight))`);
await sleep(2200);
await evaluate(`(() => { const q = document.querySelector('[data-roi-quotes]'); q.value = 40; q.dispatchEvent(new Event('input', { bubbles: true })); })()`);
await sleep(1200);
await evaluate(`(() => { const p = ${PANEL}; if (p) p.scrollTop = p.scrollHeight; })()`);
await sleep(1200);
await shot('toy2b-proof-readout');

/* WORK: store 2, optimize, panel scrolled to the game */
await evaluate(`window.scrollTo(0, (3/6) * (document.documentElement.scrollHeight - innerHeight))`);
await sleep(2200);
await evaluate(`(() => {
  document.querySelector('[data-wh-queue] .wh-pkg').click();
  document.querySelector('[data-slot="0"]').click();
})()`);
await sleep(700);
await evaluate(`(() => {
  document.querySelector('[data-wh-queue] .wh-pkg').click();
  document.querySelector('[data-slot="5"]').click();
})()`);
await sleep(700);
await evaluate(`document.querySelector('[data-wh-optimize]').click()`);
await sleep(900);
await evaluate(`(() => { const p = ${PANEL}; if (p) p.scrollTop = p.scrollHeight; })()`);
await sleep(900);
await shot('toy3b-work-game');

console.log('CONSOLE_ERRORS', consoleErrors.length ? JSON.stringify(consoleErrors) : 'none');
ws.close();
chrome.kill();
process.exit(0);
