# Quy trình giao nhận file

## Vùng làm việc

Gốc repo: `/Users/tien.dang/Workplace/reference/seafood-deck`.

```text
_inbox/<batch-id>/           File bạn/bên phân tích/bên thiết kế gửi về
  images/                   Ảnh gốc và metadata
  audio/                    Bản thu và metadata
  sources/                  Tài liệu, bằng chứng nguồn/quyền
  analysis/                 Báo cáo đối chiếu nội dung
  design/                   Thiết kế, đặc tả crop và UI
_outbox/<batch-id>/          Brief và danh sách yêu cầu để bạn chuyển đi
_archive/inbox/<batch-id>/   Đầu vào đã xử lý, không còn trong hàng chờ
_archive/outbox/<batch-id>/  Gói giao việc đã đối chiếu và đóng
docs/handoffs/<batch-id>.md  Sổ giao nhận bền vững
```

Batch đầu tiên: **2026-11-17-001**. Mỗi đợt mới dùng ngày và số thứ tự mới, không tái dùng ID đã đóng. Không lấy ngày trên máy thực thi thay cho ngày người dùng.

## Cách gửi đầu vào

1. Đọc phản hồi hiện hành của đúng batch trong `_outbox/`. Brief gốc và `requests.csv` được tra trong `_archive/outbox/<batch-id>/` nếu đã được phản hồi mới thay thế.
2. Bỏ kết quả vào nhánh tương ứng của `_inbox/<batch-id>/`. Trong tên báo cáo/metadata ghi `request_id` để đối chiếu đúng yêu cầu.
3. Có thể gửi từng phần; nhắn "xử lý inbox batch <id>" khi sẵn sàng. Không có bộ theo dõi thư mục tự động.
4. Không chắc loài: đặt dưới `images/unassigned/`, giữ tên gốc nếu cần và ghi `proposed_species_id` trống. Không tự gán chỉ vì tên file, hình giống hoặc tài liệu gần nghĩa.
5. Tài liệu không khớp loài/tình huống/phiên bản: đánh dấu `needs_review`. Người dùng quyết định ánh xạ; không tự đổi ID hoặc danh mục HS.

Ảnh dùng tên `<species-id>__species-photo__<view>__001__v1.jpg`; minh họa AI dùng `<species-id>__illustration-ai__001__v1.png`; dạng hàng dùng `<scenario-id>__product-photo__001__v1.jpg`. Audio dùng `<species-id>__en-US__primary__v1.wav` (hoặc `ja-JP`, `scientific`). Tên chỉ biểu thị đề xuất, không chứng minh loài hay quyền sử dụng.

File metadata cùng tên, thêm đuôi `.metadata.json`, cần ghi: `request_id`, tên file gốc, `proposed_species_id` hoặc `proposed_scenario_id`, loại ảnh/audio, `ai_generated` (true/false/unknown), tác giả, nguồn/URL, quyền và bằng chứng, góc chụp/trạng thái hàng, mục đích đề xuất. Người duyệt/ngày duyệt để trống đến khi có duyệt thật. Có thể gửi bảng CSV thay metadata nếu dễ hơn; thiếu thông tin được ghi rõ, không tự điền giả.

## Đối chiếu và dọn inbox

Sau khi xử lý inbox, trả kết quả cho người dùng trong chat. Chỉ tạo/cập nhật file outbox nếu thực sự có nội dung cụ thể cần chuyển cho bên khác, ví dụ yêu cầu bổ sung cho bên phân tích/thiết kế hoặc tài sản cần bàn giao. Không tự tạo outbox để lặp lại mọi báo cáo chat hay ghi công việc nội bộ. Nếu có file cần chuyển, chỉ rõ đúng file hiện hành và người nhận dự kiến; không tự gửi ra ngoài. Nếu không có nhu cầu chuyển bên khác, không tạo gói hoặc file outbox mới.

Khi được yêu cầu xử lý, kiểm kê file và đối chiếu từng `request_id` với `requests.csv`. Ghi vào `docs/handoffs/<batch-id>.md`: đường dẫn nhận, SHA-256 khi tiếp nhận, ID đề xuất/đã xác nhận, trạng thái nguồn/quyền, kết quả kiểm tra, quyết định và đường dẫn sau xử lý.

Trạng thái file:

- `received`: mới nhận, chưa kiểm tra.
- `needs_review`: thiếu nguồn/quyền hoặc chưa khớp loài/tình huống; sau khi xử lý chuyển bản gốc sang archive, ghi rõ việc còn chờ duyệt trong sổ giao nhận. Dọn inbox không phải duyệt nội dung.
- `processed_draft`: đã kiểm tra/kết xuất nháp, chưa được phát hành; chuyển bản gốc sang archive sau khi ghi sổ.
- `accepted`: đủ điều kiện cho mục đích đã duyệt; chuẩn bị bản đích, ghi sổ rồi chuyển bản gốc sang archive.
- `rejected`: không dùng, có lý do rõ; ghi sổ rồi chuyển archive, không xóa âm thầm.

