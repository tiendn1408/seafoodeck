# Kế hoạch demo khách hàng — Seafood Deck

Trạng thái: đã triển khai bản demo nội bộ 0.5.0 trên repo, kiểm thử container và publish GHCR ngày 2026-11-17. Kết quả thực tế, tài sản còn thiếu và lệnh cập nhật ở [báo cáo bàn giao](DELIVERY_0.5.0.md). Chưa deploy VPS; chưa duyệt public. Các tiêu chí dưới đây giữ làm đối chiếu, không phải xác nhận mọi tài sản đã đủ.

## 1. Các quyết định đã chốt

- Người học: người mới vào ngành và nhân viên kinh doanh thủy hải sản.
- Bối cảnh: giao dịch quốc tế nói chung. Giữ bốn tên gọi **Việt, Anh, Nhật, khoa học**; không hỏi lại yêu cầu ngôn ngữ hoặc tự thêm ngôn ngữ.
- Khách không kinh doanh tôm. Các nhóm khách đã nêu: mực, bạch tuộc, cá thịt trắng, cá thịt đỏ, nghêu, vẹm. Chưa có danh mục loài hoặc catalogue của khách; dữ liệu demo không được nhận là hàng khách đang bán.
- Phản hồi cần giải quyết: dữ liệu hiện tại không phù hợp, UI/UX và bản sắc ngành chưa đạt. Chưa có danh sách sửa từng dòng dữ liệu; không tự suy ra khách đã xác nhận một tên loài, mã hoặc nguồn nào.
- Định vị: **công cụ học nghiệp vụ thủy hải sản thương mại**, có ngoại ngữ; bản sắc phải hiện diện cả khi tắt ảnh.
- Tiếp tục dùng app React/TypeScript/Vite hiện tại, lưu tiến độ trên thiết bị, bốn chế độ: Flashcard, Ghép tên, Đoán hình, HS. Giữ header gọn và màn học tập trung đã có.
- Bàn giao một bản Docker mới qua GHCR `ghcr.io/tiendn1408/seafoodeck`; người dùng cập nhật VPS bằng tay. Domain giữ `seafoodeck.tiendn.io.vn`.

Kế hoạch này điều chỉnh phạm vi so với yêu cầu cũ về lát cắt Tôm sú trong PRD/build prompt. Các quy tắc chất lượng dữ liệu, âm thanh, chấm điểm và lưu phiên của PRD vẫn giữ. Khi triển khai, đồng bộ tài liệu hiện hành để không tiếp tục bị yêu cầu cũ kéo trở lại bộ tôm; báo cáo phát hành cũ giữ làm lịch sử.

## 2. Phạm vi demo và nguyên tắc dữ liệu

Mục tiêu là **6 loài đại diện**, mỗi nhóm dưới đây một loài cụ thể, đủ nhỏ để kiểm chứng mà vẫn thể hiện mặt hàng khách quan tâm:

| Nhánh trình bày      | Loài đại diện trong demo | Điều kiện chọn                                             |
| -------------------- | ------------------------ | ---------------------------------------------------------- |
| Mực                  | 1 loài                   | Khớp tên khoa học, tên thương mại và ảnh nguồn             |
| Bạch tuộc            | 1 loài                   | Không dùng tên nhóm như tên của mọi loài bạch tuộc         |
| Cá — nhóm thịt trắng | 1 loài                   | Loài cụ thể có căn cứ; ghi nguồn cho thuộc tính thương mại |
| Cá — nhóm thịt đỏ    | 1 loài                   | Không suy ra loài, HS hay tính chất hàng chỉ từ màu thịt   |
| Nghêu                | 1 loài                   | Phân biệt tên địa phương/tên thương mại với tên loài       |
| Vẹm                  | 1 loài                   | Có đối chiếu định danh và cách gọi Anh–Nhật                |

Đây là mục tiêu biên tập cho demo, không phải xác nhận cơ cấu phân loại hay danh mục của khách. Mực/bạch tuộc/cá/hai mảnh vỏ là cách tổ chức nhóm; “thịt trắng/thịt đỏ” là thuộc tính thương mại riêng. Nhãn nhóm không thay `speciesId` hoặc tên khoa học. Chưa chốt tên loài cụ thể trong kế hoạch; chọn sau khi kiểm nguồn, không chọn chỉ vì dễ tìm ảnh đẹp.

