# Phase 2.5a: tài khoản học viên và tiến độ phía server

Ngày 20/11/2026. Branch `feat/learner-accounts-25a` (gốc `feat/pilot-monorepo`). Chỉ thay đổi phía API; trình duyệt chưa đổi hành vi. Chưa build image, chưa push GHCR, chưa deploy VPS.

> **Lưu ý nâng cấp:** đây là migration đầu tiên kể từ r1/r2 (`202611190001_learner_accounts`). Sao lưu DB (`scripts/backup-pilot.sh`) trước khi nâng cấp VPS.

## Đã làm

- Schema và migration: bảng nhật ký lượt làm `LearningAttempt` (mỗi câu, mỗi cặp ghép là một dòng) và `ReviewProgress` (lịch ôn theo người dùng × mục × kỹ năng); `User` có thêm `displayName`, `mustChangePassword`, `lastLoginAt`.
- Vai trò tài khoản mới `student` và `manager` (quản trị tạo qua `POST /admin/users`). Mật khẩu tối thiểu 8 ký tự cho student, 16 cho các vai trò khác. Học viên mã mời (`learner`) vẫn chạy như cũ, không có tiến độ phía server.
- Nhật ký và lịch ôn được ghi **trong cùng giao dịch Serializable** với lượt chấm, chỉ cho `student`. Câu bỏ qua được ghi nhật ký nhưng không đổi lịch ôn hay mức nhớ. Lịch ôn 1/3/7/14 ngày, logic chuyển từ web sang API với bộ vector đối chiếu chung.
- Dấu vân tay nội dung (tên vi/en/ja/khoa học, hồ sơ HS): xuất bản release mới có cùng nội dung **không** reset tiến độ; nội dung đổi thì mục đó tính lại từ đầu.
- Ôn tập do server chọn: student gửi `mode: review` thì server lấy các mục đến hạn; danh sách `reviewTargets` do client gửi bị bỏ qua. Không có mục đến hạn thì trả 400 "Chưa có mục nào đến hạn ôn.".
- Đổi mật khẩu bắt buộc: tài khoản `mustChangePassword` chỉ dùng được `GET /me`, `GET /auth/me`, `POST /me/password`, đăng xuất; mọi route khác trả 403 mã `MUST_CHANGE_PASSWORD`. Mật khẩu mới phải khác mật khẩu cũ; đổi xong các phiên khác của tài khoản bị thu hồi.
- Lệnh `rebuild:progress` dựng lại `ReviewProgress` từ nhật ký (theo thứ tự thời gian), chỉ in số lượng.
- Script kiểm đầu cuối `scripts/learner-accounts-check.mjs` (thêm `--stress` để kiểm tải đồng thời).

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

- `npm test`: web 149/149 (22 file), API 319/319, scripts 20/20. `typecheck`, `lint`, `format:check`, `build`, `contract:generate` đạt; `openapi.json` không đổi so với các commit trước.
- Stack Docker local (`docker compose --env-file .local/pilot.env up -d --build`): `node scripts/learner-accounts-check.mjs --stress` chạy 3 lần liên tiếp, cả 14 ý đạt mỗi lần:
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
