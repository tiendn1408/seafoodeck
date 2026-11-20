# Giai đoạn 2.5c: quản lý theo dõi học viên, quản trị người dùng, nâng cấp VPS: kế hoạch triển khai

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Quản lý xem được tất cả học viên (bảng, chi tiết, CSV), quản trị tự tạo/khóa/đặt lại mật khẩu/xóa người dùng trong giao diện, khóa thì phiên chết ngay, có tài liệu nâng cấp VPS và công cụ tạo dữ liệu demo; gộp các việc còn tồn của 2.5a/2.5b.

**Architecture:**
- **Server:** logic thuần mới (`progress-manager.ts`, `csv.ts`, `users.ts`) cộng `UsersService`/controller quản trị và controller quản lý; tính số liệu quản lý **khi đọc** bằng các hàm đã có của `ProgressService`, nay nhận thêm `userId` của học viên cần xem.
- **Web:** mục "Người dùng" ở `#admin/users` (tab trong khu quản trị), màn quản lý ở `#manager` và `#manager/learner/<id>`; chi tiết dùng lại các màn Tiến độ và Ôn tập ở chế độ chỉ đọc.
- **Thứ tự:** theo lát cắt dùng được (xem spec mục 5): bảo mật và API người dùng → màn Người dùng → quản lý → tồn giao diện → hạ tầng, tài liệu và demo.

**Tech Stack:** NestJS + Prisma + PostgreSQL (`node:test` sau `tsc`), React 19 + Vite (Vitest/jsdom, `testDom.ts`; **không** có `@testing-library/react`, không thêm thư viện), Playwright e2e.

**Spec:** `docs/superpowers/specs/2026-11-20-phase25c-manager-admin-design.md` (mục 6, 8, 12 là ràng buộc). Việc để lại từ vòng trước: `docs/handoffs/2026-11-20-phase25a-followups.md`.

## Global Constraints

- Migration **chỉ cộng thêm**; chỉ một migration mới (chỉ mục duy nhất trên chữ thường của tên đăng nhập), thư mục `apps/api/prisma/migrations/202611200001_username_ci/`. Dừng với thông báo rõ nếu đang có tên trùng khác hoa thường.
- API cũ tương thích; chỉ thêm. Chạy `npm run contract:generate` và commit `docs/api/openapi.json` khi đổi.
- File API phẳng trong `apps/api/src/`; file logic thuần không import Nest/Prisma. Không thư mục con.
- Mọi endpoint quản lý/quản trị kiểm vai trò ở server theo **danh sách cho phép**; `manager` chỉ xem học viên (vai trò `student`), không bao giờ thấy tài khoản nhân viên, mật khẩu, dữ liệu nháp. Quản lý lấy danh mục qua phạm vi phiên của người gọi.
- Không in mật khẩu, mã mời, `.local/pilot.env`; **mật khẩu tạm không vào log, không vào `Audit`, không vào CSV xuất của quản lý, không lưu lại**: chỉ có trong một phản hồi và hiện một lần ở trình duyệt.
- Không có dòng nào trên giao diện học viên nhắc việc quản lý xem tiến độ.
- Giao diện theo `apps/web/DESIGN.md` (đọc cùng `PRODUCT.md` trước khi làm UI); di động trước từ 320px, mục chạm ≥ 44px, giảm chuyển động, bàn phím thao tác được; tiếng Việt có dấu; tương phản chữ ≥ 4.5:1, phi chữ ≥ 3:1 (tính từ token thật).
- Giữ mọi ca E2E hiện có (25 đạt, 3 bỏ qua) và thêm ca mới. Script kiểm local chỉ chạy local (chốt `scripts/local-origin.mjs`).
- Sau mỗi task: `npm test`, `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run build` (từ thư mục gốc) đều pass.

## Review Focus

1. **Người dùng bị khóa khi đang học:** yêu cầu kế tiếp (kể cả câu đang trong hàng đợi gửi nền) nhận 401, trình duyệt quay về màn đăng nhập, không lặp thử lại, không hiện lỗi chung chung. → test ở Task 2 (server) và Task 11 (web).
2. **Tự khóa hoặc khóa quản trị cuối cùng, kể cả hai quản trị cùng khóa nhau đồng thời:** luôn còn ít nhất một quản trị hoạt động. → test ở Task 3 (giao dịch tuần tự hóa, hai yêu cầu song song).
3. **Tên đăng nhập hoa thường ở mọi bề mặt:** tạo `An` rồi `an` → 409; đăng nhập `aN` vào đúng tài khoản; bộ đếm giới hạn chung; trong **cùng một file CSV hàng loạt** `An` và `an` → dòng sau bị bỏ qua. → test ở Task 1 và Task 4.
4. **Quản lý nhìn học viên chưa học gì, học viên đã khóa, và id không phải học viên:** chưa có câu trả lời nào → các số bằng 0, mức nhớ trung bình và lần học cuối là null (không chia cho 0, sắp xếp xếp null cuối); id của `admin`/nhân viên/chính mình → 404; mặc định ẩn người đã khóa. → test ở Task 7 và Task 8.
5. **Tên bắt đầu bằng `=`, `+`, `-`, `@`, tab hoặc xuống dòng trong CSV xuất:** không thành công thức khi mở bằng Excel. → test ở Task 8.

---

### Task 1: Tên đăng nhập không phân biệt hoa thường

**Files:**
- Create: `apps/api/prisma/migrations/202611200001_username_ci/migration.sql`, `apps/api/src/users.ts`, `apps/api/src/users.test.ts`
- Modify: `apps/api/prisma/schema.prisma` (chỉ ghi chú: chỉ mục hàm không mô hình hóa được), `apps/api/src/auth.controller.ts`, `apps/api/src/admin-extra.controller.ts` (`POST /admin/users`), `apps/api/src/me-access.test.ts`

**Interfaces:**
- Produces (`users.ts`, thuần): `normalizeUsername(name: string): string` (cắt khoảng trắng, chữ thường); `generateTempPassword(role: string): string` (12 ký tự cho `student`, 20 cho vai trò khác; bảng chữ bỏ `0 O o 1 l I`; dùng `node:crypto` `randomInt`).
- Produces: `findUserByUsername(db: Pick<Db,'user'>, name: string)` (so khớp không phân biệt hoa thường: `findFirst({ where: { username: { equals: name, mode: 'insensitive' } } })`), dùng ở đăng nhập và kiểm trùng khi tạo.