Mỗi loài có 4 tên gọi, nguồn theo từng mục, bí danh tách riêng, dấu hiệu phân biệt có căn cứ và các ví dụ dạng hàng được ghi rõ là ví dụ. Tổng dự kiến: **24 mục tên gọi, 18 mục phát âm Anh–Nhật–khoa học**. Chưa có audio thì báo thiếu thật; không dùng clip giả hoặc gán trạng thái hoàn thành.

Tách ba mức: tài sản/dữ liệu đã kiểm nguồn; nội dung nội bộ còn chờ chuyên gia; nội dung đã duyệt phát hành. Kiểm nguồn không tự đồng nghĩa có người duyệt. Không đặt tên reviewer, ngày duyệt hoặc quyền sử dụng khi chưa có bằng chứng.

## 3. Thứ tự triển khai

### Bước 1 — Đổi nền dữ liệu và gỡ phụ thuộc tôm

1. Tách fixtures ba loài tôm và HS cũ khỏi bộ khách nhìn thấy, giữ chúng trong vùng kiểm thử/lịch sử cần thiết. Không xóa hồ sơ nguồn hoặc đổi ID tôm thành ID loài khác.
2. Tạo bộ demo mới có version và ID ổn định; phân tách dữ liệu với component để sau này thay catalogue khách không phải dựng lại app.
3. Kiểm nguồn cho sáu loài đại diện: định danh khoa học, Việt–Anh–Nhật, khác biệt giữa tên loài và tên hàng, độ phù hợp của ảnh. Ghi rõ điểm chưa chắc, không lấy câu trả lời AI làm bằng chứng nguồn.
4. Gỡ chuỗi, lựa chọn và mặc định phụ thuộc `black-tiger`/“Tôm thương mại” trong UI và session. Cập nhật validator và bài kiểm dữ liệu.
5. Cô lập tiến độ theo bộ nội dung/version. Lịch sử tôm được giữ nhưng không cộng vào thống kê, lịch ôn hoặc đáp án của bộ mới. Phiên cũ có thông báo nội dung thay đổi và lối mở phiên mới; không âm thầm gán lại loài.
6. Cập nhật phần phạm vi hiện hành của PRD/build prompt/README theo quyết định mới, giữ các ví dụ tôm chỉ như lịch sử/fixtures nếu còn cần.

**Đạt khi:** dữ liệu mới truy vết được nguồn; app không còn chọn tôm mặc định hoặc hiện tôm trong luồng demo khách; dữ liệu cũ không làm sai tiến độ mới.

### Bước 2 — Xây hệ thống nhận diện trước khi làm hàng loạt ảnh

Dùng `frontend-design` cho định hướng và `web-design-guidelines` cho rà soát tương tác. Chưa cần cài thêm skill.

- Tính cách: rõ, chính xác, gần công việc hàng hóa; tránh cảm giác ứng dụng học tiếng Anh, game trẻ em hoặc website du lịch biển.
- Màu dự kiến: xanh biển sâu `#123F45`, xanh nước `#A4C6BD`, nền khoáng sáng `#F1F4ED`, chữ đậm `#17353D`, điểm nhấn san hô tiết chế `#C87552`. Kiểm tương phản thực tế trước khi chốt.
- Chữ: ưu tiên font hiện có hỗ trợ tiếng Việt; một hệ cỡ/độ đậm dễ đọc. Tên khoa học có quy tắc riêng, không dùng kiểu chữ trang trí làm khó đọc.
- Bản sắc nằm ở nhóm hàng, từ vựng tác vụ, cấu trúc hồ sơ, các dữ kiện lô hàng và ký hiệu ngành nhất quán. Không lấy riêng tôm, cá hoặc biểu tượng sóng làm toàn bộ nhận diện.
- Hồ sơ chia thông tin: tên loài/tên thương mại; điểm phân biệt; ví dụ dạng hàng/quy cách; nguồn và trạng thái. Phân biệt dữ kiện mô tả với thuộc tính thực sự ảnh hưởng bài HS.
- Giao diện hỏi và giúp người học làm việc cụ thể: nhận diện nguyên liệu, đối chiếu tên hàng, đọc dạng hàng, biết khi nào cần hỏi thêm dữ kiện.

