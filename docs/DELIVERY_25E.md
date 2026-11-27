# Phase 2.5e: tách app Studio cho nhân sự sang host riêng

Ngày 26/11/2026. **Đã triển khai lên VPS ngày 26/11/2026** (tag `studio-web-tier-20261126-r1`, ba container web `edge` + `web-learner` + `web-studio`, host Studio `seafoodeckstudio.tiendn.io.vn`); chủ dự án tự build, đẩy GHCR và chạy lệnh. Các kiểm sau deploy theo `DEPLOY_STUDIO_HOST.md` mục 4: chủ dự án dán kết quả cổng (chỉ `edge` mở 80/443/udp 443; các container khác chỉ có cổng khai báo trong image, không mở ra ngoài) và báo các kiểm còn lại (host học viên chạy, catalogue không đổi, host học viên trả 404 cho đường nhân sự, host Studio, đăng nhập trình duyệt) là "ổn"; tài liệu này không lưu từng kết quả đó. Branch làm việc ban đầu `feat/studio-app-split-25e` (đã merge). Không có migration mới (stack local báo "4 migrations found… No pending migrations to apply").

Mục tiêu của chủ dự án: **giảm số người biết là có khu quản trị**, không phải dựng một ranh giới bảo mật cứng. Nhân sự vẫn vào từ bất kỳ đâu, không VPN, không TOTP.

## Đã giao

**Hai app, hai host, một API, một DB, ba ảnh web (xem "Tách tầng web" cuối tài liệu; ban đầu 2.5e giao một ảnh web)**
- `apps/web`: app học viên (khách, học thử bằng mã mời, student). Không còn route, tab, chữ, tên file chunk hay đường API nào của quản trị/quản lý. Mở `#admin`, `#manager`… trên app học viên chỉ về Trang chủ (hoặc form đăng nhập nếu chưa đăng nhập).
- `apps/studio` (`@seafoodeck/studio`): app Studio cho editor/reviewer/publisher (Quản trị + Thư viện), manager (Học viên + Thư viện + Tài khoản), admin (Quản trị + Người dùng + Học viên + Thư viện). Đủ các tính năng cũ: nhập CSV, revision/media, xuất bản/rollback, người dùng (tạo, tạo hàng loạt, khóa/mở khóa, đặt lại mật khẩu, xóa), bảng học viên và chi tiết, CSV học viên, màn Tài khoản của manager, buộc đổi mật khẩu, 401 → đăng nhập lại, CSRF sau đổi mật khẩu, chặn rời trang khi đang hiện mật khẩu tạm.
- (Lịch sử, trước tách tầng web) Ảnh web chứa hai bản build (`/srv/learner`, `/srv/studio`); Caddy có hai site. Host học viên `seafoodeck.tiendn.io.vn`, host Studio `seafoodeckstudio.tiendn.io.vn` (`STUDIO_SITE_ADDRESS`, `STUDIO_ORIGIN`).

