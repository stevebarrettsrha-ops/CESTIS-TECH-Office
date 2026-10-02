import { describe, expect, it } from 'vitest';
import { STALL_STOP_MS, STALL_WARN_MS, stallAction } from './watchdog.ts';

const NOW = new Date(2026, 9, 2, 12, 0).getTime();

describe('stallAction', () => {
  it('leaves a session alone while it shows signs of work', () => {
    expect(stallAction(NOW, NOW, false)).toBeNull();
    expect(stallAction(NOW, NOW - STALL_WARN_MS + 1, false)).toBeNull();
  });

  it('warns once when it goes quiet', () => {
    expect(stallAction(NOW, NOW - STALL_WARN_MS, false)).toBe('warn');
    expect(stallAction(NOW, NOW - STALL_WARN_MS, true)).toBeNull();
  });

  it('stops it once it has been quiet for the stop time, warned or not', () => {
    expect(stallAction(NOW, NOW - STALL_STOP_MS, true)).toBe('stop');
    expect(stallAction(NOW, NOW - STALL_STOP_MS - 60_000, false)).toBe('stop');
  });

  it('warns before it stops', () => {
    expect(STALL_WARN_MS).toBeLessThan(STALL_STOP_MS);
  });
});
