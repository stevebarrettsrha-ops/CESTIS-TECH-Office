import { describe, expect, it } from 'vitest';
import { STOPPED_RELEASE_MS, stoppedDue } from './stopped.ts';

const NOW = new Date(2026, 9, 2, 12, 0).getTime();
const agent = (id: string, stopped = true, session = false) => ({ id, stopped, session });

describe('stoppedDue', () => {
  it('starts the clock when an agent is first seen stopped and releases it once the wait is over', () => {
    const since = new Map<string, number>();
    expect(stoppedDue([agent('ada')], since, NOW)).toEqual([]);
    expect(since.get('ada')).toBe(NOW);
    expect(stoppedDue([agent('ada')], since, NOW + STOPPED_RELEASE_MS - 1)).toEqual([]);
    expect(stoppedDue([agent('ada')], since, NOW + STOPPED_RELEASE_MS)).toEqual(['ada']);
    expect(since.has('ada')).toBe(false); // released: a later stop starts a fresh clock
  });

  it('waits for a stopped session to wind down before starting the clock', () => {
    const since = new Map<string, number>();
    expect(stoppedDue([agent('ada', true, true)], since, NOW)).toEqual([]);
    expect(since.has('ada')).toBe(false);
    stoppedDue([agent('ada')], since, NOW + 60_000);
    expect(since.get('ada')).toBe(NOW + 60_000);
  });

  it('forgets an agent that was resumed, so a later stop gets the full wait', () => {
    const since = new Map<string, number>([['ada', NOW - STOPPED_RELEASE_MS * 2]]);
    expect(stoppedDue([agent('ada', false)], since, NOW)).toEqual([]);
    expect(since.size).toBe(0);
    expect(stoppedDue([agent('ada')], since, NOW + 1)).toEqual([]);
  });

  it('forgets agents that were let go and leaves busy and idle ones alone', () => {
    const since = new Map<string, number>([['gone', NOW - STOPPED_RELEASE_MS]]);
    expect(stoppedDue([agent('ada', false), agent('grace', false, true)], since, NOW)).toEqual([]);
    expect(since.size).toBe(0);
  });

  it('takes a custom wait', () => {
    const since = new Map<string, number>([['ada', NOW - 10]]);
    expect(stoppedDue([agent('ada')], since, NOW, 10)).toEqual(['ada']);
  });
});