**API**
- Đăng nhập kiểm "realm" theo `Origin`: student/mã mời chỉ ở origin học viên, editor/reviewer/publisher/manager/admin chỉ ở origin Studio. Sai host → **đúng status, đúng body, cùng chi phí bộ giới hạn đăng nhập như sai mật khẩu**. Không đặt `STUDIO_ORIGIN` thì hành vi như cũ (một origin cho mọi vai trò).
- Request không có header `Origin` (script phía server) vẫn đăng nhập và ghi được ở cả hai host (vẫn cần CSRF token). Đây là chủ ý, có test.
- Trên host học viên, `/api/v1/admin*`, `/api/v1/manager*`, `/api/v1/docs*`, `/api/v1/openapi*` trả 404 giống hệt một đường không tồn tại (biến thể `..%2F` được kiểm đầu cuối trong e2e; chữ hoa và `//` được kiểm bằng unit test trong `apps/api/src/learner-edge.test.ts`, chưa chạy đầu cuối): Caddy gắn `X-Edge: learner`, API (`apps/api/src/learner-edge.ts`) biến đường đó thành route không tồn tại. Ma trận vai trò × route vẫn là ranh giới thật và vẫn xanh.
- CORS của kho S3 liệt kê cả hai origin. `STUDIO_ORIGIN` phải ghi đúng dạng chuẩn (`https://seafoodeckstudio.tiendn.io.vn`; sai: có `/` cuối, chữ hoa, `:443`): giá trị không chuẩn làm API **từ chối khởi động** (log `API startup refused: STUDIO_ORIGIN must be written exactly as <dạng chuẩn> (it is also the S3 CORS entry).`) và `scripts/init-pilot.mjs` từ chối với cùng câu, vì compose chép nguyên chuỗi vào CORS S3; cũng bị từ chối nếu có đường dẫn/query/thông tin đăng nhập, không phải http(s) hoặc trùng `PUBLIC_ORIGIN`. `PUBLIC_ORIGIN` không bị từ chối (bản chạy sẵn có thể giữ giá trị không chuẩn); cả hai vẫn được chuẩn hóa khi so với `Origin` của trình duyệt. Không đặt `STUDIO_ORIGIN` thì hành vi như cũ.
- Studio: admin chỉ còn một thanh điều hướng (tab của Studio); thanh tab thứ hai trong trang đã bỏ. Chặn rời trang khi đang hiện mật khẩu tạm vẫn do tab của Studio (xác nhận khi đổi hash) và có test.
- Compose VPS (`deploy/compose.pilot.ghcr.yaml`) không publish cổng Studio nào (chỉ 80/443); `STUDIO_WEB_PORT` chỉ có trong `compose.yaml` local.
- Thông báo lỗi 500 chung cho học viên là "Lỗi máy chủ. Thử lại sau." (không nhắc quản trị).

**Rào chắn trong CI**
- ESLint của `apps/web` cấm import `apps/studio` (cả import động).
- `npm run check:bundle`: build học viên không được chứa marker quản trị nào (đường API, route, tên màn/chunk, nhãn tab, tên vai trò); build Studio phải chứa đủ. Chạy cả trong Dockerfile. Lần chạy hôm nay: "ok (12 markers absent from learner, present in studio; learner index.html clean)".

## Giấu không phải là bảo mật: giới hạn cần biết

- **Host Studio là công khai.** Chứng chỉ HTTPS của `seafoodeckstudio.tiendn.io.vn` được ghi vào nhật ký Certificate Transparency (crt.sh): ai tra là thấy tên host, mở được trang đăng nhập Studio và tải được mã JS của Studio. Header `X-Robots-Tag: noindex, nofollow` chỉ xin máy tìm kiếm đừng lập chỉ mục.
- **Không có TOTP/MFA, không giới hạn IP.** Bảo vệ tài khoản nhân sự vẫn là mật khẩu (tối thiểu 16 ký tự cho nhân sự) + bộ giới hạn đăng nhập (20 lần sai/IP và 10 lần sai/tên trong 10 phút).
- **Giấu ≠ bảo vệ.** Ranh giới thật là kiểm vai trò ở server (401/403). Việc tách app chỉ làm học viên không thấy dấu vết của khu quản trị.
- **Docs/OpenAPI trên host Studio chỉ được giấu bởi `EXPOSE_API_DOCS`** (mặc định tắt). Host học viên chặn thêm một lớp; host Studio thì không. Không bật cờ này trên VPS.
- **Studio không có "Học".** Nhân sự muốn luyện tập dùng **tài khoản học viên cá nhân** trên host học viên (admin tạo ở màn Người dùng với vai trò `student`), hoặc mã mời. Tài khoản nhân sự không bao giờ đăng nhập được ở host học viên từ trình duyệt (một script đăng nhập không có header `Origin` vẫn chạy, có chủ ý: làm rõ số 5 trong spec), nên tiến độ học tách khỏi danh tính quản trị.
- **Thứ tự triển khai: API trước, web sau.** Việc chặn đường nhân sự trên host học viên nằm trong API 2.5e; ảnh web mới đi với API cũ thì các đường đó vẫn trả lời trên host học viên. Rollback thì lùi cả hai.
- Ảnh/bản thu xem trước trong Studio tải qua URL ký sẵn trỏ về host học viên (`S3_PUBLIC_ENDPOINT` = origin học viên). Không cần CORS (thẻ `<img>`/`Audio`), không lộ gì cho học viên.

