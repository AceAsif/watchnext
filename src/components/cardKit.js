// Canvas drawing pieces shared by every 1080x1350 share card (Year, Month,
// Finished): fonts, rounded rectangles, the warm->teal background, the footer.
// DOM/canvas only; the layout decisions live in the pure *Logic.js modules.

import { IMG_W, IMG_H, IMG_PAD, IMG_URL, COLORS as C, GLOWS, fitText } from './yearImageLogic.js';

export const DISPLAY = '"Bricolage Grotesque", sans-serif';
export const BODY = '"Inter", "Hiragino Sans", "Noto Sans JP", sans-serif';
export const MONO = '"IBM Plex Mono", monospace';

export function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Wait for the web fonts, then make a blank card canvas painted with the shared
// background (flat card colour + the same two faint glows as the on-screen cards).
export async function newCard() {
  if (document.fonts && document.fonts.ready) {
    try { await document.fonts.ready; } catch (e) { /* ignore */ }
  }
  const canvas = document.createElement('canvas');
  canvas.width = IMG_W;
  canvas.height = IMG_H;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = C.card;
  ctx.fillRect(0, 0, IMG_W, IMG_H);
  for (const g of GLOWS) {
    const [r, gr, b] = g.rgb;
    ctx.save();
    ctx.translate(g.x * IMG_W, g.y * IMG_H);
    ctx.scale(g.rx * IMG_W, g.ry * IMG_H);
    const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    grad.addColorStop(0, `rgba(${r},${gr},${b},${g.alpha})`);
    grad.addColorStop(g.stop, `rgba(${r},${gr},${b},0)`);
    ctx.fillStyle = grad;
    ctx.fillRect(-2, -2, 4, 4);
    ctx.restore();
  }
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  return { canvas, ctx };
}

// Text helpers bound to one context.
export function kit(ctx) {
  const spacing = (v) => { try { ctx.letterSpacing = v; } catch (e) { /* older browser */ } };
  const width = (font, s) => { ctx.font = font; return ctx.measureText(s).width; };
  const fit = (s, font, maxW) => { ctx.font = font; return fitText((t) => ctx.measureText(t).width, s, maxW); };
  const label = (s, x, y, align = 'left') => {
    ctx.font = `700 19px ${MONO}`; ctx.fillStyle = C.dim; ctx.textAlign = align;
    spacing('2px'); ctx.fillText(s, x, y); spacing('0px'); ctx.textAlign = 'left';
  };
  return { spacing, width, fit, label };
}

// Draw `im` into the box (x, y, w, h), cropping to fill (like CSS object-fit: cover).
export function drawCover(ctx, im, x, y, w, h) {
  const ar = im.width / im.height, tar = w / h;
  let sw, sh, sx, sy;
  if (ar > tar) { sh = im.height; sw = sh * tar; sx = (im.width - sw) / 2; sy = 0; }
  else { sw = im.width; sh = sw / tar; sx = 0; sy = (im.height - sh) / 2; }
  ctx.drawImage(im, sx, sy, sw, sh, x, y, w, h);
}

// Footer: a rule, "WatchNext" bottom-left, the app address bottom-right.
export function drawFooter(ctx, footerRule, footerBase) {
  const P = IMG_PAD, W = IMG_W;
  ctx.strokeStyle = C.line; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(P, footerRule); ctx.lineTo(W - P, footerRule); ctx.stroke();
  ctx.font = `800 34px ${DISPLAY}`;
  ctx.fillStyle = C.text; ctx.fillText('Watch', P, footerBase);
  const ww = ctx.measureText('Watch').width;
  ctx.fillStyle = C.amber; ctx.fillText('Next', P + ww, footerBase);
  ctx.font = `400 22px ${MONO}`; ctx.fillStyle = C.dim; ctx.textAlign = 'right';
  ctx.fillText(IMG_URL, W - P, footerBase - 2); ctx.textAlign = 'left';
}
