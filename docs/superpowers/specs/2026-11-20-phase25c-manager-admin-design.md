# Giai đoạn 2.5c: quản lý theo dõi học viên, quản trị người dùng, nâng cấp VPS

Vòng cuối của giai đoạn 2.5 (spec gốc: `2026-11-19-phase25-learner-accounts-design.md`, mục 5, 8.4, 9). 2.5a (server) và 2.5b (trình duyệt người học) đã xong và nằm trên `main` (`111a821`). Tài liệu này cố định phạm vi và các quyết định của 2.5c, gồm cả các việc còn tồn từ hai vòng trước.

## 1. Mục đích

Để khách xem được bản demo trọn vẹn: người quản lý theo dõi tiến độ học viên, quản trị viên tự tạo, khóa và đặt lại mật khẩu mà không phải gọi API bằng tay, và có một quy trình nâng cấp VPS an toàn. Khách đang so sánh giữa các nhà cung cấp, nên màn quản lý là điểm cần thuyết phục.

Một lần demo thành công trông như sau:
1. Quản trị tạo tài khoản học viên "An" trong giao diện (mật khẩu do chủ dự án chọn, không ghi trong repo).
2. An đăng nhập, học một mẻ.
3. Quản lý đăng nhập, thấy An trong bảng (đang học, mức nhớ, lần học cuối), mở chi tiết thấy đúng các màn tiến độ của An.
4. Quản trị khóa An: phiên đang mở của An chết ngay, đăng nhập lại bị từ chối.

## 2. Quyết định của người dùng

- Một quản lý xem **tất cả** học viên. Không có nhóm hay đội ở vòng này.
- Giao diện học viên **không** có dòng nào nói quản lý xem được tiến độ (đã quyết ở 2.5b; giữ nguyên).
- Quản lý chỉ xem, không sửa nội dung, không thấy mật khẩu.
- Phạm vi giữ đủ theo spec; tạo hàng loạt từ CSV và xóa cứng người dùng xếp cuối để cắt được nếu gấp.
- Gộp luôn các việc còn tồn (mục 8).

## 3. Mục tiêu, không làm, phản mục tiêu

**Mục tiêu**
- Bảng học viên và chi tiết từng người cho vai trò `manager` (và `admin`), kèm xuất CSV.
- Mục "Người dùng" cho `admin`: danh sách, tạo, khóa/mở khóa, đặt lại mật khẩu, tạo hàng loạt từ CSV, xóa có xác nhận.
- Khóa người dùng thu hồi phiên ngay và mọi route từ chối người dùng đã khóa.
- Tài liệu nâng cấp VPS từ bản đang chạy lên 2.5, và quy trình tạo "An".
- Dọn các việc còn tồn đã triage.

**Không làm**
- Nhóm hoặc đội, phân quyền theo phòng ban.
- Quản lý sửa nội dung, đăng ký tự phục vụ, quên mật khẩu qua email, đăng nhập một lần (SSO), xác thực hai lớp.
- Màn xem nhật ký thay đổi riêng cho người dùng (nhật ký `Audit` hiện có vẫn ghi mọi thao tác).
- Nhập tiến độ cũ từ trình duyệt.

**Phản mục tiêu (nếu xảy ra là thất bại dù chạy được)**
- Quản lý hoặc người ngoài thấy tài khoản nhân viên, mật khẩu, hoặc dữ liệu nháp.
- Khóa một người mà họ vẫn dùng được phiên cũ.
- Quản trị khóa hoặc xóa chính mình hoặc quản trị cuối cùng, tự khóa mình khỏi hệ thống.
- Mật khẩu tạm bị ghi vào log, vào `Audit`, hoặc lưu lại ngoài trình duyệt của người vừa tạo.
- Bảng CSV xuất ra bị chèn công thức (tên học viên bắt đầu bằng `=`, `+`, `-`, `@`).

## 4. Hiện trạng đã kiểm trong code

