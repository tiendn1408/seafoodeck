import { test, expect, type BrowserContextOptions, type Page } from '@playwright/test';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { Game } from '../src/pilot/api';
const secrets = Object.fromEntries(
  readFileSync(new URL('../../../.local/pilot.env', import.meta.url), 'utf8')
    .trim()
    .split('\n')
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i), l.slice(i + 1)];
    }),
);
const pack = JSON.parse(
  readFileSync(new URL('../../../test-fixtures/pilot-pack.json', import.meta.url), 'utf8'),
) as {
  names: { speciesId: string; kind: string; label: string }[];
  scenarios: {
    title: string;
    answerType: string;
    missingFact?: string;
    tariffId: string;
    followUps: { id: string; label: string }[];
  }[];
  tariffs: { id: string; code: string }[];
};
type QaUser = { username: string; password: string };
// QA accounts are created once per worker (per project) through the admin API and stay in the
// local DB. Passwords are random, kept in memory only and never printed.
const users: Record<'student' | 'second' | 'persist' | 'must', QaUser> = {} as never;
const secret = () => randomBytes(18).toString('base64url');
/** Admin-created users only ever go to a loopback stack (same guard as scripts/local-origin.mjs). */
function localOnly(origin: string) {
  const host = new URL(origin).hostname.toLowerCase();
  if (!['127.0.0.1', 'localhost', '::1', '[::1]'].includes(host))
    throw new Error(`E2E tạo người dùng QA; từ chối chạy trên ${origin} (chỉ máy local).`);
}
test.beforeAll(async ({ playwright }, info) => {
  const origin = new URL(String(info.project.use.baseURL)).origin;
  localOnly(origin);
  const api = await playwright.request.newContext({
    baseURL: origin,
    extraHTTPHeaders: { Origin: origin },
  });
  try {
    let csrf = (await (await api.get('/api/v1/auth/me')).json()).csrf as string;
    const signedIn = await api.post('/api/v1/auth/login', {
      headers: { 'X-CSRF-Token': csrf },
      data: { username: secrets.ADMIN_USERNAME, credential: secrets.ADMIN_PASSWORD },
    });
    expect(signedIn.status(), 'admin login').toBe(201);
    csrf = (await signedIn.json()).csrf;
    const stamp = Date.now().toString(36) + info.project.name.slice(0, 1);
    for (const key of ['student', 'second', 'persist', 'must'] as const) {
      const user = { username: `qa-e2e-${stamp}-${key}`, password: secret() };
      const created = await api.post('/api/v1/admin/users', {
        headers: { 'X-CSRF-Token': csrf },
        data: {
          ...user,
          role: 'student',
          displayName: 'QA e2e',
          mustChangePassword: key === 'must',
        },
      });
      expect(created.status(), `create ${user.username}`).toBe(201);
      users[key] = user;
    }
  } finally {
    await api.dispose();
  }
});
/** Account login through the default form (a QA student unless another user is given). */
async function login(page: Page, user: QaUser = users.student) {
  await page.goto('/');
  await page.getByLabel('Tên đăng nhập', { exact: true }).fill(user.username);
  await page.getByLabel('Mật khẩu', { exact: true }).fill(user.password);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Luyện nghiệp vụ' })).toBeVisible();
}
async function adminLogin(page: Page) {
  await page.goto('/#admin');
  await page.getByLabel('Tài khoản', { exact: true }).fill(secrets.ADMIN_USERNAME);
  await page.getByLabel('Mật khẩu', { exact: true }).fill(secrets.ADMIN_PASSWORD);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await page.goto('/#home');
  await expect(page.getByRole('heading', { name: 'Luyện nghiệp vụ' })).toBeVisible();
}
type MeProgress = {
  sessions: { sessionId: string; mode: string; answered: number; selfRated: number }[];
  figures: { answered: number; selfRated: number };
};
type MeReview = { due: unknown[]; scheduled: unknown[] };
/** Server progress of the signed-in student (the page's session cookie). */
const me = async <T>(page: Page, path: string): Promise<T> => {
  const response = await page.request.get('/api/v1/me/' + path);
  expect(response.status()).toBe(200);
  return (await response.json()) as T;
};
const sessionRow = async (page: Page, id: string) =>
  (await me<MeProgress>(page, 'progress')).sessions.find((s) => s.sessionId === id);
