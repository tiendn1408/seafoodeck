# Docker demo trên VPS — seafoodeck.tiendn.io.vn

VPS Linux có SSH, IP public và quyền sudo. Hướng dẫn cài Docker dưới đây dành cho Ubuntu 22.04/24.04; OS khác dùng hướng dẫn Docker tương ứng.

**Luồng ưu tiên hiện tại là GHCR → VPS**, không cần chuyển source hoặc image tar: xem [DEPLOY_GHCR.md](DEPLOY_GHCR.md). Các bước source/tar bên dưới là phương án thay thế; không cần làm cả hai.

URL đích: **https://seafoodeck.tiendn.io.vn**. Chưa có thao tác thay DNS hoặc triển khai lên VPS nào được thực hiện bởi agent.

Một container: Node build ở stage đầu, Caddy phục vụ dist ở runtime, tự cấp/gia hạn HTTPS. Không dùng Vite dev server trên VPS. Chỉ dist được đưa vào runtime; inbox/outbox/archive/docs/node_modules không được phát hành. Nội dung vẫn là demo chưa duyệt. localStorage thuộc trình duyệt/origin: tiến độ localhost không tự chuyển lên domain; không có tài khoản/database/đồng bộ.

## 1. DNS

Trong bảng quản lý DNS có thẩm quyền của tiendn.io.vn (nhà đăng ký hoặc Cloudflare nếu nameserver đã chuyển sang đó), thêm:

| Type | Name/Host  | Value               | TTL           |
| ---- | ---------- | ------------------- | ------------- |
| A    | seafoodeck | IPv4 public của VPS | 300 hoặc Auto |

Một số panel yêu cầu điền đầy đủ `seafoodeck.tiendn.io.vn` thay vì nhãn `seafoodeck`. Không nhập https:// hoặc port vào bản ghi DNS. Giữ nguyên các bản ghi của domain gốc và dịch vụ khác.

Chỉ thêm AAAA nếu VPS có IPv6 public đã hoạt động và mở port tương ứng. Gỡ/sửa AAAA sai đang gắn với subdomain này, nếu có. Nếu dùng Cloudflare, để **DNS only** trong lần thiết lập đầu. HTTPS được cấp trực tiếp tại Caddy; không chọn Flexible. Nếu sau này bật proxy, dùng Full (strict) với chứng chỉ origin đang hợp lệ.

Kiểm tra trên máy cá nhân (có dig):

```sh
dig +short NS tiendn.io.vn
dig +short A seafoodeck.tiendn.io.vn @1.1.1.1
dig +short AAAA seafoodeck.tiendn.io.vn @1.1.1.1
```

Kết quả A cần đúng IP public VPS trước khi chạy Caddy production. Thời gian cập nhật phụ thuộc TTL/cache. Nếu có CAA giới hạn CA, đối chiếu với CA Caddy sử dụng khi log cấp chứng chỉ báo bị chặn.

## 2. SSH, port và Docker

Ví dụ thay `YOUR_VPS_IP` và `YOUR_SSH_USER` bằng thông tin thật:

```sh
ssh YOUR_SSH_USER@YOUR_VPS_IP
cat /etc/os-release
uname -m
sudo ss -lntup
docker --version
docker compose version
```

Compose mặc định chiếm TCP 80/443 và UDP 443 (HTTP/3). Trong firewall/security group của nhà cung cấp, cho vào TCP 80/443 từ Internet; UDP 443 tùy chọn, thiếu UDP thì HTTPS vẫn chạy qua TCP. Giữ port SSH hiện tại để không mất kết nối.

Nếu dùng UFW đang active, cho phép port SSH thực tế trước, rồi:

```sh
sudo ufw status
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 443/udp
```

Không cần tự bật UFW nếu đang dùng hệ thống firewall khác. Docker published ports có thể đi vòng quy tắc UFW; giới hạn ingress bằng firewall nhà cung cấp khi cần. App chỉ publish các port nói trên.

Nếu Docker/Compose đã hoạt động, bỏ qua phần cài. Trên Ubuntu chưa cài Docker, dùng repository chính thức:

```sh
sudo apt-get update
sudo apt-get install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
. /etc/os-release
sudo tee /etc/apt/sources.list.d/docker.sources > /dev/null <<EOF
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: ${UBUNTU_CODENAME:-$VERSION_CODENAME}
Components: stable
Architectures: $(dpkg --print-architecture)
Signed-By: /etc/apt/keyrings/docker.asc
EOF
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo systemctl enable --now docker
sudo docker run --rm hello-world
sudo docker compose version
```

Nếu có Docker/Podman/containerd của hệ thống khác gây xung đột, xử lý theo tài liệu Docker chính thức; không tự gỡ dịch vụ đang phục vụ app khác.

## 3. Tạo gói source và chuyển từ máy cá nhân

Build ngay trên VPS giúp tránh nhầm kiến trúc Mac ARM với VPS amd64. VPS cần Internet để tải image và npm dependencies trong lần build.

Trên máy cá nhân, từ repo:

```sh
cd /Users/tien.dang/Workplace/reference/seafood-deck
npm test
npm run lint
npm run build
tar -czf /tmp/seafoodeck-source.tar.gz Dockerfile .dockerignore compose.yaml deploy package.json package-lock.json tsconfig.json vite.config.ts playwright.config.ts index.html src public e2e
scp /tmp/seafoodeck-source.tar.gz YOUR_SSH_USER@YOUR_VPS_IP:/tmp/seafoodeck-source.tar.gz
```

Gói tar dùng danh sách cho phép, không kèm vùng giao nhận hoặc .env. Gói vẫn chứa source và fixtures demo; chỉ dist được image runtime phục vụ.

## 4. Build và chạy trên VPS

Trên VPS:

```sh
sudo mkdir -p /opt/seafoodeck
sudo tar -xzf /tmp/seafoodeck-source.tar.gz -C /opt/seafoodeck
cd /opt/seafoodeck
sudo cp deploy/env.example .env
sudo nano .env
```

Nội dung:

```dotenv
SITE_ADDRESS=seafoodeck.tiendn.io.vn
IMAGE_TAG=demo-001
```

Nếu 80/443 đang trống và DNS đúng:

```sh
sudo docker compose config
sudo docker compose build --pull web
sudo docker compose up -d --no-build
sudo docker compose ps
sudo docker compose logs --tail=100 web
sudo docker compose exec web wget -qO- http://127.0.0.1:8080/healthz
```

Giữ nguyên hai volumes Caddy để lưu chứng chỉ qua lần khởi động/cập nhật. Không chạy `down -v` khi cập nhật. Container tự khởi động lại khi VPS reboot sau khi Docker được bật cùng hệ thống.

## 5. Xác minh domain hoạt động

Chạy từ máy ngoài VPS:

```sh
curl -I http://seafoodeck.tiendn.io.vn
curl -I https://seafoodeck.tiendn.io.vn
```

HTTP cần chuyển hướng sang HTTPS; HTTPS cần trả 200 và chứng chỉ hợp lệ. Mở trình duyệt, thử flashcard → ghép tên → HS → tổng kết, reload giữa phiên. Không dùng `curl -k` để kết luận HTTPS hợp lệ.

Nếu đã trỏ DNS nhưng máy cá nhân còn cache cũ, thử ép IP trong khi vẫn kiểm tra đúng hostname/chứng chỉ:

```sh
curl -I --resolve seafoodeck.tiendn.io.vn:443:YOUR_VPS_IP https://seafoodeck.tiendn.io.vn
```

## 6. VPS đã có Nginx/Caddy/Traefik ở 80/443

Không tắt proxy của app khác. Chạy image này bằng HTTP trên loopback của VPS, rồi để proxy hiện có terminate TLS và route riêng hostname:

```sh
cd /opt/seafoodeck
sudo docker build -t seafoodeck:demo-001 .
sudo docker run -d --name seafoodeck-origin --restart unless-stopped -e SITE_ADDRESS=:80 -p 127.0.0.1:18080:80 seafoodeck:demo-001
curl -I http://127.0.0.1:18080
```

Không chạy compose mặc định đồng thời cho cùng app. Với Caddy **cài trên host**, thêm vào cấu hình hiện có:

```caddyfile
seafoodeck.tiendn.io.vn {
    reverse_proxy 127.0.0.1:18080
}
```

