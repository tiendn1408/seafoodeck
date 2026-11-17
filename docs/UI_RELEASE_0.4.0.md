# Seafood Deck 0.4.0 — mobile và màn học tập trung

Đã cài bổ sung [web-design-guidelines của Vercel](https://github.com/vercel-labs/agent-skills/tree/main/skills/web-design-guidelines), dùng cùng frontend-design. Skill được cài tại `~/.codex/skills/web-design-guidelines`, khả dụng tự động từ lượt tiếp theo; lượt triển khai này đã đọc nội dung và bộ quy tắc nguồn trực tiếp để áp dụng.

## Thay đổi

- Bỏ sidebar trên desktop và thanh điều hướng đáy trên mobile; dùng header chung với Học tập, Thư viện, Ôn tập, Tiến độ. Trong phiên học chỉ giữ header gọn và nút quay về.
- Trang chủ chỉ chọn chế độ và mở thư viện, không chứa dashboard/lịch ôn/thông báo nguồn dài. Tiến độ có trang riêng `#progress`.
- Bốn chế độ có ảnh thật có sẵn hoặc sơ đồ bằng CSS và icon Lucide SVG. Không emoji, ảnh AI, ảnh ngoài hay thêm loài. Thẻ có ảnh thật ở mặt trước; giữ mục đích học nội bộ và ảnh chờ duyệt.
- Flashcard dùng chiều cao viewport động, phần thẻ co giãn. Lật, tự đánh giá, phản hồi và Tiếp tục nằm trong màn hình điện thoại ở các kích thước đã thử, không cắt nội dung bằng body overflow hidden.
- Chặn click thứ hai của double-tap để tránh chạm xuyên từ Đã nhớ sang Tiếp tục mới xuất hiện. Dữ liệu lần nộp vẫn có chốt chống lặp ở domain.
- Reset vị trí cuộn khi chuyển trang/câu; focus sau điều hướng, skip link, icon trang trí ẩn với trình đọc màn hình, ảnh có kích thước, màu theme đồng bộ.
- Hồ sơ loài có URL `#profile/<species-id>`, reload vẫn giữ loài đang xem. Tiến độ và schema localStorage v1 được giữ.

## Kiểm tra thực tế

Build Docker, typecheck, lint, format-check pass. 53 test logic pass. Trên chính Docker 0.4.0: **23 E2E pass** (10 desktop, 13 mobile); 3 lượt kiểm viewport chỉ dành cho mobile được skip trong project desktop, không tính là 26 test pass.

- Ba viewport 320×568, 360×640, 390×740: chạy cả 9 thẻ của 3 loài. Kiểm scrollHeight không vượt innerHeight, không tràn ngang, nút lật/đánh giá/tiếp tục luôn trong vùng nhìn thấy, cao tối thiểu 44px. Kiểm cả mặt trước, mặt sau có báo thiếu audio, trạng thái đã đánh giá và tổng kết.
- Bốn chế độ: vẫn qua lượt đầy đủ, reload, nộp kép, ảnh lỗi/bỏ qua, ôn lỗi và lịch ôn riêng theo kỹ năng như bộ kiểm trước.
- Header mới, điều hướng trang tiến độ và hồ sơ sau reload được kiểm E2E.
- Xem screenshot desktop 1440×900, mobile 390×740 và 320×568 từ container. Đã chờ toàn bộ ảnh decode, kiểm naturalWidth đúng 2816/2700/2100px. Header có số mục ôn không tràn 320px.
- Viewport là Chromium mô phỏng, chưa phải kiểm thiết bị vật lý. Màn tài liệu HS, hồ sơ và tổng kết vẫn cho cuộn khi cần đọc; không ép mọi màn vào một chiều cao. Browser zoom và cảnh báo storage có thể cần cuộn để giữ đủ nội dung.

## Docker bàn giao

- Tag: `ghcr.io/tiendn1408/seafoodeck:mobile-focused-20261117`.
- Digest GHCR: `sha256:884924378a136ab7808dc5be9f6222f0db9029f18dc2148c98f37dc0179ea652`.
- Image ID đã chạy: `sha256:306c330a27539c859b3cd6b64a54e0656052cdae5217fd18b3d01a56ab4a2965`, linux/amd64.
- Container `seafoodeck-mobile-review` healthy, http://127.0.0.1:18085, giới hạn 256 MiB RAM / 0.5 CPU / 128 PID.
- Không có .git nên không có commit ID. Không tạo ZIP/TAR mới. Không tự deploy VPS. Các tag cũ giữ nguyên.

Trong Terminal SSH vào VPS, cập nhật deployment hiện dùng compose.yaml:

```sh
cd /opt/seafoodeck
sudo cp .env .env.before-ui-040
sudo sed -i 's|^IMAGE_REF=.*|IMAGE_REF=ghcr.io/tiendn1408/seafoodeck:mobile-focused-20261117|' .env
sudo docker compose pull
sudo docker compose up -d
sudo docker compose ps
```

Nếu đang dùng `compose.ghcr.yaml`, thêm `-f compose.ghcr.yaml` sau `docker compose`. Không chép đè env hiện có hoặc xoá volume chứng chỉ. Nếu hết phiên GHCR, chạy `sudo docker login ghcr.io -u tiendn1408` với PAT đọc package. Quay lại: phục hồi `.env.before-ui-040`, chạy đúng Compose với `up -d --pull never` khi image cũ còn local. Domain và container khác không đổi.

## Nội dung và giao nhận

Ba JPEG gốc được dùng lại, không thay byte hoặc tự duyệt: 3 ảnh tích hợp, 0 duyệt nhận diện. Audio 0/9, hướng dẫn đọc 3/9 nháp, 0 duyệt. HS 3 bài demo/nháp, 0 duyệt public. [Kiểm kê nội dung](DELIVERY_0.2.0.md) vẫn là danh sách phần còn thiếu. Không mở public do đổi UI.

_inbox và _outbox vẫn trống; bản gốc/nguồn đã lưu archive theo [sổ giao nhận](handoffs/2026-11-17-001.md). Không tạo outbox để lặp lại báo cáo nội bộ.
