// Studio app on the Studio origin (projects `studio-desktop` and `studio-mobile`): content admin,
// users admin, bulk CSV, manager table/detail/CSV, account screens, lock/unlock, forced password.
// Learners in these flows (An, the duplicate-name student) use the learner origin, as in real use;
// staff never study in the Studio app. Also the two-host boundary: realm-checked logins and the
// learner host's 404 for staff API paths.
import { test, expect, type APIResponse, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  LEARNER,
  STUDIO,
  apiSession,
  asOwner,
  asUser,
  createQaUsers,
  isDesktop,
  learnerLogin,
  loginForced,
  newProjectPage,
  rateAll,
  secret,
  secrets,
  start,
  studioLogin,
  type Api,
  type QaUser,
} from './support';

const QA_ACCOUNTS = {
  student: { role: 'student' },
  manager: { role: 'manager' },
  managerMust: { role: 'manager', must: true },
  // Own account: the account test changes its name and password, so no other test uses it.
  managerAccount: { role: 'manager' },
  editor: { role: 'editor' },
};
let users: Record<keyof typeof QA_ACCOUNTS, QaUser>;
/** Per-project stamp shared by every QA name of this run (`qa-…-<stamp>`). */
let stamp = '';
test.beforeAll(async ({ playwright }, info) => {
  stamp = Date.now().toString(36) + 's' + info.project.name.slice(7, 8);
  users = await createQaUsers(playwright, stamp, QA_ACCOUNTS);
});
const adminLogin = (page: Page) =>
  studioLogin(page, secrets.ADMIN_USERNAME, secrets.ADMIN_PASSWORD, 'admin');
const managerLogin = (page: Page, user: QaUser) =>
  studioLogin(page, user.username, user.password, 'manager');