## Việc của chủ dự án

1. DNS: bản ghi A (và AAAA nếu host học viên có) cho `seafoodeckstudio.tiendn.io.vn` về cùng VPS. Caddy tự lấy chứng chỉ khi DNS đúng.
2. Biến môi trường trên VPS: `STUDIO_ORIGIN`, `STUDIO_SITE_ADDRESS` (không in file env, không dán vào chat).
3. Triển khai API trước, rồi web; tạo lại kho S3 để CORS nhận origin mới; chạy các kiểm sau triển khai.
4. Báo URL Studio cho nhân sự ngoài hệ thống; tạo tài khoản học viên cá nhân cho ai cần luyện tập.

Chi tiết từng bước, kiểm sau triển khai và rollback: [DEPLOY_STUDIO_HOST.md](DEPLOY_STUDIO_HOST.md).

## Kiểm thử (stack local, project `seafoodeck-pilot-acceptance`, tag `studio-split-25e-local`)

- Sao lưu trước khi dựng lại: `sh scripts/backup-pilot.sh _backups/before-25e-20261125` (gitignore; `db.sql` 16 MB + object). File env local được thêm ba dòng `STUDIO_ORIGIN=http://localhost:18090`, `STUDIO_SITE_ADDRESS=http://localhost:8090`, `STUDIO_WEB_PORT=18090` (bản cũ giữ ở `.local/pilot.env.before-25e`).
- Dựng lại lần cuối (r2, sau sửa review cuối): sao lưu `sh scripts/backup-pilot.sh _backups/before-25e-r2-20261126` rồi `API_TAG=studio-split-25e-r2-local WEB_TAG=studio-split-25e-r2-local docker compose --env-file .local/pilot.env up -d --build` (không `down`, giữ volume); health cả hai host trả `release: studio-split-25e-r2-local`.
- Dựng lại lần đầu: `API_TAG=studio-split-25e-local WEB_TAG=studio-split-25e-local docker compose --env-file .local/pilot.env up -d --build`. `/api/v1/health` ở cả hai host: `{"status":"ok","version":"0.6.0","release":"studio-split-25e-local"}`. Học viên http://127.0.0.1:18089, Studio http://localhost:18090. Các stack local khác không bị đụng tới.
- `npm test` (sau vòng sửa cuối): web 327, studio 134, API 430, scripts 43: tất cả pass. Build và `check:bundle` đạt.
- `npm run test:e2e` (4 project: `desktop`, `mobile` trên origin học viên; `studio-desktop`, `studio-mobile` trên origin Studio): hai lần liên tiếp đều **52 pass / 6 skip**, không lỗi (chạy lại trên `studio-split-25e-r2-local` sau vòng sửa cuối: lần 1 lúc 09:43 và lần 2 lúc 09:55, cùng 52 pass / 6 skip / 0 lỗi). 6 skip là chủ ý: 3 test khổ màn hình điện thoại chỉ chạy ở `mobile`, 3 test mức API chỉ chạy một lần ở `studio-desktop`.
- Test e2e mới: đăng nhập admin/manager/editor ở host học viên và student/mã mời ở host Studio trả đúng status + body như sai mật khẩu/sai mã; `/api/v1/admin/users`, `/api/v1/manager/learners`, biến thể `..%2F..%2Fx` (GET và PATCH), docs ở host học viên trả 404 cùng status, cùng bộ header, cùng dạng body với một đường không tồn tại; student đã đăng nhập cũng nhận 404 (không phải 403); hành trình khách, học thử, student không bao giờ gọi tới origin Studio, file Studio hay đường nhân sự; host học viên trả 404 cho file riêng của Studio; Studio không có Học (không tab, không route, không nút học); đăng nhập kiểu script (không `Origin`) vẫn chạy; xem trước ảnh trong Studio.
- Kiểm tay: preflight CORS S3 với `Origin: http://localhost:18090` → 200 kèm `Access-Control-Allow-Origin: http://localhost:18090` (origin lạ → 403); upload ảnh vào một revision nháp từ Studio thành công ("Đã upload nháp, chưa duyệt.") và ảnh xem trước tải được (200, không lỗi console). Site Studio khi chưa cấu hình (`studio.invalid`): kết nối bị đóng (curl rc 52), host học viên bình thường. Docs/OpenAPI trên cả hai host: 404.
- Kiểm giao diện Studio ở 1440 px và iPhone 13: so computed style của mọi phần tử trong màn Quản trị, Người dùng, Học viên với ảnh 2.5d cũ: không khác biệt nào (thứ tự nạp CSS đổi nhưng không làm vỡ gì). Không cuộn ngang.