- [ ] **Step 1: Test.** `users.test.ts`: `normalizeUsername(' An ')` = `'an'`; `generateTempPassword('student')` dài 12, vai trò khác dài 20, không chứa ký tự dễ nhầm, hai lần gọi khác nhau; không có thiên lệch rõ ràng (mọi ký tự thuộc bảng chữ). `me-access.test.ts`: đăng nhập `aN` vào tài khoản `An` thành công; tạo `an` khi đã có `An` trả 409 với thông báo tiếng Việt; bộ đếm giới hạn dùng chung cho `An`/`aN` (đã khóa theo chữ thường). Chạy → FAIL.
- [ ] **Step 2:** Migration SQL viết tay: khối `DO $$ … $$` kiểm các nhóm `lower("username")` trùng và `RAISE EXCEPTION` kèm danh sách tên; sau đó `CREATE UNIQUE INDEX "User_username_lower_key" ON "User" (lower("username"));`. Cập nhật `schema.prisma` bằng ghi chú. Cài `users.ts`, nối đăng nhập và tạo. Tên vẫn lưu đúng như nhập.
- [ ] **Step 3:** Chạy test API → PASS; áp dụng migration lên DB local có dữ liệu bằng `docker compose --env-file .local/pilot.env run --rm migrate` (chỉ stack của repo này) và xác nhận không lỗi; thử trên DB giả có tên trùng để thấy thông báo dừng rõ (ghi bằng chứng trong báo cáo).
- [ ] **Step 4:** Commit `feat(api): case-insensitive usernames with unique index and temp password helper`.

### Task 2: Người dùng bị khóa bị chặn ở mọi route; xoay phiên khi đổi mật khẩu

**Files:**
- Modify: `apps/api/src/security.ts` (`Auth.actor`, `MustChangePasswordGuard`), `apps/api/src/me.controller.ts` (`POST /me/password`), `apps/api/src/auth.controller.ts`
- Test: `apps/api/src/me-access.test.ts`

**Interfaces:**
- Produces: `Auth.actor` với phiên có `userId`: tra `User` **một lần mỗi yêu cầu** (`disabledAt`, `mustChangePassword`), lưu tạm trên đối tượng yêu cầu để `MustChangePasswordGuard` dùng lại (không tra hai lần); nếu `disabledAt` khác null thì xóa phiên và ném 401 với thông báo chung (không lộ lý do, cùng câu với phiên hết hạn).
- Produces: `POST /me/password` thành công: tạo phiên mới (token và CSRF mới) cho cùng người dùng, xóa phiên cũ và mọi phiên khác, đặt cookie mới, phản hồi `AuthView` mới có `csrf` mới.

- [ ] **Step 1: Test.** (a) người dùng bị khóa (đặt `disabledAt`) với phiên còn nguyên: `GET /catalog/overview` trả 401 và dòng `AuthSession` bị xóa; (b) `MustChangePasswordGuard` và `Auth.actor` cùng tra người dùng đúng một lần mỗi yêu cầu (đếm lời gọi `user.findUnique`); (c) đổi mật khẩu trả `csrf` mới khác cũ, cookie mới khác cũ, cookie cũ không dùng được nữa, các phiên khác bị xóa; (d) phiên học thử (không có `userId`) không bị tra người dùng. Chạy → FAIL.
- [ ] **Step 2:** Implement. Chạy → PASS; toàn bộ test API cũ pass (đặc biệt luồng mã mời).
- [ ] **Step 3:** Commit `feat(api): reject locked users on every route and rotate the session on password change`.

### Task 3: API người dùng cho quản trị: danh sách, khóa, đặt lại, xóa

**Files:**
- Create: `apps/api/src/users.service.ts`, `apps/api/src/admin-users.controller.ts`, `apps/api/src/admin-users.test.ts`
- Modify: `apps/api/src/modules.ts`, `apps/api/src/contract.ts`

**Interfaces:**
- Consumes: `generateTempPassword`, `normalizeUsername`, `findUserByUsername` (Task 1), `revokeUserSessions` (đã có trong `security.ts`).
- Produces (tất cả `admin`, qua `AccessGuard` + `AdminOnlyGuard` + `requireRole(['admin'])`, ghi `Audit` không có mật khẩu):
  - `GET /admin/users?role=&status=&q=&page=&limit=` → `{ items: AdminUserRow[]; total: number; page: number; limit: number }`, `AdminUserRow = { id; username; displayName: string|null; role; disabled: boolean; mustChangePassword: boolean; createdAt: string; lastLoginAt: string|null }`; `status` là `active|disabled`; `q` khớp tên đăng nhập hoặc tên hiển thị không phân biệt hoa thường; mặc định 50 mỗi trang, tối đa 200.
  - `PATCH /admin/users/:id` thân `{ displayName?: string|null; disabled?: boolean }` (≤ 80 ký tự). `disabled: true` đặt `disabledAt` và xóa mọi `AuthSession` của người đó **trong cùng giao dịch**; `false` xóa `disabledAt`. Audit `user.disable` / `user.enable` / `user.update`.
  - `POST /admin/users/:id/reset-password` → `{ temporaryPassword: string }` (một lần); đặt `mustChangePassword = true`, đổi hash, thu hồi mọi phiên. Audit `user.reset-password` (không có mật khẩu).
  - `DELETE /admin/users/:id` thân `{ confirmUsername: string }` (phải trùng tên, không phân biệt hoa thường) → `{ deleted: true }`; xóa cứng (nhật ký và tiến độ xóa theo qua khóa ngoại), xóa mọi phiên; Audit `user.delete` kèm `username`, `role` trong `detail`.
  - Ràng buộc: không tự khóa, tự xóa; không khóa hoặc xóa `admin` hoạt động cuối cùng; kiểm trong giao dịch `Serializable` (đếm admin hoạt động còn lại) và thử lại khi xung đột tuần tự; 400 với lời giải thích tiếng Việt.

