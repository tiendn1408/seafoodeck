# Nâng cấp VPS từ r1 lên r2 (tag `pilot-internal-20261119-r2`)

Thay đổi so với r1: chỉ phía web. Trang quản trị có địa chỉ riêng `https://seafoodeck.tiendn.io.vn/#admin`; màn đăng nhập của người học chỉ có ô mã mời, không còn link quản trị. API không đổi code, không có migration mới. Chạy trên VPS qua SSH, từng đoạn một.

Mã nhận diện hai ảnh (đã push GHCR và kiểm bằng `docker buildx imagetools inspect`):

    API_IMAGE_REF=ghcr.io/tiendn1408/seafoodeck-api@sha256:f2194c069f80598d91db23526005d32590c285a4e2f7479fd99ada72f80fbf96
    WEB_IMAGE_REF=ghcr.io/tiendn1408/seafoodeck-web@sha256:1543ff13f916b5c701d15e29b8e87eb0d8fafe36d987d0ebf279fe839799c212

## 1. Sao lưu trước (DB và ảnh)

Script dừng API vài chục giây trong lúc sao lưu, nên làm lúc không có ai dùng. Backup chứa dữ liệu riêng tư, không đưa lên GitHub.

    cd /opt/seafoodeck-pilot
    sudo env PILOT_COMPOSE_FILE=deploy/compose.pilot.ghcr.yaml sh scripts/backup-pilot.sh _backups/before-r2
    ls -la _backups/before-r2      # phải thấy file .sql và danh sách object

## 2. Ghi nhớ bản đang chạy (để quay lại)

    grep -E '^(API|WEB)_IMAGE_REF=' .local/pilot.env     # chỉ in hai dòng này, không chứa bí mật

Lưu hai dòng này lại (đó là r1).

## 3. Đổi sang hai ảnh r2

    sed -i 's#^API_IMAGE_REF=.*#API_IMAGE_REF=ghcr.io/tiendn1408/seafoodeck-api@sha256:f2194c069f80598d91db23526005d32590c285a4e2f7479fd99ada72f80fbf96#' .local/pilot.env
    sed -i 's#^WEB_IMAGE_REF=.*#WEB_IMAGE_REF=ghcr.io/tiendn1408/seafoodeck-web@sha256:1543ff13f916b5c701d15e29b8e87eb0d8fafe36d987d0ebf279fe839799c212#' .local/pilot.env
    alias dc='sudo docker compose --env-file .local/pilot.env --project-directory . -f deploy/compose.pilot.ghcr.yaml'
    dc config --images      # phải thấy đúng hai mã trên

## 4. Kéo ảnh mới và bật lại

    dc pull
    dc run --rm migrate     # không có thay đổi cơ sở dữ liệu; phải kết thúc không lỗi
    dc up -d api web        # tạo lại hai dịch vụ này bằng ảnh mới; db và kho ảnh giữ nguyên
    dc ps                   # api, web phải healthy
    curl -fsS https://seafoodeck.tiendn.io.vn/api/v1/health
    # mong đợi: "release":"pilot-internal-20261119-r2"

## 5. Kiểm trong trình duyệt

- `https://seafoodeck.tiendn.io.vn`: màn đăng nhập người học chỉ có ô mã mời, không có chữ "quản trị".
- `https://seafoodeck.tiendn.io.vn/#admin`: form Tài khoản và Mật khẩu. Đăng nhập `owner`.
- Dữ liệu đã nhập (nháp, ảnh) vẫn còn.

## 6. Quay lại r1 nếu có sự cố

Sửa hai dòng `API_IMAGE_REF` và `WEB_IMAGE_REF` về hai dòng r1 đã lưu ở mục 2 (hoặc lấy từ `docs/DELIVERY_PHASE2_IMAGES.md`), rồi:

    dc pull
    dc up -d api web

Dữ liệu không bị ảnh hưởng vì r2 không đổi cơ sở dữ liệu. Không chạy `down -v`, không xóa volume `pilot_db`, `pilot_storage`.
