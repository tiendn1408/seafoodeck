// Shared pieces of the two-origin e2e suite (phase 2.5e): the learner app on PLAYWRIGHT_BASE_URL
// and the Studio app on PLAYWRIGHT_STUDIO_URL, both served by the local Docker pilot stack.
import {
  expect,
  type APIRequestContext,
  type Browser,
  type BrowserContextOptions,
  type Page,
} from '@playwright/test';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { Game } from '../src/pilot/api';

const originOfUrl = (url: string) => new URL(url).origin;
/** Learner app origin (cookies ignore ports, so the two origins must differ by host). */
export const LEARNER = originOfUrl(process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:18089');
/** Studio app origin. */
export const STUDIO = originOfUrl(process.env.PLAYWRIGHT_STUDIO_URL ?? 'http://localhost:18090');

export const secrets = Object.fromEntries(
  readFileSync(new URL('../../../.local/pilot.env', import.meta.url), 'utf8')
    .trim()
    .split('\n')
    .filter((l) => l.includes('='))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i), l.slice(i + 1)];
    }),
);
export const pack = JSON.parse(
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

export type QaUser = { username: string; password: string; id?: string };
export const secret = () => randomBytes(18).toString('base64url');
export const isDesktop = (info: { project: { name: string } }) =>
  info.project.name.endsWith('desktop');

/** Admin-created users only ever go to a loopback stack (same guard as scripts/local-origin.mjs). */
export function localOnly(origin: string) {
  const host = new URL(origin).hostname.toLowerCase();
  if (!['127.0.0.1', 'localhost', '::1', '[::1]'].includes(host))
    throw new Error(`E2E tạo người dùng QA; từ chối chạy trên ${origin} (chỉ máy local).`);
}

type Playwrightish = { request: { newContext: (o: object) => Promise<APIRequestContext> } };
export type Api = Awaited<ReturnType<typeof apiSession>>;
/**
 * A cookie session against the API of one origin (optionally signed in), with the CSRF token kept
 * current. `script: true` sends no Origin header at all, like a server-side script (the documented
 * way to sign in to either host without a browser).
 */
export async function apiSession(
  playwright: Playwrightish,
  origin: string,
  credential?: { username?: string; credential: string },
  { script = false } = {},
) {
  localOnly(origin);
  const request = await playwright.request.newContext({
    baseURL: origin,
    extraHTTPHeaders: script ? {} : { Origin: origin },
  });
  let csrf = (await (await request.get('/api/v1/auth/me')).json()).csrf as string;
  if (credential) {
    const signedIn = await request.post('/api/v1/auth/login', {
      headers: { 'X-CSRF-Token': csrf },
      data: credential,
    });
    expect(signedIn.status(), `login ${credential.username ?? 'invite'} on ${origin}`).toBe(201);
    csrf = (await signedIn.json()).csrf;
  }
  const write = (method: 'post' | 'patch' | 'delete') => (path: string, data: object) =>
    request[method]('/api/v1' + path, { headers: { 'X-CSRF-Token': csrf }, data });
  return {
    request,
    get: (path: string) => request.get('/api/v1' + path),
    post: write('post'),
    patch: write('patch'),
    dispose: () => request.dispose(),
  };
}
export const asUser = (u: QaUser) => ({ username: u.username, credential: u.password });
export const asOwner = () => ({
  username: secrets.ADMIN_USERNAME,
  credential: secrets.ADMIN_PASSWORD,
});

/**
 * Creates QA accounts through the admin API on the Studio origin. Passwords are random, kept in
 * memory only and never printed; the accounts stay in the local DB.
 */
export async function createQaUsers<K extends string>(
  playwright: Playwrightish,
  stamp: string,
  accounts: Record<K, { role: string; must?: boolean }>,
): Promise<Record<K, QaUser>> {
  localOnly(LEARNER);
  const admin = await apiSession(playwright, STUDIO, asOwner());
  const users = {} as Record<K, QaUser>;
  try {
    for (const [key, { role, must }] of Object.entries(accounts) as [
      K,
      { role: string; must?: boolean },
    ][]) {
      const user: QaUser = { username: `qa-e2e-${stamp}-${key}`, password: secret() };
      const created = await admin.post('/admin/users', {
        ...user,
        role,
        displayName: 'QA e2e',
        mustChangePassword: !!must,
      });
      expect(created.status(), `create ${user.username}`).toBe(201);
      user.id = (await created.json()).id;
      users[key] = user;
    }
  } finally {
    await admin.dispose();
  }
  return users;
}

/** A second browser context of the same device as the running project, on the given origin. */
export async function newProjectPage(
  browser: Browser,
  info: { project: { use: BrowserContextOptions } },
  baseURL: string,
) {
  const { viewport, userAgent, isMobile, hasTouch, deviceScaleFactor } = info.project
    .use as BrowserContextOptions;
  const context = await browser.newContext({
    viewport,
    userAgent,
    isMobile,
    hasTouch,
    deviceScaleFactor,
    baseURL,
    acceptDownloads: true,
  });
  return { context, page: await context.newPage() };
}

/** Learner sign-in through the learner app's account form (page on the learner origin). */
export async function learnerLogin(page: Page, user: QaUser) {
  await page.goto(LEARNER + '/');
  await page.getByLabel('Tên đăng nhập', { exact: true }).fill(user.username);
  await page.getByLabel('Mật khẩu', { exact: true }).fill(user.password);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Luyện nghiệp vụ' })).toBeVisible();
}
/** Sign in through the learner form when the account must change its password first. */
export async function loginForced(page: Page, username: string, password: string, next: string) {
  await page.goto(LEARNER + '/');
  await page.getByLabel('Tên đăng nhập', { exact: true }).fill(username);
  await page.getByLabel('Mật khẩu', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Đổi mật khẩu' })).toBeVisible();
  await page.getByLabel('Mật khẩu hiện tại', { exact: true }).fill(password);
  await page.getByLabel(/^Mật khẩu mới/).fill(next);
  await page.getByLabel('Nhập lại mật khẩu mới', { exact: true }).fill(next);
  await page.getByRole('button', { name: 'Đổi mật khẩu', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Đổi mật khẩu' })).toHaveCount(0);
  await page.goto(LEARNER + '/#home');
  await expect(page.getByRole('heading', { name: 'Luyện nghiệp vụ' })).toBeVisible();
}
/** Staff sign-in through the Studio form; the shell then opens the kind's home route. */
export async function studioLogin(page: Page, username: string, password: string, home: string) {
  await page.goto(STUDIO + '/');
  await expect(page.getByRole('heading', { level: 1, name: 'Đăng nhập quản trị' })).toBeVisible();
  await page.getByLabel('Tài khoản', { exact: true }).fill(username);
  await page.getByLabel('Mật khẩu', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`#${home}$`));
}

export async function next(page: Page, last = false) {
  await page.getByRole('button', { name: last ? 'Xem tổng kết' : 'Tiếp tục', exact: true }).click();
}
/** Opens a study mode from Home (learner app) and returns the game the API created. */
export async function start(page: Page, name: string) {
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
/** Rates every remaining flashcard "Đã nhớ" and opens the summary. */
export async function rateAll(page: Page) {
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
