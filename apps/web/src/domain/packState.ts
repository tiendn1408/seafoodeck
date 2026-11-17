import type { AppState, ContentPack } from './models';

// Historical attempts remain in storage; only this pack contributes to its dashboard/review queue.
export function stateForPack(state: AppState, pack: ContentPack): AppState {
  const species = new Set(pack.species.map((s) => s.id));
  const scenarios = new Set(pack.scenarios.map((s) => s.id));
  const belongs = (r: { contentVersion: string; targetId: string; skill: string }) =>
    r.contentVersion === pack.version && (r.skill === 'hs' ? scenarios : species).has(r.targetId);
  return {
    ...state,
    attempts: state.attempts.filter(belongs),
    reviews: Object.fromEntries(Object.entries(state.reviews).filter(([, r]) => belongs(r))),
  };
}