- [ ] **Step 1: Test.** Quyền: `student`, `manager`, `learner`, khách, nhân viên không phải admin đều bị từ chối cả bốn route. Danh sách: lọc vai trò/trạng thái/`q`, phân trang, không bao giờ trả `passwordHash`. Khóa: xóa phiên cùng giao dịch (nếu giao dịch lỗi thì không đổi gì); mở khóa. Đặt lại: mật khẩu tạm đúng độ dài theo vai trò, học viên đăng nhập được bằng nó và bị buộc đổi, phiên cũ bị xóa, **`Audit.detail` và mọi log không chứa mật khẩu**. Xóa: sai `confirmUsername` → 400 và không xóa; đúng thì xóa cả nhật ký và tiến độ và phiên; dòng `Audit` cũ của người đó còn nguyên. Ràng buộc (Review Focus 2): tự khóa/xóa bị từ chối; chỉ còn một admin thì khóa/xóa chính nó hoặc admin còn lại đều bị từ chối; hai admin **khóa nhau song song** (hai yêu cầu cùng lúc) kết thúc với đúng một admin còn hoạt động. Chạy → FAIL.
- [ ] **Step 2:** Implement; đăng ký trong `modules.ts`; cập nhật `contract.ts` và chạy `npm run contract:generate`; `git diff docs/api/openapi.json` chỉ thêm.
- [ ] **Step 3:** Chạy test API → PASS. Commit `feat(api): admin users list, lock, reset password and delete`.

### Task 4: Tạo hàng loạt từ CSV (có thể cắt nếu gấp, cùng Task 6)

**Files:**
- Modify: `apps/api/src/users.service.ts`, `apps/api/src/admin-users.controller.ts`, `apps/api/src/contract.ts`
- Test: `apps/api/src/admin-users.test.ts`

**Interfaces:**
- Produces: `POST /admin/users/bulk` thân `{ rows: { username: string; displayName?: string; password?: string }[]; dryRun?: boolean }` (tối đa 500 dòng, vai trò cố định `student`) → `{ dryRun: boolean; created: number; skipped: number; failed: number; rows: { line: number; username: string; status: 'created'|'duplicate'|'invalid'; message?: string; temporaryPassword?: string }[] }`.
  - Mỗi dòng một giao dịch riêng (một dòng lỗi không làm hỏng lô); dòng trùng tên (không phân biệt hoa thường, kể cả trùng **trong cùng lô**) → `duplicate`; tên sai định dạng (`^[a-zA-Z0-9_-]{3,50}$`) hoặc mật khẩu < 8 → `invalid`.
  - `dryRun: true` chỉ kiểm định dạng và trùng, **không tạo và không trả mật khẩu**; chạy thật: mật khẩu trống thì server tạo bằng `generateTempPassword('student')` và đặt `mustChangePassword = true`, trả `temporaryPassword` **chỉ trong phản hồi này**.
  - Audit một dòng tổng `user.bulk-create` (số lượng, không có mật khẩu).

- [ ] **Step 1: Test.** Review Focus 3: lô có `An` và `an` → dòng thứ hai `duplicate`; trùng với người dùng đã có (khác hoa thường) → `duplicate`; một dòng `invalid` không chặn các dòng khác; `dryRun` không ghi gì và phản hồi không có `temporaryPassword`; chạy thật trả mật khẩu tạo ra cho dòng không có mật khẩu và **không** trả lại mật khẩu do người nhập; quá 500 dòng → 400; `Audit` không chứa mật khẩu. Chạy → FAIL.
- [ ] **Step 2:** Implement; cập nhật contract. Chạy → PASS. Commit `feat(api): bulk student creation with dry run`.

### Task 5: Màn "Người dùng" trong khu quản trị (danh sách, tạo, khóa, đặt lại, xóa)

**Files:**
- Create: `apps/web/src/pilot/UsersAdmin.tsx`, `apps/web/src/pilot/UsersAdmin.test.tsx`, `apps/web/src/pilot/users.css`
- Modify: `apps/web/src/pilot/Admin.tsx` (chỉ thanh tab "Nội dung | Người dùng", route `#admin` giữ nguyên là "Nội dung"), `apps/web/src/learner/role.ts` (+ `role.test.ts`), `apps/web/src/pilot/PilotApp.tsx`, `apps/web/src/learner/AppShell.tsx` nếu cần, `apps/web/src/pilot/api.ts` (kiểu)

**Interfaces:**
- Consumes: API Task 3; `api(path, body, signal, method)`, `useMe` không dùng ở đây (dùng `api` trực tiếp, danh sách quản trị không cần bộ nhớ tạm theo người).
- Produces: `Kind` thêm `'admin'` (vai trò `admin`; `editor|reviewer|publisher` vẫn `'staff'`). `routeAllowed('admin', route)` cho: `home`, `library`, `study`, `admin`, `admin/users`, `manager`, `manager/learner/*`; **không** `review`, `progress`, `account`. Staff khác không có `admin/users` và `manager`. Học viên, học thử, quản lý không vào được `admin/users`. Mọi chỗ đang xử lý `'staff'` như nhân viên phải xử lý `'admin'` tương đương (kiểm tra bằng tìm kiếm trong `apps/web/src`).
- Produces: `UsersAdmin` (route `admin/users`): danh sách có bộ lọc vai trò/trạng thái và ô tìm (gõ chờ ~300 ms), phân trang; hộp "Tạo người dùng" (vai trò, tên đăng nhập, tên hiển thị, mật khẩu hoặc nút "Tạo tự động"; học viên ≥ 8, vai trò khác ≥ 16 ký tự, báo lỗi tại chỗ); nút theo dòng: Khóa/Mở khóa, Đặt lại mật khẩu (hiện mật khẩu tạm **một lần** trong khung có nút sao chép, đóng khung là mất), Xóa (hộp xác nhận bắt gõ lại tên, nút xóa chỉ bật khi đúng; có lời khuyên "Khóa thường tốt hơn xóa"), "Xem tiến độ" cho dòng học viên (liên kết `#manager/learner/<id>`). Lỗi 400 của server (ví dụ khóa quản trị cuối) hiện bằng `ErrorNote`.

