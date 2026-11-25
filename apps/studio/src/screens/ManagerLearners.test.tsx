import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { ManagerLearners } from './ManagerLearners';
import { button, click, mount, setValue, unmountAll } from '@web/learner/testDom';

const json = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));
const DAY = 86_400_000;
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();
const learner = (id: string, extra: object = {}) => ({
  id,
  username: id,
  displayName: null,
  disabled: false,
  learning: 4,
  solid: 2,
  avgLevel: 2.5,
  lastStudyAt: ago(3 * DAY),
  overdue: 0,
  sessions7d: 1,
  ...extra,
});
const items = [
  learner('lan', { displayName: 'Lan Nguyễn', lastStudyAt: ago(DAY), overdue: 3, sessions7d: 5 }),
  learner('binh', { lastStudyAt: null, avgLevel: null, learning: 0, solid: 0, sessions7d: 0 }),
  learner('cuc', { disabled: true }),
];
const page = (list = items, total = list.length, p = 1) =>
  json({ items: list, total, page: p, limit: 20 });

let calls: string[];
let list: (url: string) => Promise<Response>;
function media(narrow: boolean) {
  vi.stubGlobal('matchMedia', (q: string) => ({
    matches: narrow && q.includes('max-width'),
    media: q,
    addEventListener() {},
    removeEventListener() {},
  }));
}
beforeEach(() => {
  calls = [];
  list = () => page();
  media(false);
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      const key = `${init?.method ?? 'GET'} ${String(url).replace('/api/v1', '')}`;
      calls.push(key);
      if (key.startsWith('GET /manager/learners?')) return list(key);
      if (key === 'GET /manager/learners/lan')
        return json({ id: 'lan', username: 'lan', displayName: 'Lan Nguyễn', disabled: false });
      return json({ message: 'unrouted ' + key }, 404);
    }),
  );
});
afterEach(() => {
  unmountAll();
  vi.unstubAllGlobals();
});
const tick = (ms = 10) => act(async () => void (await new Promise((r) => setTimeout(r, ms))));
const lists = () => calls.filter((c) => c.startsWith('GET /manager/learners?'));
const last = () => lists()[lists().length - 1];
const th = (host: HTMLElement, label: string) =>
  [...host.querySelectorAll('th')].find((x) => x.textContent?.includes(label))!;
async function open(admin = false) {
  const host = mount(<ManagerLearners admin={admin} />);
  await tick();
  return host;
}

