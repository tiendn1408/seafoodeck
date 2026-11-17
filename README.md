# Seafood Deck — demo nghiệp vụ thủy hải sản 0.5.1

App cho người mới vào ngành và nhân viên kinh doanh quốc tế: liên kết tên Việt–Anh–Nhật–khoa học, nhận diện nguyên liệu và đọc dạng hàng. Bộ mẫu 6 loài thuộc cá, mực/bạch tuộc, nghêu/vẹm; **không phải catalogue khách xác nhận**. Bộ tôm trước đây chỉ còn là fixtures kiểm thử/lịch sử, không nằm trong hành trình khách hoặc tài sản runtime của bản này.

## Bản chạy và Docker

GHCR: `ghcr.io/tiendn1408/seafoodeck:flat-illustrations-20261117`, Linux amd64. Chạy local:

```sh
docker run -d --name seafoodeck-trade --restart unless-stopped -e SITE_ADDRESS=:80 -p 127.0.0.1:18087:80 ghcr.io/tiendn1408/seafoodeck:flat-illustrations-20261117
```

Mở http://127.0.0.1:18087. [Báo cáo 0.5.1](docs/DELIVERY_0.5.1.md) ghi digest, kết quả kiểm thật, tài sản/phần còn thiếu và lệnh cập nhật/rollback VPS. [Hướng dẫn GHCR/VPS](docs/DEPLOY_GHCR.md) giữ luồng chạy tay, không CI/CD. Agent không deploy VPS.

Build từ source:

```sh
docker build --platform linux/amd64 -t seafoodeck:flat-illustrations-20261117 .
```

## Cách thử

- **Trang học:** chọn loài học tên, hướng ghép tên; mở một trong bốn chế độ. Có lối tiếp tục phiên đang dở. Header dẫn riêng sang Thư viện/Ôn tập/Tiến độ.
- **Flashcard:** 3 thẻ Anh/Nhật/khoa học của loài chọn. Lật, tự đánh giá; tự đánh giá không cộng vào tỷ lệ chấm tự động. Thư viện có thể mở từng loài hoặc lượt đầy đủ gồm thẻ + ghép + hai hồ sơ HS mẫu.
- **Ghép tên:** 3 cặp từ bộ 6 loài, có loài đang chọn; thay đổi hướng Việt–Anh/Nhật/khoa học. Không bắt kéo thả; Tab/Enter dùng được.
- **Đoán hình:** 3 ảnh thật khác ảnh gốc, từ các loài có ảnh hợp lệ. Hiện chạy ứng viên **nội bộ, chưa duyệt nhận diện**; ảnh AI không thuộc bộ câu hỏi. Trước nộp không có tên file/caption/alt chứa đáp án. Ảnh lỗi có thử lại/bỏ qua, không tính đã trả lời hoặc sai; có lượt thử lại câu bỏ qua.
- **HS theo dạng hàng:** 3 hồ sơ cá ngừ vây vàng — nguyên con, thiếu thông tin dạng hàng, phi lê. Đối chiếu mã **6 số** của nguồn HS 2022; mã thuộc dạng hàng/danh mục, không phải mã cố định của loài và không dùng như kết luận khai báo thực tế.
- **Thư viện:** lọc nhóm, tìm theo 4 loại tên, xem đặc điểm/ghi chú thương mại/dạng hàng ví dụ và nguồn theo từng tên/ảnh. Tên Việt có phần diễn giải được ghi rõ; không tự chuẩn hóa tên khách chưa gửi.

Reload giữ câu/lựa chọn/thứ tự/lần nộp; nộp kép không cộng thêm hoặc chạm xuyên tự chuyển câu. Tổng kết tách lần đầu/làm lại/tự đánh giá. Lịch ôn tách kỹ năng; làm lại trong một phiên không tăng bậc.

## Dữ liệu và tài sản

