# Giai đoạn 2: làm lại giao diện người học "Biển sâu × Ấn bản loài"

Ngày: 2026-11-19 · Trạng thái: chờ duyệt.
Giai đoạn 1 (dữ liệu) đã merge vào `main` ở commit `9733206`. Tài liệu này thay mục 6 của `2026-11-18-prototype-adoption-design.md`.

## 1. Mục đích

Seafood Deck đang ở vòng demo để một công ty thủy sản cụ thể chọn mình thay vì đối thủ (xem `apps/web/PRODUCT.md`). Giao diện hiện tại có ba vấn đề:

- **Bố cục vỡ:** header xếp chồng, link đè lên ô chế độ, thẻ Thư viện cao nửa màn hình.
- **Không có bản sắc:** che chữ và ảnh đi thì không biết đây là app gì.
- **Không gây ấn tượng:** người dùng nhận xét "nhìn như mấy app đại trà bên ngoài".

Mục tiêu giai đoạn 2 là một giao diện người học **chuyên nghiệp, hiện đại, có chút game**. DNA của nó phải đến từ ngành thủy sản, và người học hoàn thành được một phiên trong vài phút trên điện thoại.

## 2. Quyết định đã chốt với người dùng

- **Trang chủ theo hướng A "Biển sâu".**
  - Nền xanh biển sâu, có tia sáng chuyển động chậm.
  - Các loài của mẻ hôm nay trôi lơ lửng thành thẻ nổi.
  - Tiến độ mẻ là **dây lưới có phao**.
  - Bên dưới là tiến độ theo 4 kỹ năng.
- **Màn học từng loài theo hướng C "Ấn bản loài".** Ảnh lớn nguyên vẹn trên nền tối, tên Việt cỡ lớn, nhãn nhóm, rồi ba tên EN / JP / LAT xếp dòng như mục lục.
- **Bỏ hướng B "Băng chuyền"** vì giống quán ăn.
- **Vảy cá chỉ để trang trí.** Ảnh loài luôn hiển thị nguyên vẹn, không bao giờ cắt theo hình vảy.
- **Màu nhóm loài lấy từ thịt hải sản:**
  - Cá: đỏ cá ngừ.
  - Giáp xác: hồng tôm chín.
  - Nhuyễn thể: vàng đất thịt nghêu.
  - Khác: xám xanh hải sâm.
  - Cam cá hồi dành cho hành động chính.
- **"Mẻ lưới" là vòng chơi:** mỗi phiên học là một mẻ.
- **Điều hướng:** desktop dùng header trên cùng, không dùng sidebar. Điện thoại dùng thanh tab dưới.
- **Trang không bỏ trống:** desktop không được để nửa trang dưới trống.
- **Cách xây dựng:** dựng lại tầng giao diện người học (xem mục 5).

Tài liệu tham chiếu hình ảnh (máy local, đã gitignore):

- `.superpowers/brainstorm/93700-1795022611/content/wow-concepts-v2.html`: 3 concept có chuyển động.
- `scale-haul-v2.html` và `scale-haul-v4-library-desktop.html` trong cùng thư mục: vòng trước. Chỉ tham khảo phần tổng kết và mức nhớ 4 vảy; **không** tham khảo ảnh cắt hình vảy hay sidebar, vì người dùng đã bác cả hai.
- Ảnh chụp các tham chiếu ngoài (Duolingo, Drops, Brilliant, Mowi…) nằm trong cùng thư mục, chỉ dùng để đối chiếu nội bộ.

## 3. Mục tiêu / không làm / phản mục tiêu

**Mục tiêu**

