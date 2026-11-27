# Giọng máy trên thiết bị (cách A): thiết kế ngắn

Trạng thái: đã duyệt bởi chủ dự án ngày 27/11/2026 (trong hội thoại). Bản demo, chưa có khách.

## Ý định và lý do

Người mới vào ngành cần biết một tên loài được đọc thế nào. Hiện chưa có audio thật đã duyệt (0/18), nên nhiều tên chỉ có chữ. Cách A cho nghe ngay bằng giọng đọc có sẵn của trình duyệt/thiết bị, ghi rõ là giọng máy tham khảo, không cần API, DB, VPS hay dịch vụ ngoài.

## Mục tiêu

- Nút "Nghe" bằng giọng máy cho tên tiếng Anh, tiếng Nhật và tên khoa học, ở hồ sơ loài (Profile) và ở mặt lật của flashcard (QuestionView).
- Chỉ sửa phần web. Không migration, không đổi API, không đổi VPS.

## Không làm (non-goals / anti-goals)

- Không dùng giọng máy trong bài **Nghe** (listening) hay ở bất kỳ chỗ nào tính điểm; bài Nghe chỉ dùng audio đã duyệt (PRD).
- Không bao giờ coi giọng máy là "đã duyệt" hay lưu nó như audio. Không có tên tiếng Việt (người học không cần).
- Không gọi dịch vụ ngoài, không tải file giọng. Cách B (file giọng sinh sẵn, admin bấm tạo trên Studio) để dành tới khi có khách; xem `docs/handoffs/2026-11-26-tts-provider-setup.md`.
- Không làm hỏng khi thiết bị không có giọng phù hợp: nút ẩn, không báo lỗi.

## Hành vi

- Văn bản đọc: tiếng Nhật đọc chữ katakana của tên (nhãn tên); tiếng Anh đọc nhãn tên; tên khoa học đọc nhãn bằng giọng tiếng Anh Mỹ (quy ước Anglo-Latin của bộ học). Chuẩn hóa văn bản trước khi đọc: `/` thành `、` (ví dụ `ウニ / ムラサキウニ`), ` sp.` ở cuối thành ` species`.
- Chọn giọng: tiếng Nhật ưu tiên giọng tên Kyoko nếu có, không thì giọng `ja-JP` đầu tiên; tiếng Anh ưu tiên `en-US`; không có giọng nào của ngôn ngữ đó thì ẩn nút. Danh sách giọng nạp trễ trên nhiều trình duyệt, phải nghe sự kiện `voiceschanged`.
- Tốc độ: hai mức như trình phát hiện có. Tiếng Nhật 0,85 / chậm 0,65 (Kyoko bị nhận xét "hơi nhanh"); tiếng Anh và tên khoa học 1 / chậm 0,75.
- Nhãn "Giọng máy, tham khảo" luôn hiện cạnh nút. Trạng thái "Đang đọc" / "Đã đọc xong" cho trình đọc màn hình (`role="status"`).
- Một âm thanh tại một thời điểm: bắt đầu giọng máy thì dừng clip audio đang phát (`stopAudio`), phát clip thì hủy giọng máy; rời màn hình hoặc đổi thẻ thì hủy.
- Khi có audio đã duyệt cho tên đó, hiện **chỉ** audio đã duyệt (chuẩn đứng trước); giọng máy chỉ hiện khi chưa có bản thu đã duyệt. (Quyết định của người thiết kế, chủ dự án có thể đổi.)

## Cách làm (đã cân nhắc)

- **Chọn:** Web Speech API (`speechSynthesis`) trong một mô-đun nhỏ + một component, nối vào Profile và flashcard.
- Loại: sinh file ở máy chủ (Kokoro hay dịch vụ đám mây): VPS 1 CPU / 1,9 GB RAM quá nhỏ, và chưa có khách. Loại: thư viện TTS chạy trong trình duyệt (WASM): nặng, không cần cho demo.
- Kết quả nghe thử ngày 26-27/11/2026 (giọng macOS, chủ dự án nghe): tiếng Nhật Kyoko 8/8 chuẩn; tiếng Anh Samantha/Eddy 6/6; tên khoa học nghe được nhưng chưa biết đúng.

## Giới hạn cần biết

- Giọng khác nhau theo máy; Android/Windows chưa kiểm. Trình duyệt chỉ đọc văn bản thường (SSML/IPA không chắc được hỗ trợ), nên không dùng phiên âm IPA làm đầu vào.
- Độ đúng trọng âm tiếng Nhật chưa được người nghe được trọng âm xác nhận (nhận xét hiện tại là về độ rõ).
- Không kiểm được trên máy thật trong CI; test dùng `speechSynthesis` giả. Cần chủ dự án nghe thử trên điện thoại.

## Việc để người thực hiện quyết

Tên mô-đun/component, cách giữ trạng thái đang đọc, cách mô phỏng `speechSynthesis` trong test, kiểu dáng nút (theo trình phát hiện có trong `apps/web/src/pilot/Media.tsx`).
