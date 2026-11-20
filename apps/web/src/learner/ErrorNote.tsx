export function ErrorNote({
  message,
  retry,
  retryLabel = 'Thử lại',
}: {
  message: string;
  retry?: () => void;
  retryLabel?: string;
}) {
  return (
    <div className="notice pilot-error" role="alert">
      <span>{message}</span>
      {retry && (
        <button className="btn secondary" onClick={retry}>
          {retryLabel}
        </button>
      )}
    </div>
  );
}