1. Mọi màn người học dùng một hệ hình ảnh có tên, nhận ra được ngay cả khi che hết chữ và ảnh. Phép thử: vẫn thấy biển sâu, phao, màu thịt hải sản và họa tiết vảy.
2. Trang chủ cho thấy ngay "mẻ hôm nay" và đưa người học vào phiên học bằng **một nút**.
3. Bốn chế độ học dùng chung khung "bìa loài", có thanh phao báo tiến độ của mẻ.
4. Thư viện lướt nhanh được 100+ loài trên điện thoại và desktop. Lọc theo nhóm và tìm theo mọi loại tên.
5. Bố cục đúng ở 320, 390, 768, 1280 và 1440px. Không tràn ngang, không chồng lấn.
6. Có chế độ tối cho các màn đọc nhiều. Các màn vốn đã tối (trang chủ, màn học) giữ nguyên.

**Không làm (để giai đoạn 3)**

- HS nhiều bước.
- Tính giờ khi Đoán hình.
- Combo điểm.
- Đọc bằng giọng máy.
- Hiệu ứng âm thanh.

Khung "bìa" phải chừa chỗ cho các tính năng này nhưng không cài đặt chúng.

**Phản mục tiêu (dù chạy được vẫn tính là hỏng)**

- Ảnh loài bị cắt méo hoặc bị che. Ảnh phải hiển thị trọn khung hình (`object-fit: contain`) trên nền phù hợp.
- Dùng sidebar trên desktop.
- Nửa trang desktop bị bỏ trống.
- Emoji làm biểu tượng.
- Gradient tím, bóng neon, kiểu SaaS chung chung.
- Dòng chữ nhỏ in hoa giãn chữ đặt ngay trên tiêu đề lớn, tức kiểu "eyebrow" mặc định của các landing page AI.
- Chuyển động không tắt được, hoặc làm giật trên điện thoại tầm trung.
- Hiển thị nội dung chưa duyệt như đã duyệt. Hiển thị giá hoặc độ hiếm cho người học.
- Đổi API, đường dẫn trang, cách chấm điểm hoặc lịch ôn.
- Xóa ca kiểm thử E2E.

## 4. Ràng buộc

- **API chỉ được thêm, không được sửa:**
  - Hợp đồng hiện có (`CatalogItemResponse`, các phiên học, các lần trả lời) giữ nguyên ý nghĩa và tương thích ngược.
  - Được **thêm** endpoint đọc mới và trường mới khi màn hình cần (xem 6.3 và 6.4), kèm cập nhật OpenAPI snapshot.
  - Không thêm migration DB.
- **Giữ nguyên đường dẫn trang:**
  - Các route hash `#home`, `#library`, `#profile/<id>`, `#study`, `#review`, `#progress` giữ nguyên.
  - Màn đăng nhập và màn quản trị vẫn chạy. Quản trị chỉ cần không vỡ khi đổi CSS dùng chung.
- **Điều hướng:** mỗi kích thước màn hình chỉ render **một** thanh điều hướng (header desktop hoặc tab dưới điện thoại, chọn bằng `matchMedia`), không render cả hai rồi ẩn bằng CSS, để role/tên link không bị trùng trong E2E.
- **Test E2E:**
  - E2E (`apps/web/e2e/*.spec.ts`, 20 ca) bám theo vai trò và nhãn tiếng Việt, ví dụ nút "Chạm để lật thẻ", "Đã nhớ", "Kiểm tra câu trả lời", "Xem tổng kết", link "Học tập", heading "Luyện nghiệp vụ".
  - Được đổi chữ hiển thị, nhưng phải cập nhật selector tương ứng và giữ nguyên **ý định** của từng ca. Không xóa ca nào.
- **Tiêu chuẩn tiếp cận:**
  - Độ tương phản đạt WCAG AA.
  - Vùng chạm tối thiểu 44px.
  - Ghép tên dùng được bằng bàn phím.
  - Tôn trọng `prefers-reduced-motion`.
  - Hiển thị đúng dấu tiếng Việt và kana/kanji.
- **Font và hiệu năng:**
  - Font tự host (đã có `@fontsource/be-vietnam-pro`), không tải font từ CDN lúc chạy.
  - Chuyển động chỉ dùng CSS transform/opacity.
  - Ảnh lazy-load qua signed URL hiện có (`Media.tsx`).
