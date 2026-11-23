# Phase 2.5d: siết vai trò, tách bundle, màn Tài khoản của manager

Ngày 23/11/2026. Branch `feat/role-hardening-25d`. Chưa build image phát hành, chưa push GHCR, chưa nâng cấp VPS. Không có migration mới (stack local báo "No pending migrations").

## Đã làm

**Ma trận vai trò × route (API)**
- `apps/api/src/role-matrix.test.ts` kiểm 55 route × 8 vai trò: khách (guest), learner (phiên mã mời / học thử), student, manager, editor, reviewer, publisher, admin. Phiên buộc đổi mật khẩu không phải một vai trò trong ma trận: một test riêng chạy `MustChangePasswordGuard` trên mọi route và chỉ cho qua `GET /auth/me`, `POST /auth/logout`, `GET /me`, `POST /me/password`. Kết quả rà soát: không có route nào lỏng, mọi route đều có vai trò đúng bảng.
- Cách hoạt động: danh sách route lấy từ metadata của Nest (không viết tay), nên route mới mà chưa có dòng trong bảng `EXPECTED` thì test fail, dòng thừa cũng fail. Test chạy guard thật (`AccessGuard`, `AdminOnlyGuard`, `EditingGuard`, `MustChangePasswordGuard`) và handler thật, các phụ thuộc là proxy rỗng: nếu handler chạm DB hay service trước khi kiểm vai trò thì tính là "lọt". Khách phải nhận đúng 401, vai trò bị từ chối phải nhận đúng 403.
- Từ lượt sửa sau review: việc dò module báo lỗi ngay nếu gặp import không đọc được (DynamicModule, `forwardRef`) thay vì bỏ qua, và danh sách guard toàn cục (`APP_GUARD`) phải đúng `[MustChangePasswordGuard]`; thêm guard toàn cục mới thì test fail cho đến khi ma trận mô hình hóa nó.
- Phía web (`apps/web/src/pilot/PilotApp.test.tsx`) không có bảng tương đương: test đi qua mọi route mà `routesFor(kind)` trả về cho từng loại phiên (học thử, manager, editor, admin), kiểm mỗi route mở được và kiểm lời gọi `/me*` theo từng loại: học thử, editor và admin không gọi `/me*` nào; manager chỉ gọi đúng `GET /me` ở màn `account`, không gọi `/me/home|review|progress|mastery`. Route nào không nằm trong `routesFor` thì test này không thấy.

**Tách bundle admin/manager**
- Màn quản trị và quản lý thành các chunk tải theo vai trò (lazy). Trong lúc tải hiện "Đang tải…".
- Entry 382,6 → 313,5 kB (gzip 115,6 → 96,8). Lần build hôm nay: `index` 313,60 kB, gzip 96,82.
- Từ lượt sửa sau review: React/ReactDOM (cùng JSX runtime) và scheduler nằm trong chunk `vendor-*.js`; chunk chung chứa API client tên `shared-*.js` (trước đó tên `users-*.js` dù chứa JSX runtime và API client, không phải mã quản trị). Kích thước tải cho mọi người sau sửa: `index` 102,94 kB (gzip 31,33), `vendor` 218,75 kB (gzip 67,53), `shared` 1,36 kB, `createLucideIcon` 3,13 kB, `rolldown-runtime` 0,60 kB; tổng 326,77 kB, gzip 101,56 (trước sửa 326,81 / 101,47: không đổi đáng kể, chỉ chia lại file). `check:bundle` giờ cũng báo lỗi nếu file tải cho mọi người có tên bắt đầu bằng `Admin`, `Users` hay `Manager`.
- Ảnh web phát hành chạy `npm run build && npm run check:bundle` ngay trong Dockerfile (`apps/web/Dockerfile` và `Dockerfile` gốc), nên ảnh không build được nếu bundle học viên lẫn mã admin/manager.
- `npm run check:bundle` (đã chạy trong CI) báo lỗi nếu mã admin/manager lọt vào bundle của học viên. Lần chạy hôm nay: "ok (11 admin/manager markers only in lazy chunks)".
- Test e2e mới: phiên student và khách không bao giờ yêu cầu các file `Admin-*`, `AdminTabs-*`, `UsersAdmin-*`, `ManagerLearners-*`, `ManagerLearnerDetail-*`; phiên admin tải `UsersAdmin`, phiên manager tải `ManagerLearners` và `ManagerLearnerDetail`.

**Màn Tài khoản cho manager** (`#account`)
- Đổi tên hiển thị và đổi mật khẩu, mật khẩu mới tối thiểu 16 ký tự. Không có nội dung riêng của học viên. Sau khi đổi mật khẩu, thao tác ghi tiếp theo vẫn qua CSRF (đã kiểm trong e2e).

## Bảo mật: tách bundle không phải ranh giới bảo mật

