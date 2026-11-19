# Giai đoạn 2.5a: nền tảng tài khoản và tiến độ phía server: kế hoạch triển khai

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Server giữ tài khoản người học (`student`, `manager`), nhật ký trả lời bền theo người, trạng thái ôn tập suy ra từ nhật ký, và các API `/me/*`. Trình duyệt chưa đổi.

**Architecture:**
- **Logic thuần:** chuyển từ web sang API thành các file phẳng `apps/api/src/progress-*.ts`, kèm bộ vector dùng chung để hai bản không lệch.
- **Ghi nhật ký:** nằm trong giao dịch chấm điểm hiện có của `Learning.submit`.
- **Service và controller mới:** `/me/*`, `/learning/sessions/:id/summary`, phiên ôn do server chọn.
- **Migration:** chỉ cộng thêm.

**Tech Stack:** NestJS 12, Prisma + PostgreSQL, `node:test` (test API biên dịch rồi chạy `dist/*.test.js`), Vitest (web, chỉ cho test parity).

**Spec:** `docs/superpowers/specs/2026-11-19-phase25-learner-accounts-design.md` (đặc biệt mục 8, 8.9). Vòng này chỉ làm **2.5a** (mục 9); 2.5b và 2.5c có kế hoạch riêng.

## Global Constraints

- Migration **chỉ cộng thêm**; không đổi tên hoặc xóa cột. Tạo SQL bằng `npx prisma migrate diff --from-schema-datamodel <schema cũ> --to-schema-datamodel <schema mới> --script` (không cần DB), tên thư mục `apps/api/prisma/migrations/202611190001_learner_accounts/`. Áp dụng được trên DB đang có dữ liệu.
- **File API phải phẳng** trong `apps/api/src/` (không thư mục con): test chạy `node --test dist/*.test.js` và lint chạy `eslint src/*.ts`. Dùng tiền tố `progress-` cho các file logic.
- Các file `progress-*.ts` logic thuần **không import** Nest, Prisma hay file nào khác của API (để web và test dùng được).
- API hiện có tương thích ngược; chỉ **thêm**. Phiên mã mời (`learner`) giữ nguyên hành vi `/learning`. Chạy `npm run contract:generate` và commit `docs/api/openapi.json` nếu đổi.
- `attemptNumber` và `isReview` do **server** suy ra (`GameSession.reviewOfId`, `GameSession.mode`); không tin trình duyệt.
- `contentVersion` của một mục học là **dấu vân tay nội dung**, không phải id release (không đổi khi xuất bản, thêm loài khác, sửa ghi chú, SKU, ảnh).
- Nhật ký `LearningAttempt` **không có khóa ngoại** tới `GameSession`/`Question` (chúng bị xóa theo phiên). Ghi nhật ký và cập nhật `ReviewProgress` trong **cùng giao dịch tuần tự hóa** với việc ghi `Attempt`.
- `student` chỉ đọc dữ liệu của chính mình (id lấy từ phiên). Không lộ `rarity`, `marketPrice`, `hsHints`, `provenance`, `tradeRestriction`. `manager` không xem danh mục nháp.
- Mật khẩu: học viên ≥ 8 ký tự; `manager`/nhân viên ≥ 16. Không in mật khẩu, mã mời, `.local/pilot.env` ở bất kỳ đâu.
- Sau mỗi task: `npm test`, `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run build` (từ thư mục gốc) đều pass.

## Review Focus

1. **Hai lần nộp đồng thời cùng mục và kỹ năng** không được ghi đè hay mất lần nào. → test ở Task 6 (hàm ghi chạy tuần tự hai lần với cùng khóa, kết quả tất định) và kiểm thật ở Task 10.
2. **Xuất bản release mới, hoặc sửa ghi chú/SKU/ảnh của một loài, không làm mất tiến độ; đổi tên hiển thị thì chỉ loài đó ôn lại.** → test dấu vân tay ở Task 4 và test `activeRows` ở Task 3.
3. **Một `student` không đọc được dữ liệu người khác; `student` đã khóa hoặc buộc đổi mật khẩu bị chặn đúng.** → test guard ở Task 7 và Task 9.
4. **Làm lại câu sai (`reviewOfId`) không nâng bậc**, và câu ghép tên ghi một dòng cho mỗi cặp. → test `buildLogRows` ở Task 6.
5. **Chuỗi ngày học qua nửa đêm giờ Việt Nam và qua ngày chuyển tháng.** → test ở Task 5.

