# Chạy Seafood Deck 0.6 qua GHCR bằng tay

> **Cập nhật 2.5e.** Từ bản tách tầng web, stack pilot có **bốn** ảnh: `seafoodeck-api`, `seafoodeck-edge`, `seafoodeck-web-learner`, `seafoodeck-web-studio` (không còn `seafoodeck-web`), và `.local/pilot.env` dùng `API_IMAGE_REF`, `EDGE_IMAGE_REF`, `LEARNER_IMAGE_REF`, `STUDIO_IMAGE_REF` (không còn `WEB_IMAGE_REF`). Các mục bên dưới mô tả bản 0.6 `pilot-internal-20261119-r1` (một ảnh web, `WEB_IMAGE_REF`, service `web`): **lịch sử**, giữ làm biên bản. Build, đẩy, đổi mã ảnh, gỡ `web` cũ và bật `edge` cho bản tách: [DEPLOY_STUDIO_HOST.md](DEPLOY_STUDIO_HOST.md) mục 3; lệnh `publish-pilot.sh <tag>` giờ đẩy cả bốn ảnh. Giá trị mặc định ba `*_IMAGE_REF` trong `deploy/pilot.env.example` và do `init-pilot` ghi chỉ là chỗ giữ chỗ: phải thay bằng digest trước `dc pull`. `deploy/compose.ghcr.yaml` và `deploy/compose.origin.yaml` là bản 0.5 (legacy 0.5).

0.6 là web + API + PostgreSQL + kho S3 riêng. Không dùng `deploy/compose.ghcr.yaml` của 0.5 hoặc chỉ thay `IMAGE_REF`: file đó chỉ chạy web tĩnh. Không chạy các lệnh dưới trong thư mục bot trading. Agent chưa triển khai lên VPS.

## Chuẩn bị trên máy làm việc

Image dành cho Ubuntu x86_64, hai package `ghcr.io/tiendn1408/seafoodeck-web` và `ghcr.io/tiendn1408/seafoodeck-api`, tag `pilot-internal-20261119-r1`. Digest của tag này nằm ngay dưới và trong `DELIVERY_PHASE2_IMAGES.md`; tag cũ `pilot-internal-20261118-r2` (digest trong `DELIVERY_0.6.0.md`) không được ghi đè. Để phát hành lại mã thay đổi phải dùng tag mới, build/test cả hai image rồi chạy `sh scripts/publish-pilot.sh <tag>`; không ghi đè tag đang bàn giao.

Đăng nhập GHCR trên máy cần push bằng PAT classic `write:packages`; máy chỉ pull package private dùng `read:packages`. Tạo token tại GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic) → Generate new token (classic). Không đưa token vào file repo hoặc lệnh có lưu history. Dùng `docker login ghcr.io -u tiendn1408` rồi nhập token ở prompt Password. Trên VPS nếu chạy Docker qua sudo thì đăng nhập bằng `sudo docker login ghcr.io -u tiendn1408`.

Gửi repo/clone qua SSH terminal trên laptop để có thể copy/paste. Chỉ dùng mã nguồn đã commit, không gửi `.local/`, `_backups/`, inbox hoặc dữ liệu khách. Ví dụ trên VPS:

```sh
cd /opt
sudo mkdir -p seafoodeck-pilot
sudo chown shin:shin seafoodeck-pilot
git clone --branch main https://github.com/tiendn1408/seafoodeck.git seafoodeck-pilot
cd /opt/seafoodeck-pilot
sudo docker run --rm --user "$(id -u):$(id -g)" -v "$PWD:/work" -w /work node:24-alpine node scripts/init-pilot.mjs --production --origin https://seafoodeck.tiendn.io.vn --studio-origin https://seafoodeckstudio.tiendn.io.vn
```

`--studio-origin` bật host Studio cho nhân sự (bỏ cờ này thì không có Studio); DNS, biến môi trường và kiểm sau deploy: [DEPLOY_STUDIO_HOST.md](DEPLOY_STUDIO_HOST.md).

