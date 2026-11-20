# Giai đoạn 2.5b: trình duyệt người học dùng tài khoản và tiến độ từ server: kế hoạch triển khai

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Học viên đăng nhập bằng tên và mật khẩu, thấy Trang chủ, Ôn tập, Tiến độ, Thư viện, Tổng kết và Thành tích lấy từ server (`/me/*`); học thử bằng mã mời vẫn dùng được nhưng không có tiến độ; không còn sổ tiến độ trong `localStorage`.

**Architecture:**
- **Dữ liệu:** một kho nhớ tạm trong bộ nhớ (stale-while-revalidate, khóa theo người dùng, xóa khi đăng xuất) và hook `useMe` đọc `/me/home|review|progress|mastery`.
- **Vai trò ở web:** `student` (tài khoản), `learner` (học thử bằng mã mời), `manager` (chưa có màn riêng, vòng 2.5c), nhân viên (admin).
- **Màn học:** Study và Tổng kết dựng từ kết quả chấm đã nhận cùng trường `progress` trong phản hồi; thẻ tự đánh giá cập nhật giao diện ngay và gửi nền qua hàng đợi.
- **Dọn:** sau khi các màn chuyển sang API, xóa `ledger.ts`, `haul.ts`, `sessions.ts` và mọi đọc ghi `localStorage` cho tiến độ.

**Tech Stack:** React 19, Vite, Vitest + Testing Library (jsdom), Playwright (`npm run test:e2e`), NestJS (chỉ Task 1).

**Spec:** `docs/superpowers/specs/2026-11-19-phase25-learner-accounts-design.md` (mục 5, 8.4, 8.7, 8.8, 8.9). Việc để lại từ 2.5a: `docs/handoffs/2026-11-20-phase25a-followups.md` (mục "Cho 2.5b"): mục 1, 3, 6 ở Task 1; mục 2 ở Task 3; mục 4 giải quyết bằng thiết kế (tổng kết dựng từ kết quả đã nhận, endpoint tổng kết chỉ dùng khi tải lại trong cùng phiên đăng nhập, ghi rõ trong `DELIVERY_25B.md`); mục 5 ở Task 8. Giao diện theo `apps/web/DESIGN.md` và `apps/web/PRODUCT.md`.

## Global Constraints

- Giao diện "Biển sâu × Ấn bản loài": giữ `apps/web/DESIGN.md` (màu nhóm loài, phao tiến độ, ảnh nguyên vẹn `object-fit: contain`, vảy cá chỉ để trang trí, không thanh bên, một thanh điều hướng mỗi breakpoint qua `matchMedia`).
- Di động trước, từ 320px, mục chạm ≥ 44px, tôn trọng giảm chuyển động, bàn phím thao tác được; tiếng Việt có dấu và kana hiển thị đúng.
- Không đưa vào `localStorage`: tiến độ, lịch ôn, id phiên của `student`. Được giữ: bản nháp trả lời và token idempotency của từng câu (đã có), giao diện sáng/tối.
- Số liệu được lưu, so sánh hoặc đưa cho quản lý do server tính; số do trình duyệt tự dựng chỉ để trình bày ("2/5 phao").
- Không thêm thư viện mới. Không đổi hành vi `learner` (mã mời) ở API. Giữ mọi ca E2E hiện có (chỉ sửa selector/dữ liệu đăng nhập khi cần).
- Không in hoặc ghi mật khẩu, mã mời, `.local/pilot.env` ở bất kỳ đâu; test dùng mật khẩu ngẫu nhiên.
- Route quản trị ẩn `#admin` giữ nguyên (đăng nhập nhân viên ở đó). Màn đăng nhập học viên không có liên kết tới `#admin`.
- Sau mỗi task: `npm test`, `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run build` (từ thư mục gốc) đều pass.

## Review Focus