Khung trang:

```text
Header: Seafood Deck | Học tập | Thư viện | Ôn tập | Tiến độ

Học tập: bộ hàng đang học + tiếp tục phiên + 4 lựa chọn ngắn
Thư viện: nhóm hàng/tìm kiếm -> hồ sơ loài và tên thương mại
Phiên học: ngữ cảnh ngắn -> 1 tác vụ -> phản hồi -> hành động tiếp
Tiến độ: kết quả theo kỹ năng và bộ nội dung
```

Mỗi chế độ giữ tên quen thuộc nhưng gắn ngữ cảnh ngành, ví dụ “Flashcard — Tên gọi loài”, “Ghép tên thương mại”, “Đoán hình — Nhận diện nguyên liệu”, “HS theo dạng hàng”. Không thêm một dashboard dài vào trang học.

**Kiểm DNA trước khi mở rộng:** tắt mọi ảnh/ảnh nền, xem desktop và mobile; màn hình vẫn nói rõ học thủy hải sản, hiển thị được nhóm hàng và tác vụ chuyên ngành, không chỉ còn nhãn ngôn ngữ cùng các ô từ vựng. Nếu chưa đạt thì sửa bố cục/chữ/ký hiệu, chưa dùng ảnh đẹp để che vấn đề.

### Bước 3 — Làm bộ hình có chủ đích và hồ sơ tài sản

Ảnh tôm AI đã tạo trong lượt brainstorm dừng trước đó chưa được tích hợp; không dùng làm nhận diện sản phẩm mới.

| Loại tài sản                                  | Dùng ở đâu                                   | Điều kiện                                                                        |
| --------------------------------------------- | -------------------------------------------- | -------------------------------------------------------------------------------- |
| Minh họa AI về nhóm hàng/bối cảnh nghề nghiệp | Trang học, giới thiệu nhóm, trạng thái trống | Nhãn AI trong metadata nội bộ; minh họa 2D trang trí không cần caption UI theo cập nhật 0.5.1; không đưa vào bài chấm điểm nhận diện |
| Ảnh thật đã kiểm loài và quyền                | Hồ sơ, ứng viên bài nhận diện                | Ghi nguồn, tác giả, license, ID ảnh gốc; duyệt mục đích nhận diện riêng          |
| Ảnh chưa rõ loài/quyền                        | Hồ sơ chờ xử lý                              | Không tự gán ID hoặc đưa vào bộ khách chơi; ghi mục cần duyệt                    |

1. Chốt một phong cách minh họa chuyên nghiệp phù hợp hệ nhận diện ở bước 2, với các nhóm hàng cân bằng; không làm bộ ảnh xoay quanh một con vật.
2. Tạo một hình đại diện để tự kiểm chất lượng ở kích thước mobile trước, sau đó mới làm các tài sản thực sự cần. Không sinh ảnh hàng loạt chỉ để lấp bốn ô.
3. Dùng `imagegen` cho minh họa raster; icon/ký hiệu dùng SVG nhất quán, không emoji. AI không tạo đáp án chuẩn, mã HS hoặc bằng chứng nguồn.
4. Lưu minh họa cuối cùng cùng app, metadata riêng gồm prompt, công cụ, nhãn AI, mục đích và trạng thái. Phân biệt duyệt thẩm mỹ với duyệt định danh; không thêm minh họa vào allowlist nhận diện.
5. Chọn ảnh thật có loài/phạm vi quyền phù hợp cho bài Đoán hình; kiểm ảnh khi thu nhỏ, góc nhìn và dấu hiệu đủ thấy. Crop/biến thể của một ảnh không được tính là ảnh gốc mới.

**Đạt khi:** hình nhất quán và đọc được trên mobile; không có tôm trong bộ khách; minh họa AI và ảnh thật không lẫn vai trò; app không gọi mạng lấy ảnh lúc chơi.

### Bước 4 — Tích hợp bốn chế độ và nội dung nghiệp vụ

