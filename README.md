# Seafood Deck

Ứng dụng học tên và nghiệp vụ thủy hải sản cho người mới vào ngành và nhân viên kinh doanh quốc tế. Bản 0.6 online gồm React/Vite trong `apps/web`, NestJS/Prisma trong `apps/api`, PostgreSQL và S3 riêng. Người học vào bằng mã mời; quản trị đăng nhập, biên tập → duyệt → xuất bản revision. Bốn chế độ: Flashcard, Ghép tên, Đoán hình, HS; tổng kết, ôn lỗi và lịch ôn 1/3/7/14 ngày.

## Chạy nội bộ

Node 24/npm, Docker Compose, context build từ gốc repo:

```sh
npm ci
node scripts/init-pilot.mjs
docker compose --env-file .local/pilot.env up -d --build
INTERNAL_SEED_COUNT=1000 docker compose --env-file .local/pilot.env --profile internal-seed run --rm seed
```

Mở http://127.0.0.1:18089. Lấy mã mời hoặc quản trị từ `.local/pilot.env` riêng; không commit/gửi file này. Seed là lệnh chủ động **chỉ cho kiểm thử nội bộ**, không chạy lúc app khởi động. Bộ mẫu có 6 loài không tôm và 994 dòng SKU tổng hợp để kiểm phân trang; không phải danh mục được khách xác nhận. Ảnh thật tham chiếu chưa duyệt nhận diện; không phát hành public. Ảnh AI 2D chỉ trang trí, không tham gia chấm Đoán hình. Chưa có audio chuyên ngành đã duyệt.

Production không cần seed: tạo env bằng `--production --origin https://...`, chạy migrations rồi `node dist/bootstrap.js` trong API image, nhập danh mục qua quản trị. [Chạy VPS/GHCR và nâng cấp](docs/DEPLOY_PILOT.md). Chưa deploy VPS trong lượt này.

## Tài khoản học viên (phase 2.5a, chỉ API)

Quản trị tạo tài khoản `student` (mật khẩu ≥ 8 ký tự) hoặc `manager` qua `POST /api/v1/admin/users`, có thể bật `mustChangePassword`. Với `student`, mỗi lượt chấm ghi nhật ký và lịch ôn trên server (`/me/home`, `/me/review`, `/me/progress`, `/me/mastery`); học viên mã mời không đổi. Trình duyệt chưa dùng các route này. Dựng lại lịch ôn từ nhật ký (chỉ in số lượng):

```sh
docker compose --env-file .local/pilot.env run --rm --no-deps api node dist/rebuild-progress.js
```

Kiểm đầu cuối trên stack local: `node scripts/learner-accounts-check.mjs` (thêm `--stress` để kiểm nộp đồng thời; tạo người dùng QA, không in bí mật). Chi tiết: [DELIVERY_25A.md](docs/DELIVERY_25A.md). Bản này có migration mới: sao lưu DB trước khi nâng cấp VPS.

## Nhập dữ liệu prototype

Bộ prototype (100 loài, 5 hồ sơ HS) được nhập thành bản nháp qua script chỉ gọi API quản trị; không ghi thẳng DB. Thông tin nguồn và giới hạn: [docs/sources/prototype-import](docs/sources/prototype-import/README.md).

```sh
# Chạy thử: đăng nhập và tra cứu, không ghi gì
node scripts/import-prototype.mjs --source ../seafood-master-2 --base-url http://127.0.0.1:18089 --dry-run
# Chạy thật vào API đích (mật khẩu quản trị được hỏi lúc chạy, không đưa qua argv/env)
node scripts/import-prototype.mjs --source ../seafood-master-2 --base-url http://127.0.0.1:18089
```

Chạy lên VPS chỉ khi người vận hành quyết định; script không tự chạy ở đó.

## Kiểm tra

```sh
npm test
npm run typecheck
npm run lint
npm run format:check
npm run build
npm run contract:generate
npm run smoke:pilot
npm run test:e2e
node scripts/resilience-pilot.mjs
node scripts/browser-pilot-check.mjs
```

Smoke/E2E/resilience dùng stack Docker nội bộ đã seed 1000 mục và `.local/pilot.env`; có tạo nháp QA, kiểm publish/rollback, dừng/khởi động DB/API. Chỉ chạy ở môi trường kiểm thử. Playwright cần Chromium (`npx playwright install chromium`). `playwright.legacy.config.ts` chỉ dành cho kiểm mốc di chuyển FE cũ, không chạy với API app mới.

Web không chứa catalog/đáp án/ảnh khách. Nội dung và tên đến từ API/DB; byte media ở private S3, signed URL ngắn hạn. API lỗi phải hiển thị lỗi, không dùng fixture dự phòng. `_inbox`, `_outbox`, `_archive`, `_backups`, `.local` không thuộc runtime/image. Dữ liệu mẫu được giữ ở `test-fixtures` để seed kiểm thử, không COPY vào image.

[Hai mốc chuyển monorepo](docs/MONOREPO_MILESTONES.md) · [Đặc tả API](docs/api/openapi.json) · [Báo cáo bàn giao 0.6](docs/DELIVERY_0.6.0.md) · [Giao nhận](docs/FILE_HANDOFF.md) · [Yêu cầu pilot](docs/requirements/Seafood_Deck_Pilot_Implementation_Plan.md)

Baseline 0.5.1 còn tại tag `baseline-0.5.1`; mốc di chuyển web giữ hành vi cũ tại `milestone-1-web-migration`. Dữ liệu lưu trình duyệt của baseline được giữ riêng, không tự nhập thành tiến độ pilot. CI chỉ kiểm thử/build, không deploy VPS.
