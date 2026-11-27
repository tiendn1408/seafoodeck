import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import { RotateCcw } from 'lucide-react';
import type { Game, ProgressEntry, SessionSummaryResponse } from '../../pilot/api';
import { SignedImage } from '../../pilot/Media';
import { playSfx } from '../sound/sfx';
import { MissingPhoto } from '../MissingPhoto';
import { coverPhoto } from '../SpeciesCover';
import { groupTone } from '../groups';
import { summarizeHaul, withServerDays, type HaulEntry } from './summary';
import { useCatalogItem, type SpeciesRef } from './species';

/** A skipped matching question: one neutral line, linked to no species. */
function SkippedMatchRow({ entry }: { entry: HaulEntry }) {
  return (
    <li className="haul-row haul-row-plain" data-state="skipped">
      <span className="haul-names">
        <strong>{entry.label}</strong>
      </span>
    </li>
  );
}

function CatchRow({ entry, species }: { entry: HaulEntry; species: SpeciesRef | null }) {
  const { item } = useCatalogItem(entry.kind === 'species' ? species : null, true);
  const tone = groupTone(entry.kind === 'species' ? species?.group : null);
  const name = (kind: string) => item?.names.find((n) => n.kind === kind)?.label;
  const en = name('en'),
    ja = name('ja');
  return (
    <li
      className="haul-row"
      data-state={entry.caught ? 'caught' : 'missed'}
      style={{ '--tone': tone.css } as CSSProperties}
    >
      <span className="haul-port" aria-hidden="true">
        {entry.kind === 'species' && item && coverPhoto(item) ? (
          <SignedImage id={coverPhoto(item)!.id} thumbnail />
        ) : (
          <MissingPhoto />
        )}
      </span>
      <div className="haul-names">
        <strong>{entry.label}</strong>
        {entry.kind === 'hs' ? (
          <span className="haul-sub">HS theo dạng hàng</span>
        ) : (
          (en || ja) && (
            <span className="haul-sub">
              {en && <span lang="en">{en}</span>}
              {en && ja && ' · '}
              {ja && <span lang="ja">{ja}</span>}
            </span>
          )
        )}
      </div>
      <span className="haul-note">
        <span className="cover-sr">{entry.caught ? 'Vào lưới. ' : ''}</span>
        {entry.note}
      </span>
    </li>
  );
}

/**
 * End of the haul. The deep frame keeps the float rope and the "N / M loài vào lưới" title;
 * a cold ice sheet below lists what was caught (group colour, names, next review) and what
 * slipped the net, with the session figures and the retry action.
 */
