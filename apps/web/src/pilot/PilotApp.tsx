import { useEffect, useState } from 'react';
import { BookOpen, Library, ArrowRight, Fish, Tags, ScanLine, PackageCheck } from 'lucide-react';
import {
  api,
  setCsrf,
  readLocal,
  writeLocal,
  vi,
  type AuthView,
  type CatalogPage,
  type CatalogItem,
  type Game,
  type ApiQuestion,
  type Score,
  type Reveal,
} from './api';
import { SignedImage, Pronunciation, stopAudio, MediaCredit } from './Media';
import { Admin } from './Admin';
import { AppShell } from '../learner/AppShell';
import { ErrorNote } from '../learner/ErrorNote';
import { Login } from '../learner/Login';
import {
  LEDGER_KEY,
  loadLedger,
  skillLabel,
  mergeScore,
  mergeGame,
  type Ledger,
} from '../learner/ledger';
const modeNames: Record<string, string> = {
  flashcard: 'Flashcard tên loài',
  match: 'Ghép tên thương mại',
  image: 'Đoán hình nguyên liệu',
  hs: 'HS theo dạng hàng',
};
const icons = { flashcard: BookOpen, match: Tags, image: ScanLine, hs: PackageCheck };
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
    [version, setVersion] = useState('');
  useEffect(() => {
    const f = () => {
      setRoute(currentRoute());
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
      tone="ice"
      staff={!!staff}
      internal={!!auth?.internal}
      signedIn={signedIn}
      onLogout={logout}
    >
      <div className={`content home-content ${route === 'study' ? 'pilot-study-content' : ''}`}>
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
            {['home', 'library'].includes(route) && (
              <CatalogScreen
                key={route}
                home={route === 'home'}
                onVersion={setVersion}
                onStart={start}
                pending={pending}
                onResume={ledger.sessionId ? resume : undefined}
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
                  onChange={setGame}
                  onRecord={record}
                  onRetry={() => start('review', undefined, 'en', game.id)}
                  pending={pending}
                />
              ) : (
                <p role="status">
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
  home,
  onVersion,
  onStart,
  pending,
  onResume,
}: {
  home: boolean;
  onVersion: (id: string) => void;
  onStart: (mode: string, revisionId?: string, kind?: string) => Promise<void>;
  pending: boolean;
  onResume?: () => Promise<void>;
}) {
  const [data, setData] = useState<CatalogPage | null>(null),
    [page, setPage] = useState(1),
    [query, setQuery] = useState(''),
    [group, setGroup] = useState(''),
    [error, setError] = useState(''),
    [retry, setRetry] = useState(0),
    [revision, setRevision] = useState(''),
    [kind, setKind] = useState('en');
  const requestKey = JSON.stringify([home, page, query, group, retry]);
  const [loadedKey, setLoadedKey] = useState('');
  useEffect(() => {
    const c = new AbortController();
    const timer = setTimeout(
      () => {
        api<CatalogPage>(
          `/catalog/items?page=${page}&limit=${home ? 6 : 12}&learnable=${home}&q=${encodeURIComponent(query)}&group=${encodeURIComponent(group)}`,
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
      },
      home ? 0 : 180,
    );
    return () => {
      clearTimeout(timer);
      c.abort();
    };
  }, [home, page, query, group, retry, onVersion, requestKey]);
  if (home)
    return (
      <>
        <section className="trade-intro">
          <div className="trade-intro-copy">
            <span className="course-label">Thủy hải sản thương mại</span>
            <h1>
              Hiểu loài.
              <br />
              Đọc đúng hàng.
            </h1>
            <p>Tên thương mại, nhận diện nguyên liệu và quy cách lô hàng.</p>
            <div className="trade-pillars">
              <span>Tên Việt · Anh · Nhật · Khoa học</span>
            </div>
          </div>
          <div className="trade-intro-art" aria-hidden="true">
            <img
              src="/media/illustrations/seafood-assortment-2d-v2.png"
              alt=""
              width="1536"
              height="1024"
            />
          </div>
        </section>
        <nav className="family-nav" aria-label="Nhóm hàng">
          <a href="#library">Cá thịt trắng / đỏ</a>
          <a href="#library">Mực & bạch tuộc</a>
          <a href="#library">Nghêu & vẹm</a>
        </nav>
        {onResume && (
          <button className="btn secondary" disabled={pending} onClick={() => void onResume()}>
            Tiếp tục phiên học
          </button>
        )}
        <h2 className="pilot-section-title">Luyện nghiệp vụ</h2>
        {loadedKey === requestKey && error ? (
          <ErrorNote message={error} retry={() => setRetry(retry + 1)} />
        ) : !data || loadedKey !== requestKey ? (
          <p role="status">Đang tải danh mục từ máy chủ…</p>
        ) : !data.items.length ? (
          <p>Chưa có mục học trong bộ đã xuất bản.</p>
        ) : (
          <>
            <div className="learning-selection">
              <label>
                <span>Loài học tên</span>
                <select
                  aria-label="Chọn loài học tên"
                  value={revision || data.items[0].revisionId}
                  onChange={(e) => setRevision(e.target.value)}
                >
                  {data.items.map((i) => (
                    <option key={i.revisionId} value={i.revisionId}>
                      {vi(i)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Hướng ghép tên</span>
                <select
                  aria-label="Chọn hướng ghép tên"
                  value={kind}
                  onChange={(e) => setKind(e.target.value)}
                >
                  <option value="en">Việt → Anh</option>
                  <option value="ja">Việt → Nhật</option>
                  <option value="scientific">Việt → Khoa học</option>
                </select>
              </label>
            </div>
            {data.items.filter((i) =>
              i.media.some(
                (m) =>
                  m.role === 'pronunciation' &&
                  m.nameKind === kind &&
                  (data.internal || m.approved),
              ),
            ).length >= 3 && (
              <button
                className="btn secondary"
                disabled={pending}
                onClick={() =>
                  void onStart('listening', revision || data.items[0].revisionId, kind)
                }
              >
                Nghe và chọn tên
              </button>
            )}
            <div className="mode-grid">
              {Object.entries(modeNames).map(([mode, label]) => {
                const Icon = icons[mode as keyof typeof icons];
                return (
                  <button
                    className="mode-card"
                    key={mode}
                    disabled={pending}
                    onClick={() => void onStart(mode, revision || data.items[0].revisionId, kind)}
                  >
                    <div className="mode-visual">
                      <Icon size={25} />
                    </div>
                    <div className="mode-copy">
                      <h2>{label}</h2>
                      <p>
                        {mode === 'hs'
                          ? 'Đối chiếu quy cách, nhận biết dữ kiện còn thiếu.'
                          : mode === 'image'
                            ? '3 ảnh khác gốc. Có thể bỏ qua ảnh lỗi.'
                            : mode === 'match'
                              ? 'Ghép 3 cặp bằng chạm hoặc bàn phím.'
                              : 'Tên Anh, Nhật và khoa học của một loài.'}
                      </p>
                      <div className="mode-footer">
                        <span>
                          {mode === 'match' ? '3 cặp' : mode === 'hs' ? '3 hồ sơ' : '3 câu'}
                        </span>
                        <ArrowRight size={17} />
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </>
        )}
        <a className="library-entry" href="#library">
          <Library size={24} />
          <span>
            <strong>Sổ tay thủy hải sản</strong>
            <small>Tra cứu nguồn, nhận diện và dạng hàng</small>
          </span>
          <ArrowRight size={17} />
        </a>
      </>
    );
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
function Profile({
  id,
  internal,
  onStart,
}: {
  id: string;
  internal: boolean;
  onStart: (mode: string, id: string) => Promise<void>;
}) {
  const [item, setItem] = useState<CatalogItem | null>(null),
    [error, setError] = useState('');
  useEffect(() => {
    api<CatalogItem>('/catalog/items/' + id)
      .then(setItem)
      .catch((e) => setError(e.message));
  }, [id]);
  if (error) return <ErrorNote message={error} />;
  if (!item) return <p role="status">Đang tải hồ sơ…</p>;
  const photo = item.media.find((m) => ['profile', 'identification'].includes(m.role));
  return (
    <>
      <a href="#library" className="pilot-text-button">
        Về thư viện
      </a>
      <h1>{vi(item)}.</h1>
      <p>
        {item.group} · {item.sku}
      </p>
      <div className="specimen-record">
        <div className="pilot-profile-image">
          {photo ? <SignedImage id={photo.id} alt={vi(item)} /> : <p>Ảnh loài đang bổ sung.</p>}
        </div>
        <div>
          <h2>Dấu hiệu nhận biết</h2>
          <p>{item.identification || 'Chưa có mô tả được duyệt.'}</p>
          <h3>Dạng hàng tham khảo</h3>
          <p>{item.forms.join(' · ') || 'Chưa có dữ liệu quy cách.'}</p>
          <p>{item.note}</p>
        </div>
      </div>
      {photo && <MediaCredit id={photo.id} />}
      <div className="pilot-name-grid">
        {item.names.map((n) => (
          <section key={n.kind}>
            <small>
              {n.kind === 'en'
                ? 'Tiếng Anh'
                : n.kind === 'ja'
                  ? 'Tiếng Nhật'
                  : n.kind === 'scientific'
                    ? 'Tên khoa học'
                    : 'Tiếng Việt'}
            </small>
            <h2>{n.label}</h2>
            <p>{n.pronunciation || 'Hướng dẫn đọc đang bổ sung.'}</p>
            {n.kind !== 'vi' && (
              <Pronunciation
                id={
                  item.media.find(
                    (m) =>
                      m.role === 'pronunciation' &&
                      m.nameKind === n.kind &&
                      (internal || m.approved),
                  )?.id
                }
              />
            )}
            <details>
              <summary>Nguồn tên gọi</summary>
              <p>{n.source}</p>
            </details>
          </section>
        ))}
      </div>
      <button className="btn primary" onClick={() => void onStart('flashcard', item.revisionId)}>
        Chỉ học flashcard · 3 thẻ
      </button>
      <a className="btn secondary" href="#home">
        Xem HS theo dạng hàng
      </a>
    </>
  );
}
function Study({
  game,
  onChange,
  onRecord,
  onRetry,
  pending,
}: {
  game: Game;
  onChange: (g: Game) => void;
  onRecord: (s: Score, g: Game) => void;
  onRetry: () => void;
  pending: boolean;
}) {
  const [cursor, setCursor] = useState(() =>
    game.questions.findIndex((q) => !q.result) < 0
      ? game.questions.length
      : game.questions.findIndex((q) => !q.result),
  );
  const q = game.questions[cursor];
  if (!q) {
    const scores = game.questions.flatMap((q) => (q.result ? [q.result] : [])),
      answered = scores.filter((s) => s.answered && !s.selfRated),
      wrong = scores.filter((s) => s.answered && !s.correct),
      skipped = scores.filter((s) => s.skipped);
    return (
      <section className="pilot-summary">
        <h1>Tổng kết lượt học</h1>
        <div className="stats-grid">
          <div className="stat-card">
            <strong>{answered.length}</strong>
            <span>Câu đã trả lời</span>
          </div>
          <div className="stat-card">
            <strong>
              {answered.length
                ? Math.round((answered.filter((s) => s.correct).length / answered.length) * 100) +
                  '%'
                : '—'}
            </strong>
            <span>Đúng lần đầu</span>
          </div>
          <div className="stat-card">
            <strong>{skipped.length}</strong>
            <span>Câu bỏ qua</span>
          </div>
        </div>
        <p>
          {scores.filter((s) => s.selfRated).length} thẻ tự đánh giá · không cộng vào tỷ lệ chấm tự
          động.
        </p>
        {!answered.length && <p>Chưa có câu chấm tự động được trả lời.</p>}
        {(wrong.length > 0 || skipped.length > 0) && (
          <button className="btn primary" disabled={pending} onClick={onRetry}>
            Ôn lỗi và câu bỏ qua
          </button>
        )}
        <a href="#home" className="btn secondary">
          Về học tập
        </a>
      </section>
    );
  }
  return (
    <QuestionView
      key={q.id}
      game={game}
      q={q}
      index={cursor}
      onScore={(s) => {
        onRecord(s, game);
        onChange({
          ...game,
          questions: game.questions.map((x) => (x.id === q.id ? { ...x, result: s } : x)),
        });
      }}
      onNext={() => {
        stopAudio();
        setCursor(cursor + 1);
      }}
      onRefresh={async () => {
        const fresh = await api<Game>('/learning/sessions/' + game.id);
        onChange(fresh);
        return fresh.questions.find((x) => x.id === q.id);
      }}
    />
  );
}
function QuestionView({
  game,
  q,
  index,
  onScore,
  onNext,
  onRefresh,
}: {
  game: Game;
  q: ApiQuestion;
  index: number;
  onScore: (s: Score) => void;
  onNext: () => void;
  onRefresh: () => Promise<ApiQuestion | undefined>;
}) {
  const draftKey = `seafood-deck:draft:${game.id}:${q.id}`;
  const [draft, setDraft] = useState(() =>
    readLocal<{
      optionId?: string;
      followUpId?: string;
      pairs?: Record<string, string>;
      flipped?: boolean;
    }>(draftKey, {}),
  );
  const [reveal, setReveal] = useState<Reveal | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [left, setLeft] = useState(''),
    [image, setImage] = useState(q.image?.url),
    [broken, setBroken] = useState(q.unavailable),
    [refreshed, setRefreshed] = useState(false);
  const [imageGeneration, setImageGeneration] = useState(0);
  const tokenKey = draftKey + ':key';
  const [token] = useState(() => readLocal(tokenKey, '') || crypto.randomUUID());
  useEffect(() => {
    writeLocal(tokenKey, token);
  }, [token, tokenKey]);
  async function flip() {
    try {
      setReveal(await api<Reveal>(`/learning/sessions/${game.id}/questions/${q.id}/reveal`, {}));
      update({ ...draft, flipped: true });
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    if (!draft.flipped || q.type !== 'flashcard') return;
    let alive = true;
    api<Reveal>(`/learning/sessions/${game.id}/questions/${q.id}/reveal`, {})
      .then((r) => {
        if (alive) setReveal(r);
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, [draft.flipped, q.type, q.id, game.id]);
  function update(next: typeof draft) {
    setDraft(next);
    writeLocal(draftKey, next);
  }
  async function submit(answer: unknown) {
    if (busy || q.result) return;
    setBusy(true);
    setError('');
    try {
      const score = await api<Score>(`/learning/sessions/${game.id}/questions/${q.id}/attempts`, {
        key: token,
        answer,
      });
      onScore(score);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const done = !!q.result;
  return (
    <section className={'pilot-question ' + (q.type === 'flashcard' ? 'pilot-flash' : '')}>
      <div className="pilot-question-top">
        <span>{modeNames[q.type] || (q.type === 'listening' ? 'Nghe và chọn tên' : 'Ôn tập')}</span>
        <span>
          Câu {index + 1} / {game.questions.length}
        </span>
        <a href="#home">Tạm dừng</a>
      </div>
      {error && <ErrorNote message={error} />}
      <div className="pilot-question-body">
        <p className="pilot-question-meta">{q.catalog}</p>
        <h1>{q.prompt}</h1>
        {q.type === 'flashcard' ? (
          <>
            <div className="pilot-flash-face">
              <p>{q.front}</p>
              {reveal ? (
                <>
                  <h2>{reveal.label}</h2>
                  <p>{reveal.pronunciation || 'Hướng dẫn đọc đang bổ sung.'}</p>
                  <Pronunciation
                    initialUrl={reveal.audio?.url}
                    onRefresh={async () => {
                      const fresh = await api<Reveal>(
                        `/learning/sessions/${game.id}/questions/${q.id}/reveal`,
                        {},
                      );
                      return fresh.audio?.url;
                    }}
                  />
                </>
              ) : (
                <button className="pilot-flip" onClick={() => void flip()}>
                  Chạm để lật thẻ
                </button>
              )}
            </div>
            {reveal && !done && (
              <div className="pilot-actions">
                <button
                  className="btn secondary"
                  disabled={busy}
                  onClick={() => void submit({ rating: 'again' })}
                >
                  Cần ôn
                </button>
                <button
                  className="btn primary"
                  disabled={busy}
                  onClick={() => void submit({ rating: 'known' })}
                >
                  Đã nhớ
                </button>
              </div>
            )}
          </>
        ) : (
          <>
            {q.type === 'listening' && (
              <Pronunciation
                initialUrl={q.audio?.url}
                onRefresh={async () => {
                  const fresh = await onRefresh();
                  return fresh?.audio?.url;
                }}
              />
            )}
            {q.type === 'image' && (
              <div className="pilot-quiz-image">
                {broken || !image ? (
                  <div className="pilot-media-placeholder">
                    <p>Ảnh chưa tải được hoặc đã thu hồi.</p>
                    <button
                      className="btn secondary"
                      onClick={() =>
                        void onRefresh()
                          .then((f) => {
                            setImage(f?.image?.url);
                            setImageGeneration((n) => n + 1);
                            setBroken(!f?.image);
                            setRefreshed(false);
                          })
                          .catch((e) => setError(e.message))
                      }
                    >
                      Thử tải lại
                    </button>
                  </div>
                ) : (
                  <img
                    key={imageGeneration}
                    src={image}
                    alt="Mẫu nguyên liệu cần nhận diện"
                    width="640"
                    height="420"
                    onError={() => {
                      if (!refreshed) {
                        setRefreshed(true);
                        void onRefresh()
                          .then((f) => {
                            setImage(f?.image?.url);
                            setImageGeneration((n) => n + 1);
                            if (!f?.image) setBroken(true);
                          })
                          .catch(() => setBroken(true));
                      } else setBroken(true);
                    }}
                  />
                )}
              </div>
            )}
            {q.type === 'match' ? (
              <div className="pilot-match">
                <div>
                  {q.left?.map((o) => (
                    <button
                      key={o.id}
                      className={'pilot-option ' + (left === o.id ? 'selected' : '')}
                      disabled={done}
                      aria-pressed={left === o.id}
                      onClick={() => setLeft(o.id)}
                    >
                      {o.label}
                      {draft.pairs?.[o.id] && (
                        <small>{q.right?.find((r) => r.id === draft.pairs![o.id])?.label}</small>
                      )}
                    </button>
                  ))}
                </div>
                <div>
                  {q.right?.map((o) => (
                    <button
                      key={o.id}
                      className="pilot-option"
                      disabled={done || !left}
                      onClick={() => {
                        const pairs = { ...draft.pairs };
                        for (const [l, r] of Object.entries(pairs)) if (r === o.id) delete pairs[l];
                        pairs[left] = o.id;
                        update({ ...draft, pairs });
                        setLeft('');
                      }}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="pilot-options">
                {q.options?.map((o) => (
                  <button
                    key={o.id}
                    className={'pilot-option ' + (draft.optionId === o.id ? 'selected' : '')}
                    aria-pressed={draft.optionId === o.id}
                    disabled={done}
                    onClick={() => update({ ...draft, optionId: o.id })}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            )}
            {q.followUps?.length && !done ? (
              <label className="select-label">
                Nếu chọn “Chưa đủ thông tin”, cần hỏi gì?
                <select
                  aria-label="Dữ kiện cần hỏi thêm"
                  value={draft.followUpId ?? ''}
                  onChange={(e) => update({ ...draft, followUpId: e.target.value })}
                >
                  <option value="">Chọn dữ kiện</option>
                  {q.followUps.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {!done && (
              <div className="pilot-actions">
                <button
                  className="btn primary"
                  disabled={
                    busy ||
                    (q.type === 'match'
                      ? Object.keys(draft.pairs ?? {}).length !== q.left?.length
                      : !draft.optionId) ||
                    (q.type === 'image' && broken)
                  }
                  onClick={() =>
                    void submit(
                      q.type === 'match'
                        ? { pairs: draft.pairs }
                        : {
                            optionId: draft.optionId,
                            ...(draft.followUpId ? { followUpId: draft.followUpId } : {}),
                          },
                    )
                  }
                >
                  Nộp câu trả lời
                </button>
                {['image', 'listening'].includes(q.type) && (
                  <button
                    className="btn secondary"
                    disabled={busy}
                    onClick={() => void submit({ skip: true })}
                  >
                    {q.type === 'listening' ? 'Bỏ qua bản thu' : 'Bỏ qua ảnh'}
                  </button>
                )}
              </div>
            )}
          </>
        )}
        {q.result && (
          <div className="pilot-feedback" role="status">
            <strong>
              {q.result.skipped
                ? 'Đã bỏ qua'
                : q.result.selfRated
                  ? 'Đã lưu tự đánh giá'
                  : q.result.correct
                    ? 'Chính xác'
                    : 'Chưa chính xác'}
            </strong>
            {!q.result.selfRated && <p>{q.result.explanation}</p>}
            {q.result.correctOption && (
              <p>Đáp án: {q.options?.find((o) => o.id === q.result!.correctOption)?.label}</p>
            )}
            {q.result.correctPairs && (
              <ul>
                {Object.entries(q.result.correctPairs).map(([l, r]) => (
                  <li key={l}>
                    {q.left?.find((o) => o.id === l)?.label} —{' '}
                    {q.right?.find((o) => o.id === r)?.label}
                  </li>
                ))}
              </ul>
            )}
            {q.result.source && (
              <details>
                <summary>Nguồn và ghi công</summary>
                <p>{q.result.source}</p>
              </details>
            )}
          </div>
        )}
      </div>
      {done && (
        <div className="pilot-question-next">
          <button
            className="btn primary"
            onClick={(e) => {
              if (e.detail > 1) return;
              onNext();
            }}
          >
            {index === game.questions.length - 1 ? 'Xem tổng kết' : 'Tiếp tục'}
            <ArrowRight size={17} />
          </button>
        </div>
      )}
    </section>
  );
}