## Còn lại / chưa làm

- Đã triển khai VPS ngày 26/11/2026 (xem đầu tài liệu). Chưa có gì kiểm bằng mắt người trên điện thoại cho bản này.
- Metadata của media chưa duyệt vẫn nằm trong DTO danh mục: **vẫn mở**, cần chủ sản phẩm quyết.
- `ALLOW_INTERNAL_DEMO` phải tắt trên bản cho người ngoài.
- Ảnh minh họa của app học viên (~3,4 MB) cũng nằm trong build Studio do dùng chung thư mục `public`.
- ~~`smoke-pilot` và mục (f) của `learner-accounts-check` lỗi trên DB local; `browser-pilot-check` chưa chạy~~: đã sửa và chạy đạt ở lượt trước deploy bên dưới.
- Mỗi lần chạy e2e dùng 8 trong 20 lượt đăng nhập sai/IP/10 phút: hai lần liên tiếp vừa đủ, lần thứ ba trong 10 phút sẽ gặp 429 (khởi động lại API để xóa bộ đếm).

## Lượt sửa trước deploy (26/11/2026, branch `fix/predeploy-25e`, tag local `studio-split-25e-r3-local`)

- **Release hiện hành biến khỏi màn tổng quan (lỗi sản phẩm, có từ trước 2.5e).** `GET /admin/overview` trả 20 release mới nhất. Mỗi lần đăng thử rồi quay lại (smoke, learner-accounts-check f, hay nhân sự bấm "Quay về bộ này") làm release học viên đang dùng già đi; sau 20 lần đăng mới nó không còn trong danh sách (DB local: hạng 65/134). Hệ quả: Studio không cho biết bộ nào đang chạy, và hai script không tìm thấy release nền. Sửa API: vẫn 20 release mới nhất trước, nối thêm release `current:internal`/`current:public` nếu cũ hơn; mọi release có `current: boolean`. Studio ghi "Hiện hành" cạnh release đó. Hai script kiểm thêm cờ `current`. Không migration, hợp đồng OpenAPI không đổi.
- ESLint: cảnh báo `react-hooks/exhaustive-deps` cuối cùng (màn Quản trị) đã sửa bằng hàm nạp ổn định `load(query)`; hành vi giữ nguyên (nạp một lần khi mở, tìm chỉ khi bấm Tìm), có test. `npm run lint`: 0 lỗi, 0 cảnh báo.
- `browser-pilot-check` cần bản thu QA mà smoke chỉ tải khi có `/tmp/seafoodeck-audio-check.mp3`; thiếu file thì script giờ báo rõ thay vì chờ 30 s rồi lỗi. Ghi trong README.
- Runbook: DEPLOY_STUDIO_HOST mục 3 có lệnh build ảnh amd64 và nói rõ từ r1 lên thẳng 2.5e (không migration); DEPLOY_UPGRADE_25C ghi rõ chỉ dùng mục 1–3 và 7 cho 2.5e (mục 4 thiếu bước tạo lại kho S3, mục 6 mở quản trị ở host học viên).
- Sao lưu `sh scripts/backup-pilot.sh _backups/before-25e-r3-20261126`, rồi `API_TAG=studio-split-25e-r3-local WEB_TAG=studio-split-25e-r3-local docker compose --env-file .local/pilot.env up -d --build` (không `down`, giữ volume, không migration mới). Health hai host: `release: studio-split-25e-r3-local`.
- `npm test`: web 327, studio 136, API 433, scripts 43, tất cả pass; build, `check:bundle`, lint, format đạt.
- `smoke-pilot`: 10/10 PASS. `learner-accounts-check`: 11 pass, 1 skip ((j) chưa đủ 3 bản thu), 0 lỗi, (f) đạt. `browser-pilot-check`: đạt (âm thanh 1×/0,75×, một nguồn phát; câu hỏi đầu 2,5 s ở mạng 1,5 Mbps, CPU ×4).
- `npm run test:e2e` hai lần cách nhau hơn 10 phút (và hơn 10 phút sau các script trên): lần 1 lúc 11:11 và lần 2 lúc 11:22, đều **52 pass / 6 skip / 0 lỗi**.
- `smoke-pilot` và `learner-accounts-check` từ nay cần ảnh API có cờ `current` (lượt sửa này trở đi); chạy với ảnh cũ hơn (ví dụ r1) thì báo lỗi, có chủ ý. Hai script chỉ chạy trên stack local, không chạy trên VPS.

