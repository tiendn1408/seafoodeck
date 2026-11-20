# Giai đoạn 2.5: tài khoản người học và tiến độ lưu trên server

Ngày: 2026-11-19 · Trạng thái: chờ duyệt.
Đứng giữa giai đoạn 2 (giao diện, đã merge) và giai đoạn 3 (tính năng chơi). Bối cảnh sản phẩm: `apps/web/PRODUCT.md`.

## 1. Mục đích

Hiện người học vào bằng **một mã mời dùng chung**; tiến độ (lịch ôn 1/3/7/14 ngày, mức nhớ, lịch sử phiên) nằm hoàn toàn trong trình duyệt của từng thiết bị. Hệ quả:

- không có "một người học" mà quản lý theo dõi được;
- đổi máy hoặc xóa dữ liệu trình duyệt là mất tiến độ;
- con số tiến độ do trình duyệt tính, nên người học sửa được thứ mà người khác nhìn vào.

Khách của bản demo cần: người học có tài khoản riêng, xem được thành tích và tiến độ của chính mình, và người quản lý **quan sát** được ai đang học bao nhiêu, mức nhớ ra sao, lần học cuối khi nào. Nguyên tắc của chủ dự án: **phần lớn logic ở server; trình duyệt chỉ hiển thị và giữ trạng thái tạm.** Cái gì không cần bí mật và không cần thẩm quyền thì trình duyệt làm ngay, không chờ server, để tránh độ trễ (xem 8.8).

## 2. Quyết định của người dùng

- Người học có **tài khoản riêng** (tên đăng nhập và mật khẩu). Tài khoản demo đầu tiên tên **An**, mật khẩu đơn giản để đưa khách (người dùng tự chọn khi tạo).
- Quản lý **chỉ quan sát**: đang học bao nhiêu loài, mức nhớ, lần học cuối. **Không** có mục tiêu, lộ trình, đánh giá hay xếp loại ở giai đoạn này.
- Người học xem được thành tích và tiến độ của chính mình.
- Phần lớn logic ở server; trình duyệt mỏng. Nhưng trình duyệt không nên phụ thuộc server quá mức: kết quả tạm trong lúc làm bài giữ ở giao diện, đưa lên server xử lý tiếp; những gì trình duyệt tự làm được thì làm, để tránh độ trễ.
- Các tính năng người dùng thêm vào do agent đề xuất (mục 5), người dùng đã nói "hợp lý".

## 3. Mục tiêu / không làm / phản mục tiêu

**Mục tiêu**
1. Đăng nhập bằng tài khoản; tiến độ gắn theo người, nhiều thiết bị cùng thấy một kết quả.
2. Server là nguồn sự thật cho lịch ôn, mức nhớ, "mẻ hôm nay", tiến độ kỹ năng, lịch sử phiên, thành tích. Trình duyệt không còn tự tính các thứ này.
3. Quản lý xem được bảng học viên và chi tiết từng người; quản trị tạo, khóa, đặt lại mật khẩu, tạo hàng loạt.
4. Bốn chế độ học và giao diện giai đoạn 2 giữ nguyên hành vi nhìn thấy được.

**Không làm**
- Mục tiêu, lộ trình, hạn chót, đánh giá, xếp loại, bảng xếp hạng so sánh giữa học viên.
- Email, thông báo, tự đăng ký, quên mật khẩu qua email (quản trị đặt lại).
- Nhập tiến độ cũ từ trình duyệt vào tài khoản (xung đột với "server là nguồn sự thật"; tiến độ cũ chưa từng được lưu trên server).
- Thay đổi quy tắc lịch ôn 1/3/7/14 ngày hoặc cách chấm điểm.

**Phản mục tiêu (chạy được vẫn tính là hỏng)**
- Con số tiến độ mà quản lý thấy có thể bị người học sửa từ trình duyệt.
- Quản lý hoặc người học thấy mật khẩu, mã băm hoặc dữ liệu của người khác không được phép thấy.
- Mỗi lần xuất bản release mới, tiến độ người học bị coi như "bộ cũ" và bắt đầu lại từ 0.
- Chế độ học thử bằng mã mời nhìn thấy dữ liệu người học khác hoặc giao diện quản lý.
- Làm vỡ bốn chế độ học hoặc các ca E2E hiện có (chỉ được cập nhật selector).
- Lộ đáp án trước khi trả lời (đã đúng ở hiện trạng, giữ nguyên).
- Mỗi thao tác chạm (lật thẻ, chọn đáp án, qua câu kế) có phản hồi hình ảnh tức thì; người học không phải nhìn màn hình đứng chờ server cho những việc không cần chấm.

