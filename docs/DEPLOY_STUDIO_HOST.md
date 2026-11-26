# Host Studio riêng cho nhân sự (phase 2.5e)

> Tài liệu này dành cho stack pilot 0.6 (`deploy/compose.pilot.ghcr.yaml`). `deploy/compose.origin.yaml` và `deploy/compose.ghcr.yaml` là bản 0.5 một container `web` (xem [DEPLOY_GHCR.md](DEPLOY_GHCR.md)), không liên quan tới các bước dưới (legacy 0.5).

Từ 2.5e tầng web là ba container, ba ảnh, chỉ `edge` mở cổng: `edge` (Caddy: TLS, header bảo mật, `/api/*` tới API, proxy S3, site Studio chưa cấu hình thì đóng kết nối; cấu hình `deploy/edge/Caddyfile`, không chứa file app) chuyển mọi request còn lại theo host tới `web-learner` (chỉ bản build học viên) hoặc `web-studio` (chỉ bản build Studio); hai container web chạy Caddy HTTP thuần (`deploy/web/Caddyfile`), không publish cổng. Dừng hoặc quay lại một container web không ảnh hưởng host kia (host kia vẫn chạy, host bị dừng trả 502). Hai site của `edge`:

- **Host học viên** `seafoodeck.tiendn.io.vn` (`SITE_ADDRESS`, `PUBLIC_ORIGIN`): chỉ app học viên. `/api/v1/admin*`, `/api/v1/manager*`, `/api/v1/docs*`, `/api/v1/openapi*` trả 404 giống hệt một đường API không tồn tại: cùng status, cùng body JSON (`Cannot <METHOD> <đường dẫn>`), cùng header, cùng cách xử lý body lỗi (JSON hỏng → 400, body quá 5 MB → 413). Caddy gắn header `X-Edge: learner` (ghi đè giá trị client gửi) cho mọi request `/api/*` từ host này; API (`apps/api/src/learner-edge.ts`) biến các đường nhân sự thành route không tồn tại sau bộ đọc body và trước khi định tuyến, nên 404 đi đúng pipeline của một đường không tồn tại. Container API không publish cổng nào: Caddy là đường vào duy nhất, nên header này không giả được từ ngoài.
- **Host Studio** `seafoodeckstudio.tiendn.io.vn` (`STUDIO_SITE_ADDRESS`, `STUDIO_ORIGIN`): chỉ app Studio, thêm `X-Robots-Tag: noindex, nofollow` (header bảo mật giống host học viên), toàn bộ `/api/*` tới API (Caddy xóa mọi `X-Edge` client gửi).

Vai trò editor/reviewer/publisher/manager/admin chỉ đăng nhập được ở host Studio; student/learner và mã mời chỉ ở host học viên. Đăng nhập sai host nhận đúng phản hồi của sai mật khẩu. Cookie theo từng host, không dùng chung.

**Bắt buộc sau khi lên ảnh web 2.5e:** ảnh học viên không còn giao diện quản trị. Nếu `STUDIO_SITE_ADDRESS` chưa đặt, site Studio không được phục vụ (`edge` chỉ gắn nó vào host giả `studio.invalid` và đóng kết nối) và nhân sự **không có giao diện** cho tới khi cấu hình xong. API vẫn tương thích ngược: không đặt `STUDIO_ORIGIN` thì mọi vai trò đăng nhập ở một origin như cũ, nhưng không có màn quản trị nào để dùng.

Nhân sự được báo URL mới ngoài hệ thống (chủ dự án tự báo); không có trang chuyển hướng hay thông báo trong app.

## 1. DNS (làm trước tiên)

Tạo bản ghi cho host Studio trỏ về **cùng VPS** với host học viên:

- `A seafoodeckstudio.tiendn.io.vn` → cùng địa chỉ IPv4 với `seafoodeck.tiendn.io.vn`.
- `AAAA seafoodeckstudio.tiendn.io.vn` → cùng địa chỉ IPv6, **chỉ khi** host học viên đang có AAAA. Không tạo AAAA nếu VPS không nhận IPv6 trên cổng 80/443 (Let's Encrypt có thể thử IPv6 trước và thất bại).

Kiểm từ máy bất kỳ, hai kết quả phải trùng nhau:

    dig +short A seafoodeck.tiendn.io.vn
    dig +short A seafoodeckstudio.tiendn.io.vn
    dig +short AAAA seafoodeck.tiendn.io.vn
    dig +short AAAA seafoodeckstudio.tiendn.io.vn

Chờ DNS phân giải đúng rồi mới sang bước 2. Caddy tự lấy chứng chỉ cho host Studio khi DNS đã trỏ về VPS và cổng 80/443 mở (đã mở cho host học viên).

## 2. Biến môi trường trên VPS

Thêm vào `.local/pilot.env` trên VPS (file quyền 600; không `cat`, không in cả file, không dán nội dung vào chat/log):

| Biến | Giá trị (dạng) | Dùng bởi |
| --- | --- | --- |
| `STUDIO_ORIGIN` | origin HTTPS của host Studio (scheme + host, không có `/` cuối) | API (realm đăng nhập, kiểm Origin khi ghi), kho S3 (CORS) |
| `STUDIO_SITE_ADDRESS` | tên host Studio, không scheme, không cổng (để Caddy tự cấp HTTPS) | `edge` (Caddy) |

**`STUDIO_ORIGIN` phải ghi đúng dạng chuẩn** `scheme://host[:cổng khác mặc định]`, chữ thường, không `/` cuối, không đường dẫn/query/thông tin đăng nhập, khác `PUBLIC_ORIGIN`. Giá trị sai không được sửa ngầm: API **từ chối khởi động** (log `API startup refused: …`) và `scripts/init-pilot.mjs` từ chối (thoát lỗi) với câu `STUDIO_ORIGIN must be written exactly as https://seafoodeckstudio.tiendn.io.vn (it is also the S3 CORS entry).` Đúng: `https://seafoodeckstudio.tiendn.io.vn`; sai: `https://seafoodeckstudio.tiendn.io.vn/`, `https://SeafoodeckStudio.tiendn.io.vn`, `https://seafoodeckstudio.tiendn.io.vn:443`. Lý do: compose chép nguyên chuỗi này vào CORS của kho S3. `PUBLIC_ORIGIN` vẫn được so sánh sau khi chuẩn hóa (không bị từ chối).

`STUDIO_WEB_PORT` chỉ dùng cho stack local (`compose.yaml`); `deploy/compose.pilot.ghcr.yaml` không publish cổng nào cho Studio (Caddy phục vụ host Studio qua 80/443 theo tên host), nên không cần kiểm hay đặt cổng đó trên VPS.

Sửa bằng trình soạn thảo (`sudo -e .local/pilot.env`) rồi chỉ kiểm **tên** biến:

    grep -o '^STUDIO_[A-Z_]*' .local/pilot.env      # phải thấy STUDIO_ORIGIN và STUDIO_SITE_ADDRESS
    alias dc='sudo docker compose --env-file .local/pilot.env --project-directory . -f deploy/compose.pilot.ghcr.yaml'
    dc config --quiet && echo compose-ok

Cài mới bằng `node scripts/init-pilot.mjs --production --origin https://<host học viên> --studio-origin https://<host Studio>`: script ghi sẵn cả `STUDIO_ORIGIN` và `STUDIO_SITE_ADDRESS`.

Đặt `STUDIO_ORIGIN` trước khi DNS sẵn sàng chỉ có nghĩa là site Studio chưa lấy được chứng chỉ; nhưng ngay khi API mới chạy với `STUDIO_ORIGIN`, nhân sự không đăng nhập được ở host học viên nữa. Vì vậy giữ đúng thứ tự DNS → env → deploy.

## 3. Deploy (sau DNS và env)

Từ bản đang chạy `learner-demo-20261120-r1` (một origin, một container `web`): 2.5c, 2.5d, 2.5e không thêm migration (vẫn bốn thư mục trong `apps/api/prisma/migrations`, VPS đã chạy đủ), nên nhảy thẳng lên bản tách ba ảnh, không cần lên 2.5c trước. Chủ dự án tự chạy từng lệnh; dừng ở mỗi dòng "DỪNG" nếu kết quả không đúng.

**Biết trước:** container `web` cũ đang giữ cổng 80/443 nên `edge` không bind được cho tới khi nó bị gỡ; file compose mới không còn tên `web`, nên `dc rm web` không dùng được. Vì thế có một khoảng ngừng **vài giây cho cả hai host** giữa lúc gỡ `web` cũ và lúc `edge` lên (bước 3.6). Chứng chỉ không mất: `edge` gắn đúng volume `caddy_data` mà `web` cũ dùng. Không `down -v`, không xóa volume.

### 3.1 Build ba ảnh web và ảnh API (máy build, không phải VPS)

Từ commit đã merge vào `main` trên origin, tag mới `<TAG>` (không ghi đè tag đã bàn giao). Ba ảnh web build từ một `Dockerfile` ở gốc (cùng một lần chạy `check:bundle`, nên cả ba build đều hỏng nếu bundle học viên lẫn mã quản trị), mỗi ảnh một `--target`:

    docker build --platform linux/amd64 --build-arg RELEASE_TAG=<TAG> -f apps/api/Dockerfile -t seafoodeck-api:<TAG> .
    docker build --platform linux/amd64 --build-arg RELEASE_TAG=<TAG> --target edge -t seafoodeck-edge:<TAG> .
    docker build --platform linux/amd64 --build-arg RELEASE_TAG=<TAG> --target web-learner -t seafoodeck-web-learner:<TAG> .
    docker build --platform linux/amd64 --build-arg RELEASE_TAG=<TAG> --target web-studio -t seafoodeck-web-studio:<TAG> .

Đẩy và kiểm (cả bốn ảnh):

    echo "$GHCR_TOKEN" | docker login ghcr.io -u tiendn1408 --password-stdin
    sh scripts/publish-pilot.sh <TAG>     # đẩy và in digest của api, edge, web-learner, web-studio; từ chối ảnh không phải amd64
    for n in api edge web-learner web-studio; do
      docker buildx imagetools inspect ghcr.io/tiendn1408/seafoodeck-$n:<TAG>
      docker buildx imagetools inspect --format '{{.Image.Architecture}}/{{.Image.OS}}' ghcr.io/tiendn1408/seafoodeck-$n:<TAG>   # phải là amd64/linux
    done

Dòng `Digest:` của mỗi lệnh inspect (trên registry) phải trùng digest `publish-pilot.sh` in cho ảnh đó và kiến trúc phải là `amd64/linux`. DỪNG nếu có ảnh nào không đạt. Chỉ khi đạt mới ghi bốn mã (VPS kéo theo digest):

    API_IMAGE_REF=ghcr.io/tiendn1408/seafoodeck-api@sha256:<DIGEST-API>
    EDGE_IMAGE_REF=ghcr.io/tiendn1408/seafoodeck-edge@sha256:<DIGEST-EDGE>
    LEARNER_IMAGE_REF=ghcr.io/tiendn1408/seafoodeck-web-learner@sha256:<DIGEST-LEARNER>
    STUDIO_IMAGE_REF=ghcr.io/tiendn1408/seafoodeck-web-studio@sha256:<DIGEST-STUDIO>

Không đưa token vào tài liệu hay lịch sử chia sẻ.

### 3.2 Sao lưu và kéo mã (VPS)

Script dừng API vài chục giây trong lúc sao lưu, nên làm lúc không có ai dùng. Backup chứa dữ liệu riêng tư, không đưa lên GitHub. Trước `git pull --ff-only`: thư mục làm việc phải sạch và commit tách web phải đã được merge vào `main` trên origin; nếu chưa, dừng lại, không kéo nhánh khác lên VPS.

    cd /opt/seafoodeck-pilot
    git status --short          # phải rỗng (sau một lần quay lại: chỉ M deploy/compose.pilot.ghcr.yaml, xem mục 5); nếu có file sửa tay, dừng lại xử lý trước
    git fetch origin && git log --oneline -1 origin/main   # phải là commit đã merge bản tách web
    git rev-parse --short HEAD  # ghi lại: đây là <previous-commit> cho phần Quay lại (mục 5)
    sudo env PILOT_COMPOSE_FILE=deploy/compose.pilot.ghcr.yaml sh scripts/backup-pilot.sh _backups/before-web-split
    ls -la _backups/before-web-split      # phải thấy db.sql, objects.json và images.txt
    # Ghi lại số liệu catalogue TRƯỚC khi đổi ảnh (lệnh đếm ở mục 4, đang chạy ảnh cũ) để so sau deploy.
    git pull --ff-only origin main        # BẮT BUỘC: mang về compose mới (ba dịch vụ web, ba biến *_IMAGE_REF); thiếu bước này thì ảnh mới chạy với compose cũ

### 3.3 Ghi nhớ bản đang chạy rồi đổi mã ảnh (VPS)

    grep -E '^(API|WEB)_IMAGE_REF=' .local/pilot.env     # chỉ in hai dòng này, không in cả file; lưu lại để quay lại

Không `cat` hay in toàn bộ `.local/pilot.env`. Mở file bằng trình soạn thảo, đổi `API_IMAGE_REF` sang digest mới, **xóa** dòng `WEB_IMAGE_REF` và thêm ba dòng `EDGE_IMAGE_REF`, `LEARNER_IMAGE_REF`, `STUDIO_IMAGE_REF` (giá trị digest ở mục 3.1):

    sudo -e .local/pilot.env

**Các giá trị mặc định trong `deploy/pilot.env.example` và do `init-pilot` ghi chỉ là chỗ giữ chỗ** (tag có thể chưa tồn tại trên GHCR). Phải thay cả ba mã bằng digest do `publish-pilot.sh` in **trước khi** `dc pull`; kéo tag giữ chỗ sẽ lỗi khó hiểu. Chỉ kiểm tên biến và các ảnh mà compose sẽ dùng:

    grep -o '^[A-Z_]*IMAGE_REF=' .local/pilot.env      # phải thấy API, EDGE, LEARNER, STUDIO; không còn WEB_IMAGE_REF
    alias dc='sudo docker compose --env-file .local/pilot.env --project-directory . -f deploy/compose.pilot.ghcr.yaml'
    dc config --quiet && echo compose-ok
    dc config --images      # phải thấy đúng bốn mã @sha256 mới (cùng db, storage), không có tag giữ chỗ

DỪNG nếu `compose-ok` không hiện hoặc `dc config --images` còn tag giữ chỗ. (`alias` chỉ có trong shell tương tác; trong script hãy viết đầy đủ lệnh.)

### 3.4 Kéo ảnh, migrate, storage, API (VPS)

    dc pull
    dc run --rm --no-deps migrate    # mong đợi: không có migration nào cần áp dụng, kết thúc không lỗi
    dc up -d --no-deps storage       # tạo lại kho S3 để CORS nhận thêm STUDIO_ORIGIN
    dc up -d --no-deps api           # API trước
    dc ps                            # storage, api healthy; web cũ vẫn chạy và vẫn phục vụ

Từ bước này, mỗi lệnh `dc up` in cảnh báo `Found orphan containers (<project>-web-1)`: bình thường (compose mới không còn tên `web`). **Đừng** thêm `--remove-orphans` và đừng chạy `dc up -d` không kèm tên service trước bước 3.6: cả hai sẽ gỡ `web` cũ hoặc thử bật `edge` sớm (`edge` không bind được cổng, xem 3.6).

### 3.5 Hai container web mới (VPS, chưa có gián đoạn)

Hai container này không publish cổng nên chạy được song song với `web` cũ:

    dc up -d --no-deps web-learner web-studio
    dc ps                                          # chờ cả hai: healthy (tối đa khoảng 100 giây)

DỪNG nếu một trong hai không healthy: `dc logs --tail 50 web-learner web-studio`. Trang đang chạy chưa bị đụng tới.

### 3.6 Gỡ `web` cũ rồi bật `edge` (VPS, vài giây ngừng cho cả hai host)

`<project>` là `PILOT_PROJECT_NAME` (mặc định `seafoodeck-pilot`). Đọc nó mà không in secret (không `cat` file env): lấy từ nhãn của container đang chạy.

    sudo docker compose ls                # tên project của stack pilot ở cột NAME
    sudo docker ps -a --format '{{.Names}}  {{.Label "com.docker.compose.project"}}  {{.Label "com.docker.compose.service"}}'
    P=seafoodeck-pilot                    # thay bằng đúng tên project vừa đọc nếu khác

Gỡ container `web` cũ. Lý do: file compose mới không còn tên `web` (nên `dc rm web` không biết nó) và container này đang giữ cổng 80/443 nên `edge` không bind được. Câu lệnh chọn theo nhãn project và service, nên không đụng tới project khác trên VPS:

    sudo docker ps -a --filter label=com.docker.compose.project=$P --filter label=com.docker.compose.service=web --format '{{.Names}} {{.Image}}'   # phải đúng một dòng: web cũ của stack pilot
    sudo docker rm -f $(sudo docker ps -aq --filter label=com.docker.compose.project=$P --filter label=com.docker.compose.service=web)
    dc up -d --no-deps --force-recreate edge
    dc ps                                  # edge healthy VÀ cột PORTS của edge có 80/443 (chỉ ở edge)
    dc logs --since 5m edge | grep -i -E 'certificate|error' | tail -20

Lý do `--force-recreate`: nếu `edge` từng được tạo khi `web` cũ còn giữ cổng (một lần `dc up` sớm, báo `port is already allocated`), container đó nằm lại ở trạng thái Created; `dc up -d --no-deps edge` không kèm cờ sẽ bật lại đúng container đó và Docker có thể bật nó **không publish cổng nào** (quan sát được trong diễn tập trên Docker Desktop, chưa tái hiện trên Docker Linux; `edge` healthy nhưng cả hai host từ chối kết nối). `--force-recreate` luôn tạo container mới, vô hại khi chưa có. Vì vậy `edge` healthy chưa đủ: cột PORTS của `edge` trong `dc ps` phải có 80 và 443.

DỪNG và đọc mục 5 nếu dòng lọc đầu tiên không phải đúng một container `web` hoặc `edge` không healthy (hoặc không có cổng) sau vài chục giây. `dc ps` chạy sau khi `edge` lên; từ giờ làm tiếp mục 4.

Không `down -v`, không xóa volume (`caddy_data` giờ là của `edge`), không đụng container của dự án khác trên VPS.

## 4. Kiểm sau deploy

Không chạy `smoke-pilot`, `learner-accounts-check` hay script ghi dữ liệu nào trên VPS. Chỉ các lệnh đọc dưới đây.

Host học viên vẫn chạy, đúng bản:

    curl -fsS https://seafoodeck.tiendn.io.vn/api/v1/health      # "release":"<TAG-2.5e>"
    curl -fsSI https://seafoodeck.tiendn.io.vn/ | head -1         # HTTP 200, TLS hợp lệ
    dc ps                                                          # api, edge, web-learner, web-studio, db, storage healthy
    sudo docker ps --filter label=com.docker.compose.project=$P --format '{{.Label "com.docker.compose.service"}}  {{.Ports}}'   # cổng chỉ ở edge (80, 443)

Catalogue không đổi (chỉ đọc): so với số trước nâng cấp (biên bản 20/11: **96 Item, 96 Revision, 94 MediaAsset**, release nội bộ `a6d156c4-02ac-45a8-83ae-9ad5b9f19599`; hoặc số bạn ghi ở mục 3):

    dc exec -T db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc "select (select count(*) from \"Item\"), (select count(*) from \"Revision\"), (select count(*) from \"MediaAsset\")"'
    dc exec -T db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc "select id, value from \"Setting\" where id like '"'"'current:%'"'"'"'   # current:internal phải vẫn là a6d156c4-…

Host học viên không lộ API nhân sự (cả bốn dòng phải là 404):

    for p in admin/users manager/learners docs openapi.json; do curl -s -o /dev/null -w "$p %{http_code}\n" https://seafoodeck.tiendn.io.vn/api/v1/$p; done

404 phải giống hệt một đường không tồn tại (chỉ khác đường dẫn trong `message`, độ dài, `ETag` và `requestId`):

    n() { curl -s -i "$1" | grep -v -i -E '^(date|x-request-id|etag):' | sed -E 's/"requestId":"[^"]*"//; s#/api/v1/[a-z]+/users#PATH#; s/^Content-Length: .*//I'; }
    diff <(n https://seafoodeck.tiendn.io.vn/api/v1/admin/users) <(n https://seafoodeck.tiendn.io.vn/api/v1/zzzzz/users) && echo giong-het

Host Studio:

    curl -fsSI https://seafoodeckstudio.tiendn.io.vn/ | grep -i -E '^HTTP|x-robots-tag'   # 200, noindex, nofollow, TLS hợp lệ
    curl -fsS https://seafoodeckstudio.tiendn.io.vn/api/v1/health                       # release đúng bản 2.5e
    curl -s -o /dev/null -w '%{http_code}\n' https://seafoodeckstudio.tiendn.io.vn/api/v1/admin/users   # 401 (chưa đăng nhập), không phải 404
    curl -s -o /dev/null -w '%{http_code}\n' https://seafoodeckstudio.tiendn.io.vn/api/v1/docs          # phải là 404 (EXPOSE_API_DOCS tắt)
    curl -s -o /dev/null -w '%{http_code}\n' https://seafoodeckstudio.tiendn.io.vn/api/v1/openapi.json  # phải là 404
    curl -s -o /dev/null -w '%{http_code}\n' -H 'X-Edge: learner' https://seafoodeckstudio.tiendn.io.vn/api/v1/admin/users  # vẫn 401: header client bị xóa

Khác 404 ở hai dòng docs/openapi là lỗi: ở host Studio chỉ cờ `EXPOSE_API_DOCS` (tắt) che tài liệu API; kiểm `.local/pilot.env` không có `EXPOSE_API_DOCS=true` rồi recreate API.

Trong trình duyệt (mật khẩu do chủ dự án nhập, không ghi lại):

1. Ở host Studio, đăng nhập lần lượt bằng một tài khoản mỗi vai trò đang có (admin, manager, và editor/reviewer/publisher nếu có): đúng tab theo vai trò (biên tập/duyệt/xuất bản: Quản trị + Thư viện; manager: Học viên + Thư viện + Tài khoản; admin: Quản trị + Người dùng + Học viên + Thư viện). Ảnh/media xem trước được; tải ảnh lên (nếu thử) không lỗi CORS.
2. Sai realm bị từ chối **giống hệt** sai mật khẩu ở cả hai host: tài khoản nhân sự đăng nhập ở host học viên, và tài khoản học viên (hoặc mã mời) ở host Studio, đều nhận cùng thông báo như khi nhập sai mật khẩu; không thông báo nào nhắc tới host hay vai trò khác.
3. Host học viên: học viên đăng nhập và học bình thường; gõ `#admin`/`#manager` không mở gì ngoài app học viên.

Mỗi lần thử sai tính vào giới hạn đăng nhập (20 lần / 10 phút / IP, mất khi API khởi động lại), nên đừng thử quá nhiều.

## 5. Quay lại

- Lỗi chỉ ở site Studio (chứng chỉ, DNS): sửa DNS/env rồi `dc up -d --no-deps edge`; host học viên không bị ảnh hưởng.
- Chỉ một app web hỏng: `dc up -d --no-deps web-learner` (hoặc `web-studio`) với `LEARNER_IMAGE_REF` (hoặc `STUDIO_IMAGE_REF`) đổi về digest trước; host kia không cần động tới.
- Quay về bản một container `web` (trước tách ba ảnh): ảnh API và ảnh web quay **cùng nhau** (ảnh web cũ với API mới, hoặc ngược lại, chưa được kiểm). Làm theo thứ tự này, `<previous-commit>` là commit đã ghi ở mục 3.2:

        P=seafoodeck-pilot    # đúng tên project (mục 3.6)
        git checkout <previous-commit> -- deploy/compose.pilot.ghcr.yaml
        sudo -e .local/pilot.env     # trả API_IMAGE_REF và WEB_IMAGE_REF về hai dòng đã lưu ở mục 3.3; xóa ba dòng EDGE/LEARNER/STUDIO_IMAGE_REF; nếu quay về ảnh trước 2.5e thì CŨNG xóa (hoặc comment) dòng STUDIO_ORIGIN trước khi chạy tiếp (còn đặt thì nhân sự không đăng nhập được ở host học viên và CORS kho S3 vẫn nhận nó)
        dc pull                      # kéo ảnh cũ TRƯỚC khi gỡ gì; lỗi ở đây (đăng nhập GHCR hết hạn, mạng) thì web mới vẫn đang chạy, dừng lại xử lý
        for svc in edge web-learner web-studio; do
          sudo docker rm -f $(sudo docker ps -aq --filter label=com.docker.compose.project=$P --filter label=com.docker.compose.service=$svc)
        done
        dc up -d --no-deps storage
        dc up -d --no-deps api
        dc up -d --no-deps web

  Cả hai host ngừng từ vòng `rm` cho tới khi `web` lên (vài giây ở local; sẽ lâu hơn nếu còn phải kéo ảnh, vì thế `dc pull` chạy trước). Đổi compose và env trước khi gỡ là vô hại: lúc đó ba container mới chỉ thành container mồ côi của file compose cũ, vẫn chạy cho tới vòng `rm`. Thứ tự này đã suy luận từ các lệnh đã diễn tập, chưa diễn tập lại nguyên thứ tự mới.

  Vòng lặp xử lý từng service vì nhiều `--filter label=` trong một lệnh được hiểu là VÀ, không phải HOẶC. Service nào không có container thì `docker rm -f` của vòng đó báo `requires at least 1 argument`: vô hại, vòng lặp chạy tiếp. Lý do dùng `docker rm` thay `dc rm`: compose cũ không còn tên ba service này. **Giữ nguyên file compose cũ** (working tree lệch một file, `git status` hiện `M deploy/compose.pilot.ghcr.yaml`) chừng nào bản một container `web` còn chạy: trả file về bản mới khi env vẫn là `WEB_IMAGE_REF` thì mọi lệnh `dc` (kể cả `backup-pilot.sh`) lỗi `required variable LEARNER_IMAGE_REF is missing a value`. Khi nâng cấp lại sau một lần quay lại: ở mục 3.2, `git status --short` chỉ được hiện đúng dòng này; chạy `backup-pilot.sh` như viết (nó cần file cũ vì bản cũ đang chạy), rồi `git checkout HEAD -- deploy/compose.pilot.ghcr.yaml` ngay trước `git pull --ff-only`; `<previous-commit>` vẫn là commit đã ghi lần đầu (HEAD lúc này đã là commit mới). Cũng cần **xóa (hoặc comment) dòng `STUDIO_ORIGIN`** trong `.local/pilot.env` nếu quay về ảnh trước 2.5e (ảnh web cũ có màn quản trị trên host học viên; ảnh API cũ bỏ qua biến này nhưng giữ cho chắc); `STUDIO_SITE_ADDRESS` để nguyên được vì ảnh cũ không dùng nó. Ảnh web 2.5e với ảnh API cũ thì host học viên không còn chặn API nhân sự (chặn nằm trong API, edge chỉ gắn header): vì thế nâng cấp luôn chạy API trước web.
- Bản ghi DNS của host Studio có thể giữ; không có site nào trả lời cho nó khi bản cũ chạy.

## Giới hạn (nói thẳng)

- Ở host Studio, `/api/v1/docs*` và `/api/v1/openapi*` được đưa thẳng tới API: chỉ cờ `EXPOSE_API_DOCS` (mặc định tắt) che chúng. Lớp phòng thủ thêm của Caddy (từ 2.5d) giờ chỉ còn ở host học viên, và nằm trong API (header `X-Edge`), không phải ở Caddy.
- Việc chặn ở host học viên dựa vào ảnh API 2.5e nhận header `X-Edge`; ảnh API cũ hơn bỏ qua header này.
- **Ẩn không phải là bảo mật.** Host Studio công khai: mọi chứng chỉ được ghi vào Certificate Transparency log (ví dụ crt.sh), nên ai cũng tìm được tên host, tải được app Studio và thấy trang đăng nhập. Bảo vệ thật vẫn là mật khẩu, giới hạn đăng nhập, phân quyền theo vai trò ở API và kiểm Origin khi ghi.
- Không có TOTP/MFA, không giới hạn IP, không VPN; nhân sự đăng nhập từ bất kỳ đâu.
- Tách tầng web **không** làm hệ thống chịu lỗi tốt hơn ở phía trước: `edge` hỏng thì cả hai host cùng ngừng (một VPS, một `edge`, một API, một DB). Cái được là ranh giới ảnh: ảnh học viên không còn file Studio trên đĩa, và mỗi app web dừng hoặc quay lại riêng được. Xem [DELIVERY_25E.md](DELIVERY_25E.md) mục "Tách tầng web".
- App Studio không có màn "Học" (Study). Nhân sự muốn học hoặc xem thử bộ thẻ dùng **tài khoản học viên cá nhân** (admin tạo ở màn Người dùng với vai trò `student`) hoặc mã mời, trên host học viên; tài khoản nhân sự không đăng nhập ở host học viên, nên tiến độ học tách khỏi danh tính quản trị.
- Link ảnh/media đã ký trỏ về `S3_PUBLIC_ENDPOINT` (host học viên); host Studio tải chúng chéo origin (CORS S3 liệt kê cả hai origin). Site Studio cũng có proxy S3 riêng nhưng không dùng tới chừng nào `S3_PUBLIC_ENDPOINT` còn là host học viên.

## Local

`node scripts/init-pilot.mjs` ghi `STUDIO_ORIGIN=http://localhost:18090`, `STUDIO_SITE_ADDRESS=http://localhost:8090`, `STUDIO_WEB_PORT=18090`. Sau `docker compose --env-file .local/pilot.env up -d --build` (dựng cả ba ảnh `edge`, `web-learner`, `web-studio` từ cùng `WEB_TAG`; chỉ `edge` mở cổng): học viên ở http://127.0.0.1:18089, Studio ở http://localhost:18090 (hai host khác nhau vì cookie không phân biệt cổng). File `.local/pilot.env` tạo trước 2.5e thiếu hai dòng `STUDIO_ORIGIN`, `STUDIO_SITE_ADDRESS` (và `STUDIO_WEB_PORT`): thêm tay ba dòng giá trị local ở trên; thiếu thì Studio không được phục vụ.
