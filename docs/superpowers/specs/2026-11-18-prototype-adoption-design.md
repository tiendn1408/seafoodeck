# Tiếp nhận hai prototype vào Seafood Deck — thiết kế

Ngày: 2026-11-18 · Trạng thái: chờ duyệt

## 1. Mục đích

Người dùng thấy bản chính (0.6, React + NestJS + PostgreSQL + S3) còn thiếu ở UI/UX, tính năng và lượng dữ liệu. Hai prototype tĩnh `seafood-master` và `seafood-master-2` (vanilla JS, offline) có nội dung nhiều hơn và cảm giác chơi tốt hơn. Mục tiêu: lấy dữ liệu, ý tưởng giao diện và tính năng từ prototype để cải thiện bản chính, **không phá quy trình nháp → duyệt → xuất bản** của bản chính.

Nguồn đã phân tích:

- `seafood-master` (30 loài) nằm trọn trong `seafood-master-2` (100 loài, 100 ảnh). `data/hs_cases.js` giống nhau ở hai bản (5 hồ sơ). Chỉ cần đọc `seafood-master-2`.
- Mỗi loài: `id` snake_case, `group` (fish / crustacean / mollusc / other / other_invertebrate), `name_vi`, `name_en[]`, `name_ja.standard{kanji,kana,romaji}`, `name_ja.trade`, `scientific_name`, `family`, `family_vi`, `image`, `image_credit`, `hs_rules[{state,label_vi,hs6}]`, `verified:false`, `notes_vi`, `rarity`, `market_price{range_usd,range_vnd,spec_ref,note}`.
- Toàn bộ dữ liệu `verified:false`. Giá không có nguồn (nhãn "Q4/2026" do prototype tự ghi). 97/100 ảnh chỉ ghi "Wikimedia Commons (CC BY-SA…)", không có tác giả hoặc link file → chưa đủ điều kiện ghi công của giấy phép.
- 4 loài trùng tên khoa học với bộ 6 loài hiện có: *Gadus morhua*, *Thunnus albacares*, *Meretrix lyrata*, *Perna viridis*.

## 2. Mục tiêu / không làm / phản mục tiêu

**Mục tiêu**

1. Đưa 100 loài, 5 hồ sơ HS và 100 ảnh của prototype vào bản chính dưới dạng **nháp**, đi qua API quản trị, chạy được cả local lẫn VPS.
2. Cải thiện UI/UX phía người học, lấy cảm hứng từ prototype: thư viện có lọc nhóm, hồ sơ loài giàu thông tin, chế độ tối, thống kê, phản hồi đúng/sai rõ ràng.
3. Bổ sung tính năng: HS theo từng bước có nhãn "bẫy", tính giờ tùy chọn cho Đoán hình, điểm/combo cho Ghép tên, đọc tên bằng giọng máy có gắn nhãn, hiệu ứng âm thanh.

**Không làm**

- Không tự duyệt nội dung, không tự xuất bản release public.
- Không đưa giá/độ hiếm ra phía người học trong lượt này.
- Không thay lịch ôn 1/3/7/14 bằng Leitner 5 hộp của prototype.
- Không bắt chước nguyên giao diện prototype. Prototype là nguồn ý tưởng tính năng; hướng hình ảnh do bước audit quyết định, dựa trên nhận diện hiện có (Be Vietnam Pro, tông xanh biển).
- Không tự chạy import lên VPS: người dùng chạy hoặc ra lệnh rõ.

**Phản mục tiêu (dù chạy được vẫn coi là hỏng)**

- Người học thấy nội dung chưa duyệt như đã duyệt, hoặc thấy giá không nguồn.
- Runtime/image phụ thuộc thư mục prototype, `_inbox`, `_outbox`, `_archive`.
- Mở thêm cổng DB/S3, hoặc import ghi thẳng DB bỏ qua audit.
- Nhãn hoặc thông tin trên đề làm lộ đáp án (ví dụ nhãn độ hiếm trên đề Đoán hình như prototype đang làm).
- Bốn chế độ hiện có, test hiện có hoặc bố cục 320px bị hỏng.