Nếu thư mục đã có repo, dùng `git pull --ff-only` trên đúng branch thay vì clone lại. Init cố ý từ chối ghi đè secrets đã có. File `.local/pilot.env` và `.local/s3.json` có mật khẩu thật, giữ riêng và backup an toàn. Không gửi nội dung cho agent. Mở env riêng để lấy tài khoản `owner`, mật khẩu quản trị, mã mời học viên. Mặc định production không cho truy cập nội dung fixture. Kho SeaweedFS này dành cho dev/test nội bộ; phải chọn/duyệt kho sử dụng thực tế và smoke test trước pilot khách.

## Bản 0.6 + giao diện mới (tag pilot-internal-20261119-r1)

Hai image linux/amd64 đã push GHCR. Cài mới trên VPS ghi hai digest này vào `WEB_IMAGE_REF` và `API_IMAGE_REF` trong `.local/pilot.env` (lệnh init vẫn ghi sẵn tag r2 cũ, phải thay):

```env
API_IMAGE_REF=ghcr.io/tiendn1408/seafoodeck-api@sha256:5a0459278c35203af3a55eafc074d2b4e9848ef525ea80a594be2551f9c5274e
WEB_IMAGE_REF=ghcr.io/tiendn1408/seafoodeck-web@sha256:0c1e6af44e4e12d0ed8e636ef9ba082aa38b354043dc13516f7785af9ada88f3
```

Chi tiết build/kiểm thử: `DELIVERY_PHASE2_IMAGES.md`.

## Khởi tạo stack mới, chưa chuyển cổng domain

Ghi `WEB_IMAGE_REF` và `API_IMAGE_REF` trong `.local/pilot.env` bằng hai digest trong báo cáo. Kiểm tra image chính xác trước khi chạy:

```sh
sudo docker compose --env-file .local/pilot.env --project-directory . -f deploy/compose.pilot.ghcr.yaml config --images
sudo docker compose --env-file .local/pilot.env --project-directory . -f deploy/compose.pilot.ghcr.yaml pull
sudo docker compose --env-file .local/pilot.env --project-directory . -f deploy/compose.pilot.ghcr.yaml up -d db storage
sudo docker compose --env-file .local/pilot.env --project-directory . -f deploy/compose.pilot.ghcr.yaml run --rm migrate
sudo docker compose --env-file .local/pilot.env --project-directory . -f deploy/compose.pilot.ghcr.yaml run --rm --no-deps api node dist/bootstrap.js
sudo docker compose --env-file .local/pilot.env --project-directory . -f deploy/compose.pilot.ghcr.yaml up -d api
```

Bootstrap chỉ tạo quản trị đầu tiên; không tự tạo hay duyệt danh mục khách. Admin nhập CSV → nháp → duyệt → xuất bản; learner chỉ thấy release được phép. Không chạy seed thử nghiệm ở bộ khách. Mã mời và đăng nhập là bắt buộc.

## Chuyển web sau khi đã sẵn sàng

Domain A `seafoodeck.tiendn.io.vn` trỏ `42.96.20.66`; bỏ AAAA nếu không có IPv6 phù hợp. Mở TCP 80/443 và UDP 443 nếu dùng HTTP/3 trong firewall VPS/nhà cung cấp. Caddy tự cấp TLS; giữ volume caddy_data. Không công khai cổng DB, API hoặc S3.

Bản 0.5 đang giữ cổng 80/443. Lưu config/env/image digest cũ, rồi dừng **riêng service web** tại `/opt/seafoodeck` khi bạn quyết định chuyển; không `down -v`, không tác động bot trading:

```sh
cd /opt/seafoodeck
sudo docker compose stop web
cd /opt/seafoodeck-pilot
sudo docker compose --env-file .local/pilot.env --project-directory . -f deploy/compose.pilot.ghcr.yaml up -d web
sudo docker compose --env-file .local/pilot.env --project-directory . -f deploy/compose.pilot.ghcr.yaml ps
curl -fsS https://seafoodeck.tiendn.io.vn/api/v1/health
```

Health phải trả version `0.6.0`, DB hoạt động; `ps` phải thấy API/web healthy. Mở trình duyệt, kiểm đăng nhập mã mời, release ID và bốn chế độ. Chưa có release đã duyệt thì danh mục trống là đúng; không fallback sang dữ liệu tĩnh. Browser localStorage 0.5 giữ nguyên nhưng không tự ánh xạ điểm cũ sang pilot mới.

## Những lần nâng cấp tiếp theo