export function Summary({
  game,
  progress,
  server,
  saving,
  saveError,
  rope,
  lookup,
  onRetry,
  pending,
  bestCombo = 0,
  timedOut = false,
}: {
  game: Game;
  /** Review rows returned with this session's answers (empty for trial learners). */
  progress: ProgressEntry[];
  /** The server's summary, only fetched for a student's session re-opened after a reload. */
  server: SessionSummaryResponse | null;
  /** Self-ratings still on their way to the server. */
  saving: boolean;
  saveError: ReactNode;
  rope: ReactNode;
  lookup: (vi: string | undefined) => SpeciesRef | null;
  onRetry: () => void;
  pending: boolean;
  /** Longest run of correct graded answers in the session; shown from ×2. */
  bestCombo?: number;
  /** The image-mode clock ran out in this session: say why the open questions count as wrong. */
  timedOut?: boolean;
}) {
  // When the saving status (the focus target until then) gives way to the title, move focus
  // to the title so keyboard and screen-reader users are not left on a removed element.
  const title = useRef<HTMLHeadingElement>(null);
  // The end-of-session sound, once, when the haul is shown (not while still saving); the ref
  // holds against StrictMode's double-run mount effect.
  const doneSound = useRef(false);
  useEffect(() => {
    if (saving || doneSound.current) return;
    doneSound.current = true;
    playSfx('done');
  }, [saving]);
  const wasSaving = useRef(saving);
  useEffect(() => {
    const lost = !document.activeElement || document.activeElement === document.body;
    if (wasSaving.current && !saving && lost) title.current?.focus({ preventScroll: true });
    wasSaving.current = saving;
  }, [saving]);
  // Until every answer is confirmed the haul is not known: no title, list or retry yet.
  if (saving)
    return (
      <section className="pilot-summary haul" aria-label="Tổng kết mẻ lưới">
        <header className="haul-hero">
          {rope}
          <p className="haul-saving" role="status" tabIndex={-1} data-focus-target="">
            Đang lưu…
          </p>
        </header>
        {saveError && <div className="haul-sheet">{saveError}</div>}
      </section>
    );
  const haul = withServerDays(summarizeHaul(game, progress), server);
  const entries = [...haul.caught, ...haul.missed];
  const scores = game.questions.flatMap((q) => (q.result ? [q.result] : [])),
    answered = scores.filter((s) => s.answered && !s.selfRated),
    wrong = scores.filter((s) => s.answered && !s.correct),
    skipped = scores.filter((s) => s.skipped);
  const slipped = haul.missed.filter((m) => !m.skipped).length,
    passed = haul.missed.length - slipped;
  const lede = !haul.total
    ? 'Mẻ này chưa có câu nào được chấm.'
    : !haul.missed.length
      ? 'Cả mẻ đã vào lưới.'
      : [
          slipped && `${slipped} loài sổng lưới, ôn lại vào ngày mai.`,
          passed && `${passed} mục bỏ qua, không lên lịch ôn.`,
        ]
          .filter(Boolean)
          .join(' ');
  const retry = wrong.length > 0 || skipped.length > 0;
  return (
    <section className="pilot-summary haul" aria-labelledby="haul-title">
      <header className="haul-hero">
        {rope}
        <h1 id="haul-title" ref={title} tabIndex={-1} data-focus-target="">
          {haul.title}
        </h1>
        <p className="haul-lede">{lede}</p>
        {timedOut && (
          <p className="haul-timeout">Hết giờ: các câu chưa làm tính là chưa chính xác.</p>
        )}
      </header>
      <div className="haul-sheet">
        {saveError}
        {entries.length > 0 && (
          <div className="haul-catch">
            <ul className="haul-list" aria-label="Các loài trong mẻ">
              {entries.map((e) =>
                e.kind === 'matching' ? (
                  <SkippedMatchRow key={e.targetId} entry={e} />
                ) : (
                  <CatchRow
                    key={e.targetId}
                    entry={e}
                    species={e.kind === 'species' ? lookup(e.label) : null}
                  />
                ),
              )}
            </ul>
          </div>
        )}
        <div className="haul-session">
          <h2 className="haul-heading">Tổng kết lượt học</h2>
          <dl className="haul-figures">
            <div>
              <dt>Câu đã trả lời</dt>
              <dd>{answered.length}</dd>
            </div>
            <div>
              <dt>Đúng lần đầu</dt>
              <dd>
                {answered.length
                  ? Math.round((answered.filter((s) => s.correct).length / answered.length) * 100) +
                    '%'
                  : '—'}
              </dd>
            </div>
            <div>
              <dt>Câu bỏ qua</dt>
              <dd>{skipped.length}</dd>
            </div>
          </dl>
          {bestCombo >= 2 && <p className="haul-combo">Combo cao nhất: ×{bestCombo}</p>}
          <p className="haul-fineprint">
            {scores.filter((s) => s.selfRated).length} thẻ tự đánh giá · không cộng vào tỷ lệ chấm
            tự động.
          </p>
          {!answered.length && (
            <p className="haul-fineprint">Chưa có câu chấm tự động được trả lời.</p>
          )}
          <div className="haul-actions">
            {retry && (
              <button className="btn primary" disabled={pending || !!saveError} onClick={onRetry}>
                <RotateCcw size={18} aria-hidden="true" />
                Ôn lỗi và câu bỏ qua
              </button>
            )}
            <a href="#home" className={'btn ' + (retry ? 'secondary' : 'primary')}>
              Về học tập
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
