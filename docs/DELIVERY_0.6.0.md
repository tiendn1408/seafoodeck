# Seafood Deck 0.6.0 — bàn giao bản kỹ thuật nội bộ

Ngày 18/11/2026. Thực thi hai tài liệu batch 2026-11-17-002 trong repo hiện tại. Bản này chạy bốn chế độ qua API/DB/S3, không còn catalog/đáp án/media câu hỏi trong bundle web. Chưa deploy VPS, chưa tuyên bố đủ điều kiện pilot dữ liệu khách.

## Mốc và image

- Baseline `7840e41`, tag `baseline-0.5.1`.
- Mốc 1 `27f586f`, tag `milestone-1-web-migration`: dời FE nguyên hành vi, kiểm cùng origin và localStorage.
- Mốc 2: commit/tag `milestone-2-pilot-api` trong lịch sử Git; báo cáo chốt sau khi ghi commit này.
- Hai image **linux/amd64 đã push GHCR**, cùng tag `pilot-internal-20261118`:

```env
API_IMAGE_REF=ghcr.io/tiendn1408/seafoodeck-api@sha256:435d5ff65d1f0f913257468361faf7b7029505b8422c3353d01034d2b0010a57
WEB_IMAGE_REF=ghcr.io/tiendn1408/seafoodeck-web@sha256:0197f19f2ce1cb1aa24423e03bc39f75c92d5695d357d8c44848d10b800a84e7
```

Image ID local đã mở và kiểm browser: API `4202519c1183eb0d1235b3750e4a96b143e4c938f6b34b3e338ea75ad88edb97`, web `9578acc9798c56b8ef1c6bd8a153770b45c34cd730403a9116dc7c08df7362d1`. Tag 0.5.1 cũ không bị ghi đè. [Lệnh VPS đầy đủ](DEPLOY_PILOT.md); dùng file Compose mới và **hai digest**, không chạy lại Compose web tĩnh cũ.

## Kết quả thực tế

| Phần | Kết quả trên container 0.6 |
| --- | --- |
| Flashcard | 3 tên Anh/Nhật/khoa học; chưa lật không gửi đáp án; lật/reload giữ trạng thái; tự đánh giá lưu đúng một lần; cả 6 loài vừa 320×568, 360×640, 390×740 ở mặt lật và sau đánh giá |
| Ghép tên | 3 cặp, cả hướng chọn trong UI; thao tác bàn phím; chấm theo từng loài; ôn riêng lỗi, không cộng lại cặp đã đúng |
| Đoán hình | 3 ảnh khác original mỗi lượt, signed URL riêng, không có tên loài trong object path/đáp án API trước nộp; ảnh lỗi thử cấp URL lại một lần rồi bỏ qua; skip không tính đã trả lời hoặc sai |
| HS | 3 fixture: cá ngừ nguyên con đông lạnh, phi lê đông lạnh, thiếu dạng hàng; cùng loài khác quy cách khác mã; thiếu dữ kiện phải chọn đúng điều cần hỏi; giải thích/mã đúng chỉ trả sau nộp; chưa duyệt nên nội bộ |
| Tiến độ | Reload khôi phục từ server và local draft; chống nộp kép/concurrent; key trùng nhưng payload khác trả 409; giữ storage baseline riêng; lỗi storage không chặn chơi; ôn lỗi và lịch 1/3/7/14 ngày |
| Catalog | DB 1000 mục = 6 loài mẫu + 994 SKU tổng hợp; trang 12 mục, 7.273 byte JSON, 9ms trong smoke localhost; tìm tên/alias Nhật, nhóm, deep link stable; không tải cả catalog lúc mở trang |
| Admin | CSV preview báo lỗi dòng/duplicate, import nguyên tử/idempotent; nháp/review/approve/publish theo role; clone thay media; xuất bản nội bộ rồi rollback trong browser; phiên cũ ghim release cũ |
| Quyền | Invite/session cookie HttpOnly/CSRF; learner bị chặn admin và nháp; object/list không ký trả 403; scope nội bộ false không xem được release nội bộ |
| Sự cố | Phiên hết hạn GET/submit 410, không thêm Attempt; signed URL TTL 1 giây thật hết hạn; DB/API dừng báo lỗi, không fallback fixture, khởi động lại phục hồi; log có requestId, không mật khẩu/token/query ký |

Kiểm tự động: **63 unit web + 9 unit API**, typecheck, build, lint, format pass; **15 E2E pass**, 3 ca viewport chỉ dành điện thoại skip ở desktop. Smoke API/media 9 nhóm và resilience 6 nhóm pass. Có một lần E2E khởi chạy ngay khi API restart chưa ready; đã thêm readiness poll và chạy lại đủ bộ pass. Lỗi tràn 5px trên thẻ đã đánh giá 320px đã sửa và kiểm lại 18 mặt thẻ của 6 loài ở mỗi kích thước.

Audio pipeline: upload MP3 hợp lệ → ffprobe/chuẩn hóa bỏ metadata → private S3 → signed playback thực trong browser, duration 3,038503 giây, rate 1 và 0,75, chỉ một clip active. Clip này là **TTS QA riêng không được duyệt**, không tính nội dung chuyên ngành; không có clip giả đánh dấu hoàn thành. SVG đổi đuôi/fake MP3 bị từ chối. Bản thu thiếu hiển thị nút disabled.

