import type { CSSProperties, ReactNode } from 'react';
import type { MeMastery, MeProgress, MeSessionRow } from '../pilot/api';
import { Achievements, modeLabel, vnDateTime } from './Achievements';
import { ErrorNote } from './ErrorNote';
import { MasteryScales, type MasteryLevel } from './MasteryScales';
import { SpeciesCard } from './SpeciesCard';
import { groupTone, type GroupKey } from './groups';
import { ME_SOURCE, useMe, type LearnerSource } from './meStore';
import { SKILL_COUNT_NOTE } from './skillLabel';
import { ignoreVersion, useOverview } from './useOverview';
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

/** The last few sessions: one line each, the first-try share as a short rope. */
function History({ rows, readOnly }: { rows: MeSessionRow[]; readOnly: boolean }) {
  return (
    <section className="progress-sessions" aria-labelledby="progress-sessions">
      <h2 id="progress-sessions" className="ice-h2">
        Lịch sử phiên gần đây
      </h2>
      {rows.length ? (
        <ol className="ice-panel progress-sessions-list">
          {rows.map((r) => (
            <li key={r.sessionId}>
              <span className="progress-name">{modeLabel(r.mode)}</span>
              <time className="progress-count" dateTime={r.at}>
                {vnDateTime(r.at)}
              </time>
              <span className="progress-session-figures">
                {r.answered > 0 && (
                  <span>
                    Đúng lần đầu{' '}
                    <strong>
                      {r.firstTry} / {r.answered}
                    </strong>
                    {r.percent !== null && ` · ${r.percent}%`}
                  </span>
                )}
                {r.selfRated > 0 && <span>{r.selfRated} thẻ tự đánh giá</span>}
              </span>
              {r.percent !== null && <Gauge value={r.percent / 100} color="var(--ice-focus)" />}
            </li>
          ))}
        </ol>
      ) : (
        <p className="ice-note">
          {readOnly
            ? 'Chưa có phiên nào.'
            : 'Chưa có phiên nào. Thả lưới ở trang Học để kéo mẻ đầu tiên.'}
        </p>
      )}
    </section>
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
 * Progress on the ice surface, all from the server: the four skills, how many species sit at
 * each memory milestone (`/me/progress`), each species' own level (`/me/mastery`, names from
 * the catalogue overview), achievements and the latest sessions.
 */
export function Progress({
  userId,
  source = ME_SOURCE,
  readOnly = false,
}: {
  userId: string;
  source?: LearnerSource;
  /** A manager looking at someone else: no heading of its own, no links into learning. */
  readOnly?: boolean;
}) {
  const { overview } = useOverview(ignoreVersion);
  const progress = useMe<MeProgress>(source.progress, userId);
  const levels = useMe<MeMastery>(source.mastery, userId).data;
  const data = progress.data;
  const hero = (figures: ReactNode) => (
    <header className="ice-hero">
      <div className="ice-hero-copy">
        {readOnly ? (
          <h2 id="progress-title">Tiến độ học</h2>
        ) : (
          <h1 id="progress-title">Tiến độ học của bạn</h1>
        )}
        <p className="ice-lede">
          Mức nhớ tính trên bộ nội dung đang xuất bản, theo lịch ôn của từng kỹ năng.
        </p>
      </div>
      {figures}
    </header>
  );
  if (!data)
    return (
      <section className="ice-page progress" aria-labelledby="progress-title">
        {hero(null)}
        {progress.error ? (
          <ErrorNote message={progress.error} retry={progress.refresh} />
        ) : (
          <p className="ice-status" role="status">
            Đang tải tiến độ…
          </p>
        )}
      </section>
    );
  const { mastery: m, figures } = data;
  const counts: Record<MasteryLevel, number> = {
    0: m.unlearned,
    1: m.level1,
    2: m.level2,
    3: m.level3,
    4: m.level4,
  };
  const species = m.unlearned + m.level1 + m.level2 + m.level3 + m.level4;
  const entries: Entry[] = (overview?.items ?? []).map((i) => ({
    itemId: i.itemId,
    vi: i.vi,
    group: groupTone(i.taxonomicGroup).key,
    level: levels?.[i.itemId]?.level ?? 0,
  }));
  const present = GROUPS.filter((g) => entries.some((e) => e.group === g));
  // The species list: most remembered first, then the catalogue order.
  const ranked = [...entries].sort((a, b) => b.level - a.level).slice(0, 12);
  return (
    <section className="ice-page progress" aria-labelledby="progress-title">
      {hero(
        <dl className="ice-figures progress-figures">
          <div>
            <dt>Loài đã vào lịch</dt>
            <dd>
              {species - m.unlearned} / {species}
            </dd>
          </div>
          <div>
            <dt>Câu đã trả lời</dt>
            <dd>{figures.answered}</dd>
          </div>
          <div>
            <dt>Đúng lần đầu</dt>
            <dd>{figures.firstTryPercent === null ? '—' : figures.firstTryPercent + '%'}</dd>
          </div>
          <div>
            <dt>Thẻ tự đánh giá</dt>
            <dd>{figures.selfRated}</dd>
          </div>
        </dl>,
      )}
      {progress.error && <ErrorNote message={progress.error} retry={progress.refresh} />}
      <div className="ice-panel progress-board">
        <section className="progress-skills-col" aria-labelledby="progress-skills">
          <h2 id="progress-skills" className="ice-h2">
            Bốn kỹ năng
          </h2>
          <p className="ice-note progress-skills-note">{SKILL_COUNT_NOTE}</p>
          <ul className="progress-skills">
            {data.skills.map((s) => (
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
                <Floats entries={levels ? entries.filter((e) => e.level === level) : []} />
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
            {m.unlearned} / {species} loài chưa học.
          </p>
        </section>
      </div>
      <Achievements streak={data.achievements.streak} badges={data.achievements.badges} />
      <History rows={data.sessions.slice(0, 5)} readOnly={readOnly} />
      {overview && ranked.length > 0 && (
        <section className="progress-species" aria-labelledby="progress-species">
          <h2 id="progress-species" className="ice-h2">
            Từng loài <span className="ice-count">{overview.items.length}</span>
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
          {!readOnly && overview.items.length > ranked.length && (
            <p className="ice-note">
              <a href="#library">Xem cả {overview.items.length} loài trong thư viện</a>
            </p>
          )}
        </section>
      )}
    </section>
  );
}
