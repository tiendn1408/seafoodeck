# Bàn giao Docker Seafood Deck 0.2.0 — bốn chế độ

**App chính đã có đủ bốn chế độ, có thể trình diễn bản nội bộ cho khách.** Ba loài hiện có, không có prototype riêng hoặc vòng gửi bên thiết kế. Không deploy hoặc thay cấu hình VPS/DNS. Nội dung học vẫn là nháp; đây không phải xác nhận public/pilot đạt chuẩn.

## Bản chạy bàn giao

Luồng phân phối mới qua **GHCR → VPS**, không cần chuyển image tar nếu publish thành công: xem [DEPLOY_GHCR.md](DEPLOY_GHCR.md). Image tar dưới đây vẫn là bản dự phòng local; trạng thái push thực tế ghi riêng trong tài liệu GHCR.

- Image: `seafoodeck:demo-4modes-20261117`, **linux/amd64**.
- Image ID đã chạy: `sha256:32fa5f488840f67b429a10eb2594dcb866348283c87e9661272012f08c732224`.
- Container đang mở: `seafoodeck-demo-4modes`, http://127.0.0.1:18083.
- Docker image export: `seafoodeck-demo-4modes-20261117-linux-amd64.tar` ở gốc repo (Docker image, không phải ZIP source).
- Docker export đã đối chiếu manifest với đúng image ID; 72,070,656 byte; SHA-256 `b8dfb7a7cd035f44d655e51313136bda0026a4353884104703879ec265681d32`.
- Repo hiện không có `.git`, nên **không có commit hash**; không tự tạo commit hoặc khai báo commit giả. Định danh bản bàn giao bằng image tag + ID trên.
- Footer app và OCI label chứa release tag. Container healthcheck healthy; chỉ dist, ba JPEG và NOTICE về quyền được phục vụ, không có inbox/outbox/archive.

Trên máy khác/VPS x86_64, sau khi chuyển file image tar:

```sh
docker load -i seafoodeck-demo-4modes-20261117-linux-amd64.tar
docker run -d --platform linux/amd64 --name seafoodeck-demo-4modes --restart unless-stopped -e SITE_ADDRESS=:80 -p 127.0.0.1:18083:80 seafoodeck:demo-4modes-20261117
```

Nếu đang dùng chính máy bàn giao, container đã chạy; chỉ mở URL, không chạy thêm lệnh trùng tên/cổng. localhost chỉ truy cập trên máy chạy Docker. Để chuyển image qua SSH thủ công:

```sh
scp seafoodeck-demo-4modes-20261117-linux-amd64.tar USER@VPS_IP:/tmp/
ssh USER@VPS_IP
sudo docker load -i /tmp/seafoodeck-demo-4modes-20261117-linux-amd64.tar
```

Nếu VPS đã có proxy: chạy origin loopback bằng lệnh trên rồi route `seafoodeck.tiendn.io.vn` tới 127.0.0.1:18083 từ proxy host. Nếu 80/443 trống và muốn container tự quản HTTPS:

```sh
sudo docker run -d --name seafoodeck-domain --restart unless-stopped -e SITE_ADDRESS=seafoodeck.tiendn.io.vn -p 80:80 -p 443:443 -p 443:443/udp -v seafoodeck_caddy_data:/data -v seafoodeck_caddy_config:/config seafoodeck:demo-4modes-20261117
```

Chỉ thực hiện nhánh domain khi chủ server chủ động triển khai, DNS A đã trỏ đúng IP và port 80/443 trống/mở. Không chạy origin và domain đồng thời nếu không cần hai bản. Giữ volume chứng chỉ. Hướng dẫn DNS và trường hợp có proxy: [DEPLOY_VPS.md](DEPLOY_VPS.md). Nếu cần build source cho VPS ARM, build native thay vì load image amd64.

## Kết quả đã thực hiện

`npm run typecheck`, `npm run lint`, `npm test`: thành công, **53 test logic**. `npm run build`: thành công ở máy và trong Docker. Build Docker linux/amd64 thành công.

`PLAYWRIGHT_BASE_URL=http://127.0.0.1:18083 npm run test:e2e`: **18/18 pass trên chính container có image ID trên**, gồm 9 ca mobile Chromium giả lập iPhone 13 và 9 ca desktop. Đây không phải chỉ kiểm dev server. Healthcheck healthy, ba file ảnh trong runtime có SHA-256 khớp inbox/metadata.