- **Nội dung chưa duyệt vẫn hiện nhãn trung thực:**
  - "Bản kỹ thuật nội bộ · Nội dung chưa duyệt" khi release là nội bộ.
  - "Chưa có bản thu đã duyệt" khi thiếu audio.
  - Ghi công ảnh như hiện tại.

## 5. Cách xây dựng

| Cách | Đánh đổi | Kết luận |
| --- | --- | --- |
| **Dựng lại tầng giao diện người học**: bộ token màu/khoảng cách/chữ mới, tách `PilotApp.tsx` (1.338 dòng) thành các màn riêng, giữ nguyên logic dữ liệu | Tốn công hơn; là cách duy nhất thay được cả thế giới hình ảnh; các màn tách riêng giúp giai đoạn 3 dễ làm | **Chọn** (người dùng chọn) |
| Chỉ thay CSS, giữ cấu trúc | Nhanh, nhưng cấu trúc cũ chính là bố cục "đại trà" bị chê | Loại |
| Làm lần lượt từng màn trên nền cũ | Ít rủi ro mỗi bước, nhưng app lẫn hai phong cách trong lúc demo | Loại |

**Ranh giới tách file:**

- Logic dữ liệu giữ nguyên chỗ, chỉ di chuyển: tải ledger, `mergeScore`, `mergeGame`, gọi API `pilot/api.ts`, `domain/*`.
- Giao diện tách ra `apps/web/src/learner/`:
  - **Khung ứng dụng:** header desktop, tab dưới điện thoại, nhãn release.
  - **Các màn:** `Home`, `Study` (câu hỏi và tổng kết), `Library`, `Profile`, `Review`, `Progress`, `Login`.
  - **Thành phần dùng chung:** `SpeciesCover` (khung bìa loài), `FloatRope` (dây phao), `SpeciesCard`, `MasteryScales` (4 vảy), `GroupChip`.
- Token đặt trong một file CSS mới (custom properties trên `:root`, có biến thể tối). `styles.css`, `trade.css` và `pilot.css` chỉ còn giữ phần quản trị đang dùng. CSS người học cũ bị xóa.

## 6. Thiết kế

### 6.1 Hệ hình ảnh

- **Hai mặt nền:**
  - "Biển sâu" (tối): gradient xanh mực → xanh biển, có tia sáng. Dùng cho trang chủ và khung học.
  - "Băng" (sáng): trắng lạnh. Dùng cho Thư viện, Ôn tập, Tiến độ, Tổng kết, Hồ sơ phần chi tiết.
  - Header luôn là xanh biển sâu.
  - Không dùng nền kem hay giấy cũ.
- **Màu nhóm:**
  - Cá: `#A8243A`.
  - Giáp xác: `#EE8A7A` (chữ trên nền này dùng màu tối).
  - Nhuyễn thể: `#C99A2E` (chữ tối).
  - Khác: `#4F6B5E`.
  - Hành động chính: `#E8743B`, gờ dưới tối hơn tạo cảm giác "nhấn lún".

  Giá trị cụ thể được tinh chỉnh khi build để đạt AA, nhưng phải giữ nguyên tông màu. Nhóm là **trường dữ liệu** `taxonomicGroup`. Mục không có trường này hiển thị trung tính (xám xanh), không đoán nhóm.
- **Họa tiết vảy cá:** lớp nền mờ ở đáy vùng tối, viền đáy header và nền trạng thái rỗng. Không bao giờ làm khung ảnh hay mặt nạ cắt ảnh.
- **Phao và dây lưới:**
  - Biểu tượng tiến độ của mẻ.
  - Phao rỗng là câu chưa làm. Phao tô màu nhóm của loài là câu đã làm đúng. Phao viền đứt là câu sai hoặc "sổng lưới".
  - Phao tô cũng mang số thứ tự để không chỉ dựa vào màu.
