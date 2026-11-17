# Seafood Deck 0.5.0 — bàn giao demo nghiệp vụ

Ngày 2026-11-17. Đã làm trực tiếp trên repo, build và chạy một container, publish GHCR. **Sẵn sàng xem demo nội bộ; chưa phải bộ nội dung được duyệt public hoặc catalogue khách.** Không deploy VPS, không tạo ZIP/outbox/prototype.

## Bản chạy đã kiểm

- Preview local đang chạy: http://127.0.0.1:18086.
- Image: `ghcr.io/tiendn1408/seafoodeck:trade-demo-20261117`.
- GHCR digest: `sha256:ab7e847473876784641303d847cd39654bcc896cf72f7007971ac72d3400c649`.
- Image ID: `sha256:b27d94737ba3dc45a3d8514dac91db80bccfed9dd7b0dabcfe8479b32f9b4c06`, Linux amd64.
- Container kiểm thử: `seafoodeck-trade-demo`, health **healthy**, 256 MiB / 0.5 CPU / 128 PID. Đây không phải kiểm tải nhiều người đồng thời.
- Repo không có `.git`, nên không có commit hash để báo. Tag cũ được giữ nguyên.

Chạy độc lập trên máy có Docker (nếu chưa có container chiếm cổng 18086):

```sh
docker run -d --name seafoodeck-trade --restart unless-stopped \
  -e SITE_ADDRESS=:80 -p 127.0.0.1:18086:80 \
  ghcr.io/tiendn1408/seafoodeck@sha256:ab7e847473876784641303d847cd39654bcc896cf72f7007971ac72d3400c649
```

## Thay đổi đã hoàn thành

Bộ mới có 6 loài đại diện: cá tuyết Đại Tây Dương, cá ngừ vây vàng, mực ống Trung Hoa, bạch tuộc Đông Á, nghêu Bến Tre và vẹm xanh. Không có tôm trong hành trình học hoặc media runtime. Đây là lựa chọn mẫu để demo nhóm hàng khách đã nêu; không khẳng định khách kinh doanh đúng các loài này.

UI dùng cấu trúc sổ tay/nghiệp vụ: nhóm nguyên liệu, tên thương mại, nhận diện, dạng hàng và hồ sơ HS. Header gọn, bốn trang riêng, bộ lọc nhóm và hồ sơ loài có URL. Không sidebar, không emoji. Đã xem bản tắt ảnh: vẫn còn tên ngành, nhóm hàng và tác vụ nghiệp vụ. AI chỉ bổ sung phần minh họa, không gánh toàn bộ nhận diện thương hiệu.

| Chế độ | Kết quả thực tế trên container |
| --- | --- |
| Flashcard | 3 thẻ Anh–Nhật–khoa học/loài; đã đi qua 18 thẻ của 6 loài. Kiểm các mặt/trạng thái tại 320×568, 360×640, 390×740: không cần cuộn ở cỡ chữ mặc định. Tự đánh giá không cộng vào tỷ lệ chấm tự động. |
| Ghép tên | 3 cặp từ bộ 6 loài, có loài đang chọn; hướng Anh/Nhật/khoa học, bàn phím dùng được. Đã kiểm sai, làm lại, tổng kết, lưu phiên và ôn lỗi. |
| Đoán hình | Một lượt 3 câu dùng 3 ảnh gốc khác nhau trong 5 ảnh thật ứng viên. Reload giữ thứ tự/câu/lần nộp; nộp kép không cộng điểm. Không có đáp án trong alt/tên file/caption trước nộp. Ảnh lỗi có thử lại/bỏ qua; bỏ qua không thành đã trả lời, sai hoặc lịch ôn. Không fallback mạng hoặc thay bằng AI. |
| HS theo dạng hàng | 3 hồ sơ cùng cá ngừ vây vàng: nguyên con đông lạnh, thiếu dạng hàng, phi lê đông lạnh. Nguồn đối chiếu cấp 6 số: 0303.42 / 0304.87. Bài thiếu dữ kiện yêu cầu phân biệt nguyên con/phi lê. Tất cả hồ sơ vẫn là fixture demo, chưa phải hướng dẫn khai báo. |

Version bộ học mới là `seafood-trade-demo-1`. Tiến độ/phiên/ôn lỗi bộ tôm cũ vẫn giữ trong storage nhưng không cộng vào thống kê bộ mới hoặc gán lại sang loài khác. Phiên/link hồ sơ cũ có thông báo chuyển nội dung. Storage hỏng hoặc bị chặn có xử lý rõ; không giả báo đã lưu thành công.

## Tài sản và trạng thái duyệt

| Hạng mục | Có thật trong build | Được duyệt chuyên môn |
| --- | --- | --- |
| Tên Việt–Anh–Nhật–khoa học | 24 tên, nguồn theo từng tên | 0 |
| Ảnh thật | 5 JPEG có nguồn/quyền/hash: cá tuyết, cá ngừ, bạch tuộc, nghêu, vẹm | 0 duyệt nhận diện; chỉ nội bộ |
| Minh họa AI | 1 ảnh UI nhóm nguyên liệu, có nhãn AI | Không dùng định danh/chấm điểm |
| Audio | 0/18 file | 0 |
| Hướng dẫn đọc | 6/18 mục Nhật có kana/romaji nháp; 12 mục Anh/khoa học thiếu | 0 |
| Bài HS | 3 fixture, mã liên quan có nguồn đối chiếu | 0 |

