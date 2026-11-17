# Seafood Deck — Kế hoạch triển khai pilot theo danh mục khách

**Đối tượng:** dev/coding agent, QA, người phụ trách nội dung và duyệt nghiệp vụ.  
**Chỉ thị cho agent:** đọc file này, đối chiếu repo và triển khai trực tiếp theo ba nhóm dưới đây. Đây là một đợt triển khai, nghiệm thu theo các mốc chạy được; không trả thêm proposal, prototype riêng hay gói bàn giao từng file. Không tự deploy đè VPS khách. Giữ thay đổi đang có, không ghi đè hoặc dọn dữ liệu ngoài phạm vi.

## 1. Re-baseline: cái gì giữ, bỏ, và chưa biết

| Giữ | Thay | Chưa được xác minh |
|---|---|---|
| React/TypeScript/Vite nếu đúng repo đang chạy; nội dung học Việt–Anh–Nhật–tên khoa học; bốn chế độ; HS theo quy cách; phiên âm và audio; mobile-first; không bắt người chơi đăng ký | Đợt demo tôm không đại diện khách; fixtures tôm chỉ dùng cho test tách biệt nếu cần. Thay nguồn dữ liệu runtime từ fixture FE sang API; prototype không thay cho tính năng trong app. | Repo/branch và build hiện tại, số lượng nội dung thật, file ảnh/audio, người duyệt, phạm vi truy cập bộ khách, nhà cung cấp storage được phép. Báo theo bằng chứng, không lấy báo cáo cũ làm trạng thái repo hiện hành. |

**Thứ tự ưu tiên khi tài liệu mâu thuẫn:** file này thay phạm vi tôm và ràng buộc “không backend” của prompt demo cũ. PRD cũ vẫn là chuẩn hành vi học/chấm/ôn, trừ điểm được thay rõ ở đây. Không mở lại batch media tôm để phục vụ pilot mới. Không lấy mô tả Seafood Master 10 loài, Leitner 5 hộp, Time Attack hay Vanilla JS làm bằng chứng tính năng đã có hoặc tiêu chí pilot.

**Người dùng:** nhân sự phía khách học tên và phân biệt mặt hàng; biên tập viên nhập nội dung; người duyệt nội dung/HS quyết định phần nào đủ chuẩn xuất bản. App không phải công cụ khai báo hải quan.

**Phạm vi pilot đề xuất:** 6–8 mục học thật nếu dữ liệu cho phép, đại diện cho mực, bạch tuộc, cá thịt trắng, cá thịt đỏ, nghêu, vẹm. Đây là mục tiêu đợt đầu, không phải xác nhận khách đã có sáu loài đủ hồ sơ; thu hẹp chỉ khi bên phụ trách chấp nhận rõ phần chưa phủ. Mục tiêu 12 loài/24 tình huống của PRD cũ để sau, không dùng làm lý do trì hoãn pilot. Tối thiểu đủ 3 mục distinct có tên không mơ hồ cho mỗi hướng ghép, 3 ảnh nguồn đã duyệt của 3 mục cho một lượt Đoán hình, và 3 case HS đã duyệt (cùng loài/mặt hàng đổi quy cách → hai mã khác nhau; một case thiếu dữ kiện). Mỗi mục học đủ điều kiện phải có ba cặp file nghe + phiên âm/cách đọc, tức 18–24 cặp nếu chọn 6–8 mục. Các SKU chưa rõ loài vẫn quản trị ở dạng nháp, không ép vào bộ học bốn tên. Không yêu cầu 10 ảnh một lượt, native app, PWA offline, ranking, nhận diện AI, thuế, chấm qua mic hoặc đồng bộ tài khoản người chơi ở đợt này.

## 2. Quyết định kiến trúc và các phương án đã loại

