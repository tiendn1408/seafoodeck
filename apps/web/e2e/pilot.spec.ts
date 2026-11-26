// Learner app on the learner origin (projects `desktop` and `mobile`). Staff, manager and admin
// flows live in studio.spec.ts and run against the Studio origin.
import { test, expect, type BrowserContextOptions, type Page } from '@playwright/test';
import type { Game } from '../src/pilot/api';
import {
  LEARNER,
  STUDIO,
  createQaUsers,
  isDesktop,
  learnerLogin,
  newProjectPage,
  next,
  pack,
  rateAll,
  secret,
  secrets,
  start,
  type QaUser,
} from './support';

// QA learner accounts, created once per worker (per project) through the admin API on the Studio
// origin. Passwords are random, kept in memory only and never printed.
const QA_ACCOUNTS = {
  student: { role: 'student' },
  second: { role: 'student' },
  persist: { role: 'student' },
  must: { role: 'student', must: true },
};
let users: Record<keyof typeof QA_ACCOUNTS, QaUser>;
test.beforeAll(async ({ playwright }, info) => {
  users = await createQaUsers(
    playwright,
    Date.now().toString(36) + info.project.name.slice(0, 1),
    QA_ACCOUNTS,
  );
});
/** Account login through the learner form (a QA student unless another user is given). */
const login = (page: Page, user: QaUser = users.student) => learnerLogin(page, user);
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
      name: isDesktop(info) ? 'Tài khoản: QA e2e' : 'Tài khoản',
      exact: true,
    }),
  ).toBeVisible();
  await start(page, 'Flashcard tên loài');
  await rateAll(page);
  const figure = (label: string) =>
    page
      .locator('.progress-figures div')
      .filter({ has: page.getByText(label, { exact: true }) })
      .locator('dd');
  await page.getByRole('link', { name: 'Tiến độ', exact: true }).click();
  await expect(page.locator('.progress-sessions-list li').first()).toBeVisible();
  await expect(page.getByText('Chưa có phiên nào.', { exact: false })).toHaveCount(0);
  // The first student's own figures are non-zero, so the zeros below can only come from isolation.
  await expect(figure('Thẻ tự đánh giá')).not.toHaveText('0');
  await expect(figure('Loài đã vào lịch')).not.toHaveText(/^0 \//);
  await page.getByRole('button', { name: 'Đăng xuất' }).click();
  await expect(page.getByLabel('Tên đăng nhập', { exact: true })).toBeVisible();
  await login(page, users.second);
  await expect(page.locator('.home-skills')).toBeVisible();
  await page.getByRole('link', { name: 'Tiến độ', exact: true }).click();
  await expect(page.getByText('Chưa có phiên nào.', { exact: false })).toBeVisible();
  await expect(page.locator('.progress-sessions-list')).toHaveCount(0);
  await expect(figure('Thẻ tự đánh giá')).toHaveText('0');
  await expect(figure('Câu đã trả lời')).toHaveText('0');
  await expect(figure('Loài đã vào lịch')).toHaveText(/^0 \//);
  await page.goto('/#review');
  await expect(page.getByRole('heading', { name: 'Chưa có mục ôn tập' })).toBeVisible();
});

// ---------------------------------------------------------------------------------------------
// Phase 2.5e: the learner host carries no trace of the Studio app.
// ---------------------------------------------------------------------------------------------

/** Studio screen/chunk file names and staff API paths: none may ever be requested by a learner page. */
const STUDIO_FILE =
  /\/(Admin|HsAdmin|UsersAdmin|BulkUsers|AdminTabs|ManagerLearners|ManagerLearnerDetail|StudioApp|StaffLogin|admin|users)-[\w-]+\.\w+$/;
const STAFF_API = /^\/api\/v1\/(admin|manager|docs|openapi)/i;
/** Every request a page makes that points at the Studio origin, a studio file or a staff endpoint. */
function studioRequests(page: Page) {
  const seen: string[] = [];
  page.on('request', (r) => {
    const url = new URL(r.url());
    if (url.origin === STUDIO || STUDIO_FILE.test(url.pathname) || STAFF_API.test(url.pathname))
      seen.push(r.url());
  });
  return seen;
}

test('learner journeys (visitor, trial, student) never request Studio assets or endpoints', async ({
  page,
  browser,
}, info) => {
  test.setTimeout(150_000);
  const seen = studioRequests(page);
  // Signed-out visitor, including staff-looking hash routes.
  await page.goto('/');
  await expect(page.getByLabel('Tên đăng nhập', { exact: true })).toBeVisible();
  for (const route of ['#admin', '#admin/users', '#manager', '#study'])
    await page.goto('/' + route);
  await expect(page.getByLabel('Tên đăng nhập', { exact: true })).toBeVisible();
  // Student: every screen, a profile, a study round; staff routes bounce to Home.
  await login(page);
  for (const [route, ready] of [
    ['#library', '.library-card'],
    ['#progress', 'h1'],
    ['#review', 'h1'],
    ['#account', 'h1'],
    ['#profile/atlantic-cod', '.cover-photo img'],
  ] as const) {
    await page.goto('/' + route);
    await expect(page.locator(ready).first()).toBeVisible();
  }
  await start(page, 'Flashcard tên loài');
  for (const route of ['#admin', '#admin/users', '#manager', '#manager/learner/x']) {
    await page.goto('/' + route);
    await expect(page).toHaveURL(/#home$/);
  }
  // Invite-code trial.
  const trial = await newProjectPage(browser, info, LEARNER);
  try {
    const seenTrial = studioRequests(trial.page);
    await trial.page.goto('/');
    await trial.page.getByRole('button', { name: 'Học thử bằng mã mời', exact: true }).click();
    await trial.page.getByLabel('Mã mời', { exact: true }).fill(secrets.LEARNER_INVITE_CODE);
    await trial.page.getByRole('button', { name: 'Vào bộ học', exact: true }).click();
    await expect(trial.page.getByRole('heading', { name: 'Luyện nghiệp vụ' })).toBeVisible();
    await trial.page.goto('/#library');
    await expect(trial.page.locator('.library-card').first()).toBeVisible();
    await trial.page.goto('/#admin');
    await expect(trial.page).toHaveURL(/#home$/);
    expect(seenTrial).toEqual([]);
  } finally {
    await trial.context.close();
  }
  expect(seen).toEqual([]);
  // No learner page links to the Studio host or names it.
  const html = await page.content();
  expect(html).not.toContain(new URL(STUDIO).host);
  expect(html).not.toMatch(/Seafood Deck Studio|Quản trị/);
});

test('the learner host serves no Studio file and none of its entry assets', async ({ request }) => {
  const studioIndex = await (await request.get(STUDIO + '/')).text();
  expect(studioIndex).toContain('<div id="root">');
  const assets = [...studioIndex.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((m) => m[1]);
  expect(assets.length).toBeGreaterThan(0);
  const learnerIndex = await (await request.get(LEARNER + '/')).text();
  // Content-hashed files both builds share byte for byte (the bundler runtime) are not Studio code.
  const studioOnly = assets.filter((path) => !learnerIndex.includes(path));
  expect(studioOnly.some((path) => /\/assets\/index-[\w-]+\.js$/.test(path))).toBe(true);
  for (const path of studioOnly) {
    // The learner host answers 404 for the Studio's own files (hashed assets have no SPA fallback).
    const response = await request.get(LEARNER + path);
    expect(response.status(), path).toBe(404);
  }
});