| Chế độ        | Kết quả thực tế trên container/mobile                                                                                                                                                                                                                                    |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Flashcard     | Chạy ba thẻ ở mỗi loài, tổng 9 thẻ; lật/tự đánh giá/tổng kết. Bấm đủ 9 nút audio theo loài–ngôn ngữ đều báo thiếu bản thu. Không phát giả. Tự đánh giá không cộng vào độ chính xác tự động.                                                                              |
| Ghép tên      | Hoàn tất bàn Việt–Anh 3 cặp, có lần ghép sai và sửa, reload giữa bàn giữ cặp đúng; ôn lỗi cùng session không tăng bậc. Có kiểm bàn Việt–Nhật bằng bàn phím. Việt–khoa học được kiểm dựng bàn không mơ hồ ở unit test; không tuyên bố đã đi riêng toàn bàn này trong E2E. |
| HS            | Đi hết A (.11), B (thiếu dữ kiện, bắt buộc bước hỏi đầu), C (nguyên đầu, .19 nháp). Nộp kép không nhân lượt; reload B giữ hai lựa chọn; tổng kết đúng 3/3.                                                                                                               |
| Đoán hình     | Hoàn tất 3 câu với 3 JPEG đóng gói, cố ý sai một câu rồi ôn đúng. Reload giữ thứ tự/lựa chọn, nộp kép chỉ một kết quả. Alt và URL ảnh trung tính trước nộp; tên/credit/nguồn chỉ hiện sau nộp. Không phát sinh request ngoài origin trong ca kiểm.                       |
| Thiếu/lỗi ảnh | Chặn cả 3 URL ảnh: các nút chấm bị khóa, có thử lại/bỏ qua; tổng kết 0 đã trả lời, 3 bỏ qua, không hiện tỷ lệ, không tạo review/sai. Có nút thử lại câu bỏ qua riêng.                                                                                                    |
| Lưu tiến độ   | Phiên cũ schema v1 vẫn được đọc. Kiểm nộp trùng, dữ liệu hỏng, storage bị chặn, ôn đến hạn chỉ tăng đúng kỹ năng; lịch ôn không cộng chéo.                                                                                                                               |

Đã chạy thêm từng ảnh m001/m005/m003 ở cả 320px và 390px trên chính container (6 lượt xem ảnh, không tràn ngang), và xem ảnh chụp mobile của cả ba câu: dùng contain để giữ cơ thể. Tôm thẻ USDA có hạt/độ mềm và phản chiếu, Tôm càng xanh có nền bể phức tạp; không ra câu yêu cầu đếm răng chủy hoặc suy loài chỉ từ nền/màu. Chưa thử iPhone/Android thật, chưa xác nhận độ chính xác phân loại của chuyên gia, chưa kiểm DNS/TLS trên VPS.

## Ảnh và hồ sơ quyền

**3 ảnh đã tích hợp, 0 ảnh được dự án duyệt nhận diện.** App ghi rõ demo nội bộ/ảnh ứng viên. Ảnh nguyên byte được copy từ inbox vào runtime; không chỉnh sửa hình, không tạo ảnh AI hoặc phái sinh. Không đọc inbox khi chạy.

| Asset | Loài đề xuất  | Runtime                 | Credit / quyền                                                                 | Trạng thái                  |
| ----- | ------------- | ----------------------- | ------------------------------------------------------------------------------ | --------------------------- |
| m001  | Tôm sú        | /media/demo/m001-v1.jpg | Almandine; Epipelagic sửa bỏ thước ở nguồn Commons · CC BY-SA 3.0              | draft, chưa duyệt nhận diện |
| m005  | Tôm thẻ       | /media/demo/m005-v1.jpg | USDA ARS K3507-12 · nguồn ghi public domain tại Hoa Kỳ, chưa kết luận toàn cầu | draft, chưa duyệt nhận diện |
| m003  | Tôm càng xanh | /media/demo/m003-v1.jpg | Citron / CC-BY-SA-3.0                                                          | draft, chưa duyệt nhận diện |

Nguồn, link giấy phép, SHA-256, liên kết loài và giải thích: `src/data/imageMedia.ts`. Credit đầy đủ ngoại tuyến: `public/media/demo/NOTICE.txt` và được đóng gói trong image. FDA/ảnh TSV không có trong bộ chơi hoặc fallback. Bộ public vẫn rỗng, `PUBLIC_CONTENT_ENABLED=false`; ảnh AI bị chặn khỏi nhận diện, draft chỉ được preview qua nhánh demo riêng.

