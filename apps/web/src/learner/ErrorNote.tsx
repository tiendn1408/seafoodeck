import type { Ref } from 'react';

export function ErrorNote({
  message,
  retry,
  retryLabel = 'Thử lại',
  noteRef,
}: {
  message: string;
  retry?: () => void;
  retryLabel?: string;
  /** When given, the note can take focus (programmatically only) through this ref. */
  noteRef?: Ref<HTMLDivElement>;
}) {
  return (
    <div
      className="notice pilot-error"
      role="alert"
      ref={noteRef}
      tabIndex={noteRef ? -1 : undefined}
    >
      <span>{message}</span>
      {retry && (
        <button className="btn secondary" onClick={retry}>
          {retryLabel}
        </button>
      )}
    </div>
  );
}
