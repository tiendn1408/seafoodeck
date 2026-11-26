# Phase 2.5a: tài khoản học viên và tiến độ phía server

Ngày 20/11/2026. Branch `feat/learner-accounts-25a` (gốc `feat/pilot-monorepo`). Chỉ thay đổi phía API; trình duyệt chưa đổi hành vi. Chưa build image, chưa push GHCR, chưa deploy VPS.

> **Lưu ý nâng cấp:** đây là migration đầu tiên kể từ r1/r2 (`202611190001_learner_accounts`). Sao lưu DB trước khi nâng cấp VPS, ví dụ:
>
> ```sh
> sudo env PILOT_COMPOSE_FILE=deploy/compose.pilot.ghcr.yaml sh scripts/backup-pilot.sh _backups/before-25a
> ```

## Đã làm

- Schema và migration: bảng nhật ký lượt làm `LearningAttempt` (mỗi câu, mỗi cặp ghép là một dòng) và `ReviewProgress` (lịch ôn theo người dùng × mục × kỹ năng); `User` có thêm `displayName`, `mustChangePassword`, `lastLoginAt`.
- Vai trò tài khoản mới `student` và `manager` (quản trị tạo qua `POST /admin/users`). Mật khẩu tối thiểu 8 ký tự cho student, 16 cho các vai trò khác. Học viên mã mời (`learner`) vẫn chạy như cũ, không có tiến độ phía server.
- Nhật ký và lịch ôn được ghi **trong cùng giao dịch Serializable** với lượt chấm, chỉ cho `student`. Câu bỏ qua được ghi nhật ký nhưng không đổi lịch ôn hay mức nhớ. Lịch ôn 1/3/7/14 ngày, logic chuyển từ web sang API với bộ vector đối chiếu chung.
- Dấu vân tay nội dung (tên vi/en/ja/khoa học, hồ sơ HS): xuất bản release mới có cùng nội dung **không** reset tiến độ; nội dung đổi thì mục đó tính lại từ đầu.
- Ôn tập do server chọn: student gửi `mode: review` thì server lấy các mục đến hạn; danh sách `reviewTargets` do client gửi bị bỏ qua. Không có mục đến hạn thì trả 400 "Chưa có mục nào đến hạn ôn.".
- Đổi mật khẩu bắt buộc: tài khoản `mustChangePassword` chỉ dùng được `GET /me`, `GET /auth/me`, `POST /me/password`, đăng xuất; mọi route khác trả 403 mã `MUST_CHANGE_PASSWORD`. Mật khẩu mới phải khác mật khẩu cũ; đổi xong các phiên khác của tài khoản bị thu hồi.
- Lệnh `rebuild:progress` dựng lại `ReviewProgress` từ nhật ký (theo thứ tự thời gian), chỉ in số lượng. Local: `docker compose --env-file .local/pilot.env run --rm --no-deps api node dist/rebuild-progress.js`; VPS: `sudo docker compose --env-file .local/pilot.env --project-directory . -f deploy/compose.pilot.ghcr.yaml run --rm --no-deps api node dist/rebuild-progress.js`.
- Script kiểm đầu cuối `scripts/learner-accounts-check.mjs` (thêm `--stress` để kiểm tải đồng thời). Script từ chối chạy khi `PILOT_ORIGIN` không phải 127.0.0.1/localhost/::1 (trừ khi thêm `--allow-nonlocal`), trước khi đọc mật khẩu hay gửi yêu cầu nào.

### Lưu ý khi chạy script kiểm

- **Không chạy script này trên VPS/production** (nó tạo người dùng QA và đăng/rollback release nội bộ).
- Người dùng QA `qa-*` (kể cả `qa-stress-*` khi có `--stress`) ở lại trong DB local; mật khẩu ngẫu nhiên, không in ra.
- Mỗi lần chạy, ý (f) đăng thêm một release nội bộ vào lịch sử rồi rollback. Ý (f) và `smoke:pilot` cần release nền nằm trong 20 release gần nhất, nên chạy nhiều lần thì đến lúc sẽ hỏng cho tới khi đăng lại release nền (cùng danh sách revision) làm release hiện hành. (Đã sửa sau 2.5e: tổng quan quản trị luôn liệt kê release hiện hành và gắn cờ `current`, xem [DELIVERY_25E.md](DELIVERY_25E.md).)
- Mỗi lần chạy đăng nhập khoảng 11 lần; giới hạn đăng nhập là 20 lần / 10 phút / IP, nên gần như mỗi lần chạy cần khởi động lại API local: `docker compose --env-file .local/pilot.env restart api` (rồi `node scripts/wait-pilot.mjs`).

## API mới / thay đổi

| Route | Ghi chú |
|---|---|
| `POST /admin/users` | Thêm vai trò `student`, `manager`; trường `displayName`, `mustChangePassword` |
| `GET /auth/me` | Tài khoản có thêm `userId`, `displayName`, `mustChangePassword` |
| `GET /me`, `PATCH /me` | Hồ sơ của tài khoản đang đăng nhập (sửa `displayName`) |
| `POST /me/password` | Đổi mật khẩu (`current`, `next`); giới hạn 10 lần kiểm / 10 phút / người |
| `GET /me/home` | Mẻ lưới, gợi ý thả lưới (`cast.kind`: review / flashcard / done), số mục đến hạn, kỹ năng, phiên dở dang |
| `GET /me/review` | Các mục đến hạn và đã lên lịch |
| `GET /me/progress` | Kỹ năng, mức nhớ, 5 phiên gần nhất, chuỗi ngày, huy hiệu, số liệu trả lời |
| `GET /me/mastery` | Trạng thái và mức nhớ theo `itemId` của bộ hiện hành |
| `POST /learning/sessions` | `mode: review` của student do server chọn mục (tham số `limit` 1-30) |
| `POST /learning/sessions/:id/questions/:qid/attempts` | Với student, phản hồi có thêm `progress` của các mục vừa chạm tới |
| `GET /learning/sessions/:id/summary` | Tổng kết phiên: từng mục đúng/sai/bỏ qua và số ngày tới lượt ôn |

