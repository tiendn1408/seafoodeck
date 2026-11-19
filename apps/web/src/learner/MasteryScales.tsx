import './mastery.css';

export type MasteryLevel = 0 | 1 | 2 | 3 | 4;
const SCALES = [0, 1, 2, 3];

/**
 * Memory level as four small scales, one per review milestone (1 · 3 · 7 · 14 days).
 * A data indicator drawn in SVG: filled scales are milestones reached, outlined ones are not.
 */
export function MasteryScales({ level }: { level: MasteryLevel }) {
  return (
    <svg
      className="mastery"
      viewBox="0 0 58 14"
      role="img"
      aria-label={level ? `Mức nhớ ${level}/4` : 'Chưa học'}
    >
      {SCALES.map((i) => (
        <path
          key={i}
          className={'mastery-scale' + (i < level ? ' on' : '')}
          transform={`translate(${i * 15} 0)`}
          d="M1.5 12.5V7.5a5.5 5.5 0 0 1 11 0v5Z"
        />
      ))}
    </svg>
  );
}
