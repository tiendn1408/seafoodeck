# Giai đoạn 1 — Nhập dữ liệu prototype: kế hoạch triển khai

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Đưa 100 loài, 5 hồ sơ HS và 100 ảnh của `seafood-master-2` vào bản chính dưới dạng nháp qua API quản trị. Nới luật xuất bản để audio không còn chặn, và cho lượt học chạy đúng khi release có hơn 100 mục.

**Architecture:**
- **API:** mở rộng `ItemData` bằng các trường tùy chọn lưu trong `Revision.data` (không migration). Thêm 2 endpoint đọc cho importer. Tách luật publish và cách chọn pool câu hỏi thành hàm thuần để test.
- **Importer:** hai phần trong `scripts/prototype/`:
  - module chuyển đổi thuần, có unit test;
  - CLI gọi API bằng cookie + CSRF giống `scripts/smoke-pilot.mjs`.

**Tech Stack:** NestJS 12 + Prisma (apps/api, test `node:test`), React + Vitest (apps/web), Node 24 ESM scripts, `json5@2.2.3`.

**Spec:** `docs/superpowers/specs/2026-11-18-prototype-adoption-design.md` (mục 3, 5).

## Global Constraints

- Runtime/image không đọc thư mục prototype, `_inbox`, `_outbox`, `_archive`. Test trong repo không đọc thư mục prototype: dùng fixture inline.
- Không eval/import file prototype. Chỉ đọc text và parse bằng `json5`.
- Không migration DB. Trường mới đều tùy chọn; CSV và mục cũ vẫn hợp lệ.
- API người học **không** trả `rarity`, `marketPrice`, `hsHints`, `provenance`, `tradeRestriction`.
- Không ghi thẳng DB. Importer chỉ gọi HTTP API; mật khẩu nhập qua prompt ẩn, không qua argv/env, không ghi file.
- Không tự chạy importer lên VPS.
- Copy giao diện và thông báo lỗi bằng tiếng Việt.
- Sau mỗi task: `npm test`, `npm run typecheck`, `npm run lint`, `npm run format:check` pass.

## Review Focus

1. **Admin sửa nháp đã import qua form JSON làm mất trường mở rộng.** `validateItem` hiện chỉ giữ whitelist. → Test trong Task 1: round-trip giữ nguyên mọi trường mở rộng.
2. **Importer bị đứt giữa chừng rồi chạy lại.** Phải không tạo revision mới, chỉ bổ sung ảnh/HS còn thiếu. → Test `planItem` trong Task 6 cho 4 trạng thái.
3. **Tên prototype có `kanji: null`, `trade: null`, `name_en` chỉ 1 phần tử.** → Test `toItem` trong Task 6.
4. **Upload ảnh bị 429** (API chỉ xử lý một upload một lúc). → Task 7: retry có backoff, test `withRetry`.
5. **Mục đích chọn sẵn (`revisionId`) nằm ngoài 100 dòng đầu.** → Test `pickPool` trong Task 4.

---

### Task 1: Mở rộng `ItemData`, bỏ chặn tôm

**Files:**
- Modify: `apps/api/src/catalog.ts:15-71` (`ItemData`, `validateItem`)
- Test: `apps/api/src/rules.test.ts`

**Interfaces:**
- Produces:
  - `ItemData` thêm các trường tùy chọn đúng như spec 5.3: `taxonomicGroup`, `family`, `familyVi`, `enAliases`, `jaKanji`, `jaTrade`, `rarity`, `tradeRestriction`, `marketPrice`, `hsHints`, `provenance`.
  - `export const extendedKeys: readonly string[]`.
  - `export type Provenance = { origin: 'prototype:seafood-master-2'; prototypeId: string; digest: string; verified: false }`.

- [ ] **Step 1: Viết test (thay test tôm cũ)**

