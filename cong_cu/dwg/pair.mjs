// Ghép số cũ <-> số mới <-> số thửa theo "cùng lô": đoạn nối hai chữ không cắt ranh lô nào
import fs from 'fs';
const [,, inJson, outJson] = process.argv;
const d = JSON.parse(fs.readFileSync(inJson));

const BOUNDARY = new Set(['0', 'TOPO', 'CAP NHAT CSN', 'CAPNHAT', 'ranhphatsinh', 'RANH-TDP', 'MEPNHUA', 'nhaptachthua']);
const NEW_LAYERS = { 'SO NHA MOI': 'moi', 'trung so': 'trung', 'Trung so (khong cap)': 'trungKhongCap', 'CAP NHAT CSN': 'capnhat', 'SN DU PHONG': 'duphong' };
const OLD_LAYERS = new Set(['sonhahientrang']);
const PARCEL_LAYERS = new Set(['sothua', 'so thua cap nhat']);

// ---- tâm chữ (điểm đặt TEXT là góc trái-dưới, chữ có thể xoay) ----
function center(t) {
  const w = 0.6 * t.h * [...t.t].length, h = t.h;
  const c = Math.cos(t.r), s = Math.sin(t.r);
  return [t.x + c * w / 2 - s * h / 2, t.y + s * w / 2 + c * h / 2];
}
const isNum = s => (/^[0-9]/.test(s) || /^(KS|ĐT)$/i.test(s)) && !/gpxd|gp|-\d+\/\d+\/\d{2,4}$/i.test(s);

// ---- chỉ mục lưới cho các đoạn ranh ----
const CELL = 8, grid = new Map();
const key = (i, j) => i * 1000003 + j;
let segCount = 0;
for (const ln of d.lines) {
  if (!BOUNDARY.has(ln.l)) continue;
  const pts = ln.p;
  for (let k = 1; k < pts.length; k++) {
    const a = pts[k - 1], b = pts[k];
    if (a[0] === b[0] && a[1] === b[1]) continue;
    const seg = [a[0], a[1], b[0], b[1]]; segCount++;
    const i0 = Math.floor(Math.min(a[0], b[0]) / CELL), i1 = Math.floor(Math.max(a[0], b[0]) / CELL);
    const j0 = Math.floor(Math.min(a[1], b[1]) / CELL), j1 = Math.floor(Math.max(a[1], b[1]) / CELL);
    if ((i1 - i0 + 1) * (j1 - j0 + 1) > 4000) continue; // đường quá dài (khung bản đồ) — bỏ
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) { const kk = key(i, j); (grid.get(kk) || grid.set(kk, []).get(kk)).push(seg); }
  }
}
function cross(ax, ay, bx, by, s) {
  const [cx, cy, dx, dy] = s;
  const d1 = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  const d2 = (bx - ax) * (dy - ay) - (by - ay) * (dx - ax);
  const d3 = (dx - cx) * (ay - cy) - (dy - cy) * (ax - cx);
  const d4 = (dx - cx) * (by - cy) - (dy - cy) * (bx - cx);
  return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0));
}
function blocked(p, q) {
  const i0 = Math.floor(Math.min(p[0], q[0]) / CELL), i1 = Math.floor(Math.max(p[0], q[0]) / CELL);
  const j0 = Math.floor(Math.min(p[1], q[1]) / CELL), j1 = Math.floor(Math.max(p[1], q[1]) / CELL);
  const seen = new Set();
  for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
    for (const s of grid.get(key(i, j)) || []) { if (seen.has(s)) continue; seen.add(s); if (cross(p[0], p[1], q[0], q[1], s)) return true; }
  }
  return false;
}

