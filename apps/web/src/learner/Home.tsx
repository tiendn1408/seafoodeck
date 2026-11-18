import { useEffect, useState, type CSSProperties } from 'react';
import { ArrowRight, BookOpen, Library, PackageCheck, ScanLine, Tags } from 'lucide-react';
import {
  api,
  type CatalogItem,
  type CatalogOverview,
  type CatalogPage,
  type Game,
} from '../pilot/api';
import { ErrorNote } from './ErrorNote';
import { FloatRope, type RopeFloat } from './FloatRope';
import { GroupEntry } from './GroupEntry';
import { SpeciesCard } from './SpeciesCard';
import { groupTone, pickHaul, planCast, skillProgress, type GroupKey } from './haul';
import type { Ledger } from './ledger';
import { useMedia } from './useMedia';
import './home.css';

type Target = { targetId: string; skill: string };
export type StartSession = (
  mode: string,
  revisionId?: string,
  kind?: string,
  reviewOf?: string,
  reviewTargets?: Target[],
) => Promise<void>;
export type Taxon = Exclude<GroupKey, 'none'>;

const modes = [
  {
    mode: 'flashcard',
    label: 'Flashcard tên loài',
    note: 'Tên Anh, Nhật và khoa học của một loài.',
    count: '3 câu',
    Icon: BookOpen,
  },
  {
    mode: 'match',
    label: 'Ghép tên thương mại',
    note: 'Ghép 3 cặp bằng chạm hoặc bàn phím.',
    count: '3 cặp',
    Icon: Tags,
  },
  {
    mode: 'image',
    label: 'Đoán hình nguyên liệu',
    note: '3 ảnh khác gốc. Có thể bỏ qua ảnh lỗi.',
    count: '3 câu',
    Icon: ScanLine,
  },
  {
    mode: 'hs',
    label: 'HS theo dạng hàng',
    note: 'Đối chiếu quy cách, nhận biết dữ kiện còn thiếu.',
    count: '3 hồ sơ',
    Icon: PackageCheck,
  },
] as const;
const taxa: Taxon[] = ['fish', 'crustacean', 'mollusc', 'other'];
const skillColor: Record<string, string> = {
  en: 'var(--deep-accent)',
  ja: 'var(--group-crustacean)',
  scientific: 'var(--group-mollusc)',
  hs: 'var(--action)',
};

