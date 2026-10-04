import { IMG_W, IMG_PAD, COLORS as C, initialOf } from './yearImageLogic.js';
import { DISPLAY, BODY, rr, newCard, kit, drawCover, drawFooter } from './cardKit.js';
import { wrapTitle, planFinishImage } from './finishCardLogic.js';

// Draw the "You finished <show>" card (1080x1350) and return the canvas. `f` comes
// from finishFacts(); `loadImg(url)` resolves to a loaded <img> or null.
export async function renderFinishImage(f, { loadImg, posterUrl }) {
  const P = IMG_PAD;
  const poster = await loadImg(posterUrl(f.poster));
  const { canvas, ctx } = await newCard();
  const { spacing, width, fit, label } = kit(ctx);

  const title = wrapTitle((size, s) => { spacing('-2px'); const w = width(`800 ${size}px ${DISPLAY}`, s); spacing('0px'); return w; }, f.name, { maxW: IMG_W - 2 * P, maxLines: 2 });
  const plan = planFinishImage(f, title);

  label('YOU FINISHED', P, plan.labelY);
  ctx.font = `800 ${plan.titleSize}px ${DISPLAY}`;
  ctx.fillStyle = C.text;
  spacing('-2px');
  title.lines.forEach((line, i) => ctx.fillText(line, P - 4, plan.titleBases[i]));
  spacing('0px');

  // poster
  const { x, y, w, h } = plan.poster;
  ctx.save();
  rr(ctx, x, y, w, h, 22); ctx.clip();
  if (poster) {
    drawCover(ctx, poster, x, y, w, h);
  } else {
    ctx.fillStyle = C.raise; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = C.dim; ctx.font = `800 220px ${DISPLAY}`; ctx.textAlign = 'center';
    ctx.fillText(initialOf(f.name), x + w / 2, y + h / 2 + 76); ctx.textAlign = 'left';
  }
  ctx.restore();
  ctx.strokeStyle = C.line; ctx.lineWidth = 1;
  rr(ctx, x, y, w, h, 22); ctx.stroke();

  // stats down the right-hand side
  for (const s of plan.stats) {
    ctx.font = `800 72px ${DISPLAY}`;
    ctx.fillStyle = C.text;
    ctx.fillText(fit(s.value, `800 72px ${DISPLAY}`, plan.col.w - 8), plan.col.x, s.valueY);
    label(s.label, plan.col.x, s.labelY);
  }
  if (plan.starsY != null) {
    ctx.font = `400 46px ${BODY}`;
    for (let i = 0; i < 5; i++) { ctx.fillStyle = i < f.rating ? C.amber : '#2c3442'; ctx.fillText('★', plan.col.x + i * 56, plan.starsY); }
  }

  if (plan.datesLine) {
    ctx.font = `500 28px ${BODY}`;
    ctx.fillStyle = C.dim;
    ctx.fillText(fit(plan.datesLine, `500 28px ${BODY}`, IMG_W - 2 * P), P, plan.datesY);
  }

  drawFooter(ctx, plan.footerRule, plan.footerBase);
  return canvas;
}
