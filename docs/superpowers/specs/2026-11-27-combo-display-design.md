# Combo hiển thị cho Ghép tên và cả phiên (giai đoạn 3, phần 2): thiết kế ngắn

Trạng thái: đã duyệt bởi chủ dự án ngày 27/11/2026 (trong hội thoại). Bản demo, chưa có khách. Chủ dự án chọn: cả combo trong một bộ ghép (A) và combo trong cả phiên (B), **chỉ hiển thị, không đổi điểm lưu**.

## Ý định và lý do

Cho người học cảm giác "đang vào guồng" như Duolingo và các app tương tự, không đổi cách chấm. Tham khảo: Duolingo thưởng điểm cho chuỗi đúng liên tiếp (nguồn cộng đồng); Kahoot từng thưởng điểm rồi bỏ từ 2020, chuỗi chỉ còn để khích lệ; một nghiên cứu về lạm dụng gamification ở Duolingo cảnh báo áp lực giữ chuỗi. Vì vậy combo ở đây chỉ hiển thị và không bao giờ phạt.

## Mục tiêu

- **A. Combo trong một bộ ghép:** sau khi nộp, mỗi cặp đúng liên tiếp (theo thứ tự các tên tiếng Việt đang hiện) có nhãn ×2, ×3; một cặp sai làm chuỗi dừng và đếm lại. Chỉ hiện từ ×2.
- **B. Combo cả phiên:** nhãn "Combo ×N" trên thanh màn học khi N ≥ 2, đếm các câu chấm tự động **đúng liên tiếp** trong phiên. Câu bỏ qua và câu tự chấm (flashcard) không tăng và không làm đứt chuỗi. Trả lời sai thì nhãn tắt nhẹ, không có chữ báo mất. Màn tổng kết thêm dòng "Combo cao nhất: ×N" khi N ≥ 2.
- Tính hoàn toàn ở trình duyệt từ kết quả đã có của các câu (`game.questions[i].result`), nên một phiên được khôi phục cho cùng kết quả; không có trạng thái ẩn.

## Không làm

- Không đổi cách chấm, điểm lưu, lịch ôn, tiến độ, API, DB, Docker. Không tăng độ dài phiên Ghép tên (hiện một bộ 3 cặp).
- Không hiện gì về cặp đúng/sai **trước khi nộp** (đáp án không rời máy chủ trước khi nộp).
- Không có âm thanh (hiệu ứng âm thanh đang tắt). Người chọn giảm chuyển động (`prefers-reduced-motion`) không thấy hiệu ứng động.
- Combo không phạt: không có chữ "mất combo", không đổi màu báo lỗi.

## Cách làm (đã cân nhắc)

- **Chọn:** hàm thuần `sessionCombo(questions)` và `pairCombo(verdicts)` trong `apps/web/src/learner/study/combo.ts`, một component `ComboChip`, nối vào `Study.tsx` (thanh màn học và màn tổng kết) và vào khối Ghép tên của `QuestionView.tsx`.
- Loại: lưu combo trên máy chủ hoặc thêm điểm thưởng (đổi API và dữ liệu, ngoài yêu cầu); phiên Ghép tên dài hơn (đổi API).

## Giới hạn cần biết

- Phiên Ghép tên một bộ chỉ cho combo trong bộ (A); combo cả phiên (B) xuất hiện ở các chế độ nhiều câu (Toàn bộ, Ôn tập).
- Chưa kiểm trên điện thoại thật; kiểm bằng Chromium và WebKit trên máy Mac.

## Việc để người thực hiện quyết

Kiểu dáng nhãn và thời gian hiệu ứng (nhẹ, dưới nửa giây, theo token sẵn có), tên lớp CSS, vị trí chính xác của nhãn trên thanh màn học sao cho vừa màn 320 px.
