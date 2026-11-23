import { useEffect, useRef, useState } from 'react';
import { api, ApiError, type LearnerSummary } from '../pilot/api';
import { ErrorNote } from '../learner/ErrorNote';
import { Progress } from '../learner/Progress';
import { Review } from '../learner/Review';
import type { LearnerSource } from '../learner/meStore';
import '../pilot/users.css';
import './manager.css';

const stamp = new Intl.DateTimeFormat('vi-VN', {
  timeZone: 'Asia/Ho_Chi_Minh',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});
const dayOnly = new Intl.DateTimeFormat('vi-VN', {
  timeZone: 'Asia/Ho_Chi_Minh',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});
function When({ at, withTime }: { at: string; withTime?: boolean }) {
  const t = new Date(at);
  if (Number.isNaN(t.getTime())) return <>—</>;
  return <time dateTime={at}>{(withTime ? stamp : dayOnly).format(t)}</time>;
}

const BACK = (
  <a className="manager-back" href="#manager">
    ← Danh sách học viên
  </a>
);

type State =
  { id: string; learner: LearnerSummary } | { id: string; error: string; missing: boolean } | null;

/**
 * `#manager/learner/<id>`: one learner's progress and review schedule for a manager, read-only.
 * Everything comes from `/manager/learners/<id>/...`; nothing here calls `/me/*` or writes.
 * `userId` is the signed-in manager (the cache key owner); the learner id is part of every path,
 * so two learners never share a cache entry.
 */
export function ManagerLearnerDetail({ id, userId }: { id: string; userId: string }) {
  const [state, setState] = useState<State>(null);
  const [reload, setReload] = useState(0);
  const head = useRef<HTMLHeadingElement>(null);
  const base = `/manager/learners/${encodeURIComponent(id)}`;
  useEffect(() => {
    const ctrl = new AbortController();
    api<LearnerSummary>(base, undefined, ctrl.signal)
      .then((learner) => setState({ id, learner }))
      .catch((e: Error) => {
        if (e.name === 'AbortError') return;
        const missing = e instanceof ApiError && e.status === 404;
        setState({ id, error: e.message, missing });
      });
    return () => ctrl.abort();
  }, [id, base, reload]);
  const mine = state?.id === id ? state : null;
  const loaded = mine && 'learner' in mine;
  // Move focus to the heading once the learner is there, so a route change is announced.
  useEffect(() => {
    if (loaded) head.current?.focus();
  }, [loaded, id]);

  if (!mine)
    return (
      <div className="users-admin manager-learners">
        {BACK}
        <p role="status" className="users-muted">
          Đang tải…
        </p>
      </div>
    );
  if ('error' in mine)
    return (
      <div className="users-admin manager-learners">
        {BACK}
        {mine.missing ? (
          <p className="users-empty" role="alert">
            Không tìm thấy học viên.
          </p>
        ) : (
          <ErrorNote
            message={mine.error}
            retry={() => {
              setState(null);
              setReload((n) => n + 1);
            }}
          />
        )}
      </div>
    );
  const { learner } = mine;
  const source: LearnerSource = {
    progress: `${base}/progress`,
    mastery: `${base}/mastery`,
    review: `${base}/review`,
  };
  return (
    <div className="users-admin manager-learners manager-detail" key={id}>
      {BACK}
      <header className="users-head">
        <div>
          <h1 ref={head} tabIndex={-1}>
            Học viên: {learner.displayName || learner.username}
          </h1>
          {learner.displayName && <p>{learner.username}</p>}
          {learner.disabled && (
            <span className="users-badge" data-state="off">
              Đã khóa
            </span>
          )}
          <dl className="manager-meta">
            <div>
              <dt>Đăng nhập gần nhất</dt>
              <dd>
                {learner.lastLoginAt ? (
                  <When at={learner.lastLoginAt} withTime />
                ) : (
                  <span className="users-muted">Chưa đăng nhập</span>
                )}
              </dd>
            </div>
            {learner.createdAt && (
              <div>
                <dt>Ngày tạo</dt>
                <dd>
                  <When at={learner.createdAt} />
                </dd>
              </div>
            )}
          </dl>
        </div>
      </header>
      <Progress userId={userId} source={source} readOnly />
      <Review userId={userId} source={source} readOnly />
    </div>
  );
}