Mobile đo localhost bằng Chromium CDP, cache tắt, cấu hình 1,5Mbps/150ms/CPU4×: từ reload tới thẻ đầu **2.415ms**, 17 request, 2.116.266 byte hoàn tất tại mốc đó. Đây là số đo môi trường local mô phỏng, không phải cam kết hiệu năng VPS/mạng thật. Bundle có ảnh minh họa 2D; dữ liệu catalog/media chuyên ngành không nằm trong JS. RAM snapshot: API 166,7MiB/320MiB, S3 82,67/256MiB, DB 23,07/192MiB, web 74,46/96MiB; VPS đang có workload khác nên cần kiểm lại tải đồng thời thật.

`npm audit --omit=dev`: 0 advisory production tại lần kiểm. Audit toàn toolchain trước đó có 12 high ở dependency dev/build liên quan picomatch; không gọi đây là audit toàn bộ sạch, không tự nâng hạ cả frontend để che kết quả. CI chỉ test/build, không deploy; kết quả local không thay cho status CI GitHub.

## Tài sản và phần còn thiếu

Bộ mẫu hiện tại đã đổi theo phạm vi khách không có tôm. Có **5 ảnh thật tham chiếu**, đều draft/chưa có duyệt nhận diện cho chấm public; **0 ảnh được duyệt**. Mực ống chưa có ảnh. **3 minh họa AI 2D nền trong suốt** dùng trang trí, không tạo thêm lượt này, không dùng làm đáp án nhận diện. Nguồn/quyền bản gốc giữ `test-fixtures/pilot-media/NOTICE.txt` và hồ sơ cũ; DB lưu source/credit/rights/dấu vết chuẩn hóa, không tự gán quyền hoặc loài mới.

| ID / tên Việt | Ảnh thật tham chiếu | Audio Anh–Nhật–khoa học | Hướng dẫn đọc | Duyệt nội dung |
| --- | --- | --- | --- | --- |
| atlantic-cod / Cá tuyết Đại Tây Dương | r101 | thiếu cả 3 | Nhật có kana/romaji nháp; Anh + khoa học thiếu | 0 |
| yellowfin-tuna / Cá ngừ vây vàng | r102 | thiếu cả 3 | Nhật có kana/romaji nháp; Anh + khoa học thiếu | 0 |
| mitre-squid / Mực ống Trung Hoa | thiếu | thiếu cả 3 | Nhật có kana/romaji nháp; Anh + khoa học thiếu | 0 |
| east-asian-octopus / Bạch tuộc Đông Á | r104 | thiếu cả 3 | Nhật có kana/romaji nháp; Anh + khoa học thiếu | 0 |
| lyrate-clam / Nghêu Bến Tre | r105 | thiếu cả 3 | Nhật có kana/romaji nháp; Anh + khoa học thiếu | 0 |
| green-mussel / Vẹm xanh | r103 | thiếu cả 3 | Nhật có kana/romaji nháp; Anh + khoa học thiếu | 0 |

Tổng **0/18 file audio**, **6/18 hướng dẫn đọc có thật nhưng đều nháp**, thiếu 12 hướng dẫn Anh/khoa học và quy ước phát âm khoa học được người có chuyên môn duyệt. Bộ 9 mục của 3 loài tôm cũ là baseline lịch sử, không đại diện phạm vi hiện tại. Chế độ nghe có điều kiện code, chỉ mở khi đủ 3 clip hợp lệ cùng ngôn ngữ; hiện chưa mở.

HS có 3 fixture có dẫn nguồn tham chiếu, không có mã nào được người phụ trách khách duyệt public. Không dùng fixture để tự khẳng định mã áp dụng cho hàng/thị trường hiện tại. SKU chưa xác định loài giữ riêng, không suy đoán từ hình hoặc tên thương mại.

Chặn pilot/public khách: danh mục/SKU/quy cách thật; nguồn/quyền và phê duyệt tên/ảnh/audio/HS theo thị trường/phiên bản; tối thiểu 3 ảnh nhận diện khác original được duyệt; các bản thu/hướng dẫn tương ứng; người và vai trò duyệt; kho S3 được phép dùng thực tế, retention/backup và smoke test tại VPS. SeaweedFS đang dùng **nội bộ dev/test**, chưa tự chuyển dữ liệu khách lên dịch vụ ngoài. Thiếu các mục này không chặn kiểm kỹ thuật nhưng không được bỏ cổng public.

## Sao lưu, vận hành, giao nhận

Backup kiểm nghiệm nằm riêng trong `_backups/acceptance-20261118` (ignored), SQL + **20 object** cùng manifest SHA-256; đã dừng API lúc chụp và khởi động lại. Đã restore sang project cô lập `seafoodeck-restore-check-v2`: 20/20 object khớp key/MIME/SHA-256, catalog đủ 1000 mục, release `2f534c86-9e9e-4b1e-94f0-305770d3a6a7` giữ nguyên, private media signed read 200; stack restore đã dừng. Lần đầu script restore gặp dòng env trống tạo khóa không hợp lệ; đã sửa parser, chạy lại vào volume mới, không ghi đè stack cũ. Không tạo ZIP và không xóa volume để đạt kiểm thử. TTL maintenance: `node dist/maintenance.js` xóa phiên hết hạn, chỉ dry-run object orphan; thêm `apply` mới xóa orphan đủ tuổi. Chạy thủ công có lịch tại hạ tầng sau khi duyệt retention, không coi đây là background watcher. Revoke không thu hồi lập tức URL đã cấp: tối đa TTL 120 giây.

Inbox/outbox hiện trống. Hai tài liệu gốc đã archive batch 002, sổ nhận đóng riêng với duyệt nội dung còn pending. Không có file outbox cần chuyển tiếp, không tự gửi bên ngoài. Secrets, backup, screenshot và evidence raw giữ local, không đưa Git/GHCR.