- Server: `POST /admin/users` (một người, DTO theo vai trò, mật khẩu ≥ 8 cho học viên, ≥ 16 cho vai trò khác, ghi `Audit user.create`). Chưa có danh sách, khóa, đặt lại, xóa.
- `User` đã có `disabledAt`, `mustChangePassword`, `lastLoginAt`, `createdAt` (2.5a). Đăng nhập từ chối tài khoản khóa và `/me` kiểm `disabledAt`, nhưng `Auth.actor` (xác thực mọi route khác) **không** kiểm. Hàm `revokeUserSessions(db, userId, keepSessionId?)` có sẵn, mới chỉ dùng khi đổi mật khẩu.
- Tên đăng nhập hiện phân biệt hoa thường (`username String @unique`); regex tên: `^[a-zA-Z0-9_-]{3,50}$`.
- Tiến độ theo học viên: `ProgressService` (`context`, `home`, `review`, `progress`, `mastery`) đã nhận `actor` và lấy `userId` từ phiên; số liệu suy ra bằng các hàm thuần (`progress-derive`, `progress-achievements`). Có thể dùng lại cho một học viên bất kỳ khi tách tham số `userId`.
- Web: vai trò `manager` hiện chỉ thấy Thư viện và `ManagerNotice`; `routeAllowed`/`routesFor` trong `role.ts` điều khiển route và kiểm thử tự động "không gọi `/me/*`". Trang quản trị (`Admin.tsx`, 650 dòng) là một trang dài, route `#admin`.
- Hạ tầng sẵn có: CSRF, kiểm Origin, giới hạn đăng nhập (giữ chỗ trước khi xác thực, hoàn lại khi đúng), `Audit`, hàng đợi gửi nền, script kiểm đầu cuối `scripts/learner-accounts-check.mjs` (chỉ chạy local).

## 5. Các cách đã cân nhắc

| Quyết định | Cách | Đánh đổi | Chọn |
|---|---|---|---|
| Số liệu quản lý xem | A. Tính khi đọc bằng các hàm đang dùng cho học viên | Không thêm bảng hay migration, số liệu luôn khớp màn học viên; chậm dần khi hàng nghìn học viên (pilot vài chục đến vài trăm) | **A** |
| | B. Bảng tổng hợp lưu sẵn | Nhanh khi rất đông, nhưng thêm bảng, phải cập nhật mỗi lần trả lời, dễ lệch | Loại |
| Vị trí giao diện | Quản lý ở `#manager`; quản trị ở `#admin/users` (tab trong khu quản trị) | Tách khỏi trang dài hiện có | **Chọn** |
| | Nối thêm vào trang quản trị dài | Ít file nhưng khó dùng, khó test | Loại |
| Thứ tự làm | A. Theo lát cắt dùng được: (1) bảo mật và API người dùng, (2) màn Người dùng, (3) quản lý, (4) tồn giao diện, (5) nâng cấp VPS và demo | Mỗi bước chạy được riêng, có thể cắt phần cuối | **A** |
| | B. Hết server rồi hết web | Ít đổi ngữ cảnh nhưng cuối mới có gì để demo | Loại |

## 6. Thiết kế

### 6.1 Người dùng: server (admin)

Tất cả yêu cầu `admin`, ghi `Audit` (không ghi mật khẩu), kiểm CSRF/Origin như các route ghi hiện có.

- `GET /admin/users?role=&status=&q=&page=&limit=`: danh sách có phân trang (mặc định 50/trang, tối đa 200). Trả `id, username, displayName, role, disabled (bool), mustChangePassword, createdAt, lastLoginAt`. Lọc theo vai trò, trạng thái (đang hoạt động / đã khóa), tìm theo tên đăng nhập hoặc tên hiển thị (không phân biệt hoa thường).
- `POST /admin/users` (có sẵn): thêm kiểm trùng tên **không phân biệt hoa thường**.
- `PATCH /admin/users/:id`: `displayName` (≤ 80), `disabled` (bool). Khóa đặt `disabledAt = now` **và xóa mọi `AuthSession` của người đó trong cùng giao dịch**; mở khóa xóa `disabledAt`.
- `POST /admin/users/:id/reset-password`: server tạo mật khẩu tạm ngẫu nhiên, đặt `mustChangePassword = true`, thu hồi mọi phiên của người đó, trả mật khẩu tạm **một lần duy nhất** trong phản hồi. Học viên 12 ký tự dễ gõ (bảng chữ bỏ ký tự dễ nhầm); vai trò khác 20 ký tự.
- `POST /admin/users/bulk`: nhận tối đa 500 dòng `{ username, displayName?, password? }`, vai trò cố định `student`; mật khẩu trống thì server tạo; chế độ `dryRun` chỉ báo cáo. Trả báo cáo từng dòng (tạo được, bỏ qua vì trùng, lỗi định dạng). Mật khẩu tạo ra chỉ nằm trong phản hồi; không lưu.
- `DELETE /admin/users/:id` với `confirmUsername` trùng tên: xóa cứng người dùng (nhật ký và tiến độ của họ xóa theo, do khóa ngoại `onDelete: Cascade`) và mọi phiên. Mặc định giao diện khuyên khóa thay vì xóa.
- Ràng buộc an toàn: quản trị **không** tự khóa, tự xóa, hoặc khóa/xóa quản trị đang hoạt động cuối cùng (400 có lời giải thích). Khóa, đặt lại, xóa một `admin` khác được phép nhưng ghi `Audit`.
- `Auth.actor` từ chối (401) phiên của người dùng đã khóa, kể cả khi một phiên còn sót lại.
- Tên đăng nhập không phân biệt hoa thường ở đăng nhập (tìm theo chữ thường) và ở tạo mới; thêm chỉ mục duy nhất trên chữ thường (migration cộng thêm, kiểm trước có trùng để báo rõ nếu có). Giới hạn đăng nhập đã khóa theo chữ thường nên khớp.
- Đổi mật khẩu (`POST /me/password`) **xoay token phiên và CSRF** của phiên hiện tại (cookie mới) trong khi vẫn thu hồi các phiên khác.

