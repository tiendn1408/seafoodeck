# Phase 2.5c: quản lý theo dõi học viên, quản trị người dùng

Ngày 23/11/2026. Branch `feat/manager-admin-25c-part2` (gốc `main` tại `973ddd6`; phần đầu của 2.5c, task 1–5, đã nằm trên `main`). Spec: [2026-11-20-phase25c-manager-admin-design.md](superpowers/specs/2026-11-20-phase25c-manager-admin-design.md). Chưa build image phát hành, chưa push GHCR, chưa nâng cấp VPS. Quy trình nâng cấp: [DEPLOY_UPGRADE_25C.md](DEPLOY_UPGRADE_25C.md).

> **Lưu ý nâng cấp:** so với bản đang chạy trên VPS (`learner-demo-20261120-r1`), **không có migration mới**. Migration duy nhất của 2.5c (`202611200001_username_ci`, task 1) cùng `202611190001_learner_accounts` của 2.5a đã chạy trên VPS ngày 20/11; stack local báo "No pending migrations" khi dựng lại. Web và API vẫn phải nâng cùng lúc, cùng một tag. Sao lưu DB trước khi nâng cấp, theo runbook.

## Đã làm

**Bảo mật và tài khoản (server)**
- Khóa tài khoản xóa mọi phiên của người đó trong cùng giao dịch. Mọi route từ chối phiên của người đã khóa hoặc đã xóa (401), kể cả phiên còn sót.
- Tên đăng nhập không phân biệt hoa thường khi đăng nhập và khi tạo, có chỉ mục duy nhất trên `lower(username)`. `bootstrap` và `seed` cũng tra cứu không phân biệt hoa thường.
- Đổi mật khẩu (`POST /me/password`) xoay token phiên và CSRF. Web nhận CSRF mới ngay.
- Quản trị không tự khóa hay tự xóa được mình, và không khóa hay xóa được quản trị đang hoạt động cuối cùng. Phần kiểm này chạy trong giao dịch Serializable, kiểm lại chính người thao tác bên trong giao dịch.

**Người dùng (`#admin/users`, chỉ `admin`)**
- Ba tab "Nội dung | Người dùng | Học viên".
- Danh sách có phân trang, lọc vai trò và trạng thái, tìm theo tên. Ký tự `_` và `%` được tìm đúng nghĩa đen.
- Tạo người dùng: mật khẩu tự nhập hoặc "Tạo tự động". Mật khẩu tạm hiện một lần trong khung có nút sao chép.
- Mỗi dòng có Khóa/Mở khóa, Đặt lại mật khẩu (mật khẩu tạm hiện một lần, buộc đổi, thu hồi phiên) và Xóa (phải gõ lại tên). Dòng học viên có thêm "Xem tiến độ".
- Khi quản trị tự đặt lại mật khẩu của mình, mọi thao tác dừng cho tới khi đóng khung mật khẩu. Rời trang hay đăng xuất đều hỏi xác nhận trước.
- "Tạo hàng loạt" từ CSV, tối đa 500 dòng, vai trò `student`. Phải xem trước (dry-run) rồi mới tạo. Báo cáo từng dòng: tạo được, bỏ qua vì trùng, chưa tạo được. CSV mật khẩu tạm chỉ tạo trong trình duyệt.

**Quản lý (`#manager`, `#manager/learner/<id>`; `manager` và `admin`)**
- Bảng học viên gồm các cột: đang học, đã vững, mức nhớ TB, lần học cuối, quá hạn, phiên 7 ngày. Có nhãn "Đã khóa".
- Bảng sắp xếp được theo mọi cột. Lọc (chọn một): "Chưa học 7 ngày", "Có mục quá hạn". Có công tắc "Hiện người đã khóa" và ô tìm theo tên.
- Desktop hiện bảng. Dưới 600 px hiện thẻ, kèm ô chọn cách sắp xếp.
- "Xuất CSV" có cùng bộ lọc với bảng. File UTF-8 có BOM, tiêu đề tiếng Việt, chống chèn công thức.
- Chi tiết học viên chỉ đọc: Tiến độ, Thành tích, Lịch ôn tập của đúng người đó, không có nút học hay ôn. Hiện "Không tìm thấy học viên." với id không phải học viên.
- Manager có hai tab "Học viên | Thư viện". Manager không gọi `/me/*`, không có route học hay tài khoản. Trang hồ sơ loài không hiện nút học cho manager (đã kiểm trong e2e).

