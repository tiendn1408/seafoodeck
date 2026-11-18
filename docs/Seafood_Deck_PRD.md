> Bản online 0.6 hiện hành: xem [bàn giao](DELIVERY_0.6.0.md), [triển khai VPS](DEPLOY_PILOT.md) và hai tài liệu trong `docs/requirements/`. Nội dung dưới đây giữ làm lịch sử baseline; cấu hình một web HTML/static không đủ cho pilot API/DB/S3.

# Seafood Deck — Đặc tả sản phẩm MVP

**Phạm vi hiện hành — 2026-11-17:** demo 6 loài cho người mới và nhân viên kinh doanh thủy hải sản quốc tế, không có tôm (áp dụng cho bộ demo 6 loài; kho prototype nhập sau có thể gồm tôm, xem [docs/sources/prototype-import](sources/prototype-import/README.md)). Quyết định mới theo [PLAN_CUSTOMER_DEMO.md](PLAN_CUSTOMER_DEMO.md). Giữ Việt–Anh–Nhật–khoa học, bốn chế độ và cổng public đóng khi chưa đủ duyệt. Các ví dụ tôm cũ là fixtures lịch sử, không phải nội dung app hiện tại.

**Đối tượng:** Product, Design, Engineering, QA và người duyệt nội dung.  
**Mục tiêu:** người Việt mới làm trong ngành thủy sản, mua hàng hoặc xuất nhập khẩu có thể liên kết bốn tên gọi của một loài, nghe cách đọc và luyện phân loại HS theo mô tả hàng. Đây là công cụ học, không phải công cụ xác định mã khai báo cho lô hàng thật.

## 1. Quyết định sản phẩm

- **Tách loài khỏi tình huống hàng hóa.** Hồ sơ loài lưu tên Việt, Anh, Nhật và khoa học. HS gắn với từng tình huống hàng hóa và phiên bản danh mục, không phải thuộc tính cố định của loài. Ở hồ sơ loài, ô thứ năm là **Xem HS theo dạng hàng**.
- **Âm thanh và phiên âm: audio đã duyệt bắt buộc cho bài nghe, không bắt buộc để xuất bản mục.** Bài nghe chỉ dùng tên có file audio đã duyệt cho đúng tên đó (Anh, Nhật, khoa học); phiên âm/hướng dẫn đọc là nội dung riêng, chưa được bài nghe kiểm tra. Mục chưa có audio vẫn xuất bản được cho các bài không cần nghe. Audio tiếng Việt là tùy chọn.
- **Ảnh bổ sung sau.** Không chặn flashcard, ghép tên hoặc HS vì thiếu ảnh. Có thể dùng ảnh sinh làm minh họa, có nhãn và qua duyệt. Đoán hình ưu tiên ảnh thật có quyền sử dụng; chỉ dùng ảnh nếu người duyệt xác nhận đúng loài và đủ đặc điểm nhận diện.
- **Phạm vi:** web mobile-first, giao diện Việt, không bắt đăng ký, lưu phiên và tiến độ trên thiết bị. Bộ hiện hành: 6 loài đại diện cho mực, bạch tuộc, cá thịt trắng/thịt đỏ, nghêu và vẹm; 3 tình huống HS dạng hàng. Dữ liệu mẫu không phải catalogue khách, sẽ cập nhật khi có dữ liệu khách.
- **Ngoài MVP:** chấm phát âm qua mic, nhận diện ảnh tải lên, thuế và tư vấn khai báo, đồng bộ đa thiết bị, bảng xếp hạng. Học tên Nhật không có nghĩa là dùng biểu thuế Nhật; bài HS đầu tiên dùng danh mục Việt Nam được ghi trên đề.

## 2. Luồng người dùng

