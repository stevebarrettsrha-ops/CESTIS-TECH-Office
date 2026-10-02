import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { KEEP_MS, metricsView, metricsWindow, parseLog, staffTime, WorkLog, type WorkEvent } from './metrics.ts';

const NOW = new Date(2026, 9, 2, 12, 0).getTime();
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

const start = (at: number, issue: number, repoId = 'o/r'): WorkEvent => ({ at, kind: 'start', repoId, agentId: 'ada', task: 'issue', issue, pr: null });
const session = (at: number, ms: number, costUsd = 0, repoId = 'o/r'): WorkEvent => ({ at, kind: 'session', repoId, agentId: 'ada', task: 'issue', ms, costUsd, ok: true });
const verdict = (at: number, pass: boolean): WorkEvent => ({ at, kind: 'verdict', repoId: 'o/r', agentId: 'poirot', pr: 1, round: 1, pass });
const staff = (at: number, count: number): WorkEvent => ({ at, kind: 'staff', count });
const merged = (at: number, pr: number, issue: number | null, over: Partial<Extract<WorkEvent, { kind: 'merged' }>> = {}): WorkEvent => ({
  at,
  kind: 'merged',
  repoId: 'o/r',
  pr,
  issue,
  credited: ['ada'],
  qaRounds: 1,
  mergeFixes: 0,
  openedAt: null,
  ...over,
});

describe('metricsWindow', () => {
  it('is empty with no events', () => {
    expect(metricsWindow([], NOW, DAY, 3)).toEqual({
      merged: 0,
      medianCycleMin: null,
      qaRounds: 0,
      qaPassRate: null,
      avgQaRounds: null,
      costUsd: 0,
      costPerMerged: null,
      busyHours: 0,
      utilization: null,
    });
  });

  it('counts only merges inside the window', () => {
    const events = [merged(NOW - 2 * DAY, 1, null), merged(NOW - HOUR, 2, null), merged(NOW - MIN, 3, null)];
    expect(metricsWindow(events, NOW, DAY, 1).merged).toBe(2);
    expect(metricsWindow(events, NOW, 7 * DAY, 1).merged).toBe(3);
  });

  it('measures cycle time from the first pick-up of the issue, even one before the window', () => {
    const events = [start(NOW - 30 * HOUR, 7), start(NOW - 5 * HOUR, 7), merged(NOW - HOUR, 70, 7)];
    expect(metricsWindow(events, NOW, DAY, 1).medianCycleMin).toBe(29 * 60);
  });

  it('falls back to when the PR was opened when the pick-up was not logged', () => {
    const events = [merged(NOW - HOUR, 1, 9, { openedAt: NOW - 3 * HOUR }), merged(NOW - HOUR, 2, null, { openedAt: NOW - 2 * HOUR }), merged(NOW - HOUR, 3, null)];
    expect(metricsWindow(events, NOW, DAY, 1).medianCycleMin).toBe(90); // median of 120 and 60; the third has no start
  });

  it('works out the QA pass rate and rounds per merged PR', () => {
    const events = [verdict(NOW - 3 * HOUR, false), verdict(NOW - 2 * HOUR, true), verdict(NOW - HOUR, true), merged(NOW - MIN, 1, null, { qaRounds: 2 }), merged(NOW - MIN, 2, null, { qaRounds: 1 })];
    const w = metricsWindow(events, NOW, DAY, 1);
    expect(w.qaRounds).toBe(3);
    expect(w.qaPassRate).toBeCloseTo(0.667, 3);
    expect(w.avgQaRounds).toBe(1.5);
  });

  it('divides the cost, CEO included, by the merges', () => {
    const events = [session(NOW - 2 * HOUR, HOUR, 1.25), session(NOW - HOUR, HOUR, 0.75, ''), merged(NOW - MIN, 1, null), session(NOW - 2 * DAY, HOUR, 9)];
    const w = metricsWindow(events, NOW, DAY, 1);
    expect(w.costUsd).toBe(2);
    expect(w.costPerMerged).toBe(2);
  });

  it('counts only floor staff time inside the window as busy', () => {
    // 2h session ending 23h ago that began 25h ago: 1h of it is inside the day. The CEO's hour doesn't count.
    const events = [session(NOW - 23 * HOUR, 2 * HOUR), session(NOW - HOUR, HOUR, 0, '')];
    expect(metricsWindow(events, NOW, DAY, 1).busyHours).toBe(1);
  });

  it('works out utilization over the time the log covers, not before the office existed', () => {
    const events = [start(NOW - 4 * HOUR, 1), session(NOW - 2 * HOUR, 2 * HOUR), session(NOW - HOUR, 2 * HOUR)];
    // 2 staff × 4h covered = 8h available, 4h busy
    expect(metricsWindow(events, NOW, 7 * DAY, 2).utilization).toBe(0.5);
    expect(metricsWindow(events, NOW, 7 * DAY, 0).utilization).toBeNull();
  });
});