1. **Đổi thiết bị / đăng nhập lại vẫn thấy tiến độ** (không dựa `localStorage`). → E2E Task 10 (xóa storage, đăng nhập lại, `/me/progress` hiện số liệu).
2. **`MUST_CHANGE_PASSWORD` bất cứ lúc nào** (quản trị đặt lại khi đang học): mọi phản hồi 403 mang mã này đưa người dùng tới màn đổi mật khẩu, không hiện lỗi chung. → test ở Task 2 (`ApiError.code`) và Task 3.
3. **Thẻ tự đánh giá gửi nền:** bấm đúp không gửi đôi; mất mạng thì xếp hàng và gửi lại cùng khóa idempotency; đóng tab khi còn câu chờ phải cảnh báo; tổng kết hiện "đang lưu" tới khi xong. → test hàng đợi ở Task 8.
4. **Ranh giới vai trò:** học thử (`learner`) và `manager` không bao giờ gọi `/me/*` (không có thông báo lỗi 403 hiện ra); `student` không thấy lối "học thử". → test ở Task 2 và Task 4.
5. **Kho nhớ tạm không rò giữa người dùng:** sau đăng xuất rồi đăng nhập người khác, không hiện số liệu của người trước dù chỉ một khung hình. → test ở Task 2.

---

### Task 1: Ba việc nhỏ còn lại ở API trước khi trình duyệt dùng tài khoản

**Files:**
- Modify: `apps/api/src/security.ts` (`LoginLimiter`), `apps/api/src/auth.controller.ts`, `apps/api/src/progress.service.ts` (`afterSubmit`, `resumable`, `home`)
- Test: `apps/api/src/me-access.test.ts`, `apps/api/src/progress-service.test.ts`

**Interfaces:**
- Produces:
  - `LoginLimiter.check(ip: string, username?: string): void` giữ nguyên chữ ký; thêm `LoginLimiter.reset(ip: string, username?: string): void`, gọi sau đăng nhập thành công để xóa bộ đếm theo tên (bộ đếm IP chỉ giảm theo thời gian). Quy tắc: đăng nhập sai tăng cả hai bộ đếm; đăng nhập đúng không tăng bộ đếm nào và xóa bộ đếm theo tên.
  - `ProgressService.afterSubmit(actor, result): Promise<ProgressEntry[]>` chỉ trả các dòng thuộc **dòng đang hiệu lực** (đã lọc `activeRows`): dòng có dấu vân tay cũ không được trả, thay vì lấy từ danh sách chưa lọc; `level` vẫn tính trên dòng đang hiệu lực.
  - `activeSessionId` của `/me/home` chỉ trả phiên thuộc **bản phát hành hiện hành** của phiên đăng nhập (so `GameSession.releaseId` với `releaseId` của `context`); phiên của bản cũ hơn không được đề xuất để mở lại.

- [ ] **Step 1: Test.** `me-access.test.ts`: 25 lần đăng nhập đúng từ cùng một IP không bị 429; 10 lần sai cho một tên thì lần thứ 11 bị chặn kể cả khi mật khẩu đúng; đăng nhập đúng xóa bộ đếm theo tên; tên khác không bị ảnh hưởng; đường mã mời (không có tên) vẫn chỉ tính theo IP và vẫn giới hạn 20 lần sai mỗi 10 phút. `progress-service.test.ts`: `afterSubmit` với dòng tiến độ có `contentVersion` cũ (loài vừa đổi tên) trả mảng rỗng cho dòng đó, loài khác vẫn trả; `home` không trả `activeSessionId` cho phiên thuộc release khác với release hiện hành và vẫn trả cho phiên cùng release. Chạy → FAIL.
- [ ] **Step 2:** Implement cả ba. Chạy test API → PASS; test API cũ vẫn pass.
- [ ] **Step 3:** Commit `fix(api): login limiter counts failures only, afterSubmit ignores stale rows, resume offers current release only`.

### Task 2: Nền web: kiểu dữ liệu API, kho nhớ tạm `useMe`, nhận diện vai trò

