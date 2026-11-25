# Host Studio riêng cho nhân sự (phase 2.5e)

Từ 2.5e ảnh web chứa hai bản build: app học viên (`/srv/learner`) và app Studio cho nhân sự (`/srv/studio`). Một Caddy phục vụ hai site (`deploy/Caddyfile.pilot`):

- **Host học viên** `seafoodeck.tiendn.io.vn` (`SITE_ADDRESS`, `PUBLIC_ORIGIN`): chỉ app học viên. `/api/v1/admin*`, `/api/v1/manager*`, `/api/v1/docs*`, `/api/v1/openapi*` trả 404 giống hệt một đường API không tồn tại: cùng status, cùng body JSON (`Cannot <METHOD> <đường dẫn>`), cùng header, cùng cách xử lý body lỗi (JSON hỏng → 400, body quá 5 MB → 413). Caddy gắn header `X-Edge: learner` (ghi đè giá trị client gửi) cho mọi request `/api/*` từ host này; API (`apps/api/src/learner-edge.ts`) biến các đường nhân sự thành route không tồn tại sau bộ đọc body và trước khi định tuyến, nên 404 đi đúng pipeline của một đường không tồn tại. Container API không publish cổng nào: Caddy là đường vào duy nhất, nên header này không giả được từ ngoài.
- **Host Studio** `seafoodeckstudio.tiendn.io.vn` (`STUDIO_SITE_ADDRESS`, `STUDIO_ORIGIN`): chỉ app Studio, thêm `X-Robots-Tag: noindex, nofollow` (header bảo mật giống host học viên), toàn bộ `/api/*` tới API (Caddy xóa mọi `X-Edge` client gửi).

Vai trò editor/reviewer/publisher/manager/admin chỉ đăng nhập được ở host Studio; student/learner và mã mời chỉ ở host học viên. Đăng nhập sai host nhận đúng phản hồi của sai mật khẩu. Cookie theo từng host, không dùng chung.

**Bắt buộc sau khi lên ảnh web 2.5e:** ảnh học viên không còn giao diện quản trị. Nếu `STUDIO_SITE_ADDRESS` chưa đặt, site Studio không được phục vụ (Caddy chỉ gắn nó vào host giả `studio.invalid` và đóng kết nối) và nhân sự **không có giao diện** cho tới khi cấu hình xong. API vẫn tương thích ngược: không đặt `STUDIO_ORIGIN` thì mọi vai trò đăng nhập ở một origin như cũ, nhưng không có màn quản trị nào để dùng.

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
| `STUDIO_SITE_ADDRESS` | tên host Studio, không scheme, không cổng (để Caddy tự cấp HTTPS) | Caddy trong ảnh web |

`STUDIO_WEB_PORT` (mặc định 18090) chỉ dùng cho stack local; trên VPS `deploy/compose.pilot.ghcr.yaml` vẫn publish `127.0.0.1:${STUDIO_WEB_PORT}` → cổng 8090 trong container (không có gì nghe ở đó khi `STUDIO_SITE_ADDRESS` là tên host). Trước khi deploy, kiểm cổng loopback đó còn trống trên VPS (`sudo ss -ltn | grep ':18090 '` phải rỗng); nếu bận, đặt `STUDIO_WEB_PORT` sang cổng trống khác.

Sửa bằng trình soạn thảo (`sudo -e .local/pilot.env`) rồi chỉ kiểm **tên** biến:

    grep -o '^STUDIO_[A-Z_]*' .local/pilot.env      # phải thấy STUDIO_ORIGIN và STUDIO_SITE_ADDRESS
    alias dc='sudo docker compose --env-file .local/pilot.env --project-directory . -f deploy/compose.pilot.ghcr.yaml'
    dc config --quiet && echo compose-ok

Cài mới bằng `node scripts/init-pilot.mjs --production --origin https://<host học viên> --studio-origin https://<host Studio>`: script ghi sẵn cả `STUDIO_ORIGIN` và `STUDIO_SITE_ADDRESS`.

Đặt `STUDIO_ORIGIN` trước khi DNS sẵn sàng chỉ có nghĩa là site Studio chưa lấy được chứng chỉ; nhưng ngay khi API mới chạy với `STUDIO_ORIGIN`, nhân sự không đăng nhập được ở host học viên nữa. Vì vậy giữ đúng thứ tự DNS → env → deploy.

## 3. Deploy (sau DNS và env)