## 4. Hiện trạng (đã kiểm trong code)

- Phiên: `AuthSession` (24 giờ, tùy chọn có `userId`). Mã mời tạo phiên vai trò `learner`; đăng nhập bằng tên tạo phiên theo vai trò của `User` (`editor`, `reviewer`, `publisher`, `admin`).
- `GameSession` và `Attempt` gắn với `actorId` = id của `AuthSession`, và **xóa theo phiên** (`onDelete: Cascade`). Server đã chấm từng câu và ghi `result` (gồm `targetId`, `skill`, `correct`, `selfRated`, `skipped`, `contentVersion` = release, danh sách `items` cho ghép tên). `attemptNumber` và `isReview` hiện do trình duyệt suy ra.
- Lịch ôn (`scheduleReview`, `apps/web/src/domain/review.ts`) và các hàm giai đoạn 2 (`apps/web/src/learner/haul.ts`: `planCast`, `pickHaul`, `skillProgress`, `masteryLevel`, `effectiveDueAt`; `ledger.ts`; `sessions.ts`) là hàm thuần có test, chạy ở trình duyệt, đọc từ localStorage.
- `contentVersion` hiện là id release: mỗi lần xuất bản, tiến độ cũ bị bỏ ra ngoài (lọc theo `contentVersion`). Đây là phản mục tiêu ở trên.
- `POST /admin/users` tạo được nhân viên (mật khẩu ≥ 16 ký tự), chưa có màn hình quản lý, chưa có danh sách, khóa, đặt lại mật khẩu.
- Hạ tầng: mật khẩu băm sẵn, giới hạn đăng nhập sai, CSRF, kiểm tra Origin, nhật ký (`Audit`).

## 5. Các tính năng

**Người học (vai trò `student`)**
- Đăng nhập bằng tên và mật khẩu; đăng xuất; đổi mật khẩu; trang cá nhân (tên hiển thị).
- Trang chủ, Ôn tập, Tiến độ, Tổng kết như giai đoạn 2, nhưng số liệu lấy từ server.
- **Thành tích** (tính khi đọc, không lưu): chuỗi ngày học liên tiếp, huy hiệu mốc, mức nhớ 4 kỹ năng, lịch sử các phiên gần đây, ngày học cuối.
- Trang cá nhân **không** có dòng nhắc việc quản lý xem tiến độ (người dùng quyết định ngày 2026-11-20: tránh cảm giác bị giám sát).

**Học thử bằng mã mời (giữ lại, vai trò `learner` hiện có)**
- Xem thư viện, thử bốn chế độ học; **không** có lịch ôn, tiến độ, mẻ hôm nay. Có lời nhắc "đăng nhập để lưu tiến độ".

**Quản lý (vai trò `manager`)**
- Bảng học viên: tên, số loài đang học, số loài đã vững, mức nhớ trung bình, lần học cuối, số mục quá hạn ôn, số phiên 7 ngày. Sắp xếp, lọc (ví dụ "chưa học 7 ngày"), xuất CSV.
- Chi tiết từng học viên: cùng các màn tiến độ như người học thấy về chính mình.
- Không sửa được nội dung, không thấy mật khẩu.

**Quản trị (`admin`)**
- Mục "Người dùng" trong trang quản trị: danh sách, tạo, khóa/mở khóa, đặt lại mật khẩu (mật khẩu tạm), tạo hàng loạt từ CSV, xóa (có xác nhận; mặc định nên khóa).
- Mật khẩu học viên có thể ngắn hơn 16 ký tự (tối thiểu 8, người dùng tự chọn); nhân viên và quản lý giữ quy tắc ≥ 16.

## 6. Ràng buộc