```ts
test('catalog accepts shrimp and keeps unknown species as a draft', () => {
  assert.equal(validateItem({ ...item, scientific: '' }).scientific, '');
  assert.equal(validateItem({ ...item, vi: 'Tôm sú', en: 'Black tiger shrimp' }).vi, 'Tôm sú');
});
const extended = {
  taxonomicGroup: 'crustacean', family: 'Penaeidae', familyVi: 'Họ Tôm he',
  enAliases: ['Giant tiger prawn'], jaKanji: '牛海老', jaTrade: 'ブラックタイガー',
  rarity: 'common', tradeRestriction: null,
  marketPrice: { rangeUsd: '8.50 - 13.50 USD/kg', rangeVnd: '180.000 - 320.000 đ/kg', specRef: 'HOSO', note: 'n', sourced: false },
  hsHints: [{ state: 'frozen', labelVi: 'Đông lạnh', hs6: '0306.17' }],
  provenance: { origin: 'prototype:seafood-master-2', prototypeId: 'black_tiger_shrimp', digest: 'abc', verified: false },
};
test('extended prototype fields survive validation round-trip', () => {
  assert.deepEqual(validateItem({ ...item, ...extended }), { ...item, ...extended });
  assert.deepEqual(Object.keys(validateItem(item)).sort(), Object.keys(item).sort()); // no keys invented
});
test('extended fields are type-checked', () => {
  assert.throws(() => validateItem({ ...item, rarity: 'mythic' }));
  assert.throws(() => validateItem({ ...item, taxonomicGroup: 'bird' }));
  assert.throws(() => validateItem({ ...item, enAliases: [1] }));
  assert.throws(() => validateItem({ ...item, marketPrice: { ...extended.marketPrice, sourced: true } }));
  assert.throws(() => validateItem({ ...item, hsHints: [{ state: 'x', labelVi: 'y', hs6: '306' }] }));
  assert.throws(() => validateItem({ ...item, provenance: { ...extended.provenance, verified: true } }));
});
```

- [ ] **Step 2:** `npm run test --workspace @seafoodeck/api` → FAIL (shrimp bị chặn, key mở rộng bị bỏ).
- [ ] **Step 3: Sửa `validateItem`.**
  - Xóa luật chặn tôm.
  - Kiểm từng key mở rộng **chỉ khi có mặt** (`key in row`):
    - `taxonomicGroup` ∈ fish/crustacean/mollusc/other;
    - `rarity` ∈ common/uncommon/rare/legendary;
    - chuỗi ≤ 3000 ký tự; `jaKanji`, `jaTrade`, `tradeRestriction` cho phép `null`;
    - `enAliases` ≤ 50 chuỗi < 500 ký tự;
    - `marketPrice` có 4 chuỗi và `sourced === false`;
    - `hsHints` ≤ 10 phần tử, `hs6` khớp `/^\d{4}\.\d{2}$/`;
    - `provenance.verified === false`, `origin` đúng literal.
  - Trả về các key cơ bản + các key mở rộng có mặt.
- [ ] **Step 4:** chạy lại → PASS.
- [ ] **Step 5:** Commit `feat(api): accept extended prototype item fields and allow shrimp`.

### Task 2: DTO người học — trả tên/phân loại mở rộng, giấu dữ liệu chưa nguồn

**Files:**
- Modify: `apps/api/src/catalog.ts` (`Catalog.dto`), `apps/api/src/contract.ts` (`CatalogItemResponse`), `apps/api/src/controllers.ts` (query `taxon`), `Catalog.list`
- Regenerate: `docs/api/openapi.json` (`npm run contract:generate`)
- Test: `apps/api/src/rules.test.ts`

**Interfaces:**
- Consumes: `ItemData` (Task 1).
- Produces:
  - `CatalogItemResponse` thêm tùy chọn (nullable khi thiếu): `taxonomicGroup`, `family`, `familyVi`, `enAliases: string[]`, `jaKanji`, `jaTrade`.
  - `GET /catalog/items?taxon=fish|crustacean|mollusc|other`.
  - Chữ ký mới `Catalog.list(actor, page, limit, query, group, learnable, taxon = '')`.

- [ ] **Step 1: Test**