**Giao diện học viên và hạ tầng (các việc còn tồn)**
- Phiên bị khóa hoặc hết hạn (401) đưa về màn đăng nhập.
- Đăng xuất khi còn câu đang lưu: hỏi xác nhận đúng, chống bấm đúp. Header điện thoại hiện "Đang lưu tiến độ…".
- Một bộ lắng nghe `online` chung. Tên loài ở Ôn tập hiện được hai dòng. Chip nhóm 0 loài bị làm mờ và không bấm được. Ô trạng thái tự đánh giá không còn hình nút. Màu và bóng gõ cứng gom về token (trừ bóng trên nền nước sâu ở `home.css` và `float-rope.css`, chủ ý giữ).
- `errors.ts` tách khỏi `main.ts`. `progress-review.vectors.json` thu gọn mỗi vector một dòng. Thêm ca cho `local-origin`.
- Runbook nâng cấp VPS ([DEPLOY_UPGRADE_25C.md](DEPLOY_UPGRADE_25C.md)).
- Công cụ tùy chọn `scripts/demo-learner-play.mjs`: chơi vài phiên flashcard bằng một tài khoản học viên để bảng manager có số liệu. Mật khẩu nhập qua prompt ẩn. Mặc định từ chối địa chỉ không phải local.

## API mới

Tất cả dưới `/api/v1`, kiểm vai trò ở server, kiểm CSRF và Origin cho route ghi. Đặc tả: [docs/api/openapi.json](api/openapi.json).

| Route | Vai trò | Ghi chú |
|---|---|---|
| `GET /admin/users?role&status&q&page&limit` | admin | `{items, total, page, limit}`; mặc định 50, tối đa 200 |
| `PATCH /admin/users/:id` `{displayName?, disabled?}` | admin | khóa thì xóa mọi phiên; 400 khi tự khóa hoặc khóa quản trị cuối; 401 khi chính người thao tác đã bị khóa; 409 `BUSY` khi xung đột |
| `POST /admin/users/:id/reset-password` | admin | `{temporaryPassword}` một lần; học viên 12 ký tự, vai trò khác 20 |
| `DELETE /admin/users/:id` `{confirmUsername}` | admin | xóa cứng; nhật ký và tiến độ xóa theo; `Audit` giữ lại |
| `POST /admin/users/bulk` `{rows, dryRun?}` | admin | ≤ 500 dòng; mỗi dòng một giao dịch; mật khẩu chỉ ở lần chạy thật |
| `POST /admin/users` (đã có) | admin | thêm kiểm trùng không phân biệt hoa thường (409) |
| `GET /manager/learners?sort&dir&filter&q&page&limit&includeDisabled` | manager, admin | chỉ tài khoản `student` |
| `GET /manager/learners.csv` | manager, admin | `text/csv; charset=utf-8`, `attachment; filename="hoc-vien.csv"`, có BOM |
| `GET /manager/learners/:id` và `/progress`, `/review`, `/mastery` | manager, admin | cùng khuôn với `/me/*` của học viên đó; 404 nếu id không phải học viên |

Một tài khoản manager còn phải đổi mật khẩu nhận `403 MUST_CHANGE_PASSWORD` ở mọi route trên.

## Các quyết định

Theo spec mục 2, 9 và 12:
- Manager xem **tất cả** học viên, không có nhóm.
- Giao diện học viên không nhắc việc manager xem tiến độ.
- Số liệu manager tính khi đọc bằng đúng các hàm của học viên, không thêm bảng hay migration.
- Mật khẩu tạm do server tạo và chỉ hiện một lần.
- Xóa cứng xóa luôn tiến độ; giao diện khuyên khóa thay vì xóa.
- `admin` cũng vào được `#manager`.

