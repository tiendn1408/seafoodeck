# Runbook cài mới Seafood Deck 0.6 + giao diện mới lên VPS

Tag `pilot-internal-20261119-r1`. Làm theo thứ tự, chạy trên VPS qua SSH (trừ phần 9 chạy trên laptop). Không dán mật khẩu, mã mời, token vào chat hay file nào ngoài `.local/pilot.env` của VPS. Không chạy gì trong thư mục bot trading.

Digest (đã kiểm, đã push GHCR):

    API_IMAGE_REF=ghcr.io/tiendn1408/seafoodeck-api@sha256:5a0459278c35203af3a55eafc074d2b4e9848ef525ea80a594be2551f9c5274e
    WEB_IMAGE_REF=ghcr.io/tiendn1408/seafoodeck-web@sha256:0c1e6af44e4e12d0ed8e636ef9ba082aa38b354043dc13516f7785af9ada88f3

## 0. Kiểm trước khi bắt đầu

    # DNS: A record seafoodeck.tiendn.io.vn -> 42.96.20.66, không có AAAA sai
    dig +short seafoodeck.tiendn.io.vn A
    dig +short seafoodeck.tiendn.io.vn AAAA
    # Web 0.5 cũ đang giữ 80/443 (bình thường), kiểm chỗ trống ổ đĩa/RAM
    sudo ss -ltnp | grep -E ':(80|443)\s'
    df -h /opt | tail -1; free -m | head -2
    sudo docker ps --format '{{.Names}}\t{{.Status}}'

Ghi lại để rollback: tên container/compose của web 0.5 và digest/tag đang chạy.

    cd /opt/seafoodeck && sudo docker compose ps && sudo docker compose config --images

## 1. Lấy mã nguồn về /opt/seafoodeck-pilot

    cd /opt
    sudo mkdir -p seafoodeck-pilot
    sudo chown shin:shin seafoodeck-pilot
    git clone --branch main https://github.com/tiendn1408/seafoodeck.git seafoodeck-pilot
    cd /opt/seafoodeck-pilot
    git log --oneline -1

(Nếu thư mục đã có repo: `cd /opt/seafoodeck-pilot && git pull --ff-only`.) Repo là private thì git sẽ hỏi đăng nhập; dùng PAT có quyền đọc repo, nhập ở prompt.

## 2. Sinh secrets (chỉ một lần, script từ chối ghi đè)

    cd /opt/seafoodeck-pilot
    sudo docker run --rm --user "$(id -u):$(id -g)" -v "$PWD:/work" -w /work node:24-alpine node scripts/init-pilot.mjs --production --origin https://seafoodeck.tiendn.io.vn --studio-origin https://seafoodeckstudio.tiendn.io.vn
    ls -l .local/    # pilot.env và s3.json phải mode 600

`--studio-origin` bật host Studio cho nhân sự (không có cờ này thì không có Studio, chỉ có app học viên); DNS và kiểm sau deploy: [DEPLOY_STUDIO_HOST.md](DEPLOY_STUDIO_HOST.md).

## 3. Đăng nhập GHCR (PAT read:packages)

Tạo PAT classic quyền `read:packages` trên GitHub. Gõ khi hỏi Password, không đưa vào lệnh:

    sudo docker login ghcr.io -u tiendn1408

## 4. Ghi hai digest vào .local/pilot.env

Init ghi sẵn tag r2 cũ; thay bằng digest mới (không in file ra màn hình):

    cd /opt/seafoodeck-pilot
    sed -i 's#^API_IMAGE_REF=.*#API_IMAGE_REF=ghcr.io/tiendn1408/seafoodeck-api@sha256:5a0459278c35203af3a55eafc074d2b4e9848ef525ea80a594be2551f9c5274e#' .local/pilot.env
    sed -i 's#^WEB_IMAGE_REF=.*#WEB_IMAGE_REF=ghcr.io/tiendn1408/seafoodeck-web@sha256:0c1e6af44e4e12d0ed8e636ef9ba082aa38b354043dc13516f7785af9ada88f3#' .local/pilot.env
    grep -E '^(API|WEB)_IMAGE_REF=' .local/pilot.env     # chỉ hai dòng này, không chứa bí mật

Đặt alias cho ngắn:

    alias dc='sudo docker compose --env-file .local/pilot.env --project-directory . -f deploy/compose.pilot.ghcr.yaml'
    dc config --images     # phải thấy đúng hai digest trên

## 5. Pull và khởi tạo (chưa đụng cổng 80/443)

    dc pull
    dc up -d db storage
    dc ps                                   # db, storage phải healthy
    dc run --rm migrate                     # kết thúc "All migrations have been successfully applied"
    dc run --rm --no-deps api node dist/bootstrap.js    # tạo tài khoản quản trị đầu tiên
    dc up -d api
    dc ps                                   # api healthy
    dc logs --tail 30 api

Lưu ý: `dc up -d api` KHÔNG khởi động web; web 0.5 vẫn đang phục vụ.

## 6. Chuyển web (làm khi sẵn sàng, có khoảng nghỉ ngắn)

Chỉ dừng service web của bản cũ. Không `down`, không `-v`, không động tới bot trading.

    cd /opt/seafoodeck
    sudo docker compose stop web
    cd /opt/seafoodeck-pilot
    dc up -d web
    dc ps

Nếu web mới không lên (lỗi cổng/TLS), chuyển ngay phần 10 (rollback).

## 7. Health check

    curl -fsS https://seafoodeck.tiendn.io.vn/api/v1/health
    # mong đợi: {"status":"ok","version":"0.6.0","release":"pilot-internal-20261119-r1"}
    dc ps    # api và web healthy
    dc logs --tail 20 web

