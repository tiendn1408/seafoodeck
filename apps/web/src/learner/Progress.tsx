import type { CSSProperties } from 'react';
import type { Attempt, ReviewState } from '../domain/models';
import { ErrorNote } from './ErrorNote';
import { MasteryScales, type MasteryLevel } from './MasteryScales';
import { SpeciesCard } from './SpeciesCard';
import { groupTone, masteryCounts, masteryLevel, skillProgress, type GroupKey } from './haul';
import { useOverview } from './useOverview';
import './library.css';

const LEVELS: { level: MasteryLevel; label: string }[] = [
  { level: 1, label: 'Mốc 1 ngày' },
  { level: 2, label: 'Mốc 3 ngày' },
  { level: 3, label: 'Mốc 7 ngày' },
  { level: 4, label: 'Mốc 14 ngày' },
];
const skillColor: Record<string, string> = {
  en: 'var(--ice-focus)',
  ja: 'var(--group-crustacean)',
  scientific: 'var(--group-mollusc)',
  hs: 'var(--action)',
};

const GROUPS: GroupKey[] = ['fish', 'crustacean', 'mollusc', 'other', 'none'];

/** A skill as a short rope: the hauled-in length in the skill colour, a buoy marks how far. */
function Gauge({ value, color }: { value: number; color: string }) {
  return (
    <span
      className="ice-gauge"
      aria-hidden="true"
      style={{ '--fill': value, '--bar': color } as CSSProperties}
    >
      <i />
      <b />
    </span>
  );
}

type Entry = { itemId: string; vi: string; group: GroupKey; level: MasteryLevel };

/** The species sitting at one milestone, as small buoys in their group colour. Decorative:
 *  the count beside them is the accessible figure, the legend names the group colours. */
function Floats({ entries }: { entries: Entry[] }) {
  if (!entries.length) return <span className="progress-floats-empty" aria-hidden="true" />;
  const shown = entries.slice(0, 14);
  return (
    <span className="progress-floats" aria-hidden="true">
      {shown.map((e) => (
        <i
          key={e.itemId}
          title={e.vi}
          style={
            {
              '--float-fill': groupTone(e.group).css,
            } as CSSProperties
          }
        />
      ))}
      {entries.length > shown.length && <em>+{entries.length - shown.length}</em>}
    </span>
  );
}

/**
 * Progress on the ice surface: the four skills (species with stage ≥ 1), how many species sit
 * at each memory milestone, and the answer figures of the current release.
 */
export function Progress({
  attempts,
  reviews,
  onVersion,
}: {
  /** Attempts of the current release, skipped ones removed. */
  attempts: Attempt[];
  /** Reviews already scoped to the current release. */
  reviews: ReviewState[];
  onVersion: (releaseId: string) => void;
}) {
  const { overview, error, retry } = useOverview(onVersion);
  const graded = attempts.filter((a) => !a.selfRated);
  const counts = overview ? masteryCounts(overview, reviews) : null;
  const species = overview?.items.length ?? 0;
  const entries: Entry[] = (overview?.items ?? []).map((i) => ({
    itemId: i.itemId,
    vi: i.vi,
    group: groupTone(i.taxonomicGroup).key,
    level: masteryLevel(reviews, i.itemId),
  }));
  const present = GROUPS.filter((g) => entries.some((e) => e.group === g));
  // The species list: most remembered first, then the catalogue order.
  const ranked = [...entries].sort((a, b) => b.level - a.level).slice(0, 12);
  const studied = species - (counts?.[0] ?? 0);
  return (
    <section className="ice-page progress" aria-labelledby="progress-title">
      <header className="ice-hero">
        <div className="ice-hero-copy">
          <h1 id="progress-title">Tiến độ học của bạn</h1>
          <p className="ice-lede">
            Tính trên bộ nội dung đang xuất bản, theo lịch ôn của từng kỹ năng.
          </p>
        </div>
        <dl className="ice-figures progress-figures">
          <div>
            <dt>Loài đã vào lịch</dt>
            <dd>{overview ? `${studied} / ${species}` : '—'}</dd>
          </div>
          <div>
            <dt>Câu đã trả lời</dt>
            <dd>{graded.length}</dd>
          </div>
          <div>
            <dt>Đúng lần đầu</dt>
            <dd>
              {graded.length
                ? Math.round((graded.filter((a) => a.correct).length / graded.length) * 100) + '%'
                : '—'}
            </dd>
          </div>
          <div>
            <dt>Thẻ tự đánh giá</dt>
            <dd>{attempts.filter((a) => a.selfRated).length}</dd>
          </div>
        </dl>
        <p className="ice-note progress-history">
          Lịch sử bộ cũ được giữ riêng trên thiết bị. Không chuyển điểm sang revision khác.
        </p>
      </header>
      {error && <ErrorNote message={error} retry={retry} />}
      {!overview && !error && (
        <p className="ice-status" role="status">
          Đang tải danh mục…
        </p>
      )}
      {overview && counts && (
        <div className="ice-panel progress-board">
          <section className="progress-skills-col" aria-labelledby="progress-skills">
            <h2 id="progress-skills" className="ice-h2">
              Bốn kỹ năng
            </h2>
            <ul className="progress-skills">
              {skillProgress(overview, reviews).map((s) => (
                <li key={s.key}>
                  <span className="progress-name">{s.label}</span>
                  <span className="progress-count">
                    {s.done} / {s.total} {s.key === 'hs' ? 'hồ sơ' : 'loài'}
                  </span>
                  <Gauge value={s.total ? s.done / s.total : 0} color={skillColor[s.key]} />
                </li>
              ))}
            </ul>
          </section>
          <section className="progress-mastery-col" aria-labelledby="progress-mastery">
            <h2 id="progress-mastery" className="ice-h2">
              Mức nhớ theo loài
            </h2>
            <ol className="progress-mastery">
              {LEVELS.map(({ level, label }) => (
                <li key={level}>
                  <MasteryScales level={level} />
                  <span className="progress-name">{label}</span>
                  <span className="progress-count">{counts[level]} loài</span>
                  <Floats entries={entries.filter((e) => e.level === level)} />
                </li>
              ))}
            </ol>
            {present.length > 0 && (
              <ul className="progress-legend" aria-label="Màu nhóm">
                {present.map((g) => (
                  <li key={g} style={{ '--tone': groupTone(g).css } as CSSProperties}>
                    <span className="library-swatch" aria-hidden="true" />
                    {groupTone(g).label}
                  </li>
                ))}
              </ul>
            )}
            <p className="ice-note">
              {counts[0]} / {species} loài chưa học.
            </p>
          </section>
        </div>
      )}
      {overview && ranked.length > 0 && (
        <section className="progress-species" aria-labelledby="progress-species">
          <h2 id="progress-species" className="ice-h2">
            Từng loài <span className="ice-count">{species}</span>
          </h2>
          <ul className="library-list">
            {ranked.map((e) => {
              const item = overview.items.find((i) => i.itemId === e.itemId)!;
              return (
                <li key={e.itemId}>
                  <SpeciesCard
                    variant="row"
                    item={item}
                    aside={<MasteryScales level={e.level} />}
                  />
                </li>
              );
            })}
          </ul>
          {species > ranked.length && (
            <p className="ice-note">
              <a href="#library">Xem cả {species} loài trong thư viện</a>
            </p>
          )}
        </section>
      )}
    </section>
  );
}
