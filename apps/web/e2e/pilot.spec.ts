import { test, expect, type Page } from '@playwright/test';
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
async function login(page: Page, admin = false) {
  await page.goto('/');
  await page.getByLabel('Mã mời', { exact: true }).waitFor();
  if (admin) {
    await page.getByRole('button', { name: 'Dành cho quản trị' }).click();
    await page.getByLabel('Tài khoản', { exact: true }).fill(secrets.ADMIN_USERNAME);
    await page.getByLabel('Mật khẩu', { exact: true }).fill(secrets.ADMIN_PASSWORD);
  } else await page.getByLabel('Mã mời', { exact: true }).fill(secrets.LEARNER_INVITE_CODE);
  await page.getByRole('button', { name: 'Vào bộ học', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Luyện nghiệp vụ' })).toBeVisible();
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
const ledger = (p: Page) =>
  p.evaluate(() => JSON.parse(localStorage.getItem('seafood-deck:pilot:v1')!));
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
  await start(page, 'Flashcard tên loài');
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
  expect((await ledger(page)).attempts).toHaveLength(3);
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
  expect((await ledger(page)).attempts).toHaveLength(6);
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
  expect((await ledger(page)).attempts).toHaveLength(12);
  expect(Object.values((await ledger(page)).reviews)).toHaveLength(9);
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
test('corrupt browser progress is preserved until a new game is started', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('seafood-deck:pilot:v1', '{invalid'));
  await login(page);
  await expect(page.getByRole('alert')).toContainText('Tiến độ cục bộ không đọc được');
  await start(page, 'Flashcard tên loài');
  await page.getByRole('button', { name: 'Chạm để lật thẻ' }).click();
  await page.getByRole('button', { name: 'Đã nhớ', exact: true }).click();
  await next(page);
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
test('blocked progress storage does not block the learning session', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(Storage.prototype, 'getItem', {
      value: () => {
        throw new Error('blocked');
      },
    });
    Object.defineProperty(Storage.prototype, 'setItem', {
      value: () => {
        throw new Error('blocked');
      },
    });
  });
  await login(page);
  await start(page, 'Flashcard tên loài');
  await page.getByRole('button', { name: 'Chạm để lật thẻ' }).click();
  await page.getByRole('button', { name: 'Đã nhớ', exact: true }).click();
  await expect(page.getByText('Đã lưu tự đánh giá', { exact: true })).toBeVisible();
  await expect(page.getByText(/Trình duyệt không lưu được tiến độ/)).toBeVisible();
  await next(page);
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
test('admin can preview CSV errors and publish/rollback a QA draft through the browser', async ({
  page,
}) => {
  await login(page, true);
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