## 3. Ràng buộc

- AGENTS.md: runtime và build không phụ thuộc `_inbox/_outbox/_archive`. Dữ liệu prototype không vào Docker image.
- DEPLOY_PILOT: không công khai cổng DB/API/S3; production không chạy seed; admin nhập → nháp → duyệt → xuất bản.
- PRD: HS gắn với tình huống hàng hóa, không gắn cứng vào loài; TTS chỉ là nháp, không phải audio chuẩn; ảnh minh họa không dùng cho bài nhận diện nếu chưa duyệt.
- Migration chỉ được cộng thêm, không reset DB. Ưu tiên mở rộng `Revision.data` (JSON) thay vì đổi schema.
- `learning.ts` hiện lấy tối đa 100 revision (`take: 100`) cho một lượt; sau import sẽ có hơn 100 mục.

## 4. Thứ tự

Ba giai đoạn, mỗi giai đoạn có plan, kiểm thử và commit riêng:

1. **Dữ liệu** — để giai đoạn sau thiết kế trên đủ nội dung.
2. **UI/UX** — audit rồi làm lại các màn hình người học và một phần quản trị.
3. **Tính năng** — HS nhiều bước, tính giờ, combo, giọng máy, âm thanh.

## 5. Giai đoạn 1 — Dữ liệu

### 5.1 Các cách đã cân nhắc

| Cách | Đánh đổi | Kết luận |
| --- | --- | --- |
| **Script chuyển đổi gọi API quản trị** | Tốn công viết; đi qua validate, audit và duyệt; chạy local và VPS như nhau qua HTTPS; chạy lại không trùng | **Chọn** (người dùng đồng ý) |
| Ghi thẳng DB như seed | Nhanh, nhưng bỏ qua audit/validate; trên VPS phải chép ảnh lên server và vào container | Loại |
| Xuất CSV để nhập tay | Không cần code tải ảnh, nhưng CSV chỉ chứa tên → 100 ảnh và HS vẫn phải nhập tay | Loại |

Sao lưu rồi phục hồi DB + S3 từ local lên VPS cũng bị loại: chỉ dùng được cho stack mới tinh và đè dữ liệu đang chạy.

### 5.2 Đổi phạm vi: cho phép tôm

Người dùng chọn nhập toàn bộ, kể cả tôm.

- Bỏ chặn trong `validateItem` (`apps/api/src/catalog.ts:40`) và sửa test tương ứng.
- Sửa dòng phạm vi trong `docs/Seafood_Deck_PRD.md`: "không có tôm" chỉ áp cho bộ demo khách 6 loài, không còn là luật của danh mục.

### 5.3 Mở rộng dữ liệu mục (không đổi schema DB)

Thêm các trường **tùy chọn** vào `ItemData` (lưu trong `Revision.data`):

```ts
taxonomicGroup?: 'fish' | 'crustacean' | 'mollusc' | 'other';
family?: string;            // Penaeidae
familyVi?: string;          // Họ Tôm he
enAliases?: string[];       // name_en[1..]
jaKanji?: string | null;    // 牛海老
jaTrade?: string | null;    // ブラックタイガー (tên thương mại, khác tên chuẩn)
rarity?: 'common' | 'uncommon' | 'rare' | 'legendary'; // nghĩa: độ hiếm trên thị trường
tradeRestriction?: string | null; // ví dụ "CITES Phụ lục II"; importer để null, người duyệt điền
marketPrice?: { rangeUsd: string; rangeVnd: string; specRef: string; note: string; sourced: false };
hsHints?: { state: string; labelVi: string; hs6: string }[]; // gợi ý từ prototype, chỉ để biên tập
provenance?: { origin: 'prototype:seafood-master-2'; prototypeId: string; digest: string; verified: false };
```

`validateItem` chấp nhận và kiểm kiểu các trường này. Không có trường nào là bắt buộc, để CSV và mục hiện có vẫn hợp lệ.

