// Vẽ một ô cửa sổ của bản vẽ ra SVG -> PNG để xem
import fs from 'fs';
import { createRequire } from 'module'; const { chromium } = createRequire(import.meta.url)('playwright');
const [,, inJson, cx, cy, half, outPng, layersArg] = process.argv;
const d = JSON.parse(fs.readFileSync(inJson));
const X = +cx, Y = +cy, H = +half;
const inWin = (x, y) => x > X - H && x < X + H && y > Y - H && y < Y + H;
const palette = ['#c0392b','#2c5d8f','#2f7d4f','#b5820a','#8e44ad','#16a085','#d35400','#7f8c8d','#e84393','#0984e3','#6c5ce7','#00b894'];
const layerColor = {}; let ci = 0;
const col = l => layerColor[l] || (layerColor[l] = palette[ci++ % palette.length]);
const only = layersArg ? new Set(layersArg.split(',')) : null;
let svg = '';
for (const ln of d.lines) {
  if (only && !only.has(ln.l)) continue;
  if (!ln.p.some(([x, y]) => inWin(x, y))) continue;
  const pts = ln.p.map(([x, y]) => `${(x - X + H).toFixed(2)},${(Y + H - y).toFixed(2)}`).join(' ');
  svg += `<polyline points="${pts}" fill="none" stroke="${ln.l === '0' ? '#bbb' : col(ln.l)}" stroke-width="${H / 600}"/>`;
}
for (const t of d.texts) {
  if (only && !only.has(t.l)) continue;
  if (!inWin(t.x, t.y)) continue;
  const x = t.x - X + H, y = Y + H - t.y;
  const deg = -(t.r * 180 / Math.PI);
  svg += `<text x="${x.toFixed(2)}" y="${y.toFixed(2)}" font-size="${Math.max(t.h, H / 400)}" fill="${col(t.l)}" font-family="Arial" transform="rotate(${deg.toFixed(1)} ${x.toFixed(2)} ${y.toFixed(2)})">${t.t.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</text>`;
}
const legend = Object.entries(layerColor).map(([l, c], i) => `<text x="4" y="${14 + i * 14}" font-size="12" fill="${c}" font-family="Arial">■ ${l}</text>`).join('');
const html = `<html><body style="margin:0;background:#fff"><svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1600" viewBox="0 0 ${2 * H} ${2 * H}">${svg}</svg><svg style="position:absolute;left:0;top:0" width="400" height="${20 + Object.keys(layerColor).length * 14}"><rect width="100%" height="100%" fill="#fff" opacity=".85"/>${legend}</svg></body></html>`;
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1600, height: 1600 } });
await p.setContent(html); await p.screenshot({ path: outPng }); await b.close();
console.log('ok', outPng);