Giữ cấu trúc đường dẫn trong archive, không ghi đè khi trùng tên. Nếu cần sửa file đã nhận, gửi phiên bản `v2` thay vì ghi đè `v1`. `processed_draft` không được coi là đã đáp ứng một yêu cầu đòi hỏi ảnh thật đã xác minh.

Đích sau duyệt:

```text
public/media/images/species/<species-id>/<asset-id>__v1.webp
public/media/images/scenarios/<scenario-id>/<asset-id>__v1.webp
public/media/images/illustrations/<species-id>/<asset-id>__v1.webp
public/media/audio/<species-id>/<asset-id>__v1.mp3
docs/sources/species/<species-id>/
docs/sources/scenarios/<scenario-id>/
docs/sources/tariffs/<tariff-id>/
```

Đây là quy ước đích; không tự tạo bản phát hành chỉ vì đã nhận file. Bước tích hợp UI/model vẫn cần được triển khai khi người dùng yêu cầu. Ảnh câu hỏi phát hành dùng asset ID không lộ tên loài. Tài liệu nguồn chỉ sao chép phần được phép phân phối; bằng chứng riêng tư giữ ở archive, liên kết bằng ID trong sổ.

## Đóng và dọn outbox

Outbox chỉ giữ tài liệu hiện hành cần lấy/gửi. Khi có phản hồi mới thay thế brief hoặc phản hồi cũ, ghi nhận trong sổ rồi chuyển các tài liệu bị thay thế sang `_archive/outbox/<batch-id>/`, không cần chờ đóng batch. Archive có thể chứa bản cũ của batch vẫn mở; chỉ sổ giao nhận mới xác định batch đã đóng hay chưa. Việc chuyển nguyên gói hiện hành để đóng batch vẫn theo các điều kiện bên dưới.

1. Gói outbox mang trạng thái `awaiting_response` khi đã soạn và sẵn sàng giao. Không tuyên bố bên ngoài đã nhận nếu người dùng chưa xác nhận.
2. Đối chiếu mọi yêu cầu bắt buộc: `pending`, `partial`, `needs_review`, `accepted` hoặc `waived_by_user`. Ghi file bằng chứng cho từng dòng; có file không đồng nghĩa đủ nội dung.
3. Khi đã nhận và xử lý đủ đầu vào cho phạm vi đang làm, dọn cả inbox/outbox theo yêu cầu thường trực của người dùng: lưu trữ phần cần giữ, xoá phần thừa. Tách việc đóng lượt giao nhận với việc duyệt nội dung public; yêu cầu còn thiếu vẫn ghi trong sổ và báo cáo, không tự coi là accepted hoặc waived.
4. Ghi trạng thái `closed`, người xác nhận, thời điểm và các ngoại lệ vào sổ bền vững. Sau đó chuyển nguyên gói `_outbox/<batch-id>/` sang `_archive/outbox/<batch-id>/`. Chuyển cả thư mục inbox batch đã xử lý, kể cả tài sản còn chờ duyệt nội dung; giữ các báo cáo/manifest cùng batch trong archive.
5. `_outbox/` lúc này chỉ còn gói đang hoạt động; khi không có gói mới, cả `_inbox/` và `_outbox/` để trống; không tạo lại gói cũ. Sổ trong `docs/handoffs/` cho biết gói nào đã đóng. Đợt sau luôn tạo ID mới.

Mặc định **di chuyển, không xóa vĩnh viễn**. Nếu người dùng yêu cầu xóa archive, chỉ xóa batch được chỉ định sau khi kiểm tra các tham chiếu; giữ sổ quyết định và nguồn/quyền cần thiết cho tài sản đang phát hành.

## Phân loại bắt buộc

- Ảnh thật đã xác minh loài và quyền: có thể duyệt `profile`; `identification` cần duyệt riêng đủ dấu hiệu.
- Ảnh AI: chỉ minh họa có nhãn và qua duyệt; không mặc định đưa vào Đoán hình chấm điểm.
- Ảnh chưa xác định loài/quyền: `needs_review`; không phát hành, không tự gán.

App không import, quét, phục vụ hay đọc trực tiếp ba vùng giao nhận. Không thêm chúng vào `public/` hoặc build glob. Các thư mục này là vùng làm việc local, không nằm trong bản `dist/`; ứng dụng hiện vẫn đóng cổng public.