**Ranh giới hiển thị:** API người học (`CatalogItemResponse`, câu hỏi) **không** trả `rarity`, `marketPrice`, `hsHints`, `provenance`, `tradeRestriction`. Có test khẳng định điều này. `family`, `familyVi`, `jaKanji`, `jaTrade`, `enAliases`, `taxonomicGroup` được trả cho người học vì là tên/phân loại, cùng mức duyệt với tên.

### 5.4 Ánh xạ prototype → bản chính

| Bản chính | Từ prototype |
| --- | --- |
| `externalId` | `id` (đã khớp regex `[a-zA-Z0-9_-]`) |
| `sku` | `proto-<id>` |
| `group` (nhóm thương mại hiển thị) | fish→"Cá", crustacean→"Giáp xác", mollusc→"Nhuyễn thể", other→"Khác" (dữ liệu thực tế không có other_invertebrate) |
| `taxonomicGroup` | `group`, gộp other_invertebrate vào other |
| `vi`, `scientific` | `name_vi`, `scientific_name` |
| `en`, `enAliases` | `name_en[0]`, `name_en[1..]` |
| `ja`, `jaKanji`, `jaTrade`, `pronunciation.ja` | `kana`, `kanji`, `trade`, `romaji` |
| `forms` | `hs_rules[].label_vi` |
| `identification` | `notes_vi` |
| `source` | "Prototype seafood-master-2 — chưa kiểm chứng" |
| `note` | "Nhập từ prototype; tên, ảnh, HS và giá chưa kiểm chứng." |
| `aliases` (bí danh tiếng Việt) | rỗng |

**4 loài trùng tên khoa học:** không tạo mục mới, không sửa mục hiện có. Báo cáo liệt kê để biên tập viên tự quyết.

### 5.5 HS

- **5 hồ sơ `hs_cases`** → 5 `TradeScenario` nháp gắn vào revision của loài `species_id`:
  - `prompt` = `scenario_vi`;
  - `options` = các lựa chọn của bước cuối, **chỉ giữ mã trần** (ví dụ `1605.21`) để `validateHs` so được với tariff; phần mô tả trong ngoặc giữ trong `steps`. Đáp án là `final_hs6`;
  - `explanation` = nối giải thích các bước;
  - `kind: 'code'`;
  - giữ nguyên `steps` và `trapTag` trong `data` để giai đoạn 3 dùng.
- **Mã tham chiếu:** mỗi `final_hs6` tạo hoặc dùng lại một `TariffReference` chưa duyệt: market `WCO`, version `HS 2022`, level 6, source ghi rõ lấy từ prototype và chưa đối chiếu. Hồ sơ sẽ không duyệt được cho tới khi mã được duyệt — đúng luật hiện có.
- **`hs_rules` của từng loài:** chỉ lưu vào `hsHints`, **không** tự sinh hàng trăm tình huống. Đề sinh tự động từ bảng mã dễ sai và trái nguyên tắc "không sinh đáp án khi chơi".

### 5.6 Ảnh

- Tải qua endpoint media hiện có của revision, trạng thái nháp, role `profile`. Đây là role có sẵn và đã được Thư viện/Hồ sơ loài hiển thị; không thêm role mới.
- Không dùng role `identification`: role này mới đủ điều kiện vào Đoán hình và cần người duyệt xác nhận đúng loài.
- `metadata` ghi `credit` gốc, `license` tách từ chuỗi credit, `origin: prototype`, `attributionComplete: false`.
- Trùng hash → bỏ qua.

### 5.7 Script `scripts/import-prototype.mjs`

```sh
node scripts/import-prototype.mjs --source <thư mục seafood-master-2> --base-url http://127.0.0.1:18089 [--dry-run]
```

