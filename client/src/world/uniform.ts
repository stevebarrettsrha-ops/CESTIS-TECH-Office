import * as THREE from 'three';
import { BRAND, badgeRole, isLightColor, staffNumber, STAFF_SHIRTS } from '../../../shared/brand';
import type { AgentRole } from '../../../shared/types';
import { drawLogo, LOGO_FONT, LOGO_H, LOGO_W } from '../brand';
import { hashId } from './appearance';
import { roundRect, SANS } from './draw';

// The C.E.S.T.I.S staff uniform: a polo in one of the staff colours, the logo on the chest, the company name across
// the back, and a clip-on name badge with the person's role. Prints that every shirt shares are drawn once and cached.

const STAFF_COLORS = new Set(STAFF_SHIRTS.map((s) => s.color.toLowerCase()));

/** The shirt someone wears: their own colour if it's in the staff range, otherwise one picked from it for them. */
export function staffShirt(agent: { id: string; color: string }) {
  if (STAFF_COLORS.has(agent.color.toLowerCase())) return agent.color;
  return STAFF_SHIRTS[hashId(agent.id) % STAFF_SHIRTS.length].color;
}

export function shirtName(color: string) {
  return STAFF_SHIRTS.find((s) => s.color.toLowerCase() === color.toLowerCase())?.name ?? 'Custom';
}

/** Collar and placket trim that stands out on the shirt. */
export function shirtTrim(color: string) {
  const c = color.toLowerCase();
  if (c === BRAND.red) return BRAND.blue;
  if (c === BRAND.blue) return BRAND.red;
  return isLightColor(color) ? BRAND.blue : '#ffffff';
}

function canvasTexture(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const paint = () => {
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, w, h);
    draw(ctx);
    tex.needsUpdate = true;
  };
  paint();
  // the logo font may arrive after the first paint
  document.fonts?.ready.then(paint);
  return tex;
}

const cache = new Map<string, THREE.CanvasTexture>();
function cached(key: string, make: () => THREE.CanvasTexture) {
  let t = cache.get(key);
  if (!t) cache.set(key, (t = make()));
  return t;
}

/** The small logo on the chest, with a thin white border so it reads on any shirt. */
export function chestLogoTexture() {
  return cached('chest', () =>
    canvasTexture(400, 190, (ctx) => {
      ctx.fillStyle = '#ffffff';
      roundRect(ctx, 6, 6, 388, 178, 10);
      ctx.fill();
      drawLogo(ctx, 22, 20, LOGO_W);
    }),
  );
}

/** Across the back: logo, then the company name, in ink on light shirts and white on dark ones. */
export function backPrintTexture(light: boolean) {
  return cached(`back-${light}`, () =>
    canvasTexture(512, 300, (ctx) => {
      const logoW = 300;
      const x = (512 - logoW) / 2;
      ctx.fillStyle = '#ffffff';
      roundRect(ctx, x - 8, 14, logoW + 16, (logoW / LOGO_W) * LOGO_H + 16, 8);
      ctx.fill();
      drawLogo(ctx, x, 22, logoW);
      ctx.fillStyle = light ? BRAND.ink : '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `900 46px ${LOGO_FONT}`;
      ctx.fillText('TECHNICAL', 256, 202);
      ctx.fillText('SERVICES', 256, 254);
    }),
  );
}

const ROLE_COLORS: Record<AgentRole, string> = { dev: BRAND.blue, qa: '#0f9d58', ceo: '#c9a227' };

/** The clip-on staff badge: logo strip, name, role band, staff number. */
export function drawBadge(ctx: CanvasRenderingContext2D, w: number, h: number, a: { id: string; name: string; role: AgentRole; title?: string }) {
  ctx.fillStyle = '#ffffff';
  roundRect(ctx, 0, 0, w, h, 18);
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.strokeStyle = '#1f1d2b';
  roundRect(ctx, 3, 3, w - 6, h - 6, 16);
  ctx.stroke();
  // header strip: red and blue, like the logo
  ctx.save();
  roundRect(ctx, 3, 3, w - 6, h - 6, 16);
  ctx.clip();
  ctx.fillStyle = BRAND.red;
  ctx.fillRect(0, 0, w * 0.55, 46);
  ctx.fillStyle = BRAND.blue;
  ctx.fillRect(w * 0.55, 0, w * 0.45, 46);
  ctx.restore();
  ctx.fillStyle = '#ffffff';
  ctx.font = `900 26px ${LOGO_FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('C.E.S.T.I.S STAFF', w / 2, 26);

  const fit = (text: string, size: number, weight: number, maxW: number) => {
    let s = size;
    ctx.font = `${weight} ${s}px ${SANS}`;
    while (s > 14 && ctx.measureText(text).width > maxW) ctx.font = `${weight} ${(s -= 2)}px ${SANS}`;
  };
  ctx.fillStyle = '#1f1d2b';
  fit(a.name, 64, 700, w - 30);
  ctx.fillText(a.name, w / 2, 100);

  const role = badgeRole(a).toUpperCase();
  ctx.fillStyle = ROLE_COLORS[a.role];
  roundRect(ctx, 14, 136, w - 28, 44, 10);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  fit(role, 30, 700, w - 48);
  ctx.fillText(role, w / 2, 159);

  ctx.fillStyle = '#6c757d';
  ctx.font = `600 20px ${SANS}`;
  ctx.fillText(staffNumber(a.id), w / 2, h - 22);
  ctx.textAlign = 'left';
}
