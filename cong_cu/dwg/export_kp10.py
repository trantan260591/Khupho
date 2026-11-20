import json, math, re, openpyxl
from openpyxl.styles import Font, PatternFill, Alignment
D = json.load(open('KP10_rows.json'))
rows, TX, TY = D['rows'], D['TX'], D['TY']
kp = json.load(open('kp_full.json'))
norm = lambda s: re.sub(r'\s+', '', s or '').upper()

# Tập số mới trên bản đồ phân chia KP (bản trái) — để đối chiếu theo tập hợp, có kiểm tra vị trí
kp_new = [t for t in kp['texts'] if t['l'] == 'SO NHA MOI' and t['x'] < 656000]
by_num = {}
for t in kp_new: by_num.setdefault(norm(t['t']), []).append(t)

# Đường cho các căn chưa gán: lấy theo căn gần nhất đã có đường (ghi rõ là suy ra)
named = [r for r in rows if r['duong']]
for r in rows:
    r['duongSuyRa'] = False
    if not r['duong']:
        best = min(named, key=lambda q: math.hypot(q['x'] - r['x'], q['y'] - r['y']))
        r['duong'] = best['duong']; r['duongSuyRa'] = True

def loai(r):
    cu, moi = norm(r['cu']), norm(r['moi'])
    if not moi: return 'Có số cũ, KHÔNG có số mới trên bản đồ'
    if r['kind'] in ('trung', 'trungKhongCap') or cu == moi: return 'Giữ nguyên số (không cấp lại)'
    if cu == 'KS': return 'Nhà không số → cấp số mới'
    if cu == 'ĐT': return 'Đất trống → số mới'
    if not cu: return 'Số mới, không thấy số cũ trong lô'
    if r['kind'] == 'capnhat': return 'Đổi số (cập nhật sau)'
    return 'Đổi số'

def doi_chieu(r):
    if not r['moi']: return ''
    cands = by_num.get(norm(r['moi']), [])
    x, y = r['x'] + TX, r['y'] + TY
    if any(math.hypot(t['x'] - x, t['y'] - y) <= 20 for t in cands): return 'Khớp'
    if cands: return 'Có số này nhưng ở vị trí khác (>20m)'
    if loai(r).startswith('Giữ nguyên'): return 'BĐ KP không ghi (số giữ nguyên)'
    near = r.get('kpMoi') or ''
    return f'KHÔNG có trên BĐ KP' + (f' (gần đó ghi {near})' if near else '')

head = ['Tên đường', 'Số nhà cũ', 'Số nhà mới', 'Loại', 'Đối chiếu BĐ phân chia KP', 'Ghi chú', 'X (CSN)', 'Y (CSN)']
wb = openpyxl.Workbook(); ws = wb.active; ws.title = 'KP10 so nha cu moi'
ws.append(head)
def keyfn(r):
    parts = re.findall(r'\d+', r['moi'] or r['cu'] or '0')
    return (r['duong'], [int(p) for p in parts])
for r in sorted(rows, key=keyfn):
    note = []
    if r['duongSuyRa']: note.append('Tên đường suy ra theo nhà bên cạnh')
    if r['thua']: note.append(f"thửa {r['thua']} (chưa rõ tờ)")
    ws.append([r['duong'], r['cu'], r['moi'], loai(r), doi_chieu(r), '; '.join(note), r['x'], r['y']])
for c in ws[1]: c.font = Font(bold=True, color='FFFFFF'); c.fill = PatternFill('solid', fgColor='1E3A5F')
for col, w in zip('ABCDEFGH', [16, 12, 12, 34, 44, 40, 12, 12]): ws.column_dimensions[col].width = w
for row in ws.iter_rows(min_row=2):
    for c in row[:3]: c.number_format = '@'
ws.freeze_panes = 'A2'

# Trang tổng hợp
s = wb.create_sheet('Tong hop')
from collections import Counter
s.append(['Tổng hợp KP10 (từ BẢN ĐỒ CSN P10 2012 + ranh KP mới)']); s['A1'].font = Font(bold=True, size=13)
s.append(['Tổng số căn trong ranh KP10', len(rows)])
for k, v in Counter(loai(r) for r in rows).most_common(): s.append([k, v])
s.append([])
s.append(['Đối chiếu với bản đồ phân chia khu phố mới', ''])
for k, v in Counter((doi_chieu(r) or '(không có số mới)').split(' (gần')[0] for r in rows).most_common(): s.append([k, v])
s.append(['Ghi chú: khu vực KP10 không có số thửa trong cả hai file bản vẽ; số cũ–mới được ghép theo đường ranh lô trong bản vẽ.', ''])
s.append([]); s.append(['Theo đường', ''])
for k, v in Counter(r['duong'] for r in rows).most_common(): s.append([k, v])
s.column_dimensions['A'].width = 55

# Số chỉ có trên bản đồ KP (trong ranh KP10) mà bản đồ CSN không có
k = wb.create_sheet('Chi co tren BD KP')
k.append(['Số nhà mới trên BĐ phân chia KP', 'Ghi chú']); k['A1'].font = Font(bold=True)
csn_set = {norm(r['moi']) for r in rows if r['moi']}
for t in D['kpOnly']:
    if norm(t['t']) not in csn_set: k.append([t['t'], 'Không có trong BĐ cấp số nhà 2012 tại vị trí này (số cấp sau / cập nhật?)'])
k.column_dimensions['A'].width = 30; k.column_dimensions['B'].width = 70
out = '../../du_lieu/KP10_so_nha_cu_moi.xlsx'
import os; os.makedirs(os.path.dirname(out), exist_ok=True)
wb.save(out)
print('saved', out)
for r in s.iter_rows(values_only=True): print(r)
