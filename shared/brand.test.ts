import { describe, expect, it } from 'vitest';
import { badgeRole, isLightColor, staffNumber, STAFF_SHIRTS } from './brand';

describe('brand', () => {
  it('reads light and dark shirts', () => {
    expect(isLightColor('#f4f5f7')).toBe(true);
    expect(isLightColor('#ffbe0b')).toBe(true);
    expect(isLightColor('#004aad')).toBe(false);
    expect(isLightColor('#23232e')).toBe(false);
    expect(isLightColor('nope')).toBe(false);
  });

  it('names the role on the badge', () => {
    expect(badgeRole({ role: 'ceo' })).toBe('Chief Executive Officer');
    expect(badgeRole({ role: 'qa', title: '' })).toBe('QA Tester');
    expect(badgeRole({ role: 'dev', title: '' })).toBe('Software Developer');
    expect(badgeRole({ role: 'dev', title: ' Three.js engineer ' })).toBe('Three.js engineer');
  });

  it('gives a stable staff number', () => {
    expect(staffNumber('a1')).toBe(staffNumber('a1'));
    expect(staffNumber('a1')).toMatch(/^CTS-\d{4}$/);
  });

  it('has unique shirt colours', () => {
    expect(new Set(STAFF_SHIRTS.map((s) => s.color)).size).toBe(STAFF_SHIRTS.length);
  });
});
