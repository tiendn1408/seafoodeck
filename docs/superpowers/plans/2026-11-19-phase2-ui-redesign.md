# Giai đoạn 2: làm lại giao diện người học "Biển sâu × Ấn bản loài" — kế hoạch triển khai

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Thay toàn bộ giao diện người học bằng hệ hình ảnh "Biển sâu × Ấn bản loài". Logic dữ liệu, lịch ôn, chấm điểm và các đường dẫn trang giữ nguyên.

**Architecture:**
- **API:** thêm một endpoint đọc `GET /catalog/overview` và mở rộng tìm kiếm.
- **Web:**
  - Logic thuần (ledger, chọn mẻ, tiến độ kỹ năng) tách ra `apps/web/src/learner/*.ts` và có test.
  - Giao diện tách thành các màn trong `apps/web/src/learner/`, dùng một file token CSS mới.
  - `PilotApp.tsx` chỉ còn điều phối trạng thái và route.
  - Màn quản trị (`pilot/Admin.tsx`, `pilot/HsAdmin.tsx`) không đổi.

**Tech Stack:**
- React 19 + Vite, Vitest (jsdom), Playwright (`apps/web/playwright.config.ts` chỉ chạy `e2e/pilot.spec.ts`).
- NestJS + Prisma (test `node:test`), lucide-react, `@fontsource/be-vietnam-pro`.

**Spec:** `docs/superpowers/specs/2026-11-19-phase2-ui-redesign-design.md`. Bối cảnh sản phẩm: `apps/web/PRODUCT.md`.

## Global Constraints

- **Ảnh loài** luôn hiển thị trọn khung (`object-fit: contain`) trên nền phù hợp. Không bao giờ cắt theo hình vảy, không dùng mặt nạ.
- **Desktop (≥ 900px)** dùng header trên cùng, **không** dùng sidebar. **Điện thoại** dùng thanh tab dưới. Mỗi kích thước chỉ render **một** thanh điều hướng, chọn bằng `matchMedia`.
- **Màu nhóm** (`taxonomicGroup`):
  - fish `#A8243A` · crustacean `#EE8A7A` (chữ tối) · mollusc `#C99A2E` (chữ tối) · other `#4F6B5E`;
  - không có nhóm thì dùng màu trung tính xám xanh;
  - hành động chính `#E8743B`.
  - Được tinh chỉnh để đạt AA, nhưng giữ nguyên tông màu.
- **Hai mặt nền:**
  - "Biển sâu" (tối) cho trang chủ và khung học;
  - "Băng" (sáng) cho Thư viện, Ôn tập, Tiến độ, Tổng kết và phần chi tiết của Hồ sơ;
  - header luôn là xanh biển sâu;
  - không dùng nền kem hay giấy cũ.
- **Không dùng:**
  - emoji làm biểu tượng;
  - dòng chữ nhỏ in hoa đặt trên tiêu đề lớn ("eyebrow");
  - gradient tím, hiệu ứng neon.
- **Chuyển động:** chỉ dùng transform/opacity. Tắt hết khi `prefers-reduced-motion: reduce`. Tia sáng dừng khi tab bị ẩn.
- **Tiếp cận:**
  - độ tương phản AA;
  - vùng chạm ≥ 44px;
  - không tràn ngang ở 320 / 390 / 768 / 1280 / 1440;
  - hiển thị đúng dấu tiếng Việt và kana/kanji.
- **API chỉ được thêm, không được sửa:** contract cũ giữ nguyên. Không migration. Có thay đổi thì chạy `npm run contract:generate`.
- **Giữ nguyên hành vi:**
  - route hash (`home`, `library`, `profile/<id>`, `study`, `review`, `progress`, `admin`);
  - ledger localStorage (`seafood-deck:pilot:v1`);
  - `scheduleReview`, chấm điểm.