**Trang chủ → Học tên mới hoặc Ôn đến hạn → Trả lời → Phản hồi → Tổng kết → Ôn lỗi.** Trang chủ hiển thị số mục đến hạn, kỹ năng hay sai, thư viện và lối vào từng chế độ. Lượt học mới giới thiệu 1–2 loài; lượt luyện mặc định tối đa 8 câu, có thể thoát và tiếp tục. Thư viện tìm theo cả bốn loại tên và bí danh đã duyệt, nhưng bí danh tìm được không mặc định là đáp án đúng.

| Chế độ       | Hành vi và điều kiện nghiệm thu                                                                                                                                                                                                                                                                       |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Flashcard    | Hiện một tên gợi ý và ngôn ngữ đích; người học tự nhớ, lật thẻ, nghe và chọn **Chưa nhớ / Đã nhớ**. Khi luyện nghe, phát audio rồi chọn đúng loài; nhãn nút không lộ đáp án. Không tự phát khi lật thẻ.                                                                                               |
| Ghép tên     | Mỗi bàn 3 cặp, một hướng Việt–Anh, Việt–Nhật hoặc Việt–khoa học. Chạm hoặc dùng bàn phím để chọn hai thẻ; ghép sai thì bỏ chọn hai thẻ. Không bắt kéo thả. Nếu dữ liệu không tạo được 3 cặp duy nhất, không dựng bàn lỗi.                                                                             |
| Thử thách HS | Mô tả hàng và danh mục/phiên bản/cấp mã → chọn mã hoặc **Chưa đủ thông tin**. Với đề thiếu dữ kiện, phải chọn thêm chi tiết cần hỏi để được tính đúng. Sau khi nộp, giải thích dữ kiện quyết định, vì sao lựa chọn gần giống không phù hợp và dẫn nguồn. Không sinh đáp án/mã nhiễu bằng AI lúc chơi. |
| Đoán hình    | Ảnh đã duyệt → chọn tên theo ngôn ngữ đề hỏi → xem dấu hiệu phân biệt. Không làm lộ đáp án qua tên tệp, caption hoặc nhãn đọc màn hình; có bài thay thế không dùng ảnh. Thiếu ảnh hoặc ảnh lỗi thì chuyển bài, không tính sai. Chỉ bật chế độ khi bộ ảnh đủ để dựng một lượt hợp lệ.                  |

Bản đầu ưu tiên chọn đáp án; nhập tên hoặc mã từ trí nhớ là mức khó sau. Khi kiểm tra mặt chữ Nhật, chỉ nhận chữ Nhật và biến thể đã duyệt; romaji chỉ dùng khi mục tiêu là luyện đọc. Tổng kết tách kết quả lần đầu, lần làm lại và tự đánh giá.

## 3. Bộ demo thủy hải sản thương mại hiện hành

| Loài mẫu               | Tên khoa học         | Nhóm thương mại |
| ---------------------- | -------------------- | --------------- |
| Cá tuyết Đại Tây Dương | Gadus morhua         | Cá thịt trắng   |
| Cá ngừ vây vàng        | Thunnus albacares    | Cá thịt đỏ      |
| Mực ống Trung Hoa      | Uroteuthis chinensis | Mực ống         |
| Bạch tuộc Đông Á       | Octopus sinensis     | Bạch tuộc       |
| Nghêu Bến Tre          | Meretrix lyrata      | Nghêu           |
| Vẹm xanh               | Perna viridis        | Vẹm             |

Tên Việt Cá tuyết Đại Tây Dương và Bạch tuộc Đông Á có phần diễn giải biên tập, chưa duyệt tên thương mại; phải hiển thị lưu ý và dẫn nguồn đúng, không coi là tên khách xác nhận. Thịt trắng/đỏ là thuộc tính thương mại, không thay định danh loài. Tên Nhật/khoa học đối chiếu tài liệu cập nhật, không tự gán マダコ về O. vulgaris bằng nguồn cũ.

