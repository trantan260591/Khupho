// Vẽ bản đồ KP10 theo hình học thật của bản vẽ CSN: ranh lô + số mới + số cũ, tô màu theo kiểm tra
import fs from 'fs';
import { createRequire } from 'module';
const { chromium } = createRequire(import.meta.url)('playwright');
const csn = JSON.parse(fs.readFileSync('csn_full.json'));
const kp = JSON.parse(fs.readFileSync('kp_full.json'));
const { rows, TX, TY } = JSON.parse(fs.readFileSync('KP10_rows.json'));
const status = new Map(JSON.parse(fs.readFileSync('KP10_status.json')).map(s => [s.k, s]));
const OUT = process.argv[2] || 'KP10_ban_do';
const today = new Date().toLocaleDateString('vi-VN');

// Ranh KP10 (file KP, dịch về hệ toạ độ CSN)
const label = kp.texts.find(t => t.l === 'Ten Kp- Moi' && t.t === 'KP10' && t.x < 656000);
const bnd = kp.lines.filter(l => l.l === 'RANH KHU PHO MOI' && l.p.some(([x, y]) => x < 656000 && Math.hypot(x - label.x, y - label.y) < 700))
  .map(l => l.p.map(([x, y]) => [x - TX, y - TY]));
const xs = rows.map(r => r.x), ys = rows.map(r => r.y);
const M = 25;
const X0 = Math.min(...xs) - M, X1 = Math.max(...xs) + M, Y0 = Math.min(...ys) - M, Y1 = Math.max(...ys) + M + 30;
const W = X1 - X0, H = Y1 - Y0;
const sx = x => (x - X0).toFixed(2), sy = y => (Y1 - y).toFixed(2);
const inBox = (x, y) => x > X0 && x < X1 && y > Y0 && y < Y1;
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const nk = r => r.duong + '|' + (r.cu || '') + '|' + (r.moi || '');

let svg = '';
// nền lô
const LOT = new Set(['0', 'TOPO', 'ranhphatsinh', 'CAP NHAT CSN', 'CAPNHAT', 'MEPNHUA']);
let lots = '';
for (const ln of csn.lines) {
  if (!LOT.has(ln.l) || !ln.p.some(([x, y]) => inBox(x, y))) continue;
  lots += `<polyline points="${ln.p.map(([x, y]) => sx(x) + ',' + sy(y)).join(' ')}"/>`;
}
svg += `<g fill="none" stroke="#9aa5b1" stroke-width="0.12">${lots}</g>`;
// tách đoạn ranh của chính KP10 bằng vùng tô (mask, hệ toạ độ file KP)
const MK = JSON.parse(fs.readFileSync('KP10_mask.json')); const MB = Buffer.from(MK.b64, 'base64');
const inMask = (x, y) => { const i = Math.floor((x + TX - MK.x0) / MK.RES), j = Math.floor((y + TY - MK.y0) / MK.RES); return i >= 0 && j >= 0 && i < MK.W && j < MK.H && MB[j * MK.W + i] === 1; };
const nearHouse = (x, y) => inMask(x, y);
let mine = '', other = '';
for (const p of bnd) for (let k = 1; k < p.length; k++) {
  const [ax, ay] = p[k - 1], [bx, by] = p[k]; const L = Math.hypot(bx - ax, by - ay) || 1;
  const mx = (ax + bx) / 2, my = (ay + by) / 2, nx = -(by - ay) / L * 1.6, ny = (bx - ax) / L * 1.6;
  const seg = `<line x1="${sx(ax)}" y1="${sy(ay)}" x2="${sx(bx)}" y2="${sy(by)}"/>`;
  if (nearHouse(mx + nx, my + ny) || nearHouse(mx - nx, my - ny)) mine += seg; else other += seg;
}
svg += `<g stroke="#c0392b" stroke-width="0.35" stroke-dasharray="2 1.5" opacity=".35">${other}</g>`;
svg += `<g stroke="#c0392b" stroke-width="0.9" stroke-dasharray="3 1.5">${mine}</g>`;
// tên đường, hẻm
for (const t of csn.texts) {
  if (!/^(TEN|hemmoi)$/.test(t.l) || !inBox(t.x, t.y)) continue;
  const big = t.l === 'TEN';
  svg += `<text x="${sx(t.x)}" y="${sy(t.y)}" font-size="${big ? 6 : 1.6}" fill="${big ? '#1e3a5f' : '#2c5d8f'}" font-style="italic" transform="rotate(${(-t.r * 180 / Math.PI).toFixed(1)} ${sx(t.x)} ${sy(t.y)})">${esc(t.t)}</text>`;
}
// nhà: tô theo trạng thái, số mới + số cũ
const FILL = { ok: '#2f7d4f', warn: '#b5820a', err: '#c0392b', conf: '#2c5d8f' };
let houses = '';
const rotDeg = r => { let d = -r * 180 / Math.PI; while (d > 90) d -= 180; while (d < -90) d += 180; return d.toFixed(1); };
for (const r of rows) {
  const st = status.get(nk(r)) || { s: 'ok', i: [] };
  const col = FILL[st.s] || '#333';
  const tip = `${r.duong}\nSố cũ: ${r.cu || '—'}  →  Số mới: ${r.moi || '—'}\n${st.i.join('\n')}`;
  const giu = r.cu && r.moi && r.cu.replace(/\s/g, '') === r.moi.replace(/\s/g, '');
  houses += `<g class="h st-${st.s}"><title>${esc(tip)}</title>`;
  if (st.s !== 'ok') houses += `<circle cx="${sx(r.x)}" cy="${sy(r.y)}" r="2.6" fill="${col}" opacity=".16"/>`;
  if (r.moi) houses += `<text class="moi" x="${sx(r.x)}" y="${sy(r.y)}" fill="${giu ? '#2f7d4f' : '#132840'}" transform="rotate(${rotDeg(r.r)} ${sx(r.x)} ${sy(r.y)})">${esc(r.moi)}</text>`;
  if (r.cu && !giu) {
    const cx = r.cuX ?? r.x, cy = r.cuY ?? r.y;
    houses += `<text class="cu" x="${sx(cx)}" y="${sy(cy)}" transform="rotate(${rotDeg(r.r)} ${sx(cx)} ${sy(cy)})">${r.moi ? 'cũ ' : '⚠ cũ '}${esc(r.cu)}</text>`;
    if (r.moi && r.cuX != null) houses += `<line x1="${sx(r.x)}" y1="${sy(r.y)}" x2="${sx(cx)}" y2="${sy(cy)}" stroke="${col}" stroke-width="0.08" opacity=".5"/>`;
  }
  houses += '</g>';
}
svg += houses;
// tiêu đề + chú thích
const cnt = { ok: 0, warn: 0, err: 0, conf: 0 }; rows.forEach(r => cnt[(status.get(nk(r)) || { s: 'ok' }).s]++);
const doi = rows.filter(r => r.cu && r.moi && r.cu !== r.moi).length, giu = rows.filter(r => r.cu && r.cu === r.moi).length;
const title = `<g font-family="Arial">
 <text x="4" y="8" font-size="6" font-weight="700" fill="#1e3a5f">BẢN ĐỒ SỐ NHÀ CŨ – MỚI · KHU PHỐ 10 · PHƯỜNG GÒ VẤP</text>
 <text x="4" y="14" font-size="2.6" fill="#555">Nguồn: “Bản đồ CSN P10 mới duyệt chuyển ngày 05.12.2012” (số cũ, số mới, ranh lô) + “Phân chia khu phố” (ranh KP10 mới). Lập ngày ${today}.</text>
 <text x="4" y="18.5" font-size="2.6" fill="#555">${rows.length} căn: ${doi} đổi số · ${giu} giữ nguyên · ${rows.filter(r => !r.moi).length} chưa có số mới. Kiểm tra: ${cnt.ok} hợp lệ · ${cnt.warn} cần xem · ${cnt.err} lỗi.</text>
 <text x="4" y="24" font-size="3.2" font-weight="700" fill="#c0392b">BẢN NHÁP — còn ${cnt.err} lỗi, ${cnt.warn} chỗ cần xem; chưa xác nhận thực địa</text>
 <g transform="translate(${W - 92},4)" font-size="2.4">
  <rect width="88" height="22" fill="#fff" stroke="#999" stroke-width=".2"/>
  <text x="3" y="5" font-weight="700" fill="#132840" font-size="3">1409/25</text><text x="20" y="5">số nhà MỚI</text>
  <text x="46" y="5" fill="#8a5a00">cũ 1385/25</text><text x="64" y="5">số nhà CŨ (cùng lô)</text>
  <text x="3" y="11" font-weight="700" fill="#2f7d4f" font-size="3">404</text><text x="20" y="11">giữ nguyên số</text>
  <line x1="46" y1="10" x2="56" y2="10" stroke="#c0392b" stroke-width=".9" stroke-dasharray="3 1.5"/><text x="58" y="11">ranh KP10 mới</text>
  <circle cx="5" cy="17" r="2" fill="#c0392b" opacity=".3"/><text x="9" y="18">lỗi</text>
  <circle cx="22" cy="17" r="2" fill="#b5820a" opacity=".3"/><text x="26" y="18">cần xem</text>
  <text x="46" y="18" fill="#8a5a00">⚠ cũ 8/1C</text><text x="62" y="18">chưa có số mới</text>
 </g></g>`;
