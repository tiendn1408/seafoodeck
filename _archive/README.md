# Kho các đợt đã xử lý

- `inbox/<batch-id>/`: đầu vào đã ghi sổ và xử lý.
- `outbox/<batch-id>/`: gói giao việc đã đối chiếu, xác nhận đủ và đóng.

Không lấy file ở đây làm đầu vào đợt mới. Không phục vụ thư mục này qua app. Tra trạng thái và quyết định trong `docs/handoffs/<batch-id>.md`.

Mặc định lưu bản gốc bằng cách di chuyển, chưa xóa vĩnh viễn. Không xóa tài sản runtime hoặc nguồn/quyền còn được tham chiếu khi dọn giao nhận.