**Flashcard:** chọn loài/nhóm học, ôn Anh–Nhật–khoa học, lật và tự đánh giá; có phiên âm/hướng dẫn đọc theo nguồn. Kiểm kê 18 mục audio, hướng dẫn đọc và duyệt riêng. Tích hợp file hợp lệ đã có; thiếu thì báo đúng mục thiếu, vẫn cho chạy demo.

**Ghép tên:** mỗi bàn 3 cặp từ bộ sáu loài, đổi được hướng Việt–Anh/Nhật/khoa học. Chọn cặp có tên/đáp án phân biệt được; bí danh có thể trùng giữa loài không tự trở thành đáp án đúng. Không chỉ lấy cố định ba loài đầu.

**Đoán hình:** mục tiêu 1 lượt **3 câu**, ba ảnh gốc khác nhau, từ các loài thuộc bộ mới. Bộ dựng câu lọc theo ảnh hợp lệ, không mặc định lấy ba loài đầu hoặc ảnh AI. Nếu thiếu ảnh đã duyệt nhận diện, vẫn kiểm thử nội bộ bằng ứng viên có nguồn/quyền và nhãn chưa duyệt, không trình bày là bộ đánh giá đã xác thực. Nếu chưa đủ ba ứng viên có căn cứ thì hiển thị trạng thái thiếu ảnh, không lặp ảnh hoặc thay bằng AI để giả đủ lượt. Thiếu tài sản không chặn hoàn thiện code và các phần khác.

**HS theo dạng hàng:** thay nội dung khách nhìn thấy bằng ít nhất 3 tình huống liên quan bộ mới: đủ dữ kiện, thiếu dữ kiện và cùng loài khác quy cách dẫn đến kết quả khác khi đã có nguồn chứng minh. Mô hình hiện thiên về `headRemoved` của tôm; mở rộng dữ kiện theo hàng được chọn, như nguyên con/phi lê, thân/xúc tu, có vỏ/tách vỏ, bảo quản, nấu chín/tẩm ướp. Chỉ dùng dữ kiện có ý nghĩa trong đúng tình huống.

- Mỗi đề ghi thị trường, danh mục, phiên bản và cấp mã. Bối cảnh kinh doanh quốc tế không đồng nghĩa một mã 8 số dùng chung toàn cầu; giữ danh mục Việt Nam theo PRD nếu không có quyết định đổi.
- Đối chiếu văn bản và dòng mã trước khi đưa vào câu hỏi. Không tái dùng mã tôm, bịa mã nhiễu hoặc gọi mã nhóm là mã chính xác của loài.
- Nếu nguồn mới đủ cấp 6 số, thiết kế đề đúng cấp đó; không tự nối thêm hai số. Nếu chưa kiểm được mã, giữ bài thực hành đọc dữ kiện có nhãn rõ, báo phần HS còn thiếu; không đổi nhãn bài để tuyên bố đã hoàn tất bài chấm mã.
- Thiếu người duyệt không chặn tích hợp/kiểm thử nội bộ, nhưng không mở bộ public hoặc tuyên bố được duyệt.

**Đạt khi:** mỗi chế độ dùng nội dung bộ mới, nguồn/lời giải đúng phạm vi, lựa chọn ngôn ngữ và loài tác động đúng câu hỏi; không còn demo tôm trá hình hoặc hình đẹp che dữ liệu sai.

### Bước 5 — Nghiệm thu thiết kế, dữ liệu và lượt học

