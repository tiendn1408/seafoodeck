import { test, expect } from '@playwright/test';
import { names, saved, escaped, openSpecies } from './helpers';

test('image mode: local real photos, reload, double submit, retry and isolated reviews', async ({
  page,
  baseURL,
}) => {
  const outside: string[] = [],
    errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('**/*', (r) => {
    if (!r.request().url().startsWith(baseURL!)) {
      outside.push(r.request().url());
      return r.abort();
    }
    return r.continue();
  });
  await page.goto('/');
  await page.getByRole('button', { name: /Đoán hình nguyên liệu/ }).click();
  const initial = await saved(page);
  expect(initial.session.questions).toHaveLength(3);
  const originalImages = new Set<string>();
  for (let i = 0; i < 3; i++) {
    const q = (await saved(page)).session.questions[i];
    originalImages.add(q.assetId);
    await expect(page.locator('.quiz-image-frame img')).toBeVisible();
    await expect(page.locator('.quiz-image-frame img')).toHaveAttribute(
      'alt',
      'Ảnh mẫu để chọn tên loài',
    );
    expect(await page.locator('.quiz-image-frame img').getAttribute('src')).toMatch(
      /^\/media\/customer\/r\d+-v1\.jpg$/,
    );
    await expect(page.getByRole('link', { name: 'Nguồn ảnh', exact: true })).toHaveCount(0);
    const pick = i === 0 ? q.options.find((id: string) => id !== q.speciesId) : q.speciesId;
    await page.getByRole('radio', { name: new RegExp(escaped(names[pick])) }).check();
    if (i === 0) {
      await page.reload();
      await expect(
        page.getByRole('radio', { name: new RegExp(escaped(names[pick])) }),
      ).toBeChecked();
      expect((await saved(page)).session.questions).toEqual(initial.session.questions);
    }
    await page.getByRole('button', { name: 'Kiểm tra câu trả lời', exact: true }).dblclick();
    expect((await saved(page)).attempts).toHaveLength(i + 1);
    await expect(page.getByRole('link', { name: 'Nguồn ảnh', exact: true })).toBeVisible();
    await page
      .getByRole('button', { name: i === 2 ? 'Xem tổng kết' : 'Tiếp tục', exact: true })
      .click();
  }
  expect(originalImages.size).toBe(3);
  await expect(page.getByText('Đã trả lời 3 lượt · Bỏ qua 0 câu')).toBeVisible();
  const finished = await saved(page);
  expect(Object.keys(finished.reviews)).toHaveLength(3);
  expect(
    Object.values(finished.reviews).every(
      (r: unknown) => (r as { skill: string }).skill === 'image',
    ),
  ).toBe(true);
  await page.getByRole('button', { name: 'Ôn lỗi ngay' }).click();
  const s = (await saved(page)).session,
    q = s.questions[s.cursor];
  expect(s.id).toBe(finished.session.id);
  await page.getByRole('radio', { name: new RegExp(escaped(names[q.speciesId])) }).check();
  await page.getByRole('button', { name: 'Kiểm tra câu trả lời' }).click();
  await page.getByRole('button', { name: 'Xem tổng kết' }).click();
  await expect(page.getByRole('button', { name: 'Ôn lỗi ngay' })).toHaveCount(0);
  expect(
    Object.values((await saved(page)).reviews).every(
      (r: unknown) => (r as { stage: number }).stage === 0,
    ),
  ).toBe(true);
  expect(outside).toEqual([]);
  expect(errors).toEqual([]);
});

test('missing photos: skip does not count answered, wrong or due; no AI replacement', async ({
  page,
}) => {
  await page.route('**/media/customer/*.jpg', (r) => r.abort());
  await page.goto('/');
  await page.getByRole('button', { name: /Đoán hình nguyên liệu/ }).click();
  for (let i = 0; i < 3; i++) {
    await expect(page.getByRole('alert')).toContainText('Ảnh không tải được');
    await expect(page.getByRole('button', { name: 'Kiểm tra câu trả lời' })).toBeDisabled();
    await page.getByRole('button', { name: 'Bỏ qua câu', exact: true }).click();
    await page
      .getByRole('button', { name: i === 2 ? 'Xem tổng kết' : 'Tiếp tục', exact: true })
      .click();
  }
  await expect(page.getByText(/Đã trả lời 0 lượt · Bỏ qua 3 câu/)).toBeVisible();
  await expect(page.getByText(/không tính tỷ lệ/)).toBeVisible();
  expect(Object.keys((await saved(page)).reviews)).toHaveLength(0);
  await expect(page.getByRole('button', { name: 'Thử lại câu bỏ qua' })).toBeVisible();
});

test('six species flashcards and all eighteen missing audio slots are honestly reported', async ({
  page,
}) => {
  for (const id of Object.keys(names)) {
    await openSpecies(page, id);
    for (const lang of ['Tiếng Anh', 'Tiếng Nhật', 'Tên khoa học'])
      await page.getByRole('button', { name: `Nghe ${lang}`, exact: true }).click();
    await expect(page.getByText('Chưa có bản thu đã duyệt.')).toHaveCount(3);
    await page.getByRole('button', { name: 'Chỉ học flashcard · 3 thẻ' }).click();
    for (let i = 0; i < 3; i++) {
      await page.getByRole('button', { name: 'Chạm để lật thẻ' }).click();
      await page
        .getByRole('button', { name: i === 0 ? 'Chưa nhớ' : 'Đã nhớ', exact: true })
        .click();
      await page
        .getByRole('button', { name: i === 2 ? 'Xem tổng kết' : 'Tiếp tục', exact: true })
        .click();
    }
    await expect(page.getByRole('heading', { name: 'Bạn đã hoàn thành lượt học.' })).toBeVisible();
  }
  const state = await saved(page);
  expect(state.attempts).toHaveLength(18);
  expect(state.attempts.every((a: { selfRated: boolean }) => a.selfRated)).toBe(true);
});

test('HS: whole fish, missing form and same-species fillet use sourced six-digit codes', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: /HS theo dạng hàng/ }).click();
  await page.getByRole('radio', { name: /0303.42/ }).check();
  await page.getByRole('button', { name: 'Kiểm tra câu trả lời' }).dblclick();
  await page.getByRole('button', { name: 'Tiếp tục', exact: true }).click();
  await page.getByRole('radio', { name: /Chưa đủ thông tin/ }).check();
  await expect(page.getByRole('button', { name: 'Kiểm tra câu trả lời' })).toBeDisabled();
  await page.getByRole('radio', { name: 'Hàng nguyên con hay phi lê?' }).check();
  await page.reload();
  await expect(page.getByRole('radio', { name: 'Hàng nguyên con hay phi lê?' })).toBeChecked();
  await page.getByRole('button', { name: 'Kiểm tra câu trả lời' }).click();
  await page.getByRole('button', { name: 'Tiếp tục', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Cùng loài, chuyển sang phi lê' })).toBeVisible();
  await page.getByRole('radio', { name: /0304.87/ }).check();
  await page.getByRole('button', { name: 'Kiểm tra câu trả lời' }).click();
  await page.getByRole('button', { name: 'Xem tổng kết' }).click();
  const state = await saved(page);
  expect(state.attempts).toHaveLength(3);
  expect(state.attempts.every((a: { correct: boolean }) => a.correct)).toBe(true);
});
