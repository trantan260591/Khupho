// Cắt dữ liệu ghép từ bản đồ CSN P10 (2012) theo ranh KP10 mới (file phân chia khu phố)
import fs from 'fs';
const csn = JSON.parse(fs.readFileSync('csn_full.json'));
const kp = JSON.parse(fs.readFileSync('kp_full.json'));
const pairs = JSON.parse(fs.readFileSync('csn_pairs.json'));
const KP_NAME = process.argv[2] || 'KP10';
const LEFT_MAX_X = 656000; // file KP có 2 bản sao; dùng bản bên trái ("RANH mới")

// ---- 1. Phép tịnh tiến CSN -> KP: ghép các số mới chỉ xuất hiện đúng 1 lần ở mỗi file ----
const norm = s => s.replace(/\s+/g, '').toUpperCase();
const uniq = (arr) => { const m = new Map(); arr.forEach(t => { const k = norm(t.t); m.set(k, m.has(k) ? null : t); }); return m; };
const uC = uniq(csn.texts.filter(t => t.l === 'SO NHA MOI' && /\//.test(t.t)));
const uK = uniq(kp.texts.filter(t => t.l === 'SO NHA MOI' && t.x < LEFT_MAX_X && /\//.test(t.t)));
let dx = [], dy = [];
uC.forEach((a, k) => { const b = uK.get(k); if (a && b) { dx.push(b.x - a.x); dy.push(b.y - a.y); } });
const med = a => { const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; };
const TX = med(dx), TY = med(dy);
const resid = dx.map((v, i) => Math.hypot(v - TX, dy[i] - TY)).sort((a, b) => a - b);
console.log(`translation: dx=${TX.toFixed(3)} dy=${TY.toFixed(3)} from ${dx.length} matches; residual p50=${resid[resid.length >> 1].toFixed(2)}m p90=${resid[Math.floor(resid.length * .9)].toFixed(2)}m`);

// ---- 2. Vùng KP: tô loang trên lưới 0.5m, chặn bởi ranh khu phố mới ----
const label = kp.texts.find(t => t.l === 'Ten Kp- Moi' && t.t === KP_NAME && t.x < LEFT_MAX_X);
const RES = 0.5, PAD = 700;
const x0 = label.x - PAD, y0 = label.y - PAD, W = Math.round(2 * PAD / RES), Hh = W;
const wall = new Uint8Array(W * Hh);
const toIJ = (x, y) => [Math.floor((x - x0) / RES), Math.floor((y - y0) / RES)];
for (const ln of kp.lines) {
  if (ln.l !== 'RANH KHU PHO MOI') continue;
  if (!ln.p.some(([x]) => x < LEFT_MAX_X)) continue;
  for (let k = 1; k < ln.p.length; k++) {
    const [ax, ay] = ln.p[k - 1], [bx, by] = ln.p[k];
    const n = Math.ceil(Math.hypot(bx - ax, by - ay) / (RES / 3)) + 1;
    for (let s = 0; s <= n; s++) {
      const [i, j] = toIJ(ax + (bx - ax) * s / n, ay + (by - ay) * s / n);
      for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) { const ii = i + di, jj = j + dj; if (ii >= 0 && jj >= 0 && ii < W && jj < Hh) wall[jj * W + ii] = 1; }
    }
  }
}
const mask = new Uint8Array(W * Hh);
const [si, sj] = toIJ(label.x, label.y);
const stack = [sj * W + si]; let area = 0, leak = false;
while (stack.length) {
  const p = stack.pop(); if (mask[p] || wall[p]) continue; mask[p] = 1; area++;
  const i = p % W, j = (p / W) | 0;
  if (i === 0 || j === 0 || i === W - 1 || j === Hh - 1) { leak = true; continue; }
  stack.push(p - 1, p + 1, p - W, p + W);
}
console.log(`${KP_NAME} area ≈ ${(area * RES * RES / 10000).toFixed(2)} ha, leak=${leak}`);
const inKP = (xk, yk) => { const [i, j] = toIJ(xk, yk); if (i < 0 || j < 0 || i >= W || j >= Hh) return false; return !!mask[j * W + i]; };

// ---- 3. Lọc các căn trong KP + gán đường ----
const rows = pairs.filter(r => inKP(r.x + TX, r.y + TY));
const root = s => parseInt(String(s).split('/')[0], 10);
const isMain = s => !String(s).includes('/');
// Quy tắc đặt tên đường riêng cho KP10 (đã kiểm tra bằng hình ở 3 cạnh khu phố)
function streetOfMain(n) {
  if (n % 2 === 1 && n >= 1300 && n <= 1499) return 'Phan Văn Trị';
  if (n % 2 === 0 && n >= 120 && n <= 180) return 'Thống Nhất';
  if (n % 2 === 0 && n >= 380 && n <= 530) return 'Quang Trung';
  return '';
}
rows.forEach(r => {
  const s = r.moi || r.cu; const n = root(s);
  r.duong = Number.isFinite(n) ? streetOfMain(n) : '';
});

// ---- 4. Đối chiếu số mới CSN(2012) với số mới trên bản đồ phân chia khu phố (mới) ----
const kpNums = kp.texts.filter(t => t.l === 'SO NHA MOI' && t.x < LEFT_MAX_X && inKP(t.x, t.y));
const PC = 5, kg = new Map(); const key = (i, j) => i * 1000003 + j;
kpNums.forEach((t, idx) => { const k = key(Math.floor(t.x / PC), Math.floor(t.y / PC)); (kg.get(k) || kg.set(k, []).get(k)).push(idx); });
const used = new Set();
function nearKp(x, y, R) { const out = []; for (let i = Math.floor((x - R) / PC); i <= Math.floor((x + R) / PC); i++) for (let j = Math.floor((y - R) / PC); j <= Math.floor((y + R) / PC); j++) for (const idx of kg.get(key(i, j)) || []) { const t = kpNums[idx]; const dd = Math.hypot(t.x - x, t.y - y); if (dd <= R) out.push([idx, dd]); } return out.sort((a, b) => a[1] - b[1]); }
// vị trí chữ CSN: điểm đặt (không phải tâm) để so với điểm đặt trong file KP
const csnNewPts = new Map(); csn.texts.filter(t => /SO NHA MOI|trung so|Trung so/.test(t.l)).forEach(t => csnNewPts.set(norm(t.t) + '|' + Math.round(t.x) + '|' + Math.round(t.y), t));
let same = 0, diff = 0, missing = 0;
rows.forEach(r => {
  if (!r.moi) return;
  const xk = r.x + TX, yk = r.y + TY;
  const cands = nearKp(xk, yk, 6);
  const exact = nearKp(xk, yk, 20).find(([idx]) => norm(kpNums[idx].t) === norm(r.moi) && !used.has(idx));
  if (exact) { r.kpMoi = kpNums[exact[0]].t; used.add(exact[0]); same++; }
  else if (cands.length) { r.kpMoi = kpNums[cands[0][0]].t; r.kpLech = true; used.add(cands[0][0]); diff++; }
  else { r.kpMoi = ''; r.kpThieu = true; missing++; }
});
const kpOnly = kpNums.filter((t, idx) => !used.has(idx));
console.log(`${KP_NAME}: ${rows.length} căn | số mới khớp bản đồ KP: ${same}, khác: ${diff}, không thấy trên bản đồ KP: ${missing}; số chỉ có trên bản đồ KP: ${kpOnly.length}`);
const cnt = {}; rows.forEach(r => { const k = r.kind + (r.cu ? '+cu' : '') + (r.moi ? '+moi' : ''); cnt[k] = (cnt[k] || 0) + 1; }); console.log(cnt);
console.log('chưa gán đường:', rows.filter(r => !r.duong).map(r => r.moi || r.cu).slice(0, 40).join(' '));
fs.writeFileSync(`${KP_NAME}_rows.json`, JSON.stringify({ TX, TY, rows, kpOnly: kpOnly.map(t => ({ t: t.t, x: t.x, y: t.y })) }));
// lưu mặt nạ để vẽ kiểm tra
fs.writeFileSync(`${KP_NAME}_mask.json`, JSON.stringify({ x0, y0, RES, W, H: Hh, b64: Buffer.from(mask).toString('base64') }));
