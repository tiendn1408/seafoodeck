import type { CSSProperties } from 'react';
import type { Attempt, ReviewState } from '../domain/models';
import { ErrorNote } from './ErrorNote';
import { MasteryScales, type MasteryLevel } from './MasteryScales';
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

/** One milestone's species as a bar stacked by group colour; a legend with the group names
 *  follows the list, so colour is never the only cue. */
function GroupBar({ counts, species }: { counts: Record<GroupKey, number>; species: number }) {
  return (
    <span className="ice-bar ice-bar--stack" aria-hidden="true">
      {GROUPS.filter((g) => counts[g] > 0).map((g) => (
        <i
          key={g}
          style={
            {
              '--fill': species ? counts[g] / species : 0,
              '--bar': groupTone(g).css,
            } as CSSProperties
          }
        />
      ))}
    </span>
  );
}

function Bar({ value, color }: { value: number; color: string }) {
  return (
    <span className="ice-bar" aria-hidden="true">
      <i style={{ '--fill': value, '--bar': color } as CSSProperties} />
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
  // Species per milestone and group, for the stacked bars and the legend.
  const byLevel: Record<GroupKey, number>[] = Array.from({ length: 5 }, () => ({
    fish: 0,
    crustacean: 0,
    mollusc: 0,
    other: 0,
    none: 0,
  }));
  for (const item of overview?.items ?? [])
    byLevel[masteryLevel(reviews, item.itemId)][groupTone(item.taxonomicGroup).key]++;
  const present = GROUPS.filter((g) => byLevel.some((c) => c[g] > 0));
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
      <div className="progress-grid">
        {overview && (
          <section className="ice-panel" aria-labelledby="progress-skills">
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
                  <Bar value={s.total ? s.done / s.total : 0} color={skillColor[s.key]} />
                </li>
              ))}
            </ul>
          </section>
        )}
        {counts && (
          <section className="ice-panel" aria-labelledby="progress-mastery">
            <h2 id="progress-mastery" className="ice-h2">
              Mức nhớ theo loài
            </h2>
            <ul className="progress-mastery">
              {LEVELS.map(({ level, label }) => (
                <li key={level}>
                  <MasteryScales level={level} />
                  <span className="progress-name">{label}</span>
                  <span className="progress-count">{counts[level]} loài</span>
                  <GroupBar counts={byLevel[level]} species={species} />
                </li>
              ))}
            </ul>
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
        )}
      </div>
    </section>
  );
}