## Kiểm kê đầy đủ 9 mục phát âm

Đã tìm file nghe trong repo/inbox (ngoài node_modules): **0 file thực tế, 0 file được duyệt**. Không có asset hợp lệ để tích hợp/phát từ build. Kiểm container đã xác nhận nút nghe hiển thị thiếu; test player kiểm trạng thái/rate/một clip bằng mock, không thay thế nghiệm thu bản thu thật.

| Loài          | Mục                                  | File thật | Phiên âm/hướng dẫn hiện có                                             | Duyệt |
| ------------- | ------------------------------------ | --------- | ---------------------------------------------------------------------- | ----- |
| Tôm sú        | Anh — Black tiger shrimp             | Thiếu     | /blæk ˈtaɪɡɚ ʃrɪmp/ — nháp                                             | Chưa  |
| Tôm sú        | Nhật — ウシエビ                      | Thiếu     | うしえび · ushiebi — nháp                                              | Chưa  |
| Tôm sú        | Khoa học — Penaeus monodon           | Thiếu     | Pe-nae-us · mo-no-don — tách âm nháp, chưa khớp bản thu/trọng âm duyệt | Chưa  |
| Tôm thẻ       | Anh — Whiteleg shrimp                | Thiếu     | Thiếu IPA                                                              | Chưa  |
| Tôm thẻ       | Nhật — バナメイエビ                  | Thiếu     | Thiếu kana/romaji trong trường pronunciation; tên còn là fixture       | Chưa  |
| Tôm thẻ       | Khoa học — Penaeus vannamei          | Thiếu     | Thiếu hướng dẫn đọc                                                    | Chưa  |
| Tôm càng xanh | Anh — Giant river prawn              | Thiếu     | Thiếu IPA                                                              | Chưa  |
| Tôm càng xanh | Nhật — オニテナガエビ                | Thiếu     | Thiếu kana/romaji trong trường pronunciation; tên còn là fixture       | Chưa  |
| Tôm càng xanh | Khoa học — Macrobrachium rosenbergii | Thiếu     | Thiếu hướng dẫn đọc                                                    | Chưa  |

Tổng: **3/9 phiên âm/hướng dẫn nháp có thật trong dữ liệu, 6/9 thiếu, 0/9 đã duyệt**. Không thêm phiên âm suy đoán hoặc TTS chỉ để tăng số hoàn thành. Player hiện có 1×/0.75× và lỗi/thiếu; lượt này sửa để các nút thiếu không mất trạng thái khi bấm sang nút khác.

## HS và cổng public

- A/B giữ fixture gốc và ID/tham chiếu cũ: headRemoved true / unknown, mã chuỗi giữ 0 đầu và cấp 8 số. Không thay unknown thành false.
- C là bài nháp mới, headRemoved false; cùng Tôm sú, đổi quy cách đầu. Dùng tham chiếu mới `vn-2022-head-on-draft`, không ghi đè tham chiếu fixture cũ.
- Đã đọc nguồn Công báo [NĐ 115/2022, số 269+270](https://congbao.cdnchinhphu.vn/CongBaoCP/CongBao/2023/2/38712/43398-1-269-270.pdf), trang in 85–86: nhánh đông lạnh/0306.17/Tôm sú, .11 đã bỏ đầu và .19 loại khác. Đối chiếu từ text PDF; công cụ screenshot PDF thất bại cache miss nên không tuyên bố kiểm bảng bằng screenshot. Nguồn này là đối chiếu lịch sử bổ sung, không phải xác nhận danh mục hiện hành hay tư vấn lô hàng.
- **3 bài demo, 0 bài HS duyệt public.** Chưa có người duyệt nghiệp vụ, chưa hoàn tất đối chiếu hiệu lực hiện hành/nguồn TT31 cho bộ chính thức. Không đưa mã mới vào public.

Còn chặn phát hành nội dung public: duyệt loài/tên/ảnh và quyền theo mục đích; 9 bản thu thật, 6 phiên âm còn thiếu và duyệt cả 9 cặp audio–text; duyệt HS/phiên bản và lời giải; QA thiết bị thật. Những thiếu hụt này không chặn chạy demo nội bộ bốn chế độ hiện tại. Không có yêu cầu chuyển tiếp file cho bên khác trong lần bàn giao này.
