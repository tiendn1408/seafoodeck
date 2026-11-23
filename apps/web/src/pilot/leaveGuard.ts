/**
 * A screen holding something that cannot be shown again (an admin's own one-time password)
 * registers a question here; the shell asks it before sign-out or navigation discards it.
 */
let question: string | null = null;

/** Registers (or, with null, clears) the question. Returns a cleanup that clears only its own. */
export function setLeaveGuard(message: string | null): () => void {
  question = message;
  return () => {
    if (message !== null && question === message) question = null;
  };
}

export const leaveGuarded = () => question !== null;

/** True when nothing is guarded or the person agrees to lose it. */
export function confirmLeave(): boolean {
  return question === null || window.confirm(question);
}