// ---- tập chữ (bỏ chữ lặp: bản vẽ có nhiều đối tượng bị vẽ chồng 2 lần) ----
{ const seen=new Set(); d.texts=d.texts.filter(t=>{ const k=t.l+'|'+t.t+'|'+Math.round(t.x*10)+'|'+Math.round(t.y*10); if(seen.has(k)) return false; seen.add(k); return true; }); }
const mk = (t, role) => ({ ...t, role, c: center(t) });
const news = d.texts.filter(t => NEW_LAYERS[t.l] && isNum(t.t) && t.h < 3.5).map(t => ({ ...mk(t, 'new'), kind: NEW_LAYERS[t.l] }));
const olds = d.texts.filter(t => OLD_LAYERS.has(t.l) && isNum(t.t)).map(t => mk(t, 'old'));
const parcels = d.texts.filter(t => PARCEL_LAYERS.has(t.l) && /^\d+$/.test(t.t)).map(t => mk(t, 'parcel'));
const pgrid = new Map(); const PC = 30;
function index(arr) { const g = new Map(); arr.forEach((o, idx) => { const k = key(Math.floor(o.c[0] / PC), Math.floor(o.c[1] / PC)); (g.get(k) || g.set(k, []).get(k)).push(idx); }); return g; }
function near(g, arr, p, R) { const out = []; const i0 = Math.floor((p[0] - R) / PC), i1 = Math.floor((p[0] + R) / PC), j0 = Math.floor((p[1] - R) / PC), j1 = Math.floor((p[1] + R) / PC); for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) for (const idx of g.get(key(i, j)) || []) { const o = arr[idx]; const dd = Math.hypot(o.c[0] - p[0], o.c[1] - p[1]); if (dd <= R) out.push([idx, dd]); } return out.sort((a, b) => a[1] - b[1]); }
const gNew = index(news), gPar = index(parcels);

// ---- ghép: mỗi số cũ -> các số mới cùng lô (không bị chặn), lấy gần nhất; một-một theo khoảng cách ----
const R = 30;
const cand = [];
olds.forEach((o, oi) => { for (const [ni, dd] of near(gNew, news, o.c, R)) { if (!blocked(o.c, news[ni].c)) cand.push([oi, ni, dd]); } });
cand.sort((a, b) => a[2] - b[2]);
const oldTo = new Map(), newTo = new Map();
for (const [oi, ni, dd] of cand) { if (oldTo.has(oi) || newTo.has(ni)) continue; oldTo.set(oi, [ni, dd]); newTo.set(ni, [oi, dd]); }
// số thửa: thửa gần nhất cùng lô với số mới (hoặc số cũ nếu không có số mới)
function parcelFor(p) { for (const [pi, dd] of near(gPar, parcels, p, 25)) if (!blocked(p, parcels[pi].c)) return [parcels[pi], dd]; return [null, null]; }

const recs = [];
news.forEach((n, ni) => {
  const m = newTo.get(ni); const o = m ? olds[m[0]] : null;
  const [p, pd] = parcelFor(n.c);
  recs.push({ moi: n.t, cu: o ? o.t : '', thua: p ? p.t : '', kind: n.kind, x: +n.c[0].toFixed(2), y: +n.c[1].toFixed(2), r: n.r, dOld: m ? +m[1].toFixed(1) : null, dThua: pd != null ? +pd.toFixed(1) : null, cuX: o ? +o.c[0].toFixed(2) : null, cuY: o ? +o.c[1].toFixed(2) : null });
});
olds.forEach((o, oi) => { if (oldTo.has(oi)) return; const [p, pd] = parcelFor(o.c); recs.push({ moi: '', cu: o.t, thua: p ? p.t : '', kind: 'cuKhongCoMoi', x: +o.c[0].toFixed(2), y: +o.c[1].toFixed(2), r: o.r, dOld: null, dThua: pd != null ? +pd.toFixed(1) : null }); });
fs.writeFileSync(outJson, JSON.stringify(recs));
const cnt = {}; recs.forEach(r => cnt[r.kind + (r.cu ? '+cu' : '') + (r.moi ? '+moi' : '')] = (cnt[r.kind + (r.cu ? '+cu' : '') + (r.moi ? '+moi' : '')] || 0) + 1);
console.log('segments', segCount, 'news', news.length, 'olds', olds.length, 'parcels', parcels.length, 'pairs', oldTo.size);
console.log(cnt);
const ds = [...oldTo.values()].map(v => v[1]).sort((a, b) => a - b); console.log('pair dist p50/p90/p99', ds[ds.length >> 1], ds[Math.floor(ds.length * .9)], ds[Math.floor(ds.length * .99)]);