```ts
test('learner DTO exposes names/taxonomy but never unsourced fields', () => {
  const dto = new Catalog(null as never).dto({ id: 'r1', data: { ...item, ...extended }, names: [], media: [] });
  assert.equal(dto.family, 'Penaeidae');
  assert.equal(dto.jaTrade, 'ブラックタイガー');
  assert.deepEqual(dto.enAliases, ['Giant tiger prawn']);
  for (const k of ['rarity', 'marketPrice', 'hsHints', 'provenance', 'tradeRestriction'])
    assert.ok(!(k in dto), k);
  assert.ok(!/USD|đ\/kg|0306\.17/.test(JSON.stringify(dto)));
});
test('legacy item DTO has empty extended fields', () => {
  const dto = new Catalog(null as never).dto({ id: 'r1', data: item, names: [], media: [] });
  assert.equal(dto.family, null);
  assert.deepEqual(dto.enAliases, []);
});
```

- [ ] **Step 2:** chạy → FAIL.
- [ ] **Step 3:** Sửa `dto` (liệt kê tường minh các trường, không spread `data`). Thêm `taxon` vào `list`:
  - validate: rỗng hoặc ∈ 4 giá trị, sai → 400 "Phân trang/bộ lọc không hợp lệ.";
  - lọc bằng `data: { path: ['taxonomicGroup'], equals: taxon }`.

  Thêm `@ApiProperty({ required: false, nullable: true })` cho các trường mới, rồi `npm run contract:generate`.
- [ ] **Step 4:** chạy test + typecheck → PASS; `git diff docs/api/openapi.json` chỉ có thêm trường và query.
- [ ] **Step 5:** Commit `feat(api): expose extended names to learners, add taxon filter`.

### Task 3: Audio không còn chặn publish public

**Files:**
- Modify: `apps/api/src/catalog.ts` (`publish`, khoảng dòng 325–345)
- Test: `apps/api/src/rules.test.ts`

**Interfaces:**
- Produces: `export function publicRowProblem(row: { status: string; reviewedBy: string | null; names: { kind: string; source: string }[] }): string | null`. Trả thông báo lỗi tiếng Việt, hoặc `null` nếu hợp lệ.

- [ ] **Step 1: Test**

```ts
const names = ['vi', 'en', 'ja', 'scientific'].map((kind) => ({ kind, source: 'src' }));
test('public publish no longer requires approved audio', () => {
  assert.equal(publicRowProblem({ status: 'approved', reviewedBy: 'u1', names }), null);
  assert.match(publicRowProblem({ status: 'draft', reviewedBy: null, names })!, /duyệt/);
  assert.match(publicRowProblem({ status: 'approved', reviewedBy: 'u1', names: names.slice(1) })!, /tên/);
});
```

- [ ] **Step 2:** chạy → FAIL (chưa có hàm).
- [ ] **Step 3:**
  - Viết `publicRowProblem`, giữ nguyên thông báo "Mục học chưa đủ tên/nguồn/duyệt.".
  - Trong `publish`, thay khối kiểm tên + audio bằng hàm này. **Xóa** kiểm audio `en/ja/scientific`.
  - Giữ nguyên các kiểm ảnh identification ≥ 3 và các kiểm sau đó.
  - Bài nghe đã tự lọc mục không có audio (`learning.ts` nhánh `listening`), không cần sửa.
- [ ] **Step 4:** chạy → PASS.
- [ ] **Step 5:** Commit `feat(api): approved audio gates listening only, not publishing`.

### Task 4: Lượt học đúng với release > 100 mục

**Files:**
- Modify: `apps/api/src/learning.ts:204-216` và truy vấn scenario (khoảng dòng 366)
- Test: `apps/api/src/rules.test.ts`

**Interfaces:**
- Produces: `export function pickPool(ids: string[], focusId: string | undefined, size = 100): string[]`. `focusId` (nếu có trong `ids`) luôn ở vị trí 0; phần còn lại xáo bằng `shuffled`; tổng ≤ `size`; không trùng.

- [ ] **Step 1: Test**

