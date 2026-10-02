// Agents left 'stopped' (by the manager, Esc in their terminal, a restart with every slot busy, or the office's own
// update) take no new work and keep their issue, so a stop nobody comes back to would cost a desk for good. After a
// while they go back to the pool, like an agent whose session failed does after its cooldown.

/**
 * How long a stopped agent keeps its task before it goes back to the pool: the manager can carry on in their terminal
 * or message them until then. It matches how long a developer's CLI waits at its prompt.
 */
export const STOPPED_RELEASE_MS = 30 * 60_000;

export interface StopCandidate {
  id: string;
  stopped: boolean;
  session: boolean; // its session is still winding down
}

/**
 * The agents due back in the pool. `since` (agent id → when it was first seen stopped with no session) is updated in
 * place: the clock starts once the session has ended, and anyone no longer stopped is forgotten.
 */
export function stoppedDue(agents: StopCandidate[], since: Map<string, number>, now: number, waitMs = STOPPED_RELEASE_MS): string[] {
  const due: string[] = [];
  const seen = new Set<string>();
  for (const a of agents) {
    if (!a.stopped || a.session) continue;
    seen.add(a.id);
    const t = since.get(a.id);
    if (t === undefined) since.set(a.id, now);
    else if (now - t >= waitMs) due.push(a.id);
  }
  for (const id of [...since.keys()]) if (!seen.has(id) || due.includes(id)) since.delete(id);
  return due;
}