Quyết định thêm trong task 15:
- Quản trị không tạo được qua API (`POST /admin/users` không nhận vai trò `admin`). Vì vậy kiểm hai quản trị khóa nhau cùng lúc dùng script riêng: `scripts/admin-lock-race-check.mjs` tạo quản trị QA bằng `bootstrap` trong image API, chỉ chạy với stack local.
- Stack local được dựng lại với tag `manager-admin-25c-local` (đặt `API_TAG` và `WEB_TAG` ở shell). Mục đích là để `/api/v1/health` báo đúng bản đang kiểm và không ghi đè ảnh local `pilot-internal-20261118-r2`.

## Kiểm tra

Số liệu thực tế ngày 23/11/2026, commit `5c3b9ae` cộng commit tài liệu này:
- `npm test`:
  - web 407/407 (38 file)
  - API 398/398
  - scripts 29/29
- `typecheck`, `lint` (0 lỗi, 1 cảnh báo cũ ở `Admin.tsx`), `format:check`, `build` đều đạt.
- `contract:generate` chạy lại không làm đổi `docs/api/openapi.json`.
- `npm run test:e2e` chạy **hai lần liên tiếp** trên stack local `seafoodeck-pilot-acceptance` (cổng 18089, release `manager-admin-25c-local`). Cả hai lần đều ra **37 đạt, 3 bỏ qua, 0 lỗi** trên 40 ca (khoảng 56 giây mỗi lần).
  - Trong 37 ca đạt có 2 ca "lỗi đã biết" (`test.fail`, xem mục dưới).
  - 3 ca bỏ qua là ba ca khung hình điện thoại, chỉ chạy ở project mobile, như trước.
  - So với mốc 25/3: thêm 6 ca × 2 project = 12 ca.
    - (1) Quản trị tạo "An" trong giao diện, An đăng nhập và học; manager thấy An (học hôm nay, đang học > 0), sắp xếp, xuất CSV (BOM, có An), mở chi tiết chỉ đọc. Học viên không vào được `#manager` hay `#admin/users`; manager không vào được `#admin/users`; hồ sơ loài không có nút học cho manager. Khóa An khi tab An đang mở: yêu cầu kế tiếp đưa An về màn đăng nhập, đăng nhập lại bị từ chối; mở khóa thì tiến độ vẫn còn. Đặt lại mật khẩu: mật khẩu tạm, buộc đổi, rồi dùng bình thường.
    - (2) Tạo `qa-dup-…` khi đã có `qa-Dup-…` thì báo "Tên đăng nhập đã tồn tại."; đăng nhập bằng `qa-dUP-…` vào đúng tài khoản. Tạo hàng loạt 3 dòng (một dòng trùng): xem trước ra 2 tạo được, 1 bỏ qua; tạo thật rồi tải được CSV mật khẩu.
    - (3) Kiểm HTTP thật cho `/manager/learners`, `.csv`, `/:id`, `/progress`, `/review`, `/mastery`:
      - manager và admin nhận 200; student, editor, học thử nhận 403; khách nhận 401; manager phải đổi mật khẩu nhận 403 `MUST_CHANGE_PASSWORD`.
      - Id của manager, editor, owner, id ngẫu nhiên và `x` đều nhận 404.
      - ValidationPipe trả 400 cho `sort`, `dir`, `filter`, `limit=201`, `page=0`, `limit=abc` sai.
      - `/progress` của manager trùng `/me/progress` của học viên đó.
      - Header CSV đúng.
      - Manager nhận 403 ở `/admin/users`.
    - (4) `q=_` và `q=%` ở `GET /admin/users` (Postgres thật) và `/manager/learners` khớp đúng nghĩa đen.
    - (5) `#admin/users`, hộp tạo, hộp tạo hàng loạt, `#manager`: không cuộn ngang, mục chạm ≥ 44 px. Ngoại lệ đã ghi nhận: nút sắp xếp cột "Tên".
    - (6) Chi tiết học viên không cuộn ngang: **lỗi đã biết**, xem mục dưới.
