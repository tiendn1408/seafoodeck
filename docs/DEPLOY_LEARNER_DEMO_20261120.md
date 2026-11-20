# Demo học viên — 20/11/2026

Phạm vi chốt theo người dùng: tài khoản học viên → đổi mật khẩu lần đầu → bốn chế độ học → tổng kết → ôn và tiến độ lưu server. Quản trị có màn Người dùng để tạo/khóa/reset tài khoản. Không gọi đây là hoàn thành toàn bộ phase 2.5c: manager xem nhóm và bulk CSV ở giao diện chưa có. Bộ mẫu và media/HS chưa được khách duyệt vẫn là nội bộ.

Hai image amd64 cùng tag `learner-demo-20261120-r1`:

```env
API_IMAGE_REF=ghcr.io/tiendn1408/seafoodeck-api@sha256:aea7ab9d00ad115aa621db45a7f7ca459e096d325b91cfd403c372b1356f56e0
WEB_IMAGE_REF=ghcr.io/tiendn1408/seafoodeck-web@sha256:16597286ae414f4b408d958642c3bbda45015c8cf40cc87d8ceb0361ec344bf9
```

Đã kiểm source `1692138`: web 328 + API 371 + scripts 23 test; build/typecheck/lint/format/contract pass. Chính hai image release mới đạt 25 E2E trên desktop/mobile, 3 ca bỏ qua viewport theo thiết kế. Stack cô lập DB trống kiểm đủ migrations, seed thử 1000 mục; live DB kiểm đăng nhập khác hoa thường, khóa thu hồi phiên, reset buộc đổi, bulk dry-run và màn users 390/1280. QA và seed chỉ chạy local, không seed VPS.

## Cập nhật VPS đã có app

Chạy bằng user sở hữu repo/env và có quyền Docker, ở `/opt/seafoodeck-pilot`. Xác nhận Git không có sửa đổi riêng trước khi `git pull --ff-only origin main`. Không dùng thư mục bot trading. Không dùng image r1/r2 ngày 19 cho frontend tài khoản mới.

```sh
cd /opt/seafoodeck-pilot
git pull --ff-only origin main
sh scripts/deploy-learner-demo-20261120.sh --check
sh scripts/deploy-learner-demo-20261120.sh --apply
```

Script pull trước downtime; kiểm username trùng khác hoa thường; lưu cấu hình/SQL/private objects và inventory trong `.local/deploy-backups/`; dừng riêng API khi snapshot và migration; giữ nguyên catalogue/release/media; chạy migration cộng thêm 2.5a và username CI; lên API trước, web sau; kiểm health nội bộ và domain HTTPS đúng release. Không dùng `reset`, `down -v`, không xóa dữ liệu hay cập nhật bot trading. `.local/` ignored, không commit hoặc gửi backup/credentials.

Nếu lỗi, script phục hồi env và image ứng dụng cũ; schema cộng thêm vẫn giữ để điều tra, không tự restore DB đang chạy. Đường backup gần nhất ở `.local/latest-learner-backup.txt`; phục hồi DB/object phải dùng cặp snapshot cùng thời điểm trên stack cô lập. Không chạy `rebuild:progress` khi API còn bật. Tiến độ trình duyệt của trial cũ không tự chuyển thành tài khoản. Chỉ một API container (khóa tiến độ trong tiến trình).

## Kiểm sau nâng cấp

- `/api/v1/health`: `release=learner-demo-20261120-r1`.
- Trang gốc: tài khoản/mật khẩu; học thử bằng mã mời vẫn tồn tại, không thay mã cũ.
- `/#admin/users`: tạo học viên, mật khẩu tạm chỉ hiện một lần, tài khoản buộc đổi nếu chọn chế độ này.
- Học viên đổi mật khẩu → trang chủ → Flashcard/Ghép tên/Đoán hình/HS → tổng kết → Ôn tập/Tiến độ. Đăng xuất rồi đăng nhập lại phải giữ tiến độ server.
- Manager chưa có bảng theo dõi; không trình bày luồng đó với khách.

Không đưa mật khẩu vào chat/repo/log, không tự duyệt tài sản để vượt cổng public. Giao diện hiện thông báo nội dung nội bộ nếu bộ đang dùng chưa duyệt.

## Biên bản chạy thực tế trên VPS

Đã merge PR #2 vào main tại `0237035`; [CI đúng đầu PR đạt](https://github.com/tiendn1408/seafoodeck/actions/runs/44714536010). Ngày 20/11/2026 đã nâng `/opt/seafoodeck-pilot` trên `42.96.20.66` bằng script ở trên. API/web/DB/storage đều healthy, HTTPS health trả `learner-demo-20261120-r1`, đúng hai digest trong báo cáo. Không thay container bot trading (đã so ID/image trước và sau).

Backup riêng tư: `.local/deploy-backups/before-learner-20261120T100024Z`, gồm env/IAM/Compose/SQL và **282 object** + manifest hash. Hai migration `202611190001_learner_accounts`, `202611200001_username_ci` hoàn tất. So trước/sau: **96 Item, 96 Revision, 94 MediaAsset**, release nội bộ `a6d156c4-02ac-45a8-83ae-9ad5b9f19599` giữ nguyên. Không seed, không publish lại, không tự duyệt nội dung.

Browser thật qua domain HTTPS ở 390px: đổi mật khẩu lần đầu → Flashcard 3 tự đánh giá → Ghép tên 3 cặp → HS 3 câu → tổng kết, 9 mục ôn. Sau đăng xuất, xóa cookies/storage và đăng nhập lại, server vẫn trả đúng 3 tự đánh giá và 6 câu chấm tự động. Thư viện và trang chủ có ảnh tải thật qua S3; không cuộn ngang. Hai học viên QA tạm và dữ liệu thử riêng của họ đã xóa sau kiểm; audit giữ nguyên.

**Giới hạn dữ liệu VPS:** cả 94 media hiện là `profile`, draft, chưa có media `identification`; Đoán hình trả thông báo chưa đủ ba ảnh gốc hợp lệ, không dùng profile để giả hoàn thành chế độ. Bộ 96 mục đang là dữ liệu tham khảo, có cả tôm, chưa phải danh mục khách đã chốt. Lượt này chỉ nâng flow học viên và giữ nguyên dữ liệu hiện hữu theo phạm vi đã chốt; không coi đây là duyệt public.

Đã tạo tài khoản trống `demo-hoc-vien`, vai trò student, mật khẩu tạm buộc đổi lần đầu. Credential ở **file 600 chỉ trên VPS** `/opt/seafoodeck-pilot/.local/demo-hoc-vien-20261120.json`, không ghi trong Git/chat/log. Chủ dự án đọc file riêng tại Terminal VPS, đăng nhập rồi tự đặt mật khẩu mới. Thông tin quản trị và mã mời cũ được giữ nguyên. Dữ liệu học của học thử không tự chuyển vào tài khoản.