/** True while the tab is hidden, so ambient motion can stop. */
function usePageHidden() {
  const [hidden, setHidden] = useState(
    () => typeof document !== 'undefined' && document.visibilityState === 'hidden',
  );
  useEffect(() => {
    const update = () => setHidden(document.visibilityState === 'hidden');
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);
  return hidden;
}

export function Home({
  ledger,
  now,
  pending,
  onStart,
  onResume,
  onVersion,
  onOpenLibrary,
}: {
  ledger: Ledger;
  now: number;
  pending: boolean;
  onStart: StartSession;
  onResume?: () => Promise<void>;
  onVersion: (releaseId: string) => void;
  onOpenLibrary: (taxon: Taxon | '') => void;
}) {
  const [overview, setOverview] = useState<CatalogOverview | null>(null),
    [error, setError] = useState(''),
    [retry, setRetry] = useState(0),
    [game, setGame] = useState<Game | null>(null),
    [audioItems, setAudioItems] = useState<CatalogItem[]>([]),
    [revision, setRevision] = useState(''),
    [kind, setKind] = useState('en');
  const hidden = usePageHidden();
  const wide = useMedia('(min-width: 900px)');
  const roomy = useMedia('(min-width: 600px)');

  useEffect(() => {
    const c = new AbortController();
    api<CatalogOverview>('/catalog/overview', undefined, c.signal)
      .then((o) => {
        setOverview(o);
        setError('');
        onVersion(o.releaseId);
      })
      .catch((e) => {
        if (e.name !== 'AbortError') setError(e.message);
      });
    return () => c.abort();
  }, [retry, onVersion]);

  // Pronunciation media is not part of the overview; only "Nghe và chọn tên" needs it.
  useEffect(() => {
    const c = new AbortController();
    api<CatalogPage>('/catalog/items?learnable=true&limit=50', undefined, c.signal)
      .then((d) => setAudioItems(d.items))
      .catch(() => {});
    return () => c.abort();
  }, []);

  // Draw the rope from the unfinished session, fetched once per session id.
  const sessionId = ledger.sessionId;
  useEffect(() => {
    if (!sessionId) return;
    let alive = true;
    api<Game>(`/learning/sessions/${sessionId}`)
      .then((g) => {
        if (alive) setGame(g);
      })
      .catch(() => {
        if (alive) setGame(null);
      });
    return () => {
      alive = false;
    };
  }, [sessionId]);

  const reviews = Object.values(ledger.reviews);
  const loading = !overview && !error;
  const haul = overview ? pickHaul(overview, reviews, now) : [];
  const plan = overview ? planCast(overview, reviews, now) : null;
  const shown = wide ? 5 : roomy ? 3 : 2;
  const groupOf = new Map(
    overview?.items.map((i) => [i.itemId, groupTone(i.taxonomicGroup).key]) ?? [],
  );
  const session = sessionId && game?.id === sessionId ? game : null;
  const rope: { total: number; done: RopeFloat[] } = session
    ? {
        total: session.questions.length,
        done: session.questions.flatMap((q, index) =>
          q.result
            ? [
                {
                  index,
                  group: groupOf.get(q.result.targetId) ?? 'none',
                  correct: q.result.correct && !q.result.skipped,
                },
              ]
            : [],
        ),
      }
    : { total: 5, done: [] };
  const answered = rope.done.length;
  const ropeCaption = !session
    ? 'Mẻ chờ thả · Thả lưới để bắt đầu'
    : answered < rope.total
      ? `Mẻ đang kéo · đã làm ${answered} / ${rope.total} câu`
      : `Mẻ vừa kéo · đúng ${rope.done.filter((d) => d.correct).length} / ${rope.total} câu`;

  const firstRevision = overview?.items[0]?.revisionId ?? '';
  const chosen = revision || firstRevision;
  const listening =
    audioItems.filter((i) =>
      i.media.some(
        (m) =>
          m.role === 'pronunciation' && m.nameKind === kind && (overview?.internal || m.approved),
      ),
    ).length >= 3;

  function cast() {
    if (plan?.kind === 'review') void onStart('review', undefined, 'en', undefined, plan.targets);
    else if (plan?.kind === 'flashcard') void onStart('flashcard', plan.revisionId, 'en');
  }
  const nextName =
    plan?.kind === 'flashcard'
      ? overview?.items.find((i) => i.revisionId === plan.revisionId)?.vi
      : undefined;
  const minutes = plan?.kind === 'review' ? Math.max(2, Math.ceil(plan.targets.length / 2)) : 2;

  return (
    <div className={`home${hidden ? ' paused' : ''}`}>
      <div className="home-rays" aria-hidden="true">
        <div />
      </div>

      <section className="home-hero" aria-labelledby="home-title">
        {loading ? (
          <>
            <div className="home-title">
              <p role="status" className="home-sr">
                Đang tải mẻ lưới hôm nay…
              </p>
              <div className="home-ghost home-ghost-title" aria-hidden="true" />
              <div className="home-ghost home-ghost-line" aria-hidden="true" />
            </div>
            <div className="home-action" aria-hidden="true">
              <div className="home-ghost home-ghost-button" />
            </div>
            <div className="home-catch" data-count={shown} aria-hidden="true">
              {Array.from({ length: shown }, (_, i) => (
                <div
                  key={i}
                  className="home-catch-slot home-ghost home-ghost-card"
                  style={{ '--i': i } as CSSProperties}
                />
              ))}
            </div>
          </>
        ) : error ? (
          <div className="home-title">
            <h1 id="home-title">Chưa kéo được mẻ lưới hôm nay.</h1>
            <ErrorNote message={error} retry={() => setRetry((n) => n + 1)} />
          </div>
        ) : overview && !overview.items.length ? (
          <div className="home-title home-empty">
            <h1 id="home-title">Bộ nội dung này chưa có loài để học.</h1>
            <p className="home-sub">
              Khi loài đủ bốn tên gọi được xuất bản, mẻ lưới hôm nay sẽ hiện ở đây.
            </p>
          </div>
        ) : plan?.kind === 'done' ? (
          <>
            <div className="home-title">
              <h1 id="home-title">Mẻ hôm nay đã xong.</h1>
              <p className="home-sub">
                Mọi loài đã vào lịch ôn. Quay lại khi có mục đến hạn, hoặc luyện thêm ngay.
              </p>
            </div>
            <div className="home-action home-done">
              <button
                type="button"
                className="home-cast"
                disabled={pending}
                onClick={() => void onStart('match', firstRevision, 'en')}
              >
                Luyện ghép tên
                <ArrowRight size={20} aria-hidden="true" />
              </button>
              <a className="home-secondary" href="#library">
                <Library size={18} aria-hidden="true" />
                Mở thư viện
              </a>
            </div>
          </>
        ) : (
          <>
            <div className="home-title">
              <h1 id="home-title">
                Mẻ lưới hôm nay:{' '}
                <span className="home-count">
                  {haul.length || (plan?.kind === 'review' ? plan.targets.length : 0)}{' '}
                  {haul.length ? 'loài' : 'mục'}
                </span>{' '}
                đang chờ
              </h1>
              <p className="home-sub">Tên Việt · Anh · Nhật · khoa học, khoảng {minutes} phút.</p>
            </div>
            <div className="home-action">
              <button type="button" className="home-cast" disabled={pending} onClick={cast}>
                Thả lưới
                <ArrowRight size={22} aria-hidden="true" />
              </button>
              <p className="home-hint">
                {plan?.kind === 'review'
                  ? `Ôn ${plan.targets.length} mục đến hạn trước`
                  : nextName
                    ? `Bắt đầu với ${nextName}`
                    : null}
              </p>
            </div>
          </>
        )}
        {onResume && (
          <div className="home-resume">
            <button
              type="button"
              className="home-secondary"
              disabled={pending}
              onClick={() => void onResume()}
            >
              Tiếp tục phiên học
            </button>
          </div>
        )}
        {!loading && haul.length > 0 && (
          <div className="home-catch" data-count={Math.min(shown, haul.length)}>
            {haul.slice(0, shown).map((item, i) => (
              <SpeciesCard
                key={item.revisionId}
                item={item}
                variant="float"
                style={{ '--i': i } as CSSProperties}
              />
            ))}
          </div>
        )}
        {(!overview || overview.items.length > 0) && (
          <div className="home-rope">
            <p className="home-rope-caption">{ropeCaption}</p>
            <FloatRope total={rope.total} done={rope.done} />
          </div>
        )}
      </section>

      {overview && overview.items.length > 0 && (
        <section className="home-band home-skills" aria-labelledby="skills-title">
          <h2 id="skills-title">Bốn kỹ năng của bạn</h2>
          <ul>
            {skillProgress(overview, reviews).map((s) => (
              <li key={s.key}>
                <span className="home-skill-name">{s.label}</span>
                <span className="home-skill-count">
                  {s.done} / {s.total} {s.key === 'hs' ? 'hồ sơ' : 'loài'}
                </span>
                <span className="home-bar" aria-hidden="true">
                  <i
                    style={
                      {
                        '--fill': s.total ? s.done / s.total : 0,
                        '--bar': skillColor[s.key],
                      } as CSSProperties
                    }
                  />
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="home-band home-practice" aria-labelledby="practice-title">
        <div className="home-practice-head">
          <h2 id="practice-title">Luyện nghiệp vụ</h2>
          {overview && overview.items.length > 0 && (
            <div className="home-pickers">
              <label>
                <span>Loài học tên</span>
                <select
                  aria-label="Chọn loài học tên"
                  value={chosen}
                  onChange={(e) => setRevision(e.target.value)}
                >
                  {overview.items.map((i) => (
                    <option key={i.revisionId} value={i.revisionId}>
                      {i.vi}
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
          )}
        </div>
        {loading ? (
          <p role="status" className="home-muted">
            Đang tải danh mục từ máy chủ…
          </p>
        ) : !overview ? (
          <p className="home-muted">Tải lại mẻ lưới ở trên để mở các chế độ luyện.</p>
        ) : !overview.items.length ? (
          <p className="home-muted">Chưa có mục học trong bộ đã xuất bản.</p>
        ) : (
          <>
            <div className="home-modes">
              {modes.map(({ mode, label, note, count, Icon }) => (
                <button
                  type="button"
                  className="home-mode"
                  key={mode}
                  disabled={pending}
                  onClick={() => void onStart(mode, chosen, kind)}
                >
                  <span className="home-mode-icon">
                    <Icon size={22} aria-hidden="true" />
                  </span>
                  <span className="home-mode-name">{label}</span>
                  <span className="home-mode-note">{note}</span>
                  <span className="home-mode-count">
                    {count}
                    <ArrowRight size={16} aria-hidden="true" />
                  </span>
                </button>
              ))}
            </div>
            {listening && (
              <button
                type="button"
                className="home-secondary"
                disabled={pending}
                onClick={() => void onStart('listening', chosen, kind)}
              >
                Nghe và chọn tên
              </button>
            )}
          </>
        )}
      </section>

      {overview && overview.items.length > 0 && (
        <section className="home-band home-groups" aria-labelledby="groups-title">
          <h2 id="groups-title">Thư viện theo nhóm</h2>
          <div className="home-group-grid">
            {taxa.map((t) => (
              <GroupEntry key={t} group={t} count={overview.groups[t]} onOpen={onOpenLibrary} />
            ))}
          </div>
          <p className="home-muted">
            {overview.groups.none > 0 && `${overview.groups.none} loài học được chưa gắn nhóm. `}
            <a href="#library" onClick={() => onOpenLibrary('')}>
              Xem cả thư viện
            </a>
          </p>
        </section>
      )}
      <div className="home-floor" aria-hidden="true" />
    </div>
  );
}