- Migration **chỉ cộng thêm**; không đổi tên hoặc xóa cột. Đây là migration đầu tiên kể từ bản đang chạy trên VPS (r1/r2): quy trình nâng cấp phải sao lưu trước và chạy `migrate` (tài liệu `docs/DEPLOY_UPGRADE_r2.md` làm mẫu).
- API hiện có giữ tương thích; chỉ thêm. Chạy `npm run contract:generate`.
- Bốn chế độ học, đường dẫn trang, cách chấm điểm, lịch ôn 1/3/7/14 ngày giữ nguyên.
- Giao diện theo `apps/web/DESIGN.md`; không đưa dữ liệu nháp, giá, độ hiếm ra phía người học.
- Online-only; không cần hoạt động offline.
- Không đưa mật khẩu, mã mời vào repo hoặc log. Mọi truy cập dữ liệu người khác được kiểm vai trò ở server.

## 7. Các cách đã cân nhắc (cách lưu và tính tiến độ)

| Cách | Đánh đổi | Kết luận |
| --- | --- | --- |
| A. Đồng bộ nguyên khối: trình duyệt vẫn tính, gửi bản sao lên server | Ít công nhất; hai thiết bị ghi đè nhau; số liệu giả được; khó truy vấn cho quản lý | Loại |
| B. Server quyết định mọi thứ, trình duyệt chỉ hiển thị | Chuẩn nhất; công lớn hơn, nhưng các hàm thuần giai đoạn 2 chuyển sang server gần như nguyên vẹn | **Chọn** (người dùng nêu rõ muốn phần lớn ở server) |
| C. Server chỉ lưu lịch sử trả lời, trình duyệt tính lại lịch ôn | Ít công hơn B; logic vẫn ở trình duyệt, số liệu hiển thị vẫn do trình duyệt dựng | Loại (trái hướng "trình duyệt mỏng") |

## 8. Thiết kế

### 8.1 Dữ liệu (thêm, không sửa)

- `User`: thêm `displayName`, `disabledAt`, `mustChangePassword`, `createdAt`, `lastLoginAt` (đều tùy chọn hoặc có mặc định). Vai trò mới: `student`, `manager` (chuỗi, không cần đổi kiểu cột).
- `LearningAttempt` (bảng mới, nhật ký bền theo người, **không** xóa theo phiên): `id`, `userId`, `sessionId`, `questionId`, `targetId` (id `Item` cho flashcard/đoán hình/ghép tên từng cặp; id hồ sơ HS cho HS), `skill`, `mode`, `isReview`, `attemptNumber`, `correct`, `skipped`, `selfRated`, `contentVersion` (xem 8.3), `releaseId` (chỉ để tham chiếu), `at`. Khóa duy nhất `(questionId, targetId)` để ghi lặp không nhân đôi. Chỉ ghi khi phiên thuộc `student`. Ghi **trong cùng giao dịch** với `Attempt` hiện có.
- `ReviewProgress` (bảng mới, **suy ra được** từ `LearningAttempt`, dựng lại được): `userId`, `targetId`, `skill`, `stage`, `dueAt`, `lastAttemptAt`, `lastSessionId`, `contentVersion`, `selfRated`. Khóa `(userId, targetId, skill)`. Cập nhật trong cùng giao dịch bằng hàm lịch ôn đã chuyển sang server. Có lệnh dựng lại từ nhật ký (để kiểm nhất quán).

### 8.2 Logic chuyển sang server

Chuyển các hàm thuần và test từ `apps/web/src/domain/review.ts` (`scheduleReview`, bảng `INTERVAL_DAYS`) và `apps/web/src/learner/{haul,sessions,ledger-derived}` sang `apps/api/src/` (module riêng, ví dụ `progress/`), **kèm bộ test cũ làm bộ vector chuẩn**. Hành vi không đổi: tự đánh giá không nâng bậc; đúng ở phiên ôn sau hạn thì nâng bậc 1→3→7→14 ngày; sai về bậc 0; quy tắc `effectiveDueAt` của giai đoạn 2 giữ nguyên. `attemptNumber` và `isReview` do server suy ra từ phiên và từ nhật ký, không còn tin trình duyệt. Mã trình duyệt tương ứng bị xóa khi không còn dùng (người build quyết thời điểm, sau khi trình duyệt chuyển sang API).

