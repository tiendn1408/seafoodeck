# Phase 2.5b: web học viên chạy trên tài khoản

Ngày 20/11/2026. Branch `feat/learner-web-25b` (gốc `feat/pilot-monorepo`). Trình duyệt chuyển sang dùng tài khoản học viên và tiến độ phía server của 2.5a. Chưa build image, chưa push GHCR, chưa deploy VPS.

> **Lưu ý nâng cấp:** web mới chỉ chạy đúng với API của **cùng bản này**: API 2.5a trở lên (có migration `202611190001_learner_accounts`) cộng các sửa API trong 2.5b, ví dụ `POST /auth/login` trả `userId`, `displayName`, `mustChangePassword`. Nâng cấp web và API cùng lúc, cùng một tag. 2.5b không thêm migration, nhưng VPS đang chạy r1/r2 sẽ chạy migration của 2.5a lúc nâng cấp. Vì vậy cần sao lưu DB trước, theo [DELIVERY_25A.md](DELIVERY_25A.md):
>
> ```sh
> sudo env PILOT_COMPOSE_FILE=deploy/compose.pilot.ghcr.yaml sh scripts/backup-pilot.sh _backups/before-25b
> ```
>
> Học thử bằng mã mời (`LEARNER_INVITE_CODE`) vẫn chạy sau nâng cấp. Người đang dùng mã mời không cần làm gì thêm.

## Đã làm

- **Đăng nhập hai luồng.** Màn mặc định là form tài khoản (Tên đăng nhập, Mật khẩu, nút "Đăng nhập"). Nút "Học thử bằng mã mời" mở form mã mời ("Vào bộ học"); nút "Có tài khoản? Đăng nhập" quay lại. Lỗi 401 luôn hiện câu chung, không gợi ý phần nào sai. Quản trị vẫn đăng nhập ở `#admin`.
- **Đổi mật khẩu bắt buộc.** Tài khoản có `mustChangePassword` chỉ thấy màn "Đổi mật khẩu" (và nút Đăng xuất). Mọi route hash khác vẫn hiện màn này. Đổi xong thì vào Trang chủ bình thường.
- **Giao diện theo vai trò.** Học viên tài khoản có bốn tab: Học, Thư viện, Ôn tập, Tiến độ. Header có thêm mục Tài khoản: desktop hiện tên hiển thị, điện thoại hiện biểu tượng. Học thử chỉ có Học và Thư viện. Manager chỉ thấy thông báo và Thư viện. Route không được phép quay về `#home`.
- **Trang Tài khoản:** tên đăng nhập, sửa tên hiển thị, đổi mật khẩu, đăng xuất.
- **Các màn lấy số liệu từ `/me/*`** cho học viên tài khoản:
  - Trang chủ: mẻ lưới, Thả lưới, phiên dở dang, bốn kỹ năng, lấy từ `/me/home`.
  - Ôn tập: `/me/review`.
  - Tiến độ và Thành tích: `/me/progress` và `/me/mastery`.
  - Mức nhớ ở Thư viện: `/me/mastery`.
- **Học thử bằng mã mời:** Trang chủ rút gọn (chọn loài và chế độ, thẻ "Đăng nhập để lưu tiến độ"), không có Thả lưới, dây phao hay kỹ năng. Học thử không gọi `/me/*`.
- **Bỏ sổ tiến độ cục bộ.** Trình duyệt không còn lưu hay tự tính tiến độ trong `localStorage`; mã ledger, haul và sessions cũ đã xóa. Trình duyệt chỉ giữ những thứ tạm, được phép mất: mã phiên đang học của tab học thử hoặc nhân sự (sessionStorage), bản nháp và khóa idempotency của câu đang làm, lựa chọn giao diện sáng/tối (localStorage).
- **Phía API trong 2.5b:**
  - Bộ giới hạn đăng nhập giữ chỗ trước khi kiểm và hoàn chỗ khi đăng nhập thành công: 20 lần / 10 phút / IP và 10 lần / tên đăng nhập. Đăng nhập thành công không tốn hạn mức.
  - `afterSubmit` bỏ qua dòng tiến độ cũ.
  - Phiên dở dang chỉ đề xuất trong release hiện hành.
  - Lỗi xung đột trả `code: 'BUSY'`.
  - `POST /auth/login` trả cùng các trường hồ sơ như `GET /auth/me`.
- **Sửa nhỏ:** nút "Luyện ghép tên" ở trạng thái "Mẻ hôm nay đã xong" bị khóa cho tới khi danh mục tải xong, để không mở lượt với loài rỗng.

## Ghi chú thiết kế