/** Rates every remaining flashcard "Đã nhớ" and opens the summary. */
async function rateAll(page: Page) {
  for (;;) {
    await page.getByRole('button', { name: 'Chạm để lật thẻ' }).click();
    await page.getByRole('button', { name: 'Đã nhớ', exact: true }).click();
    const last = page.getByRole('button', { name: 'Xem tổng kết', exact: true });
    await expect(
      last.or(page.getByRole('button', { name: 'Tiếp tục', exact: true })),
    ).toBeVisible();
    if (await last.isVisible()) {
      await last.click();
      break;
    }
    await next(page);
  }
  await expect(page.getByRole('heading', { name: 'Tổng kết lượt học' })).toBeVisible();
}
async function start(page: Page, name: string) {
  if (!(await page.getByRole('heading', { name: 'Luyện nghiệp vụ' }).isVisible()))
    await page.getByRole('link', { name: 'Học', exact: true }).click();
  const response = page.waitForResponse(
    (r) => r.url().endsWith('/api/v1/learning/sessions') && r.request().method() === 'POST',
  );
  await page.getByRole('button', { name: new RegExp(name) }).click();
  const game = (await (await response).json()) as Game;
  await expect(page.locator('.pilot-question')).toBeVisible();
  return game;
}
async function next(page: Page, last = false) {
  await page.getByRole('button', { name: last ? 'Xem tổng kết' : 'Tiếp tục', exact: true }).click();
}
test('catalogue uses API paging, Japanese search, signed thumbnails and stable deep links', async ({
  page,
}) => {
  await login(page);
  await expect(page.getByLabel('Chọn loài học tên').locator('option')).toHaveCount(6);
  await page.getByRole('link', { name: 'Thư viện', exact: true }).click();
  await expect(page.locator('.library-card')).toHaveCount(12);
  await expect(page.getByText(/1000 mục/)).toBeVisible();
  await page.getByRole('button', { name: 'Trang sau' }).click();
  await expect(page.getByText('1000 mục · Trang 2')).toBeVisible();
  await page.getByLabel('Tìm loài theo bốn tên gọi').fill('ミドリ');
  await expect(page.locator('.library-card')).toHaveCount(1);
  await page.locator('.library-card').click();
  await expect(page).toHaveURL(/#profile\/green-mussel$/);
  await page.reload();
  await expect(
    page.getByRole('heading', { level: 1, name: 'Vẹm xanh', exact: true }),
  ).toBeVisible();
  const image = page.locator('.cover-photo img');
  await expect(image).toBeVisible();
  await expect
    .poll(() => image.evaluate((i) => (i as HTMLImageElement).naturalWidth))
    .toBeGreaterThan(0);
  await expect(page.getByText('Chưa có bản thu đã duyệt.', { exact: true })).toHaveCount(3);
  await page.route('**/api/v1/catalog/items?**', (r) => r.abort());
  await page.goto('/#library');
  await expect(page.getByRole('alert')).toContainText('Không kết nối');
  await expect(page.locator('.library-card')).toHaveCount(0);
});
test('all four modes: reload, double submit, keyboard match, skipped media, HS and review', async ({
  page,
}) => {
  await login(page);
  const reviewsBefore = await me<MeReview>(page, 'review');
  const flash = await start(page, 'Flashcard tên loài');
  for (let i = 0; i < 3; i++) {
    await page.getByRole('button', { name: 'Chạm để lật thẻ' }).click();
    await expect(page.getByRole('button', { name: 'Đã nhớ', exact: true })).toBeVisible();
    if (i === 0) {
      await page.reload();
      await expect(page.getByRole('button', { name: 'Đã nhớ', exact: true })).toBeVisible();
    }
    await page.getByRole('button', { name: 'Đã nhớ', exact: true }).dblclick();
    await next(page, i === 2);
  }
  await expect(page.getByRole('heading', { name: 'Tổng kết lượt học' })).toBeVisible();
  // Double clicks and the reload logged each self-rating once on the server.
  expect(await sessionRow(page, flash.id)).toMatchObject({ mode: 'flashcard', selfRated: 3 });
  const match = await start(page, 'Ghép tên thương mại'),
    q = match.questions[0];
  for (const left of q.left!) {
    const species = pack.names.find((n) => n.kind === 'vi' && n.label === left.label)!.speciesId;
    const en = pack.names.find((n) => n.speciesId === species && n.kind === 'en')!.label;
    const l = page
      .locator('.pilot-match>div')
      .first()
      .getByRole('button', { name: left.label, exact: true });
    await l.focus();
    await page.keyboard.press('Enter');
    await page
      .locator('.pilot-match>div')
      .nth(1)
      .getByRole('button', { name: en, exact: true })
      .click();
  }
  await page.getByRole('button', { name: 'Nộp câu trả lời' }).click();
  await expect(page.getByText('Chính xác', { exact: true })).toBeVisible();
  await next(page, true);
  await expect(page.getByRole('heading', { name: 'Tổng kết lượt học' })).toBeVisible();
  expect(await sessionRow(page, match.id)).toMatchObject({ mode: 'match', answered: 3 });
  await page.route('**/seafoodeck-private/**', (r) => r.abort());
  await start(page, 'Đoán hình nguyên liệu');
  for (let i = 0; i < 3; i++) {
    await page.getByRole('button', { name: 'Bỏ qua ảnh' }).click();
    await expect(page.getByText('Đã bỏ qua', { exact: true })).toBeVisible();
    await next(page, i === 2);
  }
  await expect(page.getByText('Chưa có câu chấm tự động được trả lời.')).toBeVisible();
  await expect(page.locator('.pilot-summary')).not.toContainText('0%');
  await page.unroute('**/seafoodeck-private/**');
  const hs = await start(page, 'HS theo dạng hàng');
  for (let i = 0; i < 3; i++) {
    const question = hs.questions[i],
      sample = pack.scenarios.find((s) => question.prompt.startsWith(s.title))!,
      code = pack.tariffs.find((t) => t.id === sample.tariffId)!.code;
    const label = sample.answerType === 'insufficient' ? 'Chưa đủ thông tin' : code;
    await page.getByRole('button', { name: label, exact: true }).click();
    if (sample.answerType === 'insufficient')
      await page
        .getByLabel('Dữ kiện cần hỏi thêm')
        .selectOption({ label: sample.followUps.find((f) => f.id === sample.missingFact)!.label });
    if (i === 0) {
      await page.reload();
      await expect(page.locator('.pilot-option.selected')).toHaveText(label);
    }
    await page.getByRole('button', { name: 'Nộp câu trả lời' }).dblclick();
    await expect(page.getByText('Chính xác', { exact: true })).toBeVisible();
    await next(page, i === 2);
  }
  await expect(page.getByRole('heading', { name: 'Tổng kết lượt học' })).toBeVisible();
  expect(await sessionRow(page, hs.id)).toMatchObject({ mode: 'hs', answered: 3 });
  const reviews = await me<MeReview>(page, 'review');
  const rows = (r: MeReview) => r.due.length + r.scheduled.length;
  expect(rows(reviewsBefore)).toBe(0);
  expect(rows(reviews)).toBe(9);
  await page.goto('/#review');
  await expect(page.getByRole('heading', { name: 'Góc ôn tập của bạn.' })).toBeVisible();
  await expect(page.locator('.review-skill')).toHaveCount(9);
  expect(await page.locator('main').innerText()).not.toMatch(/name:en|match:en/);
});
test('Thả lưới mở được một phiên và về được trang chủ', async ({ page }) => {
  await login(page);
  await expect(
    page.getByRole('heading', { level: 1, name: /Mẻ lưới hôm nay: \d+ loài đang chờ/ }),
  ).toBeVisible();
  await expect(page.getByRole('img', { name: 'Tiến độ mẻ lưới: 0 / 5' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Tiếp tục phiên học' })).toHaveCount(0);
  const response = page.waitForResponse(
    (r) => r.url().endsWith('/api/v1/learning/sessions') && r.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Thả lưới', exact: true }).click();
  const game = (await (await response).json()) as Game;
  expect(game.mode).toBe('flashcard');
  await expect(page.locator('.pilot-question')).toBeVisible();
  await page.getByRole('button', { name: 'Chạm để lật thẻ' }).click();
  await page.getByRole('button', { name: 'Đã nhớ', exact: true }).click();
  await expect(page.getByText('Đã lưu tự đánh giá', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Tạm dừng' }).click();
  await expect(page).toHaveURL(/#home$/);
  await expect(page.getByRole('heading', { name: 'Luyện nghiệp vụ' })).toBeVisible();
  await expect(
    page.getByRole('img', { name: `Tiến độ mẻ lưới: 1 / ${game.questions.length}` }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Tiếp tục phiên học' })).toBeVisible();
});
test('profile thumbnail retries one failed signed request and then loads', async ({ page }) => {
  await login(page);
  let requests = 0;
  await page.route('**/seafoodeck-private/**', async (route) => {
    requests++;
    if (requests === 1) await route.fulfill({ status: 403, body: 'Expired test URL' });
    else await route.continue();
  });
  await page.goto('/#profile/atlantic-cod');
  const image = page.locator('.cover-photo img');
  await expect(image).toBeVisible();
  await expect
    .poll(() => image.evaluate((i) => (i as HTMLImageElement).naturalWidth))
    .toBeGreaterThan(0);
  expect(requests).toBe(2);
});
test('blocked localStorage does not block the learning session', async ({ page }) => {
  // Every Web Storage call throws: drafts and the tab's session token may be lost, but the
  // account session (cookie) and the server-side progress keep the game working.
  await page.addInitScript(() => {
    for (const name of ['getItem', 'setItem', 'removeItem', 'clear'] as const)
      Object.defineProperty(Storage.prototype, name, {
        value: () => {
          throw new Error('blocked');
        },
      });
  });
  await login(page);
  const game = await start(page, 'Flashcard tên loài');
  await page.getByRole('button', { name: 'Chạm để lật thẻ' }).click();
  await page.getByRole('button', { name: 'Đã nhớ', exact: true }).click();
  await expect(page.getByText('Đã lưu tự đánh giá', { exact: true })).toBeVisible();
  await next(page);
  await rateAll(page);
  expect(await sessionRow(page, game.id)).toMatchObject({ selfRated: game.questions.length });
});
for (const viewport of [
  { width: 320, height: 568 },
  { width: 360, height: 640 },
  { width: 390, height: 740 },
])
  test(`flashcard fits ${viewport.width}×${viewport.height} with all six species`, async ({
    page,
  }, info) => {
    test.skip(info.project.name !== 'mobile', 'Phone-only viewport check');
    await page.setViewportSize(viewport);
    await login(page);
    await expect(page.getByLabel('Chọn loài học tên').locator('option')).toHaveCount(6);
    const options = await page
      .getByLabel('Chọn loài học tên')
      .locator('option')
      .evaluateAll((nodes) =>
        nodes.map((n) => ({ id: (n as HTMLOptionElement).value, label: n.textContent! })),
      );
    for (const item of options) {
      await page.goto('/#home');
      await page.getByLabel('Chọn loài học tên').selectOption(item.id);
      await start(page, 'Flashcard tên loài');
      for (let i = 0; i < 3; i++) {
        await page.getByRole('button', { name: 'Chạm để lật thẻ' }).click();
        const rate = page.getByRole('button', { name: 'Đã nhớ', exact: true });
        await expect(rate).toBeVisible();
        const dims = await page.evaluate(() => ({
          h: document.documentElement.scrollHeight,
          v: innerHeight,
          w: document.documentElement.scrollWidth,
          vw: innerWidth,
          body: document.querySelector('.pilot-question-body')?.scrollHeight,
          client: document.querySelector('.pilot-question-body')?.clientHeight,
        }));
        expect(dims.h).toBeLessThanOrEqual(dims.v);
        expect(dims.w).toBeLessThanOrEqual(dims.vw);
        expect(dims.body!).toBeLessThanOrEqual(dims.client!);
        await rate.click();
        const advance = page.getByRole('button', {
          name: i === 2 ? 'Xem tổng kết' : 'Tiếp tục',
          exact: true,
        });
        await expect(advance).toBeVisible();
        const action = await advance.boundingBox();
        expect(action!.y + action!.height).toBeLessThanOrEqual(viewport.height);
        const rated = await page
          .locator('.pilot-question-body')
          .evaluate((el) => ({ scroll: el.scrollHeight, client: el.clientHeight }));
        expect(rated.scroll).toBeLessThanOrEqual(rated.client);
        await next(page, i === 2);
      }
    }
  });
async function checkLayout(page: Page) {
  const fits = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  const contained = async (selector: string) => {
    await expect.poll(() => page.locator(selector).count()).toBeGreaterThan(0);
    const values = await page
      .locator(selector)
      .evaluateAll((imgs) => imgs.map((i) => getComputedStyle(i).objectFit));
    expect(values.every((v) => v === 'contain')).toBe(true);
  };
  await page.goto('/#home');
  await expect(page.locator('.home-catch')).toBeVisible();
  await contained('.home-catch .species-card-photo img');
  expect(await fits()).toBe(true);
  await page.goto('/#library');
  await expect(page.locator('.library-card').first()).toBeVisible();
  await contained('.library-card .species-card-photo img');
  expect(await fits()).toBe(true);
  // The first species on the page whose photo is published, so the cover has an <img>.
  const href = await page
    .locator('.library-card:has(.species-card-photo img) a')
    .first()
    .getAttribute('href');
  expect(href).toMatch(/^#profile\/.+/);
  await page.goto('/' + href);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await contained('.cover-photo img');
  expect(await fits()).toBe(true);
}
// One login covers every viewport of a project: the login limiter allows 20 attempts per 10 minutes.
test('home, library and profile never scroll sideways and show whole photos', async ({
  page,
}, info) => {
  // The second student has learned nothing yet, so Home still shows today's haul with photos
  // (the first student may have finished every species in the phone flashcard checks).
  await login(page, users.second);
  await test.step(`project viewport (${info.project.name})`, () => checkLayout(page));
  if (info.project.name === 'mobile')
    await test.step('320×640 phone', async () => {
      await page.setViewportSize({ width: 320, height: 640 });
      await checkLayout(page);
    });
  else
    await test.step('1280×800 laptop', async () => {
      await page.setViewportSize({ width: 1280, height: 800 });
      await checkLayout(page);
    });
});
test('admin can preview CSV errors and publish/rollback a QA draft through the browser', async ({
  page,
}) => {
  await adminLogin(page);
  const current = await (await page.request.get('/api/v1/catalog/items?limit=1')).json();
  const auth = await (await page.request.get('/api/v1/auth/me')).json();
  page.on('dialog', (d) => d.accept());
  try {
    await page.getByRole('link', { name: 'Quản trị', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Biên tập và xuất bản' })).toBeVisible();
    await page.getByLabel('Tìm revision theo ID hoặc tên').fill('atlantic-cod');
    await page.getByRole('button', { name: 'Tìm revision', exact: true }).click();
    await expect(
      page
        .getByLabel('Chọn revision')
        .locator('option')
        .filter({ hasText: 'Cá tuyết Đại Tây Dương' }),
    ).toHaveCount(1);
    await page.getByLabel('Tìm revision theo ID hoặc tên').fill('');
    await page.getByRole('button', { name: 'Tìm revision', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Tìm revision', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'Lấy mẫu CSV' }).click();
    await expect(page.getByLabel('Nội dung CSV')).toHaveValue(/^externalId,/);
    const csv = await page.getByLabel('Nội dung CSV').inputValue();
    const id = 'browser-qa-' + Date.now(),
      row = [
        id,
        'QA',
        'Cá',
        'SKU QA browser',
        '',
        '',
        '',
        'Internal synthetic QA only',
        '',
        '',
        '',
        'Not customer material',
        '',
        '',
        '',
      ].join(',');
    await page.getByLabel('Nội dung CSV').fill(csv + row + '\n' + row + '\n');
    await page.getByRole('button', { name: 'Xem trước lỗi' }).click();
    await expect(page.getByText('2 dòng · 1 lỗi')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Nhập nháp', exact: true })).toBeDisabled();
    await page.getByLabel('Nội dung CSV').fill(csv + row + '\n');
    await page.getByRole('button', { name: 'Xem trước lỗi' }).click();
    await expect(page.getByText('1 dòng · 0 lỗi')).toBeVisible();
    await page.getByRole('button', { name: 'Nhập nháp', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Đã lưu.' })).toBeVisible();
    const rowLabel = page
      .locator('.pilot-release-items label')
      .filter({ hasText: 'SKU QA browser' })
      .first();
    await rowLabel.getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Xuất bản thử nội bộ', exact: true }).click();
    await expect
      .poll(async () => {
        const r = await page.request.get('/api/v1/catalog/items?limit=1');
        return (await r.json()).releaseId;
      })
      .not.toBe(current.releaseId);
    await page.goto('/#library');
    await expect(page.locator('.library-card')).toHaveCount(1);
    await expect(page.locator('.library-card')).toContainText('SKU QA browser');
  } finally {
    const response = await page.request.post(
      `/api/v1/admin/releases/${current.releaseId}/rollback`,
      { headers: { 'X-CSRF-Token': auth.csrf }, data: {} },
    );
    expect(response.ok()).toBeTruthy();
  }
});
test('invite code through "Học thử bằng mã mời" opens the reduced trial Home without /me/*', async ({
  page,
}) => {
  const meRequests: string[] = [];
  page.on('request', (r) => {
    if (/^\/api\/v1\/me(\/|$)/.test(new URL(r.url()).pathname)) meRequests.push(r.url());
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Học thử bằng mã mời', exact: true }).click();
  await page.getByLabel('Mã mời', { exact: true }).fill(secrets.LEARNER_INVITE_CODE);
  await page.getByRole('button', { name: 'Vào bộ học', exact: true }).click();
  await expect(
    page.getByRole('heading', { level: 1, name: 'Học thử: chọn loài và chế độ luyện' }),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Luyện nghiệp vụ' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Đăng nhập để lưu tiến độ' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Thả lưới' })).toHaveCount(0);
  await expect(page.locator('.home-rope, .home-catch')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Bốn kỹ năng của bạn' })).toHaveCount(0);
  const nav = page.getByRole('navigation', { name: 'Điều hướng chính' });
  await expect(nav.getByRole('link')).toHaveText(['Học', 'Thư viện']);
  await expect(page.getByRole('link', { name: /Tài khoản/ })).toHaveCount(0);
  // Account-only routes fall back to Home.
  await page.goto('/#progress');
  await expect(page).toHaveURL(/#home$/);
  // The trial still learns.
  await start(page, 'Flashcard tên loài');
  await page.getByRole('button', { name: 'Chạm để lật thẻ' }).click();
  await page.getByRole('button', { name: 'Đã nhớ', exact: true }).click();
  await expect(page.getByText('Đã lưu tự đánh giá', { exact: true })).toBeVisible();
  await page.goto('/#library');
  await expect(page.locator('.library-card').first()).toBeVisible();
  expect(meRequests).toEqual([]);
});
test('progress survives cleared browser storage and a fresh login (server-side)', async ({
  page,
  browser,
}, info) => {
  await login(page, users.persist);
  await page.goto('/#progress');
  await expect(page.getByText('Chưa có phiên nào.', { exact: false })).toBeVisible();
  await page.goto('/#home');
  const response = page.waitForResponse(
    (r) => r.url().endsWith('/api/v1/learning/sessions') && r.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Thả lưới', exact: true }).click();
  const game = (await (await response).json()) as Game;
  expect(game.mode).toBe('flashcard');
  await rateAll(page);
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.context().clearCookies();
  await page.close();
  const { viewport, userAgent, isMobile, hasTouch, deviceScaleFactor, baseURL } = info.project
    .use as BrowserContextOptions;
  const fresh = await browser.newContext({
    viewport,
    userAgent,
    isMobile,
    hasTouch,
    deviceScaleFactor,
    baseURL,
  });
  try {
    const again = await fresh.newPage();
    await login(again, users.persist);
    await again.getByRole('link', { name: 'Tiến độ', exact: true }).click();
    await expect(again.getByRole('heading', { name: 'Tiến độ học của bạn' })).toBeVisible();
    const figure = (label: string) =>
      again
        .locator('.progress-figures div')
        .filter({ has: again.getByText(label, { exact: true }) });
    await expect(figure('Thẻ tự đánh giá').locator('dd')).toHaveText(String(game.questions.length));
    await expect(again.locator('.progress-sessions-list li')).toHaveCount(1);
    await expect(again.getByText('Chưa có phiên nào.', { exact: false })).toHaveCount(0);
  } finally {
    await fresh.close();
  }
});
test('a must-change account only reaches the password screen until it changes', async ({
  page,
}) => {
  const user = users.must;
  await page.goto('/');
  await page.getByLabel('Tên đăng nhập', { exact: true }).fill(user.username);
  await page.getByLabel('Mật khẩu', { exact: true }).fill(user.password);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  const heading = page.getByRole('heading', { level: 1, name: 'Đổi mật khẩu' });
  await expect(heading).toBeVisible();
  for (const route of ['#home', '#progress', '#review', '#library', '#account', '#study']) {
    await page.goto('/' + route);
    await expect(heading).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Điều hướng chính' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Luyện nghiệp vụ' })).toHaveCount(0);
  }
  const next = secret();
  await page.getByLabel('Mật khẩu hiện tại', { exact: true }).fill(user.password);
  await page.getByLabel(/^Mật khẩu mới/).fill(next);
  await page.getByLabel('Nhập lại mật khẩu mới', { exact: true }).fill(next);
  await page.getByRole('button', { name: 'Đổi mật khẩu', exact: true }).click();
  user.password = next;
  await page.goto('/#home');
  await expect(page.getByRole('heading', { name: 'Luyện nghiệp vụ' })).toBeVisible();
  await expect(
    page.getByRole('heading', { level: 1, name: /Mẻ lưới hôm nay: \d+ loài đang chờ/ }),
  ).toBeVisible();
  await expect(heading).toHaveCount(0);
});
test('logging out and in as another student never shows the first student’s data', async ({
  page,
}, info) => {
  await login(page);
  // Straight after the form login (no reload) the shell knows who is signed in: desktop shows
  // the display name in the account entry, phones an icon-only "Tài khoản" link.
  await expect(
    page.getByRole('link', {
      name: info.project.name === 'desktop' ? 'Tài khoản: QA e2e' : 'Tài khoản',
      exact: true,
    }),
  ).toBeVisible();
  await start(page, 'Flashcard tên loài');
  await rateAll(page);
  await page.getByRole('link', { name: 'Tiến độ', exact: true }).click();
  await expect(page.locator('.progress-sessions-list li').first()).toBeVisible();
  await expect(page.getByText('Chưa có phiên nào.', { exact: false })).toHaveCount(0);
  await page.getByRole('button', { name: 'Đăng xuất' }).click();
  await expect(page.getByLabel('Tên đăng nhập', { exact: true })).toBeVisible();
  await login(page, users.second);
  await expect(page.locator('.home-skills')).toBeVisible();
  for (const count of await page.locator('.home-skill-count').allInnerTexts())
    expect(count).toMatch(/^0 \//);
  await page.getByRole('link', { name: 'Tiến độ', exact: true }).click();
  await expect(page.getByText('Chưa có phiên nào.', { exact: false })).toBeVisible();
  await expect(page.locator('.progress-sessions-list')).toHaveCount(0);
  const figure = page
    .locator('.progress-figures div')
    .filter({ has: page.getByText('Thẻ tự đánh giá', { exact: true }) });
  await expect(figure.locator('dd')).toHaveText('0');
  await page.goto('/#review');
  await expect(page.getByRole('heading', { name: 'Chưa có mục ôn tập' })).toBeVisible();
});
