import type { MeBadge } from '../pilot/api';
import './achievements.css';

const TZ = 'Asia/Ho_Chi_Minh';

const valid = (iso: string) => !Number.isNaN(new Date(iso).getTime());

/** Date of an instant in Vietnam time, e.g. "20/11/2026"; "—" for a malformed instant. */
export const vnDate = (iso: string) =>
  !valid(iso)
    ? '—'
    : new Date(iso).toLocaleDateString('vi-VN', {
        timeZone: TZ,
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });

/** Time and date of an instant in Vietnam time, e.g. "01:30 20/11/2026"; "—" if malformed. */
export const vnDateTime = (iso: string) =>
  !valid(iso)
    ? '—'
    : new Date(iso).toLocaleString('vi-VN', {
        timeZone: TZ,
        hour: '2-digit',
        minute: '2-digit',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });

const MODES: Record<string, string> = {
  review: 'Ôn tập',
  flashcard: 'Flashcard',
  match: 'Ghép tên',
  image: 'Đoán hình',
  hs: 'HS',
  listening: 'Nghe tên',
};
/** Vietnamese label of a session mode code from `/me/progress`; unknown codes stay as given. */
export const modeLabel = (mode: string) => MODES[mode] ?? mode;

/**
 * Goal of each server badge, worded after its rule in apps/api (progress-achievements.ts and
 * progress.service.ts): distinct species answered (HS excluded), the longest day streak,
 * species at memory level 3 or more (the 7-day milestone), sessions with a review answer.
 */
const GOALS: Record<string, string> = {
  first10: 'Học 10 loài khác nhau',
  streak7: 'Học 7 ngày liên tiếp (tính chuỗi dài nhất)',
  solid50: 'Đưa 50 loài lên mốc 7 ngày',
  species100: 'Học 100 loài khác nhau',
  review10: 'Ôn tập trong 10 phiên khác nhau',
};
/** What a badge asks for, in words; unknown ids fall back to the server label. */
export const badgeGoal = (b: MeBadge) => GOALS[b.id] ?? b.label;

const WEEK = 7;

/** A badge as a small round buoy-medal: a light cap, a hull with three fish scales. Decorative. */
function Medal() {
  return (
    <svg className="achievements-medal" viewBox="0 0 48 48" aria-hidden="true">
      <circle className="achievements-medal-ring" cx="24" cy="24" r="21" />
      <path className="achievements-medal-hull" d="M3 26h42a21 21 0 0 1-42 0Z" />
      {[0, 1, 2].map((i) => (
        <path
          key={i}
          className="achievements-medal-scale"
          transform={`translate(${12.5 + i * 8} 29)`}
          d="M0.5 7.5V4a3.5 3.5 0 0 1 7 0v3.5"
        />
      ))}
    </svg>
  );
}

/**
 * Achievements on the ice surface: the day streak as a short rope of seven floats, then the
 * badges. A badge is earned only when the server gives it a date; the rest stay muted with
 * their goal in words.
 */
export function Achievements({
  streak,
  badges,
}: {
  streak: { current: number; longest: number };
  badges: MeBadge[];
}) {
  const filled = Math.min(Math.max(streak.current, 0), WEEK);
  const earned = badges.filter((b) => b.earnedAt !== null).length;
  return (
    <section className="achievements" aria-labelledby="achievements-title">
      <h2 id="achievements-title" className="ice-h2">
        Thành tích
      </h2>
      <div className="ice-panel achievements-board">
        <div className="achievements-streak">
          <h3 className="achievements-h3">Chuỗi ngày</h3>
          <p className="achievements-current">
            <strong>{streak.current} ngày</strong>
            <span>Dài nhất {streak.longest} ngày</span>
          </p>
          <span
            className="achievements-days"
            role="img"
            aria-label={`${filled} trên ${WEEK} ngày của chuỗi 7 ngày`}
          >
            {Array.from({ length: WEEK }, (_, i) => (
              <i key={i} className={i < filled ? 'on' : undefined} />
            ))}
          </span>
          {streak.current === 0 && (
            <p className="achievements-invite">Học hôm nay để bắt đầu chuỗi ngày</p>
          )}
        </div>
        {badges.length > 0 && (
          <div className="achievements-badges-col">
            <h3 id="achievements-earned" className="achievements-h3">
              Huy hiệu{' '}
              <span className="ice-count">
                {earned} / {badges.length}
              </span>
            </h3>
            <ul className="achievements-badges">
              {badges.map((b) => {
                const on = b.earnedAt !== null;
                return (
                  <li
                    key={b.id}
                    className="achievements-badge"
                    data-badge={b.id}
                    data-earned={on ? 'true' : 'false'}
                  >
                    <Medal />
                    <span className="achievements-badge-text">
                      <strong>{b.label}</strong>
                      {on ? (
                        <span>
                          Đạt ngày <time dateTime={b.earnedAt!}>{vnDate(b.earnedAt!)}</time>
                        </span>
                      ) : (
                        <span>Chưa đạt · {badgeGoal(b)}</span>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}