const css = `<style>.moi{font:700 1.7px Arial,sans-serif;text-anchor:middle;dominant-baseline:middle}.cu{font:1.15px Arial,sans-serif;fill:#8a5a00;text-anchor:middle;dominant-baseline:middle}</style>`;
const full = `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W.toFixed(1)} ${H.toFixed(1)}" width="${(W * 2).toFixed(0)}mm" height="${(H * 2).toFixed(0)}mm">${css}<rect width="100%" height="100%" fill="#fff"/>${svg}${title}</svg>`;
fs.mkdirSync('../../du_lieu', { recursive: true });
fs.writeFileSync(`../../du_lieu/${OUT}.svg`, full);
// PNG xem nhanh + PDF in (tỷ lệ 1/500: 1 m = 2 mm)
const b = await chromium.launch(); const pg = await b.newPage({ viewport: { width: 2400, height: Math.round(2400 * H / W) }, deviceScaleFactor: 2 });
await pg.setContent(`<html><body style="margin:0">${full.replace(/^<\?xml[^>]*>/, '').replace(/width="[^"]*mm" height="[^"]*mm"/, 'width="2400" height="' + Math.round(2400 * H / W) + '"')}</body></html>`);
await pg.screenshot({ path: `${OUT}_preview.png` });
await pg.setContent(`<html><head><style>@page{size:${(W * 2 + 10).toFixed(0)}mm ${(H * 2 + 10).toFixed(0)}mm;margin:5mm}body{margin:0}</style></head><body>${full.replace(/^<\?xml[^>]*>/, '')}</body></html>`);
await pg.pdf({ path: `../../du_lieu/${OUT}_ty_le_1-500.pdf`, width: `${(W * 2 + 10).toFixed(0)}mm`, height: `${(H * 2 + 10).toFixed(0)}mm`, printBackground: true });
await b.close();
console.log('W,H (m)', W.toFixed(0), H.toFixed(0), 'paper mm', (W * 2).toFixed(0), (H * 2).toFixed(0), cnt);
