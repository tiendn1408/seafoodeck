import { useEffect, useId, useState } from 'react';
import { api, type LearnerPage, type LearnerRow } from '../pilot/api';
import { AdminTabs } from '../pilot/AdminTabs';
import { ErrorNote } from '../learner/ErrorNote';
import { useMedia } from '../learner/useMedia';
import '../pilot/users.css';
import './manager.css';

const LIMIT = 20;
const SEARCH_DELAY = 300;

type SortKey =
  'name' | 'lastStudyAt' | 'learning' | 'solid' | 'avgLevel' | 'overdue' | 'sessions7d';
type Dir = 'asc' | 'desc';
type Filter = '' | 'idle7d' | 'overdue';
const COLUMNS: { key: SortKey; label: string; num?: boolean }[] = [
  { key: 'name', label: 'Tên' },
  { key: 'learning', label: 'Đang học', num: true },
  { key: 'solid', label: 'Đã vững', num: true },
  { key: 'avgLevel', label: 'Mức nhớ TB', num: true },
  { key: 'lastStudyAt', label: 'Lần học cuối' },
  { key: 'overdue', label: 'Quá hạn', num: true },
  { key: 'sessions7d', label: 'Phiên 7 ngày', num: true },
];
const FILTERS: { id: Exclude<Filter, ''>; label: string }[] = [
  { id: 'idle7d', label: 'Chưa học 7 ngày' },
  { id: 'overdue', label: 'Có mục quá hạn' },
];

const TZ = 'Asia/Ho_Chi_Minh';
const fullTime = new Intl.DateTimeFormat('vi-VN', {
  timeZone: TZ,
  dateStyle: 'medium',
  timeStyle: 'short',
});
const shortDate = new Intl.DateTimeFormat('vi-VN', {
  timeZone: TZ,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});
const dayKey = new Intl.DateTimeFormat('en-CA', { timeZone: TZ });
const level = new Intl.NumberFormat('vi-VN', {
  maximumFractionDigits: 1,
  minimumFractionDigits: 1,
});
const DAY = 86_400_000;
/** "hôm nay", "hôm qua", "3 ngày trước": calendar days in Ho Chi Minh time. */
export function relativeDay(iso: string, now = Date.now()): string {
  const then = new Date(iso);
  const days = Math.round(
    (Date.parse(dayKey.format(new Date(now))) - Date.parse(dayKey.format(then))) / DAY,
  );
  if (days <= 0) return 'hôm nay';
  if (days === 1) return 'hôm qua';
  if (days < 30) return `${days} ngày trước`;
  return shortDate.format(then);
}

function Last({ at }: { at: string | null }) {
  if (at && Number.isNaN(new Date(at).getTime())) return <span className="users-muted">—</span>;
  return at ? (
    <time dateTime={at} title={fullTime.format(new Date(at))}>
      {relativeDay(at)}
    </time>
  ) : (
    <span className="users-muted">Chưa học</span>
  );
}
function Overdue({ n }: { n: number }) {
  return n > 0 ? (
    <span className="users-badge" data-state="must">
      {n} mục
    </span>
  ) : (
    <span className="users-muted">Không</span>
  );
}
function Avg({ v }: { v: number | null }) {
  return v === null ? <span className="users-muted">Chưa có</span> : <>{level.format(v)}</>;
}
function Person({ row }: { row: LearnerRow }) {
  return (
    <>
      <a className="manager-open" href={`#manager/learner/${encodeURIComponent(row.id)}`}>
        {row.displayName || row.username}
      </a>
      {row.displayName && <span className="manager-user">{row.username}</span>}
      {row.disabled && (
        <span className="users-badge" data-state="off">
          Đã khóa
        </span>
      )}
    </>
  );
}

