# Seafood Deck 0.5.1 — minh họa 2D nền trong suốt

Ngày 2026-11-17. Bản mới đã build, chạy và kiểm trên container, publish GHCR. Chưa deploy VPS. Giữ nguyên bộ 6 loài, 4 chế độ và các trạng thái thiếu tài sản/duyệt của [0.5.0](DELIVERY_0.5.0.md).

## Đã sửa

- Thay hình tả thực có nền màu bằng bộ **3 minh họa 2D alpha thật**. Trang học dùng nhóm nguyên liệu, thư viện dùng sổ tay tra cứu, màn ôn tập trống dùng thẻ mẫu và bút. Ba hình khác nội dung, không lặp cùng một ảnh giữa các vị trí.
- Khung ảnh nền trong suốt, `object-fit: contain`, không cắt mất vật thể. Đã kiểm nền tối, sáng và một nền tím thử: màu nền hiển thị qua alpha, không có mảng nền ảnh lệch màu. Đổi màu nền bằng CSS, không cần gen lại ảnh; màu các vật thể trong ảnh vẫn là palette của minh họa.
- Bỏ caption AI khỏi UI theo yêu cầu. Ảnh trang trí có `alt=""`/ẩn với trình đọc màn hình; hồ sơ AI, prompt và hash giữ nội bộ. Không thêm ảnh minh họa vào bài nhận diện chấm điểm.
- Combobox trang học và thư viện giữ `<select>` native; tự vẽ chevron 16px, cách mép phải 14px, chữ chừa 40px. Có fallback native khi forced colors. Kiểm 320/390/1440px không tràn ngang.
- Hình cũ chuyển sang `docs/sources/customer-demo/superseded/`, không còn trong public/runtime.

Tạo bằng **built-in imagegen**, không CLI/API key. File cuối trong [public/media/illustrations](../public/media/illustrations): `seafood-assortment-2d-v2.png`, `seafood-notebook-2d-v2.png`, `seafood-review-2d-v2.png`. [Toàn bộ prompt cuối và metadata](sources/customer-demo/illustrations-v2.json).

## Bản chạy và kiểm thử

- Preview: http://127.0.0.1:18087, container `seafoodeck-flat-demo`, healthy.
- GHCR: `ghcr.io/tiendn1408/seafoodeck:flat-illustrations-20261117`, Linux amd64.
- Registry digest: `sha256:f184546d9e5715b8485f2acbdcd00437400eb485872354aa9043c11da36ac824`.
- Local image ID: `sha256:f9051213df7a46f77ea8fcb026b86fb1e282fe40241395c390a448d1b893f436`.
- Không có `.git`, nên không có commit hash. Tag 0.5.0 giữ nguyên để rollback.

**63 unit tests pass; typecheck, lint, format và Docker production build pass. 27 E2E pass trên chính container** (12 desktop + 15 mobile), 3 ca viewport được skip có chủ đích trên project desktop. Đã chạy lại bốn chế độ, reload/nộp kép, ảnh lỗi, lịch sử/ôn lỗi và Flashcard trên ba kích thước điện thoại. Đây là Chromium mô phỏng, chưa thử máy/Safari thật.

Đã giải mã cả 3 hình từ container ở đúng vị trí; hash trùng hồ sơ nguồn, healthz ok, hình cũ vắng mặt. Kiểm alpha qua canvas có pixel hoàn toàn trong suốt; đã xem screenshot desktop/mobile và màu nền thay thế. Tài sản hiện tại: 5 ảnh thật ứng viên / 0 duyệt nhận diện, 3 minh họa UI, 0/18 audio, 6 hướng dẫn Nhật nháp / 12 hướng dẫn Anh–khoa học thiếu. Chặn public về nội dung giữ như 0.5.0.

## Cập nhật VPS bằng tay

Trong thư mục deployment đang dùng, sao lưu `.env` rồi chỉ sửa IMAGE_REF; giữ domain và file Compose hiện tại:

```sh
cd /opt/seafoodeck
sudo cp .env .env.before-0.5.1
sudo nano .env
```

```dotenv
IMAGE_REF=ghcr.io/tiendn1408/seafoodeck@sha256:f184546d9e5715b8485f2acbdcd00437400eb485872354aa9043c11da36ac824
```

Nếu đang dùng Compose mặc định như trước:

```sh
sudo docker compose config --quiet
sudo docker compose pull
sudo docker compose up -d --no-build
sudo docker compose ps
```

Nếu dùng tên file riêng, thêm đúng `--env-file .env -f compose.ghcr.yaml` hoặc `compose.origin.yaml` vào tất cả lệnh Compose, không tạo deployment thứ hai. Nếu unauthorized, dùng lại `sudo docker login ghcr.io -u tiendn1408` với PAT chỉ đọc ở prompt Password.

Rollback: khôi phục riêng IMAGE_REF trước từ `.env.before-0.5.1`, pull/up cùng file Compose; không xóa volume/chứng chỉ. Hướng dẫn chi tiết ở [GHCR/VPS](DEPLOY_GHCR.md). `_inbox/` và `_outbox/` vẫn trống; không có gói mới phải chuyển tiếp.