- **Tổng kết lượt học.** Màn tổng kết dựng từ các kết quả server đã trả về trong phiên, kể cả `progress` của từng câu. Trang chỉ gọi `GET /learning/sessions/:id/summary` khi học viên mở lại phiên sau khi tải lại trang, trong cùng phiên đăng nhập, vì các kết quả khôi phục không mang `progress`. Học thử và nhân sự không gọi route này. Phiên học gắn với phiên đăng nhập: đăng nhập lại thì không mở lại phiên cũ (trả lời mục 4 trong các câu hỏi tồn đọng).
- **Hàng đợi tự đánh giá chạy nền.** Thẻ Flashcard (Đã nhớ / Chưa nhớ) hiện kết quả ngay ("Đã ghi tự đánh giá") và được gửi nền, mỗi câu một lần, theo thứ tự, luôn với cùng khóa idempotency. Khi server xác nhận, trang hiện "Đã lưu tự đánh giá".
  - Lỗi mạng, 5xx và 409 BUSY: gửi lại sau 1, 2, 4, 8, 15 giây. Hết lượt thì hiện "Chưa lưu được … thẻ tự đánh giá" kèm nút "Thử gửi lại".
  - Mất mạng: thẻ lỗi vì mạng tự gửi lại khi trình duyệt có mạng (sự kiện `online`).
  - Khi còn thẻ chưa lưu, đóng tab sẽ có cảnh báo, và màn tổng kết hiện "Đang lưu…" cho tới khi mọi câu được xác nhận.
  - **Đăng xuất bỏ các thẻ đang chờ lưu**: hàng đợi dừng hẳn, không gửi tiếp.
  - Câu chấm tự động (Ghép tên, Đoán hình, HS) không đi qua hàng đợi: trang chờ server chấm rồi mới hiện kết quả.
- **Quy tắc 409.** Chỉ 409 có `code: 'BUSY'` (xung đột tuần tự hóa tạm thời, "Hệ thống đang bận, vui lòng thử lại.") được thử lại. Mọi 409 khác là kết quả cuối. Ví dụ: câu đã có câu trả lời, hoặc cùng khóa nhưng nội dung khác. Khi đó trang lấy kết quả server đang giữ thay cho kết quả tạm.

## Kiểm tra

- `npm test`:
  - web 278/278 (33 file)
  - API 328/328
  - scripts 23/23
- `typecheck`, `lint` (0 lỗi, còn 1 cảnh báo cũ ở `Admin.tsx`), `format:check`, `build`, `contract:generate` đều đạt.
- `npm run test:e2e` trên stack Docker local (dựng lại bằng `docker compose --env-file .local/pilot.env up -d --build`): **25 đạt, 3 bỏ qua theo thiết kế** (ba ca khung hình điện thoại chỉ chạy ở project mobile), 0 lỗi, trên 28 ca của hai project desktop và mobile. Trước đây là 19 đạt và 3 bỏ qua. Thay đổi:
  - Bỏ 2 ca × 2 project về sổ cục bộ (dữ liệu hỏng, storage bị chặn).
  - Thêm 1 ca thay thế "blocked localStorage does not block the learning session".
  - Thêm 4 ca mới: học thử bằng mã mời; tiến độ còn sau khi xóa storage và đăng nhập lại; tài khoản phải đổi mật khẩu; đăng xuất rồi đăng nhập học viên khác không thấy số liệu người trước.
  - Các ca cũ (bốn chế độ, tải lại, bấm đúp, ghép bằng bàn phím, bỏ qua ảnh, HS, ôn tập, Thả lưới, ảnh hồ sơ, bố cục, quản trị) giữ nguyên độ phủ. Riêng phần kiểm sổ cục bộ được thay bằng kiểm `GET /me/progress` và `GET /me/review`.
- Kiểm trực quan bằng Playwright ở 390×844 và 1280×800 (không trang nào cuộn ngang). Các điểm cần xem tiếp được ghi trong báo cáo task 10, chưa sửa trong lượt này.

### Chạy E2E

```sh
docker compose --env-file .local/pilot.env up -d --build
node scripts/wait-pilot.mjs
npm run test:e2e
```

- Chỉ chạy với stack local. E2E từ chối origin không phải 127.0.0.1, localhost hay ::1, vì nó tạo người dùng QA.
- Mỗi project (desktop, mobile) tạo 4 học viên `qa-e2e-<thời điểm>-{student,second,persist,must}` qua API quản trị. Mật khẩu ngẫu nhiên, không in ra. Các tài khoản này **ở lại trong DB local**.
- Ca quản trị đăng một release nội bộ thử rồi rollback, như trước.
- Đăng nhập thành công không tốn hạn mức giới hạn. Nếu gặp 429 sau nhiều lần đăng nhập sai, chỉ khởi động lại API của repo này: `docker compose --env-file .local/pilot.env restart api`, rồi `node scripts/wait-pilot.mjs`.

## Chưa làm

- Chưa có màn cho manager (xem tiến độ nhóm). Manager đăng nhập chỉ thấy thông báo và Thư viện.
- Chưa có màn "Người dùng" trong trang quản trị (tạo, khóa, đặt lại mật khẩu). Tạo tài khoản vẫn chỉ qua `POST /api/v1/admin/users`.
- Chưa tạo tài khoản demo An.
- Chưa nhập tiến độ cũ từ trình duyệt lên server. Tiến độ cũ trong `localStorage` của người dùng mã mời không được chuyển.
- Chưa nâng cấp VPS, chưa build hay push image.