export function ManagerLearners({ admin = false }: { admin?: boolean }) {
  const [sort, setSort] = useState<SortKey>('lastStudyAt'),
    [dir, setDir] = useState<Dir>('desc'),
    [filter, setFilter] = useState<Filter>(''),
    [showLocked, setShowLocked] = useState(false),
    [query, setQuery] = useState(''),
    [q, setQ] = useState(''),
    [page, setPage] = useState(1),
    [reload, setReload] = useState(0);
  const [data, setData] = useState<LearnerPage | null>(null),
    [settled, setSettled] = useState<{ key: string; error: string } | null>(null);
  const narrow = useMedia('(max-width: 599.98px)');
  const ids = useId();

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed === q) return;
    const t = setTimeout(() => {
      setQ(trimmed);
      setPage(1);
    }, SEARCH_DELAY);
    return () => clearTimeout(t);
  }, [query, q]);

  // The table's filters and sort, shared by the list and the CSV export (which has no paging).
  const shared = new URLSearchParams({ sort, dir });
  if (filter) shared.set('filter', filter);
  if (q) shared.set('q', q);
  const listParams = new URLSearchParams(shared);
  listParams.set('page', String(page));
  listParams.set('limit', String(LIMIT));
  if (showLocked) {
    listParams.set('includeDisabled', 'true');
    shared.set('includeDisabled', 'true');
  }
  const path = '/manager/learners?' + listParams;
  const csvHref = '/api/v1/manager/learners.csv?' + shared;
  const key = `${path}#${reload}`;
  const loading = settled?.key !== key;
  const loadError = settled?.key === key ? settled.error : '';
  useEffect(() => {
    const ctrl = new AbortController();
    let current = true;
    api<LearnerPage>(path, undefined, ctrl.signal)
      .then((d) => {
        if (!current) return;
        const last = Math.max(1, Math.ceil(d.total / d.limit));
        if (!d.items.length && d.page > last) {
          setPage(last);
          return;
        }
        setData(d);
        setSettled({ key, error: '' });
      })
      .catch((e: Error) => {
        if (current && e.name !== 'AbortError') setSettled({ key, error: e.message });
      });
    return () => {
      current = false;
      ctrl.abort();
    };
  }, [path, key]);

  const sortBy = (next: SortKey) => {
    if (next === sort) setDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSort(next);
      setDir(next === 'name' ? 'asc' : 'desc');
    }
    setPage(1);
  };
  const pages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;
  const plain = !q && !filter;
  const ariaSort = (k: SortKey) =>
    sort !== k ? 'none' : dir === 'asc' ? 'ascending' : 'descending';

  return (
    <div className="users-admin manager-learners">
      {admin && <AdminTabs current="learners" />}
      <header className="users-head">
        <div>
          <h1>Học viên</h1>
          <p>Theo dõi ai đang học, ai lâu chưa học và ai còn mục quá hạn.</p>
        </div>
        <a className="users-secondary manager-csv" href={csvHref}>
          Xuất CSV
        </a>
      </header>

      <div className="manager-tools">
        <label className="users-field users-search">
          Tìm theo tên đăng nhập hoặc tên hiển thị
          <input
            type="search"
            value={query}
            maxLength={80}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        {narrow && (
          <>
            <label className="users-field manager-sortfield">
              Sắp xếp theo
              <select value={sort} onChange={(e) => sortBy(e.target.value as SortKey)}>
                {COLUMNS.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="users-secondary"
              onClick={() => {
                setDir((d) => (d === 'asc' ? 'desc' : 'asc'));
                setPage(1);
              }}
            >
              {dir === 'asc' ? 'Tăng dần ↑' : 'Giảm dần ↓'}
            </button>
          </>
        )}
      </div>

      <div className="manager-filters" role="group" aria-labelledby={ids + 'filters'}>
        <span className="manager-filters-label" id={ids + 'filters'}>
          Lọc (chọn một)
        </span>
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            className="manager-chip"
            aria-pressed={filter === f.id}
            onClick={() => {
              setFilter((cur) => (cur === f.id ? '' : f.id));
              setPage(1);
            }}
          >
            {f.label}
          </button>
        ))}
        <label className="users-check manager-switch">
          <input
            type="checkbox"
            checked={showLocked}
            onChange={(e) => {
              setShowLocked(e.target.checked);
              setPage(1);
            }}
          />
          Hiện người đã khóa
        </label>
      </div>

      {loadError ? (
        <ErrorNote message={loadError} retry={() => setReload((n) => n + 1)} />
      ) : !data ? (
        <p role="status" className="users-muted">
          Đang tải danh sách…
        </p>
      ) : (
        <>
          <p className="users-count" id={ids + 'count'}>
            {data.total} học viên
            {loading && <span role="status"> · Đang tải…</span>}
          </p>
          {data.items.length === 0 ? (
            <p className="users-empty">
              {plain
                ? 'Chưa có học viên nào.'
                : 'Không có học viên nào khớp tìm kiếm hoặc bộ lọc đang chọn.'}
            </p>
          ) : narrow ? (
            <ul className="manager-cards" aria-describedby={ids + 'count'}>
              {data.items.map((r) => (
                <li key={r.id} className="manager-card" data-learner={r.id}>
                  <Person row={r} />
                  <dl>
                    <div>
                      <dt>Lần học cuối</dt>
                      <dd>
                        <Last at={r.lastStudyAt} />
                      </dd>
                    </div>
                    <div>
                      <dt>Đang học</dt>
                      <dd>{r.learning}</dd>
                    </div>
                    <div>
                      <dt>Đã vững</dt>
                      <dd>{r.solid}</dd>
                    </div>
                    <div>
                      <dt>Mức nhớ TB</dt>
                      <dd>
                        <Avg v={r.avgLevel} />
                      </dd>
                    </div>
                    <div>
                      <dt>Phiên 7 ngày</dt>
                      <dd>{r.sessions7d}</dd>
                    </div>
                    <div>
                      <dt>Quá hạn</dt>
                      <dd>
                        <Overdue n={r.overdue} />
                      </dd>
                    </div>
                  </dl>
                </li>
              ))}
            </ul>
          ) : (
            <div className="manager-scroll" role="region" aria-label="Bảng học viên" tabIndex={0}>
              <table className="users-table manager-table" aria-describedby={ids + 'count'}>
                <caption className="users-sr">Danh sách học viên</caption>
                <thead>
                  <tr>
                    {COLUMNS.map((c) => (
                      <th
                        key={c.key}
                        scope="col"
                        aria-sort={ariaSort(c.key)}
                        className={c.num ? 'manager-num' : undefined}
                      >
                        <button
                          type="button"
                          className="manager-sort"
                          onClick={() => sortBy(c.key)}
                        >
                          {c.label}
                        </button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((r) => (
                    <tr key={r.id} data-learner={r.id}>
                      <th scope="row" className="manager-person">
                        <Person row={r} />
                      </th>
                      <td className="manager-num">{r.learning}</td>
                      <td className="manager-num">{r.solid}</td>
                      <td className="manager-num">
                        <Avg v={r.avgLevel} />
                      </td>
                      <td>
                        <Last at={r.lastStudyAt} />
                      </td>
                      <td className="manager-num">
                        <Overdue n={r.overdue} />
                      </td>
                      <td className="manager-num">{r.sessions7d}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <nav className="users-pages" aria-label="Phân trang">
            <button
              type="button"
              className="users-secondary"
              disabled={page <= 1 || loading}
              onClick={() => setPage((p) => p - 1)}
            >
              Trang trước
            </button>
            <span>
              Trang {page}/{pages}
            </span>
            <button
              type="button"
              className="users-secondary"
              disabled={page >= pages || loading}
              onClick={() => setPage((p) => p + 1)}
            >
              Trang sau
            </button>
          </nav>
        </>
      )}
    </div>
  );
}