- **FE giữ React/Vite, BE NestJS + Express adapter + TypeScript.** NestJS modular monolith, không chia service nhỏ; dùng module Catalog, Media, Learning, Admin/Auth. Express/Fastify thuần phù hợp API đơn giản hoặc đội đã có convention; ở đây cần quy trình duyệt, phân quyền, chấm điểm và OpenAPI nên dùng cấu trúc Nest. Express adapter đáp ứng multipart có giới hạn; không dùng benchmark làm lý do đổi framework. Nếu audit thấy repo đã có BE tương đương và đáp ứng đầy đủ luồng, giữ nó và ghi lý do thay cho rewrite. REST `/api/v1`, DTO validation, OpenAPI; khóa phiên bản runtime/package tương thích theo repo, không nâng hàng loạt.
- **PostgreSQL + Prisma, S3-compatible object storage.** Quan hệ, phiên bản nội dung và transaction cho xuất bản/chấm điểm cần DB; byte media không nằm trong DB, git hay bundle FE. Dùng S3 được quản lý nếu khách cho phép; dev/test có thể dùng endpoint tương thích S3; phải chạy smoke với provider thực trước khi giao. Cấu hình endpoint/bucket/region/credentials qua môi trường; không bí mật trong FE. Mặc định bucket private: trả URL ký đọc cho media thuộc bộ đã xuất bản mà phiên có quyền xem; bản nháp chỉ qua quyền quản trị/preview. URL hết hạn thì refresh một lần qua API, không ghi URL ký vào DB, log hoặc state lâu dài; không public listing. Trình duyệt tải byte trực tiếp từ storage, API chỉ trả manifest/quyền và metadata. Tốc độ tải đến từ thumbnail, lazy loading và giới hạn payload, không đến từ đổi framework.
- **Upload pilot đi qua API có giới hạn**, lưu tạm/stream có giới hạn, không buffer file lớn tuỳ ý. Đề xuất mặc định ảnh JPEG/PNG/WebP tối đa 10 MiB và 25 MP; audio MP3 tối đa 5 MiB; CSV tối đa 2 MiB/2.000 dòng; để cấu hình và kiểm bằng test. Kiểm tra signature/decode, không tin tên/MIME client; từ chối SVG/HTML và import ảnh từ URL tùy ý; tạo thumbnail và bản quiz không upscale, loại EXIF ở bản phát hành, lưu bản gốc private. Object key trung tính, duy nhất theo phiên bản, không overwrite. Ghi nhận upload ở trạng thái nháp; dọn object dở/mồ côi bằng tác vụ bảo trì; không xóa object đang được phiên hoặc bản xuất bản tham chiếu. Chưa thêm queue/CDN; nếu upload theo lô vượt ngân sách thực tế mới chuyển direct upload có vùng staging, giới hạn, xác minh sau upload.
- **Không bắt người học đăng ký.** Tiến độ ôn lưu trên thiết bị theo phiên bản schema và mục tiêu học; server giữ phiên chơi/lượt chấm có TTL cấu hình và phạm vi theo phiên khách. Dùng cookie phiên opaque HttpOnly/Secure/SameSite phù hợp; thêm CSRF cho thao tác ghi dùng cookie và kiểm scope server-side. Khu quản trị có đăng nhập, quyền biên tập/duyệt/ xuất bản và audit. Staging/pilot để private (cổng truy cập của deployment hoặc cơ chế mời riêng); không coi link bí mật hay `noindex` là kiểm quyền. Không đa tenant đợt đầu. Không mặc định cần offline; kiểm tra ngay với người phụ trách, không quảng bá offline chỉ vì media không lấy từ Wikimedia.

## 3. Ba nhóm triển khai — một đợt bàn giao

### Nhóm 1 — Dữ liệu, quản trị và media chạy xuyên suốt

**Dev làm:** audit repo, chạy baseline hiện có và ghi kết quả. Giữ các hàm thuần còn dùng được, chuyển fixtures ra test/demo có cách ly; không build fixtures tôm vào bundle khách. Trong cùng nhóm, làm lát cắt **nhập nháp → upload → duyệt → xuất bản → xem trong thư viện/flashcard bằng API**; không coi xong khi mới có schema hoặc Swagger.

Mô hình tối thiểu:

| Entity | Bất biến |
|---|---|
| `Species`, `NameEntry` | ID ổn định. Bốn loại tên, tên chính/bí danh, nguồn và cách viết được chấm; bí danh tìm kiếm không mặc định được chấm. Gắn phiên âm và audio theo đúng phiên bản tên. |
| `Product/SKU`, `ProductSpecies` | Nhóm thương mại/quy cách độc lập định danh sinh học; SKU có thể chưa xác định hoặc có nhiều loài. Không dùng tên nhóm như “cá thịt trắng” làm định danh. Chỉ sinh câu định danh từ ánh xạ đủ rõ. |
| `TradeScenario`, `TariffReference` | Gắn với mặt hàng/quy cách, có thể tham chiếu loài khi có căn cứ. Lưu mã dạng chuỗi, cấp mã, thị trường, phiên bản, hiệu lực/nguồn, lý do, dữ kiện quyết định hoặc chưa biết. `unknown` khác `false`; không tự suy mã từ tên loài. |
| `MediaAsset`, `MediaLink` | Key trung tính, hash, loại, kích thước, nguồn/credit/quyền, vai trò `profile/identification/product/pronunciation`, AI hay không, người/ngày duyệt. Mục đích quiz được duyệt riêng; ảnh AI chỉ minh họa. Đổi file/crop làm thay đổi nội dung nhận diện thì duyệt lại. |
| `ContentRelease`, `GameSession`, `Attempt` | Release đóng băng các revision câu hỏi, đáp án, media; lượt đang chơi pin release. Trạng thái `draft → review → approved → published`; sửa item đã duyệt tạo revision mới. Xuất bản/rollback nguyên tử theo release, audit người/thời điểm. Thu hồi ảnh vì quyền hoặc lỗi nghiêm trọng phải chặn cấp URL mới và cho phiên cũ bỏ qua không phạt; URL đã cấp còn hiệu lực đến khi hết hạn trừ khi chặn object/quyền ở storage. |

