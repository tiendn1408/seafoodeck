# Nâng cấp VPS lên bản 2.5c (tag `<TAG-2.5c>`)

Từ bản đang chạy trên VPS `learner-demo-20261120-r1` (đã nâng ngày 20/11/2026, xem [biên bản](DEPLOY_LEARNER_DEMO_20261120.md)) lên bản 2.5c: màn quản lý (`#manager`) có bảng học viên, chi tiết học viên chỉ đọc, xuất CSV và hộp thoại tạo hàng loạt bằng CSV ở màn Người dùng của quản trị. Chạy trên VPS qua SSH, từng đoạn một. Thay `<TAG-2.5c>` và hai mã ảnh bằng giá trị thật sau khi build; không dùng tag chưa điền.

**Không có migration mới.** Đã kiểm trong repo: `apps/api/prisma/migrations` có đúng bốn thư mục `202611170001_initial`, `202611180001_alias_search`, `202611190001_learner_accounts`, `202611200001_username_ci`; tài liệu demo 20/11 ghi VPS đã chạy hai migration cuối (`202611190001_learner_accounts`, `202611200001_username_ci`). `git diff --stat 1692138 HEAD -- apps/api/prisma` (source của bản r1) rỗng, tức schema không đổi. Vì vậy bước `migrate` bên dưới chỉ để xác nhận "không có gì để áp dụng". Trước khi chạy thật, chạy lại lệnh `git diff` trên commit release 2.5c thực tế để chắc chắn.

> **Từ 2.5e** ảnh web có hai site: host học viên và host Studio riêng cho nhân sự. Màn quản trị không còn ở `https://seafoodeck.tiendn.io.vn/#admin` (mục 6 bên dưới chỉ đúng cho 2.5c/2.5d). Nâng lên 2.5e: làm DNS và biến môi trường theo [DEPLOY_STUDIO_HOST.md](DEPLOY_STUDIO_HOST.md) trước, rồi mới deploy theo các mục dưới.

Mã nhận diện hai ảnh (điền sau khi push GHCR và kiểm bằng `docker buildx imagetools inspect`):

    API_IMAGE_REF=ghcr.io/tiendn1408/seafoodeck-api@sha256:<DIGEST-API>
    WEB_IMAGE_REF=ghcr.io/tiendn1408/seafoodeck-web@sha256:<DIGEST-WEB>

## 0. Build và đẩy ảnh (máy build, không phải VPS)

Chỉ push hai ảnh amd64 đã kiểm cục bộ đúng tag này:

    echo "$GHCR_TOKEN" | docker login ghcr.io -u tiendn1408 --password-stdin
    sh scripts/publish-pilot.sh <TAG-2.5c>
    docker buildx imagetools inspect ghcr.io/tiendn1408/seafoodeck-api:<TAG-2.5c>
    docker buildx imagetools inspect ghcr.io/tiendn1408/seafoodeck-web:<TAG-2.5c>

`publish-pilot.sh` in digest của từng ảnh; ghi lại hai digest vào hai dòng ở trên. Không đưa token vào tài liệu hay lịch sử chia sẻ.

Từ 2.5d, bước build của ảnh web (`apps/web/Dockerfile` và `Dockerfile` ở gốc) chạy `npm run build && npm run check:bundle`: nếu mã admin/manager lọt vào bundle tải cho mọi người thì build ảnh web thất bại, không có ảnh để push. Ảnh web build trước 2.5d chưa có bước này; build lại, không push ảnh cũ.

## 1. Sao lưu trước (DB và ảnh)

Script dừng API vài chục giây trong lúc sao lưu, nên làm lúc không có ai dùng. Backup chứa dữ liệu riêng tư, không đưa lên GitHub. Trước `git pull --ff-only`: thư mục làm việc phải sạch (`git status` rỗng) và 2.5c phải đã được merge vào `main` trên origin; nếu chưa, dừng lại, không kéo nhánh khác lên VPS.

    cd /opt/seafoodeck-pilot
    git status --short          # phải rỗng; nếu có file sửa tay, dừng lại xử lý trước
    git fetch origin && git log --oneline -1 origin/main   # phải là commit đã merge 2.5c
    git pull --ff-only origin main
    sudo env PILOT_COMPOSE_FILE=deploy/compose.pilot.ghcr.yaml sh scripts/backup-pilot.sh _backups/before-25c
    ls -la _backups/before-25c      # phải thấy db.sql, objects.json và images.txt

## 2. Ghi nhớ bản đang chạy (để quay lại)

    grep -E '^(API|WEB)_IMAGE_REF=' .local/pilot.env     # chỉ in hai dòng này, không in cả file

Lưu hai dòng này (bản `learner-demo-20261120-r1`; cũng có trong tài liệu demo 20/11). Không `cat` hay in toàn bộ `.local/pilot.env`.

