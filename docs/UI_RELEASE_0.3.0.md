# Seafood Deck 0.3.0 — UI học chuyên ngành

Đã áp dụng skill frontend-design để chỉnh trực tiếp app React hiện có. Nền sáng/xám lạnh, xanh biển cho hành động chính, một font Be Vietnam Pro đóng gói local. Bỏ hero trang trí và lời dẫn dài; bốn chế độ vào trực tiếp từ trang chủ. Điều chỉnh phân cấp chữ, vùng chạm, focus bàn phím, mobile navigation và khoảng cách trên mọi màn. Thư viện/hồ sơ có ảnh; nút Học trọn lượt mô tả đúng luồng thẻ → ghép tên → HS. Không sinh ảnh mới hoặc mở rộng bộ loài.

## Bản chạy

- GHCR: `ghcr.io/tiendn1408/seafoodeck:ui-professional-20261117`.
- Registry digest: `sha256:5571b80e1e5e1cd48a5f1b6d060a5ff786d58ddf98ec386f9710f90abf13e6e9`.
- Image ID local: `sha256:679eb3d580bf3273e8558fb28b9b4080b4703130175a36c0f7703e6a51e38029`, linux/amd64.
- Container `seafoodeck-ui-review` healthy tại http://127.0.0.1:18084, giới hạn 256 MiB, 0.5 CPU, 128 PID.
- Không có .git nên không có commit ID. Tag cũ giữ nguyên. Không tạo TAR/ZIP mới, không deploy VPS.

## Kiểm tra thực tế

Build Docker, lint và format-check thành công; 53 test logic pass. Trên chính container mới: 18 E2E pass, 9 desktop + 9 mobile.

| Chế độ    | Kết quả                                                                                                      |
| --------- | ------------------------------------------------------------------------------------------------------------ |
| Flashcard | Cả 3 loài, 3 thẻ mỗi loài; lật, tự đánh giá, reload, tổng kết; 9 mục nghe báo thiếu thật                     |
| Ghép tên  | Hoàn tất 3 cặp, ghép sai/làm lại, reload giữ cặp đúng; chọn Nhật và thao tác bàn phím                        |
| Đoán hình | Cả 3 JPEG local; không lộ nguồn/đáp án trước nộp; reload/nộp kép; ôn lỗi; ảnh hỏng bỏ qua không tính trả lời |
| HS        | Đủ dữ kiện, thiếu dữ kiện và cùng loài khác quy cách; nộp kép/reload; tổng kết/ôn theo kỹ năng               |

Đã xem screenshot 1440, 390 và 320px; không tràn ngang ở các màn đã kiểm. Kiểm thêm 320px cho bốn chế độ, 3 câu ảnh, câu HS hỏi thêm, tổng kết, tiếp tục phiên và tìm kiếm Nhật. Đây là Chromium mô phỏng viewport, chưa phải kiểm thiết bị vật lý hoặc kiểm tải VPS.

Nội dung vẫn nội bộ: 3 ảnh tích hợp, 0 ảnh duyệt nhận diện; 0/9 audio, 3/9 hướng dẫn đọc nháp và 0 duyệt; HS 3 bài demo/nháp, 0 duyệt public. Chi tiết nguồn và khoảng trống nội dung theo [báo cáo nội dung](DELIVERY_0.2.0.md). Dọn thư mục không thay đổi trạng thái duyệt.

## Cập nhật VPS đang chạy

Trong Terminal trên Mac, SSH tới VPS:

```sh
ssh shin@42.96.20.66
```

Trong phiên SSH, nếu deployment hiện tại dùng `/opt/seafoodeck/compose.yaml`:

```sh
cd /opt/seafoodeck
sudo cp .env .env.before-ui-030
sudo sed -i 's|^IMAGE_REF=.*|IMAGE_REF=ghcr.io/tiendn1408/seafoodeck:ui-professional-20261117|' .env
sudo docker compose pull
sudo docker compose up -d
sudo docker compose ps
```

Nếu đang dùng tên `compose.ghcr.yaml`, thêm `-f compose.ghcr.yaml` sau `docker compose` trong ba lệnh trên. Chỉ sửa IMAGE_REF, không chép đè domain/volume/config server. Nếu phiên đăng nhập registry hết hạn, `sudo docker login ghcr.io -u tiendn1408` bằng PAT đọc package trước khi pull. Sau cập nhật, reload trang để tải UI mới; dữ liệu localStorage vẫn dùng schema v1. Không chạy down -v.

Quay lại khi cần:

```sh
sudo cp .env.before-ui-030 .env
sudo docker compose up -d --pull never
```

Chỉ dùng lệnh quay lại nếu image cũ vẫn còn local; dùng đúng tên Compose đang triển khai. Các lệnh này do người dùng tự chạy, agent chưa chạy trên VPS.

## Dọn giao nhận

Cả `_inbox/` và `_outbox/` hiện trống hoàn toàn. Đã chuyển 18 file cần giữ sang `_archive/inbox/2026-11-17-001/` và `_archive/outbox/README.md`; SHA-256 và đích lưu trong [sổ giao nhận](handoffs/2026-11-17-001.md). Xoá .DS_Store và các thư mục rỗng thừa. Không xoá ảnh runtime hoặc bằng chứng nguồn/quyền. Cập nhật AGENTS.md và FILE_HANDOFF.md: các đầu vào đã xử lý được lưu trữ; phần chưa duyệt theo sổ, không để file cũ trong hàng chờ. Không tạo outbox báo cáo nội bộ.
