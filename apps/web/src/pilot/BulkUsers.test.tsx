import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { BulkDialog, BULK_MAX, buildPasswordCsv, parseBulkCsv } from './BulkUsers';
import { button, click, mount, unmountAll } from '../learner/testDom';

describe('parseBulkCsv', () => {
  it('skips BOM, header and blank lines, and keeps quoted commas', () => {
    const r = parseBulkCsv(
      '﻿tên đăng nhập,tên hiển thị,mật khẩu\r\n\r\nlan,"Nguyễn, Lan",secret123\n  \nbinh,,\n"hoa","Hoa ""Bé""",\n',
    );
    expect(r.error).toBe('');
    expect(r.rows).toEqual([
      { username: 'lan', displayName: 'Nguyễn, Lan', password: 'secret123' },
      { username: 'binh' },
      { username: 'hoa', displayName: 'Hoa "Bé"' },
    ]);
    expect(r.lines).toEqual([3, 5, 6]);
  });
  it('blocks more than the maximum rows', () => {
    const body = Array.from({ length: BULK_MAX + 1 }, (_, i) => `u${i + 100}`).join('\n');
    const r = parseBulkCsv('username\n' + body);
    expect(r.error).toMatch(/500/);
    expect(parseBulkCsv('username\n' + body.split('\n').slice(0, BULK_MAX).join('\n')).error).toBe(
      '',
    );
  });
  it('reports empty input', () => {
    expect(parseBulkCsv('username,name,pw\n\n').error).toMatch(/Chưa có dòng/);
  });
});

describe('buildPasswordCsv', () => {
  it('has BOM and Vietnamese header, escapes and neutralises formulas', () => {
    const csv = buildPasswordCsv([
      { username: '-evil', displayName: '=SUM(A1)', password: 'Abc,"d"' },
      { username: 'lan', displayName: undefined, password: 'Zz23' },
    ]);
    expect(csv.startsWith('﻿Tên đăng nhập,Tên hiển thị,Mật khẩu tạm\r\n')).toBe(true);
    expect(csv).toContain('\'-evil,\'=SUM(A1),"Abc,""d"""\r\n');
    expect(csv).toContain('lan,,Zz23');
  });
});

let bodies: { dryRun?: boolean; rows: { username: string; password?: string }[] }[];
let blobs: Blob[];
const reply = (rows: object[]) => {
  const count = (s: string) => rows.filter((r) => (r as { status: string }).status === s).length;
  return new Response(
    JSON.stringify({
      dryRun: false,
      created: count('created'),
      skipped: count('duplicate'),
      failed: count('invalid'),
      rows,
    }),
  );
};
beforeEach(() => {
  bodies = [];
  blobs = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((_url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string);
      bodies.push(body);
      const dry = !!body.dryRun;
      const out = body.rows.map((r: { username: string }, i: number) =>
        r.username === 'lan'
          ? { line: i + 1, username: 'lan', status: 'duplicate', message: 'Đã tồn tại' }
          : {
              line: i + 1,
              username: r.username,
              status: 'created',
              ...(dry ? {} : { temporaryPassword: 'GenPass' + i }),
            },
      );
      return Promise.resolve(reply(out));
    }),
  );
  URL.createObjectURL = vi.fn((b: Blob) => (blobs.push(b), 'blob:x'));
  URL.revokeObjectURL = vi.fn();
  HTMLAnchorElement.prototype.click = vi.fn();
});
afterEach(() => {
  unmountAll();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
const readBlob = (b: Blob) =>
  new Promise<string>((res) => {
    const f = new FileReader();
    f.onload = () => res(String(f.result));
    f.readAsText(b);
  });
function type(host: HTMLElement, text: string) {
  const ta = host.ownerDocument.querySelector('textarea')!;
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!;
  act(() => {
    setter.call(ta, text);
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
const CSV = 'username,name,pw\nbinh,Bình,MyTyped-Pass1\nlan,Lan,\nhoa,,\n';

describe('BulkDialog', () => {
  it('preview shows rows but never passwords, and unlocks create', async () => {
    const host = mount(<BulkDialog onClose={() => {}} onDone={() => {}} />);
    expect(button(host, 'Tạo hàng loạt').disabled).toBe(true);
    type(host, CSV);
    await click(button(host, 'Xem trước'));
    expect(bodies[0].dryRun).toBe(true);
    const text = document.querySelector('table')!.textContent!;
    expect(text).toContain('binh');
    expect(text).toContain('Bỏ qua');
    expect(text).not.toContain('MyTyped-Pass1');
    expect(text).not.toContain('GenPass');
    expect(button(host, 'Tạo hàng loạt').disabled).toBe(false);
    type(host, CSV + 'x1x\n');
    expect(button(host, 'Tạo hàng loạt').disabled).toBe(true);
  });

  it('real run downloads generated passwords only, refreshes, and guards close', async () => {
    const onDone = vi.fn(),
      onClose = vi.fn();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const host = mount(<BulkDialog onClose={onClose} onDone={onDone} />);
    type(host, CSV);
    await click(button(host, 'Xem trước'));
    await click(button(host, 'Tạo hàng loạt'));
    expect(bodies[1].dryRun).toBeFalsy();
    expect(bodies[1].rows[0].password).toBe('MyTyped-Pass1');
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(document.body.textContent).not.toContain('MyTyped-Pass1');
    expect(document.body.textContent).not.toContain('GenPass');
    expect(document.body.textContent).toContain('chỉ hiện lúc này');
    // Closing before download asks first.
    await click(button(host, 'Đóng'));
    expect(onClose).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    await click(button(host, 'Đóng'));
    expect(onClose).toHaveBeenCalledTimes(1);
    onClose.mockClear();
    await click(button(host, 'Tải CSV mật khẩu'));
    const csv = await readBlob(blobs[0]);
    expect(csv).toContain('GenPass0');
    expect(csv).toContain('GenPass2');
    expect(csv).not.toContain('MyTyped-Pass1');
    expect(csv).toContain('Bình');
    expect(csv).not.toContain('lan');
    confirm.mockClear();
    await click(button(host, 'Đóng'));
    expect(confirm).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