### 8.3 Phiên bản nội dung theo loài

`contentVersion` của mục học **không** còn là id release. Là một dấu vân tay ổn định của chính nội dung học của loài (ví dụ băm bốn tên hiển thị hiện hành), nên xuất bản release mới **không** làm mất tiến độ; sửa tên của một loài thì chỉ loài đó bắt đầu ôn lại (đúng với hành vi hiện tại khi nội dung đổi). Hồ sơ HS dùng dấu vân tay riêng. Người build chọn công thức chính xác; yêu cầu: không đổi khi chỉ xuất bản, thêm loài khác, hoặc sửa ghi chú, SKU, ảnh.

### 8.4 API (mới, thêm vào)

Người học (`student`; học thử bị từ chối với 403 có thông báo rõ):
- `GET /me`, `PATCH /me` (tên hiển thị), `POST /me/password`.
- `GET /me/home`: mẻ hôm nay (≤ 5 loài), kế hoạch "Thả lưới" (ôn tối đa 8 / học loài mới / đã xong), số liệu đến hạn, tiến độ 4 kỹ năng.
- `GET /me/review`: các mục đến hạn và đã lên lịch (nhóm theo loài).
- `GET /me/progress`: tiến độ kỹ năng, phân bố mức nhớ, lịch sử phiên gần đây (5), thành tích.
- Phiên học: `POST /learning/sessions` với `mode: 'review'` **không nhận danh sách mục từ trình duyệt**; server chọn mục đến hạn (có giới hạn tối đa; giữ tham số tùy chọn `limit` ≤ 30). `GET /learning/sessions/:id/summary`: các loài vào lưới / sổng lưới và "ôn lại sau X ngày".
Quản lý (`manager`, `admin`):
- `GET /manager/learners` (bảng, có `?sort=&filter=`; phân trang), `GET /manager/learners/:id` (chi tiết, cùng khuôn với `/me/*`), `GET /manager/learners.csv`.
Quản trị (`admin`):
- `GET /admin/users`, `POST /admin/users` (mở rộng vai trò `student`, `manager`), `PATCH /admin/users/:id` (khóa/mở khóa, tên hiển thị), `POST /admin/users/:id/reset-password`, `POST /admin/users/bulk` (CSV: tên, mật khẩu tạm), `DELETE /admin/users/:id`.
- Khóa người dùng thu hồi ngay mọi `AuthSession` của người đó.
- Việc tạo, khóa, đặt lại mật khẩu, xóa ghi vào `Audit`.

### 8.5 Đăng nhập và an toàn

Đăng nhập bằng tên dùng lại `POST /auth/login`; tài khoản bị khóa không đăng nhập được; giới hạn đăng nhập sai áp theo cả IP và tên đăng nhập. Mật khẩu mã hóa như hiện tại. Phiên của `student` vẫn 24 giờ. `mustChangePassword` buộc đổi mật khẩu sau khi quản trị đặt lại. Mỗi endpoint `manager` kiểm vai trò ở server; `student` chỉ đọc dữ liệu của chính mình (id lấy từ phiên, không nhận từ tham số).

### 8.6 Thành tích (tính khi đọc từ nhật ký)

- **Chuỗi ngày học**: số ngày liên tiếp (theo giờ `Asia/Ho_Chi_Minh`) có ít nhất một câu được chấm hoặc tự đánh giá.
- **Huy hiệu mốc** (đề xuất, người build có thể chỉnh): 10 loài đầu tiên, 7 ngày liên tiếp, 50 loài ở mức nhớ ≥ 1 tuần, 100 loài, hoàn thành 10 phiên ôn.
- Danh sách huy hiệu là dữ liệu cấu hình trong code, không phải bảng; thêm huy hiệu không cần migration.

### 8.7 Trình duyệt

