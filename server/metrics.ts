import fs from 'node:fs/promises';
import path from 'node:path';
import type { AgentTask, MetricsView, MetricsWindow } from '../shared/types.ts';

// The office's work log: one JSON line per thing that happens to a piece of work (picked up, a session ended, a QA
// verdict, a merge), appended to <SWARM_HOME>/events.jsonl. The productivity numbers on the phone come from it.
// State.json only holds the present; this keeps the history that throughput, cycle time and QA pass rate need.

export type WorkEvent =
  /** An agent started a task: an issue, a QA round or a fix. */
  | { at: number; kind: 'start'; repoId: string; agentId: string; task: AgentTask; issue: number | null; pr: number | null }
  /** A session ended. repoId is '' for the CEO. */
  | { at: number; kind: 'session'; repoId: string; agentId: string; task: AgentTask | null; ms: number; costUsd: number; ok: boolean }
  | { at: number; kind: 'verdict'; repoId: string; agentId: string; pr: number; round: number; pass: boolean }
  /** A swarm PR merged. credited: the agents whose Employee of the Month count it raised. */
  | { at: number; kind: 'merged'; repoId: string; pr: number; issue: number | null; credited: string[]; qaRounds: number; mergeFixes: number; openedAt: number | null };

/** Events older than this are dropped when the log loads. */
export const KEEP_MS = 30 * 24 * 60 * 60_000;
const HOUR = 60 * 60_000;
const DAY = 24 * HOUR;

const isEvent = (e: unknown): e is WorkEvent =>
  !!e && typeof e === 'object' && typeof (e as WorkEvent).at === 'number' && ['start', 'session', 'verdict', 'merged'].includes((e as WorkEvent).kind);

/** Parse the log's lines, skipping damaged ones (a crash mid-append) and anything older than `KEEP_MS`. */
export function parseLog(text: string, now: number): { events: WorkEvent[]; dropped: number } {
  const events: WorkEvent[] = [];
  let dropped = 0;
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    let e: unknown;
    try {
      e = JSON.parse(line);
    } catch {
      e = null;
    }
    if (isEvent(e) && e.at >= now - KEEP_MS) events.push(e);
    else dropped++;
  }
  events.sort((a, b) => a.at - b.at);
  return { events, dropped };
}

const median = (xs: number[]) => {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

const round = (x: number, places: number) => Math.round(x * 10 ** places) / 10 ** places;

/**
 * The numbers for one window ending now. `staff` is the developer and QA headcount, for utilization. A window longer
 * than the log only counts the time the log covers, so a new office isn't shown as idle for the days before it existed.
 */
export function metricsWindow(events: WorkEvent[], now: number, windowMs: number, staff: number): MetricsWindow {
  const from = now - windowMs;
  const firstPickUp = new Map<string, number>(); // `${repoId}#${issue}` → when it was first picked up
  for (const e of events) {
    if (e.kind !== 'start' || e.task !== 'issue' || e.issue == null) continue;
    const key = `${e.repoId}#${e.issue}`;
    if (!firstPickUp.has(key)) firstPickUp.set(key, e.at);
  }
  const inWindow = events.filter((e) => e.at >= from && e.at <= now);
  const merges = inWindow.filter((e) => e.kind === 'merged');
  const verdicts = inWindow.filter((e) => e.kind === 'verdict');

  const cycles: number[] = [];
  for (const m of merges) {
    const picked = m.issue == null ? undefined : firstPickUp.get(`${m.repoId}#${m.issue}`);
    const start = picked !== undefined && picked <= m.at ? picked : m.openedAt;
    if (start != null && start <= m.at) cycles.push((m.at - start) / 60_000);
  }

  let costUsd = 0;
  let busyMs = 0;
  for (const e of events) {
    if (e.kind !== 'session') continue;
    if (e.at >= from && e.at <= now) costUsd += e.costUsd;
    if (!e.repoId) continue; // the CEO isn't floor staff
    busyMs += Math.max(0, Math.min(e.at, now) - Math.max(e.at - e.ms, from)); // the part of the session inside the window
  }
  const span = events.length ? Math.min(windowMs, now - events[0].at) : 0;
  const available = staff * span;
  const median_ = median(cycles);

  return {
    merged: merges.length,
    medianCycleMin: median_ == null ? null : Math.round(median_),
    qaRounds: verdicts.length,
    qaPassRate: verdicts.length ? round(verdicts.filter((v) => v.pass).length / verdicts.length, 3) : null,
    avgQaRounds: merges.length ? round(merges.reduce((n, m) => n + m.qaRounds, 0) / merges.length, 2) : null,
    costUsd: round(costUsd, 2),
    costPerMerged: merges.length ? round(costUsd / merges.length, 2) : null,
    busyHours: round(busyMs / HOUR, 2),
    utilization: available > 0 ? round(Math.min(1, busyMs / available), 3) : null,
  };
}

/** The phone's productivity view: the last day, the last week and the week's daily rate. */
export function metricsView(events: WorkEvent[], now: number, staff: number): MetricsView {
  const since = events.length ? events[0].at : null;
  const week = metricsWindow(events, now, 7 * DAY, staff);
  // A log younger than a day still counts as one day, so a fresh office's first merge isn't extrapolated.
  const days = since == null ? 0 : Math.max(1, Math.min(7, (now - since) / DAY));
  return { since, day: metricsWindow(events, now, DAY, staff), week, perDay: days ? round(week.merged / days, 1) : null };
}

/** The log on disk: loaded once, then appended to line by line. */
export class WorkLog {
  events: WorkEvent[] = [];
  private writing: Promise<void> = Promise.resolve();

  constructor(private readonly file: string) {}

  async load(now = Date.now()) {
    let text = '';
    try {
      text = await fs.readFile(this.file, 'utf8');
    } catch {
      return; // no log yet
    }
    const { events, dropped } = parseLog(text, now);
    this.events = events;
    if (dropped === 0) return;
    // Rewrite without the old and damaged lines so the file doesn't grow forever.
    const tmp = `${this.file}.tmp`;
    await fs.writeFile(tmp, events.map((e) => `${JSON.stringify(e)}\n`).join(''));
    await fs.rename(tmp, this.file);
  }

  add(e: WorkEvent) {
    this.events.push(e);
    while (this.events.length && this.events[0].at < e.at - KEEP_MS) this.events.shift();
    const line = `${JSON.stringify(e)}\n`;
    this.writing = this.writing
      .then(() => fs.mkdir(path.dirname(this.file), { recursive: true }))
      .then(() => fs.appendFile(this.file, line))
      .catch((err) => console.warn('could not write the work log', err));
  }

  /** Was this PR's merge already logged (and so credited)? */
  hasMerged(repoId: string, pr: number) {
    return this.events.some((e) => e.kind === 'merged' && e.repoId === repoId && e.pr === pr);
  }

  /** Wait for pending appends, e.g. before the office stops. */
  flush() {
    return this.writing;
  }
}
