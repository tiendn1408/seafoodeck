# Prompt triển khai Seafood Deck hiện hành

Đọc `PLAN_CUSTOMER_DEMO.md`, `Seafood_Deck_PRD.md` và `AGENTS.md`. Làm trực tiếp app React/TypeScript/Vite; bàn giao Docker/GHCR kiểm thử được. Đối tượng là người mới vào ngành và nhân viên kinh doanh thủy hải sản quốc tế.

1. Bộ demo 6 loài đại diện: cá tuyết Đại Tây Dương, cá ngừ vây vàng, mực ống Trung Hoa, bạch tuộc Đông Á, nghêu Bến Tre, vẹm xanh. Không đưa bộ tôm hoặc minh họa tôm trở lại hành trình khách. Tên Việt có phần diễn giải phải có lưu ý và nguồn; danh mục này không phải catalogue khách xác nhận.
2. Giữ 4 tên Việt–Anh–Nhật–khoa học, nguồn theo từng tên; không biến tên nhóm hoặc bí danh chưa duyệt thành đáp án loài. Giữ tên khoa học và phiên bản nội dung độc lập với tên hiển thị. Không tự bịa audio, ảnh, quyền, mã HS hoặc người duyệt.
3. Bốn chế độ: Flashcard theo loài, Ghép 3 cặp từ bộ 6 loài theo ngôn ngữ chọn, Đoán hình 3 ảnh thật khác nguồn gốc, HS theo quy cách hàng (đủ dữ kiện/thiếu dữ kiện/cùng loài khác dạng hàng). Ảnh AI có nhãn, chỉ minh họa giao diện; không vào bài chấm điểm nhận diện. Chưa duyệt loài thì chỉ demo nội bộ.
4. HS gắn với hồ sơ hàng và danh mục/phiên bản/cấp mã. Bộ hiện tại đối chiếu mã 6 số, không tự nối thành 8 số hoặc coi mã cố định của loài. Phân biệt unknown với false; bài thiếu dữ kiện cần hai bước.
5. Audio/hướng dẫn đọc kiểm kê đủ 18 mục cho 6 loài × Anh/Nhật/khoa học. File hợp lệ có thì tích hợp; thiếu thì hiển thị thiếu, không dùng clip giả để hoàn tất. Bản public yêu cầu nguồn và người duyệt thật; thiếu người duyệt không chặn sửa code/tích hợp/kiểm nội bộ.
6. Thiết kế mang DNA ngành cả khi tắt ảnh: nhóm hàng, tên thương mại, nhận diện nguyên liệu và quy cách. Header gọn, trang học/thư viện/ôn/tiến độ riêng; flashcard vừa màn 320×568/360×640/390×740 ở cỡ chữ mặc định, không ép bằng cắt nội dung hoặc chữ quá nhỏ. Icon SVG, không emoji.
7. Giữ phiên/tiến độ có version, reload không đổi câu/lựa chọn/kết quả. Không cộng điểm hoặc tự chuyển câu khi nộp kép. Ảnh lỗi bỏ qua không tính đã trả lời. Tách lịch sử bộ cũ; không gán lại ID tôm sang loài mới.
8. Chạy validator, test logic, typecheck/lint/build/format và E2E cả 4 chế độ trên chính container cuối. Kiểm ảnh tắt/bị lỗi, thiếu audio, mobile, storage và ôn lỗi. Báo đúng kết quả thực tế và giới hạn, không báo pass khi chưa chạy.
9. Bàn giao một image tag mới linux/amd64, push GHCR và xác minh digest, kèm lệnh cập nhật/rollback chạy tay. Không deploy VPS, không CI/CD, ZIP hoặc prototype riêng. Inbox/outbox xử lý xong thì dọn theo quy ước; chỉ lưu outbox khi cần chuyển bên khác.