Mỏng đi: `Home`, `Review`, `Progress`, `Summary` lấy số liệu từ `/me/*` và `/learning/sessions/:id/summary`; không còn đọc hay ghi `localStorage` cho tiến độ. Thêm: màn đăng nhập kép (tên và mật khẩu, kèm lối "học thử bằng mã mời"), trang cá nhân, khối thành tích, màn quản lý học viên, mục "Người dùng" trong quản trị. Chế độ học thử hiện trang chủ rút gọn kèm lời nhắc đăng nhập. Phong cách theo `DESIGN.md`.

### 8.8 Độ trễ và trạng thái tạm ở trình duyệt

Phân chia theo việc cần gì:
- **Cần đáp án đúng hoặc cần thẩm quyền → server** (ghép tên, đoán hình, HS: đáp án không được xuống trình duyệt trước khi trả lời; ghi nhật ký; lịch ôn; thành tích). Mỗi câu trả lời vẫn gửi lên để chấm như hiện nay, một yêu cầu nhỏ. Không dồn chấm sang cuối bài, vì người học sẽ mất phản hồi tức thì.
- **Không cần đáp án → trình duyệt làm ngay, gửi nền:**
  - Thẻ tự đánh giá ("Chưa nhớ / Đã nhớ"): giao diện đổi ngay (phao nổi, sang thẻ kế); ghi lên server ở nền với khóa idempotency đã có. Mất mạng hoặc server chậm thì xếp hàng trong bộ nhớ trình duyệt và gửi lại; hiển thị trạng thái "đang lưu" nhỏ, không chặn.
  - Tải trước câu kế tiếp (và ảnh của nó) trong lúc người học trả lời câu hiện tại.
  - Phao tiến độ, hiệu ứng, thứ tự câu, trạng thái tạm của phiên: giữ trong trình duyệt.
- **Mỗi phản hồi chấm điểm trả kèm trạng thái ôn mới** của mục đó (bậc, ngày đến hạn kế tiếp, mức nhớ). Trình duyệt dùng ngay để hiển thị "ôn lại sau X ngày" và cập nhật phao, **không gọi thêm API**.
- **Tổng kết phiên** dựng từ chính các kết quả đã nhận trong phiên; `GET /learning/sessions/:id/summary` chỉ dùng khi tải lại trang hoặc mở lại phiên cũ. Nếu còn câu đang chờ gửi, tổng kết hiện trạng thái "đang lưu" cho tới khi server xác nhận xong.
- **Trang chủ, Ôn tập, Tiến độ:** hiện ngay bản đã tải lần trước (stale-while-revalidate, giữ trong bộ nhớ của phiên làm việc, không lưu lâu dài) và làm mới ở nền; lỗi mạng hiển thị nhãn thông báo, không xóa nội dung đang hiện.
- Số liệu hiển thị do trình duyệt tự dựng chỉ được dùng cho **trình bày** (ví dụ "2/5 phao"); mọi con số được lưu, so sánh hoặc đưa cho quản lý đều do server tính.

### 8.9 Làm rõ sau khi người build đọc thử

