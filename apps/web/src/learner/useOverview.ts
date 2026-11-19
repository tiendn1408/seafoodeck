import { useEffect, useState } from 'react';
import { api, type CatalogOverview } from '../pilot/api';

/** `/catalog/overview` for the current release; reports the release id so the ledger can scope. */
export function useOverview(onVersion: (releaseId: string) => void) {
  const [overview, setOverview] = useState<CatalogOverview | null>(null),
    [error, setError] = useState(''),
    [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const c = new AbortController();
    api<CatalogOverview>('/catalog/overview', undefined, c.signal)
      .then((o) => {
        setOverview(o);
        setError('');
        onVersion(o.releaseId);
      })
      .catch((e) => {
        if (e.name !== 'AbortError') setError(e.message);
      });
    return () => c.abort();
  }, [attempt, onVersion]);
  return { overview, error, retry: () => setAttempt((n) => n + 1) };
}
