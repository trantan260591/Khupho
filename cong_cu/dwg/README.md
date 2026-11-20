# Công cụ đọc bản vẽ AutoCAD (.dwg) → bảng số nhà cũ/mới

Dùng để tạo lại `du_lieu/KP10_*` từ 2 file bản vẽ (hoặc làm cho khu phố khác).
Cần Node 20+, Python 3 + openpyxl, Playwright (để xuất PNG/PDF).

```bash
npm install                      # cài @mlightcad/libredwg-web (LibreDWG bản WebAssembly, GPL-3.0)
node extract.mjs "BAN_DO_CSN_P10....dwg" csn_full.json      # chữ + đường nét, đổi phông VNI → Unicode
node extract.mjs "phan_chia_khu_pho.dwg" kp_full.json
node pair.mjs csn_full.json csn_pairs.json   # ghép số cũ ↔ số mới theo "cùng lô" (đoạn nối không cắt ranh lô)
node build_kp10.mjs KP10                     # tịnh tiến 2 hệ toạ độ, tô vùng theo ranh KP mới, gán tên đường
python3 export_kp10.py                       # → du_lieu/KP10_so_nha_cu_moi.xlsx (nạp được vào bando.html)
node render_kp10.mjs KP10_ban_do             # → du_lieu/KP10_ban_do.svg + PDF tỷ lệ 1/500 (cần KP10_status.json)
```

Ghi chú: tên đường trong `build_kp10.mjs` là quy tắc riêng cho KP10 (Phan Văn Trị / Quang Trung / Thống Nhất)
— làm khu phố khác phải sửa hàm `streetOfMain`.