describe('ManagerLearners table', () => {
  it('loads the default sort (last study, newest first) and shows the columns', async () => {
    const host = await open();
    expect(lists()).toEqual(['GET /manager/learners?sort=lastStudyAt&dir=desc&page=1&limit=20']);
    for (const c of [
      'Tên',
      'Đang học',
      'Đã vững',
      'Mức nhớ TB',
      'Lần học cuối',
      'Quá hạn',
      'Phiên 7 ngày',
    ])
      expect(th(host, c), c).toBeTruthy();
    expect(host.querySelector('h1')?.textContent).toBe('Học viên');
    expect(host.textContent).toContain('3 học viên');
    expect(th(host, 'Lần học cuối').getAttribute('aria-sort')).toBe('descending');
    expect(th(host, 'Tên').getAttribute('aria-sort')).toBe('none');
  });

  it('shows names, relative time with a full title, "Chưa học" and text status labels', async () => {
    const host = await open();
    const lan = host.querySelector<HTMLElement>('[data-learner="lan"]')!;
    expect(lan.textContent).toContain('Lan Nguyễn');
    expect(lan.querySelector('a')?.getAttribute('href')).toBe('#manager/learner/lan');
    expect(lan.textContent).toContain('hôm qua');
    expect(lan.querySelector('time')?.getAttribute('title')).toMatch(/\d/);
    expect(lan.textContent).toContain('3 mục');
    const binh = host.querySelector<HTMLElement>('[data-learner="binh"]')!;
    expect(binh.textContent).toContain('binh');
    expect(binh.textContent).toContain('Chưa học');
    expect(binh.textContent).toContain('Chưa có');
    const cuc = host.querySelector<HTMLElement>('[data-learner="cuc"]')!;
    expect(cuc.textContent).toContain('Đã khóa');
    expect(cuc.textContent).toContain('3 ngày trước');
  });

  it('clicking a column header sorts by it, toggles direction and updates aria-sort', async () => {
    const host = await open();
    await click(th(host, 'Tên').querySelector('button')!);
    expect(last()).toContain('sort=name&dir=asc&page=1');
    expect(th(host, 'Tên').getAttribute('aria-sort')).toBe('ascending');
    expect(th(host, 'Lần học cuối').getAttribute('aria-sort')).toBe('none');
    await click(th(host, 'Tên').querySelector('button')!);
    expect(last()).toContain('sort=name&dir=desc');
    await click(th(host, 'Quá hạn').querySelector('button')!);
    expect(last()).toContain('sort=overdue&dir=desc');
    await click(th(host, 'Phiên 7 ngày').querySelector('button')!);
    expect(last()).toContain('sort=sessions7d&dir=desc');
  });

  it('filters: one at a time, toggled with aria-pressed, back to page 1', async () => {
    const host = await open();
    const idle = button(host, 'Chưa học 7 ngày');
    const over = button(host, 'Có mục quá hạn');
    expect(idle.getAttribute('aria-pressed')).toBe('false');
    await click(idle);
    expect(last()).toContain('filter=idle7d');
    expect(idle.getAttribute('aria-pressed')).toBe('true');
    await click(over);
    expect(last()).toContain('filter=overdue');
    expect(last()).not.toContain('idle7d');
    expect(idle.getAttribute('aria-pressed')).toBe('false');
    await click(over);
    expect(last()).not.toContain('filter=');
  });

  it('says the filters are single-choice and the empty text does not suggest combining', async () => {
    list = () => page([], 0);
    const host = await open();
    const group = host.querySelector('.manager-filters')!;
    const label = group.getAttribute('aria-labelledby')!;
    expect(document.getElementById(label)!.textContent).toBe('Lọc (chọn một)');
    await click(button(host, 'Chưa học 7 ngày'));
    expect(host.querySelector('.users-empty')!.textContent).toBe(
      'Không có học viên nào khớp tìm kiếm hoặc bộ lọc đang chọn.',
    );
    expect(host.querySelector('.users-empty')!.textContent).not.toMatch(/các bộ lọc|kết hợp/);
  });

  it('search is debounced, trimmed, and resets to page 1', async () => {
    const host = await open();
    const input = host.querySelector<HTMLInputElement>('input[type="search"]')!;
    expect(input.closest('label')?.textContent).toContain('Tìm');
    setValue(input, '  lan ');
    await tick(400);
    expect(last()).toContain('q=lan');
    expect(last()).toContain('page=1');
  });

  it('"Hiện người đã khóa" switch sends includeDisabled=true', async () => {
    const host = await open();
    expect(last()).not.toContain('includeDisabled');
    const sw = host.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    expect(sw.closest('label')?.textContent).toContain('Hiện người đã khóa');
    await click(sw);
    expect(last()).toContain('includeDisabled=true');
  });

  it('paginates with total pages', async () => {
    list = (key) => page(items, 45, key.includes('page=2') ? 2 : 1);
    const host = await open();
    expect(host.textContent).toContain('Trang 1/3');
    await click(button(host, 'Trang sau'));
    expect(last()).toContain('page=2');
    expect(host.textContent).toContain('Trang 2/3');
    await click(button(host, 'Trang trước'));
    expect(last()).toContain('page=1');
  });

  it('CSV link carries the current filters (no paging) as a same-origin GET', async () => {
    const host = await open();
    const link = () => host.querySelector<HTMLAnchorElement>('a[href*="learners.csv"]')!;
    expect(link().textContent).toContain('Xuất CSV');
    expect(link().getAttribute('href')).toBe(
      '/api/v1/manager/learners.csv?sort=lastStudyAt&dir=desc',
    );
    await click(th(host, 'Tên').querySelector('button')!);
    await click(button(host, 'Chưa học 7 ngày'));
    await click(host.querySelector<HTMLInputElement>('input[type="checkbox"]')!);
    setValue(host.querySelector<HTMLInputElement>('input[type="search"]')!, 'an');
    await tick(400);
    expect(link().getAttribute('href')).toBe(
      '/api/v1/manager/learners.csv?sort=name&dir=asc&filter=idle7d&q=an&includeDisabled=true',
    );
    expect(link().hasAttribute('page')).toBe(false);
  });

  it('empty and error states; the error has a retry', async () => {
    list = () => page([], 0);
    let host = await open();
    expect(host.textContent).toContain('Chưa có học viên nào');
    unmountAll();
    let fail = true;
    list = () => (fail ? json({ message: 'Lỗi máy chủ' }, 500) : page());
    host = await open();
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('Lỗi máy chủ');
    fail = false;
    await click(button(host, 'Thử lại'));
    expect(host.querySelector('[role="alert"]')).toBeNull();
    expect(host.querySelector('[data-learner="lan"]')).not.toBeNull();
  });

  it('shows the loading state before the first answer', () => {
    list = () => new Promise(() => {});
    const host = mount(<ManagerLearners />);
    expect(host.querySelector('[role="status"]')?.textContent).toContain('Đang tải');
  });

  it('admins get the admin tabs including a way back to #manager', async () => {
    const host = await open(true);
    const tabs = host.querySelector('nav[aria-label="Khu quản trị"]')!;
    expect(tabs.querySelector('a[href="#manager"]')?.getAttribute('aria-current')).toBe('page');
    const plain = mount(<ManagerLearners />);
    await tick();
    expect(plain.querySelector('nav[aria-label="Khu quản trị"]')).toBeNull();
  });
});