### 6.2 Quản lý: server

Yêu cầu `manager` hoặc `admin` (`requireManager`); chỉ đọc; chỉ người dùng vai trò `student`; không bao giờ trả tài khoản nhân viên, mật khẩu hay dữ liệu nháp (danh mục lấy qua phạm vi phiên của người gọi).

- `GET /manager/learners?sort=&filter=&q=&page=&limit=`: mỗi dòng gồm:
  - `đang học`: số loài có ít nhất một kỹ năng đã học (không tính nghe tên).
  - `đã vững`: số loài ở mức nhớ ≥ 3 (mốc 7 ngày trở lên).
  - `mức nhớ trung bình`: trung bình mức nhớ (0–4, một chữ số thập phân) trên các loài đang học.
  - `lần học cuối`: thời điểm câu trả lời gần nhất không bị bỏ qua.
  - `quá hạn`: số loài có mục đến hạn ôn (theo hạn hiệu lực).
  - `phiên 7 ngày`: số phiên khác nhau có câu trả lời trong 7 ngày gần nhất (giờ `Asia/Ho_Chi_Minh`).
  - cờ `disabled`.
  Sắp xếp theo mọi cột; lọc "chưa học 7 ngày", "có mục quá hạn", "đã khóa"; tìm theo tên. Mặc định ẩn người đã khóa, có công tắc để hiện.
- `GET /manager/learners/:id`, `/progress`, `/review`, `/mastery`: cùng khuôn với `/me/*` nhưng cho một học viên cụ thể (dùng lại logic của `ProgressService` với tham số `userId`); `404` nếu id không phải học viên.
- `GET /manager/learners.csv`: cùng bộ lọc, UTF-8 có BOM để Excel đọc đúng tiếng Việt, tiêu đề tiếng Việt. Ô bắt đầu bằng `=`, `+`, `-`, `@` hoặc ký tự điều khiển được thêm dấu nháy đơn phía trước (chống chèn công thức). Không có mật khẩu.

### 6.3 Giao diện

- **Quản lý** (`#manager`, `#manager/learner/<id>`): nhóm vai trò `manager` có hai tab "Học viên" và "Thư viện" (đã bỏ `ManagerNotice`). Bảng ở desktop; dưới 600px đổi thành thẻ xếp dọc (tên, lần học cuối, đang học, quá hạn, bấm mở). Hàng "chưa học 7 ngày" và quá hạn có nhãn chữ (không chỉ màu). Chi tiết dùng lại các màn Tiến độ, Ôn tập, Thành tích ở chế độ chỉ đọc (tiêu đề "Học viên: <tên>", nút quay lại danh sách), gọi `/manager/learners/:id/*`. Nút "Xuất CSV". Tông băng (ice), theo `DESIGN.md`.
- **Quản trị** (`#admin/users`): khu quản trị có hai tab "Nội dung" (trang hiện có, giữ nguyên route `#admin`) và "Người dùng". Danh sách + bộ lọc + tìm; hành động từng dòng (Khóa/Mở khóa, Đặt lại mật khẩu, Xóa); hộp tạo người dùng (vai trò, tên đăng nhập, tên hiển thị, mật khẩu hoặc "Tạo tự động"); hộp "Tạo hàng loạt" nhận CSV, xem trước kết quả (dùng dạng xem trước đã có ở nhập danh mục CSV) rồi mới tạo. Mật khẩu tạm hiện một lần trong khung có nút sao chép; tạo hàng loạt cho tải một CSV kết quả ngay trên trình duyệt (không lưu lại). Xóa buộc gõ lại tên.
- `role.ts`: `manager` được `['manager','library','profile/...']` (và `account`); `/me/*` vẫn **không** gọi cho manager/admin; bảng kiểm thử tự động "không gọi `/me`" cập nhật cho các route mới và thêm kiểm "học viên không vào được `#manager` hay `#admin/users`".

