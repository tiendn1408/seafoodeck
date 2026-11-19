import { RotateCcw } from 'lucide-react';
import type { ReviewState } from '../domain/models';
import type { CatalogOverview } from '../pilot/api';
import { SignedImage } from '../pilot/Media';
import type { StartSession } from './Home';
import { MasteryScales } from './MasteryScales';
import { MissingPhoto } from './MissingPhoto';
import { SpeciesCard } from './SpeciesCard';
import { masteryLevel } from './haul';
import { skillLabel, type Ledger } from './ledger';
import { useOverview } from './useOverview';
import './library.css';

const STEPS = [1, 3, 7, 14];
const day = (iso: string) => new Date(iso).toLocaleDateString('vi-VN');

/** Reviews of one target, in due order. */
function byTarget(rows: ReviewState[]) {
  const map = new Map<string, ReviewState[]>();
  for (const r of [...rows].sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt)))
    map.set(r.targetId, [...(map.get(r.targetId) ?? []), r]);
  return [...map.entries()];
}

function Skills({ rows }: { rows: ReviewState[] }) {
  return (
    <ul className="review-skills">
      {rows.map((r) => (
        <li key={r.key} className="review-skill">
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
  labels,
  all,
}: {
  rows: ReviewState[];
  overview: CatalogOverview | null;
  labels: Ledger['labels'];
  all: ReviewState[];
}) {
  const species = new Map(overview?.items.map((i) => [i.itemId, i]));
  return (
    <ul className="library-list review-list">
      {byTarget(rows).map(([targetId, rs]) => {
        const item = species.get(targetId);
        return (
          <li key={targetId} className="review-entry">
            {item ? (
              <SpeciesCard
                variant="row"
                item={item}
                sub={<Skills rows={rs} />}
                aside={<MasteryScales level={masteryLevel(all, targetId)} />}
              />
            ) : (
              <div className="review-plain">
                <strong>{labels?.[targetId] ?? 'Mục học'}</strong>
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
  reviews,
  overview,
}: {
  reviews: ReviewState[];
  overview: CatalogOverview | null;
}) {
  const scheduled = new Set(reviews.map((r) => r.targetId));
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
      <p className="ice-note">
        {fresh.length > 6 ? `Và ${fresh.length - 6} loài khác trong thư viện. ` : ''}
        Thả lưới ở trang Học để đưa loài mới vào lịch ôn.
      </p>
    </section>
  );
}

/** The species in the schedule as portholes in the deep header: due ones first, ringed. */
function Portholes({
  reviews,
  overview,
  now,
}: {
  reviews: ReviewState[];
  overview: CatalogOverview | null;
  now: number;
}) {
  const species = new Map(overview?.items.map((i) => [i.itemId, i]));
  const entries = byTarget(reviews)
    .flatMap(([id, rs]) => {
      const item = species.get(id);
      return item ? [{ item, due: rs.some((r) => Date.parse(r.dueAt) <= now) }] : [];
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
 */
export function Review({
  ledger,
  reviews,
  now,
  pending,
  onStart,
  onVersion,
}: {
  ledger: Ledger;
  /** Reviews already scoped to the current release. */
  reviews: ReviewState[];
  now: number;
  pending: boolean;
  onStart: StartSession;
  onVersion: (releaseId: string) => void;
}) {
  const { overview } = useOverview(onVersion);
  const due = reviews.filter((r) => Date.parse(r.dueAt) <= now),
    later = reviews.filter((r) => Date.parse(r.dueAt) > now);
  const next = [...later].sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt))[0];
  return (
    <section className="ice-page review" aria-labelledby="review-title">
      <header className="ice-hero">
        <div className="ice-hero-copy">
          <h1 id="review-title">Góc ôn tập của bạn.</h1>
          <p className="ice-lede">Mỗi kỹ năng một lịch riêng: 1 → 3 → 7 → 14 ngày.</p>
          <Portholes reviews={reviews} overview={overview} now={now} />
        </div>
        {reviews.length > 0 && (
          <div className="review-action">
            <dl className="ice-figures">
              <div>
                <dt>Đến hạn</dt>
                <dd>{due.length}</dd>
              </div>
              <div>
                <dt>Đã lên lịch</dt>
                <dd>{later.length}</dd>
              </div>
            </dl>
            <button
              type="button"
              className="ice-primary"
              disabled={!due.length || pending}
              onClick={() =>
                void onStart(
                  'review',
                  undefined,
                  'en',
                  undefined,
                  due.slice(0, 30).map((r) => ({ targetId: r.targetId, skill: r.skill })),
                )
              }
            >
              <RotateCcw size={18} aria-hidden="true" />
              Ôn {due.length} mục đến hạn
            </button>
            <p className="ice-note">
              {due.length > 30
                ? 'Mỗi lượt ôn tối đa 30 mục; phần còn lại chờ lượt sau.'
                : due.length
                  ? 'Mục đến hạn sớm nhất được ôn trước.'
                  : next
                    ? `Chưa có mục đến hạn. Mục kế tiếp: ${day(next.dueAt)}.`
                    : ''}
            </p>
          </div>
        )}
      </header>
      {reviews.length ? (
        <div className="review-body">
          <div className="review-lists">
            {due.length > 0 && (
              <section className="review-group" aria-labelledby="review-due">
                <h2 id="review-due" className="ice-h2">
                  Đến hạn <span className="ice-count">{due.length}</span>
                </h2>
                <Rows rows={due} overview={overview} labels={ledger.labels} all={reviews} />
              </section>
            )}
            {later.length > 0 && (
              <section className="review-group" aria-labelledby="review-later">
                <h2 id="review-later" className="ice-h2">
                  Đã lên lịch <span className="ice-count">{later.length}</span>
                </h2>
                <Rows rows={later} overview={overview} labels={ledger.labels} all={reviews} />
              </section>
            )}
          </div>
          <Fresh reviews={reviews} overview={overview} />
        </div>
      ) : (
        <div className="ice-empty ice-empty--scales">
          <h2>Chưa có mục ôn tập</h2>
          <p>Hoàn thành một lượt để lên lịch theo từng kỹ năng.</p>
          <a className="ice-primary" href="#home">
            Mở bộ học
          </a>
        </div>
      )}
    </section>
  );
}