Admin tối thiểu: CSV template UTF-8, stable external ID, preview lỗi từng dòng/quan hệ trùng, nhập nháp idempotent và không ghi đè release; upload ảnh/audio, nghe/xem trước, duyệt và publish bộ. Import lỗi không commit một phần; preview không tự publish. Có bản mẫu phi sản xuất. FE danh mục phân trang, tìm theo tên và bí danh; chỉ trả DTO cần cho màn hình. Đường thử nháp và đường người học kiểm quyền riêng; không dùng FE hide để chặn.

**Nghiệm thu nhóm:** trên cùng FE build, admin import thử file lỗi (không commit), sửa rồi nhập mục, gắn media, thấy người chơi chưa đọc được nháp, publish và thấy mục xuất hiện ngay. Đổi audio/ảnh qua revision mới, thử rollback; phiên cũ giữ đề cũ trừ trường hợp thu hồi. Mở Network chứng minh không nhúng catalogue/media vào bundle và ảnh/audio tải từ kho.

### Nhóm 2 — Game hoàn chỉnh và bộ học đúng hàng khách

**Dev và content làm song song:** dev dùng fixture cô lập để hoàn thiện kỹ thuật; người phụ trách khách gom **một bảng nguồn + một lô media duy nhất** theo SKU/ID: nhóm, tên Việt, Anh, Nhật, tên khoa học nếu có, nguồn định danh, trạng thái/chế biến/bao gói khi liên quan, mô tả hàng không nhạy cảm, nguồn HS, người duyệt, file/credit/quyền ảnh và audio. Dùng thư mục đã có theo quy ước repo; không đòi gửi qua lại từng file. Không chuyển dữ liệu khách lên môi trường ngoài đã được cấp phép. Nếu chưa có dữ liệu thật, vẫn hoàn thành app bằng seed internal, nhưng không gắn nhãn pilot.

| Chế độ trong app chính | Hành vi bắt buộc |
|---|---|
| **Flashcard** | Bốn tên; ô HS là “Xem theo dạng hàng”, không hiện một mã mặc định. Lật thẻ, nghe Anh–Nhật–khoa học, thường/chậm, một clip một lúc, lỗi/thử lại; chế độ nghe–chọn nếu đủ clip, không lộ tên trong nhãn. Anh IPA theo giọng gắn với file; Nhật kana/romaji; tên khoa học có hướng dẫn khớp bản thu, ghi là quy ước của bộ. TTS có thể tạo nháp, không tự duyệt. |
| **Ghép tên** | 3 cặp mỗi lượt theo một hướng Việt–Anh/Nhật/KH, thao tác chạm và bàn phím. Dữ liệu trùng tên/bí danh làm đề mơ hồ thì lọc hoặc báo chưa đủ bộ, không tự ép ghép. |
| **Đoán hình** | Bắt đầu với lượt 3 câu không bấm giờ, 3 nguồn ảnh đủ chuẩn, không đếm crop cùng gốc thành ảnh mới. Ảnh thật đúng loài có quyền và duyệt identification; ảnh sản phẩm không thay thế ảnh định danh. Không lộ đáp án qua chữ in ảnh, file/URL, caption, alt, payload quiz; credit/lời giải sau nộp. Ảnh lỗi/skip không tính sai; hiện số câu đã trả lời thực tế, 0 câu thì không hiện 0% như kết quả đã làm. Có bài thay thế không dựa vào ảnh. |
| **HS** | Hiện danh mục VN/phiên bản/cấp mã và quy cách; chọn mã hoặc “Chưa đủ thông tin” + chi tiết cần hỏi. Giữ 0 đầu, chuẩn hóa dấu chấm/khoảng trắng đúng định dạng, không chấm mã 6 số cho câu yêu cầu 8 số. Trả lý do, nguồn và điểm gây nhiễu sau nộp. Không lấy fixture tôm hoặc mã do AI đề xuất làm đáp án khách; người có nghiệp vụ duyệt cặp khác quy cách và case thiếu dữ kiện. |