- [ ] **Step 1: Test.** `role.test.ts`: bảng `routeAllowed`/`routesFor` cho `admin`, `staff`, `manager`, `student`, `trial` đúng như trên (kể cả `admin/users`, `manager/learner/x`). `UsersAdmin.test.tsx` (fetch giả): tạo người dùng gửi đúng thân; mật khẩu tạm chỉ hiện sau đặt lại và biến mất khi đóng; nút Xóa tắt cho đến khi gõ đúng tên; Khóa gọi PATCH `{ disabled: true }`; danh sách gửi tham số lọc/tìm/trang; phản hồi 400 hiện lỗi. Bảng kiểm "không gọi `/me`" trong `PilotApp.test.tsx` thêm kiểu `admin` có `userId`. Chạy → FAIL.
- [ ] **Step 2:** Implement (đọc `DESIGN.md` trước; mật khẩu tạm không lưu vào state sau khi đóng, không vào `localStorage`/URL). Chạy → PASS.
- [ ] **Step 3:** Commit `feat(web): admin users screen`.

### Task 6: Tạo hàng loạt từ CSV trong giao diện (cắt cùng Task 4)

**Files:**
- Create: `apps/web/src/pilot/BulkUsers.tsx`, `apps/web/src/pilot/BulkUsers.test.tsx`
- Modify: `apps/web/src/pilot/UsersAdmin.tsx`

**Interfaces:**
- Consumes: `POST /admin/users/bulk` (Task 4); định dạng và cách xem trước đã dùng ở nhập danh mục CSV trong `Admin.tsx` (đọc để giữ cách trình bày).
- Produces: hộp "Tạo hàng loạt": dán hoặc chọn file CSV (cột `tên đăng nhập, tên hiển thị, mật khẩu`, dòng đầu là tiêu đề, bỏ qua dòng trống, tối đa 500 dòng), nút "Xem trước" gọi `dryRun`, bảng kết quả từng dòng (tạo được, trùng, lỗi), nút "Tạo" chạy thật; kết quả cho tải về một CSV (BOM, tiêu đề tiếng Việt) chứa `temporaryPassword` **chỉ dựng ở trình duyệt từ phản hồi**, không lưu lại; cảnh báo rõ rằng mật khẩu chỉ hiện lúc này.

- [ ] **Step 1: Test.** Phân tích CSV (BOM, dấu phẩy trong ngoặc kép, dòng trống, quá 500 dòng bị chặn); "Xem trước" không hiện mật khẩu; chạy thật tạo CSV tải về có mật khẩu tạo ra và không có mật khẩu do người nhập; trùng trong lô hiển thị là bỏ qua. Chạy → FAIL.
- [ ] **Step 2:** Implement. Chạy → PASS. Commit `feat(web): bulk student creation dialog`.

### Task 7: `ProgressService` cho học viên bất kỳ và chi tiết học viên cho quản lý (API)

**Files:**
- Create: `apps/api/src/manager.controller.ts`, `apps/api/src/manager.test.ts`
- Modify: `apps/api/src/progress.service.ts`, `apps/api/src/modules.ts`, `apps/api/src/contract.ts`, `apps/api/src/progress-service.test.ts`

**Interfaces:**
- Produces (`progress.service.ts`): các phương thức hiện có nhận thêm tham số cuối tùy chọn `userId?: string` (mặc định `studentId(actor)`): `active(actor, userId?)`, `context(actor, userId?)`, `review(actor, now?, userId?)`, `progress(actor, now?, userId?)`, `mastery(actor, now?, userId?)`, `log(actor, userId?)`. Phạm vi danh mục vẫn theo `actor` (phiên của người gọi). Hành vi cho `/me/*` không đổi.
- Produces (`manager.controller.ts`, `requireManager`, chỉ đọc): `GET /manager/learners/:id` → `{ id; username; displayName: string|null; disabled: boolean; createdAt: string; lastLoginAt: string|null }`, `GET /manager/learners/:id/progress|review|mastery` cùng hình dạng với `/me/progress|review|mastery`. `:id` không phải người dùng vai trò `student` (kể cả `admin`, nhân viên, `manager`, chính người gọi) → 404. Người dùng đã khóa vẫn xem được.

- [ ] **Step 1: Test.** Quyền: học viên, học thử, khách, nhân viên không phải admin → 403; `manager` và `admin` → 200. Review Focus 4: id của `admin`/`editor`/`manager`/chính người gọi → 404; học viên chưa có câu trả lời → các màn trả rỗng chứ không lỗi; học viên đã khóa → vẫn xem được. Đối chiếu: với cùng nhật ký mẫu, `/manager/learners/:id/progress` trả **đúng cùng JSON** như `/me/progress` của chính học viên đó (cùng `ProgressService`); hai học viên khác nhau cho hai kết quả khác nhau; không có trường `rarity`, `marketPrice`, `hsHints`, `provenance`, `tradeRestriction`, `passwordHash`. Các test `/me/*` cũ pass không đổi. Chạy → FAIL.
- [ ] **Step 2:** Implement (tách `userId` bằng tham số, không nhân đôi logic); cập nhật contract. Chạy → PASS.
- [ ] **Step 3:** Commit `feat(api): per-learner progress for managers`.

### Task 8: Bảng học viên và xuất CSV cho quản lý (API)

**Files:**
- Create: `apps/api/src/progress-manager.ts`, `apps/api/src/progress-manager.test.ts`, `apps/api/src/csv.ts`, `apps/api/src/csv.test.ts`
- Modify: `apps/api/src/manager.controller.ts`, `apps/api/src/progress.service.ts` (hàm lấy số liệu theo lô), `apps/api/src/contract.ts`, `apps/api/src/manager.test.ts`