```ts
test('pickPool keeps the focus item even beyond the first 100', () => {
  const ids = Array.from({ length: 250 }, (_, i) => `r${i}`);
  const pool = pickPool(ids, 'r240');
  assert.equal(pool[0], 'r240');
  assert.equal(pool.length, 100);
  assert.equal(new Set(pool).size, 100);
  assert.ok(pool.every((id) => ids.includes(id)));
  assert.equal(pickPool(ids.slice(0, 5), undefined).length, 5);
  assert.equal(pickPool(ids, 'missing')[0] === 'missing', false);
});
```

- [ ] **Step 2:** chạy → FAIL.
- [ ] **Step 3:** Đổi luồng lấy dữ liệu trong `learning.ts`:
  1. `findMany({ where: <như cũ>, select: { id: true } })` lấy toàn bộ id hợp lệ của release (tối đa 2000, theo giới hạn publish).
  2. `pickPool(ids, revisionId)`.
  3. `findMany({ where: { id: { in: pool } }, include: <như cũ> })`, rồi sắp lại theo thứ tự `pool`.
  4. `selected = rows[0]` khi `revisionId` khớp (hoặc khi không truyền `revisionId`); `revisionId` không có trong release → giữ lỗi hiện tại.

  Truy vấn `tradeScenario` dùng **toàn bộ id** ở bước 1, không chỉ pool.
- [ ] **Step 4:** chạy → PASS.
- [ ] **Step 5:** Commit `fix(api): sample learning pool from the whole release`.

### Task 5: Endpoint đọc cho importer

**Files:**
- Modify: `apps/api/src/admin-extra.controller.ts`
- Create: `apps/api/src/import-state.ts`
- Test: `apps/api/src/rules.test.ts`

**Interfaces:**
- Produces (dùng ở Task 7):
  - `GET /api/v1/admin/items/by-external/:externalId` (role editor/reviewer/publisher/admin). Trả về `ImportState`; 404 nếu không có item.

```ts
export interface ImportState {
  externalId: string;
  latest: { revisionId: string; version: number; status: string; released: boolean;
            fromImporter: boolean; hasProfileImage: boolean; scenarioCaseIds: string[] };
}
export function summarizeImportState(item: {
  externalId: string;
  revisions: { id: string; version: number; status: string; data: unknown;
               releases: unknown[]; media: { asset: { role: string; revokedAt: Date | null } }[];
               scenarios: { data: unknown }[] }[];
}): ImportState
```

  Quy ước: `fromImporter` = `data.provenance.origin === 'prototype:seafood-master-2'`; `scenarioCaseIds` = `scenario.data.provenance.prototypeCaseId` của revision mới nhất.

  Prisma: `Revision` chưa có quan hệ ngược tới `TradeScenario` trong schema. Dùng truy vấn riêng `tradeScenario.findMany({ where: { revisionId } })` rồi ghép vào, **không** sửa schema.
- Produces: `GET /api/v1/admin/tariffs?code=030617&version=HS%202022` (role như trên). Trả `{ id, code, level, version, reviewedBy }[]`, `code` đã `normalizeCode(code, 6)`.

- [ ] **Step 1: Test `summarizeImportState`:** chọn revision version cao nhất; `released` true khi `releases.length > 0`; ảnh `profile` đã revoke không tính; mục không có provenance → `fromImporter: false`.
- [ ] **Step 2:** chạy → FAIL.
- [ ] **Step 3:** Viết hàm và 2 route; validate `externalId` bằng regex của `validateItem`.
- [ ] **Step 4:** chạy → PASS. `npm run contract:generate` nếu snapshot gồm route admin (kiểm `scripts/export-contract.mjs`).
- [ ] **Step 5:** Commit `feat(api): admin lookups for idempotent prototype import`.

### Task 6: Module chuyển đổi prototype (thuần, có test)

**Files:**
- Create: `scripts/prototype/convert.mjs`, `scripts/prototype/convert.test.mjs`
- Modify: `package.json` gốc. Thêm devDependency `"json5": "2.2.3"` và script `"test:scripts": "node --test scripts/prototype/"`; nối vào `"test"` (`... && npm run test:scripts`).

**Interfaces:**
- Produces (Task 7 dùng):

