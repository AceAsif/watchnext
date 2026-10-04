import { IMG_W, IMG_PAD, COLORS as C, initialOf, statCells, planYearImage, posterBox } from './yearImageLogic.js';
import { DISPLAY, BODY, MONO, rr, newCard, kit, drawCover, drawFooter } from './cardKit.js';

// Largest font size (stepping down from `start`) at which the text fits `maxW`.
// `measureAt(size)` returns the text's pixel width at that size.
export function fitFontSize(measureAt, start, min, maxW) {
  let size = start;
  while (size > min && measureAt(size) > maxW) size -= 4;
  return Math.max(size, min);
}

// Draw a period card (Year in review or Month in review) at 1080x1350 and return
// the canvas. `data` has the same shape for both (see planYearImage); `big` is the
// huge headline text ("2026" or "September") and `label` the small caption above it.
// `loadImg(url)` must resolve to a loaded <img> or null (never reject, never a
// tainted image); `posterUrl(path)` maps a TMDB path to a URL.
export async function renderPeriodImage(data, { loadImg, posterUrl }, { label: caption, big }) {
  const W = IMG_W, P = IMG_PAD;
  const plan = planYearImage(data);
  const imgs = await Promise.all(plan.shows.map((sh) => loadImg(posterUrl(sh.poster))));
  const { canvas, ctx } = await newCard();
  const { spacing, width, fit, label } = kit(ctx);

  // caption + headline + delta
  label(caption, P, plan.labelY);
  const bigSize = fitFontSize((s) => { spacing('-3px'); const w = width(`800 ${s}px ${DISPLAY}`, big); spacing('0px'); return w; }, 176, 96, W - 2 * P);
  ctx.font = `800 ${bigSize}px ${DISPLAY}`;
  ctx.fillStyle = C.text;
  spacing('-3px');
  ctx.fillText(big, P - 6, plan.yearBase);
  spacing('0px');
  if (plan.delta) {
    ctx.font = `500 28px ${BODY}`;
    ctx.fillStyle = plan.delta.up ? C.teal : C.dim;
    ctx.fillText(plan.delta.text, P, plan.deltaY);
  }

  // four stats in one row (same as the on-screen card)
  const cw = (W - 2 * P) / 4;
  statCells(data).forEach(([v, l], i) => {
    const x = P + i * cw;
    ctx.font = `800 72px ${DISPLAY}`;
    ctx.fillStyle = C.text;
    ctx.fillText(fit(v, `800 72px ${DISPLAY}`, cw - 16), x, plan.statsValueY);
    label(l, x, plan.statsLabelY);
  });

  // top shows: three big posters across, name + "N eps" underneath
  if (plan.shows.length) {
    label('TOP SHOWS', P, plan.showsLabelY);
    plan.shows.forEach((sh, i) => {
      const { x, y, w: pw, h: ph } = posterBox(plan, i);
      ctx.save();
      rr(ctx, x, y, pw, ph, 16); ctx.clip();
      const im = imgs[i];
      if (im) {
        drawCover(ctx, im, x, y, pw, ph);
      } else {
        ctx.fillStyle = C.raise; ctx.fillRect(x, y, pw, ph);
        ctx.fillStyle = C.dim; ctx.font = `800 120px ${DISPLAY}`; ctx.textAlign = 'center';
        ctx.fillText(initialOf(sh.name), x + pw / 2, y + ph / 2 + 42); ctx.textAlign = 'left';
      }
      ctx.restore();
      ctx.strokeStyle = C.line; ctx.lineWidth = 1;
      rr(ctx, x, y, pw, ph, 16); ctx.stroke();

      ctx.fillStyle = C.text;
      ctx.font = `600 30px ${BODY}`;
      ctx.fillText(fit(sh.name, `600 30px ${BODY}`, pw - 4), x, plan.nameY);
      ctx.fillStyle = C.dim; ctx.font = `400 22px ${MONO}`;
      ctx.fillText(`${sh.count} eps`, x, plan.epsY);
    });
  }

  // facts
  if (plan.facts.length) {
    ctx.strokeStyle = C.line; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(P, plan.factsRule); ctx.lineTo(W - P, plan.factsRule); ctx.stroke();
    const colW = (W - 2 * P) / 2;
    plan.facts.forEach(([k, v], i) => {
      const x = P + i * colW;
      label(k, x, plan.factsLabelY);
      ctx.font = `700 34px ${BODY}`; ctx.fillStyle = C.text;
      ctx.fillText(fit(v, `700 34px ${BODY}`, colW - 24), x, plan.factsValueY);
    });
  }

  drawFooter(ctx, plan.footerRule, plan.footerBase);
  return canvas;
}

export const renderYearImage = (data, deps) =>
  renderPeriodImage(data, deps, { label: 'YEAR IN REVIEW', big: String(data.year) });