## Tách tầng web (26/11/2026, branch `feat/web-tier-split`)

Chủ dự án chọn tách thật: container học viên chỉ chứa bản build học viên, container Studio chỉ chứa bản build Studio, một `edge` đứng trước. Các mục "ảnh web chứa hai bản build" ở trên là lịch sử của lượt giao đầu 2.5e.

**Đã đổi**
- Service `web` thành `edge` (Caddy: cổng, TLS, header bảo mật, `/api/*`, proxy S3, site Studio chưa cấu hình thì đóng kết nối; không chứa file app), `web-learner` và `web-studio` (Caddy HTTP thuần, mỗi cái chỉ có bản build của mình, không publish cổng). Ba ảnh `seafoodeck-edge`, `seafoodeck-web-learner`, `seafoodeck-web-studio` build từ một `Dockerfile` ở gốc (ba target), `check:bundle` chạy một lần trong stage build nên cả ba build đều hỏng nếu bundle lẫn mã. `apps/web/Dockerfile` và `deploy/Caddyfile.pilot` đã xóa (thay bằng `deploy/edge/Caddyfile`, `deploy/web/Caddyfile`).
- Chỉ `edge` mở cổng (VPS: 80, 443, 443/udp; local: 18089, 18090). Hành vi nhìn từ ngoài giữ nguyên ở cả hai host (status, header, cache, SPA fallback, `X-Edge`, guard Studio).
- Dừng hoặc quay lại một container web không ảnh hưởng host kia (host bị dừng trả 502). Học viên và Studio quay lại riêng được bằng `LEARNER_IMAGE_REF` / `STUDIO_IMAGE_REF`.
- VPS: `EDGE_IMAGE_REF`, `LEARNER_IMAGE_REF`, `STUDIO_IMAGE_REF` thay `WEB_IMAGE_REF`; `scripts/publish-pilot.sh` đẩy bốn ảnh. Runbook nâng cấp và quay lại: [DEPLOY_STUDIO_HOST.md](DEPLOY_STUDIO_HOST.md) mục 3 và 5. Chuyển từ `web` cũ cần gỡ container `web` (đang giữ 80/443) rồi bật `edge`: vài giây ngừng cho cả hai host.

