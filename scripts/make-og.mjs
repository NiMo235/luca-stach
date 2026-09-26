import sharp from 'sharp';

const W = 1200;
const H = 630;
const ink = '#0a0d0a';
const paper = '#eef1e9';
const acid = '#B4FF39';
const faint = 'rgba(238,241,233,0.07)';

let grid = '';
for (let x = 0; x <= W; x += 48) grid += `<line x1="${x}" y1="0" x2="${x}" y2="${H}" stroke="${faint}" stroke-width="1"/>`;
for (let y = 0; y <= H; y += 48) grid += `<line x1="0" y1="${y}" x2="${W}" y2="${y}" stroke="${faint}" stroke-width="1"/>`;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${ink}"/>
  ${grid}
  <rect x="24" y="24" width="${W - 48}" height="${H - 48}" fill="none" stroke="rgba(238,241,233,0.18)" stroke-width="2"/>
  <text x="64" y="110" font-family="monospace" font-size="26" fill="${acid}">~ whoami</text>
  <text x="64" y="300" font-family="Arial, sans-serif" font-weight="800" font-size="128" letter-spacing="2" fill="${paper}">LUCA STACH</text>
  <text x="64" y="380" font-family="monospace" font-size="40" fill="${acid}">&gt; BizOps &amp; AI Automation</text>
  <text x="64" y="560" font-family="monospace" font-size="26" fill="rgba(238,241,233,0.55)">proof, not promises  —  67% faster quotes  ·  ROI &lt; 3 yrs  ·  thesis 1.4</text>
  <rect x="1010" y="86" width="18" height="36" fill="${acid}"/>
</svg>`;

await sharp(Buffer.from(svg)).png().toFile('public/og.png');
console.log('public/og.png written');