- **Đọc nguồn an toàn:** đọc `data/species.js` và `data/hs_cases.js` dạng text, cắt phần mảng rồi parse. Không `eval`/`import` file prototype. `hs_cases.js` dùng object literal không quote nên cần parser chịu được, ví dụ `JSON5`, hoặc chuyển đổi có kiểm soát.
- **Đăng nhập:** hỏi username/password bằng prompt ẩn. Không nhận qua argv/env. Lấy CSRF như admin UI.
- **Chạy lại an toàn:** `externalId` đã tồn tại → **bỏ qua cả mục** và báo cáo, không tạo revision mới. Vì vậy không đè lên chỉnh sửa của biên tập viên, và không mất ảnh hay HS gắn theo revision. Ngoại lệ để nối tiếp lần chạy bị đứt: mục do importer tạo (`provenance`), revision còn `draft` và chưa có ảnh `profile` hoặc HS tương ứng → chỉ bổ sung phần còn thiếu. Tariff dùng lại theo code + version. Cần endpoint đọc admin tra theo `externalId` (endpoint `overview` hiện giới hạn 100 dòng); thêm endpoint nhỏ nếu chưa có. Cập nhật lại dữ liệu prototype đã nhập không thuộc phạm vi này.
- **`--dry-run`:** chỉ in kế hoạch (tạo / bỏ qua / trùng), không gọi API ghi.
- **Báo cáo cuối:** số mục tạo/bỏ qua/lỗi, 4 loài trùng, danh sách ảnh thiếu ghi công. Báo cáo in ra stdout, không ghi vào repo.
- **Snapshot chuyển đổi:** lưu dữ liệu đã chuyển (không có ảnh) vào `docs/sources/prototype-import/` (JSON + README nguồn gốc). Runtime không đọc thư mục này.

### 5.8 Admin

Trang chi tiết mục trong quản trị hiển thị các trường mới. Giá, độ hiếm và gợi ý HS có nhãn **"Chưa có nguồn — không hiển thị cho người học"**. Sửa các trường này trong form nháp là việc của giai đoạn 2.

### 5.9 Nới luật xuất bản và môi trường phát triển (người dùng chọn A + C)

**A — Audio không còn chặn xuất bản.** Hiện có 0 file audio đã duyệt, cả ở 6 loài hiện có lẫn 100 loài nhập từ prototype (prototype chỉ dùng giọng đọc của trình duyệt).

- Bỏ điều kiện "đủ audio duyệt cho en/ja/scientific" trong kiểm tra publish public (`catalog.ts`).
- Vẫn giữ các điều kiện khác: revision `approved` có người duyệt, đủ 4 tên có nguồn, luật ảnh `identification` cho Đoán hình.
- Mục thiếu audio duyệt không được chọn vào bài luyện nghe. Luật mở bài nghe khi đủ 3 clip hợp lệ giữ nguyên.
- Sửa PRD mục 1 ("Âm thanh và phiên âm bắt buộc khi phát hành"): audio duyệt bắt buộc cho bài nghe, không bắt buộc để xuất bản mục.
- Thêm test: publish được mục không có audio; bài nghe bỏ qua mục đó.

**C — Phát triển trên bản nội bộ.** Giai đoạn 2–3 được phát triển và kiểm thử trên release nội bộ (`ALLOW_INTERNAL_DEMO`) chứa 6 + 96 mục nháp, ở stack Docker local. Release nội bộ không bao giờ dùng cho khách. Trên VPS, mặc định production vẫn tắt chế độ này.

**Việc tiếp theo (ngoài phạm vi):** sản xuất audio cho khoảng 300 tên. Hai hướng: người bản ngữ thu âm, hoặc dịch vụ đọc chất lượng cao rồi người nghe duyệt từng file (gắn nhãn AI). Cần thiết kế riêng.

### 5.10 Giới hạn 100 mục

Sửa `learning.ts` để lượt học không phụ thuộc thứ tự cắt 100 dòng đầu. Ví dụ: chọn mục đích (`revisionId`) rồi lấy ngẫu nhiên đủ mục nhiễu từ toàn release. Thêm test với release > 100 mục.

## 6. Giai đoạn 2 — UI/UX

**Công cụ:** skill `impeccable`. Audit trước (phân cấp, mật độ, trạng thái lỗi/rỗng/tải, a11y, 320px, dark), sau đó sửa theo kết quả audit.