**Files:**
- Modify: `apps/web/src/pilot/api.ts`, `apps/web/src/learner/loginKind.ts`, `apps/web/src/learner/loginKind.test.ts`
- Create: `apps/web/src/learner/groups.ts` (chuyển `groupTone`, `GroupKey` và hằng nhóm từ `haul.ts`; `haul.ts` chưa xóa), `apps/web/src/learner/meStore.ts`, `apps/web/src/learner/meStore.test.ts`, `apps/web/src/learner/role.ts`, `apps/web/src/learner/role.test.ts`

**Interfaces:**
- Produces (`api.ts`):
  - `AuthView` thêm `userId?: string; displayName?: string | null; mustChangePassword?: boolean`.
  - `api<T>(path, body?, signal?, method?: 'POST' | 'PATCH')` (mặc định như cũ: GET nếu không có body, POST nếu có); `ApiError` thêm `code?: string` lấy từ `data.code`.
  - Kiểu phản hồi khớp `docs/api/openapi.json` và `apps/api/src/progress.service.ts`: `ProgressEntry { targetId; skill; stage; dueAt; level: 0|1|2|3|4 }`, `Score.progress?: ProgressEntry[]`, `MeHome`, `MeReview`, `MeReviewEntry`, `MeProgress`, `MeBadge`, `MeSessionRow`, `MeMastery = Record<string, { status: 'new'|'due'|'learning'; level: 0|1|2|3|4 }>`, `SessionSummaryResponse`.
- Produces (`role.ts`): `type Kind = 'guest' | 'trial' | 'student' | 'manager' | 'staff'`; `kindOf(auth: AuthView | null): Kind` (`learner` → `trial`; `admin|editor|reviewer|publisher` → `staff`).
- Produces (`meStore.ts`): `useMe<T>(path: string, userId: string | undefined): { data: T | null; error: string; stale: boolean; refresh(): void }` — trả bản đã nhớ ngay (nếu cùng `userId`) rồi làm mới nền; khóa theo `userId + path`; `clearMe(): void` xóa toàn bộ; không bao giờ gọi API khi `userId` là `undefined`; lỗi mạng giữ nguyên dữ liệu đang hiện và đặt `error`. Kho chỉ nằm trong bộ nhớ (không `localStorage`/`sessionStorage`).
- `loginKind(route, role)`: học viên/khách mới: `guest` ở route ≠ `admin` → màn đăng nhập học viên; giữ `staff` cho `#admin`.

- [ ] **Step 1: Test.** `role.test.ts`: `kindOf` cho `null`, `guest`, `learner`, `student`, `manager`, bốn vai trò nhân viên. `meStore.test.ts` (fake `fetch`): lần gọi thứ hai cùng khóa trả dữ liệu cũ ngay rồi cập nhật; đổi `userId` không trả dữ liệu của người trước ngay cả một lần render; `clearMe()` rồi gọi lại không còn dữ liệu cũ; `userId` undefined không gọi `fetch`; lỗi mạng giữ dữ liệu cũ; 403 mã `MUST_CHANGE_PASSWORD` làm `ApiError.code` đúng. Chạy → FAIL.
- [ ] **Step 2:** Implement kiểu, `method` PATCH, `ApiError.code`, `role.ts`, `meStore.ts`, `groups.ts` (và `haul.ts` import từ `groups.ts` để không trùng).
- [ ] **Step 3:** Chạy test web → PASS. Commit `feat(web): api types, in-memory me store and role helpers`.

### Task 3: Đăng nhập kép và màn đổi mật khẩu bắt buộc

**Files:**
- Modify: `apps/web/src/learner/Login.tsx`, `apps/web/src/learner/Login.test.tsx`, `apps/web/src/pilot/PilotApp.tsx` (chỉ phần đăng nhập/đổi mật khẩu), `apps/web/src/learner/shell.css` hoặc `apps/web/src/styles.css` (kiểu màn đăng nhập hiện có)
- Create: `apps/web/src/learner/ChangePassword.tsx`, `apps/web/src/learner/ChangePassword.test.tsx`