- Hai quản trị khóa nhau cùng lúc trên Postgres thật: `node scripts/admin-lock-race-check.mjs --rounds 5` đạt 5/5 vòng.
  - Mỗi vòng một yêu cầu 200, yêu cầu kia 401 (người thao tác đã bị khóa), và đúng một quản trị của cặp còn hoạt động.
  - Cả năm vòng đều ra 401, không vòng nào ra 409 hay 400. Vì vậy chưa chứng minh được là hai giao dịch thật sự chồng lên nhau (nhánh thử lại Serializable). Chỉ kiểm được kết quả cuối luôn đúng.
- Kiểm trực quan bằng Playwright ở 390×844, 720×900 và 1280×800 (sáng và tối) cho các màn Người dùng, hộp thoại, bảng/thẻ manager, chi tiết, 404 và màn đăng nhập sau khi bị khóa. Ảnh lưu ở `apps/web/.impeccable/review/2.5c/` (không commit).

### Lỗi đã biết (chưa sửa trong lượt này)

- **Chi tiết học viên (`#manager/learner/<id>`) cuộn ngang.**
  - Ở 1280×800, chiều rộng trang là 2421 px.
  - Trên điện thoại, trang bị thu nhỏ vì khung bố cục giãn tới 1200 px.
  - Nguyên nhân: hai dải `.ice-hero` (Tiến độ học, Lịch ôn tập) tràn ra mép bằng `::after` với `inset: auto -100vmax 0`. Màn học viên bọc các dải này trong `.ice-stage { overflow-x: clip }`, còn màn chi tiết của manager thì không.
  - E2E ghi nhận lỗi này bằng `test.fail` (đặt `E2E_SHOW_KNOWN=1` để thấy lỗi thật). Khi sửa xong thì bỏ dòng đó.
- Nút sắp xếp cột "Tên" rộng 33 px, dưới mức 44 px.

## Chưa làm

Theo spec mục 3 (không làm ở vòng này):
- Nhóm hoặc đội, phân quyền theo phòng ban.
- Quản lý sửa nội dung.
- Đăng ký tự phục vụ, quên mật khẩu qua email, SSO, xác thực hai lớp.
- Màn xem nhật ký thay đổi cho người dùng. `Audit` vẫn ghi mọi thao tác.
- Nhập tiến độ cũ từ trình duyệt.

Chưa build ảnh phát hành, chưa push GHCR, chưa nâng cấp VPS. Chưa thử quay lại ảnh r1 trên DB đã có dữ liệu 2.5c.

Các điểm nhỏ đã ghi nhận qua các vòng review, chưa làm (để triage sau):
- **Server**
  - Lỗi P2002 chưa thu hẹp theo cột.
  - Tra tên bằng ILIKE không dùng chỉ mục `lower()` (đủ cho quy mô pilot).
  - Phiên xoay khi đổi mật khẩu chép vai trò từ phiên cũ.
  - Mỗi yêu cầu đọc phiên hai lần.
  - Bảng manager đọc toàn bộ lượt trả lời, chưa có cửa sổ hay `groupBy`.
  - `includeDisabled` chỉ nhận `true`.
  - Tạo hàng loạt mất khoảng 9 giây cho 500 dòng (giao diện cảnh báo không đóng trang). Một lỗi commit mơ hồ có thể làm mất mật khẩu đã tạo; quản trị đặt lại được.
  - Mật khẩu tạo hàng loạt tối đa 128 ký tự, nơi khác là 150.
  - Thông báo 401 chung cho phiên hết hạn hoặc bị khóa vẫn nói "nhập lại mã mời", kể cả với tài khoản nhân sự.
- **Web quản trị**
  - Khi khung mật khẩu tạm của chính quản trị đang hiện: nút thử lại ở thông báo lỗi vẫn bấm được.
  - Gạch chân tab có tương phản 2.8:1 ở trang Người dùng.
  - Màu nền đổi giữa `#admin` và `#admin/users` (vì `:has()` cần Firefox 121+).
  - Màu lớp phủ hộp thoại còn gõ cứng.