- `apps/web/src/data/customer.ts`: 6 loài, 24 tên gọi có tham chiếu nguồn, 3 bài HS mới, version `seafood-trade-demo-1`. Nhóm thịt trắng/đỏ là thuộc tính thương mại, tách khỏi định danh.
- `apps/web/src/data/customerMedia.ts`, `apps/web/public/media/customer/`: 5 ảnh thật ứng viên với nguồn/quyền, hash, ID ảnh gốc; 0 ảnh duyệt nhận diện. Ảnh mực còn thiếu.
- `apps/web/public/media/illustrations/`: 3 minh họa 2D nền alpha riêng cho trang học, thư viện và ôn tập. Nền do CSS quản lý, không cần gen lại khi đổi màu nền. Không gán loài hoặc đưa vào allowlist nhận diện. Hồ sơ AI giữ nội bộ, không caption trên UI. [Prompt/metadata](docs/sources/customer-demo/illustrations-v2.json).
- [Hồ sơ nguồn](docs/sources/customer-demo/README.md), [18 mục phát âm](docs/sources/customer-demo/pronunciation.csv): 0 audio, 6 hướng dẫn Nhật nháp, 12 mục Anh/khoa học thiếu phiên âm/hướng dẫn; 0 được duyệt. Không giả clip hoặc dùng mạng/TTS lúc chơi.
- `apps/web/src/domain/packState.ts`: lưu lịch sử cũ nhưng không tính vào bộ mới; session cũ có thông báo đổi nội dung. Không đổi ID loài để gán lại tiến độ.
- `apps/web/src/data/demo.ts`, `apps/web/src/data/imageMedia.ts`, `test-fixtures/legacy-shrimp/`: fixtures lịch sử phục vụ test; không import vào app. Ảnh cũ đã chuyển khỏi `apps/web/public/`.
- `apps/web/src/data/public.ts`: public pack độc lập vẫn rỗng và đóng; kiểm nguồn không tự đồng nghĩa được duyệt. Không giả reviewer/ngày duyệt.

Hình/âm thanh/font phục vụ từ file đóng gói; không phụ thuộc API ngoài khi học. Nguồn ngoài là liên kết người học chủ động mở sau khi xem lời giải/nguồn, không phải fallback media.

## Chạy source và kiểm tra

Node 24, npm, dependency khóa trong package-lock.json:

```sh
npm ci
npm run dev
npm test
npm run typecheck
npm run lint
npm run build
npm run format:check
npx playwright install chromium
npm run test:e2e
```

E2E mặc định mở Vite riêng tại 127.0.0.1:43217. Kiểm chính container:

```sh
PLAYWRIGHT_BASE_URL=http://127.0.0.1:18087 npm run test:e2e
```

Kiểm mobile gồm 320×568, 360×640, 390×740, cả 18 flashcard và các trạng thái; hồ sơ/HS/tổng kết có thể cuộn để đọc. Có kiểm bản sắc ngành khi chặn toàn bộ ảnh, ảnh lỗi, storage lỗi, phiên cũ, nộp kép và ôn lỗi. Không coi mô phỏng viewport là thử điện thoại thật.

## Quy ước làm việc

[Kế hoạch đã chốt](docs/PLAN_CUSTOMER_DEMO.md), [PRD](docs/Seafood_Deck_PRD.md), [prompt hiện hành](docs/Seafood_Deck_AI_Build_Prompt.md). Áp dụng frontend-design, web-design-guidelines và imagegen cho nhận diện/minh họa; không emoji.

[Inbox/outbox](docs/FILE_HANDOFF.md) chỉ dùng giao nhận. Xử lý xong thì lưu trữ phần cần giữ, xóa phần thừa và để trống hàng chờ; không tạo outbox chỉ để lặp báo cáo chat. Không quét/phục vụ inbox/outbox/archive trong runtime hoặc Docker.

## Monorepo

Frontend đã chuyển sang `apps/web` bằng npm workspaces. Các lệnh `npm ci`, `npm test`, `npm run build`, `npm run dev`, `npm run test:e2e` vẫn chạy từ root. Docker context là root; Dockerfile FE ở `apps/web/Dockerfile` (root Dockerfile giữ tương thích lệnh cũ). Storage key `seafood-deck:state:v1` và hash routes giữ nguyên tại mốc dời FE.