**Interfaces:**
- Consumes: `api`, `AuthView.mustChangePassword`, `ApiError.code` (Task 2).
- Produces: `Login` (props `{ onLogin(a: AuthView): void }`) hiển thị biểu mẫu **tên + mật khẩu** làm mặc định và một liên kết nhỏ "Học thử bằng mã mời" đổi sang biểu mẫu mã mời (cùng trang, có thể quay lại); `ChangePassword` (props `{ forced: boolean; onDone(): void; onLogout(): void }`) với trường mật khẩu hiện tại và mật khẩu mới (học viên ≥ 8 ký tự; vai trò khác ≥ 16 — hiển thị gợi ý theo vai trò), gọi `POST /me/password`, lỗi 400/429 hiện thông báo của server; nút "Đăng xuất" luôn có. Khi `forced`, không có lối đi nào khác.
- `PilotApp`: nếu `auth.mustChangePassword` hoặc bất kỳ phản hồi nào có `ApiError.code === 'MUST_CHANGE_PASSWORD'` thì hiện `ChangePassword forced`; sau khi đổi xong tải lại `/auth/me`.
- Sửa độ tương phản chữ báo lỗi trên nền biển sâu của màn đăng nhập (mục "gom sau" cũ): chữ lỗi đạt tương phản ≥ 4.5:1 so với nền, kiểm bằng test kiểu hoặc kiểm tra màu trong `ErrorNote`/CSS tương ứng.

- [ ] **Step 1: Test.** `Login.test.tsx`: mặc định thấy ô tên và mật khẩu, không thấy "Mã mời"; bấm liên kết học thử thì thấy ô "Mã mời" và gửi `/auth/login` chỉ với `credential`; đăng nhập tài khoản gửi `username` + `credential`; lỗi 401 hiện thông báo dễ đọc, không lộ lý do khóa. `ChangePassword.test.tsx`: mật khẩu mới trùng cũ hoặc quá ngắn báo lỗi; thành công gọi `onDone`; `forced` ẩn mọi điều hướng khác. Chạy → FAIL.
- [ ] **Step 2:** Implement. Giữ `StaffLogin` cho `#admin` (đã có).
- [ ] **Step 3:** Chạy test → PASS. Commit `feat(web): account login with invite-code trial option and forced password change`.

### Task 4: Vỏ ứng dụng theo vai trò và trang Tài khoản

**Files:**
- Modify: `apps/web/src/learner/AppShell.tsx`, `apps/web/src/learner/AppShell.test.tsx`, `apps/web/src/pilot/PilotApp.tsx` (điều hướng/route `account`)
- Create: `apps/web/src/learner/Account.tsx`, `apps/web/src/learner/Account.test.tsx`, `apps/web/src/learner/account.css`, `apps/web/src/learner/TrialNudge.tsx`, `apps/web/src/learner/ManagerNotice.tsx`

**Interfaces:**
- Consumes: `kindOf`, `api` (PATCH `/me`), `ChangePassword` (Task 3), `clearMe`.
- Produces: `AppShell` thêm prop `kind: Kind` và `userName?: string`; thanh điều hướng theo vai trò: `student` có Học, Thư viện, Ôn tập, Tiến độ và lối vào Tài khoản; `trial` chỉ có Học và Thư viện; `manager` chỉ Thư viện; nhân viên như cũ; vẫn đúng một thanh điều hướng mỗi breakpoint. `Account` (route `account`, chỉ `student`): hiển thị tên hiển thị có thể sửa (≤ 80 ký tự, `PATCH /me`), nút đổi mật khẩu (dùng `ChangePassword` không bắt buộc), dòng báo rõ "Quản lý xem được tiến độ học của bạn", nút Đăng xuất. `TrialNudge`: khối "Đăng nhập để lưu tiến độ" cho học thử, kèm nút tới đăng nhập (đăng xuất phiên mã mời và mở màn tài khoản). `ManagerNotice`: thông báo ngắn "Trang quản lý sẽ có ở bản sau" cho `manager` ở Trang chủ.
- Đăng xuất gọi `clearMe()` trước khi đổi `auth`.