- **Mức nhớ:** 4 vảy nhỏ ứng với các mốc ôn 1 · 3 · 7 · 14 ngày, lấy từ `ReviewState.stage` hiện có. Vảy phải có nhãn đọc màn hình, ví dụ "Mức nhớ 2/4".
- **Chữ:**
  - Be Vietnam Pro, đậm, khoảng cách chặt cho tiêu đề.
  - Tên khoa học in nghiêng (quy ước danh pháp).
  - Font tiếng Nhật dùng font hệ thống hoặc Noto Sans JP tự host; người build chọn.
  - Số dùng tabular cho mã HS và thống kê.
- **Chuyển động** (tất cả tắt khi `prefers-reduced-motion`; tia sáng tạm dừng khi tab ẩn):
  - tia sáng lay chậm;
  - thẻ loài trôi nhẹ;
  - phao nổi lên và đổi màu khi một câu đúng;
  - thẻ lật khi xem đáp án.

### 6.2 Khung ứng dụng

- **Desktop (≥ 900px):**
  - Header ngang cao khoảng 64px, nền trong suốt trên trang chủ và màn học, đặc trên các màn sáng.
  - Trái là logo, giữa là tab Học / Thư viện / Ôn tập / Tiến độ, phải là nút thoát. Tab đang chọn có gạch dưới màu cá hồi.
  - Nhãn release nội bộ đặt cạnh logo, không thành một dòng riêng.
- **Điện thoại:** header gọn (logo + nút thoát) và thanh tab dưới cố định 4 mục, chừa vùng an toàn.
- **Link điều hướng:** tên link đổi được, nhưng E2E phải cập nhật theo.

### 6.3 Trang chủ "Biển sâu"

**Màn hình đầu tiên (desktop 1280×800, điện thoại 390×844):**

- Tiêu đề lớn "Mẻ lưới hôm nay: N loài đang chờ". Tên các link điều hướng, ví dụ "Học tập" → "Học", được phép đổi; cập nhật E2E tương ứng. Không có dòng chữ nhỏ in hoa phía trên.
- Một dòng phụ: thời lượng ước tính, các loại tên sẽ học.
- Nút chính **"Thả lưới"** vào phiên học phù hợp nhất:
  - còn mục đến hạn thì vào phiên ôn hiện có (`#review`);
  - không có mục đến hạn thì vào Flashcard của loài kế tiếp chưa học.
- **Thẻ nổi:** tối đa 5 loài của mẻ, ưu tiên loài đến hạn trước, sau đó đến loài chưa học. Mỗi thẻ gồm:
  - ảnh nguyên vẹn, hoặc hình bóng trung tính kèm "Ảnh đang bổ sung" khi thiếu;
  - tên Việt, tên khoa học, nhãn nhóm màu.

  Bấm thẻ mở Hồ sơ loài. Trên điện thoại hiện 2–3 thẻ.
- **Dây phao:** tiến độ của phiên đang dở (lấy từ ledger hiện có). Không có phiên dở thì hiện mẻ trống kèm câu mời "Thả lưới để bắt đầu".

**Nguồn dữ liệu cho trang chủ** (quyết định sau khi đối chiếu code):

- **Endpoint mới `GET /catalog/overview`** (chỉ đọc, phạm vi release hiện tại của người học). Trả về:
  - số mục học được;
  - số loài theo `taxonomicGroup`;
  - số hồ sơ HS;
  - danh mục rút gọn của mọi mục học được, gồm `revisionId`, **`itemId`**, tên Việt, tên khoa học, nhóm, id ảnh `profile`/`identification` đã được phép xem.

  Lý do: ledger lưu tiến độ theo `targetId` = `itemId` (flashcard, đoán hình) hoặc id hồ sơ HS, trong khi client hiện không có `itemId`. Phân trang 50 mục cũng không đủ để chọn "loài chưa học".
