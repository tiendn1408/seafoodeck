import { useEffect, useId, useState } from 'react';
import { api, ApiError } from './api';
import { Dialog } from './Dialog';
import { setLeaveGuard } from './leaveGuard';
import { ErrorNote } from '../learner/ErrorNote';
import './users.css';

/** Server limit per request (about 9 s per 500 rows). */
export const BULK_MAX = 500;
const FILE_MAX = 1_048_576;
const SAMPLE =
  'tên đăng nhập,tên hiển thị,mật khẩu\nhoc.vien01,Nguyễn Văn A,\nhoc.vien02,Trần Thị B,\nhoc.vien03,,\n';
const LEAVE =
  'Đang tạo tài khoản hàng loạt, hoặc mật khẩu tạm chưa được tải về. Rời trang sẽ mất mật khẩu. Vẫn rời đi?';
const CLOSE_QUESTION =
  'Mật khẩu tạm chỉ hiện lúc này và bạn chưa tải file CSV. Đóng sẽ mất toàn bộ mật khẩu. Vẫn đóng?';

export interface BulkInput {
  username: string;
  displayName?: string;
  password?: string;
}
export interface BulkParsed {
  rows: BulkInput[];
  /** Source line number (1-based) of each row. */
  lines: number[];
  error: string;
  /** Cells of the first non-blank row, which is always dropped as the header. */
  header: string[];
  /** True when that row looks like data (a valid username and no header words). */
  headerSuspect: boolean;
}
const USERNAME = /^[a-zA-Z0-9_-]{3,50}$/;
const HEADER_WORDS = /tên|username|user name|mật khẩu|password|pass\b|\bpw\b|hiển thị|display/i;
const UNKNOWN_OUTCOME =
  ' Tài khoản có thể đã được tạo: kiểm tra danh sách và đặt lại mật khẩu cho tài khoản chưa có mật khẩu.';

/**
 * Minimal RFC 4180 reader: BOM, quoted commas/quotes/newlines, CRLF. Returns [line, cells] rows
 * and, when a quoted cell never closes, the line its opening quote is on.
 */
function readCells(text: string): { rows: [number, string[]][]; openQuote: number | null } {
  const out: [number, string[]][] = [];
  let cells: string[] = [],
    cell = '',
    quoted = false,
    quoteLine = 0,
    line = 1,
    start = 1;
  const endRow = () => {
    cells.push(cell);
    out.push([start, cells]);
    cells = [];
    cell = '';
  };
  const s = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else {
        if (c === '\n') line++;
        cell += c;
      }
    } else if (c === '"' && cell === '') {
      quoted = true;
      quoteLine = line;
    } else if (c === ',') {
      cells.push(cell);
      cell = '';
    } else if (c === '\r' || c === '\n') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      endRow();
      line++;
      start = line;
    } else cell += c;
  }
  if (cell !== '' || cells.length) endRow();
  return { rows: out, openQuote: quoted ? quoteLine : null };
}

/** First non-blank line is the header; blank lines are skipped. */
export function parseBulkCsv(text: string): BulkParsed {
  const read = readCells(text);
  const data = read.rows.filter(([, c]) => c.some((x) => x.trim() !== ''));
  const body = data.slice(1);
  const head = (data[0]?.[1] ?? []).map((x) => x.trim());
  const header = head.some(Boolean) ? head : [];
  const headerSuspect =
    header.length > 0 && USERNAME.test(header[0]) && !header.some((x) => HEADER_WORDS.test(x));
  // An unclosed quote would swallow every later row into one cell: refuse instead.
  if (read.openQuote !== null)
    return {
      rows: [],
      lines: [],
      error: `Dấu ngoặc kép mở ở dòng ${read.openQuote} chưa được đóng.`,
      header,
      headerSuspect,
    };
  if (!body.length)
    return {
      rows: [],
      lines: [],
      error: 'Chưa có dòng dữ liệu nào (dòng đầu là tiêu đề).',
      header,
      headerSuspect,
    };
  if (body.length > BULK_MAX)
    return {
      rows: [],
      lines: [],
      header,
      headerSuspect,
      error: `Tối đa ${BULK_MAX} dòng mỗi lần; file có ${body.length} dòng. Hãy chia nhỏ file.`,
    };
  const rows = body.map(([, c]): BulkInput => {
    const displayName = (c[1] ?? '').trim();
    const password = c[2] ?? '';
    return {
      username: (c[0] ?? '').trim(),
      ...(displayName ? { displayName } : {}),
      ...(password ? { password } : {}),
    };
  });
  return { rows, lines: body.map(([l]) => l), error: '', header, headerSuspect };
}

/** The column header used when failed rows are put back in the box. */
const INPUT_HEADER = 'tên đăng nhập,tên hiển thị,mật khẩu';
/** One cell of the input box: quoted when it holds a comma, quote or line break. */
const inputCell = (v: string) => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
/** The rows that were not created, as input CSV without their passwords (typed or not). */
export function failedRowsCsv(rows: BulkInput[]): string {
  return (
    [
      INPUT_HEADER,
      ...rows.map((r) => [r.username, r.displayName ?? '', ''].map(inputCell).join(',')),
    ].join('\n') + '\n'
  );
}