## 3. Đổi hai mã ảnh

    sed -i 's#^API_IMAGE_REF=.*#API_IMAGE_REF=ghcr.io/tiendn1408/seafoodeck-api@sha256:<DIGEST-API>#' .local/pilot.env
    sed -i 's#^WEB_IMAGE_REF=.*#WEB_IMAGE_REF=ghcr.io/tiendn1408/seafoodeck-web@sha256:<DIGEST-WEB>#' .local/pilot.env
    # alias chỉ có trong shell tương tác (gõ tay qua SSH); trong script hãy viết đầy đủ lệnh này
    alias dc='sudo docker compose --env-file .local/pilot.env --project-directory . -f deploy/compose.pilot.ghcr.yaml'
    dc config --images      # phải thấy đúng hai mã mới

## 4. Kéo ảnh, tạo lại API rồi web

    dc pull
    dc run --rm --no-deps migrate    # mong đợi: không có migration nào cần áp dụng, kết thúc không lỗi
    dc up -d --no-deps api           # API trước
    dc ps                            # api phải healthy
    dc up -d --no-deps web           # rồi web; db và kho ảnh giữ nguyên
    dc ps
    curl -fsS https://seafoodeck.tiendn.io.vn/api/v1/health
    # mong đợi: "release":"<TAG-2.5c>"

Không `down -v`, không xóa volume `pilot_db`, `pilot_storage`, không đụng container bot trading.

## 5. Smoke

`npm run smoke:pilot` **ghi dữ liệu**: nó tạo một release nội bộ và tải media QA lên (đã đọc `scripts/smoke-pilot.mjs`), nên **không chạy trên VPS đang giữ release nội bộ thật** (`a6d156c4-...`). Chạy smoke đầy đủ trên stack cô lập cùng hai ảnh `<TAG-2.5c>` trước khi lên VPS. Trên VPS, "smoke" chỉ là kiểm không ghi:

    curl -fsS https://seafoodeck.tiendn.io.vn/api/v1/health      # release đúng <TAG-2.5c>
    curl -fsSI https://seafoodeck.tiendn.io.vn/ | head -1         # HTTP 200, TLS hợp lệ
    dc ps                                                          # api, web, db, storage healthy
    curl -s -o /dev/null -w '%{http_code}\n' https://seafoodeck.tiendn.io.vn/api/v1/docs          # phải là 404
    curl -s -o /dev/null -w '%{http_code}\n' https://seafoodeck.tiendn.io.vn/api/v1/openapi.json  # phải là 404

Từ 2.5e host học viên trả 404 cho cả `/api/v1/admin*` và `/api/v1/manager*`, giống hệt đường không tồn tại (từ 2.5e việc chặn, kể cả docs/openapi, nằm trong API theo header `X-Edge` do Caddy gắn, không còn ở `respond 404` của Caddy); kiểm thêm ở [DEPLOY_STUDIO_HOST.md](DEPLOY_STUDIO_HOST.md) mục 4. Hai dòng cuối kiểm rằng tài liệu API (Swagger, liệt kê mọi route `/admin/*`, `/manager/*`) không lộ ra ngoài: API chỉ phục vụ khi `EXPOSE_API_DOCS=true` (mặc định tắt, không đặt trong `.local/pilot.env`), và `deploy/Caddyfile.pilot` (từ 2.5d) trả 404 cho `/api/v1/docs*`, `/api/v1/openapi*` dù API có bật. Khác 404 là lỗi: kiểm `.local/pilot.env` không có `EXPOSE_API_DOCS=true` rồi recreate API. Ảnh API trước 2.5d luôn phục vụ hai đường này (chưa có cờ), chỉ chặn được ở Caddy.

Sau đó làm mục 6. So số liệu catalogue trước/sau bằng tay: 96 Item, 96 Revision, 94 MediaAsset, release nội bộ giữ nguyên. Số trước nâng cấp đọc trong [biên bản demo 20/11](DEPLOY_LEARNER_DEMO_20261120.md) (mục kiểm sau nâng cấp); số sau nâng cấp đếm trong DB, ví dụ:

    dc exec -T db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc "select (select count(*) from \"Item\"), (select count(*) from \"Revision\"), (select count(*) from \"MediaAsset\")"'

## 6. Kiểm tay trong trình duyệt

Các bước 1–6 dưới đây đã được chạy tự động trên stack Docker local (bản `manager-admin-25c-local`, ngày 23/11/2026) bằng `npm run test:e2e`, xem [DELIVERY_25C.md](DELIVERY_25C.md). Chưa kiểm trên VPS. Lỗi cuộn ngang ở màn chi tiết học viên đã sửa trong lượt sửa sau review cuối; e2e kiểm lại đạt.