- **Tạo hàng loạt**
  - Khi dán CSV không có dòng tiêu đề, dòng đầu bị bỏ mà chỉ có cảnh báo nhẹ.
  - Lỗi server hiện hai lần.
  - Chạy thất bại thì ô nhập bị xóa (không có "sửa các dòng lỗi").
  - Câu báo khi mất phản hồi chưa nhắc kiểm lại danh sách.
  - Tên bắt đầu bằng `-` bị thêm `'` trong CSV mật khẩu.
  - Dấu ngoặc kép không đóng nuốt hết phần còn lại của file.
- **Web quản lý**
  - Chip lọc chỉ chọn một nhưng chưa nói rõ.
  - Câu trạng thái rỗng nháy khi tải lại.
  - Admin ở `#manager` không có tab "Quản trị" được đánh dấu.
  - Id trên route bị mã hóa hai lần với id không phải UUID.
  - Thẻ `<p>` rỗng ở Ôn tập chỉ đọc.
  - Chip nhóm rỗng bị làm mờ cả chữ.
- **Shell**
  - `leaveGuard` dùng `location.replace`, ghi đè một mục lịch sử.
  - Chưa có test cho hai lỗi 401 cùng lúc và lỗi 401 trong lúc đăng xuất.
  - Nút Hủy ở màn đổi mật khẩu vẫn bấm được khi đang chờ lưu.
- **Quan sát trực quan khác**: xem báo cáo task 15. Ví dụ:
  - Ở 720 px, cột "Phiên 7 ngày" nằm ngoài vùng cuộn mà không có dấu hiệu.
  - Tên đăng nhập dài xuống dòng giữa từ trong bảng.
  - Bảng Người dùng ở 1280 px có cột thao tác lệch hàng.
  - Trên điện thoại, phần lọc của bảng manager chiếm gần hết màn đầu.

## Chạy E2E

```sh
npm ci && npx playwright install chromium     # lần đầu
API_TAG=manager-admin-25c-local WEB_TAG=manager-admin-25c-local \
  docker compose --env-file .local/pilot.env up -d --build
node scripts/wait-pilot.mjs
curl -s http://127.0.0.1:18089/api/v1/health    # "release":"manager-admin-25c-local"
npm run test:e2e
# tùy chọn, kiểm hai quản trị khóa nhau (cần Docker của stack này):
API_TAG=manager-admin-25c-local node scripts/admin-lock-race-check.mjs --rounds 5
```

- Đặt `API_TAG` và `WEB_TAG` là tùy chọn. Không đặt thì compose dựng lại và ghi đè ảnh local `pilot-internal-20261118-r2`, và health vẫn báo tên đó dù mã đã mới.
- **Chỉ chạy với stack local.** E2E và script từ chối origin không phải 127.0.0.1, localhost hay ::1. **Không bao giờ chạy trên VPS.**
- **Tác dụng phụ: tài khoản ở lại DB local**
  - Mỗi lần chạy, mỗi project (desktop, mobile) tạo qua API quản trị:
    - các tài khoản `qa-e2e-<stamp>-{student,second,persist,must,manager,managerMust,editor}`
    - qua giao diện: `qa-An-<stamp>`, `qa-Dup-<stamp>`, `qa-bulk1/2-<stamp>`
    - `qa_us_<stamp>`
  - Mật khẩu ngẫu nhiên, không in ra. Các tài khoản này ở lại trong DB local.
  - Script quản trị tạo các quản trị `qa-race<n><a|b>-<stamp>`, rồi khóa hết.
- Ca quản trị nội dung đăng một release nội bộ thử rồi rollback, như trước.
- Mỗi lần chạy có 2 lần đăng nhập sai có chủ đích (An bị khóa). Đăng nhập thành công không tốn hạn mức.
- Nếu gặp 429, chỉ khởi động lại API của repo này rồi chờ: `docker compose --env-file .local/pilot.env restart api`, sau đó `node scripts/wait-pilot.mjs`.