- **Nhãn trung thực:**
  - "Bản kỹ thuật nội bộ · Nội dung chưa duyệt" khi release nội bộ;
  - trạng thái thiếu audio;
  - ghi công ảnh qua `MediaCredit`.
- **E2E:** chỉ được cập nhật selector, không được xóa ca nào trong `apps/web/e2e/pilot.spec.ts`. Các tên nút bắt buộc giữ nguyên chữ:
  - "Chạm để lật thẻ", "Đã nhớ", "Kiểm tra câu trả lời", "Tiếp tục", "Xem tổng kết";
  - "Ôn lỗi và câu bỏ qua", "Tạm dừng";
  - nhãn "Chọn loài học tên", "Chọn hướng ghép tên", "Tìm loài theo bốn tên gọi".
- **Sau mỗi task**, chạy ở thư mục gốc và phải pass hết: `npm test`, `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run build`.

## Review Focus

1. **Loài thiếu ảnh**, hoặc ảnh lỗi signed URL: thẻ và bìa hiện hình bóng trung tính kèm "Ảnh đang bổ sung", không vỡ bố cục. → test ở Task 5.
2. **Mục không có `taxonomicGroup`** (994 SKU tổng hợp, các mục cũ): màu trung tính, không đoán nhóm. → test `groupTone` ở Task 2.
3. **Tên dài ở 320px** ("Cá hồi Đại Tây Dương", "Tôm thẻ chân trắng"): xuống dòng, không tràn ngang. → E2E ở Task 8.
4. **Người học mới** (ledger rỗng), và **người đã học hết** loài trong release: "Thả lưới" vẫn có hành vi rõ ràng. → test `planCast` ở Task 2.
5. **Release lớn** (1.000+ mục): payload `/catalog/overview` gọn và trang chủ không treo. → test giới hạn trường ở Task 1.

---

### Task 1: API — `GET /catalog/overview` và tìm theo tên phụ

**Files:**
- Create: `apps/api/src/overview.ts` (hàm thuần)
- Modify:
  - `apps/api/src/controllers.ts` (`CatalogController`);
  - `apps/api/src/catalog.ts` (`Catalog.list` và phương thức `overview`);
  - `apps/api/src/contract.ts`.
- Regenerate: `docs/api/openapi.json`
- Test: `apps/api/src/rules.test.ts`

**Interfaces:**
- Produces: `GET /api/v1/catalog/overview`, thuộc `AccessGuard` như `/catalog/items`, phạm vi `Catalog.current(actor)`. Response:

```ts
interface CatalogOverview {
  releaseId: string; internal: boolean;
  learnable: number;                       // mục có đủ 4 tên (cùng điều kiện learnable hiện có)
  groups: { fish: number; crustacean: number; mollusc: number; other: number; none: number };
  hsCases: number;                          // TradeScenario dùng được trong release (approved, hoặc mọi trạng thái nếu internal; cùng điều kiện learning.ts)
  items: { revisionId: string; itemId: string; vi: string; scientific: string;
           taxonomicGroup: string | null; imageId: string | null }[];   // chỉ mục learnable
}
```

  `imageId` lấy asset `profile`, nếu không có thì `identification`. Asset phải chưa thu hồi, và phải đã duyệt khi release là public.
