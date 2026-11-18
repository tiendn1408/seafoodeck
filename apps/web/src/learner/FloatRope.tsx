import type { CSSProperties } from 'react';
import type { GroupKey } from './haul';
import './float-rope.css';

export type RopeFloat = { index: number; group: GroupKey; correct: boolean };

/**
 * Haul progress as a float rope: an empty float is a question not yet answered, a float
 * filled with the species' group colour (and numbered, so colour is never the only cue)
 * is a correct answer, a dashed float is a wrong or skipped one ("sổng lưới").
 */
export function FloatRope({
  total,
  done,
  className = '',
}: {
  total: number;
  done: RopeFloat[];
  className?: string;
}) {
  const byIndex = new Map(done.map((d) => [d.index, d]));
  const caught = done.filter((d) => d.correct).length;
  return (
    <div
      className={`float-rope ${className}`.trim()}
      role="img"
      aria-label={`Tiến độ mẻ lưới: ${caught} / ${total}`}
    >
      <svg className="float-rope-line" viewBox="0 0 100 20" preserveAspectRatio="none">
        <path d="M0 9 Q25 15 50 9 T100 9" />
      </svg>
      <div className="float-rope-floats">
        {Array.from({ length: total }, (_, i) => {
          const d = byIndex.get(i);
          const state = !d ? 'empty' : d.correct ? 'caught' : 'missed';
          return (
            <span
              key={i}
              className={`float ${state}`}
              style={
                {
                  '--i': i,
                  ...(d?.correct
                    ? {
                        '--float-fill': `var(--group-${d.group})`,
                        '--float-ink': `var(--group-${d.group}-ink)`,
                      }
                    : {}),
                } as CSSProperties
              }
            >
              {state === 'caught' ? i + 1 : null}
            </span>
          );
        })}
      </div>
    </div>
  );
}