1. Đăng nhập quản trị tại `https://seafoodeck.tiendn.io.vn/#admin`. Mở `#admin/users`, tạo học viên "An" (vai trò student) với mật khẩu do **chủ dự án tự chọn**; không ghi mật khẩu vào tài liệu, repo, chat hay log. Tạo thêm một tài khoản vai trò manager nếu chưa có.
2. Đăng nhập bằng tài khoản manager: phải vào `#manager` và thấy bảng học viên (có "An"), lọc/sắp xếp được.
3. Mở chi tiết học viên: chỉ đọc, không có nút sửa.
4. Xuất CSV danh sách học viên; mở file kiểm cột và dấu tiếng Việt.
5. Màn Người dùng của quản trị: mở hộp thoại tạo hàng loạt bằng CSV, chỉ chạy bước kiểm thử (dry-run) trước; không tạo hàng loạt trên VPS nếu chưa có danh sách thật.
6. Đăng nhập học viên (ví dụ `demo-hoc-vien` hoặc "An"), chơi một phiên flashcard, đăng xuất và đăng nhập lại: tiến độ còn; bảng manager cập nhật số liệu.
7. Dữ liệu cũ (96 mục, 94 media, release nội bộ) vẫn còn.

Nếu cần có số liệu mẫu để xem thử bảng manager, dùng `node scripts/demo-learner-play.mjs --username <học viên>` ở máy local (mật khẩu nhập qua prompt ẩn; script từ chối địa chỉ không phải loopback). Không chạy trên VPS với tài khoản khách thật.

## 7. Quay lại nếu có sự cố

Sửa hai dòng `API_IMAGE_REF` và `WEB_IMAGE_REF` về hai dòng đã lưu ở mục 2 (bản `learner-demo-20261120-r1`, digest ở `docs/DEPLOY_LEARNER_DEMO_20261120.md`), rồi:

    dc pull
    dc up -d --no-deps api
    dc up -d --no-deps web

Nếu cần khôi phục dữ liệu từ `_backups/before-25c` (DB/ảnh hỏng, không chỉ lỗi giao diện), dùng cặp `db.sql` và `objects.json` cùng thời điểm trên stack cô lập trước, không restore đè DB đang chạy.

Đã kiểm: 2.5c không có migration mới và `git diff` thư mục `prisma` so với source r1 rỗng, nên DB sau nâng cấp có cùng schema với bản r1. Ảnh r1 không có màn manager (`#manager`, bảng học viên, CSV, hộp thoại tạo hàng loạt), nên sau khi quay lại các màn đó biến mất; học viên và quản trị dùng như trước. **Chưa kiểm chứng**: việc quay lại ảnh r1 chạy đúng trên DB đã có dữ liệu do 2.5c ghi (chưa thử rollback thực tế; chưa rà đầy đủ xem 2.5c có ghi dữ liệu mới mà r1 không đọc được). Vì vậy sao lưu ở mục 1 là bắt buộc trước khi nâng cấp.

## Lưu ý vận hành

- Khóa tiến độ theo từng người dùng nằm trong tiến trình API: chỉ chạy **một** container API.
- `rebuild:progress` (dựng lại tiến độ) chỉ chạy khi API đã dừng; không chạy khi API còn bật.
- Tiến độ HS của một loài đặt lại khi ghi chú, SKU hoặc ảnh của loài đó đổi.
- `ALLOW_INTERNAL_DEMO` chỉ để xem nội bộ; tắt khi mở cho người ngoài. Nội dung chưa được khách duyệt vẫn là nội bộ.
- `EXPOSE_API_DOCS` để trống hoặc `false` trên VPS. Chỉ đặt `true` khi chạy API cục bộ và cần xem Swagger tại `/api/v1/docs`; đặc tả trong repo là `docs/api/openapi.json` (`npm run contract:generate`, không cần cờ).
- Giới hạn đăng nhập nằm trong bộ nhớ: mất khi API khởi động lại.
- Tài khoản demo hiện có là `demo-hoc-vien` (vai trò student, buộc đổi mật khẩu lần đầu). Credential chỉ nằm trong file quyền 600 trên VPS (`/opt/seafoodeck-pilot/.local/demo-hoc-vien-20261120.json`), không ghi vào Git/chat/log.
- Đoán hình cần media loại `identification`; trên VPS cả 94 media hiện là `profile`, draft, nên chế độ này báo chưa đủ ảnh gốc hợp lệ. Danh mục 96 mục hiện là dữ liệu tham khảo của prototype (có cả tôm), chưa phải danh mục khách đã duyệt.
- Hoàn tác chỉ mục username không phân biệt hoa thường (nếu cần, chỉ khi quay về schema cũ): `DROP INDEX "User_username_lower_key";` rồi mới chạy lại image cũ hơn r1. Không cần cho nâng cấp 2.5c.