Ba bài HS cùng loài Thunnus albacares: nguyên con đông lạnh (0303.42), thiếu dạng hàng (cần hỏi nguyên con/phi lê), phi lê đông lạnh (0304.87). Dùng cấp 6 số từ bản HS 2022 trong phụ lục nguồn Việt Nam, không tự suy ra cấp 8 số. Nguồn và giới hạn nằm trong `src/data/customer.ts` và `docs/sources/customer-demo/README.md`; chưa duyệt nghiệp vụ/hiệu lực hiện hành.

Giữ fixtures tôm cũ trong `src/data/demo.ts`, `src/data/imageMedia.ts`, `test-fixtures/legacy-shrimp/` để kiểm hồi quy. App hiện hành import `customerPack`, không nhập fixtures này; lịch sử bộ cũ không góp vào tiến độ bộ mới.

## 4. Media và trạng thái lỗi

**Audio:** Anh dùng giọng Anh–Mỹ nhất quán và IPA tương ứng; Nhật dùng kana và romaji; tên khoa học có chỉ dẫn tách âm/trọng âm khớp file nghe, ghi rõ là quy ước đọc của bộ học, không tuyên bố duy nhất. TTS có thể dùng làm nháp cho Anh/Nhật; không coi giọng máy chưa duyệt là bản chuẩn. Player phát tốc độ thường/chậm, chỉ một clip tại một thời điểm. Khi lỗi, báo “Không phát được âm thanh — thử lại”; bài nghe cho bỏ qua, không trừ điểm.

**Ảnh:** phân riêng `species_photo`, `product_photo`, `illustration`; lưu nguồn, quyền sử dụng, nhãn AI, trạng thái và mục đích được duyệt. Ảnh minh họa không mặc định dùng cho bài nhận diện. Ảnh loài không thay thế mô tả lô hàng trong bài HS. Khi chưa bật chế độ, có thể hiện “Bộ ảnh đang được bổ sung” và dẫn sang Ghép tên. Không phụ thuộc dịch vụ sinh ảnh để chạy app hoặc test.

## 5. Hợp đồng dữ liệu

