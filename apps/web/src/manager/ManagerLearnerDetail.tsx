import { useEffect, useState } from 'react';
import { api, type LearnerSummary } from '../pilot/api';
import { ErrorNote } from '../learner/ErrorNote';
import '../pilot/users.css';
import './manager.css';

/**
 * Read-only stub for `#manager/learner/<id>`: the learner's name and a way back to the table.
 * The progress detail screen replaces it.
 */
export function ManagerLearnerDetail({ id }: { id: string }) {
  const [state, setState] = useState<
    { id: string; learner: LearnerSummary } | { id: string; error: string } | null
  >(null);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    const ctrl = new AbortController();
    api<LearnerSummary>(`/manager/learners/${encodeURIComponent(id)}`, undefined, ctrl.signal)
      .then((learner) => setState({ id, learner }))
      .catch((e: Error) => {
        if (e.name !== 'AbortError') setState({ id, error: e.message });
      });
    return () => ctrl.abort();
  }, [id, reload]);
  const mine = state?.id === id ? state : null;
  return (
    <div className="users-admin manager-learners">
      <a className="manager-back" href="#manager">
        ← Danh sách học viên
      </a>
      {mine && 'error' in mine ? (
        <ErrorNote
          message={mine.error}
          retry={() => {
            setState(null);
            setReload((n) => n + 1);
          }}
        />
      ) : mine ? (
        <header className="users-head">
          <div>
            <h1>{mine.learner.displayName || mine.learner.username}</h1>
            {mine.learner.displayName && <p>{mine.learner.username}</p>}
            {mine.learner.disabled && (
              <span className="users-badge" data-state="off">
                Đã khóa
              </span>
            )}
          </div>
        </header>
      ) : (
        <p role="status" className="users-muted">
          Đang tải…
        </p>
      )}
    </div>
  );
}