describe('ManagerLearners on a narrow screen', () => {
  it('shows stacked cards instead of a table, with a labelled sort control', async () => {
    media(true);
    const host = await open();
    expect(host.querySelector('table')).toBeNull();
    const lan = host.querySelector<HTMLElement>('li[data-learner="lan"]')!;
    expect(lan.textContent).toContain('Lan Nguyễn');
    expect(lan.textContent).toContain('hôm qua');
    expect(lan.textContent).toContain('3 mục');
    expect(lan.querySelector('a')?.getAttribute('href')).toBe('#manager/learner/lan');
    expect(host.querySelector('[data-learner="binh"]')?.textContent).toContain('Chưa học');
    const sel = [...host.querySelectorAll('label')]
      .find((l) => l.textContent?.startsWith('Sắp xếp'))!
      .querySelector('select')!;
    await act(async () => {
      sel.value = 'name';
      sel.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(last()).toContain('sort=name&dir=asc');
  });

  it('shows solid, average level and sessions of 7 days compactly on each card', async () => {
    media(true);
    const host = await open();
    const lan = host.querySelector<HTMLElement>('li[data-learner="lan"]')!;
    for (const label of ['Đã vững', 'Mức nhớ TB', 'Phiên 7 ngày']) {
      expect(lan.textContent).toContain(label);
    }
    expect(lan.textContent).toContain('2,5');
    expect(host.querySelector('[data-learner="binh"]')?.textContent).toContain('Chưa có');
  });
});

describe('ManagerLearners narrow-screen controls', () => {
  it('folds sort and filters into one disclosure whose summary names the current choice', async () => {
    media(true);
    const host = await open();
    const more = host.querySelector<HTMLDetailsElement>('details.manager-more')!;
    expect(more).not.toBeNull();
    expect(more.open).toBe(false);
    const summary = more.querySelector('summary')!;
    expect(summary.textContent).toContain('Sắp xếp và lọc');
    expect(summary.textContent).toContain('Lần học cuối ↓');
    // Search stays outside, always visible.
    expect(more.querySelector('input[type="search"]')).toBeNull();
    expect(more.querySelector('select')).not.toBeNull();
    expect(more.querySelector('[role="group"]')?.textContent).toContain('Chưa học 7 ngày');
    expect(more.textContent).toContain('Hiện người đã khóa');
    await click(button(host, 'Chưa học 7 ngày'));
    expect(summary.textContent).toContain('Chưa học 7 ngày');
    expect(last()).toContain('filter=idle7d');
  });

  it('desktop keeps the filters out in the open, no disclosure', async () => {
    const host = await open();
    expect(host.querySelector('details')).toBeNull();
    expect(host.querySelector('[role="group"]')?.textContent).toContain('Lọc (chọn một)');
  });
});

describe('ManagerLearners table scroll cue', () => {
  function widths(scroll: number, client: number) {
    const proto = HTMLElement.prototype;
    const sw = Object.getOwnPropertyDescriptor(proto, 'scrollWidth');
    const cw = Object.getOwnPropertyDescriptor(proto, 'clientWidth');
    Object.defineProperty(proto, 'scrollWidth', {
      configurable: true,
      get() {
        return this.classList?.contains('manager-scroll') ? scroll : 0;
      },
    });
    Object.defineProperty(proto, 'clientWidth', {
      configurable: true,
      get() {
        return this.classList?.contains('manager-scroll') ? client : 0;
      },
    });
    return () => {
      if (sw) Object.defineProperty(proto, 'scrollWidth', sw);
      if (cw) Object.defineProperty(proto, 'clientWidth', cw);
    };
  }

  it('marks the edges that hide more columns, and follows the scroll position', async () => {
    const restore = widths(900, 600);
    try {
      const host = await open();
      const box = host.querySelector<HTMLElement>('.manager-scrollbox')!;
      expect(box.hasAttribute('data-more-end')).toBe(true);
      expect(box.hasAttribute('data-more-start')).toBe(false);
      const region = box.querySelector<HTMLElement>('.manager-scroll')!;
      await act(async () => {
        region.scrollLeft = 300;
        region.dispatchEvent(new Event('scroll'));
      });
      expect(box.hasAttribute('data-more-start')).toBe(true);
      expect(box.hasAttribute('data-more-end')).toBe(false);
    } finally {
      restore();
    }
  });

  it('a table that fits shows no cue', async () => {
    const restore = widths(600, 600);
    try {
      const host = await open();
      const box = host.querySelector<HTMLElement>('.manager-scrollbox')!;
      expect(box.hasAttribute('data-more-end')).toBe(false);
      expect(box.hasAttribute('data-more-start')).toBe(false);
    } finally {
      restore();
    }
  });
});

describe('ManagerLearners bad dates', () => {
  it('a malformed last-study date shows a dash instead of crashing', async () => {
    list = () => page([learner('lan', { lastStudyAt: 'not-a-date' })]);
    const host = await open();
    const row = host.querySelector<HTMLElement>('tr[data-learner="lan"]')!;
    expect(row.textContent).toContain('—');
    expect(row.textContent).not.toContain('Invalid');
    media(true);
    const narrow = await open();
    expect(narrow.querySelector('li[data-learner="lan"]')?.textContent).toContain('—');
  });
});