- **Bản nội dung mà `student` học:** theo đúng quy tắc hiện tại của mọi phiên. Phiên là nội bộ chỉ khi cấu hình `ALLOW_INTERNAL_DEMO=true` (do người vận hành bật), còn không thì là bản công khai. Tiến độ gắn theo loài và dấu vân tay nội dung (8.3) nên bản nháp đổi tên thì loài đó ôn lại; chấp nhận. `manager` không được xem danh mục nháp. `/me/*` luôn lấy danh mục qua đúng cổng phạm vi của phiên (như `/catalog/*`), không bao giờ rộng hơn.
- **`attemptNumber` do server suy ra:** thêm cột tùy chọn `GameSession.reviewOfId` (migration cộng thêm) cho phiên làm lại câu sai; câu thuộc phiên làm lại có `attemptNumber = 2`, câu còn lại là `1`. Đúng như hiện tại: lần làm lại không nâng bậc. `isReview` suy ra từ `GameSession.mode === 'review'`.
- **Ghép tên:** ghi **một dòng nhật ký cho mỗi cặp** (đã là khóa `(questionId, targetId)`); mục ôn `match:<k>` giữ hành vi hiện tại, kể cả việc hai loài đồng hành trong câu cũng được ghi kết quả. Nghe tên (`listening`) vẫn ghi nhật ký và lịch ôn nhưng **không tính** vào chỉ số "đang học / đã vững" của quản lý hay các thanh tiến độ (đúng như `skillProgress` và `masteryLevel` hiện nay chỉ tính tên, ghép tên, đoán hình, HS). Tổng HS là số hồ sơ HS dùng được trong bản hiện hành.
- **Phiên ôn do server chọn:** "Thả lưới" tối đa 8 mục; nút "Ôn n mục" của màn Ôn tập tối đa 30 (`limit`). `reviewTargets` do trình duyệt gửi bị **bỏ qua** với `student` (server tự chọn mục đến hạn) và vẫn được chấp nhận với các vai trò cũ cho tới khi trình duyệt cũ không còn dùng. Mục mất đủ dữ liệu (thiếu 4 tên, thiếu ảnh) bị **bỏ qua im lặng**, không báo lỗi cả phiên.
- **Nhật ký bền:** `LearningAttempt.questionId` và `sessionId` **không có khóa ngoại**, vì `GameSession` bị xóa cùng `AuthSession`. Thêm cột `label` (tên hiển thị của mục lúc trả lời) và `mode` để lịch sử phiên và tổng kết không phụ thuộc phiên đã xóa. Ghi `LearningAttempt` và cập nhật `ReviewProgress` trong **giao dịch tuần tự hóa** (hoặc khóa dòng) để hai lần nộp đồng thời không ghi đè nhau; đường phát lại theo khóa idempotency đã trả về sớm như cũ. Việc dọn phiên hết hạn (nếu chưa có) được thêm vào bảo trì định kỳ hiện có, không được xóa nhật ký.
- **Vai trò và an toàn:**
  - `AccessGuard` chỉ chặn `guest`; `student` và `manager` đi qua các route catalog và learning như `learner`. Các route `/me/*` yêu cầu `student`; `/manager/*` yêu cầu `manager` hoặc `admin`.
  - `mustChangePassword` được **server** thực thi: một guard chặn mọi route trừ `POST /me/password`, `GET /me`, `GET /auth/me` và đăng xuất.
  - `GET /auth/me` trả thêm `displayName` và `mustChangePassword`; danh sách vai trò nhân viên và `loginKind` ở web được cập nhật.
  - Giới hạn đăng nhập sai áp theo cả IP lẫn tên đăng nhập; vẫn lưu trong bộ nhớ (mất khi khởi động lại), chấp nhận cho giai đoạn này.
  - `POST /admin/users` dùng DTO riêng cho từng nhóm vai trò (nhân viên và quản lý ≥ 16 ký tự; học viên ≥ 8).
- **Giữ tiến độ khi đổi nội dung:** khi dấu vân tay của một loài đổi, `ReviewProgress` của loài đó bắt đầu lại; **nhật ký cũ vẫn tính** cho chuỗi ngày, huy hiệu và lịch sử. Hồ sơ HS: dấu vân tay riêng dựa trên nội dung hồ sơ (đề, các lựa chọn, đáp án), người build chọn công thức; nếu hồ sơ HS được tạo lại với id mới thì tiến độ HS của hồ sơ đó bắt đầu lại, chấp nhận.
- **Những gì trình duyệt mỏng vẫn cần từ server:**
  - Trạng thái từng loài cho Thư viện (mới / đang học / đến hạn, mức nhớ): `GET /me/mastery` trả bản đồ `itemId → { status, level }`.
  - Phiên đang dở: `GET /me/home` trả thêm `activeSessionId` (phiên chưa hết hạn gần nhất còn câu chưa trả lời); trình duyệt không còn lưu id phiên vào `localStorage`.
  - Tổng kết phiên: dựng ở trình duyệt từ các kết quả chấm đã nhận (8.8); `GET /learning/sessions/:id/summary` cho trường hợp tải lại trang.
- **Nâng cấp VPS:** đây là migration đầu tiên kể từ bản đang chạy. API mới tương thích ngược với bản web cũ của phiên `learner` (không đổi hành vi `/learning` cho `learner`), nên có thể nâng cấp API trước, web sau, hoặc cùng lúc. Quy trình theo `docs/DEPLOY_UPGRADE_r2.md` (sao lưu, đổi mã ảnh, kéo ảnh, `migrate`, tạo lại dịch vụ); tài liệu nâng cấp riêng cho 2.5 được viết ở vòng 2.5c.