describe('staffTime', () => {
  const T0 = NOW - 4 * HOUR;

  it('counts a hire from when they joined', () => {
    const events = [staff(T0, 1), staff(T0 + 2 * HOUR, 2)];
    expect(staffTime(events, NOW - DAY, NOW, 99)).toBe(1 * 2 * HOUR + 2 * 2 * HOUR);
  });

  it('counts someone let go until they left', () => {
    const events = [staff(T0, 3), staff(T0 + HOUR, 1)];
    expect(staffTime(events, NOW - DAY, NOW, 99)).toBe(3 * HOUR + 1 * 3 * HOUR);
  });

  it('does not count time the office was off', () => {
    const events = [staff(T0, 2), staff(T0 + HOUR, 0), staff(T0 + 3 * HOUR, 2)];
    expect(staffTime(events, NOW - DAY, NOW, 99)).toBe(2 * HOUR + 0 + 2 * HOUR);
  });

  it('starts at the window, carrying in the headcount from before it', () => {
    const events = [staff(NOW - 3 * DAY, 4), staff(NOW - 2 * HOUR, 1)];
    expect(staffTime(events, NOW - DAY, NOW, 99)).toBe(4 * (DAY - 2 * HOUR) + 1 * 2 * HOUR);
  });

  it('starts when the log began, assuming the first headcount until it was logged, and ignores later ones', () => {
    const events = [start(T0, 1), staff(T0 + HOUR, 2), staff(NOW + HOUR, 9)];
    expect(staffTime(events, NOW - DAY, NOW, 99)).toBe(2 * 4 * HOUR);
  });

  it('uses the current headcount for a log without headcounts, and nothing for an empty log', () => {
    expect(staffTime([start(T0, 1)], NOW - DAY, NOW, 3)).toBe(3 * 4 * HOUR);
    expect(staffTime([], NOW - DAY, NOW, 3)).toBe(0);
  });

  it('feeds utilization: a hire mid-window does not water it down', () => {
    // One developer busy 2h of the first 2h; a second hired at T0+2h, both busy for the last 2h: fully used.
    const events = [staff(T0, 1), session(T0 + 2 * HOUR, 2 * HOUR), staff(T0 + 2 * HOUR, 2), session(NOW, 2 * HOUR), session(NOW, 2 * HOUR)];
    expect(metricsWindow(events, NOW, DAY, 2).utilization).toBe(1);
    // Counted with today's headcount over the whole span it would read 6h / 8h.
  });
});

describe('metricsView', () => {
  it('gives the daily rate over the week, counting a young log as one day', () => {
    const young = [merged(NOW - 2 * HOUR, 1, null), merged(NOW - HOUR, 2, null), merged(NOW - MIN, 3, null)];
    expect(metricsView(young, NOW, 2).perDay).toBe(3);
    const older = [start(NOW - 10 * DAY, 1), ...Array.from({ length: 14 }, (_, i) => merged(NOW - i * 10 * HOUR, i + 1, null))];
    expect(metricsView(older, NOW, 2).perDay).toBe(2); // 14 merged in the last 7 days
    expect(metricsView([], NOW, 2)).toMatchObject({ since: null, perDay: null });
  });
});

describe('parseLog', () => {
  it('reads headcounts', () => {
    expect(parseLog(JSON.stringify(staff(NOW - HOUR, 3)), NOW).events).toEqual([staff(NOW - HOUR, 3)]);
  });

  it('skips damaged lines and events past KEEP_MS, and sorts by time', () => {
    const text = [JSON.stringify(merged(NOW - HOUR, 2, null)), '{"at": 1, "kind": "merg', JSON.stringify(start(NOW - KEEP_MS - 1, 1)), '', JSON.stringify(start(NOW - 2 * HOUR, 5)), '{"kind":"unknown","at":5}'].join('\n');
    const { events, dropped } = parseLog(text, NOW);
    expect(events.map((e) => e.kind)).toEqual(['start', 'merged']);
    expect(dropped).toBe(3);
  });
});

describe('WorkLog', () => {
  let dir = '';
  afterEach(async () => {
    if (dir) await fs.rm(dir, { recursive: true, force: true, maxRetries: 5 });
  });

  it('appends events, reads them back and drops stale lines on load', async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'worklog-'));
    const file = path.join(dir, 'nested', 'events.jsonl');
    const log = new WorkLog(file);
    log.add(start(NOW - KEEP_MS - DAY, 1));
    log.add(merged(NOW - HOUR, 4, 1));
    await log.flush();
    expect(log.hasMerged('o/r', 4)).toBe(true);
    expect(log.hasMerged('o/r', 5)).toBe(false);

    const again = new WorkLog(file);
    await again.load(NOW);
    expect(again.events).toHaveLength(1);
    expect((await fs.readFile(file, 'utf8')).trim().split('\n')).toHaveLength(1); // rewritten without the stale line
  });

  it('starts empty when there is no log yet', async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'worklog-'));
    const log = new WorkLog(path.join(dir, 'events.jsonl'));
    await log.load(NOW);
    expect(log.events).toEqual([]);
  });
});
