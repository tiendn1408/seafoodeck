> Cập nhật 27/11/2026: phần lớn các mục dưới đây đã làm (xem `git log` các commit `20ae6d1`, `05c43c7`, `a15f61c` và báo cáo rà soát); danh sách giữ để tham khảo, các ô chưa tick không còn phản ánh trạng thái.

# Việc còn lại sau review cuối phase 2.5a — 2026-11-20

Trạng thái: không có file inbox/outbox; đây là danh sách theo dõi nội bộ, chưa việc nào được làm trừ khi ghi khác. Hai lỗi M1 (huy hiệu đạt luôn có `earnedAt`) và M2 (`afterSubmit` lỗi không làm hỏng câu đã lưu) đã sửa trong commit cùng đợt.

## Cho 2.5b (trước khi học viên đăng nhập bằng trình duyệt)

- [ ] 1. Hai bộ giới hạn đăng nhập đang đếm cả đăng nhập thành công; spec 8.9 chỉ nói "đăng nhập sai". Sửa: chỉ đếm lần sai hoặc xóa bộ đếm khi thành công (cả lớp sau một IP NAT: lần đăng nhập thứ 21 trong 10 phút bị 429). Cân nhắc thêm đánh đổi khóa theo tên đăng nhập (có thể bị lợi dụng để khóa người khác).
- [ ] 2. Web phải xử lý mã `MUST_CHANGE_PASSWORD`; phiên bị gắn cờ sẽ bị chặn ở `POST /auth/login` cho đến khi đăng xuất.
- [ ] 3. `afterSubmit`: dòng cũ lệch khi release của phiên có tên khác release hiện hành.
- [ ] 4. Endpoint tổng kết gắn với phiên đăng nhập (`actor.id`): đăng nhập lại không lấy được tổng kết phiên cũ. Quyết định có cần lịch sử không.
- [ ] 5. Mục tổng kết của câu Ghép tên bị bỏ qua có `targetId` giữ chỗ `'matching'`; client không được tạo liên kết từ giá trị này.
- [ ] 6. `activeSessionId`/resumable chưa lọc theo release.

## Cho 2.5c (bắt buộc)

- [ ] Thu hồi `AuthSession` khi khóa người dùng (dùng helper `revokeUserSessions`).
- [ ] Cân nhắc xoay token phiên/CSRF khi đổi mật khẩu.
- [ ] `rebuild:progress` không nằm dưới khóa theo người dùng: chạy khi API tắt, hoặc chấp nhận có thể gặp 409/dựng lại thất bại (Serializable giữ dữ liệu an toàn).
- [ ] Tiến độ HS bị đặt lại khi sửa ghi chú/SKU/ảnh của một loài (bản sao revision tạo scenario id mới; spec ~dòng 164 chấp nhận). Ghi vào ghi chú nâng cấp.
- [ ] Khóa theo người dùng nằm trong tiến trình: giả định một container API.

## Sau này / vệ sinh

- [ ] Chuyển `errorStatus`/`errorBody` từ `main.ts` sang `errors.ts` để test không phải import `main`.
- [ ] Thu gọn file vectors JSON (612 KB).
- [ ] Thêm ca `0.0.0.0` và host có thông tin đăng nhập vào test `scripts/local-origin`.
- [ ] `smoke-pilot.mjs` không có chốt loopback — chủ ý, vì nó chạy trên VPS.
- [ ] Mặc định `PILOT_ORIGIN` không còn lấy từ env `PUBLIC_ORIGIN`; đặt `PILOT_ORIGIN` cho khớp khi cổng local khác.