- **Client:** thêm các trường mở rộng giai đoạn 1 vào kiểu `CatalogItem` trong `pilot/api.ts`: `taxonomicGroup`, `family`, `familyVi`, `enAliases`, `jaKanji`, `jaTrade`.
- **Định nghĩa:**
  - **Chưa học:** chưa có trạng thái ôn nào cho `itemId` đó ở các kỹ năng `name:*` / `match:*` / `image`.
  - **Đến hạn:** `dueAt` ≤ hiện tại.
  - Ledger theo thiết bị và reset theo phiên bản nội dung là hành vi hiện có, giữ nguyên.
- **Dây phao trên trang chủ:**
  - Nếu ledger có phiên đang dở, gọi `GET /learning/sessions/:id` một lần để biết số câu và câu đã làm.
  - Nếu không, hiện 5 phao trống như "mẻ chờ thả".
- **Nút "Thả lưới":**
  - Có mục đến hạn: bắt đầu phiên ôn bằng `reviewTargets` gồm **tối đa 8** mục đến hạn sớm nhất. Vì vậy dây phao có tối đa 8 phao.
  - Không có mục đến hạn: Flashcard (`kind = en`) của loài chưa học đầu tiên trong danh mục.
  - Đã học hết: hiện "Mẻ hôm nay đã xong" và hai lối sang Ghép tên / Thư viện.

**Phía dưới, nền vẫn tối, lấp đầy trang:**

- **Tiến độ 4 kỹ năng:** Tiếng Anh, Tiếng Nhật, Tên khoa học, HS dạng hàng. Mỗi kỹ năng là một thanh và con số "x / y loài".
  - Tiếng Anh, Nhật, khoa học: x = số `itemId` có trạng thái ôn `name:<k>` hoặc `match:<k>` với `stage ≥ 1`; y = số mục học được.
  - HS: x = số hồ sơ HS có trạng thái `hs` với `stage ≥ 1`; y = số hồ sơ HS trong release (lấy từ `/catalog/overview`).
- **Bốn chế độ học** (Flashcard, Ghép tên, Đoán hình, HS dạng hàng) là các ô có số câu/cặp. Phần chọn loài và hướng ghép tên hiện có giữ chức năng, trình bày lại cho gọn.
- **Lối vào Thư viện** theo 4 nhóm màu kèm số loài.

**Trạng thái:**

- Đang tải: khung thẻ mờ.
- Lỗi API: thông báo kèm nút thử lại, giữ hành vi hiện tại.
- Release chưa có mục: trạng thái rỗng có họa tiết vảy và câu giải thích.
- Release nội bộ: giữ nhãn trung thực.

### 6.4 Thư viện (nền sáng)

- **Điện thoại:** danh sách gọn. Mỗi dòng có:
  - ảnh thu nhỏ nguyên vẹn trong khung chữ nhật bo góc;
  - tên Việt, tên khoa học in nghiêng, dòng phụ "tên Anh · tên Nhật";
  - 4 vảy mức nhớ ở bên phải.

  Danh sách chia theo nhóm, có tiêu đề màu nhóm.
- **Desktop:** lưới 4–5 cột. Mỗi thẻ có ảnh nguyên vẹn, vạch màu nhóm, tên và vảy mức nhớ.
- **Tìm và lọc:**
  - Ô tìm theo tên Việt, Anh, Nhật và khoa học, tìm được cả `enAliases`, `jaTrade` và `jaKanji`.
  - Cách làm: ngoài điều kiện hiện có trên `NameEntry`, `Catalog.list` truy vấn thêm các trường đó trong `Revision.data` (raw SQL `ILIKE` trên jsonb, có tham số hóa). Như vậy không cần nhập lại dữ liệu. Danh mục tối đa 2.000 mục nên hiệu năng chấp nhận được. Có test.
  - Chip lọc theo nhóm, có số đếm, dùng query `taxon` đã có.
  - Phân trang hoặc "Xem thêm" dùng API phân trang hiện có.

### 6.5 Hồ sơ loài và khung học "Ấn bản loài"

