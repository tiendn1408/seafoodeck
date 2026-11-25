import { RotateCcw } from 'lucide-react';
import { INTERVAL_DAYS } from '../domain/review';
import type { CatalogOverview, MeMastery, MeReview, MeReviewEntry } from '../pilot/api';
import { SignedImage } from '../pilot/Media';
import { ErrorNote } from './ErrorNote';
import type { StartSession } from './Home';
import { MasteryScales, type MasteryLevel } from './MasteryScales';
import { MissingPhoto } from './MissingPhoto';
import { SpeciesCard } from './SpeciesCard';
import { skillLabel } from './skillLabel';
import { ME_SOURCE, useMe, type LearnerSource } from './meStore';
import { ignoreVersion, useOverview } from './useOverview';
import './library.css';

const STEPS = INTERVAL_DAYS;
const day = (iso: string) => {
  const t = new Date(iso);
  return Number.isNaN(t.getTime()) ? '—' : t.toLocaleDateString('vi-VN');
};
const MAX_BATCH = 30;

/** Entries of one species (or one HS case), in due order. Rows without a catalog item stay apart. */
function byTarget(rows: MeReviewEntry[]) {
  const map = new Map<string, MeReviewEntry[]>();
  for (const r of [...rows].sort((a, b) => a.dueAt.localeCompare(b.dueAt))) {
    const key = r.itemId ?? 'hs:' + r.targetId;
    map.set(key, [...(map.get(key) ?? []), r]);
  }
  return [...map.entries()];
}

function Skills({ rows }: { rows: MeReviewEntry[] }) {
  return (
    <ul className="review-skills">
      {rows.map((r) => (
        <li key={r.targetId + '|' + r.skill} className="review-skill">
          <span className="review-skill-name">{skillLabel(r.skill)}</span>
          <span className="review-skill-when">
            Mốc {STEPS[r.stage] ?? STEPS[STEPS.length - 1]} ngày · {day(r.dueAt)}
          </span>
        </li>
      ))}
    </ul>
  );
}

