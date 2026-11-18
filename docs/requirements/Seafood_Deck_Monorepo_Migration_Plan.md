# Seafood Deck — Kế hoạch chuyển repo FE sang monorepo

**Gửi dev/coding agent:** đặt file này vào `_inbox/` hiện có. Đây là phụ lục triển khai cho `Seafood_Deck_Pilot_Implementation_Plan.md`, bổ sung **cách tổ chức và chuyển repo**, không thay phạm vi sản phẩm. Thực hiện trong **một PR với hai mốc kiểm chứng**, không trả thêm proposal, không tạo ZIP/inbox mới và không deploy đè VPS. Plan pilot vẫn quyết định phạm vi game, nội dung, quản trị, media và nghiệm thu khách.

## 1. Quyết định và phạm vi

Giữ repo và lịch sử Git hiện tại. Chuyển FE sang `apps/web`, thêm BE ở `apps/api`. Web và API độc lập về quy trình build, image và runtime; cùng repo để hợp đồng API, backend và UI thay đổi trong cùng PR. Dùng npm workspaces nếu dự án dùng npm, hoặc pnpm workspaces nếu đã dùng pnpm; không đổi package manager chỉ vì chuyển repo. Nếu phát hiện repo đã có workspace hoặc backend tương đương, tận dụng cấu trúc đang chạy và báo sai khác, không tạo app thứ hai. Chưa thêm Nx/Turborepo.

```text
seafood-deck/
├── apps/
│   ├── web/              # React + TypeScript + Vite; Dockerfile riêng
│   └── api/              # NestJS + Express adapter; Prisma; Dockerfile riêng
│       └── prisma/       # Schema và migrations PostgreSQL
├── packages/
│   └── api-client/       # Chỉ tạo khi có client/types dùng thật từ OpenAPI
├── package.json          # Workspace root và lệnh dùng chung
├── [workspace lockfile]  # Lockfile theo package manager đang dùng
├── compose.yaml          # Tiếp quản file Compose hiện có nếu phù hợp
├── docs/
└── _inbox/               # Thư mục bàn giao hiện có, không phải input của build
```

**Ranh giới bắt buộc:** FE dùng `/api/v1`; không import Prisma, mã nghiệp vụ NestJS hay đáp án từ BE. API giữ validation và chỉ trả DTO phục vụ màn hình. OpenAPI là hợp đồng; nếu sinh client/types thì có lệnh sinh lại và kiểm drift trong CI. Không tạo package `shared` chỉ để chép type DB qua FE. Ảnh/audio khách không vào Git, DB hay bundle FE; lưu theo thiết kế S3 của plan pilot. Mốc đọc danh mục không yêu cầu dựng toàn bộ luồng upload/storage; nếu cần ảnh cho lát cắt, không đưa dữ liệu khách vào fixture.

## 2. Một PR, hai mốc triển khai

| Mốc | Thay đổi | Điều kiện để tiếp tục |
|---|---|---|
| **Commit 1 — Dời FE, giữ nguyên hành vi** | Trước hết chạy baseline trên checkout hiện tại: lệnh cài, test, build, Docker/Compose nếu có; ghi lỗi có sẵn. Dời app bằng Git, giữ tên route và hành vi; cập nhật workspace, lockfile, alias, env, thư mục static, đầu ra `dist`, test/CI và đường dẫn Compose/Docker. Giữ đúng base path, URL và origin hiện tại khi kiểm tương thích; không đổi key lưu tiến độ trong lượt dời. | Từ checkout sạch, cài bằng lockfile và chạy lại test/build FE. Kiểm màn hình, asset, deep link có sẵn và tiến độ trước/sau trên cùng origin nếu app đang hỗ trợ. Bản FE cũ vẫn khởi động được bằng cách phát hành hiện có hoặc lệnh thay thế được ghi rõ. Không trộn API, đổi dữ liệu học hay redesign vào commit này. |
| **Commit 2 — Thêm API/DB, nối một luồng thật** | Thêm `apps/api` với NestJS + Express, OpenAPI, health check, Prisma/PostgreSQL; tạo migration tối thiểu và seed nội bộ riêng. Nối **Thư viện → một trang danh mục phân trang** gọi API, có loading/rỗng/lỗi. Có thể chọn phạm vi route theo repo, ví dụ `GET /api/v1/catalog/items`. Web dev proxy và reverse proxy trong Compose cùng dùng `/api/v1`; kiểm giữ prefix và không để SPA fallback trả HTML cho API. | Chạy Compose với DB sạch, áp migration, nạp seed nội bộ rõ ràng rồi mở trang từ container web. Xác nhận response đến từ DB qua API; sửa một mục trên DB test hoặc seed lại có kiểm soát, tải lại thấy nội dung đổi mà không rebuild web. Tắt API phải báo lỗi đúng, không tự quay về fixture FE. Không xuất bản fixtures, không có tôm trong danh mục khách. |

