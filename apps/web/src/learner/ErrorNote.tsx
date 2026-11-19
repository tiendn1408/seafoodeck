export function ErrorNote({ message, retry }: { message: string; retry?: () => void }) {
  return (
    <div className="notice pilot-error" role="alert">
      <span>{message}</span>
      {retry && (
        <button className="btn secondary" onClick={retry}>
          Thử lại
        </button>
      )}
    </div>
  );
}
