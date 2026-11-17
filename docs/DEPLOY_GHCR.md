# GHCR → VPS: seafoodeck.tiendn.io.vn

Image đích: `ghcr.io/tiendn1408/seafoodeck:flat-illustrations-20261117`.

Luồng chạy tay: đăng nhập GHCR trên máy build → tag/push image đã test → VPS đăng nhập quyền đọc → pull → Compose up. Không CI/CD, không cần source/npm trên VPS, không đổi visibility package thành public tự động. Bản nội dung vẫn là demo nội bộ; visibility của registry không thay trạng thái duyệt nội dung game.

## 1. Đẩy đúng image đã kiểm thử

Tạo PAT trên GitHub trước khi Docker login:

1. Đăng nhập GitHub bằng tài khoản `tiendn1408` và mở https://github.com/settings/tokens/new?scopes=write:packages . Đây là màn tạo **token classic**, chọn sẵn quyền ghi package mà không cần cấp thêm repo.
2. Nếu đi từ menu: avatar → Settings → Developer settings → Personal access tokens → Tokens (classic) → Generate new token → Generate new token (classic).
3. Note: `seafoodeck-ghcr-push`. Expiration: chọn thời hạn phù hợp, ví dụ 30 ngày.
4. Kiểm quyền `write:packages` đã được chọn; `read:packages` đi kèm có thể giữ. Không cần `delete:packages` hoặc `repo` cho việc đẩy image này.
5. Bấm Generate token, sao chép token vừa tạo và giữ riêng. Token đầy đủ chỉ hiện một lần; nếu mất thì tạo lại.
6. Chạy Docker login bên dưới rồi dán token vào ô Password (terminal không hiện ký tự khi nhập). Không dán token vào chat hoặc file repo.

Token riêng cho VPS chỉ kéo image: tạo từ https://github.com/settings/tokens/new?scopes=read:packages với Note `seafoodeck-vps-pull`, chỉ giữ `read:packages`.

Trên máy hiện có image `seafoodeck:flat-illustrations-20261117` (linux/amd64, image ID `sha256:f9051213df7a46f77ea8fcb026b86fb1e282fe40241395c390a448d1b893f436`):

```sh
cd /Users/tien.dang/Workplace/reference/seafood-deck
docker login ghcr.io -u tiendn1408
sh scripts/publish-ghcr.sh
```

Ở ô Password của Docker login, nhập PAT **classic** có `write:packages`, không nhập mật khẩu tài khoản GitHub. Không dán PAT vào chat, repo, .env hay lệnh có thể lưu vào history. Script không đọc/in token và chỉ tag/push image local đang có; không build lại hoặc publish tag latest. Nếu tổ chức dùng SSO, token cần được authorize theo quy định của tổ chức.

Nếu push bị denied: kiểm tra đăng nhập đúng account, token scope và quyền tạo/push package. Không tự đổi package thành public để sửa lỗi quyền. Nếu chưa có image local, load bản Docker .tar đã bàn giao hoặc build/test lại trước, rồi mới push. Không cần repository GitHub để lưu image GHCR, nhưng có thể liên kết package với repo trong GitHub UI sau này nếu muốn; project local hiện chưa có .git.

Sau push, Docker in digest `sha256:...`. **Registry digest khác image ID local**; dùng digest GHCR thực tế từ kết quả push để pin bản VPS:

```sh
docker buildx imagetools inspect ghcr.io/tiendn1408/seafoodeck:flat-illustrations-20261117
```

Image hiện chỉ có linux/amd64. VPS `x86_64` phù hợp; nếu `aarch64/arm64`, cần build/test image ARM hoặc multi-platform trước, không dùng lại tag amd64 để giả vờ hỗ trợ ARM.

## 2. Lấy thông số VPS

VPS đã xác nhận qua ảnh chụp: Ubuntu 24.04.5 LTS, x86_64, 1 vCPU, RAM 1.9 GiB (available khoảng 1.3 GiB), disk còn 32 GiB, Docker 29.9.0, Compose v5.6.0. Port 80/443 chưa có listener ở thời điểm chụp; SSH dùng 22, PostgreSQL bind loopback 5432. Không cần cài lại Docker hay restart daemon đang phục vụ bot trading.