**Phạm vi màn hình:** đăng nhập, trang chủ/Catalog, Thư viện, Hồ sơ loài, màn câu hỏi của 4 chế độ, Tổng kết, Góc ôn tập, Tiến độ. Quản trị chỉ sửa phần hiển thị trường mới và nhãn chưa có nguồn.

**Lấy từ prototype:**

- **Thư viện:** chip lọc theo `taxonomicGroup` có số đếm. Thêm query tùy chọn `taxon` vào `/catalog/items` (thay đổi cộng thêm, cập nhật OpenAPI snapshot). 6 mục hiện có không bị tạo revision mới chỉ để điền trường này; chúng chỉ hiện ở "Tất cả" cho tới khi biên tập viên bổ sung; tìm theo mọi tên, gồm `enAliases` và `jaTrade`. Thẻ có ảnh thu nhỏ (nếu có), tên Việt, tên khoa học in nghiêng, nhóm. Có phân trang hoặc tải thêm (danh mục ~106 mục).
- **Hồ sơ loài:** khối tên Nhật tách chuẩn (kanji/kana/romaji) và tên thương mại; họ (family / familyVi); dấu hiệu nhận biết; "Xem HS theo dạng hàng".
- **Chế độ tối:** token màu trên `:root` cho cả `prefers-color-scheme` và nút chuyển; lưu lựa chọn trong localStorage (bọc try/catch).
- **Dải thống kê trang chủ:** đến hạn ôn / đang học / đã vững. "Đã vững" = mốc ôn ≥ 7 ngày. Tính từ dữ liệu tiến độ hiện có.
- **Phản hồi đúng/sai:** màu + biểu tượng + chữ, không chỉ dựa vào màu; chuyển động ngắn, tôn trọng `prefers-reduced-motion`.

**Giữ nguyên:** route, API contract (ngoài các trường/query cộng thêm đã nêu), các test E2E hiện có (cập nhật selector nếu cần, không xóa ca kiểm).

## 7. Giai đoạn 3 — Tính năng

### 7.1 HS nhiều bước

**Dữ liệu:** `TradeScenario.data` thêm tùy chọn:

- `steps: { question: string; options: { label: string; correct: boolean }[]; explanation: string }[]`;
- `trapTag?: string`.

`validateHs` kiểm tra:

- mỗi bước có đúng một đáp án;
- đáp án bước cuối khớp mã của tariff;
- `kind: 'insufficient'` không dùng steps.

**Chơi:**

- Đề hiện mô tả hàng và nhãn bẫy **sau khi nộp** (nhãn bẫy trước khi nộp sẽ gợi ý đáp án).
- Người học trả lời lần lượt Chương → nhóm 4 số → phân nhóm 6 số.
- Mỗi bước nộp lên server qua endpoint mới `POST sessions/:id/questions/:qid/steps/:n`. Server trả đúng/sai và giải thích của bước đó. Server lưu tiến trình nên reload không đổi đề và không chấm lại.
- Sai một bước vẫn xem giải thích rồi đi tiếp.
- **Chấm:** câu HS đúng khi mọi bước đúng ngay lần đầu. Ghi một `Attempt` duy nhất ở bước cuối, idempotent như hiện tại. Lịch ôn theo kết quả đó.
- Hồ sơ không có `steps` chơi như cũ.

**Admin:** `HsAdmin` cho thêm/sửa/xóa bước và nhãn bẫy.

### 7.2 Đoán hình — tính giờ tùy chọn

- Công tắc "Chế độ tốc độ (10 giây)", mặc định tắt.
- Hết giờ thì client nộp câu trả lời `timeout`; server chấm sai.
- Ảnh lỗi hoặc thiếu vẫn bỏ qua, không tính sai (giữ luật cũ). Đồng hồ dừng khi ảnh chưa tải xong.
- Thanh thời gian có chữ đếm ngược cho trình đọc màn hình.

### 7.3 Ghép tên — điểm và combo

