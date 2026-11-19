import { useEffect, useState } from 'react';
import { Fish } from 'lucide-react';
import {
  api,
  setCsrf,
  writeLocal,
  vi,
  type AuthView,
  type CatalogPage,
  type Game,
  type Score,
} from './api';
import { SignedImage, stopAudio } from './Media';
import { Admin } from './Admin';
import { AppShell } from '../learner/AppShell';
import { ErrorNote } from '../learner/ErrorNote';
import { Login } from '../learner/Login';
import { Home, type Taxon } from '../learner/Home';
import { Profile } from '../learner/Profile';
import { Study } from '../learner/study/Study';
import { groupTone } from '../learner/haul';
import {
  LEDGER_KEY,
  loadLedger,
  skillLabel,
  mergeScore,
  mergeGame,
  type Ledger,
} from '../learner/ledger';
function currentRoute() {
  return window.location.hash.slice(1) || 'home';
}
export default function PilotApp() {
  const [initial] = useState(loadLedger);
  const [warning, setWarning] = useState(initial.warning);
  const [auth, setAuth] = useState<AuthView | null>(null),
    [error, setError] = useState(''),
    [route, setRoute] = useState(currentRoute),
    [ledger, setLedger] = useState<Ledger>(initial.ledger),
    [saved, setSaved] = useState(true);
  const [game, setGame] = useState<Game | null>(null),
    [pending, setPending] = useState(false),
    [version, setVersion] = useState(''),
    [libraryTaxon, setLibraryTaxon] = useState<Taxon | ''>('');
  useEffect(() => {
    const f = () => {
      const next = currentRoute();
      setRoute(next);
      if (next !== 'library') setLibraryTaxon('');
      window.scrollTo(0, 0);
      setError('');
      stopAudio();
    };
    window.addEventListener('hashchange', f);
    return () => window.removeEventListener('hashchange', f);
  }, []);
  useEffect(() => {
    void api<AuthView>('/auth/me')
      .then((a) => {
        setCsrf(a.csrf);
        setAuth(a);
      })
      .catch((e) => setError(e.message));
  }, []);
  function persist(next: Ledger) {
    setLedger(next);
    setWarning('');
    setSaved(writeLocal(LEDGER_KEY, next));
  }
  async function start(
    mode: string,
    revisionId?: string,
    kind = 'en',
    reviewOf?: string,
    reviewTargets?: { targetId: string; skill: string }[],
  ) {
    setPending(true);
    setError('');
    try {
      const next = await api<Game>('/learning/sessions', {
        mode,
        kind,
        ...(revisionId ? { revisionId } : {}),
        ...(reviewOf ? { reviewOf } : {}),
        ...(reviewTargets ? { reviewTargets } : {}),
      });
      setGame(next);
      persist({ ...ledger, sessionId: next.id });
      location.hash = 'study';
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPending(false);
    }
  }
  async function resume() {
    if (!ledger.sessionId) return;
    setPending(true);
    setError('');
    try {
      const restored = await api<Game>(`/learning/sessions/${ledger.sessionId}`);
      setGame(restored);
      persist(mergeGame(ledger, restored));
      location.hash = 'study';
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPending(false);
    }
  }
  useEffect(() => {
    if (!auth || auth.role === 'guest' || route !== 'study' || game || !ledger.sessionId) return;
    let alive = true;
    api<Game>(`/learning/sessions/${ledger.sessionId}`)
      .then((g) => {
        if (alive) {
          setGame(g);
          const restored = mergeGame(ledger, g);
          setLedger(restored);
          setSaved(writeLocal(LEDGER_KEY, restored));
        }
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, [auth, route, game, ledger]);
  function record(result: Score, g: Game) {
    persist(mergeScore(ledger, result, g));
  }
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);
  const active = ledger.attempts.filter((a) => a.contentVersion === version && !a.skipped),
    reviews = Object.values(ledger.reviews).filter((r) => r.contentVersion === version),
    due = reviews.filter((r) => Date.parse(r.dueAt) <= now);
  const staff = auth && ['admin', 'editor', 'reviewer', 'publisher'].includes(auth.role);
  const signedIn = !!auth && auth.role !== 'guest';
  function logout() {
    void api<AuthView>('/auth/logout', {})
      .then((a) => {
        setAuth(a);
        setCsrf(a.csrf);
        setGame(null);
        location.hash = 'home';
      })
      .catch((e) => setError(e.message));
  }
  return (
    <AppShell
      route={route}
      tone={route === 'home' || route === 'study' || route.startsWith('profile/') ? 'deep' : 'ice'}
      staff={!!staff}
      internal={!!auth?.internal}
      signedIn={signedIn}
      onLogout={logout}
    >
      <div
        className={
          route === 'home' && signedIn
            ? 'home-stage'
            : route.startsWith('profile/') && signedIn
              ? 'profile-stage'
              : route === 'study' && signedIn
                ? 'study-stage'
                : 'content home-content'
        }
      >
        {warning && <ErrorNote message={warning} />}
        {!saved && (
          <ErrorNote message="Trình duyệt không lưu được tiến độ. Phiên trên máy chủ vẫn hoạt động, nhưng cần giữ trang này mở." />
        )}
        {error && <ErrorNote message={error} retry={() => location.reload()} />}
        {!auth ? (
          !error && <p role="status">Đang kết nối bộ học…</p>
        ) : auth.role === 'guest' ? (
          <Login
            onLogin={(a) => {
              setCsrf(a.csrf);
              setAuth(a);
            }}
          />
        ) : (
          <>
            {route === 'home' && (
              <Home
                ledger={ledger}
                now={now}
                pending={pending}
                onStart={start}
                onResume={ledger.sessionId ? resume : undefined}
                onVersion={setVersion}
                onOpenLibrary={(taxon) => {
                  setLibraryTaxon(taxon);
                  location.hash = 'library';
                }}
              />
            )}
            {route === 'library' && (
              <CatalogScreen
                taxon={libraryTaxon}
                onClearTaxon={() => {
                  setLibraryTaxon('');
                }}
                onVersion={setVersion}
              />
            )}
            {route.startsWith('profile/') && (
              <Profile
                key={route}
                id={route.split('/')[1]}
                internal={auth.internal}
                onStart={start}
              />
            )}
            {route === 'study' &&
              (game ? (
                <Study
                  key={game.id}
                  game={game}
                  ledger={ledger}
                  onChange={setGame}
                  onRecord={record}
                  onRetry={() => start('review', undefined, 'en', game.id)}
                  pending={pending}
                />
              ) : (
                <p className="study-status" role="status">
                  {pending ? 'Đang khôi phục phiên…' : 'Mở lượt mới từ trang Học.'}
                </p>
              ))}
            {route === 'review' && (
              <>
                <h1>Góc ôn tập của bạn.</h1>
                <p>Mỗi kỹ năng một lịch riêng: 1 → 3 → 7 → 14 ngày.</p>
                <VersionLoader onVersion={setVersion} />
                {reviews.length ? (
                  <>
                    <div className="pilot-review-list">
                      {reviews.map((r) => (
                        <div key={r.key}>
                          <strong>{ledger.labels?.[r.targetId] ?? 'Mục học'}</strong>
                          <span>{skillLabel(r.skill)}</span>
                          <span>
                            Mốc {[1, 3, 7, 14][r.stage]} ngày ·{' '}
                            {new Date(r.dueAt).toLocaleDateString('vi-VN')}
                          </span>
                        </div>
                      ))}
                    </div>
                    <button
                      className="btn primary"
                      disabled={!due.length || pending}
                      onClick={() =>
                        void start(
                          'review',
                          undefined,
                          'en',
                          undefined,
                          due.slice(0, 30).map((r) => ({ targetId: r.targetId, skill: r.skill })),
                        )
                      }
                    >
                      Ôn {due.length} mục đến hạn
                    </button>
                  </>
                ) : (
                  <div className="empty-card">
                    <img
                      className="review-empty-art"
                      src="/media/illustrations/seafood-review-2d-v2.png"
                      alt=""
                      width="1536"
                      height="1024"
                    />
                    <h2>Chưa có mục ôn tập</h2>
                    <p>Hoàn thành một lượt để lên lịch theo từng kỹ năng.</p>
                    <a className="btn primary" href="#home">
                      Mở bộ học
                    </a>
                  </div>
                )}
              </>
            )}
            {route === 'progress' && (
              <>
                <h1>Tiến độ học của bạn</h1>
                <VersionLoader onVersion={setVersion} />
                <div className="stats-grid">
                  <div className="stat-card">
                    <strong>{active.filter((a) => !a.selfRated).length}</strong>
                    <span>Câu đã trả lời</span>
                  </div>
                  <div className="stat-card">
                    <strong>
                      {active.filter((a) => !a.selfRated).length
                        ? Math.round(
                            (active.filter((a) => !a.selfRated && a.correct).length /
                              active.filter((a) => !a.selfRated).length) *
                              100,
                          ) + '%'
                        : '—'}
                    </strong>
                    <span>Đúng lần đầu</span>
                  </div>
                  <div className="stat-card">
                    <strong>{active.filter((a) => a.selfRated).length}</strong>
                    <span>Thẻ tự đánh giá</span>
                  </div>
                </div>
                <p>
                  Lịch sử bộ cũ được giữ riêng trên thiết bị. Không chuyển điểm sang revision khác.
                </p>
              </>
            )}
            {route === 'admin' && staff && <Admin />}
          </>
        )}
      </div>
    </AppShell>
  );
}
function VersionLoader({ onVersion }: { onVersion: (id: string) => void }) {
  useEffect(() => {
    api<CatalogPage>('/catalog/items?limit=1')
      .then((d) => onVersion(d.releaseId))
      .catch(() => {});
  }, [onVersion]);
  return null;
}
function CatalogScreen({
  taxon,
  onClearTaxon,
  onVersion,
}: {
  taxon: Taxon | '';
  onClearTaxon: () => void;
  onVersion: (id: string) => void;
}) {
  const [data, setData] = useState<CatalogPage | null>(null),
    [page, setPage] = useState(1),
    [query, setQuery] = useState(''),
    [group, setGroup] = useState(''),
    [error, setError] = useState(''),
    [retry, setRetry] = useState(0);
  const requestKey = JSON.stringify([page, query, group, taxon, retry]);
  const [loadedKey, setLoadedKey] = useState('');
  useEffect(() => {
    const c = new AbortController();
    const timer = setTimeout(() => {
      api<CatalogPage>(
        `/catalog/items?page=${page}&limit=12&learnable=false&q=${encodeURIComponent(query)}&group=${encodeURIComponent(group)}${taxon ? `&taxon=${taxon}` : ''}`,
        undefined,
        c.signal,
      )
        .then((d) => {
          setData(d);
          setError('');
          setLoadedKey(requestKey);
          onVersion(d.releaseId);
        })
        .catch((e) => {
          if (e.name !== 'AbortError') {
            setError(e.message);
            setLoadedKey(requestKey);
          }
        });
    }, 180);
    return () => {
      clearTimeout(timer);
      c.abort();
    };
  }, [page, query, group, taxon, retry, onVersion, requestKey]);
  return (
    <>
      <div className="page-heading library-heading">
        <div>
          <p>Thủy hải sản thương mại</p>
          <h1>Thư viện loài.</h1>
          <p>Tra cứu tên gọi, dấu hiệu nhận biết và dạng hàng.</p>
        </div>
        <img
          className="library-heading-art"
          src="/media/illustrations/seafood-notebook-2d-v2.png"
          alt=""
          width="1536"
          height="1024"
        />
      </div>
      <label className="search-field">
        <input
          type="search"
          aria-label="Tìm loài theo bốn tên gọi"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(1);
          }}
          placeholder="Tên Việt, Anh, Nhật, khoa học hoặc bí danh…"
        />
      </label>
      {taxon && (
        <button className="btn secondary" onClick={onClearTaxon}>
          Bỏ lọc nhóm {groupTone(taxon).label}
        </button>
      )}
      <div className="group-filters">
        {['', 'Cá', 'Mực & bạch tuộc', 'Nghêu & vẹm'].map((g) => (
          <button
            key={g}
            aria-pressed={g === group}
            onClick={() => {
              setGroup(g);
              setPage(1);
            }}
          >
            {g || 'Tất cả nhóm'}
          </button>
        ))}
      </div>
      {loadedKey === requestKey && error ? (
        <ErrorNote message={error} retry={() => setRetry(retry + 1)} />
      ) : !data || loadedKey !== requestKey ? (
        <p role="status">Đang tải danh mục…</p>
      ) : (
        <>
          <p>
            {data.total} mục · Trang {data.page}
          </p>
          {data.items.length ? (
            <div className="library-grid">
              {data.items.map((i) => (
                <a className="library-card" href={'#profile/' + i.externalId} key={i.revisionId}>
                  <div className="pilot-catalog-image">
                    {i.media.find((m) => ['profile', 'identification'].includes(m.role)) ? (
                      <SignedImage
                        id={i.media.find((m) => ['profile', 'identification'].includes(m.role))!.id}
                        thumbnail
                      />
                    ) : (
                      <div className="pilot-media-placeholder">
                        <Fish />
                        Ảnh loài đang bổ sung
                      </div>
                    )}
                  </div>
                  <div className="pilot-card-copy">
                    <small>{i.group}</small>
                    <h2>{vi(i)}</h2>
                    <p>{i.names.find((n) => n.kind === 'en')?.label}</p>
                    <i>{i.names.find((n) => n.kind === 'scientific')?.label}</i>
                  </div>
                </a>
              ))}
            </div>
          ) : (
            <p>Không tìm thấy mục phù hợp. Thử tên khác hoặc bỏ bộ lọc.</p>
          )}
          <div className="pilot-pagination">
            <button
              className="btn secondary"
              disabled={page === 1}
              onClick={() => setPage(page - 1)}
            >
              Trang trước
            </button>
            <button
              className="btn secondary"
              disabled={page * data.limit >= data.total}
              onClick={() => setPage(page + 1)}
            >
              Trang sau
            </button>
          </div>
        </>
      )}
    </>
  );
}