function Rows({
  rows,
  overview,
  mastery,
}: {
  rows: MeReviewEntry[];
  overview: CatalogOverview | null;
  mastery: MeMastery | null;
}) {
  const species = new Map(overview?.items.map((i) => [i.itemId, i]));
  return (
    <ul className="library-list review-list">
      {byTarget(rows).map(([key, rs]) => {
        const itemId = rs[0].itemId;
        const item = itemId ? species.get(itemId) : undefined;
        const level: MasteryLevel = (itemId && mastery?.[itemId]?.level) || 0;
        return (
          <li key={key} className="review-entry">
            {item ? (
              <SpeciesCard
                variant="row"
                item={item}
                sub={<Skills rows={rs} />}
                aside={<MasteryScales level={level} />}
              />
            ) : (
              <div className="review-plain">
                <strong>{itemId ? rs[0].label : 'HS theo dạng hàng · ' + rs[0].label}</strong>
                <Skills rows={rs} />
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** Species of the release not yet in any schedule: where the next haul comes from. */
function Fresh({
  entries,
  overview,
  readOnly,
}: {
  entries: MeReviewEntry[];
  overview: CatalogOverview | null;
  readOnly: boolean;
}) {
  const scheduled = new Set(entries.map((r) => r.itemId));
  const fresh = overview?.items.filter((i) => !scheduled.has(i.itemId)) ?? [];
  if (!fresh.length) return null;
  return (
    <section className="review-group review-fresh" aria-labelledby="review-fresh">
      <h2 id="review-fresh" className="ice-h2">
        Chưa vào lịch <span className="ice-count">{fresh.length}</span>
      </h2>
      <ul className="library-list">
        {fresh.slice(0, 6).map((item) => (
          <li key={item.itemId}>
            <SpeciesCard variant="row" item={item} aside={<MasteryScales level={0} />} />
          </li>
        ))}
      </ul>
      {(fresh.length > 6 || !readOnly) && (
        <p className="ice-note">
          {fresh.length > 6 ? `Và ${fresh.length - 6} loài khác trong thư viện. ` : ''}
          {!readOnly && 'Thả lưới ở trang Học để đưa loài mới vào lịch ôn.'}
        </p>
      )}
    </section>
  );
}

/** The species in the schedule as portholes in the deep header: due ones first, ringed. */
function Portholes({
  due,
  later,
  overview,
}: {
  due: MeReviewEntry[];
  later: MeReviewEntry[];
  overview: CatalogOverview | null;
}) {
  const rows = [...due, ...later];
  const dueIds = new Set(due.map((r) => r.itemId));
  const species = new Map(overview?.items.map((i) => [i.itemId, i]));
  const entries = byTarget(rows)
    .flatMap(([id]) => {
      const item = species.get(id);
      return item ? [{ item, due: dueIds.has(id) }] : [];
    })
    .sort((a, b) => Number(b.due) - Number(a.due));
  if (!entries.length) return null;
  const shown = entries.slice(0, 8);
  return (
    <ul className="ice-portholes" aria-label="Loài trong lịch ôn">
      {shown.map(({ item, due }) => (
        <li key={item.itemId} data-due={due ? '' : undefined} title={item.vi}>
          <span className="ice-porthole">
            {item.imageId ? (
              <SignedImage id={item.imageId} thumbnail alt={item.vi} />
            ) : (
              <MissingPhoto />
            )}
          </span>
          <span className="ice-porthole-name">{item.vi}</span>
        </li>
      ))}
      {entries.length > shown.length && (
        <li className="ice-porthole-more">+{entries.length - shown.length}</li>
      )}
    </ul>
  );
}

/**
 * Review corner on the ice surface: what is due now and what is scheduled next, each skill
 * on its own 1 → 3 → 7 → 14 day ladder. One button starts a review of up to 30 due items.
 * Lists come from `/me/review` (effective due dates), memory levels from `/me/mastery`.
 */
export function Review({
  userId,
  pending = false,
  onStart,
  source = ME_SOURCE,
  readOnly = false,
}: {
  userId: string;
  pending?: boolean;
  onStart?: StartSession;
  source?: LearnerSource;
  /** A manager looking at someone else: no heading of its own, no way to start a review. */
  readOnly?: boolean;
}) {
  const { overview } = useOverview(ignoreVersion);
  const review = useMe<MeReview>(source.review, userId);
  const mastery = useMe<MeMastery>(source.mastery, userId).data;
  const data = review.data;
  const title = readOnly ? (
    <h2 id="review-title">Lịch ôn tập</h2>
  ) : (
    <h1 id="review-title">Góc ôn tập của bạn.</h1>
  );
  if (!data)
    return (
      <section className="ice-page review" aria-labelledby="review-title">
        <header className="ice-hero">
          <div className="ice-hero-copy">
            {title}
            <p className="ice-lede">Mỗi kỹ năng một lịch riêng: 1 → 3 → 7 → 14 ngày.</p>
          </div>
        </header>
        {review.error ? (
          <ErrorNote message={review.error} retry={review.refresh} />
        ) : (
          <p className="ice-status" role="status">
            Đang tải lịch ôn…
          </p>
        )}
      </section>
    );
  const { due, scheduled: later } = data;
  const all = [...due, ...later];
  const next = [...later].sort((a, b) => a.dueAt.localeCompare(b.dueAt))[0];
  // Figures and headings count species (one row each, like "Chưa vào lịch"), not skill entries.
  const dueSpecies = byTarget(due).length,
    laterSpecies = byTarget(later).length;
  return (
    <section className="ice-page review" aria-labelledby="review-title">
      <header className="ice-hero">
        <div className="ice-hero-copy">
          {title}
          <p className="ice-lede">Mỗi kỹ năng một lịch riêng: 1 → 3 → 7 → 14 ngày.</p>
          <Portholes due={due} later={later} overview={overview} />
        </div>
        {all.length > 0 && (
          <div className="review-action">
            <dl className="ice-figures">
              <div>
                <dt>Loài đến hạn</dt>
                <dd>{dueSpecies}</dd>
              </div>
              <div>
                <dt>Loài đã lên lịch</dt>
                <dd>{laterSpecies}</dd>
              </div>
            </dl>
            {!readOnly && (
              <>
                <button
                  type="button"
                  className="ice-primary"
                  disabled={!due.length || pending}
                  onClick={() =>
                    void onStart?.(
                      'review',
                      undefined,
                      'en',
                      undefined,
                      undefined,
                      Math.min(due.length, MAX_BATCH),
                    )
                  }
                >
                  <RotateCcw size={18} aria-hidden="true" />
                  {due.length ? `Ôn ${due.length} mục đến hạn` : 'Chưa có mục đến hạn'}
                </button>
                <p className="ice-note">
                  {due.length > MAX_BATCH
                    ? 'Mỗi lượt ôn tối đa 30 mục; phần còn lại chờ lượt sau.'
                    : due.length
                      ? 'Mục đến hạn sớm nhất được ôn trước.'
                      : next
                        ? `Mục kế tiếp: ${day(next.dueAt)}.`
                        : ''}
                </p>
              </>
            )}
          </div>
        )}
      </header>
      {review.error && <ErrorNote message={review.error} retry={review.refresh} />}
      {all.length ? (
        <div className="review-body">
          <div className="review-lists">
            {due.length > 0 && (
              <section className="review-group" aria-labelledby="review-due">
                <h2 id="review-due" className="ice-h2">
                  Đến hạn <span className="ice-count">{dueSpecies}</span>
                </h2>
                <Rows rows={due} overview={overview} mastery={mastery} />
              </section>
            )}
            {later.length > 0 && (
              <section className="review-group" aria-labelledby="review-later">
                <h2 id="review-later" className="ice-h2">
                  Đã lên lịch <span className="ice-count">{laterSpecies}</span>
                </h2>
                <Rows rows={later} overview={overview} mastery={mastery} />
              </section>
            )}
          </div>
          <Fresh entries={all} overview={overview} readOnly={readOnly} />
        </div>
      ) : (
        <div className="ice-empty ice-empty--scales">
          <h2>Chưa có mục ôn tập</h2>
          <p>
            {readOnly
              ? 'Chưa có lượt nào hoàn thành.'
              : 'Hoàn thành một lượt để lên lịch theo từng kỹ năng.'}
          </p>
          {!readOnly && (
            <a className="ice-primary" href="#home">
              Mở bộ học
            </a>
          )}
        </div>
      )}
    </section>
  );
}