- [ ] **Step 1: Test.** `AppShell.test.tsx`: tab hiển thị đúng theo từng `kind`; chỉ một `nav` được hiển thị mỗi breakpoint. `Account.test.tsx`: sửa tên gọi `PATCH /me` với đúng thân; quá 80 ký tự bị chặn; hiện dòng quản lý xem được tiến độ; đăng xuất gọi `clearMe`. Chạy → FAIL.
- [ ] **Step 2:** Implement; `PilotApp` đưa `kind` vào shell, thêm route `account`, route không hợp lệ cho vai trò (ví dụ `review` với `trial`) quay về `home` thay vì hiện trang lỗi.
- [ ] **Step 3:** Chạy test → PASS. Commit `feat(web): role-aware shell and account page`.

### Task 5: Trang chủ từ `/me/home` (học viên) và trang chủ rút gọn (học thử)

**Files:**
- Modify: `apps/web/src/learner/Home.tsx`, `apps/web/src/learner/Home.test.tsx`, `apps/web/src/pilot/PilotApp.tsx` (props của `Home`, hàm `start`, `resume`)
- Test: thêm ca vào `Home.test.tsx`

**Interfaces:**
- Consumes: `useMe<MeHome>('/me/home', userId)`; `MeHome` gồm `releaseId, internal, learnable, haul: OverviewItem[], cast: CastPlan, due, skills, activeSessionId`.
- Produces: `Home` props mới `{ kind: 'student' | 'trial'; userId?: string; pending: boolean; onStart: StartSession; onResume?: (sessionId: string) => Promise<void>; onOpenLibrary(taxon): void }` (bỏ `ledger`, `now`, `onVersion`). Học viên: mẻ hôm nay, kế hoạch "Thả lưới" (`cast.kind === 'review'` mở phiên `mode: 'review'` **không gửi `reviewTargets`**, server tự chọn; `flashcard` mở flashcard của `revisionId`; `done` hiện trạng thái xong), phao tiến độ 4 kỹ năng, nút "Tiếp tục" khi `activeSessionId` có. Học thử: chỉ phần chọn chế độ học/chọn loài như hiện nay cộng `TrialNudge`; **không gọi `/me/*`**.
- Lỗi mạng khi làm mới: giữ nội dung đang hiện và hiện `ErrorNote` nhỏ.

- [ ] **Step 1: Test.** Home học viên với `MeHome` giả: hiện mẻ hôm nay đúng số loài; `cast.kind==='review'` bấm "Thả lưới" gọi `onStart('review', undefined, 'en', undefined, undefined)` (không có `reviewTargets`); có `activeSessionId` thì có nút "Tiếp tục"; Home học thử không gọi `fetch('/api/v1/me/...')` (theo dõi `fetch`). Chạy → FAIL.
- [ ] **Step 2:** Implement; tạm giữ `Review/Progress/Library` chạy với ledger cho tới task sau chỉ khi cần để build không vỡ (nếu cần, truyền cầu nối tạm và xóa ở Task 9).
- [ ] **Step 3:** Chạy test → PASS. Commit `feat(web): home from /me/home with trial variant`.

### Task 6: Ôn tập từ `/me/review` và trạng thái loài của Thư viện từ `/me/mastery`

**Files:**
- Modify: `apps/web/src/learner/Review.tsx`, `apps/web/src/learner/Library.tsx`, `apps/web/src/learner/Library.test.tsx`, `apps/web/src/pilot/PilotApp.tsx`
- Create: `apps/web/src/learner/Review.test.tsx`

