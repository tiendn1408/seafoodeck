import { expect, test } from '@playwright/test';
import { emptyState } from '../src/domain/session';
import { scheduleReview } from '../src/domain/review';
import { pack, saved, matchAll, escaped, openSpecies } from './helpers';

test('full course: names, dynamic matching, HS, reload, double tap, errors and review', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await openSpecies(page);
  await expect(
    page.getByRole('heading', { name: 'Cá tuyết Đại Tây Dương.', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Học trọn lượt' }).click();
  for (let i = 0; i < 3; i++) {
    await page.getByRole('button', { name: 'Chạm để lật thẻ' }).click();
    if (i === 0) {
      await page.reload();
      await expect(page.getByRole('heading', { name: 'Atlantic cod', exact: true })).toBeVisible();
    }
    await page.getByRole('button', { name: 'Đã nhớ', exact: true }).dblclick();
    expect((await saved(page)).session.cursor).toBe(i);
    await page.getByRole('button', { name: 'Tiếp tục', exact: true }).click();
  }
  const state = await saved(page),
    q = state.session.questions[state.session.cursor];
  await page.getByRole('button', { name: new RegExp(escaped(q.pairs[0].left)) }).click();
  await page.getByRole('button', { name: new RegExp(escaped(q.pairs[1].right)) }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Chưa đúng cặp' })).toBeVisible();
  await matchAll(page);
  const before = await saved(page);
  await page.reload();
  expect((await saved(page)).session.questions).toEqual(before.session.questions);
  await page.getByRole('button', { name: 'Tiếp tục', exact: true }).click();
  await page.getByRole('radio', { name: /0303.42/ }).check();
  await page.getByRole('button', { name: 'Kiểm tra câu trả lời' }).dblclick();
  await page.reload();
  await expect(page.getByText('Chính xác, bạn đã đọc đúng dữ kiện.')).toBeVisible();
  await page.getByRole('button', { name: 'Tiếp tục', exact: true }).click();
  await page.getByRole('radio', { name: /Chưa đủ thông tin/ }).check();
  await page.getByRole('radio', { name: 'Hàng nguyên con hay phi lê?' }).check();
  await page.getByRole('button', { name: 'Kiểm tra câu trả lời' }).click();
  await page.getByRole('button', { name: 'Xem tổng kết' }).click();
  await expect(page.getByRole('heading', { name: 'Bạn đã hoàn thành lượt học.' })).toBeVisible();
  const finished = await saved(page);
  expect(finished.attempts).toHaveLength(9);
  expect(Object.keys(finished.reviews)).toHaveLength(8);
  await page.getByRole('button', { name: 'Ôn lỗi ngay' }).click();
  await matchAll(page);
  await page.getByRole('button', { name: 'Xem tổng kết' }).click();
  expect((await saved(page)).session.id).toBe(finished.session.id);
  await expect(page.getByRole('button', { name: 'Ôn lỗi ngay' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Xem hàng đợi ôn' }).click();
  await expect(page.getByRole('heading', { name: 'Hàng đợi ôn tập' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  expect(errors).toEqual([]);
});

test('library group filters, Japanese search and keyboard matching', async ({ page }) => {
  await page.goto('/#library');
  await expect(page.locator('.library-card')).toHaveCount(6);
  await page.getByRole('button', { name: 'Nghêu & vẹm', exact: true }).click();
  await expect(page.locator('.library-card')).toHaveCount(2);
  await page.getByRole('button', { name: 'Tất cả nhóm', exact: true }).click();
  const input = page.getByRole('searchbox', { name: 'Tìm loài theo bốn tên gọi' });
  await input.fill('キハダ');
  await expect(page.locator('.library-card')).toHaveCount(1);
  await input.fill('không-có-loài-này');
  await expect(page.getByRole('heading', { name: 'Chưa tìm thấy loài này' })).toBeVisible();
  await page.getByRole('button', { name: 'Xem tất cả loài' }).click();
  await expect(page.locator('.library-card')).toHaveCount(6);
  await page.getByRole('combobox').selectOption('ja');
  await page.getByRole('button', { name: 'Chơi ghép tên' }).click();
  const state = await saved(page),
    q = state.session.questions[0],
    pair = q.pairs[0];
  const left = page.getByRole('button', { name: new RegExp(escaped(pair.left)) }),
    right = page.getByRole('button', { name: new RegExp(escaped(pair.right)) });
  await left.focus();
  await page.keyboard.press('Enter');
  await right.focus();
  await page.keyboard.press('Enter');
  await expect(right).toBeDisabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
});

test('blocked storage remains playable', async ({ page }) => {
  await page.addInitScript(() =>
    Object.defineProperty(window, 'localStorage', {
      get() {
        throw new DOMException('blocked', 'SecurityError');
      },
    }),
  );
  await page.goto('/');
  await expect(page.getByRole('alert')).toContainText('Không đọc được');
  await page.getByRole('button', { name: /Flashcard tên loài/ }).click();
  await expect(page.getByRole('alert')).toContainText('Không lưu được');
  await page.getByRole('button', { name: 'Chạm để lật thẻ' }).click();
  await expect(page.getByRole('heading', { name: 'Atlantic cod', exact: true })).toBeVisible();
});

test('corrupt saved data is not overwritten until user acts', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('seafood-deck:state:v1', '{broken'));
  await page.goto('/');
  await expect(page.getByRole('alert')).toContainText('Dữ liệu lưu không tương thích hoặc bị lỗi');
  expect(await page.evaluate(() => localStorage.getItem('seafood-deck:state:v1'))).toBe('{broken');
});

test('due HS review promotes only the current-pack skill', async ({ page }) => {
  const state = emptyState(),
    old = new Date(Date.now() - 3 * 86400000).toISOString();
  const r = scheduleReview(undefined, {
    id: 'seed',
    sessionId: 'seed',
    questionId: 'trade-yft-whole',
    targetId: 'trade-yft-whole',
    skill: 'hs',
    contentVersion: pack.version,
    attemptNumber: 1,
    correct: true,
    selfRated: false,
    isReview: false,
    answer: '030342',
    at: old,
  });
  state.reviews[r.key] = r;
  state.reviews['atlantic-cod/name:ja'] = {
    key: 'atlantic-cod/name:ja',
    targetId: 'atlantic-cod',
    skill: 'name:ja',
    stage: 0,
    dueAt: new Date(Date.now() + 86400000).toISOString(),
    lastSessionId: 'seed',
    contentVersion: pack.version,
    selfRated: true,
  };
  await page.addInitScript(
    (v) => localStorage.setItem('seafood-deck:state:v1', JSON.stringify(v)),
    state,
  );
  await page.goto('/#review');
  await page.getByRole('button', { name: 'Ôn 1 mục đến hạn' }).click();
  await page.getByRole('radio', { name: /0303.42/ }).check();
  await page.getByRole('button', { name: 'Kiểm tra câu trả lời' }).click();
  await page.getByRole('button', { name: 'Xem tổng kết' }).click();
  const s = await saved(page);
  expect(s.reviews['trade-yft-whole/hs'].stage).toBe(1);
  expect(s.reviews['atlantic-cod/name:ja'].stage).toBe(0);
});
