// The session watchdog: a session that shows no sign of work for a long time is stuck (a CLI waiting on a setup or
// trust screen, a question nobody answers, a dev server left running in the foreground) and would hold its desk and
// session slot forever. Signs of work are the session's own reports (log lines, tools, screenshots) and any output in
// its terminal, where a working CLI keeps its spinner moving. The manager is warned first; then the office stops the
// session and handles it like a failed one, so the work goes back to the queue.

/** Quiet this long: the manager is told, in the agent's log and on the phone. */
export const STALL_WARN_MS = 20 * 60_000;
/** Quiet this long: the office stops the session. Well past Claude Code's longest single command (10 minutes). */
export const STALL_STOP_MS = 30 * 60_000;

/** What to do about a running session last seen working at `lastSeen`. `warned`: the manager was already told. */
export function stallAction(now: number, lastSeen: number, warned: boolean): 'warn' | 'stop' | null {
  const quiet = now - lastSeen;
  if (quiet >= STALL_STOP_MS) return 'stop';
  if (quiet >= STALL_WARN_MS && !warned) return 'warn';
  return null;
}
