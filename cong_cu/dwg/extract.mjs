// Trích toàn bộ chữ + đường ranh từ DWG -> JSON gọn
import { Dwg_File_Type, LibreDwg } from '@mlightcad/libredwg-web';
import fs from 'fs';
const [,, inFile, outJson] = process.argv;

// ---- VNI -> Unicode ----
const SINGLE = { 'ô':'ơ','Ô':'Ơ','ö':'ư','Ö':'Ư','ñ':'đ','Ñ':'Đ','í':'ì','Í':'Ì','ì':'í','Ì':'Í','æ':'ỉ','Æ':'Ỉ','ó':'ĩ','Ó':'Ĩ','ò':'ị','Ò':'Ị','î':'ỵ','Î':'Ỵ' };
const MARK = {
  'ù':'́','ø':'̀','û':'̉','õ':'̃','ï':'̣',
  'â':'̂','á':'̂́','à':'̂̀','å':'̂̉','ã':'̂̃','ä':'̣̂',
  'ê':'̆','é':'̆́','è':'̆̀','ú':'̆̉','ü':'̆̃','ë':'̣̆',
};
for (const [k, v] of Object.entries({ ...MARK })) MARK[k.toUpperCase()] = v;
const VOWEL = /[aeiouyAEIOUYơƠưƯ]/;
export function vni(s) {
  let out = '';
  for (const ch of s) {
    const last = out.normalize('NFD').replace(/[\u0300-\u036f]+$/, '').slice(-1);
    if (MARK[ch] && out && VOWEL.test(last)) {
      let m = MARK[ch];
      if (m.startsWith('̆') && !/[aA]/.test(last)) { out += ch; continue; }
      if (m.startsWith('̂') && !/[aeoAEO]/.test(last)) { if (m.length === 2 && /[aeoAEO]/.test(last) === false) { out += ch; continue; } }
      out = (out.normalize('NFD') + m).normalize('NFC');
    } else if (SINGLE[ch]) out += SINGLE[ch];
    else out += ch;
  }
  return out.normalize('NFC');
}
function stripMtext(s) {
  return String(s)
    .replace(/\\P/g, ' ').replace(/\\[ACcHQTWfFp][^;]*;/g, '').replace(/\\[LlOoKk]/g, '')
    .replace(/[{}]/g, '').replace(/%%[uUoO]/g, '').replace(/\s+/g, ' ').trim();
}
const looksVni = s => (/[ÑñÖö]/.test(s) || /[aeouyAEOUYôÔöÖ][ùøûõïâáàåãäêéèúüëÙØÛÕÏÂÁÀÅÃÄÊÉÈÚÜË]/.test(s)) && !/[Ạ-ỹăđơưĂĐƠƯ]/.test(s);
// MTEXT: giải mã VNI theo từng đoạn phông (\fVNI-Times|...; ... \fArial|...;)
function mtextDecode(raw, styleIsVni) {
  raw = String(raw);
  const parts = raw.split(/(\\f[^;]*;)/);
  const hasFont = /\\f/.test(raw);
  let vniOn = styleIsVni, out = '';
  for (const part of parts) {
    const m = part.match(/^\\f([^|;]*)/);
    if (m) { vniOn = /vni/i.test(m[1]); continue; }
    const t = stripMtext(part);
    out += ((hasFont ? vniOn : (vniOn || looksVni(t))) ? vni(t) : t) + ' ';
  }
  return out.replace(/\s+/g, ' ').trim();
}

const libredwg = await LibreDwg.create();
const dwg = libredwg.dwg_read_data(new Uint8Array(fs.readFileSync(inFile)), Dwg_File_Type.DWG);
const db = libredwg.convert(dwg);
const styles = {};
(db.tables?.STYLE?.entries || []).forEach(s => { styles[s.name] = (s.font || s.fontFile || s.primaryFontFile || '') + ' ' + (s.bigFontFile || ''); });

const texts = [], lines = [];
function pushText(layer, raw, p, h, rot, kind, extra) {
  if (raw == null) return;
  const font = extra?.style ? styles[extra.style] || '' : '';
  let t;
  if (kind === 'MTEXT') t = mtextDecode(raw, /vni/i.test(font));
  else { t = String(raw).replace(/%%[uUoO]/g, '').trim(); if (/vni/i.test(font) || looksVni(t)) t = vni(t); }
  if (!t) return;
  texts.push({ l: layer, t, x: +p.x.toFixed(2), y: +p.y.toFixed(2), h: +(h || 0).toFixed(2), r: +(rot || 0).toFixed(4), k: kind, ...(extra?.tag ? { tag: extra.tag } : {}), ...(extra?.blk ? { blk: extra.blk } : {}) });
}
function walk(e, blk) {
  if (e.type === 'TEXT') pushText(e.layer, e.text, e.startPoint, e.textHeight, e.rotation, 'TEXT', { style: e.styleName, blk });
  else if (e.type === 'MTEXT') pushText(e.layer, e.text, e.insertionPoint, e.textHeight, e.rotation, 'MTEXT', { style: e.styleName, blk });
  else if (e.type === 'ATTRIB' && e.text) pushText(e.layer, e.text.text, e.text.startPoint, e.text.textHeight, e.text.rotation, 'ATTRIB', { style: e.text.styleName, tag: e.tag, blk });
  else if (e.type === 'INSERT' && e.attribs?.length) e.attribs.forEach(a => walk(a, e.name));
  else if (e.type === 'LWPOLYLINE' || e.type === 'POLYLINE2D') {
    const pts = (e.vertices || []).map(v => [+v.x.toFixed(2), +v.y.toFixed(2)]);
    if (pts.length >= 2) lines.push({ l: e.layer, k: 'P', c: !!(e.flag & 1) || !!e.closed, p: pts });
  } else if (e.type === 'LINE') lines.push({ l: e.layer, k: 'L', p: [[+e.startPoint.x.toFixed(2), +e.startPoint.y.toFixed(2)], [+e.endPoint.x.toFixed(2), +e.endPoint.y.toFixed(2)]] });
}
(db.entities || []).forEach(e => walk(e, null));
const inserts = (db.entities || []).filter(e => e.type === 'INSERT').map(e => ({ l: e.layer, n: e.name, x: +e.insertionPoint.x.toFixed(2), y: +e.insertionPoint.y.toFixed(2), r: e.rotation, s: e.xScale }));
fs.writeFileSync(outJson, JSON.stringify({ file: inFile.split('/').pop(), styles, texts, lines, inserts }));
const byL = {}; texts.forEach(t => byL[t.l] = (byL[t.l] || 0) + 1);
console.log(inFile.split('/').pop(), 'texts', texts.length, 'lines', lines.length, 'inserts', inserts.length);
console.log(Object.entries(byL).sort((a, b) => b[1] - a[1]).slice(0, 40));
libredwg.dwg_free(dwg);
