/** At or below this the bar turns warm (colour only: no blinking, no sound). */
export const WARM_MS = 10_000;

/** `mm:ss`, counting a started second as a whole one (44.2 s left reads 00:45). */
function clockText(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
}

/**
 * The session clock of the image mode: a thin track and the time left as `mm:ss`. Named for
 * screen readers but not a live region; Study announces 10 s left and the end once each.
 */
export function TimerBar({ remainingMs, totalMs }: { remainingMs: number; totalMs: number }) {
  const share = totalMs > 0 ? Math.min(1, Math.max(0, remainingMs / totalMs)) : 0;
  return (
    <span
      className={'study-timer' + (remainingMs <= WARM_MS ? ' is-warm' : '')}
      role="group"
      aria-label="Thời gian còn lại"
    >
      <span className="study-timer-track" aria-hidden="true">
        <span className="study-timer-fill" style={{ transform: `scaleX(${share})` }} />
      </span>
      <span className="study-timer-text">{clockText(remainingMs)}</span>
    </span>
  );
}
