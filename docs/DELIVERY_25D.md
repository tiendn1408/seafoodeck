# Phase 2.5d: siết vai trò, tách bundle, màn Tài khoản của manager

Ngày 23/11/2026. Branch `feat/role-hardening-25d`. Chưa build image phát hành, chưa push GHCR, chưa nâng cấp VPS. Không có migration mới (stack local báo "No pending migrations").

## Đã làm

**Ma trận vai trò × route (API)**
- `apps/api/src/role-matrix.test.ts` kiểm 55 route × 8 vai trò (khách, student, manager, editor, reviewer, publisher, admin và phiên buộc đổi mật khẩu). Kết quả rà soát: không có route nào lỏng, mọi route đều có vai trò đúng bảng.
- Cách hoạt động: danh sách route lấy từ metadata của Nest (không viết tay), nên route mới mà chưa có dòng trong bảng `EXPECTED` thì test fail, dòng thừa cũng fail. Test chạy guard thật (`AccessGuard`, `AdminOnlyGuard`, `EditingGuard`, `MustChangePasswordGuard`) và handler thật, các phụ thuộc là proxy rỗng: nếu handler chạm DB hay service trước khi kiểm vai trò thì tính là "lọt". Khách phải nhận đúng 401, vai trò bị từ chối phải nhận đúng 403.
- Phía web có test tương tự: mọi route của app phải có dòng trong bảng vai trò.

**Tách bundle admin/manager**
- Màn quản trị và quản lý thành các chunk tải theo vai trò (lazy). Trong lúc tải hiện "Đang tải…".
- Entry 382,6 → 313,5 kB (gzip 115,6 → 96,8). Lần build hôm nay: `index` 313,60 kB, gzip 96,82.
- `npm run check:bundle` (đã chạy trong CI) báo lỗi nếu mã admin/manager lọt vào bundle của học viên. Lần chạy hôm nay: "ok (11 admin/manager markers only in lazy chunks)".
- Test e2e mới: phiên student và khách không bao giờ yêu cầu các file `Admin-*`, `AdminTabs-*`, `UsersAdmin-*`, `ManagerLearners-*`, `ManagerLearnerDetail-*`; phiên admin tải `UsersAdmin`, phiên manager tải `ManagerLearners` và `ManagerLearnerDetail`.

**Màn Tài khoản cho manager** (`#account`)
- Đổi tên hiển thị và đổi mật khẩu, mật khẩu mới tối thiểu 16 ký tự. Không có nội dung riêng của học viên. Sau khi đổi mật khẩu, thao tác ghi tiếp theo vẫn qua CSRF (đã kiểm trong e2e).

## Quyết định và lưu ý chuyển tiếp

- Đăng nhập bị chặn trong phiên đang buộc đổi mật khẩu: chủ ý.
- Metadata media chưa duyệt vẫn nằm trong DTO danh mục (`catalog.ts:397`): **chưa quyết**, cần chủ sản phẩm quyết.
- `ALLOW_INTERNAL_DEMO` làm mọi tài khoản đăng nhập thấy bản nội bộ: thêm vào checklist triển khai (không bật trên bản công khai).
- CSS admin/manager vẫn tải ngay từ đầu (chưa tách cùng chunk).
- Admin và staff (editor/reviewer/publisher) chưa có màn Tài khoản.

## Kiểm thử (chạy hôm nay trên stack local, tag `role-hardening-25d-local`, cổng 18089)

- Sao lưu DB trước khi dựng lại: `scripts/backup-pilot.sh _backups/before-25d-20261123` (thư mục gitignore). Dựng lại bằng `docker compose --env-file .local/pilot.env up -d --build`, `/api/v1/health` báo `release: role-hardening-25d-local`, migrate "No pending migrations".
- `npm test`: web 440, API 408, scripts 29, tất cả pass.
- typecheck, lint, format:check, build, check:bundle: đều pass. `contract:generate`: không đổi file nào.
- `npm run test:e2e`: lần chạy trước khi thêm test chunk 39 pass / 3 skip; sau khi thêm 2 test mới, hai lần liên tiếp đều **43 pass / 3 skip**, không lỗi.

## Chưa làm / còn lại

- Chưa build image phát hành, chưa push, chưa nâng cấp VPS.
- Các mục "lưu ý" ở trên (media chưa duyệt, `ALLOW_INTERNAL_DEMO`, CSS, màn Tài khoản cho admin/staff) vẫn mở.
- Kiểm bundle dựa trên danh sách marker chuỗi; marker mới của màn admin/manager cần thêm vào script khi có màn mới.