**Interfaces:**
- Produces (`progress-manager.ts`, thuần, chỉ import các file `progress-*`): `learnerMetrics(o: OverviewData, rows: ReviewRow[], log: LogRow[], now: number): { learning: number; solid: number; avgLevel: number | null; lastStudyAt: string | null; overdue: number; sessions7d: number }` với: `learning` = số loài có `itemStatus !== 'new'`; `solid` = `solidSpecies`-tương đương (mức nhớ ≥ 3); `avgLevel` = trung bình `masteryLevel` của các loài đang học (một chữ số thập phân, null khi không có loài nào đang học); `lastStudyAt` = thời điểm câu không bị bỏ qua gần nhất; `overdue` = số loài có `itemStatus === 'due'`; `sessions7d` = số `sessionId` khác nhau có câu không bỏ qua trong 7 ngày gần nhất theo `Asia/Ho_Chi_Minh`.
- Produces (`csv.ts`, thuần): `csvCell(value: string | number | null): string` (thêm dấu nháy đơn đứng trước nếu bắt đầu bằng `=`, `+`, `-`, `@`, tab hoặc xuống dòng; bao ngoặc kép và nhân đôi ngoặc kép khi cần); `toCsv(header: string[], rows: (string|number|null)[][]): string` bắt đầu bằng BOM `﻿`, xuống dòng `\r\n`.
- Produces (`manager.controller.ts`): `GET /manager/learners?sort=&dir=&filter=&q=&page=&limit=&includeDisabled=` → `{ items: LearnerRow[]; total: number; page: number; limit: number }`, `LearnerRow = { id; username; displayName: string|null; disabled: boolean; learning; solid; avgLevel: number|null; lastStudyAt: string|null; overdue; sessions7d }`; `sort` thuộc `name|lastStudyAt|learning|solid|avgLevel|overdue|sessions7d` (mặc định `lastStudyAt` giảm dần, giá trị null **xếp cuối** cả hai chiều), `filter` thuộc `idle7d` (chưa học 7 ngày, gồm người chưa từng học), `overdue`, `disabled`; `q` tìm theo tên đăng nhập hoặc tên hiển thị; mặc định 50 mỗi trang, tối đa 200; mặc định ẩn người đã khóa (`includeDisabled=true` hiện).
- Produces: `GET /manager/learners.csv` (cùng tham số lọc/sắp xếp, không phân trang): tiêu đề `Tên đăng nhập, Tên hiển thị, Đang học, Đã vững, Mức nhớ TB, Lần học cuối, Quá hạn, Phiên 7 ngày, Trạng thái`, `Content-Type: text/csv; charset=utf-8`, `Content-Disposition: attachment; filename="hoc-vien.csv"`; không có mật khẩu hay id nội bộ.

- [ ] **Step 1: Test.** `progress-manager.test.ts`: nhật ký/ledger mẫu cho từng cột (đang học, đã vững ở ngưỡng stage 1 vs 2, trung bình, quá hạn theo hạn hiệu lực, phiên 7 ngày qua nửa đêm giờ Việt Nam và qua ngày chuyển tháng; câu bỏ qua không tính). Review Focus 4: học viên không có câu nào → `0, 0, null, null, 0, 0`. `csv.test.ts` (Review Focus 5): `csvCell('=SUM(A1)')`, `'+1'`, `'-1'`, `'@x'`, `'\tx'`, `'\rx'` đều bị thêm `'`; dấu phẩy, ngoặc kép, xuống dòng trong giá trị được bao đúng; `toCsv` có BOM và `\r\n`; tên hiển thị tiếng Việt và kana giữ nguyên. `manager.test.ts`: sắp xếp từng cột cả hai chiều với null xếp cuối; từng bộ lọc; `q`; phân trang; mặc định ẩn người đã khóa; CSV khớp bảng; quyền như Task 7; không có `passwordHash`/id nội bộ trong CSV. Chạy → FAIL.
- [ ] **Step 2:** Implement (đọc nhật ký và hàng tiến độ của tất cả học viên theo lô, tránh N+1 truy vấn: nêu số truy vấn trong báo cáo); cập nhật contract. Chạy → PASS.
- [ ] **Step 3:** Commit `feat(api): manager learner table with sorting, filters and CSV export`.

### Task 9: Màn quản lý: bảng học viên (web)

**Files:**
- Create: `apps/web/src/manager/ManagerLearners.tsx`, `apps/web/src/manager/ManagerLearners.test.tsx`, `apps/web/src/manager/manager.css`
- Modify: `apps/web/src/learner/role.ts` (+ test), `apps/web/src/learner/AppShell.tsx` (+ test), `apps/web/src/pilot/PilotApp.tsx` (+ test), `apps/web/src/pilot/api.ts` (kiểu `LearnerRow`), xóa `apps/web/src/learner/ManagerNotice.tsx` và chỗ dùng

**Interfaces:**
- Consumes: `GET /manager/learners`, `GET /manager/learners.csv` (Task 8).
- Produces: route `manager` (kind `manager` và `admin`); `routeAllowed('manager', …)` cho `home`, `manager`, `manager/learner/*`, `library`, `profile/*` (không `study`, không `review`/`progress`, không `account` ở vòng này); `PilotApp` xử lý `#home` của `manager` bằng cách chuyển ngay sang `#manager` (quy tắc riêng trước bước chuyển chung của `routeAllowed`, để không vòng lặp); vai trò `manager` có hai tab "Học viên" và "Thư viện" (một thanh điều hướng mỗi breakpoint, như học viên). `ManagerLearners`: bảng ở ≥ 600px (cột: Tên, Đang học, Đã vững, Mức nhớ TB, Lần học cuối, Quá hạn, Phiên 7 ngày; tiêu đề cột bấm để sắp xếp, `aria-sort`), **dưới 600px đổi thành thẻ xếp dọc** (tên, lần học cuối, đang học, quá hạn); ô tìm; bộ lọc "Chưa học 7 ngày", "Có mục quá hạn"; công tắc "Hiện người đã khóa"; nhãn chữ cho trạng thái (không chỉ màu); phân trang; nút "Xuất CSV" (liên kết tải `GET /manager/learners.csv` kèm bộ lọc hiện tại); bấm một người mở `#manager/learner/<id>`; trạng thái rỗng, đang tải, lỗi (ErrorNote có thử lại). Giờ hiển thị `Asia/Ho_Chi_Minh`; "Lần học cuối" dạng tương đối ("hôm qua", "3 ngày trước") kèm giờ đầy đủ ở `title`; người chưa từng học hiện "Chưa học".