Sao lưu và đổi hai mã ảnh như [runbook 2.5c](DEPLOY_UPGRADE_25C.md) (mục 1–3, thay tag/digest bằng bản 2.5e), rồi:

    dc pull
    dc run --rm --no-deps migrate
    dc up -d --no-deps storage       # tạo lại kho S3 để CORS nhận thêm STUDIO_ORIGIN
    dc up -d --no-deps api
    dc ps                            # storage, api healthy
    dc up -d --no-deps web           # Caddy lấy chứng chỉ cho host Studio ở lần chạy này
    dc ps
    dc logs --since 5m web | grep -i -E 'certificate|error' | tail -20

Không `down -v`, không xóa volume, không đụng container của dự án khác trên VPS.

## 4. Kiểm sau deploy

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

- Lỗi chỉ ở site Studio (chứng chỉ, DNS): sửa DNS/env rồi `dc up -d --no-deps web`; host học viên không bị ảnh hưởng.
- Quay về ảnh trước 2.5e: đổi lại `API_IMAGE_REF`, `WEB_IMAGE_REF` về hai dòng đã lưu, **và** xóa (hoặc comment) dòng `STUDIO_ORIGIN` trong `.local/pilot.env` để mọi vai trò đăng nhập lại ở host học viên như cũ (ảnh web cũ có màn quản trị trên host học viên; ảnh API cũ bỏ qua biến này nhưng giữ cho chắc). Quay ảnh API và ảnh web **cùng nhau**: ảnh web 2.5e với ảnh API cũ thì host học viên không còn chặn API nhân sự (chặn nằm trong API, Caddy chỉ gắn header) — vì thế khi nâng cấp luôn chạy API trước web. `STUDIO_SITE_ADDRESS` có thể để nguyên: Caddyfile của ảnh cũ không dùng nó. Rồi:

        dc pull
        dc up -d --no-deps storage
        dc up -d --no-deps api
        dc up -d --no-deps web

- Bản ghi DNS của host Studio có thể giữ; không có site nào trả lời cho nó khi ảnh cũ chạy.

## Giới hạn (nói thẳng)

- Ở host Studio, `/api/v1/docs*` và `/api/v1/openapi*` được đưa thẳng tới API: chỉ cờ `EXPOSE_API_DOCS` (mặc định tắt) che chúng. Lớp phòng thủ thêm của Caddy (từ 2.5d) giờ chỉ còn ở host học viên, và nằm trong API (header `X-Edge`), không phải ở Caddy.
- Việc chặn ở host học viên dựa vào ảnh API 2.5e nhận header `X-Edge`; ảnh API cũ hơn bỏ qua header này.
- **Ẩn không phải là bảo mật.** Host Studio công khai: mọi chứng chỉ được ghi vào Certificate Transparency log (ví dụ crt.sh), nên ai cũng tìm được tên host, tải được app Studio và thấy trang đăng nhập. Bảo vệ thật vẫn là mật khẩu, giới hạn đăng nhập, phân quyền theo vai trò ở API và kiểm Origin khi ghi.
- Không có TOTP/MFA, không giới hạn IP, không VPN; nhân sự đăng nhập từ bất kỳ đâu.
- Ảnh web vẫn chứa file Studio trên đĩa (không được phục vụ ở host học viên).
- App Studio không có màn "Học" (Study). Nhân sự muốn học hoặc xem thử bộ thẻ dùng **tài khoản học viên cá nhân** (admin tạo ở màn Người dùng với vai trò `student`) hoặc mã mời, trên host học viên; tài khoản nhân sự không đăng nhập ở host học viên, nên tiến độ học tách khỏi danh tính quản trị.
- Link ảnh/media đã ký trỏ về `S3_PUBLIC_ENDPOINT` (host học viên); host Studio tải chúng chéo origin (CORS S3 liệt kê cả hai origin). Site Studio cũng có proxy S3 riêng nhưng không dùng tới chừng nào `S3_PUBLIC_ENDPOINT` còn là host học viên.

## Local

`node scripts/init-pilot.mjs` ghi `STUDIO_ORIGIN=http://localhost:18090`, `STUDIO_SITE_ADDRESS=http://localhost:8090`, `STUDIO_WEB_PORT=18090`. Sau `docker compose --env-file .local/pilot.env up -d --build`: học viên ở http://127.0.0.1:18089, Studio ở http://localhost:18090 (hai host khác nhau vì cookie không phân biệt cổng). File `.local/pilot.env` tạo trước 2.5e thiếu hai dòng `STUDIO_ORIGIN`, `STUDIO_SITE_ADDRESS` (và `STUDIO_WEB_PORT`): thêm tay ba dòng giá trị local ở trên; thiếu thì Studio không được phục vụ.