Không có clip giả, TTS mạng hoặc nút nghe được đánh dấu đủ khi thiếu file. Các file thiếu cụ thể được kê đủ 18 dòng tại [pronunciation.csv](sources/customer-demo/pronunciation.csv). Mực chưa có ảnh phù hợp: dùng trạng thái thiếu ảnh, không tự gán ảnh khác loài.

Năm ảnh thật có hồ sơ giấy phép/ghi công trong [hồ sơ nguồn](sources/customer-demo/README.md), [selected-media.json](sources/customer-demo/selected-media.json) và `public/media/customer/NOTICE.txt` đóng gói cùng app. Có nguồn/quyền không đồng nghĩa đã có người duyệt nhận diện. Hai thumbnail Commons được ghi là bản resize, không giả thành ảnh gốc mới.

Minh họa dùng **built-in imagegen**, lưu tại [trade-desk-ai-v1.png](sources/customer-demo/superseded/trade-desk-ai-v1.png); [prompt cuối và metadata](sources/customer-demo/illustration.json). Không gán speciesId hoặc thêm vào bộ media chấm điểm.

## Kiểm thử

- **63 unit tests pass**, typecheck, ESLint, Prettier và production build pass.
- **27 E2E pass trên chính container**: 12 desktop, 15 mobile; 3 ca kích thước chỉ chạy mobile được skip có chủ đích trên project desktop, không tính vào 27 pass. `.last-run.json` báo passed, không có failedTests.
- Có kiểm đủ 4 chế độ, tổng kết/ôn lỗi, reload/nộp kép, media lỗi, lưu trữ lỗi, lịch sử bộ cũ, nguồn/AI và danh sách phát âm thiếu.
- Cả 5 JPEG giải mã từ container thành công; trang không tràn ngang tại chiều rộng 320/390/1440. Đã xem screenshot có ảnh và tắt ảnh trên desktop/mobile.
- Container không chứa `/srv/media/demo`, `_inbox`, `_outbox` hoặc `_archive`. Media/font đóng gói local, không gọi ảnh nguồn để chạy bài.
- Đây là Chromium mô phỏng viewport; chưa thử điện thoại vật lý, Safari thật, kiểm tải hoặc VPS mới.

Lệnh tái kiểm:

```sh
npm test
npm run typecheck
npm run lint
npm run format:check
npm run build
PLAYWRIGHT_BASE_URL=http://127.0.0.1:18086 npm run test:e2e
```

## Cập nhật VPS đang chạy

Thực hiện trong terminal SSH của bạn. Giữ file Compose hiện có và cấu hình domain/chứng chỉ. Không copy đè toàn bộ `.env`. Nếu deployment của bạn ở `/opt/seafoodeck` và dùng lệnh `sudo docker compose pull` mặc định như trước:

```sh
cd /opt/seafoodeck
sudo cp .env .env.before-0.5.0
sudo nano .env
```

Trong editor chỉ thay dòng IMAGE_REF thành:

```dotenv
IMAGE_REF=ghcr.io/tiendn1408/seafoodeck@sha256:ab7e847473876784641303d847cd39654bcc896cf72f7007971ac72d3400c649
```

Lưu rồi chạy:

```sh
sudo docker compose config --quiet
sudo docker compose pull
sudo docker compose up -d --no-build
sudo docker compose ps
curl -I https://seafoodeck.tiendn.io.vn
```

Nếu deployment dùng file tên riêng, dùng đúng file đó ở cả bốn lệnh Compose, ví dụ `sudo docker compose --env-file .env -f compose.ghcr.yaml ...` hoặc `compose.origin.yaml`; không tạo một deployment thứ hai. Nếu gặp unauthorized, `sudo docker login ghcr.io -u tiendn1408` rồi nhập PAT classic `read:packages` đã có ở prompt Password; không đưa token vào `.env`.

Rollback: khôi phục riêng dòng IMAGE_REF cũ từ `.env.before-0.5.0`, chạy pull/up bằng đúng Compose. Không xóa volume chứng chỉ, không prune image cũ. Tiến độ người học vẫn nằm trên trình duyệt; đổi image không tự chuyển lịch sử giữa các thiết bị. [Hướng dẫn cấu hình lần đầu/GHCR](DEPLOY_GHCR.md).

## Còn chặn public

1. Catalogue/tên thương mại khách chưa cung cấp. Hai tên Việt cá tuyết Đại Tây Dương và bạch tuộc Đông Á có phần diễn giải, đã gắn ghi chú cần duyệt; nhóm thịt trắng/đỏ là nhãn thương mại, không phải phân loại học.
2. Năm ảnh thật chưa có người duyệt nhận diện; mực thiếu ảnh. AI không thay việc này.
3. Thiếu 18 audio, thiếu 12 phiên âm/hướng dẫn đọc Anh/khoa học; 6 hướng dẫn Nhật còn nháp. Chưa có người duyệt phát âm.
4. HS mới đối chiếu nguồn bảng HS 2022 cấp 6 số; thiếu duyệt nghiệp vụ và xác nhận quy định có hiệu lực cho tình huống giao dịch thật. Không suy ra mã 8 số, thị trường nhập khẩu hoặc kết luận khai báo.

Public pack tiếp tục rỗng/đóng. Không giả reviewer, ngày duyệt hoặc tuyên bố dữ liệu chính thức. Các thiếu hụt này không chặn xem demo nội bộ đã chạy được.

`_inbox/` và `_outbox/` đang trống. Tài liệu/nguồn cần giữ đã nằm trong repo; không có gói giao việc mới phải chuyển tiếp.
