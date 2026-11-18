# Nguồn nhập prototype

Snapshot dữ liệu từ prototype `seafood-master-2`, sinh bằng:

```sh
node scripts/import-prototype.mjs --source ../seafood-master-2 --export docs/sources/prototype-import
```

- Đường dẫn gốc: `/Users/tien.dang/Workplace/reference/seafood-master-2`
- Ngày snapshot: 2026-11-18 (file nguồn sửa lần cuối 2026-11-17)
- `species.json`: 100 loài. `hs-cases.json`: 5 hồ sơ HS.

| File nguồn         | sha256                                                             |
| ------------------ | ------------------------------------------------------------------ |
| `data/species.js`  | `090a0abc5fe8abbbe8cee4886d407d148a64d07efcc535aa74bde788cd28c42f` |
| `data/hs_cases.js` | `823080f5bb927db7df0bbd7dca18b124932eb10083b130d740cb29b9901e2e9e` |

## Giới hạn dữ liệu

- Toàn bộ mục là `verified:false`; nhập vào thành bản nháp, chưa duyệt, không dùng public.
- Giá không có nguồn; chỉ hiển thị ở quản trị với nhãn "chưa có nguồn".
- 97 ảnh thiếu tác giả hoặc link nguồn. Ảnh vào vai trò `profile`, không phải `identification`, nên không tham gia Đoán hình.
- 2 ảnh GIF (spanish_mackerel, capelin) bị importer bỏ qua vì định dạng không hỗ trợ.
- 4 loài trùng bộ 6 loài hiện có bị bỏ qua: Gadus morhua, Thunnus albacares, Meretrix lyrata, Perna viridis (còn 96 loài được nhập).
- Độ hiếm là "hiếm thị trường", chưa đánh dấu CITES.
- Tariff tạo với market `WCO`, phiên bản `HS 2022`, cấp 6 số; không suy ra mã Việt Nam 8 số.
- API người học không trả độ hiếm, giá, gợi ý HS hay nguồn.
- Chạy importer lên VPS là quyết định của người vận hành.

## Ghi chú cho người duyệt

- Văn bản `notes_vi` được nhập vào trường `identification` (hiển thị cho người học) của 4 loài có chứa mã HS, cần sửa trước khi duyệt:
  - `striped_catfish`: 0304.62 (đây cũng là đáp án của chính tình huống HS của loài này).
  - `atlantic_salmon`: 0305.41.
  - `sea_cucumber`: 0308.19.
  - `jellyfish`: 0308.30 / 1605.63.
