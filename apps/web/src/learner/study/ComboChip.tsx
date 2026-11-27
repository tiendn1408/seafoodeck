/** "Combo ×N" for a run of correct graded answers; nothing at all below two, so a broken run just vanishes. */
export function ComboChip({ current }: { current: number }) {
  // The live region stays mounted so the first appearance is announced; the pill is keyed by the
  // count so its pop replays on each increment.
  return (
    <span className="combo-slot" role="status">
      {current >= 2 && (
        <span key={current} className="combo-chip">
          Combo ×{current}
        </span>
      )}
    </span>
  );
}
