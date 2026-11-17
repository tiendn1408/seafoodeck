import { test, expect } from '@playwright/test';
import type { Page, Locator } from '@playwright/test';
import { openSpecies, names } from './helpers';
async function fitsScreen(page: Page, action: Locator) {
  const s = await page.evaluate(() => ({
    height: document.documentElement.scrollHeight,
    width: document.documentElement.scrollWidth,
    vh: innerHeight,
    vw: innerWidth,
  }));
  expect(s.height).toBeLessThanOrEqual(s.vh);
  expect(s.width).toBeLessThanOrEqual(s.vw);
  const box = await action.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height).toBeLessThanOrEqual(s.vh);
  expect(box!.height).toBeGreaterThanOrEqual(44);
}
for (const viewport of [
  { width: 320, height: 568 },
  { width: 360, height: 640 },
  { width: 390, height: 740 },
]) {
  test(`flashcard fits ${viewport.width}×${viewport.height}: six species, eighteen cards, every state`, async ({
    page,
  }, info) => {
    test.skip(info.project.name !== 'mobile', 'Phone viewport regression');
    await page.setViewportSize(viewport);
    for (const id of Object.keys(names)) {
      await openSpecies(page, id);
      await page.getByRole('button', { name: 'Chỉ học flashcard · 3 thẻ' }).click();
      for (let i = 0; i < 3; i++) {
        const flip = page.getByRole('button', { name: 'Chạm để lật thẻ' });
        await expect(flip).toBeVisible();
        await page.evaluate(() => document.fonts.ready);
        await fitsScreen(page, flip);
        await flip.click();
        await page
          .getByRole('button', { name: /^Nghe (Tiếng Anh|Tiếng Nhật|Tên khoa học)$/ })
          .click();
        await expect(page.getByText('Chưa có bản thu đã duyệt.')).toBeVisible();
        const rate = page.getByRole('button', { name: 'Đã nhớ', exact: true });
        await fitsScreen(page, rate);
        await rate.click();
        const next = page.getByRole('button', {
          name: i === 2 ? 'Xem tổng kết' : 'Tiếp tục',
          exact: true,
        });
        await fitsScreen(page, next);
        await next.click();
      }
    }
  });
}

test('header separates tasks; species URL and group survive navigation', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.sidebar,.mobile-nav')).toHaveCount(0);
  await expect(page.locator('.mode-card')).toHaveCount(4);
  await page.getByRole('link', { name: 'Tiến độ', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Tiến độ học của bạn' })).toBeVisible();
  await page.getByRole('link', { name: 'Học tập', exact: true }).click();
  await page.getByRole('link', { name: /Nghêu & vẹm/ }).click();
  await expect(page.locator('.library-card')).toHaveCount(2);
  await page.locator('.library-card').filter({ hasText: 'Vẹm xanh' }).click();
  await expect(page).toHaveURL(/#profile\/green-mussel$/);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Vẹm xanh.', exact: true })).toBeVisible();
});

test('seafood identity survives image blocking; AI stays outside identification', async ({
  page,
}) => {
  await page.route('**/*', (r) =>
    r.request().resourceType() === 'image' ? r.abort() : r.continue(),
  );
  await page.goto('/');
  await expect(page.getByText('Thủy hải sản thương mại', { exact: true })).toBeVisible();
  for (const name of [/Cá thịt trắng \/ đỏ/, /Mực & bạch tuộc/, /Nghêu & vẹm/])
    await expect(page.getByRole('link', { name })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'HS theo dạng hàng', exact: true })).toBeVisible();
  await expect(page.locator('.trade-intro-art img')).toHaveAttribute('alt', '');
  await expect(page.locator('.trade-intro-art figcaption')).toHaveCount(0);
  expect(await page.locator('body').innerText()).not.toMatch(/tôm|shrimp/iu);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
});