**`SpeciesCover`, dùng cho Hồ sơ loài và màn câu hỏi của cả 4 chế độ:**

- Vùng ảnh lớn trên nền tối. Ảnh nguyên vẹn, kèm dòng ghi công ảnh nhỏ (credit, quyền) như hiện tại.
- Nhãn nhóm màu kèm họ, tức `family` / `familyVi` khi có.
- Tên Việt cỡ rất lớn.
- Các dòng EN / JP / LAT kèm mã ngôn ngữ. Dòng JP hiện kana, kanji khi có, và tên thương mại `jaTrade` khi có.
- Desktop: ảnh trái, chữ phải. Điện thoại: ảnh trên, chữ dưới.

**Dùng `SpeciesCover` ở đâu:**

- **Flashcard và Hồ sơ:** ảnh và tên Việt hiện ngay, dòng đáp án che tới khi lật.
- **Đoán hình:** ảnh là đề bài; tên và các dòng EN/JP/LAT chỉ hiện sau khi trả lời.
- **Ghép tên và HS:** không có một loài trung tâm, nên **không** dùng `SpeciesCover`. Hai chế độ này dùng cùng nền tối và dây phao, kèm một thẻ sáng chứa bàn ghép hoặc mô tả hàng hóa.

**Màn học:**

- Thanh phao nằm ở đầu màn.
- Nút Tạm dừng giữ nguyên.
- Phần trả lời theo từng chế độ:
  - **Flashcard:** che dòng đáp án tới khi bấm "Chạm để lật thẻ", rồi hiện "Chưa nhớ / Đã nhớ".
  - **Ghép tên:** bàn 3 cặp đặt trên nền sáng, dùng chạm hoặc bàn phím.
  - **Đoán hình:** ảnh là đề bài. Phần chữ chỉ hiện sau khi trả lời để không lộ đáp án; lựa chọn dạng nút radio.
  - **HS:** mô tả hàng hóa, các lựa chọn mã và "Chưa đủ thông tin" giữ nguyên logic.
- Phản hồi đúng/sai dùng màu, biểu tượng và chữ cùng lúc. Câu đúng thì phao tương ứng nổi lên.
- Hành vi hiện có giữ nguyên: lời giải, nguồn, "Kiểm tra câu trả lời", "Tiếp tục", "Xem tổng kết".

**Hồ sơ loài:**

- Thêm "Dấu hiệu nhận biết", "Dạng hàng tham khảo" và trạng thái audio từng tên.
- Nút "Chưa có bản thu" thu nhỏ thành nhãn trạng thái, không còn là nút xám to.
- Hai lối "Học flashcard" và "Xem HS theo dạng hàng" giữ nguyên.

### 6.6 Tổng kết, Ôn tập, Tiến độ (nền sáng)

- **Tổng kết:**
  - Tiêu đề "N / M loài vào lưới".
  - Danh sách loài bắt được: màu nhóm, tên Việt, tên Anh · Nhật, và "ôn lại sau X ngày" lấy từ lịch ôn.
  - Loài sai ghi "Sổng lưới · ôn lại ngày mai".
  - Giữ "Ôn lỗi ngay" và các số liệu hiện có (lần đầu, làm lại, tự đánh giá).
- **Ôn tập:** danh sách mục đến hạn, dùng cùng kiểu dòng với Thư viện, kèm kỹ năng và ngày đến hạn. Giữ hành vi bắt đầu ôn hiện có.
- **Tiến độ:**
  - 4 thanh kỹ năng như trang chủ.
  - Phân bố mức nhớ (bao nhiêu loài ở mỗi mốc).
  - Lịch sử phiên gần đây.

### 6.7 Chế độ tối cho màn sáng

- Token có bộ giá trị tối, áp dụng theo `prefers-color-scheme`. Có thêm nút chuyển trong header, lưu lựa chọn vào localStorage (bọc try/catch).
- Trang chủ và màn học vốn tối, không đổi theo chế độ.

## 7. Kiểm thử và nghiệm thu