Validate cấu hình tổng trước rồi reload Caddy đang có. Nếu proxy cũng nằm trong Docker, `127.0.0.1` là chính container proxy; cần đưa hai container vào cùng Docker network rồi reverse proxy tới tên container `seafoodeck-origin:80`, thay vì dùng địa chỉ loopback trên. Với Nginx/Traefik, cấu hình virtual host và certificate theo proxy đó; container origin vẫn chỉ phục vụ HTTP. Nhánh này phụ thuộc proxy thực tế, không thể xác nhận chỉ từ repo.

## 7. Cập nhật thủ công và rollback (nhánh Compose)

Đợt tiếp theo tạo/chuyển gói source như bước 3. Trước khi cập nhật, ghi lại IMAGE_TAG hiện tại:

```sh
cd /opt/seafoodeck
sudo cat .env
sudo docker compose images
```

Giải nén gói mới vào /opt/seafoodeck, **không copy env.example đè .env**. Sửa IMAGE_TAG thành tag chưa dùng, ví dụ demo-002:

```sh
sudo tar -xzf /tmp/seafoodeck-source.tar.gz -C /opt/seafoodeck
sudo nano /opt/seafoodeck/.env
sudo docker compose build --pull web
sudo docker compose up -d --no-build
sudo docker compose ps
sudo docker compose logs --tail=100 web
```

Kiểm tra HTTPS và luồng học như bước 5. Giữ image demo-001 cho rollback. Nếu cần rollback, đổi IMAGE_TAG về demo-001 rồi chạy:

```sh
sudo docker compose up -d --no-build --pull never
```

Không prune image cũ trước khi chốt bản mới. Nếu thay compose/proxy cùng lúc, giữ bản cấu hình trước để rollback tương ứng. Đây là cập nhật có thể gián đoạn ngắn, không phải zero-downtime.

## 8. Chạy thử Docker local, không cần domain

```sh
docker build -t seafoodeck:local .
docker run -d --name seafoodeck-local -e SITE_ADDRESS=:80 -p 127.0.0.1:18081:80 seafoodeck:local
curl -I http://127.0.0.1:18081
docker inspect --format='{{.State.Health.Status}}' seafoodeck-local
docker stop seafoodeck-local
docker rm seafoodeck-local
```

Mở http://127.0.0.1:18081 trước khi stop để thử UI. SITE_ADDRESS=:80 tắt cấp chứng chỉ cho môi trường local. Không dùng cấu hình này thay HTTPS public.

## Chẩn đoán nhanh

- DNS sai: kiểm tra nameserver có thẩm quyền, A/AAAA, proxy DNS và cache.
- Connection timeout: kiểm tra firewall nhà cung cấp, NAT/public IP và port 80/443 tới VPS.
- Port already allocated: server đã có proxy; dùng nhánh 6.
- Cấp TLS thất bại: xem logs Caddy, DNS, port và CAA; tránh xóa volumes/lặp cấp chứng chỉ không cần thiết.
- Container unhealthy: health endpoint chỉ kiểm tra Caddy nội bộ, không xác nhận DNS/HTTPS ngoài Internet. Kiểm tra cả curl và trình duyệt.
- Ảnh/media 404: chỉ file đã được tích hợp vào public/media mới có trong build; không copy inbox vào container để chữa lỗi.

Tham khảo chính thức: [Docker trên Ubuntu](https://docs.docker.com/engine/install/ubuntu/), [Caddy HTTPS](https://caddyserver.com/docs/quick-starts/https), [automatic HTTPS](https://caddyserver.com/docs/automatic-https), [Caddy trong Docker](https://caddyserver.com/docs/running).

## Kiểm tra bản bàn giao

Đã chạy thành công: `docker compose config`, `npm run build`, build image `seafoodeck:verify` và chạy container local trên Docker Desktop (Linux ARM64). HTTP trang chủ trả 200, assets/media không tồn tại trả 404, healthcheck healthy; runtime không có inbox/outbox/archive hoặc node_modules của ứng dụng. Container kiểm thử được dọn sau xác minh. Đã tạo gói `/tmp/seafoodeck-source.tar.gz` theo danh sách file bước 3.

Chưa kiểm chứng trên VPS của bạn: cài Docker theo OS thực tế, ingress firewall, DNS có thẩm quyền, cấp/gia hạn chứng chỉ public và truy cập domain từ Internet. Chưa có thao tác SSH hoặc sửa DNS thực tế nào được thực hiện.