| Phần kiểm           | Tiêu chí thực tế                                                                                                                                                      |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DNA không dùng ảnh  | Tắt ảnh vẫn nhận ra ngành nhờ nhóm hàng, tên tác vụ, hồ sơ và dữ kiện nghiệp vụ                                                                                       |
| Đọc trên điện thoại | Kiểm 320×568, 360×640, 390×740; chữ rõ, không tràn ngang; không thu chữ quá nhỏ để ép vừa                                                                             |
| Flashcard           | Thẻ, lật, đánh giá và tiếp tục nằm trong màn hình ở cỡ chữ mặc định; kiểm tên dài và trạng thái thiếu audio. Zoom lớn/đọc tài liệu được phép cuộn, không cắt nội dung |
| Bốn chế độ          | Đi hết lượt, có tổng kết, ôn lỗi, lịch ôn theo kỹ năng; tập câu/nhóm không cố định sai                                                                                |
| Độ bền phiên        | Reload giữ đúng loài/câu/lựa chọn; nộp kép không thêm điểm hoặc chuyển câu; ảnh lỗi bỏ qua không tính đã trả lời                                                      |
| Dữ liệu mới/cũ      | Không kế thừa đáp án, loài hoặc thống kê tôm sang bộ mới; phiên version cũ xử lý rõ ràng                                                                              |
| Media               | Ảnh đóng gói, không fallback mạng; AI không lọt vào bài nhận diện; nghe được file thật nếu có và báo thiếu/lỗi đúng                                                   |
| HS                  | Đúng nguồn, danh mục/cấp mã, phân biệt unknown với false; bài thiếu dữ kiện có bước hỏi thêm                                                                          |
| Khả năng tiếp cận   | Bàn phím, focus thấy được, tên nút/icon, vùng chạm, tương phản; không dùng emoji thay nhãn chức năng                                                                  |
| Build               | Typecheck, lint, test logic, format-check và build pass; cập nhật các E2E còn bám vào tên tôm                                                                         |

Chạy toàn bộ lượt kiểm trên chính container cuối cùng, có screenshot để xem lại desktop/mobile và phiên bản tắt ảnh. Phân biệt mô phỏng viewport với thử thiết bị thật; không báo đã thử máy thật khi chưa thử.

### Bước 6 — Bàn giao một bản chạy

1. Build Docker linux/amd64 bằng tag mới, không ghi đè tag cũ.
2. Mở chính container, kiểm health và hoàn tất bốn chế độ theo mức dữ liệu/tài sản thực tế có; báo chính xác chế độ nào còn thiếu tài sản hoặc duyệt, không che bằng fixture sai.
3. Push GHCR sau khi kiểm thử, đọc lại manifest/digest, cập nhật cấu hình mẫu và lệnh cập nhật/rollback thủ công.
4. Báo cáo gộp: tag/digest, bản chạy, số loài/tên gọi, ảnh thật/AI/đã duyệt, audio/hướng dẫn đọc/đã duyệt, HS và phần còn thiếu. Không tạo ZIP, prototype riêng hoặc các file giao người dùng chuyển tiếp.
5. Không deploy đè VPS. Nội dung public vẫn cần người duyệt và điều kiện của PRD; bản demo nội bộ không được đổi nhãn thành dữ liệu khách xác nhận.
6. Khi có đầu vào mới, xử lý xong thì lưu phần cần giữ vào archive, xóa phần thừa, dọn inbox/outbox theo quy ước. Chỉ tạo outbox khi thực sự cần chuyển bên khác; kế hoạch và báo cáo nội bộ nằm trong docs/chat.

## 4. Những việc không mở rộng trong lượt demo

Không thêm đăng nhập/backend, dịch tự động lúc chơi, sinh câu hỏi/mã HS trực tiếp bằng AI, nhận diện ảnh người dùng tải lên, chấm phát âm, đồng bộ đa thiết bị, mười loài hoặc toàn bộ danh mục của khách. Không hỏi lại bộ ngôn ngữ hay chờ catalogue mới bắt đầu.

## 5. Mốc hoàn thành và cách xử lý thiếu đầu vào

Thứ tự bắt buộc: **dữ liệu và cấu trúc nhóm → hệ nhận diện qua được kiểm tắt ảnh → hình phù hợp → tích hợp và chấm điểm → kiểm container → GHCR**. Có thể nghiên cứu nguồn song song với phác bố cục, nhưng không làm hàng loạt minh họa trước khi chốt nội dung.

Chỉ gọi là bản demo khách hoàn chỉnh khi bộ dữ liệu thay thế và các chế độ đã chạy theo tiêu chí trên, không còn tôm trong hành trình khách. Nếu thiếu ảnh thật, audio hoặc người duyệt, vẫn bàn giao phần đã làm được; nêu rõ giới hạn và trạng thái nội bộ, không báo hoàn tất hạng mục còn thiếu. Các quyết định thực hiện thông thường tự xử lý theo kế hoạch; chỉ hỏi lại khi có lựa chọn làm thay đổi phạm vi hoặc ý nghĩa nghiệp vụ mà nguồn không giải quyết được.