### 6.4 Nâng cấp VPS và tài khoản "An"

- `docs/DEPLOY_UPGRADE_25.md`, theo mẫu `DEPLOY_UPGRADE_r2.md`: sao lưu trước (`backup-pilot.sh`), build và đẩy ảnh (`publish-pilot.sh <tag>`), đổi mã ảnh trong `.local/pilot.env` của VPS, kéo ảnh, `migrate` (hai migration: 2.5a và chỉ mục tên không phân biệt hoa thường), tạo lại dịch vụ (API trước, web sau), kiểm sức khỏe, `smoke`, tạo "An" qua màn Người dùng, đăng nhập thử, cách quay lại. Ghi các lưu ý: khóa theo người dùng nằm trong tiến trình (một container API), `rebuild:progress` chạy khi API dừng, tiến độ HS đặt lại khi sửa ghi chú/SKU/ảnh của loài, chế độ nội bộ `ALLOW_INTERNAL_DEMO`.
- Tài khoản "An": tạo trong giao diện, mật khẩu do chủ dự án chọn ở lúc tạo (không đưa vào repo, log hay chat).
- Công cụ tùy chọn `scripts/demo-learner-play.mjs`: đăng nhập bằng tài khoản học viên được nhập ở prompt (mật khẩu ẩn) và chơi vài mẻ qua API thật để bảng quản lý có dữ liệu cho demo; không dùng quyền quản trị, không ghi gì vào DB bằng đường khác, từ chối chạy nếu không có xác nhận rõ khi địa chỉ không phải local. Đây là quyết định của agent (mục 9).

## 7. Ràng buộc

- Migration chỉ cộng thêm (một migration mới: chỉ mục duy nhất trên chữ thường của tên đăng nhập, kiểm trùng trước).
- API cũ tương thích; chỉ thêm. Chạy `npm run contract:generate`, commit `docs/api/openapi.json`.
- Giao diện theo `apps/web/DESIGN.md`; di động trước (từ 320px), mục chạm ≥ 44px, giảm chuyển động, bàn phím thao tác được; tiếng Việt có dấu.
- Không in mật khẩu, mã mời, `.local/pilot.env`; mật khẩu tạm không vào log, `Audit` hay CSV xuất của quản lý.
- Không có dòng nào trên giao diện học viên nhắc việc quản lý xem tiến độ.
- Mỗi endpoint quản lý/quản trị kiểm vai trò ở server; chặn bằng danh sách cho phép, không dùng danh sách chặn.
- Giữ mọi ca E2E hiện có (25 đạt, 3 bỏ qua) và thêm ca mới.

## 8. Các việc còn tồn được gộp vào 2.5c

**Bảo mật và toàn vẹn (làm trước, bước 1)**
- Khóa thu hồi phiên và `Auth.actor` chặn người dùng bị khóa (6.1).
- Tên đăng nhập không phân biệt hoa thường: tìm khi đăng nhập, kiểm trùng khi tạo, chỉ mục duy nhất (6.1); xử lý luôn việc bộ đếm giới hạn dùng chung cho hai tên khác hoa thường.
- Xoay token phiên và CSRF khi đổi mật khẩu (6.1).
- `rebuild:progress`: ghi rõ trong tài liệu nâng cấp "chạy khi API dừng"; không thêm cơ chế khóa mới (quyết định của agent).

**Giao diện học viên**
- Dòng chú thích kỹ năng sửa "đã qua mốc 3 ngày" thành "đã lên mốc 3 ngày".
- Đăng xuất khi còn câu đang lưu: hộp xác nhận không hiện sai cho một câu server đã có (đợi bước lấy kết quả từ server sau lỗi 409 chung cuộc xong, hoặc không tính câu đó); chống bấm đúp "Đăng xuất" đến khi yêu cầu hoàn tất; màn đổi mật khẩu bắt buộc hiện trạng thái "Đang lưu tiến độ…" khi đang chờ lưu; kiểm tra tiêu đề không bị chen chúc trên điện thoại khi hiện "Đang lưu".
- Tên loài bị cắt ở màn Ôn tập (cho phép hai dòng); chip nhóm có 0 loài (ẩn hoặc làm mờ không bấm được); ô trạng thái "Đã lưu tự đánh giá" không còn hình nút.
- Gom màu gõ cứng `#f4f8f9` và bóng phao trong `library.css`, `home.css`, `float-rope.css` về token; một bộ lắng nghe `online` chung cho các hàng đợi; "Invalid Date" hiện "—" ở màn Ôn tập; bản đồ tên tiền tố chỉ gộp khi có đúng một mã đích; thử lại hiện số ngày khi `afterSubmit` thất bại (lấy từ tổng kết server); kiểm thử `limit` chỉ gửi khi có.