**Interfaces:**
- Consumes: `useMe<MeReview>('/me/review', userId)` (`{ due: MeReviewEntry[]; scheduled: MeReviewEntry[] }`, `dueAt` đã là hạn hiệu lực), `useMe<MeMastery>('/me/mastery', userId)`.
- Produces: `Review` props `{ userId: string; pending: boolean; onStart: StartSession }`: nhóm theo loài (`itemId`), nhãn kỹ năng (`skillLabel` chuyển sang `groups.ts` hoặc file nhỏ), nút "Ôn n mục" gọi `onStart('review', undefined, 'en', undefined, undefined)` với `limit` tối đa 30 qua tham số mới `limit?: number` của `StartSession`; mục `itemId === null` (HS) hiện nhãn hồ sơ. `Library` nhận `mastery: MeMastery | null` (học thử/quản lý: `null`, không hiện mức nhớ và **không gọi API**).
- `StartSession` thêm tham số `limit?: number` chuyển thành `limit` trong thân `POST /learning/sessions`.

- [ ] **Step 1: Test.** `Review.test.tsx`: tách "đến hạn" và "đã lên lịch" đúng theo dữ liệu giả; nút "Ôn n mục" gửi `limit` ≤ 30 và không gửi `reviewTargets`; trạng thái rỗng. `Library.test.tsx`: có `mastery` thì chip trạng thái đúng; `null` thì không có chip và không có yêu cầu `/me/mastery`. Chạy → FAIL.
- [ ] **Step 2:** Implement. Chạy test → PASS. Commit `feat(web): review and library status from /me endpoints`.

### Task 7: Tiến độ và Thành tích từ `/me/progress`

**Files:**
- Modify: `apps/web/src/learner/Progress.tsx`, `apps/web/src/pilot/PilotApp.tsx`
- Create: `apps/web/src/learner/Achievements.tsx`, `apps/web/src/learner/Achievements.test.tsx`, `apps/web/src/learner/Progress.test.tsx`, `apps/web/src/learner/achievements.css`

**Interfaces:**
- Consumes: `useMe<MeProgress>('/me/progress', userId)` = `{ skills, mastery, sessions: MeSessionRow[], achievements: { streak: { current; longest }, badges: MeBadge[] }, figures }`.
- Produces: `Progress` props `{ userId: string }` hiển thị thang mức nhớ (`MasteryScales`), 4 thanh kỹ năng, lịch sử 5 phiên (`sessions[].mode` là mã: `review|flashcard|match|image|hs|listening` → nhãn tiếng Việt), `figures`; `Achievements` (props `{ streak, badges }`): chuỗi ngày hiện tại và dài nhất, huy hiệu đã đạt (có ngày `earnedAt`) và chưa đạt (mờ, có nhãn tiến tới; không giả vờ đã đạt), tôn trọng giảm chuyển động. Giờ hiển thị theo `Asia/Ho_Chi_Minh`.
- Không còn gọi `recentSessions` hoặc đọc `ledger`.

- [ ] **Step 1: Test.** `Achievements.test.tsx`: huy hiệu `earnedAt: null` hiển thị là chưa đạt, `earnedAt` có ngày hiển thị đã đạt; chuỗi 0 hiện câu mời học hôm nay; nhãn mode tiếng Việt đúng. `Progress.test.tsx`: dựng đúng từ `MeProgress` giả, không có yêu cầu mạng khác. Chạy → FAIL.
- [ ] **Step 2:** Implement. Chạy test → PASS. Commit `feat(web): progress and achievements from /me/progress`.

### Task 8: Study, Tổng kết, hàng đợi gửi nền và tải trước (không còn ledger)

**Files:**
- Modify: `apps/web/src/learner/study/Study.tsx`, `apps/web/src/learner/study/HaulSummary.tsx`, `apps/web/src/learner/study/summary.ts`, `apps/web/src/learner/study/summary.test.ts`, `apps/web/src/learner/study/QuestionView.tsx`, `apps/web/src/pilot/PilotApp.tsx` (phiên, `record`)
- Create: `apps/web/src/learner/study/submitQueue.ts`, `apps/web/src/learner/study/submitQueue.test.ts`, `apps/web/src/learner/study/useSessionSummary.ts`

