# Mốc triển khai monorepo/pilot

## Baseline và mốc 1 — dời frontend

Baseline 7840e41 / tag baseline-0.5.1; remote origin chưa có refs trước khi khởi tạo. npm 11.19.1, Node 24.22.3, một package-lock. Không thay package manager hoặc nâng dependency FE.

Đã dời bằng git mv sang apps/web. Root Dockerfile giữ lệnh build cũ; app Dockerfile dùng context root. Build/runtime web độc lập, Caddy production. Dữ liệu, key localStorage, routes, media, giao diện và hành vi giữ nguyên.

Baseline: 63 unit, 27 E2E pass (3 skip viewport desktop), build/lint/format pass. Sau dời: 63 unit và 27 E2E pass trên container migration-fe-20261117 tại 18088; image ID sha256:dd9079bbc4929abb9f42dc0929d5941121555069a39547aa550503d852a7b99e. JS/CSS output vẫn index-BoOzd80V.js / index-Bdi0EKV3.css, trùng baseline.

Kiểm cùng origin 127.0.0.1:18087: mở flashcard/lật, giữ browser context, đổi container từ image baseline sang image migrated, chờ HTTP ready, reload; raw storage giống byte-for-byte, hash deep link và mặt thẻ đã lật giữ nguyên. Lần thử đầu reload trước khi container ready trả ERR_EMPTY_RESPONSE; thêm readiness poll rồi kiểm pass. Đã khôi phục preview baseline sau kiểm. Đây là local, không đổi VPS.

Chạy từ root: npm ci; npm test; npm run build; npm run lint. Docker: docker build --platform linux/amd64 -f apps/web/Dockerfile -t seafoodeck:migration-fe-20261117 . . Preview migrated 18088. Quay về FE tĩnh baseline qua image ghcr.io/tiendn1408/seafoodeck:flat-illustrations-20261117; không liên quan schema DB ở mốc 1.

Mốc 2 và các nhóm pilot tiếp tục sau mốc này, không gọi mốc dời FE là hoàn thành pilot.
