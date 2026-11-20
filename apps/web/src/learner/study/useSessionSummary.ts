import { useEffect, useRef, useState } from 'react';
import { api, type SessionSummaryResponse } from '../../pilot/api';

/**
 * `GET /learning/sessions/:id/summary`, fetched once per session id the first time `enabled`
 * is true. Study enables it only for a student whose session was re-opened after a reload
 * (its restored results carry no `progress`); trial and staff never call it. A failure
 * leaves the summary without days, which it already handles.
 */
export function useSessionSummary(gameId: string, enabled: boolean): SessionSummaryResponse | null {
  const [state, setState] = useState<{ id: string; data: SessionSummaryResponse } | null>(null);
  const asked = useRef<string | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => void (mounted.current = false);
  }, []);
  useEffect(() => {
    if (!enabled || asked.current === gameId) return;
    asked.current = gameId;
    api<SessionSummaryResponse>(`/learning/sessions/${gameId}/summary`)
      .then((data) => {
        if (mounted.current) setState({ id: gameId, data });
      })
      .catch(() => {});
  }, [enabled, gameId]);
  return state?.id === gameId ? state.data : null;
}