**Không đổi (nói thẳng)**
- `edge` hỏng thì **cả hai host cùng ngừng**: vẫn một VPS, một `edge`, một API, một DB, không HA, không VPS thứ hai, không TLS riêng mỗi app. Tách tầng web chỉ tách ảnh và vòng đời của hai app web, không tăng độ sẵn sàng của hệ thống.
- Không đổi API, DB, vai trò, `/admin*`, kiểm Origin/realm, `learner-edge.ts` hay mã app nào. Chặn đường nhân sự ở host học viên vẫn nằm trong API (header `X-Edge`).
- Caddy volumes `caddy_data`/`caddy_config` giữ nguyên, do đó chứng chỉ không mất khi chuyển.

### Bằng chứng

Kiểm ngày 26/11/2026 trên branch `feat/web-tier-split` (HEAD `bbae093` cho mã; chỉ tài liệu đổi sau đó), máy local, không đụng VPS, không đẩy ảnh.

**Dựng lại stack local** (project `seafoodeck-pilot-acceptance`, giữ volume, không `down`):

    sh scripts/backup-pilot.sh _backups/before-web-split-20261126        # db.sql 19,8 MB, objects.json, images.txt
    API_TAG=web-tier-split-local WEB_TAG=web-tier-split-local docker compose --env-file .local/pilot.env build api edge web-learner web-studio
    API_TAG=web-tier-split-local WEB_TAG=web-tier-split-local docker compose --env-file .local/pilot.env up -d --wait

- Build: `check-bundles: ok (12 markers absent from learner, present in studio; learner index.html clean)` trong stage build chung.
- `docker compose ps`: `api`, `db`, `storage`, `edge`, `web-learner`, `web-studio` đều healthy. Cổng publish chỉ ở `edge`: `127.0.0.1:18089->80/tcp, 127.0.0.1:18090->8090/tcp`; các service khác chỉ có cổng nội bộ (không `->`).
- `/api/v1/health` ở cả hai host: `{"status":"ok","version":"0.6.0","release":"web-tier-split-local"}`.

**Kiểm trên stack đã dựng lại**
- `npm run check:web-tier`: 4/4 ok: (a) ma trận header 16 mục trùng baseline của container `web` cũ; (b) chỉ `edge` publish cổng (6 service đang chạy); (c) `web-learner` 51 file, không marker Studio; `web-studio` 51 file, đủ marker; `edge` không có file app; (d) Caddyfile của edge giữ guard `@unconfigured`.
- `npm run smoke:pilot`: 10/10 PASS.
- `node scripts/learner-accounts-check.mjs`: 11 pass, 1 skip ((j) chưa đủ 3 bản thu, như trước), 0 lỗi.
- `node scripts/browser-pilot-check.mjs` (có `/tmp/seafoodeck-audio-check.mp3`, chạy sau smoke): đạt; câu hỏi đầu 2 541 ms ở mạng 1,5 Mbps, CPU ×4.
- `npm run test:e2e` (sau khi khởi động lại `api` để xóa bộ đếm đăng nhập, 14:18): **52 pass / 6 skip / 0 lỗi**; theo project: `desktop` 12/3 skip, `mobile` 15, `studio-desktop` 14, `studio-mobile` 11/3 skip, giống `main`.

**Cô lập hai container web** (status code của `GET /`):

| Thao tác | Host học viên `/` | Host học viên `/api/v1/health` | Host Studio `/` | Host Studio `/api/v1/health` | `edge` |
| --- | --- | --- | --- | --- | --- |
| `docker compose stop web-studio` | 200 | 200 | **502** | 200 | healthy |
| `start web-studio`, chờ healthy | 200 | | 200 | | |
| `docker compose stop web-learner` | **502** | 200 | 200 | 200 | healthy |
| `start web-learner`, chờ healthy | 200 | | 200 | | |