test('admin can preview CSV errors and publish/rollback a QA draft through the browser', async ({
  page,
}) => {
  await adminLogin(page);
  await expect(page.getByRole('heading', { name: 'Biên tập và xuất bản' })).toBeVisible();
  const current = await (await page.request.get('/api/v1/catalog/items?limit=1')).json();
  const auth = await (await page.request.get('/api/v1/auth/me')).json();
  page.on('dialog', (d) => d.accept());
  try {
    await page.getByRole('link', { name: 'Thư viện', exact: true }).click();
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

/** The admin's Users screen filtered to one username (the local DB holds hundreds of QA users). */
async function findUser(page: Page, username: string) {
  if (!/#admin\/users$/.test(page.url())) await page.goto('/#admin/users');
  await expect(page.getByRole('heading', { level: 1, name: 'Người dùng' })).toBeVisible();
  await page.getByLabel('Tìm theo tên đăng nhập hoặc tên hiển thị').fill(username);
  const row = page.locator('.users-table tbody tr').filter({ hasText: username });
  await expect(page.locator('.users-table tbody tr')).toHaveCount(1);
  await expect(row).toHaveCount(1);
  return row;
}
/** Reads a one-time password panel and closes it. */
async function takeSecret(page: Page, username: string) {
  const panel = page.locator('.users-reveal');
  await expect(
    panel.getByRole('heading', { name: `Mật khẩu tạm cho ${username}`, exact: true }),
  ).toBeVisible();
  const value = (await panel.locator('.users-secret').innerText()).trim();
  expect(value).toMatch(/^[A-Za-z0-9]{12}$/);
  await panel.getByRole('button', { name: 'Đóng', exact: true }).click();
  await expect(panel).toHaveCount(0);
  return value;
}

test('admin creates An in the UI; manager follows An; lock, unlock and password reset', async ({
  page,
  browser,
}, info) => {
  test.setTimeout(240_000);
  const desktop = isDesktop(info);
  // "An" keeps its capitals on purpose: logins below use other casings of the same name.
  const an = { username: `qa-An-${stamp}`, password: '' };
  await adminLogin(page);
  // An is a learner: the learner origin. The manager works in the Studio.
  const student = await newProjectPage(browser, info, LEARNER);
  const manager = await newProjectPage(browser, info, STUDIO);
  try {
    await test.step('(a) admin creates An with a generated password; An signs in and learns', async () => {
      await page.goto('/#admin/users');
      await page.getByRole('button', { name: 'Tạo người dùng', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: 'Tạo người dùng' });
      await expect(dialog.getByLabel('Vai trò')).toHaveValue('student');
      await dialog.getByLabel('Tên đăng nhập').fill(an.username);
      await dialog.getByLabel('Tên hiển thị (không bắt buộc)').fill('An');
      await dialog.getByRole('button', { name: 'Tạo tự động', exact: true }).click();
      await dialog.getByRole('button', { name: 'Tạo tài khoản', exact: true }).click();
      await expect(dialog).toHaveCount(0);
      const temporary = await takeSecret(page, an.username);
      // The one-time password is gone from the page once the panel is closed.
      await expect(page.getByText(temporary)).toHaveCount(0);
      an.password = secret();
      await loginForced(student.page, an.username, temporary, an.password);
      await start(student.page, 'Flashcard tên loài');
      await rateAll(student.page);
    });

    let anId = '';
    await test.step('(b) manager sees An (last study, learning > 0), sorts, opens details, exports CSV', async () => {
      const m = manager.page;
      await managerLogin(m, users.manager);
      await expect(m.getByRole('heading', { level: 1, name: 'Học viên' })).toBeVisible();
      await m.getByLabel('Tìm theo tên đăng nhập hoặc tên hiển thị').fill(an.username);
      await expect(m.getByText('1 học viên', { exact: true })).toBeVisible();
      const entry = m.locator(desktop ? '.manager-table tbody tr' : '.manager-card');
      await expect(entry).toHaveCount(1);
      anId = (await entry.getAttribute('data-learner'))!;
      expect(anId).toBeTruthy();
      await expect(entry.getByRole('link', { name: 'An', exact: true })).toBeVisible();
      await expect(entry.getByText('hôm nay', { exact: true })).toBeVisible();
      const learning = desktop
        ? entry.locator('td').first()
        : entry.locator('dl div').filter({ hasText: 'Đang học' }).locator('dd');
      expect(Number(await learning.innerText())).toBeGreaterThan(0);
      // Sort by name: desktop through the column header, phones through the select.
      if (desktop) {
        const header = m.getByRole('columnheader', { name: 'Tên' });
        await header.getByRole('button').click();
        await expect(header).toHaveAttribute('aria-sort', 'ascending');
        await header.getByRole('button').click();
        await expect(header).toHaveAttribute('aria-sort', 'descending');
      } else {
        // Phones fold sort and filters into one disclosure.
        await m.locator('.manager-more > summary').click();
        await m.getByLabel('Sắp xếp theo').selectOption('name');
        await expect(m.getByLabel('Sắp xếp theo')).toHaveValue('name');
      }
      await expect(entry).toHaveCount(1);
      // CSV export: a download, UTF-8 with BOM, An's row, the same filters as the table.
      const download = m.waitForEvent('download');
      await m.getByRole('link', { name: 'Xuất CSV', exact: true }).click();
      const file = await download;
      expect(file.suggestedFilename()).toBe('hoc-vien.csv');
      const bytes = readFileSync((await file.path())!);
      expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
      const csv = bytes.toString('utf8');
      expect(csv).toContain('Tên đăng nhập');
      expect(csv).toContain(an.username);
      expect(csv.trim().split(/\r?\n/)).toHaveLength(2);
      // Read-only details of An.
      await entry.getByRole('link', { name: 'An', exact: true }).click();
      await expect(m).toHaveURL(new RegExp(`#manager/learner/${anId}$`));
      await expect(m.getByRole('heading', { level: 1, name: 'Học viên: An' })).toBeVisible();
      await expect(m.getByRole('heading', { name: 'Tiến độ học' })).toBeVisible();
      await expect(m.getByRole('heading', { name: 'Lịch ôn tập' })).toBeVisible();
      const detail = m.locator('.manager-detail');
      await expect(
        detail
          .locator('.progress-figures div')
          .filter({ has: m.getByText('Thẻ tự đánh giá', { exact: true }) })
          .locator('dd'),
      ).not.toHaveText('0');
      await expect(detail.getByRole('button')).toHaveCount(0);
      await expect(m.getByRole('heading', { name: 'Tiến độ học của bạn' })).toHaveCount(0);
    });

    await test.step('(e) the learner app has no #manager or #admin/users; managers never reach #admin/users', async () => {
      for (const route of ['#manager', '#admin/users', `#manager/learner/${anId}`]) {
        await student.page.goto(LEARNER + '/' + route);
        await expect(student.page).toHaveURL(/#home$/);
        await expect(student.page.getByRole('heading', { name: 'Luyện nghiệp vụ' })).toBeVisible();
      }
      await manager.page.goto('/#admin/users');
      await expect(manager.page).toHaveURL(/#manager$/);
      await expect(manager.page.getByRole('heading', { level: 1, name: 'Người dùng' })).toHaveCount(
        0,
      );
      // A species profile in the Studio shows no study actions.
      await manager.page.goto('/#profile/atlantic-cod');
      await expect(manager.page.getByRole('heading', { level: 1 })).toBeVisible();
      await expect(manager.page.getByRole('button', { name: /Chỉ học flashcard/ })).toHaveCount(0);
    });

    await test.step('(c) locking An ends the open tab at its next request; unlock keeps progress', async () => {
      const s = student.page;
      await s.goto(LEARNER + '/#home');
      await expect(s.getByRole('heading', { name: 'Luyện nghiệp vụ' })).toBeVisible();
      const row = await findUser(page, an.username);
      await row.getByRole('button', { name: `Khóa ${an.username}` }).click();
      await page.getByRole('dialog').getByRole('button', { name: 'Khóa tài khoản' }).click();
      await expect(row.getByText('Đã khóa', { exact: true })).toBeVisible();
      // An's next request (opening Tiến độ) is refused: back to the sign-in form.
      await s.getByRole('link', { name: 'Tiến độ', exact: true }).click();
      await expect(s.getByLabel('Tên đăng nhập', { exact: true })).toBeVisible();
      await expect(s.getByRole('heading', { name: 'Tiến độ học của bạn' })).toHaveCount(0);
      await s.getByLabel('Tên đăng nhập', { exact: true }).fill(an.username);
      await s.getByLabel('Mật khẩu', { exact: true }).fill(an.password);
      await s.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
      await expect(s.getByRole('alert')).toHaveText(
        'Tên đăng nhập hoặc mật khẩu chưa đúng. Hãy thử lại.',
      );
      // The manager still sees An, flagged as locked, once locked learners are shown.
      await manager.page.goto('/#manager');
      if (!desktop) await manager.page.locator('.manager-more > summary').click();
      await manager.page.getByLabel('Hiện người đã khóa').check();
      await manager.page.getByLabel('Tìm theo tên đăng nhập hoặc tên hiển thị').fill(an.username);
      await expect(
        manager.page
          .locator(desktop ? '.manager-table tbody tr' : '.manager-card')
          .filter({ hasText: an.username })
          .getByText('Đã khóa', { exact: true }),
      ).toBeVisible();
      await row.getByRole('button', { name: `Mở khóa ${an.username}` }).click();
      await expect(row.getByText('Hoạt động', { exact: true })).toBeVisible();
      await learnerLogin(s, an);
      await s.getByRole('link', { name: 'Tiến độ', exact: true }).click();
      await expect(s.getByRole('heading', { name: 'Tiến độ học của bạn' })).toBeVisible();
      await expect(s.locator('.progress-sessions-list li')).toHaveCount(1);
    });

    await test.step('(d) password reset: temporary password, forced change, then normal use', async () => {
      const row = await findUser(page, an.username);
      await row.getByRole('button', { name: `Đặt lại mật khẩu ${an.username}` }).click();
      await page.getByRole('dialog').getByRole('button', { name: 'Đặt lại mật khẩu' }).click();
      const temporary = await takeSecret(page, an.username);
      await expect(row.getByText('Phải đổi mật khẩu', { exact: true })).toBeVisible();
      // The reset ended An's open session too.
      await student.page.goto(LEARNER + '/#review');
      await expect(student.page.getByLabel('Tên đăng nhập', { exact: true })).toBeVisible();
      an.password = secret();
      await loginForced(student.page, an.username, temporary, an.password);
      await student.page.getByRole('link', { name: 'Tiến độ', exact: true }).click();
      await expect(student.page.locator('.progress-sessions-list li')).toHaveCount(1);
    });
  } finally {
    await student.context.close();
    await manager.context.close();
  }
});

test('case-insensitive duplicates and login; bulk create with a duplicate row', async ({
  page,
  browser,
}, info) => {
  test.setTimeout(180_000);
  const name = `qa-Dup-${stamp}`;
  await adminLogin(page);
  await test.step('(f) creating "dup" when "Dup" exists is refused; "dUP" signs in to Dup', async () => {
    const password = secret();
    await page.goto('/#admin/users');
    for (const [username, ok] of [
      [name, true],
      [name.toLowerCase(), false],
    ] as const) {
      await page.getByRole('button', { name: 'Tạo người dùng', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: 'Tạo người dùng' });
      await dialog.getByLabel('Tên đăng nhập').fill(username);
      await dialog.getByLabel('Tên hiển thị (không bắt buộc)').fill('QA trùng');
      await dialog.getByLabel('Mật khẩu', { exact: true }).fill(password);
      await dialog.getByLabel('Yêu cầu đổi mật khẩu ở lần đăng nhập đầu').uncheck();
      await dialog.getByRole('button', { name: 'Tạo tài khoản', exact: true }).click();
      if (ok) await expect(dialog).toHaveCount(0);
      else {
        await expect(dialog.getByText('Tên đăng nhập đã tồn tại.')).toBeVisible();
        await dialog.getByRole('button', { name: 'Hủy', exact: true }).click();
      }
    }
    // The student signs in on the learner origin.
    const other = await newProjectPage(browser, info, LEARNER);
    try {
      const mixed = name.replace('Dup', 'dUP');
      await learnerLogin(other.page, { username: mixed, password });
      const me = await (await other.page.request.get('/api/v1/auth/me')).json();
      const listed = await (
        await page.request.get(`/api/v1/admin/users?q=${encodeURIComponent(name)}`)
      ).json();
      expect(listed.items).toHaveLength(1);
      expect(listed.items[0].username).toBe(name);
      expect(me.userId).toBe(listed.items[0].id);
    } finally {
      await other.context.close();
    }
  });

  await test.step('(g) bulk create: preview, three rows (one duplicate), password CSV', async () => {
    const fresh = [`qa-bulk1-${stamp}`, `qa-bulk2-${stamp}`];
    page.on('dialog', (d) => d.accept());
    await page.goto('/#admin/users');
    await page.getByRole('button', { name: 'Tạo hàng loạt', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Tạo hàng loạt' });
    await dialog
      .getByLabel('Nội dung CSV')
      .fill(
        `username,displayName,password\n${fresh[0]},Bulk một,\n${fresh[1]},Bulk hai,\n${name.toUpperCase()},Trùng,\n`,
      );
    await dialog.getByRole('button', { name: 'Xem trước', exact: true }).click();
    await expect(dialog.getByText(/Xem trước: 2 tạo được · 1 bỏ qua/)).toBeVisible();
    await dialog.getByRole('button', { name: 'Tạo hàng loạt', exact: true }).click();
    await expect(dialog.getByText(/Đã tạo 2 tạo được · 1 bỏ qua/)).toBeVisible();
    const rows = dialog.locator('.users-table tbody tr');
    await expect(rows).toHaveCount(3);
    await expect(rows.nth(0)).toContainText('Tạo được');
    await expect(rows.nth(1)).toContainText('Tạo được');
    await expect(rows.nth(2)).toContainText('Bỏ qua (đã tồn tại)');
    const download = page.waitForEvent('download');
    await dialog.getByRole('button', { name: 'Tải CSV mật khẩu', exact: true }).click();
    const file = await download;
    const csv = readFileSync((await file.path())!, 'utf8');
    expect(csv).toContain(fresh[0]);
    expect(csv).toContain(fresh[1]);
    expect(csv.toLowerCase()).not.toContain(name.toLowerCase());
    await dialog.getByRole('button', { name: 'Đóng', exact: true }).click();
    await expect(dialog).toHaveCount(0);
  });
});

test('manager and admin API over HTTP: roles, 404s, CSV headers, validation, forced change', async ({
  playwright,
}) => {
  const sessions: Api[] = [];
  const open = async (
    origin: string,
    credential?: { username?: string; credential: string },
    script = false,
  ) => {
    const s = await apiSession(playwright, origin, credential, { script });
    sessions.push(s);
    return s;
  };
  try {
    const admin = await open(STUDIO, asOwner());
    const manager = await open(STUDIO, asUser(users.manager));
    const editor = await open(STUDIO, asUser(users.editor));
    const forced = await open(STUDIO, asUser(users.managerMust));
    const guest = await open(STUDIO);
    // A browser never gets a learner session on the Studio host (realm-checked login). These two
    // sign in like a script (no Origin header) so the role matrix is still checked on this host.
    const student = await open(STUDIO, asUser(users.student), true);
    const trial = await open(STUDIO, { credential: secrets.LEARNER_INVITE_CODE }, true);
    const id = users.student.id!;
    const paths = [
      '/manager/learners',
      '/manager/learners.csv',
      `/manager/learners/${id}`,
      `/manager/learners/${id}/progress`,
      `/manager/learners/${id}/review`,
      `/manager/learners/${id}/mastery`,
    ];
    for (const path of paths) {
      for (const [who, s] of [
        ['admin', admin],
        ['manager', manager],
      ] as const)
        expect((await s.get(path)).status(), `${who} ${path}`).toBe(200);
      for (const [who, s] of [
        ['student', student],
        ['editor', editor],
        ['trial', trial],
      ] as const)
        expect((await s.get(path)).status(), `${who} ${path}`).toBe(403);
      expect((await guest.get(path)).status(), `guest ${path}`).toBe(401);
      const blocked = await forced.get(path);
      expect(blocked.status(), `must-change manager ${path}`).toBe(403);
      expect((await blocked.json()).code).toBe('MUST_CHANGE_PASSWORD');
    }
    // The manager's view of a learner is that learner's own /me/progress.
    expect(await (await manager.get(`/manager/learners/${id}/progress`)).json()).toEqual(
      await (await student.get('/me/progress')).json(),
    );
    // CSV: UTF-8 with BOM, attachment, Vietnamese header row.
    const csv = await manager.get('/manager/learners.csv?sort=name&dir=asc');
    expect(csv.headers()['content-type']).toBe('text/csv; charset=utf-8');
    expect(csv.headers()['content-disposition']).toBe('attachment; filename="hoc-vien.csv"');
    const body = await csv.body();
    expect([...body.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(body.toString('utf8').slice(1).split(/\r?\n/)[0]).toMatch(
      /^Tên đăng nhập,Tên hiển thị,/,
    );
    // Only students are addressable: staff accounts and unknown ids are 404.
    const ownerId = (await (await admin.get('/auth/me')).json()).userId as string;
    for (const other of [users.manager.id!, users.editor.id!, ownerId, randomUUID(), 'x'])
      for (const suffix of ['', '/progress', '/review', '/mastery'])
        expect(
          (await manager.get(`/manager/learners/${other}${suffix}`)).status(),
          `404 ${suffix}`,
        ).toBe(404);
    // The real ValidationPipe on the query.
    for (const bad of ['sort=bogus', 'dir=up', 'filter=x', 'limit=201', 'page=0', 'limit=abc'])
      expect((await manager.get(`/manager/learners?${bad}`)).status(), bad).toBe(400);
    const page = await (
      await manager.get(`/manager/learners?limit=1&page=1&sort=name&includeDisabled=true`)
    ).json();
    expect(page).toMatchObject({ page: 1, limit: 1 });
    expect(page.items).toHaveLength(1);
    // Managers never reach the account admin API.
    expect((await manager.get('/admin/users')).status()).toBe(403);
    expect((await manager.patch(`/admin/users/${id}`, { disabled: true })).status()).toBe(403);
  } finally {
    for (const s of sessions) await s.dispose();
  }
});

// Two admins locking each other at once needs two admin accounts, which the admin API cannot create
// (admins come from bootstrap only): see scripts/admin-lock-race-check.mjs (local stack only).
test('admin user search treats _ and % literally on real Postgres', async ({ playwright }) => {
  const owner = await apiSession(playwright, STUDIO, asOwner());
  try {
    const underscore = `qa_us_${stamp}`;
    expect(
      (
        await owner.post('/admin/users', {
          username: underscore,
          password: secret(),
          role: 'student',
        })
      ).status(),
    ).toBe(201);
    const all = (await (await owner.get('/admin/users?limit=1')).json()).total as number;
    type Row = { username: string; displayName: string | null };
    const literal = await (await owner.get('/admin/users?q=_&limit=200')).json();
    expect(literal.total).toBeGreaterThan(0);
    expect(literal.total).toBeLessThan(all);
    for (const u of literal.items as Row[])
      expect(`${u.username} ${u.displayName ?? ''}`).toContain('_');
    expect((literal.items as Row[]).map((u) => u.username)).toContain(underscore);
    const percent = await (await owner.get('/admin/users?q=%25&limit=200')).json();
    for (const u of percent.items as Row[])
      expect(`${u.username} ${u.displayName ?? ''}`).toContain('%');
    // The manager table filters in memory: '_' is literal there too.
    const learners = await (await owner.get('/manager/learners?q=_&limit=200')).json();
    for (const u of learners.items as Row[])
      expect(`${u.username} ${u.displayName ?? ''}`).toContain('_');
    expect((learners.items as Row[]).map((u) => u.username)).toContain(underscore);
  } finally {
    await owner.dispose();
  }
});

/** Interactive controls smaller than 44×44 px (inline text links in tables and cards excluded). */
async function smallTargets(page: Page) {
  return page.evaluate(() =>
    [
      ...document.querySelectorAll<HTMLElement>(
        'button, select, textarea, input:not([type=checkbox]):not([type=radio]):not([type=file]):not([type=hidden]), label:has(> input[type=checkbox]), a.users-secondary, a.manager-csv, .manager-more > summary',
      ),
    ]
      .filter((el) => el.getClientRects().length > 0 && !el.closest('.users-sr'))
      .map((el) => {
        const r = el.getBoundingClientRect();
        return { what: `${el.className}:${el.innerText.trim()}`, w: r.width, h: r.height };
      })
      .filter((t) => t.w < 44 || t.h < 44)
      .map((t) => `${t.what} ${Math.round(t.w)}×${Math.round(t.h)}`),
  );
}
/** Wider than the device: on phones the layout viewport grows with the page, so compare with the
 * configured viewport width rather than innerWidth. */
const scrollsSideways = async (page: Page) => {
  const width = page.viewportSize()!.width;
  return page.evaluate(
    (w) => Math.max(document.documentElement.scrollWidth, window.innerWidth) > w,
    width,
  );
};

test('manager and admin screens: no sideways scroll, touch targets of at least 44 px', async ({
  page,
}, info) => {
  await adminLogin(page);
  const screens: [string, () => Promise<void>][] = [
    [
      '#admin/users',
      async () => {
        await page.goto('/#admin/users');
        await expect(page.locator('.users-table tbody tr').first()).toBeVisible();
      },
    ],
    [
      'create dialog',
      async () => {
        await page.getByRole('button', { name: 'Tạo người dùng', exact: true }).click();
        await expect(page.getByRole('dialog')).toBeVisible();
      },
    ],
    [
      'bulk dialog',
      async () => {
        await page.keyboard.press('Escape');
        await page.getByRole('button', { name: 'Tạo hàng loạt', exact: true }).click();
        await expect(page.getByRole('dialog')).toBeVisible();
      },
    ],
    [
      '#manager',
      async () => {
        await page.goto('/#manager');
        await expect(page.locator('.users-count')).toBeVisible();
        await expect(page.locator('[data-learner]').first()).toBeVisible();
      },
    ],
  ];
  for (const [name, open] of screens)
    await test.step(`${name} (${info.project.name})`, async () => {
      await open();
      expect(await scrollsSideways(page), `${name} scrolls sideways`).toBe(false);
      expect(await smallTargets(page), `${name} small targets`).toEqual([]);
    });
});

test('manager learner detail never scrolls sideways', async ({ page }) => {
  // The full-bleed `.ice-hero` bands of Tiến độ / Lịch ôn tập (`::after` inset -100vmax) must be
  // clipped by the ice stage here too.
  await managerLogin(page, users.manager);
  await page.goto(`/#manager/learner/${users.student.id!}`);
  await expect(page.locator('.manager-detail h1')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Lịch ôn tập' })).toBeVisible();
  expect(await scrollsSideways(page)).toBe(false);
});

test('manager opens their account, renames, changes password and keeps working', async ({
  page,
}) => {
  const user = users.managerAccount;
  await managerLogin(page, user);
  await page.getByRole('link', { name: /^Tài khoản/ }).click();
  await expect(page).toHaveURL(/#account$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Tài khoản' })).toBeVisible();
  // Nothing learner-specific on a manager's account.
  await expect(page.getByText(/tiến độ/i)).toHaveCount(0);
  await test.step('display name', async () => {
    await page.getByLabel('Tên hiển thị').fill('Quản lý QA');
    await page.getByRole('button', { name: 'Lưu tên', exact: true }).click();
    await expect(page.getByText('Đã lưu tên hiển thị.')).toBeVisible();
  });
  await test.step('password change, then the next request works with the new session', async () => {
    const next = secret();
    await page.getByRole('button', { name: 'Đổi mật khẩu', exact: true }).click();
    await page.getByLabel('Mật khẩu hiện tại', { exact: true }).fill(user.password);
    await page.getByLabel(/^Mật khẩu mới/).fill(next);
    await page.getByLabel('Nhập lại mật khẩu mới', { exact: true }).fill(next);
    await page.getByRole('button', { name: 'Đổi mật khẩu', exact: true }).click();
    user.password = next;
    await expect(page.getByText('Đã đổi mật khẩu.')).toBeVisible();
    // A mutating request after the change still passes CSRF (the shell adopted the new session).
    await page.getByLabel('Tên hiển thị').fill('Quản lý QA 2');
    await page.getByRole('button', { name: 'Lưu tên', exact: true }).click();
    await expect(page.getByText('Đã lưu tên hiển thị.')).toBeVisible();
    const me = await (await page.request.get('/api/v1/me')).json();
    expect(me.displayName).toBe('Quản lý QA 2');
    await page.goto('/#manager');
    await expect(page).toHaveURL(/#manager$/);
  });
});

test('a must-change manager only reaches the password screen in the Studio until it changes', async ({
  page,
}) => {
  const user = users.managerMust;
  await page.goto('/');
  await page.getByLabel('Tài khoản', { exact: true }).fill(user.username);
  await page.getByLabel('Mật khẩu', { exact: true }).fill(user.password);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  const heading = page.getByRole('heading', { level: 1, name: 'Đổi mật khẩu' });
  await expect(heading).toBeVisible();
  for (const route of ['#manager', '#library', '#account', '#admin/users']) {
    await page.goto('/' + route);
    await expect(heading).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Điều hướng chính' })).toHaveCount(0);
  }
  const next = secret();
  await page.getByLabel('Mật khẩu hiện tại', { exact: true }).fill(user.password);
  await page.getByLabel(/^Mật khẩu mới/).fill(next);
  await page.getByLabel('Nhập lại mật khẩu mới', { exact: true }).fill(next);
  await page.getByRole('button', { name: 'Đổi mật khẩu', exact: true }).click();
  user.password = next;
  await expect(heading).toHaveCount(0);
  await page.goto('/#manager');
  await expect(page.getByRole('heading', { level: 1, name: 'Học viên' })).toBeVisible();
});

test('the Studio has no Study: no study tab, route or action for any staff kind', async ({
  page,
  browser,
}, info) => {
  await adminLogin(page);
  const nav = page.getByRole('navigation', { name: 'Điều hướng chính' });
  await expect(nav.getByRole('link')).toHaveText([
    'Quản trị',
    'Người dùng',
    'Học viên',
    'Thư viện',
  ]);
  // One navigation bar: admins switch screens with these tabs only (no second in-page tab strip).
  await expect(page.getByRole('navigation', { name: 'Khu quản trị' })).toHaveCount(0);
  await nav.getByRole('link', { name: 'Người dùng' }).click();
  await expect(page).toHaveURL(/#admin\/users$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Người dùng' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Khu quản trị' })).toHaveCount(0);
  for (const route of ['#study', '#home', '#review', '#progress']) {
    await page.goto('/' + route);
    await expect(page).toHaveURL(/#admin$/);
    await expect(page.locator('.pilot-question')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Luyện nghiệp vụ' })).toHaveCount(0);
  }
  await page.goto('/#profile/atlantic-cod');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByRole('button', { name: /Chỉ học/ })).toHaveCount(0);
  const editor = await newProjectPage(browser, info, STUDIO);
  try {
    await studioLogin(editor.page, users.editor.username, users.editor.password, 'admin');
    await expect(
      editor.page.getByRole('navigation', { name: 'Điều hướng chính' }).getByRole('link'),
    ).toHaveText(['Quản trị', 'Thư viện']);
    await editor.page.goto('/#study');
    await expect(editor.page).toHaveURL(/#admin$/);
  } finally {
    await editor.context.close();
  }
});

test('Studio library shows signed media previews from the Studio origin', async ({ page }) => {
  await adminLogin(page);
  await page.goto('/#profile/atlantic-cod');
  const image = page.locator('.cover-photo img');
  await expect(image).toBeVisible();
  await expect
    .poll(() => image.evaluate((i) => (i as HTMLImageElement).naturalWidth))
    .toBeGreaterThan(0);
});

// ---------------------------------------------------------------------------------------------
// Phase 2.5e: two hosts. These are API-level and identical on every device, so they run once
// (desktop project): each refused login costs one slot of the per-IP login limiter.
// ---------------------------------------------------------------------------------------------

/** Status and body of a response, without the per-request id. */
async function shape(r: APIResponse) {
  const body = await r.json();
  delete body.requestId;
  return { status: r.status(), body };
}
async function tryLogin(
  playwright: Parameters<typeof apiSession>[0],
  origin: string,
  data: object,
) {
  const s = await apiSession(playwright, origin);
  try {
    const csrf = (await (await s.get('/auth/me')).json()).csrf as string;
    return await shape(
      await s.request.post('/api/v1/auth/login', { headers: { 'X-CSRF-Token': csrf }, data }),
    );
  } finally {
    await s.dispose();
  }
}

test('wrong-realm logins fail exactly like a wrong password on both hosts', async ({
  playwright,
}, info) => {
  test.skip(!isDesktop(info), 'API-level, once per run (login limiter)');
  // Learner host: staff, manager and admin are refused like a wrong password.
  const wrongOnLearner = await tryLogin(playwright, LEARNER, {
    username: users.student.username,
    credential: secret(),
  });
  expect(wrongOnLearner.status).toBe(401);
  for (const [who, data] of [
    ['admin', asOwner()],
    ['manager', asUser(users.manager)],
    ['editor', asUser(users.editor)],
  ] as const)
    expect(await tryLogin(playwright, LEARNER, data), `${who} on learner host`).toEqual(
      wrongOnLearner,
    );
  // Studio host: a student is refused like a wrong password; an invite code like a wrong code.
  // (One API answers both hosts and the wrong-password body does not depend on the host; a second
  // wrong-password baseline would only spend another limiter slot: each run uses 6 here + 2 in the
  // lock step of the 20 per IP per 10 minutes, so two back-to-back runs fit, a third does not.)
  expect(await tryLogin(playwright, STUDIO, asUser(users.student)), 'student on studio').toEqual(
    wrongOnLearner,
  );
  const wrongCode = await tryLogin(playwright, LEARNER, { credential: secret() });
  expect(wrongCode.status).toBe(401);
  expect(
    await tryLogin(playwright, STUDIO, { credential: secrets.LEARNER_INVITE_CODE }),
    'invite code on studio',
  ).toEqual(wrongCode);
});

test('documented script login (no Origin header) still works on both hosts', async ({
  playwright,
}, info) => {
  test.skip(!isDesktop(info), 'API-level, once per run');
  const owner = await apiSession(playwright, STUDIO, asOwner(), { script: true });
  const student = await apiSession(playwright, LEARNER, asUser(users.student), { script: true });
  try {
    expect((await owner.get('/admin/users?limit=1')).status()).toBe(200);
    // Writes without an Origin header still need the CSRF token, and pass with it.
    expect(
      (await owner.patch(`/admin/users/${users.editor.id}`, { displayName: 'QA e2e' })).status(),
    ).toBe(200);
    expect((await student.get('/me/progress')).status()).toBe(200);
  } finally {
    await owner.dispose();
    await student.dispose();
  }
});

test('staff API paths on the learner host answer exactly like an unknown path', async ({
  request,
  playwright,
}, info) => {
  test.skip(!isDesktop(info), 'API-level, once per run');
  /** Same status, same header names, same body keys, message naming the requested path. */
  async function like404(path: string, method: 'get' | 'post' | 'patch' | 'delete' = 'get') {
    const unknown = path.replace(/\/(admin|manager|docs|openapi)/, '/zzunknown');
    const [a, b] = await Promise.all(
      [path, unknown].map((p) => request[method](LEARNER + p, { maxRedirects: 0 })),
    );
    expect(a.status(), path).toBe(404);
    expect(b.status(), unknown).toBe(404);
    const names = (r: APIResponse) =>
      Object.keys(r.headers())
        .filter((h) => h !== 'date')
        .sort();
    expect(names(a), path).toEqual(names(b));
    const [ja, jb] = [await a.json(), await b.json()];
    expect(Object.keys(ja).sort()).toEqual(Object.keys(jb).sort());
    expect({ ...ja, message: '', requestId: '' }).toEqual({ ...jb, message: '', requestId: '' });
    expect(ja.message).toBe(`Cannot ${method.toUpperCase()} ${path}`);
    expect(ja.requestId).toBe(a.headers()['x-request-id']);
  }
  await like404('/api/v1/admin/users');
  await like404('/api/v1/manager/learners');
  await like404('/api/v1/admin/users/..%2F..%2Fx');
  await like404('/api/v1/admin/users/..%2F..%2Fx', 'patch');
  await like404('/api/v1/manager/learners/..%2F..%2Fx/progress');
  await like404('/api/v1/docs');
  // Even a signed-in student gets the same 404 (not a 403 that would reveal the route).
  const student = await apiSession(playwright, LEARNER, asUser(users.student));
  try {
    const r = await student.get('/manager/learners');
    expect(r.status()).toBe(404);
    expect((await r.json()).message).toBe('Cannot GET /api/v1/manager/learners');
  } finally {
    await student.dispose();
  }
  // The same paths exist on the Studio host (401 signed out).
  expect((await request.get(STUDIO + '/api/v1/admin/users')).status()).toBe(401);
  expect((await request.get(STUDIO + '/api/v1/manager/learners')).status()).toBe(401);
});