Hai Compose chỉ pull image đã đặt giới hạn 256 MiB RAM, 0.5 CPU và 128 PID, cùng xoay log tối đa khoảng 30 MB. Đây là giới hạn cho demo static, chưa phải kết quả kiểm tải đồng thời; kiểm docker stats khi chạy. Project seafoodeck riêng, không sửa container/network/volume của bot trading.

Đã chạy smoke test local trên image đã publish với đúng giới hạn này: Caddy healthz trả ok, HTML và cả 5 JPEG của bộ mới tải/giải mã được; kiểm HostConfig đúng 268435456 byte RAM, 500000000 NanoCPUs, 128 PID. Container UI mới đang chạy local ở 127.0.0.1:18087. Không coi đây là kiểm tải hoặc kiểm tra trên VPS thật.

Bạn tự lấy IPv4 public để điền DNS, không cần gửi vào chat:

```sh
curl -4fsS https://icanhazip.com
```

Trong DNS của tiendn.io.vn, đặt A / seafoodeck / IP lệnh trên trả về. Giữ nguyên record khác; chỉ thêm AAAA nếu IPv6 có hoạt động. Kiểm tra firewall/security group nhà cung cấp riêng; danh sách port listen không chứng minh port đã mở ra Internet. Có thể dùng scripts/vps-info.sh để kiểm lại sau này; không cần gửi mật khẩu/private key/token.

## 3. Chuẩn bị VPS và cấu hình

Cài Docker/Compose nếu chưa có theo [DEPLOY_VPS.md](DEPLOY_VPS.md). Trên máy cá nhân, chuyển ba file cấu hình nhỏ vào /tmp:

```sh
scp deploy/compose.ghcr.yaml deploy/compose.origin.yaml deploy/ghcr.env.example USER@VPS_IP:/tmp/
ssh USER@VPS_IP
sudo mkdir -p /opt/seafoodeck
sudo cp /tmp/compose.ghcr.yaml /tmp/compose.origin.yaml /opt/seafoodeck/
sudo cp /tmp/ghcr.env.example /opt/seafoodeck/.env
cd /opt/seafoodeck
sudo nano .env
```

Chỉ copy env.example ở lần cài đầu. Khi cập nhật, sửa IMAGE_REF hiện có; không ghi đè cấu hình server. Ví dụ:

```dotenv
IMAGE_REF=ghcr.io/tiendn1408/seafoodeck:flat-illustrations-20261117
SITE_ADDRESS=seafoodeck.tiendn.io.vn
ORIGIN_PORT=18083
```

Có thể thay IMAGE_REF bằng `ghcr.io/tiendn1408/seafoodeck@sha256:DIGEST_THAT_SAU_PUSH`. Không đưa nguyên chữ placeholder vào cấu hình chạy.

## 4. Đăng nhập và kéo image trên VPS

Với package private, tài khoản phía VPS phải được cấp Read package; PAT classic chỉ cần `read:packages`. PAT của tài khoản không có quyền package vẫn không kéo được dù scope đúng. Có thể tạo token chỉ đọc cho VPS; không đưa token ghi lên VPS. Docker login và Compose phải cùng user: các lệnh sau đều dùng sudo để tránh login một user rồi pull bằng user khác.

```sh
sudo docker login ghcr.io -u GITHUB_USER_CO_QUYEN_DOC
```

Nhập PAT chỉ đọc vào prompt Password. Nếu package được chính chủ đặt public, có thể pull ẩn danh; không bắt buộc chuyển public. Sau đó chọn đúng **một** nhánh chạy dưới đây.

## 5A. Port 80/443 trống — Caddy tự quản HTTPS

DNS: bản ghi A `seafoodeck` → IPv4 public VPS; chỉ có AAAA nếu IPv6 hoạt động. Mở TCP 80/443 trong firewall nhà cung cấp/host, UDP 443 tùy chọn cho HTTP/3. Nếu dùng Cloudflare, để DNS only khi thiết lập đầu. Không ảnh hưởng record domain gốc.

```sh
cd /opt/seafoodeck
sudo docker compose --env-file .env -f compose.ghcr.yaml config --quiet
sudo docker compose --env-file .env -f compose.ghcr.yaml pull web
sudo docker compose --env-file .env -f compose.ghcr.yaml up -d --no-build
sudo docker compose --env-file .env -f compose.ghcr.yaml ps
sudo docker compose --env-file .env -f compose.ghcr.yaml logs --tail=100 web
curl -I https://seafoodeck.tiendn.io.vn
```