- [ ] **Step 1: Test.** Bảng `routeAllowed` cho `manager`/`admin`/các kind khác; `#home` của `manager` chuyển sang `#manager`; AppShell có đúng hai tab cho quản lý và một `nav` mỗi breakpoint; `ManagerLearners` với fetch giả: gửi đúng tham số sắp xếp/lọc/tìm/trang; công tắc người đã khóa; null hiện "Chưa học"; liên kết CSV mang bộ lọc; thẻ ở màn hẹp (đổi qua `matchMedia`); lỗi hiện `ErrorNote`. Bảng kiểm "không gọi `/me`" trong `PilotApp.test.tsx` tự bao gồm các route mới của `manager` và `admin` (qua `routesFor`) và thêm: học viên/học thử/nhân viên khác vào `#manager` bị chuyển về `#home`. Chạy → FAIL.
- [ ] **Step 2:** Implement (đọc `DESIGN.md`: tông băng cho khu đọc số liệu, hành động chính màu cá hồi, không nhắc gì về việc "giám sát" trên giao diện học viên). Chạy → PASS.
- [ ] **Step 3:** Commit `feat(web): manager learner table`.

### Task 10: Chi tiết học viên cho quản lý (web)

**Files:**
- Create: `apps/web/src/manager/ManagerLearnerDetail.tsx`, `apps/web/src/manager/ManagerLearnerDetail.test.tsx`
- Modify: `apps/web/src/learner/Progress.tsx`, `apps/web/src/learner/Review.tsx` (tham số nguồn dữ liệu và chế độ chỉ đọc; chỉnh `*.test.tsx` tương ứng), `apps/web/src/pilot/PilotApp.tsx`

**Interfaces:**
- Consumes: `GET /manager/learners/:id` và `/progress|review|mastery` (Task 7); `useMe` (khóa theo `userId` của người gọi + đường dẫn khác nhau là đủ để không lẫn dữ liệu).
- Produces: `Progress` và `Review` nhận thêm prop tùy chọn `source?: { progress: string; mastery: string; review: string }` (mặc định `/me/...`) và `readOnly?: boolean` (ẩn nút "Ôn n mục"/hành động bắt đầu học). `ManagerLearnerDetail` (route `manager/learner/<id>`): tiêu đề "Học viên: <tên hiển thị hoặc tên đăng nhập>", nút quay lại `#manager`, nhãn "Đã khóa" nếu có, thông tin đăng nhập cuối/ngày tạo, rồi `Progress` (kèm Thành tích) và `Review` ở chế độ chỉ đọc với `source` trỏ `/manager/learners/<id>/...`; id sai/không phải học viên (404) → thông báo "Không tìm thấy học viên" và nút quay lại. Không gọi `/me/*`.

- [ ] **Step 1: Test.** Với fetch giả: chi tiết gọi đúng `/manager/learners/<id>/progress|review|mastery` và **không** gọi `/me/*`; không có nút bắt đầu ôn; 404 hiện "Không tìm thấy học viên"; mở học viên khác ngay sau không hiện dữ liệu của người trước (khóa riêng theo id); các test `Progress`/`Review` cũ (đường dẫn `/me/...`) vẫn pass. Chạy → FAIL.
- [ ] **Step 2:** Implement. Chạy → PASS.
- [ ] **Step 3:** Commit `feat(web): read-only learner detail for managers`.

### Task 11: Hàng đợi, đăng xuất và 401 phía học viên (tồn logic)

**Files:**
- Modify: `apps/web/src/learner/study/submitQueues.ts`, `apps/web/src/learner/study/submitQueue.ts`, `apps/web/src/learner/study/summary.ts`, `apps/web/src/pilot/PilotApp.tsx`, `apps/web/src/pilot/api.ts`, `apps/web/src/learner/ChangePassword.tsx`, `apps/web/src/learner/Account.tsx`, `apps/web/src/learner/Review.tsx`
- Test: các `*.test.ts(x)` cùng thư mục, `PilotApp.test.tsx`

**Interfaces / việc:**
1. **401 quay về đăng nhập (Review Focus 1):** `api()` gọi một bộ xử lý đăng ký được (cùng kiểu `setAuthRequiredHandler`) khi mọi phản hồi 401 của route đã đăng nhập; `PilotApp` đăng ký để tải lại `/auth/me`, về màn đăng nhập (guest), `clearMe()` và `disposeAll()` hàng đợi, **không** hiện lỗi chung. Hàng đợi coi 401 là thất bại chung cuộc (không thử lại). Test: phiên bị khóa giữa chừng → yêu cầu kế tiếp 401 → màn đăng nhập hiện, hàng đợi không thử lại, không còn ErrorNote lỗi mạng.
2. **Xác nhận đăng xuất sai:** `pendingTotal()` không tính câu đã thất bại bằng 409 chung cuộc nếu bước lấy kết quả từ server (`adopt`) đang chạy; `flushAll` chờ cả các `adopt` đang bay. Test cho kịch bản 409 chung cuộc lúc đăng xuất: không hiện hộp xác nhận.
3. **Chống bấm đúp "Đăng xuất":** cờ chống vào lại chỉ hạ sau khi yêu cầu `/auth/logout` hoàn tất; màn đổi mật khẩu bắt buộc hiện trạng thái "Đang lưu tiến độ…" khi đang chờ; trên điện thoại (360–390px) tiêu đề không chen chúc khi hiện "Đang lưu" (kiểm CSS bằng test dựa trên lớp/độ rộng nếu làm được, ghi bằng chứng ảnh ở Task 15).
4. **Đổi mật khẩu chờ hàng đợi:** `Account`/`ChangePassword` (không bắt buộc) gọi `flushAll(5000)` trước khi gửi; nếu còn câu chưa lưu thì `confirm`; cập nhật CSRF mới từ phản hồi (`setCsrf`) ngay (Task 2). Test.
5. **Một bộ lắng nghe `online` chung** cho tất cả hàng đợi (thay vì mỗi game một bộ); `dispose` gỡ khi hết hàng đợi. Test.
6. **`realByFront`** (`summary.ts`) chỉ gộp hàng tạm vào `targetId` thật khi có **đúng một** `targetId` khác nhau cho cùng tên; nếu mơ hồ giữ hàng tạm riêng. Test.
7. **`afterSubmit` thất bại:** khi kết quả của học viên không có `progress` (server trả `[]`) mà phiên không phải tải lại, tổng kết gọi `GET /learning/sessions/:id/summary` một lần để điền số ngày (cùng cách với phiên tải lại). Test.
8. **Ôn tập:** `dueAt` không hợp lệ hiện "—" thay vì "Invalid Date"; test PilotApp xác nhận `limit` chỉ được gửi khi có giá trị và các lời gọi khác không đổi thân.