- Ranh giới bảo mật là kiểm vai trò ở server (ma trận vai trò × route ở trên). Tách bundle chỉ giảm dung lượng tải cho học viên và không để lộ màn quản trị ngay từ đầu.
- Chunk lazy (`Admin-*`, `UsersAdmin-*`, `ManagerLearners-*`…) là file tĩnh công khai: ai cũng tải được, và tên của chúng nằm trong chunk entry. Đọc được mã màn quản trị không cho thêm quyền nào; mọi dữ liệu admin/manager vẫn phải qua API, nơi khách nhận 401 và vai trò khác nhận 403.
- CSS admin/manager (`users-*.css`, `manager.css`) vẫn tải cho mọi người.

**Tài liệu API (Swagger) từng lộ ra ngoài, đã sửa**
- Trước sửa: API luôn phục vụ `/api/v1/docs` và `/api/v1/openapi.json`, và Caddy chuyển mọi `/api/*` vào API, nên ai (kể cả khách chưa đăng nhập) cũng đọc được danh sách mọi route `/admin/*`, `/manager/*`. Không lộ dữ liệu (route vẫn kiểm vai trò), nhưng lộ bản đồ API.
- Sau sửa: API chỉ đăng ký hai đường này khi `EXPOSE_API_DOCS=true` (đúng chữ `true`; mặc định tắt, `deploy/pilot.env.example` và `scripts/init-pilot.mjs` ghi `false`). Muốn xem Swagger khi chạy API cục bộ: đặt `EXPOSE_API_DOCS=true` rồi mở `/api/v1/docs`. Không bật trên VPS.
- Thêm lớp phòng thủ: `deploy/Caddyfile.pilot` trả 404 cho `/api/v1/docs*` và `/api/v1/openapi*` dù API có bật cờ. `deploy/Caddyfile` (stack tĩnh cũ) không proxy `/api` nên không cần.
- `npm run contract:generate` dựng `docs/api/openapi.json` bằng cùng hàm `buildOpenApiDocument`, không đăng ký route HTTP; chạy lại không làm đổi file.
- Test `apps/api/src/api-docs.test.ts`: không có cờ (hoặc `false`, `TRUE`, `1`…) thì `/api/v1/docs`, `/docs/`, `/docs-json`, `/docs-yaml`, `/openapi.json` đều 404; có `EXPOSE_API_DOCS=true` thì 200.
- Sau khi triển khai, `GET /api/v1/docs` và `GET /api/v1/openapi.json` phải trả 404: đã thêm vào mục kiểm sau nâng cấp của [DEPLOY_UPGRADE_25C.md](DEPLOY_UPGRADE_25C.md).

## Quyết định và lưu ý chuyển tiếp

- Đăng nhập bị chặn trong phiên đang buộc đổi mật khẩu: chủ ý.
- Metadata media chưa duyệt vẫn nằm trong DTO danh mục (`catalog.ts:397`): **chưa quyết**, cần chủ sản phẩm quyết.
- `ALLOW_INTERNAL_DEMO` làm mọi tài khoản đăng nhập thấy bản nội bộ: thêm vào checklist triển khai (không bật trên bản công khai).
- CSS admin/manager vẫn tải ngay từ đầu (chưa tách cùng chunk).
- Admin và staff (editor/reviewer/publisher) chưa có màn Tài khoản.

## Kiểm thử (chạy hôm nay trên stack local, tag `role-hardening-25d-local`, cổng 18089)

- Sao lưu DB trước khi dựng lại: `scripts/backup-pilot.sh _backups/before-25d-20261123` (thư mục gitignore). Dựng lại bằng `docker compose --env-file .local/pilot.env up -d --build`, `/api/v1/health` báo `release: role-hardening-25d-local`, migrate "No pending migrations".
- `npm test`: web 440, API 408, scripts 29, tất cả pass. Sau lượt sửa sau review: web 440, API 415 (thêm 5 test tài liệu API, 2 test ma trận), scripts 29, tất cả pass; typecheck, lint, format:check, build, check:bundle đạt; `contract:generate` không đổi `docs/api/openapi.json`. E2e chưa chạy lại sau lượt sửa này.
- typecheck, lint, format:check, build, check:bundle: đều pass. `contract:generate`: không đổi file nào.
- `npm run test:e2e`: lần chạy trước khi thêm test chunk 39 pass / 3 skip; sau khi thêm 2 test mới, hai lần liên tiếp đều **43 pass / 3 skip**, không lỗi.

## Chưa làm / còn lại

- Chưa build image phát hành, chưa push, chưa nâng cấp VPS.
- Các mục "lưu ý" ở trên (media chưa duyệt, `ALLOW_INTERNAL_DEMO`, CSS, màn Tài khoản cho admin/staff) vẫn mở.
- Kiểm bundle dựa trên danh sách marker chuỗi; marker mới của màn admin/manager cần thêm vào script khi có màn mới.