```js
export function parsePrototypeArray(source, globalName) // text → array; json5, không eval; lỗi rõ nếu không thấy `window.<globalName>`
export function toItem(species)          // → ItemData (Task 1), gồm provenance.digest = sha256(JSON.stringify(species))
export function toScenario(hsCase)       // → { speciesId, code: '1605.21', data: HsScenarioData }
export function mediaInfo(species)       // → { role:'profile', source, credit, rights, aiGenerated:'false' } | null khi image null
export function planItem(state, item)    // state: ImportState | null → 'create' | 'resume' | 'skip-existing' | 'skip-duplicate-species'
export const DUPLICATE_SCIENTIFIC = ['Gadus morhua','Thunnus albacares','Meretrix lyrata','Perna viridis']
```

**Quy tắc ánh xạ:** theo bảng spec 5.4 (group fish→"Cá", crustacean→"Giáp xác", mollusc→"Nhuyễn thể", other→"Khác"; `sku = proto-<id>`; `forms` = `hs_rules[].label_vi`; `hsHints` từ `hs_rules`; `rarity`, `marketPrice` với `sourced:false`).

**`toScenario`:**
- `data = { prompt: scenario_vi, explanation: steps.map(s => s.explain_vi).join('\n\n'), kind: 'code', facts: {}, options, steps, trapTag: trap_tag, provenance: { origin, prototypeCaseId: id, verified: false } }`.
- `options` = các lựa chọn bước cuối, cắt về mã trần bằng `/^\d{4}\.\d{2}/`, `correct` theo `answer`. Mã trần đúng phải bằng `final_hs6`, sai thì throw.
- `steps[i] = { question, options: [{label, correct}], explanation }`, giữ nguyên nhãn đầy đủ.

**`mediaInfo`:**
- `source = 'Prototype seafood-master-2 assets/images/<id>.jpg — chưa có link file gốc'`, `credit = image_credit`.
- `rights` tách phần trong ngoặc (`CC BY-SA 3.0`, `CC BY-SA`, `CC BY 3.0`) + `' — thiếu tác giả/link, chưa đủ ghi công'`.

**`planItem`:**
- `null` → `create`;
- `latest.fromImporter && status==='draft' && !released` → `resume`;
- còn lại → `skip-existing`.

Tên khoa học trùng `DUPLICATE_SCIENTIFIC` được kiểm **trước** khi gọi `planItem` và trả `skip-duplicate-species`. Bộ 6 loài cũ có externalId khác prototype nên phải kiểm theo tên khoa học.

- [ ] **Step 1: Test** với fixture inline (2 loài: một đủ `kanji/trade`, một `kanji:null, trade:null`, `name_en` 1 phần tử; 1 case dạng `hs_cases.js` với key không quote):
  - `parsePrototypeArray` đọc được cả `"id":` lẫn `id:`; không có `window.X` → throw;
  - `toItem(...)` qua `validateItem` không lỗi: import `validateItem` từ `apps/api/dist/catalog.js` sau `npm run build:api`; test bỏ qua kèm thông báo nếu chưa build;
  - `toItem(nullJa).jaKanji === null`, `.enAliases` là `[]`, `.ja` = kana, `.pronunciation.ja` = romaji;
  - `toScenario(case).data.options` = `[{label:'1605.21',correct:true},{label:'1605.29',correct:false}]`; `.code === '1605.21'`;
  - case có `final_hs6` lệch đáp án → throw;
  - `mediaInfo` với credit `"Wikimedia Commons (CC BY-SA 3.0)"` → `rights` bắt đầu bằng `CC BY-SA 3.0`;
  - `planItem` cho 4 trạng thái: null / importer-draft / importer-released / không phải importer.
- [ ] **Step 2:** `npm run test:scripts` → FAIL.
- [ ] **Step 3:** Viết `convert.mjs`.
- [ ] **Step 4:** → PASS.
- [ ] **Step 5:** Commit `feat(scripts): pure prototype-to-catalog converter`.

### Task 7: CLI `scripts/import-prototype.mjs`