Caddy cần vài chục giây lấy chứng chỉ TLS lần đầu. Mở trình duyệt vào https://seafoodeck.tiendn.io.vn : trang tải được. Khi chưa có release, API trả 404 "Chưa có bộ học được xuất bản" cho học viên, đó là đúng, UI chưa được thử với trạng thái rỗng này trong trình duyệt.

## 8. Lấy tài khoản và mã mời

Chỉ có trong file của VPS. Mở bằng editor/pager riêng, nhìn các dòng `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `LEARNER_INVITE_CODE`; đừng dán đi đâu cả:

    sudo less /opt/seafoodeck-pilot/.local/pilot.env

Quản trị đăng nhập với tên `owner` + `ADMIN_PASSWORD`; học viên dùng mã mời. Sao lưu `.local/pilot.env` và `.local/s3.json` ở nơi an toàn riêng.

## 9. Nhập dữ liệu prototype từ laptop

Trong repo trên laptop (`/Users/tien.dang/Workplace/reference/seafood-deck`). Chạy thử trước, không ghi gì:

    node scripts/import-prototype.mjs --source /Users/tien.dang/Workplace/reference/seafood-master-2 --base-url https://seafoodeck.tiendn.io.vn --dry-run

Đọc báo cáo (số loài, ảnh, lỗi, trùng). Nếu ổn, chạy thật (nhập tài khoản quản trị và mật khẩu ở prompt, mật khẩu ẩn):

    node scripts/import-prototype.mjs --source /Users/tien.dang/Workplace/reference/seafood-master-2 --base-url https://seafoodeck.tiendn.io.vn

Importer chỉ tạo bản NHÁP. Trong giao diện Quản trị: xem lại từng bản nháp, duyệt (approve), rồi xuất bản.

### Xuất bản PUBLIC thì cần gì

Xuất bản public yêu cầu mỗi loài đã được duyệt và có tối thiểu 3 ảnh nhận diện gốc khác nhau đã được duyệt. Dữ liệu prototype thường chưa đủ điều kiện này, nên cổng public có thể từ chối. Đừng cố vượt cổng.

### Xem thử nhanh bằng bản nội bộ (ALLOW_INTERNAL_DEMO)

Nếu chỉ cần nhìn thử, xuất bản một release NỘI BỘ (nút xuất bản nội bộ trong Quản trị, không đánh dấu nội dung đã duyệt). Học viên chỉ thấy release nội bộ khi `ALLOW_INTERNAL_DEMO=true`. Production mặc định đặt `false`:

    cd /opt/seafoodeck-pilot
    sudo sed -i 's#^ALLOW_INTERNAL_DEMO=.*#ALLOW_INTERNAL_DEMO=true#' .local/pilot.env
    dc up -d --force-recreate api

Đăng nhập lại bằng mã mời để có phiên phạm vi nội bộ. Rủi ro: ai có mã mời đều xem được nội dung chưa duyệt (tên, ảnh, mã HS chưa kiểm chứng) qua domain công khai; chỉ dùng cho xem thử, không đưa người ngoài vào. Quay về an toàn khi xong:

    sudo sed -i 's#^ALLOW_INTERNAL_DEMO=.*#ALLOW_INTERNAL_DEMO=false#' .local/pilot.env
    dc up -d --force-recreate api

Phiên cũ mất quyền xem release nội bộ ngay. Không chạy `dist/seed.js` trên bộ khách.

## 10. Rollback

- Về web 0.5 (không mất dữ liệu): 

      cd /opt/seafoodeck-pilot && dc stop web
      cd /opt/seafoodeck && sudo docker compose up -d web
      curl -I https://seafoodeck.tiendn.io.vn

  Giữ nguyên DB/S3 mới (`dc stop api` nếu muốn dừng tiêu thụ RAM) để điều tra. KHÔNG `down -v`, không xóa volume `pilot_db`, `pilot_storage`.
- Rollback nội dung: Quản trị, chọn release cũ, quay lại; phiên đang mở vẫn ghim release gốc.
- Image: sửa hai digest về giá trị cũ (r2: xem docs/DELIVERY_0.6.0.md), `dc pull`, `dc up -d api web`; chỉ làm khi schema tương thích.
- Dữ liệu: nâng cấp lần sau, backup trước: `sudo env PILOT_COMPOSE_FILE=deploy/compose.pilot.ghcr.yaml sh scripts/backup-pilot.sh _backups/before-next-release`.

## 11. Kiểm trước khi chuyển domain / mở cho người khác

- DNS A đúng `42.96.20.66`, không AAAA sai; firewall mở TCP 80/443 (và UDP 443 nếu dùng HTTP/3), KHÔNG mở cổng DB/API/S3.
- `dc config --images` đúng hai digest; `dc ps` mọi service healthy.
- Health trả version 0.6.0 và release `pilot-internal-20261119-r1`; chứng chỉ TLS hợp lệ (trình duyệt không cảnh báo).
- Đăng nhập admin và mã mời đều thành công; mã sai bị từ chối.
- `.local/pilot.env`, `.local/s3.json` mode 600, đã sao lưu riêng; `ALLOW_INTERNAL_DEMO=false` trước khi mở cho người ngoài.
- Có backup trước khi nhập dữ liệu thật; web 0.5 cũ vẫn còn thư mục/config để quay lại.
- Kho SeaweedFS là dev/test nội bộ; chưa phải kho khách chính thức. Chưa thử trên VPS thật (chỉ thử trên máy phát triển, arm64 giả lập amd64).
