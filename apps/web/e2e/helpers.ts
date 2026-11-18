import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { customerPack } from '../../../test-fixtures/legacy-web/data/customer';
import { primaryName } from '../src/domain/content';
export const pack = customerPack;
export const names: Record<string, string> = Object.fromEntries(
  pack.species.map((s) => [s.id, primaryName(pack, s.id, 'vi')!.label]),
);
export const saved = (p: Page) =>
  p.evaluate(() => JSON.parse(localStorage.getItem('seafood-deck:state:v1')!));
export const escaped = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export async function openSpecies(page: Page, id = 'atlantic-cod') {
  await page.goto('/#library');
  await page.locator('.library-card').filter({ hasText: names[id] }).click();
}
export async function matchAll(page: Page) {
  const state = await saved(page),
    q = state.session.questions[state.session.cursor];
  for (const pair of q.pairs) {
    const left = page.getByRole('button', { name: new RegExp(escaped(pair.left)) });
    if (await left.isDisabled()) continue;
    await left.click();
    await page.getByRole('button', { name: new RegExp(escaped(pair.right)) }).click();
  }
  await expect(page.getByText('Tuyệt, bạn đã kết nối đủ 3 cặp!')).toBeVisible();
}
