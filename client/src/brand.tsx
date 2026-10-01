import { BRAND, COMPANY_NAME } from '../../shared/brand';

// The C.E.S.T.I.S logo, drawn rather than loaded so it stays crisp on shirts, signs and screens:
// "CES" in black on a red block, "TIS" in white on a smaller blue block that sits beside it.
// Both versions (canvas and SVG) share one 356 x 151 design frame.

export const LOGO_W = 356;
export const LOGO_H = 151;
export const LOGO_FONT = 'Montserrat, "Arial Black", "Segoe UI Black", system-ui, sans-serif';

const RED = { x: 0, y: 0, w: 189, h: 151 };
const BLUE = { x: 189, y: 24, w: 167, h: 98 };

function fitText(ctx: CanvasRenderingContext2D, text: string, cx: number, cy: number, maxW: number, size: number, color: string) {
  ctx.font = `900 ${size}px ${LOGO_FONT}`;
  const w = ctx.measureText(text).width;
  const s = Math.min(1, maxW / w);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(s, 1);
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 0, 4);
  ctx.restore();
}

/** Draws the logo with its top-left corner at (x, y), `width` pixels wide. */
export function drawLogo(ctx: CanvasRenderingContext2D, x: number, y: number, width: number) {
  const k = width / LOGO_W;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(k, k);
  ctx.fillStyle = BRAND.red;
  ctx.fillRect(RED.x, RED.y, RED.w, RED.h);
  ctx.fillStyle = BRAND.blue;
  ctx.fillRect(BLUE.x, BLUE.y, BLUE.w, BLUE.h);
  fitText(ctx, 'CES', 95, 75, 178, 84, BRAND.ink);
  fitText(ctx, 'TIS', 270, 75, 140, 84, BRAND.white);
  ctx.restore();
}

/** The logo for HTML overlays. */
export function CestisLogo({ width = 180, title = COMPANY_NAME }: { width?: number; title?: string }) {
  return (
    <svg className="cestis-logo" width={width} height={(width / LOGO_W) * LOGO_H} viewBox={`0 0 ${LOGO_W} ${LOGO_H}`} role="img" aria-label={title}>
      <rect x={RED.x} y={RED.y} width={RED.w} height={RED.h} fill={BRAND.red} />
      <rect x={BLUE.x} y={BLUE.y} width={BLUE.w} height={BLUE.h} fill={BRAND.blue} />
      <text x={95} y={79} textAnchor="middle" dominantBaseline="middle" fontFamily={LOGO_FONT} fontWeight={900} fontSize={84} fill={BRAND.ink} textLength={178} lengthAdjust="spacingAndGlyphs">
        CES
      </text>
      <text x={270} y={79} textAnchor="middle" dominantBaseline="middle" fontFamily={LOGO_FONT} fontWeight={900} fontSize={84} fill={BRAND.white} textLength={140} lengthAdjust="spacingAndGlyphs">
        TIS
      </text>
    </svg>
  );
}