/** Cells starting with = + - @ (or control whitespace) would run as formulas in a spreadsheet. */
function cell(value: string | undefined): string {
  let v = value ?? '';
  if (/^[=+\-@\t\r]/.test(v)) v = "'" + v;
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}
/** Built only in the browser from the response; never stored. */
export function buildPasswordCsv(
  rows: { username: string; displayName?: string; password: string }[],
): string {
  const lines = ['Tên đăng nhập,Tên hiển thị,Mật khẩu tạm'];
  for (const r of rows) lines.push([r.username, r.displayName, r.password].map(cell).join(','));
  return String.fromCharCode(0xfeff) + lines.join('\r\n') + '\r\n';
}

interface ResultRow {
  line: number;
  username: string;
  status: 'created' | 'duplicate' | 'invalid';
  message?: string;
  temporaryPassword?: string;
}
interface BulkResult {
  dryRun: boolean;
  created: number;
  skipped: number;
  failed: number;
  rows: ResultRow[];
}
const STATUS: Record<ResultRow['status'], [string, string]> = {
  created: ['Tạo được', 'on'],
  duplicate: ['Bỏ qua (đã tồn tại)', 'must'],
  invalid: ['Chưa tạo được', 'off'],
};

export function BulkDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [text, setText] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [previewed, setPreviewed] = useState<BulkResult | null>(null),
    [final, setFinal] = useState<BulkResult | null>(null),
    [downloaded, setDownloaded] = useState(false);
  // Names and source lines of the submitted rows, never their typed passwords.
  const [meta, setMeta] = useState<{ displayName?: string; line: number }[]>([]);
  // The rows a real run could not create, without passwords, ready to fix and run again.
  const [retry, setRetry] = useState('');
  const ids = useId();
  const parsed = parseBulkCsv(text);
  const guarded = busy || (!!final && !downloaded && final.created > 0);

  useEffect(() => {
    if (!guarded) return;
    const ask = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', ask);
    const release = setLeaveGuard(LEAVE);
    return () => {
      window.removeEventListener('beforeunload', ask);
      release();
    };
  }, [guarded]);

  const edit = (value: string) => {
    setText(value);
    setPreviewed(null);
    setError('');
  };
  async function run(dryRun: boolean) {
    if (busy || parsed.error || !parsed.rows.length) return;
    setBusy(true);
    setError('');
    try {
      const r = await api<BulkResult>('/admin/users/bulk', {
        rows: parsed.rows,
        ...(dryRun ? { dryRun: true } : {}),
      });
      if (dryRun) setPreviewed(r);
      else {
        setMeta(parsed.rows.map((x, i) => ({ displayName: x.displayName, line: parsed.lines[i] })));
        setFinal(r);
        const failed = parsed.rows.filter((_, i) => r.rows[i]?.status === 'invalid');
        setRetry(failed.length ? failedRowsCsv(failed) : '');
        setText('');
        setPreviewed(null);
        onDone();
      }
    } catch (e) {
      const unknown = !dryRun && (!(e instanceof ApiError) || e.status === 0 || e.status >= 500);
      setError((e as Error).message + (unknown ? UNKNOWN_OUTCOME : ''));
    } finally {
      setBusy(false);
    }
  }
  function download() {
    if (!final) return;
    const list = final.rows.flatMap((r, i) =>
      r.status === 'created' && r.temporaryPassword
        ? [
            {
              username: r.username,
              displayName: meta[i]?.displayName,
              password: r.temporaryPassword,
            },
          ]
        : [],
    );
    const url = URL.createObjectURL(
      new Blob([buildPasswordCsv(list)], { type: 'text/csv;charset=utf-8' }),
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = 'mat-khau-tam.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setDownloaded(true);
  }
  /** Back to the input box with only the rows that were not created. */
  function fixFailed() {
    if (busy || !final) return;
    if (!downloaded && final.created > 0 && !window.confirm(CLOSE_QUESTION)) return;
    setFinal(null);
    setMeta([]);
    setDownloaded(false);
    edit(retry);
    setRetry('');
  }
  function close() {
    if (busy) return;
    if (final && !downloaded && final.created > 0 && !window.confirm(CLOSE_QUESTION)) return;
    onClose();
  }
  function pick(file: File | undefined) {
    if (!file) return;
    if (file.size > FILE_MAX) {
      setError('File CSV tối đa 1 MiB.');
      return;
    }
    void file.text().then(edit);
  }

  const shown = final ?? previewed;
  const lineOf = (r: ResultRow, i: number) => (final ? meta[i]?.line : parsed.lines[i]) ?? r.line;
  return (
    <Dialog title="Tạo hàng loạt" onClose={close}>
      <div className="users-bulk">
        {!final && (
          <>
            <p>
              Dán hoặc chọn file CSV, tối đa {BULK_MAX} dòng, cột: tên đăng nhập, tên hiển thị, mật
              khẩu. Dòng đầu là tiêu đề. Để trống mật khẩu để hệ thống tự tạo (12 ký tự, người dùng
              phải đổi ở lần đăng nhập đầu).
            </p>
            <div className="users-dialog-actions users-bulk-tools">
              <button
                type="button"
                className="users-secondary"
                disabled={busy}
                onClick={() => edit(SAMPLE)}
              >
                Điền CSV mẫu
              </button>
              <label className="users-secondary users-file">
                Chọn file CSV
                <input
                  type="file"
                  accept=".csv,text/csv"
                  disabled={busy}
                  onChange={(e) => {
                    pick(e.target.files?.[0]);
                    e.target.value = '';
                  }}
                />
              </label>
            </div>
            <label className="users-field">
              Nội dung CSV
              <textarea
                rows={7}
                value={text}
                disabled={busy}
                spellCheck={false}
                autoCapitalize="none"
                aria-describedby={ids + 'hint'}
                onChange={(e) => edit(e.target.value)}
              />
            </label>
            <p className="users-hint" id={ids + 'hint'}>
              Tên đăng nhập 3–50 ký tự (chữ không dấu, số, _ hoặc -); tên hiển thị tối đa 80; mật
              khẩu nhập tay 8–128 ký tự. Nếu cột có dấu phẩy, đặt trong ngoặc kép.
            </p>
            {parsed.error && text && !busy && <p className="users-field-error">{parsed.error}</p>}
            {error && <ErrorNote message={error} />}
          </>
        )}
        {!final && parsed.header.length > 0 && (
          <p className={parsed.headerSuspect ? 'users-warning' : 'users-hint'} data-header-dropped>
            Dòng đầu đã bị bỏ qua vì được coi là tiêu đề: {parsed.header.join(', ')}
            {parsed.headerSuspect &&
              '. Nếu đó là tài khoản thật, hãy thêm một dòng tiêu đề lên trên.'}
          </p>
        )}
        {busy && (
          <p role="status" className="users-warning">
            Đang xử lý {parsed.rows.length} dòng, có thể mất đến vài chục giây. Đừng đóng hoặc tải
            lại trang.
          </p>
        )}
        {final && (
          <section className="users-reveal" aria-label="Kết quả tạo">
            <p className="users-warning">
              Mật khẩu tạm chỉ hiện lúc này và sẽ mất khi đóng hộp. Tải file CSV, đưa cho người dùng
              và yêu cầu họ đổi ngay.
              {final.created === 0 && ' Không có tài khoản nào được tạo.'}
            </p>
            {final.created > 0 && (
              <button type="button" className="users-primary" onClick={download}>
                Tải CSV mật khẩu
              </button>
            )}
            {downloaded && <p role="status">Đã tải file. Hãy lưu ở nơi an toàn.</p>}
          </section>
        )}
        {shown && (
          <div role="status">
            <p>
              {final ? 'Đã tạo' : 'Xem trước:'} {shown.created} tạo được · {shown.skipped} bỏ qua
              (đã tồn tại hoặc trùng trong lô) · {shown.failed} chưa tạo được
            </p>
            {shown.failed > 0 && (
              <p className="users-hint">
                Dòng “chưa tạo được” có thể do dữ liệu sai hoặc lỗi tạm thời; sửa dữ liệu rồi chạy
                lại, các dòng đã tạo sẽ được bỏ qua.
                {final &&
                  ' “Sửa các dòng chưa tạo được” đưa riêng các dòng đó trở lại ô nhập, không kèm mật khẩu (để trống thì hệ thống tự tạo).'}
              </p>
            )}
            <table className="users-table">
              <caption className="users-sr">Kết quả từng dòng</caption>
              <thead>
                <tr>
                  <th scope="col">Dòng</th>
                  <th scope="col">Tên đăng nhập</th>
                  <th scope="col">Kết quả</th>
                </tr>
              </thead>
              <tbody>
                {shown.rows.map((r, i) => (
                  <tr key={i}>
                    <td data-label="Dòng">{lineOf(r, i)}</td>
                    <th scope="row" className="users-name">
                      {r.username}
                    </th>
                    <td data-label="Kết quả">
                      <span className="users-badge" data-state={STATUS[r.status][1]}>
                        {STATUS[r.status][0]}
                      </span>
                      {r.message && <span className="users-muted"> {r.message}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="users-dialog-actions">
          <button type="button" className="users-secondary" disabled={busy} onClick={close}>
            {final ? 'Đóng' : 'Hủy'}
          </button>
          {final && retry && (
            <button type="button" className="users-secondary" onClick={fixFailed}>
              Sửa các dòng chưa tạo được
            </button>
          )}
          {!final && (
            <>
              <button
                type="button"
                className="users-secondary"
                disabled={busy || !!parsed.error}
                onClick={() => void run(true)}
              >
                {busy && !previewed ? 'Đang xử lý…' : 'Xem trước'}
              </button>
              <button
                type="button"
                className="users-primary"
                disabled={busy || !previewed || !!parsed.error}
                onClick={() => void run(false)}
              >
                {busy && previewed ? 'Đang tạo…' : 'Tạo hàng loạt'}
              </button>
            </>
          )}
        </div>
      </div>
    </Dialog>
  );
}