---

### Task 1: Schema và migration (chỉ cộng thêm)

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/202611190001_learner_accounts/migration.sql`

**Interfaces:**
- Produces (Prisma, dùng ở các task sau):
  - `User` thêm: `displayName String?`, `disabledAt DateTime?`, `mustChangePassword Boolean @default(false)`, `createdAt DateTime @default(now())`, `lastLoginAt DateTime?`.
  - `GameSession` thêm: `reviewOfId String?` (không FK).
  - Model `LearningAttempt`: `id String @id @default(uuid())`, `userId String`, `sessionId String`, `questionId String`, `targetId String`, `skill String`, `mode String`, `isReview Boolean`, `attemptNumber Int`, `correct Boolean`, `skipped Boolean`, `selfRated Boolean`, `contentVersion String`, `releaseId String`, `label String`, `at DateTime`. `@@unique([questionId, targetId])`, `@@index([userId, at])`, `@@index([userId, targetId, skill])`. **Không** có quan hệ tới `GameSession`/`Question`.
  - Model `ReviewProgress`: `userId String`, `targetId String`, `skill String`, `stage Int`, `dueAt DateTime`, `lastAttemptAt DateTime`, `lastSessionId String`, `contentVersion String`, `selfRated Boolean`. `@@id([userId, targetId, skill])`, `@@index([userId, dueAt])`.
  - `userId` ở hai bảng mới tham chiếu `User.id` (có `@relation`, `onDelete: Cascade`: xóa người dùng xóa nhật ký của họ).

- [ ] **Step 1:** Sửa `schema.prisma` đúng như trên. Tạo SQL bằng `prisma migrate diff` (schema cũ lấy từ `git show HEAD:apps/api/prisma/schema.prisma` ghi ra file tạm) và đặt vào thư mục migration.
- [ ] **Step 2:** `npm run build --workspace @seafoodeck/api` (chạy `prisma generate` và `tsc`) pass.
- [ ] **Step 3: Kiểm tra migration trên DB trống và DB có dữ liệu.** Rebuild stack local (`docker compose --env-file .local/pilot.env up -d --build`), `docker compose --env-file .local/pilot.env run --rm migrate` kết thúc không lỗi và DB local cũ (đã có dữ liệu) vẫn mở được app. Không in giá trị `.local/pilot.env`.
- [ ] **Step 4:** Commit `feat(api): schema for learner accounts, durable attempt log and review progress`.

### Task 2: Logic lịch ôn chuyển sang API và bộ vector chung

**Files:**
- Create: `apps/api/src/progress-review.ts`, `apps/api/src/progress-review.test.ts`, `apps/api/src/progress-review.vectors.json`, `apps/web/src/domain/review-vectors.test.ts`

**Interfaces:**
- Produces (`progress-review.ts`, thuần, không import):

```ts
export const DAY: number;
export const INTERVAL_DAYS: readonly number[];            // [1, 3, 7, 14]
export interface ReviewAttempt { sessionId: string; targetId: string; skill: string; contentVersion: string; attemptNumber: number; correct: boolean; selfRated: boolean; isReview: boolean; at: string }
export interface ReviewRow { targetId: string; skill: string; stage: number; dueAt: string; lastSessionId: string; contentVersion: string; selfRated: boolean; lastAttemptAt: string }
export function scheduleReview(previous: ReviewRow | undefined, attempt: ReviewAttempt): ReviewRow
export function effectiveDueAt(row: ReviewRow): string    // max(dueAt, lastAttemptAt + INTERVAL_DAYS[stage] ngày)
```

  `scheduleReview` giữ **đúng** hành vi của `apps/web/src/domain/review.ts` (cùng điều kiện `canAdvance`, cùng cách giữ `dueAt`); khác biệt duy nhất: kết quả có thêm `lastAttemptAt = attempt.at`.
- `apps/api/src/progress-review.vectors.json`: mảng `{ name, steps: ReviewAttempt[], expected: ReviewRow[] }` (mỗi bước ra một `ReviewRow`, bỏ `lastAttemptAt` khi so với bản web).

- [ ] **Step 1: Viết bộ vector.** Tối thiểu các ca: học lần đầu ngày 0 (đến hạn ngày 1); ôn đúng sau hạn ở phiên sau (bậc 0→1, hạn +3 ngày); thẻ tự đánh giá đúng không nâng bậc và giữ `dueAt` cũ; sai về bậc 0; `attemptNumber = 2` không nâng bậc; cùng phiên không nâng bậc; đổi `contentVersion` đặt lại về bậc 0; bậc 3 giữ nguyên ở bậc 3 (hạn +14 ngày); 200 chuỗi ngẫu nhiên có hạt giống cố định (seed ghi trong file) do **test web** sinh ra bằng `scheduleReview` của web.
- [ ] **Step 2: Test web** `review-vectors.test.ts`: chạy từng vector qua `scheduleReview` của web và so với `expected` (bỏ `lastAttemptAt`); thêm một test "file vector đã cập nhật" sinh lại 200 chuỗi ngẫu nhiên trong bộ nhớ rồi so với file trong repo đọc bằng `fs` (đường dẫn tương đối từ gốc repo). Chạy → FAIL (chưa có file).
- [ ] **Step 3:** Viết file vector (sinh bằng một lần chạy test ở chế độ ghi hoặc script nhỏ), chạy test web → PASS.
- [ ] **Step 4: Test API** `progress-review.test.ts`: nạp `../src/progress-review.vectors.json` (đọc bằng `fs` từ `__dirname`), chạy `scheduleReview` của API, khẳng định giống từng `expected` kể cả `lastAttemptAt = at` của bước đó; và `effectiveDueAt`: ngày 0 học → ngày 2 tự đánh giá đúng (bậc 0) → `effectiveDueAt` = ngày 3, không phải ngày 1. Chạy → FAIL.
- [ ] **Step 5:** Implement `progress-review.ts`. Chạy test API và web → PASS.
- [ ] **Step 6:** Commit `feat(api): port review scheduling with shared parity vectors`.

### Task 3: Logic suy ra tiến độ chuyển sang API

**Files:**
- Create: `apps/api/src/progress-derive.ts`, `apps/api/src/progress-derive.test.ts`

**Interfaces:**
- Consumes: `ReviewRow`, `effectiveDueAt` (Task 2).
- Produces (thuần; chép logic và test từ `apps/web/src/learner/haul.ts` và `haul.test.ts`, đổi kiểu dữ liệu, giữ nguyên hành vi):

```ts
export interface OverviewItem { revisionId: string; itemId: string; vi: string; scientific: string; taxonomicGroup: string | null; imageId: string | null }
export interface OverviewData { items: OverviewItem[]; learnable: number; hsCases: number }
export type VersionOf = (targetId: string) => string | undefined;     // dấu vân tay hiện hành của mục/hồ sơ; undefined = không còn trong bản hiện hành
export function activeRows(rows: ReviewRow[], versionOf: VersionOf): ReviewRow[]   // bỏ hàng có contentVersion khác versionOf(targetId) hoặc không còn tồn tại
export function itemStatus(itemId: string, rows: ReviewRow[], now: number): 'new' | 'due' | 'learning'
export function dueTargets(rows: ReviewRow[], now: number, limit: number): { targetId: string; skill: string }[]   // sớm nhất trước, theo effectiveDueAt
export function pickHaul(o: OverviewData, rows: ReviewRow[], now: number, max?: number): OverviewItem[]
export type CastPlan = { kind: 'review'; targets: { targetId: string; skill: string }[] } | { kind: 'flashcard'; revisionId: string } | { kind: 'done' }
export function planCast(o: OverviewData, rows: ReviewRow[], now: number): CastPlan          // ôn tối đa 8
export function skillProgress(o: OverviewData, rows: ReviewRow[]): { key: 'en' | 'ja' | 'scientific' | 'hs'; label: string; done: number; total: number }[]
export function masteryLevel(rows: ReviewRow[], itemId: string): 0 | 1 | 2 | 3 | 4
export function masteryCounts(o: OverviewData, rows: ReviewRow[]): { unlearned: number; level1: number; level2: number; level3: number; level4: number }
```

  Kỹ năng tính vào "đang học/đã vững": `name:*`, `match:*`, `image`, `hs` (không tính `listening`). Nhãn: 'Tiếng Anh', 'Tiếng Nhật', 'Tên khoa học', 'HS dạng hàng'.

- [ ] **Step 1: Test.** Chuyển các ca từ `haul.test.ts` (sổ rỗng → flashcard đầu tiên; 10 mục đến hạn → 8 mục theo hạn tăng dần; tất cả đã học và không đến hạn → `done`; id lạ không làm `done` vượt `total`; `masteryLevel` 0..4). Thêm: `activeRows` bỏ hàng có dấu vân tay cũ (đổi tên loài → loài đó thành 'new', các loài khác giữ nguyên); `listening` không làm loài thành 'learning'; mục tự đánh giá đã ôn sau hạn không bị xếp 'due' lại ngay (dùng `effectiveDueAt`). Chạy → FAIL.
- [ ] **Step 2:** Implement `progress-derive.ts`. Chạy → PASS.
- [ ] **Step 3:** Commit `feat(api): port learner progress derivation (haul, casting, skills, mastery)`.

### Task 4: Dấu vân tay nội dung

**Files:**
- Create: `apps/api/src/progress-fingerprint.ts`, `apps/api/src/progress-fingerprint.test.ts`

**Interfaces:**
- Produces (thuần):

```ts
export function itemFingerprint(names: { kind: string; label: string }[]): string         // băm ổn định của bốn tên hiển thị (vi, en, ja, scientific)
export function scenarioFingerprint(data: { prompt?: string; options?: { label: string; correct: boolean }[]; followUps?: { label: string; correct: boolean }[] }): string
```

  Băm bằng `node:crypto` sha256, chuẩn hóa (cắt khoảng trắng, sắp xếp theo `kind`/nhãn) để thứ tự đầu vào không đổi kết quả.

- [ ] **Step 1: Test.** Cùng bốn tên, khác thứ tự mảng → cùng kết quả; đổi một nhãn → khác; thêm trường lạ vào đầu vào (ghi chú, SKU, id ảnh) → không đổi; `scenarioFingerprint` đổi khi đổi đề hoặc đáp án, không đổi khi đổi thứ tự lựa chọn. Chạy → FAIL.
- [ ] **Step 2:** Implement. Chạy → PASS.
- [ ] **Step 3:** Commit `feat(api): stable content fingerprints for learning targets`.

### Task 5: Thành tích, chuỗi ngày và lịch sử phiên

**Files:**
- Create: `apps/api/src/progress-achievements.ts`, `apps/api/src/progress-achievements.test.ts`

**Interfaces:**
- Produces (thuần):

```ts
export interface LogRow { sessionId: string; targetId: string; skill: string; mode: string; isReview: boolean; attemptNumber: number; correct: boolean; skipped: boolean; selfRated: boolean; label: string; at: string }
export function dayKey(iso: string): string                                     // 'YYYY-MM-DD' theo Asia/Ho_Chi_Minh
export function streakDays(rows: LogRow[], now: number): { current: number; longest: number }   // ngày có ít nhất một dòng không bỏ qua
export interface SessionSummary { sessionId: string; at: string; mode: string; answered: number; firstTry: number; selfRated: number; percent: number | null }
export function recentSessions(rows: LogRow[], limit?: number): SessionSummary[]    // mặc định 5, mới nhất trước; mode: 'review' nếu isReview, còn lại theo skill (name → flashcard, match, image, hs, listening)
export interface Badge { id: string; label: string; earnedAt: string | null }
export function badges(stats: { species: number; solid: number; reviewSessions: number; streak: number; at: string[] }): Badge[]
export function figures(rows: LogRow[]): { answered: number; firstTryPercent: number | null; selfRated: number }
```

  Huy hiệu (cấu hình trong code): `first10` (10 loài đầu tiên), `streak7` (7 ngày liên tiếp), `solid50` (50 loài ở bậc ≥ 2), `species100` (100 loài), `review10` (10 phiên ôn). `figures`: cùng cách chia như màn Tiến độ hiện nay (đã trả lời tự động / đúng lần đầu / tự đánh giá).

- [ ] **Step 1: Test.** Chuỗi qua nửa đêm giờ Việt Nam (23:59 và 00:01 UTC+7 là hai ngày kế tiếp), qua cuối tháng, ngày bị đứt thì `current` về 0 sau hôm nay không học nhưng `longest` giữ; `recentSessions` gộp theo `sessionId`, tự đánh giá tách riêng, `percent` null khi chưa chấm câu nào; `badges` trả `earnedAt` null khi chưa đạt. Chạy → FAIL.
- [ ] **Step 2:** Implement. Chạy → PASS.
- [ ] **Step 3:** Commit `feat(api): learner achievements, streaks and session history`.

### Task 6: Ghi nhật ký và trạng thái ôn trong giao dịch chấm điểm

**Files:**
- Create: `apps/api/src/progress-record.ts`, `apps/api/src/progress-record.test.ts`
- Modify: `apps/api/src/learning.ts` (hàm `submit`, đoạn tạo `Attempt` ~dòng 595-625)

**Interfaces:**
- Consumes: `scheduleReview` (Task 2), `itemFingerprint`/`scenarioFingerprint` (Task 4).
- Produces:

```ts
export interface SubmitContext { userId: string; sessionId: string; questionId: string; mode: string; releaseId: string; reviewOfId: string | null; at: string }
export interface LogDraft { targetId: string; skill: string; correct: boolean; skipped: boolean; selfRated: boolean; label: string; contentVersion: string }
// thuần: từ kết quả chấm (đã có trong `result`) và bảng tra dấu vân tay thành các dòng nhật ký
export function buildLogRows(ctx: SubmitContext, result: { skill: string; skipped: boolean; correct: boolean; selfRated: boolean; targetId: string; targetLabel?: string; items?: { targetId: string; correct: boolean; label?: string }[] }, versionOf: (targetId: string) => string | undefined): (LogDraft & { attemptNumber: number; isReview: boolean })[]
export async function recordAttempt(tx: Prisma.TransactionClient, ctx: SubmitContext, rows: ReturnType<typeof buildLogRows>): Promise<ReviewRow[]>   // ghi LearningAttempt (bỏ qua nếu trùng (questionId, targetId)), cập nhật ReviewProgress bằng scheduleReview; trả về các hàng mới
export async function rebuildProgress(db: Db | Prisma.TransactionClient, userId?: string): Promise<{ users: number; rows: number }>   // dựng lại ReviewProgress từ LearningAttempt theo thứ tự thời gian
```

  - `attemptNumber` = 2 nếu `ctx.reviewOfId` khác null, ngược lại 1. `isReview` = `ctx.mode === 'review'`.
  - Câu ghép tên: một dòng cho mỗi phần tử `result.items`; các loại khác: một dòng với `result.targetId`. Câu bỏ qua: có dòng nhật ký (`skipped: true`) nhưng **không** cập nhật `ReviewProgress`.
  - `versionOf` trả dấu vân tay của `Item` (từ tên của revision trong release của phiên) hoặc của hồ sơ HS; mục không tra được thì bỏ dòng đó.
- `learning.ts` `submit`: khi `actor.userId` có và vai trò `student`, trong cùng `$transaction` (đặt `isolationLevel: 'Serializable'`) với `attempt.create`: tra dấu vân tay, gọi `buildLogRows` và `recordAttempt`. Khi giao dịch đụng độ tuần tự (P2034) thì thử lại tối đa 3 lần.
- `rebuildProgress`: có lệnh chạy được `node dist/rebuild-progress.js` (file `apps/api/src/rebuild-progress.ts`, đọc `DATABASE_URL`, in số liệu) và script npm `rebuild:progress` trong `apps/api/package.json`.

- [ ] **Step 1: Test `buildLogRows`.** Câu flashcard tự đánh giá đúng → một dòng `selfRated: true`; câu ghép tên có `items` (3 cặp, 2 đúng 1 sai) → 3 dòng; câu bỏ qua → dòng `skipped: true`; phiên có `reviewOfId` → `attemptNumber = 2`; phiên `mode: 'review'` → `isReview: true`; mục không tra được dấu vân tay bị bỏ. Chạy → FAIL.
- [ ] **Step 2: Test tuần tự và dựng lại.** Với một `tx` giả bằng bộ nhớ (map đơn giản triển khai các lời gọi `learningAttempt.createMany`/`reviewProgress.upsert/findUnique` mà `recordAttempt` dùng): ghi hai lần liên tiếp cùng `(questionId, targetId)` chỉ tạo một dòng; hai kỹ năng khác nhau của cùng mục tạo hai hàng tiến độ; chuỗi 6 lần trả lời tạo ra cùng `ReviewProgress` với `scheduleReview` áp lần lượt; `rebuildProgress` từ nhật ký cho kết quả y hệt hàng đã ghi. Chạy → FAIL.
- [ ] **Step 3:** Implement `progress-record.ts`, sửa `submit`, thêm `rebuild-progress.ts` và script npm. Chạy test → PASS; toàn bộ test API cũ vẫn pass.
- [ ] **Step 4:** Xác nhận `apps/api/src/maintenance.ts` (đã dọn `GameSession` và `AuthSession` hết hạn) **không** đụng tới `LearningAttempt` và `ReviewProgress` (chúng không có khóa ngoại tới hai bảng đó); thêm một test nhỏ hoặc ghi chú trong báo cáo task nêu rõ bằng chứng (xóa phiên không xóa nhật ký). Việc đăng nhập lại xóa `AuthSession` cũ (`auth.controller.ts`) cũng phải không mất nhật ký.
- [ ] **Step 5:** Commit `feat(api): durable per-user attempt log and review progress written in the grading transaction`.

### Task 7: Vai trò, đăng nhập an toàn, `/me` hồ sơ và đổi mật khẩu

**Files:**
- Modify: `apps/api/src/security.ts` (guard, `LoginLimiter`), `apps/api/src/auth.controller.ts`, `apps/api/src/admin-extra.controller.ts` (`POST /admin/users`), `apps/api/src/contract.ts`, `apps/api/src/modules.ts`
- Create: `apps/api/src/me.controller.ts`, `apps/api/src/me-access.test.ts`

**Interfaces:**
- Produces:
  - Vai trò chuỗi `student`, `manager` (thêm vào các danh sách vai trò hợp lệ; `AdminOnlyGuard` **không** thêm `student`/`manager`).
  - `export function requireStudent(req: ActorRequest): void` và `requireManager(req)` (manager hoặc admin) trong `security.ts`.
  - `LoginLimiter.check(ip: string, username?: string)`: giới hạn 20 lần/10 phút theo IP **và** 10 lần/10 phút theo tên (chữ thường).
  - `AuthController.login`: tài khoản có `disabledAt` → 401 như sai mật khẩu (không lộ lý do); đăng nhập thành công cập nhật `lastLoginAt`; xóa các `AuthSession` cũ của người đó khi khóa (dùng ở 2.5c).
  - `GET /auth/me` trả thêm `displayName`, `mustChangePassword`, `userId` (chỉ khi đã đăng nhập bằng tài khoản).
  - Guard `MustChangePasswordGuard` (toàn cục, đăng ký trong `modules.ts`): khi phiên thuộc người dùng có `mustChangePassword` thì chỉ cho `GET /auth/me`, `POST /auth/logout`, `GET /me`, `POST /me/password`; mọi route khác trả 403 `{ message: 'Cần đổi mật khẩu trước.', code: 'MUST_CHANGE_PASSWORD' }`.
  - `GET /me` → `{ username, displayName, role, mustChangePassword }`; `PATCH /me` (`displayName` ≤ 80 ký tự); `POST /me/password` (`current`, `next`; `next` ≥ 8 ký tự với `student`, ≥ 16 với vai trò khác; xóa cờ `mustChangePassword`, thu hồi các phiên khác của người đó).
  - `POST /admin/users`: DTO riêng cho từng nhóm vai trò: `student` (mật khẩu ≥ 8, `mustChangePassword` mặc định `false`, tham số `mustChangePassword` tùy chọn), `manager`, và ba vai trò nhân viên cũ (≥ 16). Chỉ `admin` gọi được; ghi `Audit` `user.create`.

- [ ] **Step 1: Test.** `me-access.test.ts` kiểm các hàm thuần và guard dựng bằng đối tượng giả: `requireStudent` từ chối `learner` (mã mời), `manager`, `guest`; `requireManager` cho `manager` và `admin`; `LoginLimiter`: 11 lần sai cùng tên (IP khác nhau) bị chặn ở lần thứ 11, tên khác vẫn vào được; `MustChangePasswordGuard` chặn route lạ và cho `POST /me/password`; DTO mật khẩu học viên 7 ký tự bị từ chối, 8 ký tự được; vai trò nhân viên 15 ký tự bị từ chối. Chạy → FAIL.
- [ ] **Step 2:** Implement. Chạy → PASS; test API và E2E cũ không đổi hành vi (`learner` mã mời vẫn vào được).
- [ ] **Step 3:** Commit `feat(api): student and manager roles, safer login, profile and password change`.

### Task 8: Phiên ôn do server chọn, `reviewOfId` và tổng kết phiên

**Files:**
- Create: `apps/api/src/progress.service.ts`, `apps/api/src/progress-service.test.ts`
- Modify: `apps/api/src/learning.ts` (`start`, `submit` dùng `reviewOfId`), `apps/api/src/controllers.ts` (`LearningController`, DTO `StartDto`), `apps/api/src/modules.ts`, `apps/api/src/contract.ts`

**Interfaces:**
- Consumes: Task 3 (`dueTargets`, `activeRows`), Task 4, Task 6.
- Produces (`progress.service.ts`, injectable):

```ts
@Injectable() export class ProgressService {
  context(actor: AuthSession): Promise<{ overview: OverviewData; rows: ReviewRow[]; versionOf: VersionOf; releaseId: string; internal: boolean }>   // danh mục qua Catalog.overview(actor), hàng ReviewProgress của userId, đã lọc bằng activeRows
  dueForReview(actor: AuthSession, limit: number): Promise<{ targetId: string; skill: string }[]>
}
```

  - `POST /learning/sessions` với `mode: 'review'`: nếu actor là `student` thì bỏ qua `reviewTargets` do trình duyệt gửi và chọn `dueForReview(limit)` (`limit` mặc định 8, tối đa 30, tham số `limit` mới tùy chọn trong DTO); không có mục đến hạn → 400 'Chưa có mục nào đến hạn ôn.'. Với vai trò khác hành vi cũ không đổi. Mục mất đủ dữ liệu bị bỏ qua im lặng khi server chọn.
  - `GameSession.reviewOfId` được đặt khi tạo phiên làm lại câu sai (`reviewOf` có sẵn trong `start`); `submit` đọc nó để dựng `SubmitContext` (Task 6).
  - `GET /learning/sessions/:id/summary` (mọi người dùng đã đăng nhập, chỉ phiên của mình): `{ total: number; caught: number; entries: { targetId: string; label: string; correct: boolean; skipped: boolean; nextReviewInDays: number | null }[] }`; `nextReviewInDays` lấy từ `ReviewProgress` (null với phiên mã mời hoặc câu bỏ qua).
  - Phản hồi chấm điểm của `submit` cho `student` có thêm `progress: { targetId: string; skill: string; stage: number; dueAt: string; level: 0 | 1 | 2 | 3 | 4 }[]` (đọc từ `ReviewProgress` sau khi ghi, cả đường phát lại); không đổi với vai trò khác.

- [ ] **Step 1: Test.** `progress-service.test.ts` với bản giả của `Db` tối thiểu: `dueForReview` chỉ trả mục đến hạn theo hạn hiệu lực, tối đa `limit`, bỏ hàng có dấu vân tay cũ; `student` gửi `reviewTargets` thì bị bỏ qua; phiên với `reviewOf` mang `reviewOfId`. Chạy → FAIL.
- [ ] **Step 2:** Implement và nối vào `LearningController`; cập nhật `contract.ts`. Chạy → PASS.
- [ ] **Step 3:** Commit `feat(api): server-chosen review sessions, retry link and session summary`.

### Task 9: API `/me/*`

**Files:**
- Modify: `apps/api/src/me.controller.ts`, `apps/api/src/progress.service.ts`, `apps/api/src/contract.ts`
- Test: `apps/api/src/me-access.test.ts` (mở rộng), `apps/api/src/progress-service.test.ts` (mở rộng)

**Interfaces:**
- Produces (tất cả yêu cầu `student`; `learner` (mã mời) nhận 403 'Đăng nhập tài khoản để xem tiến độ.'):
  - `GET /me/home` → `{ releaseId; internal; learnable: number; haul: OverviewItem[]; cast: CastPlan; due: number; skills: ReturnType<typeof skillProgress>; activeSessionId: string | null }` (`activeSessionId`: phiên chưa hết hạn gần nhất còn câu chưa nộp).
  - `GET /me/review` → `{ due: ReviewEntry[]; scheduled: ReviewEntry[] }` với `ReviewEntry = { targetId; itemId: string | null; label: string; skill: string; stage: number; dueAt: string }` (`dueAt` là hạn hiệu lực).
  - `GET /me/progress` → `{ skills; mastery: ReturnType<typeof masteryCounts>; sessions: SessionSummary[]; achievements: { streak: { current: number; longest: number }; badges: Badge[] }; figures: ReturnType<typeof figures> }`.
  - `GET /me/mastery` → `Record<string, { status: 'new' | 'due' | 'learning'; level: 0 | 1 | 2 | 3 | 4 }>` theo `itemId` của danh mục hiện hành.
  - Mọi truy vấn lấy `userId` từ phiên; danh mục luôn qua `Catalog.overview(actor)` (đúng phạm vi công khai/nội bộ của phiên).

- [ ] **Step 1: Test.** Với `Db` giả: `learner`, `manager` và khách bị từ chối; hai `student` khác nhau chỉ thấy dữ liệu của mình (hai bộ hàng khác nhau cho hai kết quả khác nhau); `/me/mastery` đúng trạng thái 'new/due/learning' theo `effectiveDueAt`; `/me/progress` có `figures` và `sessions` đúng với nhật ký mẫu; không có trường `rarity`, `marketPrice`, `hsHints`, `provenance`, `tradeRestriction` trong bất kỳ phản hồi nào (quét JSON). Chạy → FAIL.
- [ ] **Step 2:** Implement. Chạy → PASS. Cập nhật `contract.ts` và chạy `npm run contract:generate`; `git diff docs/api/openapi.json` chỉ có thêm.
- [ ] **Step 3:** Commit `feat(api): /me home, review, progress and mastery endpoints`.

### Task 10: Kiểm thật trên Docker local và tài liệu

**Files:**
- Create: `scripts/learner-accounts-check.mjs` (kiểm đầu cuối qua HTTP), `docs/DELIVERY_25A.md`
- Modify: `README.md` (một đoạn ngắn: tài khoản học viên và lệnh `rebuild:progress`)

- [ ] **Step 1:** Viết `scripts/learner-accounts-check.mjs` (theo mẫu `scripts/smoke-pilot.mjs`: đọc `.local/pilot.env` trong script, không in giá trị): đăng nhập admin; tạo `student` thử `qa-student-<time>` (mật khẩu ngẫu nhiên, in ra **không**) và một `manager` thử; đăng nhập student; (a) `/me/home` trả `cast.kind` hợp lệ; (b) học một flashcard qua `/learning/sessions`, nộp tự đánh giá; `/me/progress` có `sessions.length ≥ 1`, `figures.selfRated ≥ 1`; (c) **nộp đồng thời** hai lần cùng câu với cùng khóa: cùng kết quả, một dòng nhật ký (kiểm qua `/me/progress`); (d) học 2 câu khác nhau của cùng mục **đồng thời**: không lỗi, cả hai ghi; (e) đăng nhập lại (phiên mới) vẫn thấy tiến độ; (f) quản trị xuất bản một release nội bộ mới có cùng revision: `/me/mastery` **không đổi** (tiến độ không reset); (g) `learner` (mã mời) bị 403 ở `/me/home`; student thứ hai không thấy dữ liệu của student đầu; `manager` bị 403 ở `/me/home`; (h) tài khoản `mustChangePassword` chỉ vào được `POST /me/password`. Kết thúc báo từng ý đạt/không (không in bí mật).
- [ ] **Step 2:** Rebuild stack local (`docker compose --env-file .local/pilot.env up -d --build`, `node scripts/wait-pilot.mjs`), chạy `node scripts/learner-accounts-check.mjs`: mọi ý đạt. Nếu bước (f) cần release nội bộ mới và làm release nội bộ cũ rơi khỏi 20 release gần nhất mà `smoke:pilot` cần, đăng lại release nền như các lần trước và ghi rõ trong báo cáo. Chạy `npm run test:e2e` (desktop và mobile): 19 đạt, 3 bỏ qua theo thiết kế (trình duyệt chưa đổi nên không đổi hành vi); khởi động lại riêng container API nếu đụng giới hạn đăng nhập.
- [ ] **Step 3:** Chạy `npm run rebuild:progress` (trong container API: `docker compose ... run --rm --no-deps api node dist/rebuild-progress.js`) trên DB local: kết quả khớp số hàng trước khi dựng lại.
- [ ] **Step 4:** Viết `docs/DELIVERY_25A.md`: những gì đã làm, danh sách API, số liệu test, những gì chưa làm (trình duyệt chưa dùng `/me/*`, chưa có quản lý, chưa có màn người dùng), và lưu ý "đây là migration đầu tiên kể từ r1/r2: sao lưu trước khi nâng cấp VPS". Thêm đoạn README.
- [ ] **Step 5:** Toàn bộ `npm test`, `typecheck`, `lint`, `format:check`, `build`, `contract:generate` pass. Commit `docs: phase 2.5a delivery notes and end-to-end account check`.