## 9. Các vòng làm (mỗi vòng chạy được riêng, có kế hoạch, kiểm thử và review riêng)

1. **2.5a Nền tảng (server):** migration, vai trò mới, ghi nhật ký và `ReviewProgress`, chuyển logic, `/me/*`, phiên ôn do server chọn, `contentVersion` theo loài, bộ test vector, lệnh dựng lại. Trình duyệt chưa đổi (vẫn chạy được song song).
2. **2.5b Người học (web):** đăng nhập kép, trang cá nhân, thành tích, chuyển Home/Review/Progress/Summary sang API, bỏ ledger `localStorage`, học thử, cập nhật E2E.
3. **2.5c Quản lý và quản trị:** bảng học viên, chi tiết, CSV, mục "Người dùng", tạo hàng loạt, tài liệu nâng cấp VPS và tạo tài khoản demo **An**.

## 10. Kiểm thử và nghiệm thu

- Test vector chuẩn cho lịch ôn: cùng bộ ca chạy trên bản server (và trên bản cũ trong lúc chuyển đổi) cho cùng kết quả.
- Test bất biến: ghi lặp cùng câu không nhân đôi; sửa tên một loài chỉ làm loài đó ôn lại; xuất bản release mới không đổi tiến độ.
- Test quyền: `student` không đọc được dữ liệu người khác; `manager` không sửa nội dung; học thử bị từ chối `/me/*`; tài khoản khóa không đăng nhập được và phiên bị thu hồi.
- Test thành tích: chuỗi ngày qua nửa đêm giờ Việt Nam, qua ngày chuyển tháng.
- E2E: đăng nhập bằng tài khoản, học một mẻ, đổi thiết bị (phiên mới) vẫn thấy tiến độ; quản lý thấy học viên và lần học cuối; quản trị tạo, khóa và đặt lại mật khẩu.
- Kiểm trên Docker local rồi trên VPS theo tài liệu nâng cấp (sao lưu trước).

## 11. Để lại cho người build

- Tên module, tên bảng/cột chính xác, công thức dấu vân tay nội dung (8.3).
- Danh sách và ngưỡng huy hiệu cuối cùng; định dạng CSV; kích thước trang.
- Cách đặt tên vai trò phía code (miễn là `student` ≠ phiên học thử `learner` rõ ràng).
- Thời điểm xóa mã tính tiến độ cũ ở trình duyệt.

## 12. Quyết định của agent (người dùng kiểm khi đọc)

- Chọn B (server là nguồn sự thật) và tái sử dụng hàm thuần của giai đoạn 2 thay vì viết lại. Theo góp ý của người dùng, trình duyệt giữ trạng thái tạm và làm ngay những gì không cần bí mật hay thẩm quyền (8.8); không đổi sang chấm cả bài ở cuối vì sẽ mất phản hồi tức thì và vẫn không được đưa đáp án xuống trình duyệt.
- Học thử bằng mã mời **không** có tiến độ (để trình duyệt hết phải tự tính).
- Bỏ tính năng "nhập tiến độ cũ từ trình duyệt vào tài khoản" đã đề xuất trước đó, vì xung đột với tính toàn vẹn.
- Tiến độ gắn theo loài; `contentVersion` không còn là release.
- Tên vai trò `student` và `manager`; mật khẩu học viên ≥ 8 ký tự, nhân viên và quản lý ≥ 16.
- Huy hiệu và chuỗi ngày theo giờ Việt Nam; học viên chỉ bị **khóa** theo mặc định, xóa cứng phải xác nhận.
- Thứ tự ba vòng: nền tảng, người học, quản lý.
- Các chi tiết ở 8.9 (bản nội dung theo quy tắc hiện tại, `attemptNumber` suy ra từ `reviewOfId`, nghe tên không tính vào chỉ số, `reviewTargets` bị bỏ qua với học viên, `mustChangePassword` thực thi ở server, giới hạn đăng nhập theo tên + IP) là các quyết định của agent sau khi người build đọc thử; người dùng kiểm khi đọc.
