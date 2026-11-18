import { test, expect } from '@playwright/test';
import { emptyState, createSession } from '../src/domain/session';
import { demoPack as oldPack } from '../../../test-fixtures/legacy-web/data/demo';
import { scheduleReview } from '../src/domain/review';
import { saved } from './helpers';
test('old shrimp session and reviews remain stored but never appear in the new pack statistics', async ({
  page,
}) => {
  const state = emptyState();
  state.session = createSession(oldPack, 'full');
  const a = {
    id: 'old',
    sessionId: state.session.id,
    questionId: 'flash-en',
    targetId: 'black-tiger',
    skill: 'name:en' as const,
    contentVersion: oldPack.version,
    attemptNumber: 1,
    correct: true,
    selfRated: true,
    isReview: false,
    answer: 'remembered',
    at: '2026-11-01T00:00:00.000Z',
  };
  state.attempts.push(a);
  const r = scheduleReview(undefined, a);
  state.reviews[r.key] = r;
  await page.addInitScript(
    (v) => localStorage.setItem('seafood-deck:state:v1', JSON.stringify(v)),
    state,
  );
  await page.goto('/#profile/black-tiger');
  await expect(page.getByRole('heading', { name: 'Thư viện loài.' })).toBeVisible();
  await expect(page.getByRole('status')).toContainText('không thuộc bộ đang mở');
  await page.goto('/');
  await expect(page.getByText(/Lịch sử bộ cũ được giữ riêng/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Tiếp tục phiên học' })).toHaveCount(0);
  await page.getByRole('link', { name: 'Tiến độ', exact: true }).click();
  await expect(page.getByText('0 / 6', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Ôn tập', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Chưa có mục ôn tập' })).toBeVisible();
  expect((await saved(page)).attempts).toHaveLength(1);
  await page.goto('/#study');
  await expect(page.getByRole('heading', { name: 'Nội dung đã được cập nhật' })).toBeVisible();
  await page.getByRole('link', { name: 'Học', exact: true }).click();
  await page.getByRole('button', { name: /Flashcard tên loài/ }).click();
  const s = await saved(page);
  expect(s.session.contentVersion).not.toBe(oldPack.version);
  expect(s.attempts).toHaveLength(1);
  expect(s.session.questions[0].speciesId).not.toBe('black-tiger');
});