**Luồng chung:** Trang chủ → học/ôn/chọn chế độ → phản hồi → tổng kết theo kỹ năng → ôn lỗi. Ôn tách theo loài/hướng/kỹ năng/case; theo mốc PRD 1/3/7/14 ngày, lần đúng lại trong cùng phiên không nâng bậc; flashcard tự đánh giá tách kết quả chấm tự động. Phiên giữ thứ tự, lựa chọn nháp (trên thiết bị), đáp án đã nộp/tiến độ (server); TTL hết thì báo rõ và không cộng lại. API không gửi answer key, mappings ghép hoặc explanation trước nộp. Dùng token/ID option riêng theo phiên; không hứa chống tra thư viện bằng game học mở. Transaction + unique theo phiên/câu và lần nộp hợp lệ; retry cùng key trả kết quả cũ, cùng key khác payload bị từ chối; lượt ôn lại là lượt riêng, không ghi đè first try.

**Nghiệm thu nhóm:** chơi trọn cả bốn chế độ trong app; thư viện và flashcard chỉ đọc dữ liệu bộ đang được cấp quyền. Gửi một bảng coverage theo mục: 4 tên, ảnh profile/quiz, 3 audio + 3 hướng dẫn đọc, HS liên quan, nguồn, reviewer. Không gộp “đã có file” với “đã duyệt”.

### Nhóm 3 — QA, Docker staging và một lần bàn giao

- Docker Compose cho reverse proxy/FE, API, PostgreSQL; object storage theo cấu hình môi trường, DB không mở port công khai. Migration chạy có kiểm soát, health check, log request ID không lộ token/URL ký/CSV. Kiểm backup + restore DB và object inventory trên môi trường sạch, giữ phiên bản image trước và ghi cách rollback tương thích schema. Không lấy `vite preview` làm production server, không trỏ staging vào DB production.
- Chạy unit (quy tắc HS, ôn, alias), integration với Postgres/storage (publish, scope/ACL, import, upload lỗi, signed URL hết hạn, revision, hai submit đồng thời), browser E2E từ **container mới** (bốn mode trên mobile, thiếu/lỗi media, reload, nộp kép, ôn lỗi, phát clip thật, import → publish không rebuild). Kiểm không có ảnh tôm/fixture trong bộ khách hoặc direct URL nháp đọc được. Lưu lại kết quả có lệnh, môi trường, pass/fail; cái chưa chạy ghi rõ.
- Hiệu năng: thử ít nhất catalogue seed lớn hơn bộ pilot, ví dụ 1.000 SKU, để kiểm paging và không fetch toàn bảng. Kiểm ảnh danh mục dùng thumbnail, không tải audio trước khi bấm, không mã hóa media vào JSON; đo waterfall/bytes và thời gian tới câu đầu trên mobile với mạng throttled, báo baseline và phần nghẽn. Không tuyên bố SLA khi chưa có số tải thực tế.

## 4. Điểm dừng rõ ràng

| Mốc | Có thể bàn giao gì |
|---|---|
| **Bản kỹ thuật nội bộ** | Có DB/API/storage/admin, publish không cần rebuild FE, bốn chế độ chạy từ Docker và QA có bằng chứng. Có thể dùng fixtures tách biệt. Ghi cụ thể bản nào là demo và những hàng thật/ảnh/audio/HS còn thiếu. |
| **Pilot khách** | Bản kỹ thuật đạt + danh mục không tôm, bộ thật có coverage đã duyệt, media/quyền đã kiểm, HS được duyệt, truy cập khách được cấp phép, smoke thực tế trên môi trường staging/VPS đích. Không triển khai đè VPS nếu chưa được chủ dự án cho phép. |

**Một báo cáo cuối:** commit/image tag + lệnh chạy + migration/rollback + kết quả từng nhóm + coverage thật + người/đầu vào còn thiếu và phần nào chặn pilot. Không dừng phần code vì thiếu danh mục thật hoặc reviewer; không tự “approve” để vượt cổng nội dung. Không tạo thêm ZIP, `_inbox/` hay yêu cầu chuyển tiếp từng file.

### Tài liệu kỹ thuật đã đối chiếu

- NestJS — File upload (multipart/Multer với Express): https://docs.nestjs.com/techniques/file-upload
- Amazon S3 — Presigned URLs (quyền giới hạn theo URL/thời hạn; cùng key có thể ghi đè): https://docs.aws.amazon.com/AmazonS3/latest/userguide/using-presigned-url.html