- Produces: `export function summarizeOverview(rows: OverviewRow[], hsCases: number, release: { id: string; internal: boolean }): CatalogOverview` trong `overview.ts`.
- Produces: `export function likePattern(q: string): string` (escape `\`, `%`, `_`; bọc `%…%`).
- `Catalog.list(q)` khớp thêm `data->>'jaTrade'`, `data->>'jaKanji'` và `(data->'enAliases')::text` bằng `ILIKE`, dùng `Prisma.sql` có tham số. Lấy id từ raw query rồi OR vào điều kiện tìm hiện có.

- [ ] **Step 1: Test**
  - `summarizeOverview` đếm nhóm đúng, kể cả `none` cho mục thiếu nhóm.
  - Mỗi `items[i]` chỉ có đúng 6 khóa trên. Không có `rarity`, `marketPrice`, `hsHints`, `provenance`.
  - Ảnh chưa duyệt bị bỏ khi release public, được giữ khi internal.
  - `likePattern('50%_a')` → `'%50\\%\\_a%'`.
- [ ] **Step 2:** `npm run test --workspace @seafoodeck/api` → FAIL.
- [ ] **Step 3:** Viết `overview.ts`, phương thức `Catalog.overview(actor)`, route `@Get('overview')` (khai báo trước `items/:revisionId`), DTO `CatalogOverviewResponse`, và phần tìm mở rộng trong `list`.
- [ ] **Step 4:** Test PASS. Chạy `npm run contract:generate`; `git diff docs/api/openapi.json` chỉ có thêm.
- [ ] **Step 5:** Commit `feat(api): catalog overview for learner home, search alternate names`.

### Task 2: Logic thuần của người học (ledger, mẻ lưới, tiến độ)

**Files:**
- Create:
  - `apps/web/src/learner/ledger.ts`: di chuyển nguyên `Ledger`, `loadLedger`, `mergeScore`, `mergeGame`, `skillLabel`, `LEDGER_KEY = 'seafood-deck:pilot:v1'` từ `PilotApp.tsx`;
  - `apps/web/src/learner/haul.ts`;
  - `apps/web/src/learner/haul.test.ts`, `apps/web/src/learner/ledger.test.ts`.
- Modify:
  - `apps/web/src/pilot/api.ts`: thêm các trường mở rộng vào `CatalogItem` (`taxonomicGroup`, `family`, `familyVi`, `enAliases`, `jaKanji`, `jaTrade`, nullable/optional), thêm kiểu `CatalogOverview` (giống Task 1);
  - `apps/web/src/pilot/PilotApp.tsx`: import từ `learner/ledger`.

**Interfaces (Produces, trong `haul.ts`):**

```ts
export type GroupKey = 'fish' | 'crustacean' | 'mollusc' | 'other' | 'none';
export function groupTone(g: string | null | undefined): { key: GroupKey; label: string; css: string } // label: 'Cá'|'Giáp xác'|'Nhuyễn thể'|'Khác'|'Chưa phân nhóm'; css = 'var(--group-<key>)'
export function itemStatus(itemId: string, reviews: ReviewState[], now: number): 'new' | 'due' | 'learning'
export function pickHaul(o: CatalogOverview, reviews: ReviewState[], now: number, max = 5): CatalogOverview['items']  // đến hạn sớm nhất trước, rồi 'new' theo thứ tự danh mục
export type CastPlan =
  | { kind: 'review'; targets: { targetId: string; skill: string }[] }   // tối đa 8, dueAt tăng dần
  | { kind: 'flashcard'; revisionId: string }                            // loài 'new' đầu tiên, kind 'en'
  | { kind: 'done' };
export function planCast(o: CatalogOverview, reviews: ReviewState[], now: number): CastPlan
export function skillProgress(o: CatalogOverview, reviews: ReviewState[]): { key: 'en'|'ja'|'scientific'|'hs'; label: string; done: number; total: number }[]
export function masteryLevel(reviews: ReviewState[], itemId: string): 0 | 1 | 2 | 3 | 4   // 0 = chưa học; ngược lại max stage của mọi kỹ năng của item + 1
```

**Quy tắc** (theo spec 6.3):
- Chỉ dùng reviews có `contentVersion === overview.releaseId`.
- `itemStatus` xét các kỹ năng `name:*`, `match:*`, `image` của `targetId === itemId`.
- `skillProgress`:
  - `en` / `ja` / `scientific`: `done` = số `itemId` có review `name:<k>` hoặc `match:<k>` với `stage ≥ 1`; `total = o.learnable`.
  - `hs`: `done` = số review kỹ năng `hs` với `stage ≥ 1`; `total = o.hsCases`.
  - Nhãn: 'Tiếng Anh', 'Tiếng Nhật', 'Tên khoa học', 'HS dạng hàng'.

- [ ] **Step 1: Test `haul.test.ts`**
  - `groupTone(null).key === 'none'`; `groupTone('crustacean').label === 'Giáp xác'`.
  - **Ledger rỗng:**
    - `planCast` → flashcard với item đầu tiên;
    - `pickHaul` → 5 mục đầu tiên.
  - **10 mục đến hạn:**
    - `planCast.targets.length === 8`, theo `dueAt` tăng dần;
    - `pickHaul` có các mục đến hạn trước, rồi mới đến mục 'new'.
  - **Mọi mục đã học, không mục nào đến hạn:** `planCast.kind === 'done'`.
  - Review của release khác bị bỏ qua.
  - `skillProgress` với 1 review `name:en` stage 1 và 1 review `match:en` stage 2 trên cùng item → `en.done === 1`.
  - `masteryLevel` của item chưa có review → 0.
- [ ] **Step 2: Test `ledger.test.ts`** (bảo toàn hành vi khi di chuyển code)
  - `mergeScore` không ghi trùng lần trả lời đã có.
  - Câu ghép tên (`items` có 3 phần tử) tạo ra 3 lần trả lời.
- [ ] **Step 3:** `npm run test --workspace @seafoodeck/web` → FAIL.
- [ ] **Step 4:** Implement. `PilotApp.tsx` dùng `learner/ledger.ts`; giao diện chưa đổi.
- [ ] **Step 5:** Test PASS và toàn bộ checks pass. Commit `refactor(web): extract learner ledger, add haul/progress logic`.

### Task 3: Direction contract, token, khung ứng dụng (header / tab dưới), chế độ tối

**Files:**
- Create:
  - `apps/web/src/learner/tokens.css`: custom properties trên `:root`, gồm màu nhóm `--group-fish/crustacean/mollusc/other/none`, `--action`, nền `--deep-*`, `--ice-*`, chữ, khoảng cách, bo góc, đổ bóng nút "nhấn lún"; biến thể tối cho mặt "Băng" dưới `@media (prefers-color-scheme: dark)` với `:root:not([data-theme="light"])` và `:root[data-theme="dark"]`; họa tiết vảy `--scales-bg` (CSS gradient);
  - `apps/web/src/learner/shell.css`;
  - `apps/web/src/learner/AppShell.tsx`;
  - `apps/web/src/learner/useMedia.ts`: `export function useMedia(query: string): boolean`;
  - `apps/web/src/learner/theme.ts`: `getTheme(): 'light'|'dark'|null`, `setTheme(t)`, bọc localStorage trong try/catch, key `seafood-deck:theme`;
  - `apps/web/src/learner/Login.tsx`: dời `Login` từ `PilotApp`, giữ nguyên logic.
- Modify:
  - `apps/web/src/main.tsx`: import `learner/tokens.css` và `learner/shell.css`;
  - `apps/web/src/pilot/PilotApp.tsx`: dùng `AppShell`, giữ nguyên toàn bộ state/handler;
  - `apps/web/e2e/pilot.spec.ts`: cập nhật selector điều hướng.

**Interfaces:**
- Produces:

```ts
<AppShell route={string} tone="deep"|"ice" staff={boolean} internal={boolean} onLogout={() => void}>{children}</AppShell>
```

  - Desktop (`useMedia('(min-width: 900px)')`): header 64px gồm logo "Seafood Deck" (dấu vảy SVG nhỏ), tab Học / Thư viện / Ôn tập / Tiến độ (+ Quản trị nếu `staff`), nút chuyển giao diện sáng/tối, nút "Đăng xuất". Tab đang chọn có gạch dưới màu `--action`.
  - Điện thoại: header gọn (logo + đăng xuất) và tab dưới cố định 4 mục, có `env(safe-area-inset-bottom)`.
  - Nhãn release nội bộ là chip cạnh logo.
  - `tone="deep"`: header trong suốt trên nền tối. `tone="ice"`: header nền đặc xanh biển sâu.
  - Link tab: tên accessible là "Học", "Thư viện", "Ôn tập", "Tiến độ". Ở route `study` thì tab "Học" active.

- [ ] **Step 1: Direction contract.**
  - Chạy `impeccable surface-brief read apps/web/src/learner/AppShell.tsx` (cwd `apps/web`).
  - Ghi `## Direction contract` bằng `surface-brief write`. Nội dung gồm 6 khối THESIS / OWN-WORLD / STORY / FIRST VIEWPORT / FORM / FINISH, tóm từ spec mục 2 và 6.1–6.3. Khối FORM ghi `seed: none (unavailable)`, vì hướng do người dùng chọn, không qua roll.
  - Đọc lại brief để xác nhận.
- [ ] **Step 2: Test Vitest `learner/theme.test.ts`.**
  - `setTheme('dark')` đặt `document.documentElement.dataset.theme = 'dark'`, và `getTheme()` trả `'dark'`.
  - Khi localStorage ném lỗi, cả hai hàm không ném lỗi.
- [ ] **Step 3:** Đọc `reference/craft-floor.md` của impeccable (theo SKILL.md của skill). Implement token, shell, theme. Cập nhật E2E: `getByRole('link', { name: 'Học tập' })` → `'Học'`.
- [ ] **Step 4:** Checks pass. Trên stack Docker local (rebuild theo README), `npm run test:e2e` pass cả desktop và mobile.
- [ ] **Step 5:** Commit `feat(web): learner tokens, top header / bottom tab shell, theme`.

### Task 4: Trang chủ "Biển sâu"

**Files:**
- Create:
  - `apps/web/src/learner/Home.tsx`, `apps/web/src/learner/home.css`;
  - `apps/web/src/learner/FloatRope.tsx`;
  - `apps/web/src/learner/SpeciesCard.tsx`;
  - `apps/web/src/learner/GroupEntry.tsx`.
- Modify:
  - `apps/web/src/pilot/PilotApp.tsx`: route `home` render `Home` thay cho `CatalogScreen home`;
  - `apps/web/src/pilot/api.ts`: thêm hàm gọi overview nếu cần;
  - `apps/web/e2e/pilot.spec.ts`.

**Interfaces:**
- Consumes: Task 1 `/catalog/overview`; Task 2 `pickHaul`, `planCast`, `skillProgress`, `groupTone`; Task 3 `AppShell tone="deep"`.
- Produces:

```tsx
<FloatRope total={number} done={{ index: number; group: GroupKey; correct: boolean }[]} />
// phao tô màu nhóm + số thứ tự khi đúng; viền đứt khi sai/bỏ qua; rỗng khi chưa làm; role="img" aria-label="Tiến độ mẻ lưới: x / total"
```

```tsx
<SpeciesCard item={{ revisionId; vi; scientific; taxonomicGroup; imageId }} variant="float"|"row"|"tile" />
// ảnh qua SignedImage, object-fit: contain; thiếu ảnh → hình bóng trung tính + "Ảnh đang bổ sung"; link #profile/<revisionId>
```

**Home** (spec 6.3):
- Tiêu đề `Mẻ lưới hôm nay: {N} loài đang chờ`, với N = `pickHaul(...).length`.
- Nút chính "Thả lưới" chạy `planCast`:
  - review → `start('review', undefined, 'en', undefined, targets)`;
  - flashcard → `start('flashcard', revisionId, 'en')`;
  - done → khối "Mẻ hôm nay đã xong" kèm 2 link Ghép tên / Thư viện.
- Thẻ nổi `pickHaul`: 5 thẻ trên desktop, 2 trên điện thoại.
- Dây phao:
  - nếu `ledger.sessionId` tồn tại, gọi `GET /learning/sessions/:id` một lần để vẽ phao theo câu đã có `result`;
  - nếu không, vẽ 5 phao rỗng.
- Nút "Tiếp tục phiên học" giữ nguyên khi có `onResume`.
- Phần dưới, vẫn nền tối:
  - 4 thanh `skillProgress`;
  - mục "Luyện nghiệp vụ" (giữ heading này) với 4 ô chế độ, giữ hai select `aria-label` "Chọn loài học tên" / "Chọn hướng ghép tên" và nội dung option như cũ;
  - `GroupEntry` 4 nhóm kèm số loài từ `overview.groups`, bấm vào sẽ gọi `onOpenLibrary(taxon)`. `PilotApp` giữ state `libraryTaxon`, rồi đặt `location.hash = 'library'` (không thêm query vào hash, để route `library` vẫn khớp chính xác).
- Trạng thái: đang tải (khung mờ), lỗi (`ErrorNote` kèm thử lại), release rỗng.
- Tia sáng và thẻ trôi: CSS keyframes, tắt khi reduced-motion. Thêm `document.visibilityState` → class `paused`.

- [ ] **Step 1: Test Vitest** `learner/FloatRope.test.tsx` (React Testing Library, hoặc `react-dom/server` `renderToString` nếu chưa có RTL; không thêm dependency mới):
  - `total=5`, có 2 phao `done` đúng → nhãn "Tiến độ mẻ lưới: 2 / 5";
  - phao sai có class `missed`.
- [ ] **Step 2:** FAIL. Implement. PASS.
- [ ] **Step 3:** E2E: cập nhật các ca bắt đầu từ trang chủ, giữ nguyên ý định. Thêm ca "Thả lưới mở được một phiên và về được trang chủ" (desktop và mobile).
- [ ] **Step 4:** Checks và E2E pass. Commit `feat(web): deep-sea home with haul, float rope, skill progress`.

### Task 5: `SpeciesCover` và Hồ sơ loài

**Files:**
- Create: `apps/web/src/learner/SpeciesCover.tsx`, `apps/web/src/learner/cover.css`, `apps/web/src/learner/Profile.tsx` (dời và làm lại `Profile`).
- Modify: `apps/web/src/pilot/PilotApp.tsx`, `apps/web/e2e/pilot.spec.ts`.

**Interfaces:**
- Produces:

```tsx
<SpeciesCover item={CatalogItem} reveal={{ names: boolean }} mode="profile"|"flashcard"|"image" rope?={ReactNode}>{answerArea}</SpeciesCover>
```

  - Vùng ảnh lớn trên nền tối: `SignedImage` contain kèm `MediaCredit`.
  - Nhãn nhóm `groupTone` cùng `family (familyVi)` khi có.
  - `h1` là tên Việt.
  - Các dòng EN / JP / LAT: JP gồm kana, kanji nếu có, `jaTrade` nếu có, kèm nhãn "tên thương mại". LAT in nghiêng.
  - `mode="image"` và `reveal.names=false`: ẩn tên Việt và cả 3 dòng, chỉ còn ảnh.
  - Desktop: ảnh trái, chữ phải. Điện thoại: ảnh trên, chữ dưới.
- Profile dùng `SpeciesCover mode="profile"`. Bên dưới là phần sáng gồm:
  - "Dấu hiệu nhận biết";
  - "Dạng hàng tham khảo";
  - trạng thái audio từng tên: nhãn nhỏ "Chưa có bản thu đã duyệt." thay cho nút xám to, giữ nguyên chữ vì E2E dùng; `Pronunciation` vẫn render khi có audio;
  - hai nút "Học flashcard" và "Xem HS theo dạng hàng" như hiện tại.

  Heading tên loài: nếu E2E đang dùng `heading 'Vẹm xanh.'` có dấu chấm, cập nhật selector cho khớp `h1` mới.

- [ ] **Step 1: Test Vitest** `SpeciesCover.test.tsx`:
  - item thiếu ảnh → có chữ "Ảnh đang bổ sung";
  - `mode="image"` với `reveal.names=false` → không có tên Việt trong output;
  - item có `jaTrade` → có dòng tên thương mại.
- [ ] **Step 2:** FAIL. Implement. PASS. E2E pass.
- [ ] **Step 3:** Commit `feat(web): species cover and profile`.

### Task 6: Màn học bốn chế độ và Tổng kết

**Files:**
- Create:
  - `apps/web/src/learner/study/Study.tsx`, `study/QuestionView.tsx`: dời từ `PilotApp.tsx`, giữ nguyên toàn bộ logic gửi câu trả lời, reveal, idempotency key, `Tạm dừng`;
  - `study/Summary.tsx`, `study/study.css`.
- Modify: `apps/web/src/pilot/PilotApp.tsx`, `apps/web/e2e/pilot.spec.ts`.

**Interfaces:**
- Consumes: `SpeciesCover` (Task 5), `FloatRope` (Task 4), `groupTone`.
- **Khung chung:** nền tối, `FloatRope` ở đầu, `total = game.questions.length`, `done` lấy từ `q.result`.
- **Theo chế độ:**
  - flashcard → `SpeciesCover mode="flashcard"`; đáp án che tới khi bấm "Chạm để lật thẻ"; rồi hiện "Chưa nhớ / Đã nhớ".
  - image → `SpeciesCover mode="image"`, `reveal.names` chỉ bật sau khi có `result`; lựa chọn là radio như hiện tại.
  - match và hs → **không** dùng cover; thẻ sáng trên nền tối chứa bàn ghép hoặc mô tả HS như hiện tại.
- **Phản hồi:** màu + biểu tượng lucide + chữ ("Chính xác" giữ nguyên chữ). Phao vừa đúng có hiệu ứng nổi (tắt khi reduced-motion).
- **`Summary`:**
  - `h1` = `{số mục đúng lần đầu} / {số mục} loài vào lưới`;
  - danh sách mục kèm màu nhóm và "ôn lại sau X ngày" (từ ReviewState mới nhất của mục);
  - mục sai: "Sổng lưới · ôn lại ngày mai";
  - giữ các số liệu cũ (lần đầu, làm lại, tự đánh giá), nút "Ôn lỗi và câu bỏ qua", link về trang chủ.
  - Heading E2E "Bạn đã hoàn thành lượt học." / "Tổng kết lượt học": giữ một trong hai làm tiêu đề phụ, hoặc cập nhật selector.

- [ ] **Step 1: Test Vitest** cho hàm thuần `summarizeHaul(game, ledger): { caught: …[]; missed: …[]; title: string }` trong `study/summary.ts`: 3 mục đúng và 1 mục sai → title `'3 / 4 loài vào lưới'`, `missed[0].note === 'Sổng lưới · ôn lại ngày mai'`.
- [ ] **Step 2:** FAIL. Implement. PASS. E2E của 4 chế độ, ôn lỗi, reload giữa phiên đều pass.
- [ ] **Step 3:** Commit `feat(web): species-cover study screens and haul summary`.

### Task 7: Thư viện, Ôn tập, Tiến độ (mặt "Băng")

**Files:**
- Create:
  - `apps/web/src/learner/Library.tsx`, `apps/web/src/learner/library.css`;
  - `apps/web/src/learner/MasteryScales.tsx`;
  - `apps/web/src/learner/Review.tsx`, `apps/web/src/learner/Progress.tsx`.
- Modify: `apps/web/src/pilot/PilotApp.tsx` (bỏ `CatalogScreen`, `VersionLoader` nếu không còn dùng), `apps/web/e2e/pilot.spec.ts`.

**Interfaces:**
- `<MasteryScales level={0|1|2|3|4} />`: 4 vảy SVG, `aria-label` = "Mức nhớ {level}/4", hoặc "Chưa học" khi level là 0.
- **Library:**
  - ô tìm (`aria-label` giữ "Tìm loài theo bốn tên gọi", debounce 180ms như cũ);
  - chip "Tất cả" và 4 nhóm kèm số đếm từ overview, gọi `/catalog/items?taxon=`;
  - điện thoại: danh sách chia theo nhóm, mỗi dòng là `SpeciesCard variant="row"` + `MasteryScales`;
  - desktop: lưới `variant="tile"` 4–5 cột;
  - phân trang hiện có (limit 12), nút trước/sau giữ nguyên chữ.
- **Review:**
  - danh sách mục đến hạn và đã lên lịch, kiểu dòng như Thư viện;
  - mỗi dòng có kỹ năng (`skillLabel`) và "Mốc X ngày · ngày";
  - nút "Ôn {n} mục đến hạn" giữ nguyên hành vi (tối đa 30);
  - trạng thái rỗng dùng họa tiết vảy và link về trang chủ.
- **Progress:**
  - 4 thanh `skillProgress`;
  - phân bố mức nhớ (số loài ở mỗi mức 1–4);
  - 3 số liệu cũ: câu đã trả lời, đúng lần đầu, thẻ tự đánh giá.
  - Cần overview → gọi `/catalog/overview`.

- [ ] **Step 1: Test Vitest** `MasteryScales`: level 2 → 2 vảy có class `on`; level 0 → aria "Chưa học".
- [ ] **Step 2:** FAIL. Implement. PASS. E2E pass.
- [ ] **Step 3:** Commit `feat(web): ice-surface library, review and progress`.

### Task 8: Dọn CSS cũ, kiểm tra bố cục, review thiết kế, DESIGN.md

**Files:**
- Modify: `apps/web/src/styles.css`, `apps/web/src/trade.css`, `apps/web/src/pilot/pilot.css`. Xóa các class người học không còn dùng; giữ phần Admin / HsAdmin / Media đang dùng. Kiểm bằng grep tên class trong `src/`.
- Modify: `apps/web/e2e/pilot.spec.ts`. Thêm 2 ca, chạy trên cả project desktop và mobile, cộng thêm viewport 320×640:
  1. Ở `#home`, `#library` và `#profile/<id>`: `document.documentElement.scrollWidth <= window.innerWidth`.
  2. Mọi `img` trong `.species-photo`, hoặc class ảnh do Task 4–5 đặt, có computed `object-fit` = `contain`.
- Create: `apps/web/DESIGN.md` và `.impeccable/design.json`, do impeccable documenter viết.

- [ ] **Step 1:** Dọn CSS. Checks và E2E pass.
- [ ] **Step 2:** Thêm 2 ca E2E; pass.
- [ ] **Step 3: Chụp màn hình** trên stack local, với một release nội bộ có loài prototype, theo cách giai đoạn 1: publish internal, kiểm xong rollback về release nội bộ hiện tại, rồi chạy lại `npm run smoke:pilot`.
  - Màn: home, library, profile, study (flashcard + image), summary, review, progress.
  - Kích thước: 390 và 1440. Lưu vào `apps/web/.impeccable/review/`.
- [ ] **Step 4:** Chạy `impeccable detect --json` một lần trên các file đã đổi; sửa các lỗi cơ học.
- [ ] **Step 5:** Spawn `impeccable:impeccable-finish-reviewer` với spec, direction contract, ảnh chụp và kết quả detect. Sửa theo kết quả tối đa 2 vòng (theo `reference/new-work.md` mục 7).
- [ ] **Step 6:** Spawn `impeccable:impeccable-documenter` để viết `DESIGN.md` và sidecar.
- [ ] **Step 7:** Checks pass. Commit `chore(web): remove legacy learner styles, layout e2e, DESIGN.md`.