**Interfaces:**
- Consumes: `Score.progress` (Task 2), `SessionSummaryResponse` (`{ total, caught, entries: { targetId, label, correct, skipped, nextReviewInDays }[] }`), `StartSession`.
- Produces:
  - `summarizeHaul(game: Game, progress: ProgressEntry[]): HaulSummary` (thay `ledger`): giữ `caught/missed/total/title`, `days` tính từ `dueAt` nhỏ nhất của các mục đã chấm trong phiên (làm tròn, tối thiểu 1); không có `progress` (học thử) thì `days = null`; mục có `targetId === 'matching'` (câu ghép bị bỏ qua) không tạo liên kết và hiển thị là một dòng "Ghép tên · bỏ qua".
  - `useSessionSummary(gameId: string, enabled: boolean)`: gọi `GET /learning/sessions/:id/summary` **chỉ khi** phiên được mở lại sau tải trang và kết quả chưa mang `progress`; dùng `nextReviewInDays`.
  - `createSubmitQueue(send: (job: Job) => Promise<Score>, opts?: { retryMs?: number[] })`: `enqueue(job): void` (một việc mỗi câu, khóa theo `questionId`, bấm đúp không thêm), gửi tuần tự, thử lại có giãn cách khi lỗi mạng hoặc 409/5xx với **cùng khóa idempotency**, dừng thử lại với 4xx khác và báo lỗi; `pendingCount(): number`; `subscribe(fn)`; `flush(): Promise<void>`.
  - `QuestionView`: thẻ tự đánh giá ("Chưa nhớ / Đã nhớ") cập nhật giao diện ngay và đẩy việc vào hàng đợi (câu cần đáp án đúng từ server — ghép tên, đoán hình, HS, nghe — vẫn chờ phản hồi như cũ); hiện dấu "đang lưu" nhỏ khi còn việc chờ; tải trước ảnh của câu kế tiếp trong lúc người học trả lời câu hiện tại; `beforeunload` cảnh báo khi `pendingCount() > 0`.
  - `Study`/`HaulSummary`: bỏ prop `ledger`; Tổng kết hiện "Đang lưu…" tới khi `pendingCount() === 0`; `onRetry` làm lại câu sai qua `reviewOf` như cũ.
  - `PilotApp`: bỏ `loadLedger/mergeScore/mergeGame`, cờ `saved`, cảnh báo ledger hỏng. `student` mở lại phiên đang dở qua `MeHome.activeSessionId`; học thử giữ id phiên trong `sessionStorage` (chỉ trong tab) để tải lại trang vẫn mở lại được phiên đang học.

- [ ] **Step 1: Test.** `submitQueue.test.ts` (đồng hồ giả): hai lần `enqueue` cùng `questionId` chỉ gửi một lần; lỗi mạng rồi thành công thì dùng đúng khóa idempotency cũ; 409 được thử lại, 400 thì dừng và báo lỗi; thứ tự gửi giữ nguyên; `flush()` đợi hết. `summary.test.ts`: dựng từ `Game` và `progress` giả (đã bắt, sổng lưới, bỏ qua, `matching` giữ chỗ, không `progress` → `days` null). Chạy → FAIL.
- [ ] **Step 2:** Implement hàng đợi và `summary.ts`; nối `QuestionView`, `Study`, `HaulSummary`, `PilotApp`.
- [ ] **Step 3:** Chạy test web → PASS; các test `QuestionView.test.tsx` cũ vẫn pass. Commit `feat(web): study and summary without ledger, background self-rating queue`.

### Task 9: Dọn sổ cục bộ

**Files:**
- Delete: `apps/web/src/learner/ledger.ts`, `ledger.test.ts`, `haul.ts`, `haul.test.ts`, `sessions.ts`, `sessions.test.ts`
- Modify: mọi file còn import chúng (`grep` để tìm), `apps/web/src/pilot/api.ts` (bỏ `writeLocal` nếu không còn ai dùng; giữ `readLocal`/`writeLocal` nếu `QuestionView` còn dùng cho bản nháp)