**Files:**
- Create: `scripts/import-prototype.mjs`, `scripts/prototype/client.mjs`
- Test: `scripts/prototype/client.test.mjs`

**Interfaces:**
- Consumes: Task 5 endpoints, Task 6 module. Dùng các endpoint có sẵn:
  - `GET /auth/me` lấy csrf; `POST /auth/login {username, credential}`;
  - `POST /admin/items {item}`;
  - `POST /admin/revisions/:id/media` (multipart: file, source, credit, rights, role, aiGenerated);
  - `POST /admin/tariffs {code, level:6, market:'VN', version:'HS 2022', source}`;
  - `POST /admin/scenarios {revisionId, data, tariffId}`.
- Produces:
  - `class ApiClient(baseUrl)`: `get(path)`, `post(path, body|FormData)`. Giữ cookie `seafoodeck_session` và header `X-CSRF-Token` giống `smoke-pilot.mjs`, prefix `/api/v1`.
  - `withRetry(fn, { tries = 5, baseMs = 500 })`: chỉ retry khi status 429 hoặc lỗi mạng.

**CLI:** `node scripts/import-prototype.mjs --source <dir> --base-url <url> [--dry-run] [--export <dir>]`

1. Đọc `<dir>/data/species.js` và `<dir>/data/hs_cases.js` → convert. Lỗi convert dừng **trước** mọi lệnh ghi.
2. `--export <dir>`: ghi `species.json`, `hs-cases.json` (đã chuyển đổi, không ảnh) rồi thoát. Không cần đăng nhập.
3. Prompt ẩn username/password (readline, tắt echo); đăng nhập.
4. Với từng loài: lookup → `planItem`.
   - `create`: `POST /admin/items`.
   - `create`/`resume`: upload ảnh `<dir>/assets/images/<id>.jpg` nếu `!hasProfileImage` và file tồn tại.
   - Tạo scenario cho case của loài nếu `prototypeCaseId` chưa có trong `scenarioCaseIds`. Tariff: tra `GET /admin/tariffs`, chưa có thì tạo với `source = 'Prototype seafood-master-2 data/hs_cases.js — chưa đối chiếu biểu thuế VN'`.

   Ghi chú: DTO tariff chỉ nhận `market:'VN'`. Spec 5.5 ghi `WCO`; dùng `VN` + `version 'HS 2022'` và nói rõ trong source.
5. `--dry-run`: chỉ lookup và in kế hoạch, không POST nào ngoài đăng nhập.
6. Báo cáo cuối ra stdout: đếm theo từng kết quả, danh sách loài trùng, số ảnh `rights` thiếu ghi công, lỗi theo loài. Lỗi một loài không dừng loài khác. Exit 1 nếu có lỗi.

- [ ] **Step 1: Test `withRetry`** (429 → thành công lần 3; 400 → không retry; hết lượt → throw) và `ApiClient` lưu cookie/csrf với `fetch` giả (inject qua tham số constructor).
- [ ] **Step 2:** → FAIL.
- [ ] **Step 3:** Viết `client.mjs` và CLI.
- [ ] **Step 4:** → PASS.
- [ ] **Step 5: Chạy thật trên stack local**, cần `ALLOW_INTERNAL_DEMO=true`, theo README "Chạy nội bộ":

```sh
node scripts/import-prototype.mjs --source ../seafood-master-2 --base-url http://127.0.0.1:18089 --dry-run
node scripts/import-prototype.mjs --source ../seafood-master-2 --base-url http://127.0.0.1:18089
node scripts/import-prototype.mjs --source ../seafood-master-2 --base-url http://127.0.0.1:18089
```

  Kỳ vọng:
  - dry-run: 96 create, 4 skip-duplicate-species;
  - lần 1: 96 mục, 5 scenario, tối đa 96 ảnh, 0 lỗi;
  - lần 2: 96 skip-existing hoặc resume không tạo gì, 0 POST `/admin/items`.
- [ ] **Step 6:** Commit `feat(scripts): idempotent prototype importer over admin API`.

### Task 8: Admin hiển thị trường mở rộng

