# Tính giờ cho Đoán hình (giai đoạn 3, phần 3): thiết kế ngắn

Trạng thái: đã duyệt bởi chủ dự án ngày 27/11/2026 (trong hội thoại). Bản demo, chưa có khách. Chủ dự án chọn: tính giờ **thật** (hết giờ ảnh hưởng kết quả) và tính **theo tổng cả phiên**, không theo từng câu.

## Ý định và lý do

Tạo nhịp "nhìn nhanh, nhận ra nhanh" cho người học nhận diện nguyên liệu, và đo được độ thuần thục (nhận ra trong thời gian cho phép). Khác combo và âm thanh: phần này **đổi kết quả**, nên đi qua API.

## Mục tiêu

- Một đồng hồ đếm ngược cho cả phiên Đoán hình: **15 giây nhân số câu của phiên** (3 câu thì 45 giây), hiện dạng thanh đếm ngược trên thanh màn học. Còn 10 giây thì đổi sang màu ấm (không nhấp nháy).
- Đồng hồ chỉ bắt đầu khi ảnh của câu đầu tiên đã tải xong (hoặc đã báo lỗi/không có ảnh). "Tạm dừng" (rời màn học) dừng đồng hồ và giữ nguyên thời gian còn lại, kể cả khi tải lại trang (lưu trên máy theo mã phiên).
- **Hết giờ:** câu đang làm dở nộp luôn lựa chọn hiện có (chưa chọn thì tính **sai**); các câu chưa làm tính **sai** với lời giải thích "Hết giờ". Rồi sang màn tổng kết, có dòng nêu rõ hết giờ. Câu hết giờ tính vào độ chính xác và lịch ôn như câu sai, làm đứt combo, và có trong "làm lại câu sai".
- **API:** thêm cách trả lời `{ timeout: true }` cho câu hình (chấm sai, vẫn lộ đáp án đúng như mọi câu sai). Không đổi cơ sở dữ liệu, không migration; không đổi khóa chống nộp trùng (nộp lại cùng khóa cho cùng kết quả).
- **Công tắc "Tính giờ"** ở màn học (chỉ hiện ở phiên Đoán hình), lưu theo máy, mặc định **bật**. Tắt thì không có đồng hồ và không có hết giờ (người thao tác chậm cần tắt được giới hạn thời gian).

## Không làm

- Không áp cho Flashcard, Ghép tên, HS, Nghe hay Ôn tập; không đổi độ dài phiên.
- Server **không** tự ép giờ (không lưu thời điểm giao câu hỏi): bản demo, thiết bị tự ngắt giờ. Người cố ý chặn đồng hồ chỉ tự làm mình lợi, không ảnh hưởng ai khác.
- Không đổi cách chấm của các câu khác, không đổi dữ liệu đã lưu, không thêm cột.
- Không có âm thanh (hiệu ứng âm thanh đang tắt), không nhấp nháy, không đếm giây bằng giọng.

## Cách làm (đã cân nhắc)

- **Chọn:** hết giờ ở phía trình duyệt (đồng hồ ở `Study.tsx`), gọi lại API hiện có `POST /learning/sessions/:id/questions/:qid/attempts` với `answer: { timeout: true }` cho từng câu cần đóng; chấm ở `grade()` trong API. Khóa chống nộp trùng cho câu hết giờ cố định theo `game.id` và `question.id`, nên gửi lại là an toàn.
- Loại: đồng hồ trên máy chủ (cần lưu thời điểm giao câu hỏi, đổi dữ liệu, ngoài yêu cầu); tính giờ riêng từng câu (chủ dự án chọn theo tổng).

## Giới hạn cần biết

- Tính giờ làm tăng áp lực: vì vậy có công tắc tắt, mặc định bật theo yêu cầu của chủ dự án.
- Đoán hình hiện có 5 ảnh nhận diện thật (đã duyệt ở stack local), mỗi phiên 3 câu.
- Chưa kiểm trên điện thoại thật; kiểm bằng Chromium và WebKit trên máy Mac.

## Việc để người thực hiện quyết

Tên mô-đun, cách lưu thời gian còn lại, cách báo "ảnh đã tải" từ `QuestionView` lên `Study`, kiểu dáng thanh đếm ngược và công tắc (theo token và kiểu của `study-bar`).
