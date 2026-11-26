# Giai đoạn 3: trạng thái brainstorm cuối ngày 26/11/2026 (để làm tiếp hôm sau)

Giai đoạn 3 là các tính năng đã nêu ngày 19/11/2026: HS nhiều bước có nhãn "bẫy", tính giờ cho Đoán hình, combo điểm cho Ghép tên, đọc tên bằng giọng máy, hiệu ứng âm thanh. Phase 2.5 (tài khoản, phân quyền, tách Studio, tách tầng web thành `edge` + `web-learner` + `web-studio`) đã xong và đã deploy lên VPS ngày 26/11/2026, mã trên `main` ở origin (`20185cb`).

Đang ở bước: **brainstorm giai đoạn 3, chưa có design, chưa có plan, chưa có code.** Tính năng ưu tiên đầu tiên theo chủ dự án: **đọc tên bằng giọng máy** (cần biết tên đọc thế nào).

## Đã chốt về giọng máy

- Làm cả A (giọng máy trên thiết bị, ghi "giọng máy, tham khảo") và B (file giọng sinh sẵn; người duyệt nghe rồi mới coi là chuẩn).
- Admin tạo giọng ngay trên Studio, không cần dev chạy script (API gọi dịch vụ giọng; khóa chỉ nằm trên API, có trần chi tiêu). **Để dành tới khi có khách và có tài khoản dịch vụ riêng.**
- Mỗi ngôn ngữ có thể dùng dịch vụ riêng.
- Tên khoa học đọc theo quy ước phổ biến nhất (Anglo-Latin), ghi rõ là quy ước đọc của bộ học.
- Chưa dùng AWS/Azure/Google lúc này (chưa có khách). Ghi chú tạo tài khoản: `docs/handoffs/2026-11-26-tts-provider-setup.md`.
- Không dùng profile AWS `reblue-dev` (của dự án khác). Không dùng cổng không chính thức (hệ thống đã chặn thử edge-tts; không đi đường vòng).

## Kết quả nghe thử

- Vòng 1 (giọng macOS; chủ dự án nghe): tiếng Nhật Kyoko 8/8 chuẩn, Eddy 4/8, Reed 1/8, Sandy 0/8; tiếng Anh Samantha và Eddy 6/6, Flo 3/6; tên khoa học: nghe được nhưng chưa biết đúng không. Kết quả thô: `.local/tts-listening/ratings-round1.txt` (ghi chú là về độ rõ, chưa phải trọng âm; vẫn cần người nghe được trọng âm tiếng Nhật duyệt).
- Vòng 2 (Kokoro-82M mã nguồn mở, chạy trên máy): **đã sinh 22 đoạn, chủ dự án CHƯA nghe.** Tiếng Nhật `jf_alpha`, `jm_kumo` (8 tên), tiếng Anh `af_heart` (6 tên). Tài liệu Kokoro tự chấm `jf_alpha` C+ và `jm_kumo` C-, yếu với chuỗi rất ngắn, không có ký hiệu trọng âm. Giấy phép Apache-2.0 (dùng trong sản phẩm được); `jm_kumo` cần ghi công Koniwa. Chưa thử VOICEVOX, Style-BERT-VITS2; Piper không có giọng Nhật.

## Dữ liệu cần nhớ

- DB: tiếng Anh 127 tên và tên khoa học 109 tên **chưa có phiên âm**; tiếng Nhật 109 tên có phiên âm nhưng chủ yếu là romaji. Cho máy đọc từ chữ katakana của tên.
- Chưa xác nhận giấy phép dùng giọng macOS để sinh file đưa vào app: không làm trước khi kiểm.

## Mở lại trang nghe thử

Các file nằm trong thư mục git-ignored `.local/tts-listening/` (không vào git):

    open .local/tts-listening/tts-trial/index.html

Trang có 86 đoạn; chấm Chuẩn / Tạm được / Sai, bấm "Sao chép kết quả" rồi dán vào chat. Kết quả chấm tự lưu trong trình duyệt (localStorage; vòng 1 đã chấm xong, các đoạn Kokoro chưa chấm). Mô hình Kokoro (314 MB) và môi trường Python (1,2 GB) không được lưu; script sinh lại ở `.local/tts-listening/tts-trial2/scripts/kokoro_synth.py` (chạy bằng `python -I`, cần cài lại `kokoro` 0.9.4 và `misaki[ja,en]` trong venv mới).

## Việc làm tiếp (theo thứ tự)

1. Chủ dự án nghe và chấm 22 đoạn Kokoro, dán kết quả.
2. Câu hỏi brainstorm đang chờ: trong bốn tính năng còn lại (HS nhiều bước có "bẫy", tính giờ Đoán hình, combo điểm Ghép tên, hiệu ứng âm thanh) cái nào quan trọng nhất với người mới vào ngành, và vì sao.
3. Từ đó đưa các cách làm, chốt design, rồi plan. Với giọng máy: cách A trước (giọng thiết bị; tiếng Nhật chọn Kyoko khi có và chỉnh tốc độ chậm; tiếng Anh dùng giọng sẵn có).
4. Cách B (admin bấm tạo giọng trên Studio) khi có khách và tài khoản dịch vụ.

## Việc nhỏ khác còn mở (ngoài giai đoạn 3)

Danh sách đầy đủ ở báo cáo rà soát (nội dung khách, audio thật, vận hành, tài liệu cũ); tóm tắt: README và file follow-up 2.5 còn cũ, `deploy/pilot.env.example` mặc định `ALLOW_INTERNAL_DEMO=true`, chưa có CSP/HSTS, chưa có backup ngoài VPS, tài khoản "An" chưa tạo.
