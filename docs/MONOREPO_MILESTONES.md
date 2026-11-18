# Mốc triển khai monorepo/pilot

## Baseline và mốc 1 — dời frontend

Baseline 7840e41 / tag baseline-0.5.1; remote origin chưa có refs trước khi khởi tạo. npm 11.19.1, Node 24.22.3, một package-lock. Không thay package manager hoặc nâng dependency FE.

Đã dời bằng git mv sang apps/web. Root Dockerfile giữ lệnh build cũ; app Dockerfile dùng context root. Build/runtime web độc lập, Caddy production. Dữ liệu, key localStorage, routes, media, giao diện và hành vi giữ nguyên.

Baseline: 63 unit, 27 E2E pass (3 skip viewport desktop), build/lint/format pass. Sau dời: 63 unit và 27 E2E pass trên container migration-fe-20261117 tại 18088; image ID sha256:dd9079bbc4929abb9f42dc0929d5941121555069a39547aa550503d852a7b99e. JS/CSS output vẫn index-BoOzd80V.js / index-Bdi0EKV3.css, trùng baseline.

Kiểm cùng origin 127.0.0.1:18087: mở flashcard/lật, giữ browser context, đổi container từ image baseline sang image migrated, chờ HTTP ready, reload; raw storage giống byte-for-byte, hash deep link và mặt thẻ đã lật giữ nguyên. Lần thử đầu reload trước khi container ready trả ERR_EMPTY_RESPONSE; thêm readiness poll rồi kiểm pass. Đã khôi phục preview baseline sau kiểm. Đây là local, không đổi VPS.

Chạy từ root: npm ci; npm test; npm run build; npm run lint. Docker: docker build --platform linux/amd64 -f apps/web/Dockerfile -t seafoodeck:migration-fe-20261117 . . Preview migrated 18088. Quay về FE tĩnh baseline qua image ghcr.io/tiendn1408/seafoodeck:flat-illustrations-20261117; không liên quan schema DB ở mốc 1.

Mốc 2 và các nhóm pilot tiếp tục sau mốc này, không gọi mốc dời FE là hoàn thành pilot.

## Mốc 2 — API và pilot online (`1c6b116`)

Catalog, media và cả bốn chế độ chuyển sang Nest/Prisma/PostgreSQL/private S3; web không import fixtures, catalog hay đáp án. Shared DTO đủ qua OpenAPI snapshot, không thêm shared package/client chưa dùng. CSV tạo revision mới; release/rollback nguyên tử; API không fallback. Hai migration cộng thêm schema (`initial`, `alias_search`), không reset DB.

Đã dựng stack mới từ volume trống và seed nội bộ chủ động 1000 mục. 63 unit web + 9 API, typecheck/build/lint/format pass; 15 E2E trên container +3 desktop skip viewport; cả bốn mode, API/media/CSRF/ACL/expiry, dừng DB/API, reload/idempotence/ôn lỗi và Flashcard 320px pass. Chi tiết, image digest và giới hạn nội dung tại [DELIVERY_0.6.0.md](DELIVERY_0.6.0.md). Root Dockerfile từ mốc này là web cần API, không còn là image HTML standalone. Baseline và tag mốc 1 giữ để rollback/đối chiếu.

Checkout sạch `/tmp/seafoodeck-milestone-2-check` từ commit 1c6b116: npm ci --ignore-scripts, build API + web và 72 unit pass. Không dùng generated Prisma hoặc node_modules của workspace gốc. PR tổng hợp: https://github.com/tiendn1408/seafoodeck/pull/1.