| Đối tượng         | Trường và bất biến                                                                                                                                                                                                                                                  |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Species`         | `id` ổn định, nhóm, tên khoa học hiển thị, nguồn định danh, trạng thái duyệt. Đổi tên hiển thị không đổi ID.                                                                                                                                                        |
| `NameEntry`       | `speciesId`, `kind: vi/en/ja/scientific`, `label`, `role: primary/alias`, `acceptedForms`, phiên âm và hệ phiên âm, `audioAssetId`, nguồn. Tìm kiếm và chấm điểm dùng hai tập quy tắc khác nhau.                                                                    |
| `TradeScenario`   | `id`, `speciesId`, mô tả, trạng thái hàng, chế biến và thuộc tính đầu/vỏ/đuôi/bao gói nếu liên quan; `unknown` khác `false`; `expectedCodeLength`, `answerType: code/insufficient`, tham chiếu mã hoặc dữ kiện thiếu, lựa chọn nhiễu, lời giải, phiên bản nội dung. |
| `TariffReference` | Thị trường, danh mục, phiên bản, mã dạng **chuỗi**, cấp mã, mã cha, nguồn và vị trí trích dẫn, hiệu lực nếu đã xác minh, ngày kiểm tra và người duyệt. Không ghi đè bản ghi mà bài cũ tham chiếu.                                                                   |
| `MediaAsset`      | Loại, mục đích, đường dẫn, nguồn/quyền, locale/giọng nếu phù hợp, nhãn AI, người duyệt, phiên bản, trạng thái. Đổi file thì duyệt lại.                                                                                                                              |
| `Attempt`         | ID lượt nộp, phiên, mục tiêu học, dạng câu, phiên bản nội dung, số lần thử, kết quả, thời điểm. Nộp lặp cùng ID không ghi điểm hai lần.                                                                                                                             |
| `ReviewState`     | Khóa theo mục tiêu học: loài + hướng/kỹ năng, hoặc tình huống HS; lưu mức nhớ và `dueAt`. Không dùng một trạng thái chung cho cả loài.                                                                                                                              |

**Kiểm tra xuất bản:** tách dữ liệu mẫu khỏi bộ public; chặn nội dung public thiếu nguồn bắt buộc, media bắt buộc chưa duyệt, tham chiếu hỏng, phiên bản không khớp hoặc câu có nhiều đáp án không chủ đích. Preview dữ liệu nháp phải ghi rõ là dữ liệu demo; trạng thái “đã duyệt” chỉ đặt khi có người duyệt thực sự.

## 6. Chấm điểm, lịch ôn và lưu phiên

- **Mã HS:** chuẩn hóa dấu chấm/khoảng trắng theo định dạng được hỗ trợ; `0306.17.11` và `03061711` tương đương. Giữ số 0 đầu, từ chối ký tự ngoài định dạng, không chấp nhận mã cha 6 số cho đề hỏi 8 số.
- **Tên:** chuẩn hóa Unicode và khoảng trắng; bỏ phân biệt hoa/thường khi bài không kiểm tra chính tả; chỉ nhận biến thể đã duyệt. Không bỏ dấu hoặc fuzzy-match mặc định để tránh nhận nhầm tên loài.
- **Ôn:** đúng ở phiên ôn nâng mốc 1 → 3 → 7 → 14 ngày; sai về mốc 1 ngày. Câu sai có thể xuất hiện lại sau ít nhất hai câu khác, hoặc ưu tiên phiên sau nếu không còn chỗ. Làm lại đúng trong cùng phiên không tăng bậc. Tự đánh giá flashcard tách khỏi kết quả chấm tự động. Tiến độ tiếng Anh, Nhật, nghe, hình và HS không cộng chéo mặc định.
- **Tiếp tục phiên:** lưu thứ tự câu, vị trí, câu trả lời đã nộp và phiên bản nội dung. Reload không đổi đề hoặc cộng điểm lại. Khi thay đáp án HS, ẩn bản cũ khỏi lượt mới, giữ lịch sử và đưa bản sửa vào hàng đợi ôn.

## 7. Thứ tự triển khai và nghiệm thu

| Mốc                    | Kết quả phải chạy được                                                                                                                                                                    |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Dữ liệu + flashcard | Hồ sơ đủ 4 tên, player, thư viện, lưu phiên; chạy khi không có ảnh. Phân biệt audio nháp với audio đã duyệt.                                                                              |
| 2. Ghép tên + ôn       | Bàn 3 cặp không mơ hồ; dùng được bằng chạm/bàn phím; nộp kép không nhân kết quả; ôn tách theo kỹ năng.                                                                                    |
| 3. HS                  | Chạy cả fixture đủ/thiếu dữ kiện; có lý do và nguồn cho dữ liệu phát hành; không rơi số 0 đầu; có thêm cặp tình huống cùng loài nhưng khác mã đã duyệt trước khi nghiệm thu toàn mô-đun.  |
| 4. Đoán hình           | Bật bằng cấu hình khi đủ ảnh; thiếu/lỗi ảnh không tính sai; minh họa chưa đủ tiêu chuẩn không lọt vào bài nhận diện.                                                                      |
| 5. Pilot               | Kiểm thử mobile; đo hoàn thành phiên đầu, quay lại ôn, độ chính xác lần đầu theo kỹ năng. Dùng đề HS mới cùng nguyên tắc nhưng mô tả khác để phân biệt hiểu cách phân loại với học thuộc. |

**Definition of Done cho lần bàn giao đầu:** mở hồ sơ Tôm sú → nghe nếu có audio khả dụng → flashcard → ghép với loài đối chiếu → làm hai bài HS fixtures → xem mục ôn → tải lại không mất tiến độ. Không chặn demo vì thiếu ảnh; không phát hành dữ liệu chưa duyệt. QA tối thiểu gồm mã 6/8 số, `unknown`, alias trùng, submit hai lần, reload, media lỗi và hàng đợi ôn. Thiếu audio thật phải được báo là chưa đạt chuẩn pilot, không được che bằng file giả.