`/me/home`, `/me/review`, `/me/progress`, `/me/mastery` chỉ dành cho `student`; mã mời, manager và nhân sự quản trị nhận 403. Đặc tả đầy đủ: [docs/api/openapi.json](api/openapi.json).

## Phát hiện khi chạy trên Postgres thật

Unit test dùng DB giả; lần chạy đầu trên Postgres thật (nộp đồng thời nhiều câu của cùng học viên) có lỗi 500. Nguyên nhân: với driver adapter `pg`, xung đột tuần tự hóa xảy ra lúc COMMIT (mã 40001) không mang mã Prisma P2034 nên không được thử lại. Đã sửa (commit `d1100e0`, `851af97`): thử lại cả dạng lỗi này (tối đa 6 lần, chờ tăng dần), khóa trong tiến trình theo từng học viên để các lượt nộp của một người chạy lần lượt, và nếu vẫn xung đột thì trả 409 "Hệ thống đang bận, vui lòng thử lại." thay vì 500. Khóa này giả định **chỉ chạy một instance API** (đúng với cấu hình pilot hiện tại); chạy nhiều instance thì cần khóa ở DB.

## Kiểm tra

- `npm test`: web 149/149 (22 file), API 319/319, scripts 23/23 (thêm 3 test cho chặn host không phải local). `typecheck`, `lint`, `format:check`, `build`, `contract:generate` đạt; `openapi.json` không đổi so với các commit trước.
- Stack Docker local (`docker compose --env-file .local/pilot.env up -d --build`): `node scripts/learner-accounts-check.mjs --stress` chạy 3 lần liên tiếp; mỗi lần 12 ý kiểm và 2 ý tải đều đạt, ý (j) không áp dụng:
  - (a) `/me/home` trả `cast.kind` hợp lệ; (b) tự đánh giá flashcard hiện trong `/me/progress`; (c) nộp đồng thời hai lần cùng khóa: cùng kết quả, một dòng nhật ký; (d) nhiều câu của cùng mục nộp đồng thời: đều 201, đều được ghi; (e) đăng nhập lại vẫn thấy tiến độ; (f) xuất bản release nội bộ mới cùng revision: mức nhớ và lịch ôn không đổi (rồi rollback); (g) mã mời và manager bị 403 ở `/me/*`, student thứ hai không thấy dữ liệu của student đầu; (h) tài khoản phải đổi mật khẩu chỉ đổi được mật khẩu, đổi xong dùng bình thường; (i) bỏ qua câu Ghép tên: có nhật ký, lịch ôn và mức nhớ không đổi; (k) không có mục đến hạn thì ôn tập trả 400, `reviewTargets` của client bị bỏ qua; (m) tổng kết phiên đã xong.
  - (j) mục Nghe: **không áp dụng**, bộ local chưa có đủ 3 bản thu dùng được.
  - Tải: một học viên 9 lượt nộp đồng thời × 10 vòng, và hai học viên cùng lúc: 90/90 lượt 201 mỗi người, số dòng nhật ký bằng số lượt 201, không có 409/500.
- `npm run test:e2e` (desktop + mobile): 19 đạt, 3 bỏ qua theo thiết kế, giống trước.
- `rebuild:progress` trên DB local: trước 69 dòng / 23 người, sau `{"users":23,"rows":69}`; khóa và mức (stage) của từng dòng giống hệt. Lần dựng lại thứ hai (sau một lượt tải) chỉ lệch `lastSessionId` ở một dòng có hai lượt trùng đúng một mili giây (thứ tự hòa); mức, hạn ôn và thời điểm giống nhau.

## Chưa làm

- Trình duyệt chưa dùng `/me/*`: học viên vẫn vào bằng mã mời, tiến độ vẫn lưu trong trình duyệt. Chưa có màn đăng nhập tài khoản học viên, hồ sơ, đổi mật khẩu.
- Chưa có chức năng của manager (xem tiến độ nhóm); vai trò mới chỉ được tạo.
- Chưa có màn quản lý người dùng (tạo/khóa/đặt lại mật khẩu) trong trang quản trị; tạo tài khoản hiện chỉ qua API.
- Chưa nhập tiến độ cũ từ trình duyệt lên server.
- Chưa kiểm mục Nghe với bản thu thật; chưa chạy trên VPS.
- Lưu ý vận hành: nếu tự khóa người dùng bằng SQL, hãy xóa luôn phiên của họ (`DELETE FROM "AuthSession" WHERE "userId" = '<id>'`), vì 2.5a chưa thu hồi phiên khi khóa; thu hồi đúng cách khi khóa sẽ có ở 2.5c.
- `PILOT_ORIGIN` mặc định là `http://127.0.0.1:18089` và **không** lấy từ `PUBLIC_ORIGIN`; khi stack local dùng cổng khác, hãy đặt `PILOT_ORIGIN` khớp.
- Vận hành (chỉ để hoàn tác migration `202611200001_username_ci`): index tên đăng nhập không phân biệt hoa/thường được gỡ thủ công bằng `DROP INDEX "User_username_lower_key";`. Không chạy lệnh này trong vận hành thường ngày; sau khi gỡ, tên đăng nhập chỉ còn duy nhất theo chữ hoa/thường như trước.
