import { IMG_W, IMG_H, IMG_PAD, IMG_URL, COLORS as C, GLOWS, ROW, fitText, initialOf, statCells, planYearImage } from './yearImageLogic.js';

const DISPLAY = '"Bricolage Grotesque", sans-serif';
const BODY = '"Inter", "Hiragino Sans", "Noto Sans JP", sans-serif';
const MONO = '"IBM Plex Mono", monospace';

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Draw the saved image (1080x1350) onto a fresh canvas and return it.
// `loadImg(url)` must resolve to a loaded <img> or null (never reject, never
// a tainted image); `posterUrl(path)` maps a TMDB path to a URL.
export async function renderYearImage(data, { loadImg, posterUrl }) {
  if (document.fonts && document.fonts.ready) {
    try { await document.fonts.ready; } catch (e) { /* ignore */ }
  }
  const W = IMG_W, H = IMG_H, P = IMG_PAD;
  const plan = planYearImage(data);
  const imgs = await Promise.all(plan.shows.map((sh) => loadImg(posterUrl(sh.poster))));

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  const spacing = (v) => { try { ctx.letterSpacing = v; } catch (e) { /* older browser */ } };
  const fit = (s, font, maxW) => { ctx.font = font; return fitText((t) => ctx.measureText(t).width, s, maxW); };
  const label = (s, x, y, align = 'left') => {
    ctx.font = `700 19px ${MONO}`; ctx.fillStyle = C.dim; ctx.textAlign = align;
    spacing('2px'); ctx.fillText(s, x, y); spacing('0px'); ctx.textAlign = 'left';
  };

  // background: flat card colour + the same two faint glows as the on-screen card
  ctx.fillStyle = C.card;
  ctx.fillRect(0, 0, W, H);
  for (const g of GLOWS) {
    const [r, gr, b] = g.rgb;
    ctx.save();
    ctx.translate(g.x * W, g.y * H);
    ctx.scale(g.rx * W, g.ry * H);
    const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    grad.addColorStop(0, `rgba(${r},${gr},${b},${g.alpha})`);
    grad.addColorStop(g.stop, `rgba(${r},${gr},${b},0)`);
    ctx.fillStyle = grad;
    ctx.fillRect(-2, -2, 4, 4);
    ctx.restore();
  }

  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';

  // label + year + delta
  label('YEAR IN REVIEW', P, plan.labelY);
  ctx.font = `800 176px ${DISPLAY}`;
  ctx.fillStyle = C.text;
  spacing('-3px');
  ctx.fillText(String(data.year), P - 6, plan.yearBase);
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

  // top shows as rows: rank, poster, name, "N eps"
  if (plan.shows.length) {
    label('TOP SHOWS', P, plan.showsLabelY);
    plan.shows.forEach((sh, i) => {
      const top = plan.rowsTop + i * ROW.pitch;
      const px = P + 52, pw = ROW.posterW, ph = ROW.posterH;
      const mid = top + ph / 2;

      ctx.font = `700 24px ${MONO}`; ctx.fillStyle = C.dim; ctx.textAlign = 'center';
      ctx.fillText(String(i + 1), P + 14, mid + 8); ctx.textAlign = 'left';

      ctx.save();
      rr(ctx, px, top, pw, ph, 10); ctx.clip();
      const im = imgs[i];
      if (im) {
        const ar = im.width / im.height, tar = pw / ph;
        let sw, sh2, sx, sy;
        if (ar > tar) { sh2 = im.height; sw = sh2 * tar; sx = (im.width - sw) / 2; sy = 0; }
        else { sw = im.width; sh2 = sw / tar; sx = 0; sy = (im.height - sh2) / 2; }
        ctx.drawImage(im, sx, sy, sw, sh2, px, top, pw, ph);
      } else {
        ctx.fillStyle = C.raise; ctx.fillRect(px, top, pw, ph);
        ctx.fillStyle = C.dim; ctx.font = `800 40px ${DISPLAY}`; ctx.textAlign = 'center';
        ctx.fillText(initialOf(sh.name), px + pw / 2, mid + 14); ctx.textAlign = 'left';
      }
      ctx.restore();
      ctx.strokeStyle = C.line; ctx.lineWidth = 1;
      rr(ctx, px, top, pw, ph, 10); ctx.stroke();

      const tx = px + pw + 28;
      const epsText = `${sh.count} eps`;
      ctx.font = `400 24px ${MONO}`;
      const epsW = ctx.measureText(epsText).width;
      ctx.fillStyle = C.text;
      ctx.font = `600 34px ${BODY}`;
      ctx.fillText(fit(sh.name, `600 34px ${BODY}`, W - P - epsW - 28 - tx), tx, mid + 12);
      ctx.fillStyle = C.dim; ctx.font = `400 24px ${MONO}`; ctx.textAlign = 'right';
      ctx.fillText(epsText, W - P, mid + 10); ctx.textAlign = 'left';
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

  // footer: brand left, URL right
  ctx.strokeStyle = C.line; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(P, plan.footerRule); ctx.lineTo(W - P, plan.footerRule); ctx.stroke();
  ctx.font = `800 34px ${DISPLAY}`;
  ctx.fillStyle = C.text; ctx.fillText('Watch', P, plan.footerBase);
  const ww = ctx.measureText('Watch').width;
  ctx.fillStyle = C.amber; ctx.fillText('Next', P + ww, plan.footerBase);
  ctx.font = `400 22px ${MONO}`; ctx.fillStyle = C.dim; ctx.textAlign = 'right';
  ctx.fillText(IMG_URL, W - P, plan.footerBase - 2); ctx.textAlign = 'left';

  return canvas;
}
