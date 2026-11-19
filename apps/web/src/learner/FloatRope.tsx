import type { CSSProperties } from 'react';
import type { GroupKey } from './haul';
import './float-rope.css';

export type RopeFloat = { index: number; group: GroupKey; correct: boolean };

/**
 * Above this many floats a buoy on a 320px phone falls under ~24px (92% of a 288px rope / n),
 * too small for its number: the rope then drops the numbers and keeps the cap, hull and
 * dashed-ring states plus the accessible label.
 */
export const DENSE_ROPE = 10;

/** Horizontal inset of the first and last float, in % of the rope width. */
const INSET = 4;

/** Where float `i` of `total` is tied, in % of the rope width. */
export function floatX(i: number, total: number): number {
  return total <= 1 ? 50 : INSET + (i * (100 - 2 * INSET)) / (total - 1);
}

/**
 * The rope as a sagging line: tied at each float, it hangs a little between them, so it
 * reads as a heavy line in the water rather than a progress track.
 */
export function ropePath(total: number): string {
  const xs = Array.from({ length: Math.max(total, 1) }, (_, i) => floatX(i, total));
  let d = `M0 10 Q${xs[0] / 2} 13 ${xs[0]} 10`;
  for (let i = 1; i < xs.length; i++) d += ` Q${(xs[i - 1] + xs[i]) / 2} 17 ${xs[i]} 10`;
  const last = xs[xs.length - 1];
  return d + ` Q${(last + 100) / 2} 13 100 10`;
}

/**
 * Haul progress as a float rope of buoys: a dark buoy is a question not yet answered, a lit
 * buoy (white cap over the species' group colour, numbered so colour is never the only cue)
 * is a correct answer, a dashed buoy is a wrong or skipped one ("sổng lưới"). The salmon ring
 * marks the question in play.
 */
export function FloatRope({
  total,
  done,
  current,
  className = '',
}: {
  total: number;
  done: RopeFloat[];
  /** Index of the question in play, marked with the salmon ring. */
  current?: number;
  className?: string;
}) {
  const byIndex = new Map(done.map((d) => [d.index, d]));
  const caught = done.filter((d) => d.correct).length;
  const dense = total > DENSE_ROPE;
  return (
    <div
      className={`float-rope ${className}`.trim()}
      style={{ '--n': total } as CSSProperties}
      data-dense={dense ? '' : undefined}
      role="img"
      aria-label={`Tiến độ mẻ lưới: ${caught} / ${total}`}
    >
      <svg
        className="float-rope-line"
        viewBox="0 0 100 20"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <path className="float-rope-cord" d={ropePath(total)} />
        <path className="float-rope-lay" d={ropePath(total)} />
      </svg>
      <div className="float-rope-floats">
        {Array.from({ length: total }, (_, i) => {
          const d = byIndex.get(i);
          const state = !d ? 'empty' : d.correct ? 'caught' : 'missed';
          return (
            <span
              key={i}
              className={`float ${state}${i === current && !d ? ' current' : ''}`}
              style={
                {
                  '--i': i,
                  '--x': floatX(i, total),
                  ...(d?.correct
                    ? {
                        '--float-fill': `var(--group-${d.group})`,
                        '--float-ink': `var(--group-${d.group}-ink)`,
                      }
                    : {}),
                } as CSSProperties
              }
            >
              {state === 'caught' && !dense ? <b>{i + 1}</b> : null}
            </span>
          );
        })}
      </div>
    </div>
  );
}
