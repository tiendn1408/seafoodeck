/** "Combo ×N" for a run of correct graded answers; nothing at all below two, so a broken run just vanishes. */
export function ComboChip({ current }: { current: number }) {
  if (current < 2) return null;
  return (
    <span className="combo-chip" role="status">
      Combo ×{current}
    </span>
  );
}
