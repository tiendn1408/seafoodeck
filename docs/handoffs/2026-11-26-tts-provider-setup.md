# Giọng máy cho tên loài: chuẩn bị tài khoản dịch vụ (để dành, chưa làm)

Ngày 26/11/2026. Trạng thái: **chưa có khách nên chưa tạo tài khoản trả phí nào**; đây là ghi chú để làm khi cần. Không có khóa hay mật khẩu nào trong file này.

## Đã chốt

- Cách A (giọng máy trên thiết bị, ghi rõ "giọng máy, tham khảo") và cách B (file giọng sinh sẵn, người duyệt nghe rồi mới coi là chuẩn) cùng làm.
- Admin phải tạo được giọng ngay trên Studio, không cần dev chạy script. Nghĩa là API gọi dịch vụ giọng; khóa chỉ nằm trên API, không xuống trình duyệt.
- Mỗi ngôn ngữ có thể dùng dịch vụ riêng.
- Tên khoa học đọc theo quy ước phổ biến nhất (Anglo-Latin), ghi rõ là quy ước đọc của bộ học.

## Kết quả nghe thử vòng 1 (giọng macOS, người nghe: chủ dự án)

- Tiếng Nhật: Kyoko 8/8 chuẩn, Eddy 4/8, Reed 1/8, Sandy 0/8. Tiếng Anh: Samantha và Eddy 6/6 chuẩn, Flo 3/6. Tên khoa học: nghe được nhưng chưa biết đúng hay không.
- Ghi chú chấm là về độ rõ; trọng âm tiếng Nhật vẫn cần một người nghe được trọng âm duyệt.
- Dữ liệu: trong DB, tiếng Anh (127 tên) và tên khoa học (109 tên) chưa có phiên âm; phiên âm tiếng Nhật (109 tên) chủ yếu là romaji, nên cho máy đọc từ chữ katakana của tên.
- Chưa xác nhận giấy phép dùng giọng macOS để sinh file đưa vào app: không làm trước khi kiểm.

## Dịch vụ miễn phí (theo trang giá, đọc ngày 26/11/2026; xác nhận lại trước khi dùng)

Khoảng 350 tên cần giọng, vài nghìn ký tự; hạn mức miễn phí đều lớn hơn nhiều.

| Dịch vụ | Hạn mức miễn phí | Ghi chú |
|---|---|---|
| Amazon Polly | giọng neural 1 triệu ký tự/tháng, 12 tháng đầu | Có ghi furigana tiếng Nhật và IPA |
| Azure Speech (gói F0) | giọng neural 500 nghìn ký tự/tháng | Nhận IPA; chưa xác nhận tiếng Nhật |
| Google Cloud TTS | Neural2 1 triệu, WaveNet 4 triệu ký tự/tháng | Phải bật thanh toán |

Chưa kiểm: điều kiện đăng ký (thường cần thẻ), điều khoản dùng file giọng trong app, hạn mức Chirp 3 HD (các bản trang giá không khớp nhau).

## Việc làm khi có khách: tạo tài khoản riêng cho dự án (ví dụ Amazon Polly)

Dùng tài khoản/profile **riêng cho Seafood Deck**; không dùng profile của dự án khác. Tên nút trên giao diện AWS có thể khác đi theo thời gian.

1. Đăng nhập AWS bằng tài khoản dự án này. Vào **Billing**, tạo một **Budget** cảnh báo khi chi tiêu vượt khoảng 1 đô/tháng (trần tự bảo vệ).
2. Vào **IAM → Users → Create user**, đặt tên `seafoodeck-tts`. Không cấp quyền console.
3. Gắn **chỉ** quyền gọi Polly (inline policy):

        {
          "Version": "2012-10-17",
          "Statement": [
            {"Effect": "Allow", "Action": ["polly:SynthesizeSpeech", "polly:DescribeVoices"], "Resource": "*"}
          ]
        }

4. Mở user vừa tạo → **Security credentials → Create access key** (chọn dùng cho ứng dụng chạy ngoài AWS). Khóa chỉ hiện một lần.
5. Đặt khóa vào máy của bạn bằng lệnh sau, **tự gõ khóa vào terminal, không dán vào chat**:

        aws configure --profile seafoodeck-tts

   (Region gợi ý: `ap-northeast-1`. Kiểm: `aws polly describe-voices --language-code ja-JP --profile seafoodeck-tts`.)
6. Khi tích hợp vào Studio: khóa này **không** nằm trong repo; vào `.local/pilot.env` trên VPS bằng `sudo -e`, cùng cách như các bí mật khác. Dùng một khóa riêng cho VPS, không dùng chung khóa trên máy cá nhân.

## Khi tích hợp vào Studio (điều kiện an toàn)

- Khóa chỉ nằm trên API. Chỉ vai trò được phép mới bấm tạo; có nhật ký ghi ai tạo giọng cho tên nào.
- Đặt trần chi tiêu ngay trên tài khoản dịch vụ (Budget ở bước 1).
- Kết quả lưu như audio nháp qua đường tải audio sẵn có; chỉ người duyệt mới chuyển thành đã duyệt.
- Dịch vụ lỗi thì vẫn tải MP3 lên tay được; học viên không bị ảnh hưởng vì file đã lưu sẵn.