**Interfaces:**
- Giữ: `apps/web/src/domain/review.ts` và `review-vectors.test.ts` (bộ vector chuẩn chung với API do web sinh ra; không xóa ở vòng này), `skillLabel` (đã chuyển sang file còn lại ở Task 6).
- Mọi mã `localStorage` còn lại chỉ phục vụ bản nháp trả lời, token idempotency của câu, và giao diện sáng/tối.

- [ ] **Step 1:** Xóa các file, sửa import; `grep -rn "seafood-deck:pilot:v1\|loadLedger\|LEDGER_KEY" apps/web/src` không còn kết quả (trừ test e2e sẽ sửa ở Task 10).
- [ ] **Step 2:** `npm test`, `typecheck`, `lint`, `format:check`, `build` pass. Commit `refactor(web): remove browser-side progress ledger and derivation`.

### Task 10: E2E, tài liệu giao hàng và kiểm trực quan

**Files:**
- Modify: `apps/web/e2e/pilot.spec.ts` (đăng nhập, bỏ ca localStorage ledger), `apps/web/e2e/helpers.ts` nếu cần
- Create: `docs/DELIVERY_25B.md`; Modify: `README.md` (một đoạn ngắn)

**Interfaces:**
- E2E tạo một học viên thử `qa-e2e-<time>` qua API quản trị trong `beforeAll` (mật khẩu ngẫu nhiên, đọc bí mật từ `.local/pilot.env` như `helpers`/`smoke-pilot` đã làm, không in); các ca hiện có đăng nhập bằng tài khoản này; **một** ca giữ đăng nhập bằng mã mời để chứng minh học thử (thấy Trang chủ rút gọn, không có tab Ôn tập/Tiến độ).
- Ca bổ sung: học một mẻ rồi xóa `localStorage`/`sessionStorage` và đăng nhập lại, `Tiến độ` vẫn có số liệu (Review Focus 1); tài khoản `mustChangePassword` chỉ vào được màn đổi mật khẩu rồi vào bình thường; đăng xuất rồi đăng nhập người khác không thấy số liệu người trước.
- Các ca "corrupt browser progress" và "blocked progress storage" của sổ cục bộ được thay bằng ca "storage bị chặn không cản trở phiên học" (bản nháp và token vẫn được phép lỗi).

- [ ] **Step 1:** Cập nhật E2E; rebuild stack local (`docker compose --env-file .local/pilot.env up -d --build`, `node scripts/wait-pilot.mjs`); `npm run test:e2e` (desktop và mobile) pass, ghi số liệu thực tế; chỉ dùng stack của repo này (không đụng container khác), không in bí mật.
- [ ] **Step 2: Kiểm trực quan** (đọc ảnh chụp, không click banner cookie): chụp bằng Playwright ở 390×844 và 1280×800 các màn: Đăng nhập (mặc định và học thử), Đổi mật khẩu bắt buộc, Trang chủ học viên, Ôn tập, Tiến độ với Thành tích, Tài khoản, Tổng kết. Ghi nhận lệch phong cách, tràn ngang, mục chạm < 44px vào báo cáo; không tự sửa ngoài phạm vi mà ghi lại.
- [ ] **Step 3:** Viết `docs/DELIVERY_25B.md` (tiếng Việt như `DELIVERY_25A.md`): đã làm gì, luồng đăng nhập, những gì **chưa** làm (không có màn quản lý, không có màn người dùng trong quản trị, chưa có tài khoản An), số liệu test, ghi chú nâng cấp VPS (web mới cần API 2.5a trở lên; học thử bằng mã mời vẫn chạy). Thêm đoạn README.
- [ ] **Step 4:** Cổng đầy đủ pass (`npm test`, `typecheck`, `lint`, `format:check`, `build`, `contract:generate`). Commit `docs: phase 2.5b delivery notes and e2e for account login`.