**Sau commit 2:** chuyển tiếp từng màn còn lại sang API trong các nhóm của plan pilot. Ghi màn nào còn đọc fixture; riêng lát cắt danh mục đã chuyển không được dùng fallback fixture. Không gọi mốc này là hoàn thành bốn chế độ, đủ ảnh/audio hay sẵn sàng pilot.

## 3. Quy ước build, cấu hình và kiểm thử

- **Workspace root:** giữ một lockfile đúng chuẩn công cụ. Có lệnh từ root cho dev web/API, build web/API, test và kiểm kiểu; ghi chính xác lệnh thực tế sau khi chọn package manager. Không nâng hàng loạt dependencies hoặc xóa untracked files của người dùng.
- **Docker/CI:** mỗi app có Dockerfile riêng. Nếu build cần root lockfile/workspace hoặc package nội bộ, đặt build context ở gốc repo, chỉ rõ `dockerfile`, và COPY đúng manifest/package. Dùng `.dockerignore` loại `_inbox`, `_outbox`, `_archive`, `.git`, thư mục build cũ, secrets và media khách. Web production phục vụ `dist` bằng server tĩnh/reverse proxy, không dùng Vite dev/preview làm production server. CI cài bằng lockfile, chạy build/test hai workspace và smoke từ image mới.
- **Compose và env:** chỉ mở cổng web/proxy cho người dùng; API/DB ở mạng nội bộ trừ khi cấu hình dev cần khác. Có `.env.example` với tên biến và giá trị giả; không đưa `DATABASE_URL`, secret hay khóa storage vào `VITE_*`. Dùng health check và lệnh migration có kiểm soát thay vì dựa vào thứ tự container start; production không chạy seed demo. Không trỏ staging vào DB khách.
- **Kiểm từ browser/container:** trang tải đúng, reload trực tiếp route web không 404 (nếu route đã có), API JSON đúng, lỗi API/lỗi DB không thành dữ liệu giả, và không có request cross-origin ngoài dự kiến cho luồng danh mục. Nếu có client sinh từ OpenAPI, kiểm contract và sinh lại không tạo diff ngoài dự kiến.
- **Quay lui:** giữ commit/image FE baseline để quay lui bản chạy. Kiểm đường quay lui trên staging; không mặc định rollback image sẽ rollback schema. Không xóa DB volume, chạy migration phá dữ liệu, reset branch hoặc ghi đè cấu hình VPS để “làm sạch”.

## 4. Bàn giao gộp

Trả **một báo cáo cùng PR**: package manager, hai commit/mốc, lệnh chạy từ checkout sạch, kết quả baseline và sau mỗi mốc, cách áp migration/seed nội bộ, bằng chứng trang danh mục đọc từ API/DB trong Compose, các màn còn dùng fixture và cách quay về FE baseline. Nếu baseline hoặc Docker không chạy, ghi lệnh/lỗi thực tế và phần đã hoàn tất; không đánh dấu test đã qua khi chưa chạy. Không mở thêm vòng gửi từng file.
