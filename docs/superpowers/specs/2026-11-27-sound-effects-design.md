# Hiệu ứng âm thanh khi học (giai đoạn 3, phần 1): thiết kế ngắn

Trạng thái: đã duyệt bởi chủ dự án ngày 27/11/2026 (trong hội thoại). Bản demo, chưa có khách. Chủ dự án chọn: bật mặc định, âm lượng mặc định nhỏ, có chỉnh được.

## Ý định và lý do

Người học cảm nhận ngay mình đúng hay sai và khi nào xong phiên, như một trò chơi, không cần đọc chữ. Chỉ phần giao diện: không đổi điểm, lịch ôn, API hay dữ liệu.

## Mục tiêu

- Bốn âm ngắn (dưới nửa giây), êm, tạo bằng Web Audio của trình duyệt (không file, không thư viện, không vướng giấy phép):
  - đúng: hai nốt đi lên, nhẹ;
  - sai: một nốt thấp mềm, không chói;
  - bỏ qua hoặc tự chấm: một tiếng "tách" trung tính;
  - xong phiên: ba nốt ngắn.
- Gắn vào khối phản hồi của mọi chế độ (flashcard, ghép tên, đoán hình, HS, nghe) và màn tổng kết cuối phiên.
- Nút loa trên thanh của màn học mở ra công tắc bật/tắt và thanh âm lượng; lựa chọn nhớ theo từng máy (localStorage, có try/catch, vẫn chạy khi không lưu được).
- Mặc định bật, âm lượng mặc định 25% (rất nhỏ: đỉnh tín hiệu tối đa ở 100% là 0,3, nên mặc định khoảng 0,075).

## Không làm

- Không đổi điểm, lịch ôn, tiến độ, API, DB, Docker. Không âm cho thành tích, combo hay tính giờ (các phần sau của giai đoạn 3).
- Không phát đè lên giọng máy hay bản thu đang phát: hiệu ứng bị bỏ qua khi `speechSynthesis` đang nói hoặc một clip audio đang phát.
- Không báo lỗi khi môi trường không có âm thanh (test, trình duyệt cũ): im lặng.

## Cách làm (đã cân nhắc)

- **Chọn:** Web Audio tổng hợp trong một mô-đun nhỏ (`sfx.ts`), cài đặt riêng (`soundSettings.ts`), một component điều khiển (`SoundControl.tsx`).
- Loại: file âm thanh (phải tìm nguồn và lo giấy phép); thư viện âm thanh (thêm phụ thuộc không cần cho vài tiếng bíp).
- iPhone/Safari chỉ cho phát sau một lần chạm, nhưng kết quả đúng/sai về sau khi chờ máy chủ: tạo và `resume()` AudioContext ở lần `pointerdown`/`keydown` đầu tiên trong màn học, rồi mới phát hiệu ứng.
- Mỗi kết quả phát đúng một lần (khóa theo `questionId`, không phát lại khi điểm tạm thời được thay bằng điểm của máy chủ).

## Giới hạn cần biết

- Công tắc im lặng của iPhone và độ lớn thật trên loa điện thoại chưa kiểm được trong CI; test dùng AudioContext giả. Cần chủ dự án nghe khi test cuối trên điện thoại.
- Phiên được khôi phục đang hiện sẵn một kết quả có thể phát tiếng khi màn dựng lại (nếu cách làm không phân biệt được); chấp nhận được.

## Việc để người thực hiện quyết

Tần số, hình dáng sóng và độ dài chính xác của bốn âm (miễn êm, dưới nửa giây, đỉnh theo quy định trên); cách chia sẻ trạng thái cài đặt giữa các component; kiểu dáng nút loa và cửa sổ nhỏ (theo token và kiểu của `study-bar`).