**Studio chưa cấu hình** (project tạm `seafoodeck-split-unconfigured`, `compose.yaml` của repo, cổng 18191/18192, env sinh bằng `init-pilot` trong thư mục tạm rồi bỏ dòng `STUDIO_SITE_ADDRESS`): `edge`, `web-learner`, `web-studio`, `api` healthy; `edge` nhận `STUDIO_SITE_ADDRESS=http://studio.invalid`. Host học viên `/` 200. `curl http://localhost:18192/` → `curl: (52) Empty reply from server`; `curl -H 'Host: studio.invalid' http://127.0.0.1:18191/` → rc 52. `docker port <project>-web-studio-1` rỗng (không publish cổng). Đã gỡ project này (`docker compose -p seafoodeck-split-unconfigured … down -v`, chỉ project tạm đó).

**Diễn tập chuyển VPS** (project tạm `seafoodeck-split-rehearsal`, một bản clone repo trong thư mục tạm, env sinh bằng `init-pilot` của `main` với secret dùng một lần; file override ngoài repo đưa cổng công khai về `127.0.0.1:18201:80` / `127.0.0.1:18202:443` cho `web` cũ rồi cho `edge`, nên xung đột cổng là thật; `SITE_ADDRESS=:80`, Studio ở host `studio.localhost` trên cùng cổng, không lấy chứng chỉ). Chạy đúng lệnh của [DEPLOY_STUDIO_HOST.md](DEPLOY_STUDIO_HOST.md) mục 3 và 5, chỉ thay: tên project, thêm `-f <override>` vào `dc`, bỏ `sudo` (Docker Desktop), `git pull --ff-only origin feat/web-tier-split` thay `origin main` (chưa merge), mã ảnh là tên ảnh local, và trình soạn thảo được thay bằng `sed`.

1. Bố cục cũ (`git show main:deploy/compose.pilot.ghcr.yaml`, `WEB_IMAGE_REF=seafoodeck-web:studio-split-25e-r3-local`, API r3): `web` healthy, giữ `127.0.0.1:18201->80, 18202->443`; học viên `/` 200, Studio `/` 200, health `release: studio-split-25e-r3-local`. Ghi một file đánh dấu vào `/data` của `web`; `instance.uuid` của Caddy `88ffed34-…`.
2. 3.2: `git status --short` rỗng; `<previous-commit>` = `e43170b`; `backup-pilot.sh` với compose cũ tạo `db.sql`, `objects.json`, `images.txt`; `git pull --ff-only` mang compose mới.
3. 3.3: `grep -o '^[A-Z_]*IMAGE_REF='` thấy API, EDGE, LEARNER, STUDIO, không còn WEB; `compose-ok`; `dc config --images` đúng bốn ảnh mới cùng db, storage.
4. 3.4: `dc pull` lỗi `pull access denied` cho ảnh local (chỉ do diễn tập dùng tên ảnh local; trên VPS là digest GHCR); `migrate`: `No pending migrations to apply.`; `storage` không đổi (đã có `STUDIO_ORIGIN`), `api` lên ảnh mới, `web` cũ vẫn phục vụ (200). Mọi lệnh `dc up` từ đây in cảnh báo `Found orphan containers (…-web-1)`.
5. 3.5: `web-learner`, `web-studio` healthy song song với `web` cũ; hai host vẫn 200.
6. Thử bật `edge` trước khi gỡ `web` (ngoài runbook, để chứng minh): `Bind for 127.0.0.1:18201 failed: port is already allocated`, container `edge` nằm lại ở trạng thái `created`. `dc rm -sf web` với file mới: `no such service: web` (container `web` vẫn chạy), nên cần lệnh `docker rm -f` theo nhãn.
7. 3.6: lệnh lọc nhãn ra đúng một dòng `…-web-1 seafoodeck-web:studio-split-25e-r3-local`; `docker rm -f $(…)` gỡ nó. **Lỗi runbook tìm thấy**: `dc up -d --no-deps edge` (như viết lúc đó) bật lại chính container `edge` tạo ở bước 6, `edge` healthy nhưng `NetworkSettings.Ports` rỗng: cả hai host từ chối kết nối. `dc up -d --no-deps --force-recreate edge` tạo container mới: học viên 200 sau ~1 s, `edge` có `127.0.0.1:18201->80, 18202->443`. Runbook đã sửa sang `--force-recreate` và yêu cầu kiểm cột PORTS. Lượt chuyển sạch thứ hai (không có bước 6) với lệnh như viết và lượt thứ ba với `--force-recreate`: đều 200 ngay, `edge` có cổng.
8. Chứng chỉ: `edge` gắn `seafoodeck-split-rehearsal_caddy_data:/data` và `…_caddy_config:/config`, đúng hai volume `web` cũ dùng (cùng tên, cùng `CreatedAt 2026-11-26T07:32:41Z`); file đánh dấu và `instance.uuid` `88ffed34-…` vẫn còn trong `edge` và lại thấy trong `web` sau khi quay lại.
9. Mục 4 (phần chạy được local): cổng chỉ ở `edge`; học viên `admin/users`, `manager/learners`, `docs`, `openapi.json` đều 404; Studio `admin/users` 401; health hai host `release: web-tier-split-local`.
10. Quay lại một app (mục 5): `LEARNER_IMAGE_REF` về ảnh learner r3, `dc up -d --no-deps web-learner`: host học viên 502 khoảng 1 s rồi 200, host Studio 200 suốt, `edge`/`web-studio` không bị tạo lại.
11. Quay lại bố cục một `web` (mục 5, vòng `docker rm -f` theo từng service, `git checkout e43170b -- deploy/compose.pilot.ghcr.yaml`, trả hai dòng `API/WEB_IMAGE_REF`, `storage`, `api`, `web`): ba lần, lần nào cũng `web` r3 giữ lại cổng, hai host 200, health `release: studio-split-25e-r3-local`; host học viên trở lại 200 khoảng 11 s sau lệnh `rm` đầu tiên. **Lỗi runbook tìm thấy**: câu "khi ổn định, trả file compose về bản mới bằng `git checkout HEAD`" làm mọi lệnh `dc` lỗi (`required variable LEARNER_IMAGE_REF is missing a value`) chừng nào env còn là `WEB_IMAGE_REF`; runbook giờ bảo giữ file cũ khi bản cũ chạy và chỉ trả file ngay trước `git pull` của lần nâng cấp sau.
12. Đã gỡ project tạm (`docker compose -p seafoodeck-split-rehearsal … down -v --remove-orphans`, chỉ project đó); không còn container hay volume `seafoodeck-split-*`.