**Hạ tầng**
- Tách `errorStatus`/`errorBody` ra `errors.ts` để test không phải nhập `main.ts`.
- Thu gọn file `progress-review.vectors.json` (mỗi vector một dòng) để diff đọc được; test sinh lại phải khớp.
- `scripts/local-origin.test.mjs`: thêm ca `0.0.0.0` và host có thông tin đăng nhập; ghi chú trong tài liệu rằng mặc định `PILOT_ORIGIN` không còn lấy từ `PUBLIC_ORIGIN`.
- Câu chữ `DELIVERY_25B.md` về quản lý: trung tính ("chưa có màn quản lý"), không nói thay người dùng.

**Để lại sau 2.5c (ghi nhận, không làm):** `smoke-pilot.mjs` không có chốt loopback (chủ ý, nó chạy trên VPS); `succeed()` có thể hoàn lại một lượt cho nhóm IP mới ở mép cửa sổ; khóa theo người dùng trong tiến trình (một container API).

## 9. Quyết định của agent (người dùng kiểm khi đọc)

- Chọn tính khi đọc, vị trí giao diện và thứ tự làm như mục 5.
- Mật khẩu tạm do server tạo và chỉ hiện một lần; học viên 12 ký tự dễ gõ, vai trò khác 20 ký tự; đặt lại luôn buộc đổi mật khẩu và thu hồi phiên.
- Xóa cứng xóa luôn nhật ký và tiến độ của người đó (theo khóa ngoại hiện có); giao diện khuyên khóa.
- Quản trị không thể tự khóa/xóa mình hoặc quản trị cuối cùng.
- Định nghĩa các cột bảng quản lý (6.2), mặc định ẩn người đã khóa, CSV có BOM và chống chèn công thức.
- Đăng nhập không phân biệt hoa thường kèm chỉ mục duy nhất trên chữ thường (giải quyết luôn việc bàn phím điện thoại tự viết hoa).
- Công cụ `scripts/demo-learner-play.mjs` để có dữ liệu demo (có thể bỏ nếu không cần).
- Danh sách tồn cần làm và danh sách để lại ở mục 8.

## 10. Kiểm thử và nghiệm thu

- Test quyền (server): `student` và khách bị từ chối `/manager/*` và `/admin/users*`; `manager` không gọi được `/admin/*`; `manager` không thấy `admin`/`editor`; người dùng bị khóa bị 401 ở mọi route (cả phiên còn sót); khóa xóa phiên trong cùng giao dịch; không khóa/xóa được chính mình hay quản trị cuối.
- Test dữ liệu: các cột bảng quản lý đúng với mẫu nhật ký đã biết (đang học, đã vững, mức nhớ trung bình, lần học cuối, quá hạn, phiên 7 ngày qua nửa đêm giờ Việt Nam); chi tiết của một học viên bằng đúng `/me/*` của người đó; CSV chống chèn công thức, có BOM.
- Test hàng loạt: báo cáo từng dòng, trùng không phân biệt hoa thường bị bỏ qua, `dryRun` không ghi, mật khẩu tạo ra không nằm trong `Audit`.
- Test đăng nhập: `an`, `An`, `AN` vào cùng một tài khoản; hai tài khoản chỉ khác hoa thường không tạo được; đổi mật khẩu xoay cookie.
- E2E mới: quản trị tạo "An" trong giao diện, An học, quản lý thấy An trong bảng với lần học cuối và mức nhớ, mở chi tiết, xuất CSV; quản trị khóa An thì tab của An đang mở gặp 401 ở yêu cầu kế; đặt lại mật khẩu buộc đổi.
- Kiểm trực quan bằng ảnh chụp 390×844 và 1280×800 cho các màn mới, đọc lại và ghi lệch phong cách.
- Kiểm trên Docker local; sau đó thử nâng cấp VPS theo tài liệu (có sao lưu trước) cùng chủ dự án.

## 11. Để lại cho người build

- Tên route và DTO chính xác, kích thước trang, tên các cột CSV và thứ tự.
- Bảng chữ và độ dài mật khẩu tạm; cách xoay token phiên.
- Tên migration; cách báo lỗi khi đã có tên trùng hoa thường trong DB.
- Cách tách `userId` trong `ProgressService` cho cả `/me/*` và `/manager/*`.
- Khóa sắp xếp mặc định của bảng (đề xuất: lần học cuối, mới nhất trước).
