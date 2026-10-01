import { describe, expect, it } from 'vitest';
import { cheerFor, highFive, onCelebrate, onHighFive, officeJam } from './staffFun';

describe('staff fun', () => {
  it('busy people keep their cheer short', () => {
    expect(['Quick one!', 'Still coding!', 'On it!', 'Nearly done!']).toContain(cheerFor(true, 0.5));
    expect(cheerFor(false, 0)).toBe('Yeah!');
  });

  it('only reaches people who are in the building', () => {
    const heard: string[] = [];
    const off = onHighFive('ada', (t) => heard.push(t));
    expect(highFive('ada', 'Irie!')).toBe(true);
    expect(highFive('nobody', 'Irie!')).toBe(false);
    off();
    expect(highFive('ada', 'again')).toBe(false);
    expect(heard).toEqual(['Irie!']);
  });

  it('an office jam celebrates and gets everyone cheering', () => {
    const reasons: string[] = [];
    const cheers: string[] = [];
    const a = onCelebrate((r) => reasons.push(r));
    const b = onHighFive('linus', (t) => cheers.push(t));
    officeJam(2);
    a();
    b();
    expect(reasons).toEqual(['Office jam on floor 2! 🎶']);
    expect(cheers).toHaveLength(1);
  });
});