**Files:**
- Create: `apps/web/src/pilot/itemExtras.ts`, `apps/web/src/pilot/itemExtras.test.ts`
- Modify: `apps/web/src/pilot/Admin.tsx` (khu "Revision và media", sau khối `pilot-edit-fields`)

**Interfaces:**
- Produces: `export function extraRows(data: Record<string, unknown>): { label: string; value: string; unsourced: boolean }[]`.
  - Nhãn: "Nhóm phân loại", "Họ", "Tên Anh khác", "Kanji", "Tên thương mại Nhật", "Độ hiếm", "Hạn chế thương mại", "Giá tham khảo", "Gợi ý HS", "Nguồn gốc".
  - `unsourced: true` cho Độ hiếm, Giá tham khảo, Gợi ý HS.
  - Bỏ dòng thiếu dữ liệu.

- [ ] **Step 1: Test vitest:**
  - data prototype mẫu → có dòng "Giá tham khảo" chứa `8.50 - 13.50 USD/kg` và `unsourced: true`;
  - data mục cũ (không trường mở rộng) → `[]`.
- [ ] **Step 2:** `npm run test --workspace @seafoodeck/web` → FAIL.
- [ ] **Step 3:** Viết hàm. Trong `Admin.tsx`, render danh sách chỉ đọc; dòng `unsourced` kèm nhãn **"Chưa có nguồn — không hiển thị cho người học"**. Khi sửa JSON nháp, giữ nguyên các trường này (Task 1 đã đảm bảo phía API).
- [ ] **Step 4:** → PASS; `npm run build` pass.
- [ ] **Step 5:** Commit `feat(web): show extended prototype fields in admin with unsourced label`.

### Task 9: Tài liệu, snapshot nguồn, kiểm toàn bộ

**Files:**
- Create: `docs/sources/prototype-import/README.md`, `species.json`, `hs-cases.json` (sinh bằng `--export`)
- Modify:
  - `docs/Seafood_Deck_PRD.md`: dòng phạm vi "không có tôm" chỉ áp cho bộ demo 6 loài; mục 1 "Âm thanh…" → audio duyệt bắt buộc cho bài nghe, không bắt buộc để xuất bản.
  - `README.md`: thêm mục "Nhập dữ liệu prototype": lệnh dry-run/chạy, nhắc VPS chỉ chạy khi người vận hành quyết định.

**Nội dung README nguồn:** đường dẫn prototype gốc, ngày, sha256 của `species.js`/`hs_cases.js`, các giới hạn:
- toàn bộ `verified:false`;
- giá không nguồn;
- 97 ảnh thiếu tác giả/link;
- 4 loài trùng bị bỏ qua;
- độ hiếm là "hiếm thị trường", chưa đánh dấu CITES;
- tariff dùng `market VN`.

- [ ] **Step 1:** `node scripts/import-prototype.mjs --source ../seafood-master-2 --export docs/sources/prototype-import` → 2 file JSON; kiểm `jq length` = 100 và 5.
- [ ] **Step 2:** Viết README nguồn và sửa PRD/README như trên.
- [ ] **Step 3: Kiểm toàn bộ:** `npm test && npm run typecheck && npm run lint && npm run format:check && npm run build && npm run contract:generate` → không lỗi, `git status` không có thay đổi openapi chưa commit.
- [ ] **Step 4: Kiểm trên Docker local:**
  - Rebuild stack, chạy `npm run smoke:pilot`, `npm run test:e2e`. Smoke có assert publish public 6 mục seed trả 400; ghi lại lý do nó vẫn 400 (seed chưa `approved`), không nới assert.
  - Trong trang quản trị: xuất bản **release nội bộ** gồm 6 mục cũ + 96 nháp mới.
  - Đăng nhập mã mời: Thư viện thấy 102 mục; `?taxon=crustacean` lọc đúng; Flashcard với một mục prototype chạy; HS lượt chơi có hồ sơ prototype; Ghép tên chạy.
- [ ] **Step 5:** Commit `docs: prototype import provenance, PRD scope and audio gate update`.