Tại repo mới, backup cả DB và object trước migration (script dừng API trong lúc snapshot; cần thông báo khoảng nghỉ). Backup chứa dữ liệu riêng tư, không commit:

```sh
PILOT_COMPOSE_FILE=deploy/compose.pilot.ghcr.yaml sh scripts/backup-pilot.sh _backups/before-next-release
```

Nếu Docker cần sudo, chạy `sudo env PILOT_COMPOSE_FILE=deploy/compose.pilot.ghcr.yaml sh scripts/backup-pilot.sh _backups/before-next-release`. Sau đó sửa hai digest env, pull, dừng API, chạy migration kiểm exit 0, rồi up API/web và kiểm health. Migration đang có chỉ cộng thêm schema; không dùng `prisma migrate reset` hay xóa volume. Không chạy image API cũ với schema mới nếu chưa xác nhận tương thích.

Rollback nội dung dùng Quản trị → release cũ → quay lại; phiên học đang mở vẫn ghim release gốc. Rollback ứng dụng về 0.5: dừng web mới, khởi động web cũ tại `/opt/seafoodeck`; giữ nguyên DB/S3 mới để điều tra. Rollback DB/S3 cần khôi phục **cặp backup cùng thời điểm trên stack cô lập** và kiểm trước chuyển, không ghi đè dữ liệu đang chạy.

## Backup và phục hồi

Script backup xuất SQL, manifest object và bytes kèm SHA-256, image refs. Secrets/config phải lưu riêng cùng snapshot, vì dump không chứa khóa S3 hay env. Phục hồi vào project/volume mới: khởi động db/storage; `psql` SQL vào DB trống trước khi chạy migration; chạy `node dist/objects.js restore` trong API image với `BACKUP_DIR` trỏ thư mục backup đã bind mount; migrate, bootstrap nếu cần, up API/web. So sánh item count/release, manifest SHA-256, đọc ảnh qua signed URL và chơi thử. Không mở bản backup ra internet.

Signed URL tồn tại tối đa TTL (mặc định 120 giây); revoke chặn cấp URL mới ngay, URL đã cấp có thể còn dùng tới hết TTL. Bản online không hứa khả năng offline. Cần phê duyệt nội dung, lưu trữ, retention/backup và smoke test tại hạ tầng thật trước pilot khách.

## Demo kỹ thuật có fixture (tùy chọn riêng, chưa phải bộ khách)

Chỉ trên deployment nội bộ được phép dùng fixture: khi khởi tạo env thêm `--internal-demo` vào lệnh init production. Nếu env đã tồn tại, đặt `ALLOW_INTERNAL_DEMO=true` bằng editor riêng, giữ nguyên secrets. Sau đó dùng chính API GHCR và bind bộ fixture repo cho **lệnh seed một lần**, không đưa fixture vào image:

```sh
sudo docker compose --env-file .local/pilot.env --project-directory . -f deploy/compose.pilot.ghcr.yaml run --rm --no-deps -v "$PWD/test-fixtures:/fixtures:ro" -e INTERNAL_SEED_DIR=/fixtures -e INTERNAL_SEED_COUNT=6 api node dist/seed.js
sudo docker compose --env-file .local/pilot.env --project-directory . -f deploy/compose.pilot.ghcr.yaml up -d --force-recreate api
```

Seed giữ nguyên khi đã có release nội bộ, không ghi đè dữ liệu. Đăng nhập mã mời mới cho scope nội bộ. Để chuyển sang bộ khách, nhập/duyệt/publish public hợp lệ rồi tắt `ALLOW_INTERNAL_DEMO`, recreate API; phiên cũ mất quyền xem release nội bộ ngay. Không dùng sample để vượt duyệt public. Môi trường kiểm 1000 mục dùng `INTERNAL_SEED_COUNT=1000` thay 6 ở lần seed đầu, không dùng để trình bày danh mục hàng khách.

Kho S3 dùng init service `storage-config` chép file IAM private vào volume riêng, file đích UID 1000/mode 600 để SeaweedFS đọc được trên Linux; không chmod world-readable file nguồn. Khi xoay khóa, giữ env/IAM đồng bộ rồi chạy lại init và recreate storage/API trong khoảng bảo trì. Health storage kiểm master và cổng S3, không chỉ master.
