# Image 0.6 + giao diện học viên mới (phase 2)

Ngày 19/11/2026. Dựng từ `main` tại merge commit `92ca3e5`.

## Đã build

- Tag **`pilot-internal-20261119-r1`**, linux/amd64 (máy build arm64, QEMU/emulation), `--build-arg RELEASE_TAG=pilot-internal-20261119-r1` cho cả hai (mặc định trong Dockerfile vẫn là r2).
- `docker build --platform linux/amd64 -f apps/api/Dockerfile` và `-f apps/web/Dockerfile`, context là root repo.
- Image ID local: API `sha256:7646aef869cdd2a2c6bf6af5692b16a0a8e68d7e8259888f75455c383b7a7865`, web `sha256:80c7bdacdbf8e1045a3ee4ce40c9aed77a47c7cb38962e8d4b840b322ca378b4`. `docker image inspect` báo Architecture `amd64` cả hai.
- Đã push GHCR; tag r2 cũ không bị đụng tới.

```env
API_IMAGE_REF=ghcr.io/tiendn1408/seafoodeck-api@sha256:5a0459278c35203af3a55eafc074d2b4e9848ef525ea80a594be2551f9c5274e
WEB_IMAGE_REF=ghcr.io/tiendn1408/seafoodeck-web@sha256:0c1e6af44e4e12d0ed8e636ef9ba082aa38b354043dc13516f7785af9ada88f3
```

## Nội dung trong image (đã kiểm bằng `docker export | tar -t`)

- Web: `/srv` chỉ có `index.html`, `favicon.svg`, `assets/` (JS/CSS/font) và 3 minh họa trang trí `media/illustrations/*.png`. Không có ảnh loài, fixture, e2e, mock.
- API: `/app/apps/api/{dist,prisma,prisma.config.ts,package.json}` và `node_modules` production. Không thấy `_inbox`, `_outbox`, `_archive`, `_backups`, `.local`, `.superpowers`, `.impeccable`, prototype, `test-fixtures`, `.env`, `.git`. Chuỗi "fixture" chỉ nằm trong `node_modules/@nestjs/swagger`.

## Đã thử trên stack cô lập (project `sdthrow20261119`, đã `down -v`)

Chạy đúng chuỗi DEPLOY_PILOT với `compose.pilot.ghcr.yaml` và hai image local: `up -d db storage`, `run --rm migrate` (2 migration, exit 0), `run --rm --no-deps api node dist/bootstrap.js`, `up -d api web`. Cả bốn service healthy; `/api/v1/health` 200, version 0.6.0, release `pilot-internal-20261119-r1`; trang chủ web 200; đăng nhập admin 201 (role admin) và mã mời learner 201 (không nội bộ); mã sai 401; learner không vào được route admin. Container dùng đúng hai image ID ở trên.

## Chưa kiểm

- Chưa chạy trên VPS Ubuntu x86_64 thật; chỉ chạy emulation trên arm64.
- Stack thử dùng HTTP cổng loopback, `COOKIE_SECURE=false`, `SITE_ADDRESS=:80`; chưa thử TLS/Caddy, domain, cookie Secure.
- Production rỗng: `GET /api/v1/catalog/overview` của learner trả 404 "Chưa có bộ học được xuất bản cho phạm vi này." (hành vi của API khi chưa có release, không phải 200). Chưa mở UI học viên trong trình duyệt với trạng thái rỗng này.
- Chưa thử upload media, nhập prototype, duyệt/xuất bản, bốn chế độ chơi trên bộ dữ liệu thật; không chạy E2E/unit trong lần này.
- Chưa pull lại từ GHCR trên máy khác; mới kiểm digest bằng `imagetools inspect`.

## r2: trang quản trị riêng (20/11/2026 theo giờ VN)

Tag **`pilot-internal-20261119-r2`**, linux/amd64, dựng từ `main` tại commit `945aea9`. Chỉ khác r1 ở phía web: `#admin` có form đăng nhập riêng, màn đăng nhập người học chỉ còn ô mã mời. Không có migration mới.

```env
API_IMAGE_REF=ghcr.io/tiendn1408/seafoodeck-api@sha256:f2194c069f80598d91db23526005d32590c285a4e2f7479fd99ada72f80fbf96
WEB_IMAGE_REF=ghcr.io/tiendn1408/seafoodeck-web@sha256:1543ff13f916b5c701d15e29b8e87eb0d8fafe36d987d0ebf279fe839799c212
```

Đã thử trên stack cô lập (health trả release r2; khách không thấy chữ "quản trị" ở `/`; `/#admin` có form; sai mật khẩu và sai mã mời bị từ chối; đăng nhập quản trị và mã mời chạy; stack đã `down -v`). Chưa thử trên VPS thật. Lệnh nâng cấp: [DEPLOY_UPGRADE_r2.md](DEPLOY_UPGRADE_r2.md).
