import { useId, useLayoutEffect, useRef, type ReactNode } from 'react';
import './users.css';

const FOCUSABLE =
  'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

/**
 * Modal dialog for the admin screens: focus moves inside on open (first field, else the first
 * button), Tab stays inside, Escape closes, and focus returns to whatever opened it.
 */
export function Dialog({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useLayoutEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const box = ref.current!;
    const first =
      box.querySelector<HTMLElement>('input:not(:disabled), select:not(:disabled)') ??
      box.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? box).focus();
    return () => {
      if (opener?.isConnected) opener.focus();
    };
  }, []);
  return (
    <div className="users-backdrop">
      <div
        ref={ref}
        className="users-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.stopPropagation();
            onClose();
            return;
          }
          if (e.key !== 'Tab') return;
          const items = [...ref.current!.querySelectorAll<HTMLElement>(FOCUSABLE)];
          if (!items.length) return;
          const first = items[0],
            last = items[items.length - 1];
          if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }}
      >
        <h2 id={titleId}>{title}</h2>
        {children}
      </div>
    </div>
  );
}