- [ ] **Step 1: Test** từng mục trên (đỏ trước). **Step 2:** Implement. **Step 3:** Chạy test web và API → PASS. Commit `fix(web): sign-out and queue edge cases, 401 returns to login, safer summary fallbacks`.

### Task 12: Tồn giao diện học viên (hình thức)

**Files:**
- Modify: `apps/web/src/learner/skillLabel.ts` (+ test), `apps/web/src/learner/Review.tsx`, `apps/web/src/learner/library.css`, `apps/web/src/learner/home.css`, `apps/web/src/learner/float-rope.css`, `apps/web/src/learner/tokens.css`, `apps/web/src/learner/Home.tsx`, `apps/web/src/learner/GroupEntry.tsx`, `apps/web/src/learner/study/study.css`, các `*.test.tsx` liên quan

**Việc:**
1. Dòng chú thích kỹ năng: sửa "đã qua mốc 3 ngày" thành "đã lên mốc 3 ngày" (hai chuỗi trong test).
2. Tên loài ở màn Ôn tập (`.ice-porthole-name`): cho tối đa hai dòng (clamp) thay vì một dòng cắt.
3. Chip nhóm có 0 loài ở Trang chủ ("Thư viện theo nhóm"): ẩn hoặc làm mờ và không bấm được (chọn cách đọc rõ hơn; giữ nhãn cho trình đọc màn hình); khi tất cả bằng 0 chỉ hiện dòng "Loài chưa gắn nhóm".
4. Ô "Đã lưu tự đánh giá" trong Study: bỏ viền và chiều cao dạng nút để không giống nút bấm (giữ `role="status"`).
5. Gom màu gõ cứng `#f4f8f9` và bóng phao trong `library.css`, `home.css`, `float-rope.css` về token đã có (`--ice-cap`, `--shadow-buoy`).
- [ ] **Step 1: Test** những gì kiểm được (chuỗi, lớp CSS, chip 0 loài không bấm được, token thay cho màu cứng bằng cách tìm trong CSS). **Step 2:** Implement. **Step 3:** Cổng đầy đủ pass. Commit `fix(web): learner polish (caption, porthole names, empty group chips, status pill, tokens)`.

### Task 13: Hạ tầng và tài liệu nhỏ

**Files:**
- Create: `apps/api/src/errors.ts`, `apps/api/src/errors.test.ts` (chuyển từ test hiện có)
- Modify: `apps/api/src/main.ts`, `apps/api/src/progress-record.test.ts` (không import `./main`), `apps/api/src/progress-review.vectors.json`, `apps/web/src/domain/review-vectors.test.ts`, `scripts/local-origin.test.mjs`, `docs/DELIVERY_25B.md`, `README.md`

**Việc:**
1. Tách `errorStatus`, `errorBody`, `BUSY` khỏi `main.ts` vào `errors.ts`; `main.ts` và test import từ đó; hành vi không đổi.
2. Thu gọn `progress-review.vectors.json`: mỗi vector một dòng (dạng JSON gọn), chỉnh bộ ghi trong `review-vectors.test.ts` để ghi đúng dạng đó; test "file vector đã cập nhật" phải khớp; kích thước file giảm rõ rệt (ghi trước/sau).
3. `scripts/local-origin.test.mjs`: thêm ca `0.0.0.0` (bị từ chối) và host kiểu `user@evil.com@127.0.0.1` (đúng là loopback theo `URL.hostname`, ghi nhận bằng test).
4. Tài liệu: `DELIVERY_25B.md` đổi câu về quản lý thành "chưa có màn quản lý" (trung tính); ghi chú trong README/`DELIVERY_25A.md` rằng mặc định `PILOT_ORIGIN` là `http://127.0.0.1:18089` và không lấy từ `PUBLIC_ORIGIN` (đặt `PILOT_ORIGIN` khớp khi cổng khác).
- [ ] **Step 1:** Chạy test hiện có làm mốc; **Step 2:** Implement; **Step 3:** Cổng đầy đủ + `contract:generate` (không đổi). Commit `chore: extract error mapping, compact parity vectors, extra origin-guard cases, doc fixes`.

### Task 14: Tài liệu nâng cấp VPS và công cụ dữ liệu demo

**Files:**
- Create: `docs/DEPLOY_UPGRADE_25.md`, `scripts/demo-learner-play.mjs`, `scripts/demo-learner-play.test.mjs`
- Modify: `README.md` (một dòng trỏ tới tài liệu)