Lệnh của runbook đã chạy trong diễn tập: mục 3.2 (trừ `sudo`), 3.3, 3.4 (`dc pull` chỉ với ảnh registry), 3.5, 3.6, phần cổng/404/401/health của mục 4, cả ba nhánh quay lại ở mục 5 trừ nhánh "chỉ site Studio lỗi". Lưu ý: thứ tự các lệnh của nhánh quay lại bố cục một `web` được đổi sau lần review cuối (đổi compose, env và `dc pull` lên trước vòng gỡ container) và chưa diễn tập lại nguyên thứ tự mới. Chưa chạy (cần VPS, DNS hoặc GHCR thật): mục 1 (`dig`), build amd64 trên máy build và `publish-pilot.sh`/`imagetools inspect` ở 3.1, kiểm HTTPS/chứng chỉ thật, đếm catalogue trên DB thật, đăng nhập trình duyệt ở mục 4.

**Cổng kiểm cuối** (một lần, trên stack đã dựng lại): `format:check`, `lint` (0 lỗi, 0 cảnh báo), `typecheck` đạt; `node --test "scripts/*.test.mjs"` 38/38; `npm test`: web 327, studio 136, API 435, scripts 58 (gồm prototype), tất cả pass; `npm run build` đạt; `check:bundle` ok; `check:web-tier` 4/4 ok.

Còn lại cho chủ dự án: build và kiểm bốn ảnh amd64 thật, đẩy GHCR, rồi làm theo runbook trên VPS (khoảng ngừng vài giây cho cả hai host ở 3.6).