- Hiển thị combo x1 → x3 khi ghép đúng liên tiếp, kèm thời gian của bàn.
- Điểm, combo và thời gian chỉ tính và hiển thị ở client, từ kết quả server trả. Không lưu server, không ảnh hưởng lịch ôn.
- Tổng kết lượt hiện điểm cao nhất của thiết bị (localStorage).

### 7.4 Đọc tên bằng giọng máy

Nhờ 5.9 (A), mục chưa có audio vẫn có thể được xuất bản, nên nút này sẽ thực sự xuất hiện với người học.


- Khi tên chưa có audio đã duyệt: nút "Nghe (giọng máy)" dùng Web Speech API, `en-US` cho tiếng Anh và `ja-JP` cho tiếng Nhật, có nhãn "chưa duyệt".
- Không có giọng phù hợp thì ẩn nút.
- Không dùng giọng máy cho bài luyện nghe, không tính là audio chuẩn.
- Có audio duyệt thì luôn ưu tiên audio duyệt.

### 7.5 Hiệu ứng âm thanh

- Âm đúng/sai/hoàn thành tổng hợp bằng Web Audio (như prototype), không có file.
- Mặc định **tắt**, có công tắc trong giao diện, lưu localStorage. Lý do: người dùng thường học ở nơi làm việc.

### 7.6 Không lấy từ prototype

- Leitner 5 hộp.
- Nhãn độ hiếm trên đề.
- Giá trên flashcard.
- Ma trận 4 cột (giữ 3 cặp một hướng theo PRD; combo đã mang lại cảm giác game).

## 8. Kiểm thử

- **Unit:** ánh xạ chuyển đổi (gồm loài có kanji null, trade null, other_invertebrate); parse `hs_cases.js` không eval; validateItem với trường mới; validateHs với steps; chấm HS nhiều bước; timeout.
- **API:** người học không nhận `rarity`, `marketPrice`, `hsHints`, `provenance`; import chạy hai lần không tạo thêm bản ghi; release > 100 mục.
- **E2E:** HS nhiều bước gồm reload giữa chừng; dark mode; Thư viện lọc nhóm; Đoán hình tốc độ; 320px.
- **Thủ công:** import vào stack Docker local, kiểm 100 nháp và ảnh trong quản trị. Chạy toàn bộ lệnh kiểm tra trong README.

## 9. Để lại cho người thực hiện

- Tên endpoint, tên component và tách file cụ thể.
- Lib parse JS object literal (JSON5 hoặc tự viết có kiểm soát).
- Chi tiết thị giác (khoảng cách, màu cụ thể, chuyển động) theo kết quả audit `impeccable`.
- Cách lấy mục nhiễu ngẫu nhiên trong `learning.ts`, miễn có test.

## 10. Quyết định của agent (người dùng kiểm khi đọc)

Người dùng đã quyết: nhập toàn bộ kể cả tôm; giá/độ hiếm chỉ hiện ở quản trị; import bằng script qua API; nới luật xuất bản (audio không chặn) và phát triển trên bản nội bộ.

Agent tự quyết:

- `sku = proto-<id>`; bản đồ nhóm sang "Cá / Giáp xác / Nhuyễn thể / Khác".
- `hs_rules` chỉ thành `hsHints`, không sinh tình huống.
- Ảnh vào role `profile` có sẵn (không vào Đoán hình cho tới khi người duyệt gán `identification`).
- Chạy lại: mục đã tồn tại thì bỏ qua, chỉ bổ sung phần thiếu cho nháp do importer tạo.
- Hồ sơ HS nhập vào dùng mã trần làm lựa chọn.
- Lọc nhóm qua query `taxon`; 6 mục cũ không bị đẩy lại vào duyệt.
- 4 loài trùng: bỏ qua, chỉ báo cáo.
- Nhãn bẫy chỉ hiện sau khi nộp; HS nhiều bước tính đúng khi mọi bước đúng lần đầu.
- Tính giờ Đoán hình mặc định tắt; hết giờ tính sai.
- Hiệu ứng âm thanh mặc định tắt.
- Combo/điểm chỉ ở client.
