// The company brand, shared by the office (client) and the server: name, colours and the staff shirt range.

export const COMPANY_NAME = 'C.E.S.T.I.S TECHNICAL SERVICES';
export const COMPANY_SHORT = 'C.E.S.T.I.S';
export const COMPANY_TAGLINE = 'Technical Services · powered by a team of AI agents';
export const APP_NAME = 'C.E.S.T.I.S Office';

export const BRAND = {
  red: '#e72b28',
  blue: '#004aad',
  ink: '#111111',
  white: '#ffffff',
  gold: '#ffc93c',
} as const;

/** The staff shirt range: every hired person gets one of these, and the manager can swap it later. */
export const STAFF_SHIRTS: { name: string; color: string }[] = [
  { name: 'CESTIS Red', color: '#e72b28' },
  { name: 'CESTIS Blue', color: '#004aad' },
  { name: 'Crisp White', color: '#f4f5f7' },
  { name: 'Midnight Black', color: '#23232e' },
  { name: 'Sunshine Gold', color: '#ffbe0b' },
  { name: 'Island Green', color: '#2a9d8f' },
  { name: 'Sky Blue', color: '#3fa7f5' },
  { name: 'Mango Orange', color: '#fb6a1e' },
  { name: 'Royal Purple', color: '#7b3fe4' },
  { name: 'Mint', color: '#06d6a0' },
  { name: 'Hibiscus Pink', color: '#f15bb5' },
  { name: 'Steel Grey', color: '#6c757d' },
];

/** Whether text printed on a shirt of this colour should be dark (light shirts) or white (dark shirts). */
export function isLightColor(hex: string) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return false;
  const n = parseInt(m[1], 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return 0.299 * r + 0.587 * g + 0.114 * b > 170;
}

/** The job title printed on a staff badge. */
export function badgeRole(a: { role: 'dev' | 'qa' | 'ceo'; title?: string }) {
  if (a.role === 'ceo') return 'Chief Executive Officer';
  if (a.title?.trim()) return a.title.trim();
  return a.role === 'qa' ? 'QA Tester' : 'Software Developer';
}

/** A staff number for the badge, stable for the same person. */
export function staffNumber(id: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `CTS-${String((h >>> 0) % 10000).padStart(4, '0')}`;
}