Volume caddy_data/config giữ chứng chỉ. Không down -v khi cập nhật.

## 5B. VPS có proxy — origin loopback

```sh
cd /opt/seafoodeck
sudo docker compose --env-file .env -f compose.origin.yaml config --quiet
sudo docker compose --env-file .env -f compose.origin.yaml pull web
sudo docker compose --env-file .env -f compose.origin.yaml up -d --no-build
curl -I http://127.0.0.1:18083
```

Đặt ORIGIN_PORT khác nếu 18083 đã dùng. Với Caddy **trên host**, thêm route sau vào cấu hình hiện có, validate rồi reload:

```caddyfile
seafoodeck.tiendn.io.vn {
    reverse_proxy 127.0.0.1:18083
}
```

Nếu proxy là container, localhost trỏ tới chính proxy: cần network chung và upstream service web:80 (chọn alias không trùng các app khác) hoặc địa chỉ host gateway thích hợp. Cấu hình cụ thể phụ thuộc server hiện có; đừng tắt proxy đang phục vụ app khác. Không chạy cả 5A và 5B đồng thời cho cùng deployment Compose. Chưa tự sửa proxy VPS.

## 6. Cập nhật, rollback thủ công

Ghi lại IMAGE_REF/digest đang chạy và file Compose đang dùng. Push bản mới bằng tag mới sau khi test, sửa IMAGE_REF trong .env của VPS, rồi chạy pull/up theo nhánh 5A hoặc 5B. Không dùng tag latest hoặc ghi đè tag release cũ cho lần cập nhật khác nội dung.

Rollback: đổi IMAGE_REF về digest/tag trước, dùng đúng file Compose của deployment và:

```sh
sudo docker compose --env-file .env -f compose.ghcr.yaml up -d --no-build --pull never
```

Nhánh origin thay bằng compose.origin.yaml. `--pull never` cần image cũ còn local; nếu đã mất, pull lại bản cũ trước. Không prune image cũ/volume chứng chỉ trước khi chốt bản mới. Kiểm HTTPS và bốn chế độ sau update. Có thể gián đoạn ngắn khi thay container.

## Trạng thái và nguồn hướng dẫn

Bản hiện hành **0.5.1**: `flat-illustrations-20261117`, digest `sha256:f184546d9e5715b8485f2acbdcd00437400eb485872354aa9043c11da36ac824`, Linux amd64. Ba minh họa 2D nền alpha và sửa combobox; 63 unit / 27 E2E pass trên container. Đã publish GHCR, chưa deploy VPS. [Bàn giao và lệnh cập nhật](DELIVERY_0.5.1.md). Các bản dưới đây giữ làm lịch sử/rollback.

Release demo nghiệp vụ **0.5.0**: tag `trade-demo-20261117`, registry digest `sha256:ab7e847473876784641303d847cd39654bcc896cf72f7007971ac72d3400c649`, platform linux/amd64, image ID đã chạy `sha256:b27d94737ba3dc45a3d8514dac91db80bccfed9dd7b0dabcfe8479b32f9b4c06`. Đã push GHCR và kiểm remote digest. Kiểm 63 unit tests và 27 E2E chạy thành công trên chính container (12 desktop, 15 mobile; thêm 3 ca viewport chỉ chạy mobile nên skip trên desktop). `deploy/ghcr.env.example` hiện pin digest 0.5.1 ở trên. [Báo cáo và lệnh cập nhật VPS đang chạy](DELIVERY_0.5.0.md).

Bản UI 0.4.0 vẫn giữ nguyên tag `mobile-focused-20261117`, digest `sha256:884924378a136ab7808dc5be9f6222f0db9029f18dc2148c98f37dc0179ea652` để rollback; báo cáo lịch sử ở [UI_RELEASE_0.4.0.md](UI_RELEASE_0.4.0.md).

Bản cũ `demo-4modes-20261117` vẫn giữ nguyên digest `sha256:7d51b670dad354623551ddae31f308dd2eb7823b8d6b0ba9a2cbdd5b89aab908` để quay lại. Người dùng đã xác nhận VPS chạy được bản cũ; agent chưa deploy bản demo 0.5.0 lên VPS hoặc đổi visibility package.

Tài liệu GitHub chính thức: https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry
