import type { CSSProperties } from 'react';
import { ArrowRight } from 'lucide-react';
import { groupTone, type GroupKey } from './groups';

/** A chip that opens the library filtered to one taxonomic group. */
export function GroupEntry({
  group,
  count,
  onOpen,
}: {
  group: Exclude<GroupKey, 'none'>;
  count: number;
  onOpen: (group: Exclude<GroupKey, 'none'>) => void;
}) {
  const tone = groupTone(group);
  return (
    <button
      type="button"
      className="group-entry"
      data-empty={count === 0 ? '' : undefined}
      style={{ '--tone': tone.css } as CSSProperties}
      onClick={() => onOpen(group)}
    >
      <svg className="group-entry-mark" viewBox="0 0 30 22" aria-hidden="true">
        <path d="M8 13a7 7 0 0 1 14 0" />
        <path d="M1.5 20a6.5 6.5 0 0 1 13 0" />
        <path d="M15.5 20a6.5 6.5 0 0 1 13 0" />
      </svg>
      <strong>{tone.label}</strong>
      <small>{count} loài</small>
      <ArrowRight size={16} aria-hidden="true" />
    </button>
  );
}