- **Unit (Vitest):** các hàm thuần mới.
  - Chọn loài cho mẻ: đến hạn trước, rồi đến chưa học, tối đa 5.
  - Tính tiến độ kỹ năng.
  - Ánh xạ `stage` sang 4 vảy.
  - Ánh xạ nhóm sang màu, với trường hợp thiếu nhóm thì trung tính.
- **API:** test cho phần tìm theo `enAliases` / `jaTrade`.
- **E2E:**
  - Toàn bộ 20 ca hiện có pass, chỉ được cập nhật selector, không xóa ca.
  - Thêm ca: trang chủ không tràn ngang và không chồng lấn ở 320 / 390 / 1280.
  - Thêm ca: ảnh trong Thư viện và Hồ sơ không bị cắt (`object-fit: contain`).
- **Thủ công:**
  - Chụp màn hình mọi màn ở 390 và 1440, trên stack Docker local với release nội bộ có loài prototype.
  - Phép thử che chữ: thay chữ bằng khối xám, vẫn nhận ra họa tiết vảy, phao và màu thịt hải sản.
- **Quy trình impeccable:**
  - Trước khi code, ghi direction contract vào surface brief.
  - Chạy `impeccable detect` một lần trên các file đã đổi.
  - Cho finish reviewer xem ảnh chụp.
  - Cuối cùng ghi `DESIGN.md`, theo `reference/new-work.md` mục 5–7.

## 8. Để lại cho người build

- Tên component và tên file cụ thể bên trong `apps/web/src/learner/`.
- Giá trị màu cuối cùng (giữ tông màu đã chốt, đạt AA).
- Kích thước chữ, khoảng cách và đường cong chuyển động.
- Cách vẽ tia sáng và phao (CSS hoặc SVG), miễn nhẹ và tắt được.
- Cách tìm theo `enAliases` / `jaTrade` (xem 6.4).
- Font tiếng Nhật.

## 9. Quyết định của agent (người dùng kiểm khi đọc)

- **Cho phép thêm endpoint đọc `GET /catalog/overview` và trường mới.** Trang chủ cần `itemId` và danh mục đầy đủ để biết loài nào chưa học hoặc đến hạn. Không sửa contract cũ, không migration.
- **Tìm theo tên phụ** bằng truy vấn `Revision.data`, không mở rộng `searchText`, để khỏi phải nhập lại dữ liệu đã có.
- **"Thả lưới" khi có mục đến hạn** chỉ lấy tối đa 8 mục, để dây phao gọn.
- **Ghép tên và HS** không dùng khung bìa loài.
- **Mỗi kích thước màn hình** chỉ render một thanh điều hướng.
- **Mockup** chỉ để tham khảo; chỗ nào mâu thuẫn với tài liệu này thì tài liệu thắng.
- **Nhánh làm việc:** `feat/phase2-ui-redesign`, tách từ `main`.

- **"Mẻ lưới" = phiên học hiện có.** Số phao bằng số câu của phiên (3–8). Không đổi backend để ép đúng 5. Khối "Mẻ lưới hôm nay" ở trang chủ chỉ là gợi ý tối đa 5 loài. Lý do: giữ nguyên lịch ôn và cách chấm.
- **"Thả lưới"** vào phiên ôn khi có mục đến hạn, nếu không thì vào Flashcard của loài kế tiếp.
- **Hai nền:** tối cho trang chủ và màn học, sáng cho các màn đọc nhiều. Lý do: đọc lâu không mỏi mắt, và vùng tối giữ được cảm giác "wow".
- **Mục không có nhóm** hiển thị màu trung tính, không đoán nhóm.
- **Tiến độ kỹ năng** đếm loài có `stage ≥ 1`.
- **Chế độ tối** chỉ áp dụng cho các màn sáng.
- **Ảnh mockup và tham chiếu** chỉ để ở local (gitignore), không commit, vì nhiều ảnh prototype chưa đủ ghi công.