**Interfaces:**
- `DEPLOY_UPGRADE_25.md` (tiếng Việt, mẫu theo `docs/DEPLOY_UPGRADE_r2.md`; đọc nó và `docs/DELIVERY_25A.md`, `docs/DELIVERY_25B.md`, `docs/DEPLOY_FRESH_INSTALL_0.6.md` trước): từ bản đang chạy trên VPS (tag `pilot-internal-20261119-r2`) lên 2.5: sao lưu trước (`backup-pilot.sh` với đúng lệnh và `PILOT_COMPOSE_FILE`), build và đẩy ảnh (`scripts/publish-pilot.sh <tag mới>`, đăng nhập GHCR), đổi hai mã ảnh trong `.local/pilot.env` của VPS bằng lệnh `sed` (không in file), kéo ảnh, `migrate` (**hai** migration: `202611190001_learner_accounts` và `202611200001_username_ci`; nêu cách xử lý nếu migration thứ hai dừng vì tên trùng), tạo lại dịch vụ API trước rồi web, kiểm sức khỏe (`/api/v1/health` đúng phiên bản), `smoke`, tạo tài khoản "An" **trong màn Người dùng** (mật khẩu do chủ dự án chọn, không ghi vào tài liệu/repo/chat) và quản lý thử, đăng nhập thử, cách quay lại (khôi phục sao lưu; **cảnh báo**: quay lại ảnh cũ sau khi đã migrate cần sao lưu trước và chưa kiểm chứng), kiểm sau nâng cấp. Mục "Lưu ý vận hành": khóa theo người dùng nằm trong tiến trình (một container API), `rebuild:progress` chạy khi API dừng, tiến độ HS đặt lại khi sửa ghi chú/SKU/ảnh của một loài, bật chế độ nội bộ `ALLOW_INTERNAL_DEMO` chỉ để xem thử và tắt khi mở cho người ngoài, giới hạn đăng nhập nằm trong bộ nhớ (mất khi khởi động lại). Không có bí mật nào trong tài liệu.
- `scripts/demo-learner-play.mjs`: nhận `--origin` (mặc định `http://127.0.0.1:18089`), `--username`, `--sessions` (mặc định 3); đọc mật khẩu từ prompt ẩn (không nhận qua tham số hay biến môi trường để khỏi lọt vào lịch sử lệnh); đăng nhập bằng tài khoản học viên, mở vài phiên flashcard và tự đánh giá ngẫu nhiên có chủ đích (một nửa "Đã nhớ"), tất cả qua API thật (`/auth/login`, `/learning/sessions`, `/attempts` với khóa idempotency); **từ chối** địa chỉ không phải loopback trừ khi có `--allow-nonlocal` **và** người dùng gõ lại đúng tên miền để xác nhận; không in mật khẩu, cookie, CSRF; in tóm tắt số câu đã chơi.

- [ ] **Step 1: Test** `demo-learner-play.test.mjs` (hàm thuần: phân tích tham số, chốt địa chỉ dùng `local-origin.mjs`, sinh lựa chọn tự đánh giá có tỉ lệ nhớ cố định theo hạt giống). **Step 2:** Viết tài liệu và script; chạy script trên stack local với một học viên thử (tạo bằng giao diện hoặc API quản trị) và xác nhận bảng quản lý (Task 8) có dữ liệu. **Step 3:** Cổng đầy đủ pass. Commit `docs: 2.5 VPS upgrade runbook and demo learner script`.

### Task 15: E2E, kiểm trực quan và tài liệu giao hàng 2.5c

**Files:**
- Modify: `apps/web/e2e/pilot.spec.ts`
- Create: `docs/DELIVERY_25C.md`; Modify: `README.md`

**Interfaces / việc:**
- E2E mới (Playwright, desktop và mobile; tài khoản thử do `beforeAll` tạo qua API quản trị như các ca hiện có, local-only): (a) quản trị tạo học viên "An" **trong giao diện** `#admin/users` (mật khẩu hiện một lần), An đăng nhập và học một mẻ; (b) đăng nhập `manager` (tạo bằng API quản trị) → bảng có An với lần học cuối và "đang học" > 0; sắp xếp một cột; mở chi tiết thấy Tiến độ của An (chỉ đọc, không có nút ôn); xuất CSV (tải về, có BOM, có An); (c) quản trị **khóa** An khi tab của An đang mở: yêu cầu kế tiếp của An (ví dụ chuyển sang Tiến độ) đưa An về màn đăng nhập, đăng nhập lại bị từ chối; mở khóa thì vào lại và vẫn còn tiến độ (Review Focus 1); (d) đặt lại mật khẩu: An đăng nhập bằng mật khẩu tạm, bị buộc đổi, đổi xong vào bình thường; (e) học viên và manager không vào được `#admin/users`; học viên không vào được `#manager`; (f) tạo `an` khi đã có `An` báo trùng; đăng nhập bằng `aN` vào đúng tài khoản; (g) tạo hàng loạt trong giao diện với 3 dòng (một trùng): bảng kết quả đúng và CSV mật khẩu tải về được (nếu làm Task 4/6). Bảo đảm bước đăng nhập mỗi ca ít để không chạm giới hạn; nếu gặp 429 khởi động lại riêng container API của repo này.
- Kiểm trực quan: dựng lại stack local, chụp bằng Playwright (chỉ đọc) ở 390×844 và 1280×800 các màn: Người dùng (danh sách, hộp tạo, mật khẩu tạm hiện, xác nhận xóa, tạo hàng loạt), bảng quản lý (bảng và thẻ), chi tiết học viên, màn đăng nhập sau khi bị khóa; lưu `apps/web/.impeccable/review/2.5c/` (không commit); **đọc ảnh** và ghi vào báo cáo từng lỗi giao diện (cắt chữ, tương phản, cuộn ngang, mục chạm < 44px, lệch phong cách). Kiểm bằng chương trình: không cuộn ngang, mục chạm ≥ 44px. Chỉ ghi nhận, không sửa ngoài phạm vi (bộ điều khiển sẽ phân loại).
- `docs/DELIVERY_25C.md` (tiếng Việt, mẫu `DELIVERY_25B.md`): đã làm, API mới, các quyết định, số liệu kiểm thử thực tế, **chưa làm** (nhóm/đội, SSO, v.v. theo spec mục 3), cách chạy e2e và tác dụng phụ (tài khoản `qa-*` ở lại DB local; không chạy trên VPS), liên kết `DEPLOY_UPGRADE_25.md`. Thêm đoạn README. Không khẳng định điều chưa kiểm.
- [ ] **Step 1:** Cập nhật e2e, dựng stack (`docker compose --env-file .local/pilot.env up -d --build`, `node scripts/wait-pilot.mjs`; chỉ stack của repo này, không `down`, không xóa volume, không động tới container khác), chạy `npm run test:e2e` hai lần liên tiếp (số liệu thực tế, giải thích chênh lệch so với 25/3). **Step 2:** Kiểm trực quan. **Step 3:** Viết tài liệu. **Step 4:** Cổng đầy đủ (`npm test`, `typecheck`, `lint`, `format:check`, `build`, `contract:generate`). Commit `test(e2e): manager and admin flows` rồi `docs: phase 2.5c delivery notes`.
