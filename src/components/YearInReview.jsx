import React, { useState } from 'react';
import { img } from '../api/tmdb.js';
import { Section, YearSelect } from './StatsUI.jsx';

// Public app URL — included in the share text so a screenshot/link points people
// back to WatchNext.
const APP_URL = 'https://aceasif.github.io/watchnext/';

// Load an image for canvas export. crossOrigin='anonymous' means it either
// loads clean (no canvas taint) or fails — it never taints. The cache-bust
// param forces a fresh CORS request rather than reusing the non-CORS <img>
// already cached by the card. Failures resolve to null so we can placeholder.
function loadImg(url) {
  return new Promise((resolve) => {
    if (!url) return resolve(null);
    const im = new Image();
    im.crossOrigin = 'anonymous';
    im.onload = () => resolve(im);
    im.onerror = () => resolve(null);
    im.src = url + (url.includes('?') ? '&' : '?') + 'cors=1';
  });
}

export default function YearInReview({ data, years, onYear }) {
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);

  // Render the card to a 1080x1400 PNG with the Canvas API and download it.
  // Hand-drawn (no dependency); posters are loaded cross-origin with a titled
  // placeholder fallback if TMDB blocks CORS, so the canvas never taints.
  async function downloadImage() {
    setSaving(true);
    try {
      const W = 1080, H = 1400, P = 60;
      const C = {
        card: '#171d28', line: '#232a35', text: '#e9ecf1', dim: '#8b95a5',
        amber: '#f2a33c', teal: '#56c8b5', raise: '#141922',
      };
      const canvas = document.createElement('canvas');
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext('2d');

      // background: base + two soft corner glows
      ctx.fillStyle = C.card;
      ctx.fillRect(0, 0, W, H);
      let g = ctx.createRadialGradient(0, 0, 0, 0, 0, W * 0.95);
      g.addColorStop(0, 'rgba(242,163,60,0.18)');
      g.addColorStop(0.55, 'rgba(242,163,60,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      g = ctx.createRadialGradient(W, H, 0, W, H, W * 0.95);
      g.addColorStop(0, 'rgba(86,200,181,0.16)');
      g.addColorStop(0.55, 'rgba(86,200,181,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);

      if (document.fonts && document.fonts.ready) {
        try { await document.fonts.ready; } catch (e) { /* ignore */ }
      }

      const DISPLAY = '"Bricolage Grotesque", sans-serif';
      const BODY = '"Inter", sans-serif';
      const MONO = '"IBM Plex Mono", monospace';
      const rr = (x, y, w, h, r) => {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + w, y, x + w, y + h, r);
        ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r);
        ctx.arcTo(x, y, x + w, y, r);
        ctx.closePath();
      };
      const spacing = (v) => { try { ctx.letterSpacing = v; } catch (e) { /* older browser */ } };
      const trunc = (s, font, maxW) => {
        ctx.font = font;
        if (ctx.measureText(s).width <= maxW) return s;
        let t = s;
        while (t.length > 1 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1);
        return t + '…';
      };

      let y = P;

      // header
      ctx.textBaseline = 'alphabetic';
      ctx.textAlign = 'left';
      ctx.font = `800 40px ${DISPLAY}`;
      ctx.fillStyle = C.text;
      ctx.fillText('Watch', P, y + 34);
      const ww = ctx.measureText('Watch').width;
      ctx.fillStyle = C.amber;
      ctx.fillText('Next', P + ww, y + 34);
      ctx.font = `700 20px ${MONO}`;
      spacing('3px');
      ctx.fillStyle = C.dim;
      ctx.textAlign = 'right';
      ctx.fillText('YEAR IN REVIEW', W - P, y + 30);
      ctx.textAlign = 'left';
      spacing('0px');
      y += 62;

      // year + delta
      ctx.font = `800 150px ${DISPLAY}`;
      ctx.fillStyle = C.text;
      ctx.fillText(String(data.year), P - 4, y + 120);
      y += 152;
      if (data.epDelta != null) {
        ctx.font = `500 26px ${BODY}`;
        ctx.fillStyle = C.dim;
        const arrow = data.epDelta >= 0 ? '▲' : '▼';
        ctx.fillText(
          `${arrow} ${Math.abs(data.epDelta)}% ${data.epDelta >= 0 ? 'more' : 'fewer'} episodes than ${data.prevYear}`,
          P, y + 20
        );
        y += 42;
      }
      y += 22;

      // 2x2 stat grid
      const gap = 20;
      const bw = (W - 2 * P - gap) / 2;
      const bh = 120;
      const stats = [
        [data.episodes.toLocaleString(), 'EPISODES'],
        [data.hours.toLocaleString(), 'HOURS'],
        [data.movies.toLocaleString(), 'MOVIES'],
        [data.activeDays.toLocaleString(), 'DAYS WATCHED'],
      ];
      stats.forEach((s, i) => {
        const bx = P + (i % 2) * (bw + gap);
        const by = y + Math.floor(i / 2) * (bh + gap);
        ctx.fillStyle = 'rgba(255,255,255,0.03)';
        rr(bx, by, bw, bh, 16); ctx.fill();
        ctx.strokeStyle = C.line; ctx.lineWidth = 1;
        rr(bx, by, bw, bh, 16); ctx.stroke();
        ctx.fillStyle = C.text; ctx.font = `800 52px ${DISPLAY}`;
        ctx.fillText(s[0], bx + 22, by + 64);
        ctx.fillStyle = C.dim; ctx.font = `700 18px ${MONO}`;
        spacing('2px');
        ctx.fillText(s[1], bx + 22, by + 98);
        spacing('0px');
      });
      y += 2 * bh + gap + 40;

      // top shows
      const shows = data.topShows.slice(0, 3);
      if (shows.length) {
        ctx.fillStyle = C.dim; ctx.font = `700 18px ${MONO}`;
        spacing('2px');
        ctx.fillText('TOP SHOWS', P, y);
        spacing('0px');
        y += 26;
        const tgap = 20;
        const tw = (W - 2 * P - 2 * tgap) / 3;
        const ph = tw * 1.5;
        const imgs = await Promise.all(shows.map((sh) => loadImg(img(sh.poster))));
        shows.forEach((sh, i) => {
          const tx = P + i * (tw + tgap);
          ctx.save();
          rr(tx, y, tw, ph, 12);
          ctx.clip();
          const im = imgs[i];
          if (im) {
            const ar = im.width / im.height;
            const tar = tw / ph;
            let sw, sh2, sx, sy;
            if (ar > tar) { sh2 = im.height; sw = sh2 * tar; sx = (im.width - sw) / 2; sy = 0; }
            else { sw = im.width; sh2 = sw / tar; sx = 0; sy = (im.height - sh2) / 2; }
            ctx.drawImage(im, sx, sy, sw, sh2, tx, y, tw, ph);
          } else {
            ctx.fillStyle = C.raise;
            ctx.fillRect(tx, y, tw, ph);
            ctx.fillStyle = C.dim;
            ctx.textAlign = 'center';
            ctx.fillText(trunc(sh.name, `700 22px ${DISPLAY}`, tw - 24), tx + tw / 2, y + ph / 2);
            ctx.textAlign = 'left';
          }
          ctx.restore();
          ctx.strokeStyle = C.line; ctx.lineWidth = 1;
          rr(tx, y, tw, ph, 12); ctx.stroke();
          ctx.fillStyle = C.text; ctx.font = `600 24px ${BODY}`;
          ctx.fillText(trunc(sh.name, `600 24px ${BODY}`, tw), tx, y + ph + 34);
          ctx.fillStyle = C.dim; ctx.font = `400 20px ${MONO}`;
          ctx.fillText(`${sh.count} eps`, tx, y + ph + 62);
        });
        y += ph + 92;
      }

      // divider + facts
      ctx.strokeStyle = C.line; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(P, y); ctx.lineTo(W - P, y); ctx.stroke();
      y += 40;
      const facts = [];
      if (data.busiestMonth) facts.push(['BUSIEST MONTH', data.busiestMonth.name]);
      if (data.topGenre) facts.push(['TOP GENRE', data.topGenre]);
      facts.forEach((f, i) => {
        const fx = P + i * 320;
        ctx.fillStyle = C.dim; ctx.font = `700 18px ${MONO}`;
        spacing('2px');
        ctx.fillText(f[0], fx, y);
        spacing('0px');
        ctx.fillStyle = C.text; ctx.font = `700 30px ${BODY}`;
        ctx.fillText(f[1], fx, y + 40);
      });

      // footer
      ctx.fillStyle = C.dim; ctx.font = `400 20px ${MONO}`;
      ctx.textAlign = 'right';
      ctx.fillText('aceasif.github.io/watchnext', W - P, H - P + 6);
      ctx.textAlign = 'left';

      const blob = await new Promise((res, rej) =>
        canvas.toBlob((b) => (b ? res(b) : rej(new Error('toBlob returned null'))), 'image/png')
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `watchnext-${data.year}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      console.error('Year in review export failed', e);
      alert('Sorry — could not generate the image.' + (e && e.message ? ` (${e.message})` : ''));
    } finally {
      setSaving(false);
    }
  }
  if (!data) return null;

  const share = async () => {
    const text = [
      `My ${data.year} in review on WatchNext:`,
      `${data.episodes.toLocaleString()} episodes (${data.hours.toLocaleString()} hrs) + ${data.movies} movie${data.movies === 1 ? '' : 's'}.`,
      data.topShows[0] ? `Top show: ${data.topShows[0].name}.` : '',
      data.busiestMonth ? `Busiest month: ${data.busiestMonth.name}.` : '',
    ].filter(Boolean).join(' ');

    try {
      if (navigator.share) {
        await navigator.share({ title: 'WatchNext — Year in Review', text, url: APP_URL });
        return;
      }
    } catch (e) {
      if (e && e.name === 'AbortError') return; // user dismissed the share sheet
    }
    try {
      await navigator.clipboard.writeText(`${text} ${APP_URL}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked — nothing more we can do without a dependency */
    }
  };

  return (
    <Section
      title="Year in review"
      className="a-yir"
      right={
        <YearSelect
          id="yir-year"
          label="Year"
          value={String(data.year)}
          onChange={onYear}
          options={years.map((y) => ({ value: y, label: y }))}
        />
      }
    >
      {/* On-screen card (Claude Design layout). The saved image is drawn
          separately by downloadImage() above and keeps its own layout. */}
      <div className="sd-card sd-yir">
        <div className="sd-yir-top">
          <span className="sd-yir-year">{data.year}</span>
          {data.epDelta != null && (
            <span className="sd-yir-delta" style={{ color: data.epDelta >= 0 ? 'var(--teal)' : 'var(--text-dim)' }}>
              {data.epDelta >= 0 ? '▲' : '▼'} {Math.abs(data.epDelta)}% {data.epDelta >= 0 ? 'more' : 'fewer'} episodes than {data.prevYear}
            </span>
          )}
        </div>

        <div className="sd-yir-stats">
          {[
            [data.episodes, 'Episodes'],
            [data.hours, 'Hours'],
            [data.movies, 'Movies'],
            [data.activeDays, 'Days'],
          ].map(([v, l]) => (
            <div key={l} data-stat={'yir-' + l.toLowerCase()}>
              <span className="sd-yir-v">{v.toLocaleString()}</span>
              <span className="sd-tile-l sd-tile-l--s">{l}</span>
            </div>
          ))}
        </div>

        {data.topShows.length > 0 && (
          <div className="sd-yir-top3">
            <span className="sd-tile-l sd-tile-l--s">Top shows</span>
            {data.topShows.map((sh, i) => (
              <div className="sd-yir-show" key={sh.name}>
                <span className="sd-mono sd-yir-rank">{i + 1}</span>
                {sh.poster ? (
                  <img className="sd-poster" src={img(sh.poster, 'w92')} alt="" loading="lazy" style={{ width: 28, height: 42, borderRadius: 5 }} />
                ) : (
                  <span className="sd-poster" aria-hidden="true" style={{ width: 28, height: 42, borderRadius: 5 }} />
                )}
                <span className="sd-yir-name" title={sh.name}>{sh.name}</span>
                <span className="sd-mono sd-yir-eps">{sh.count} eps</span>
              </div>
            ))}
          </div>
        )}

        {(data.busiestMonth || data.topGenre) && (
          <div className="sd-yir-facts">
            {data.busiestMonth && (
              <div><span className="sd-tile-l sd-tile-l--s">Busiest month</span><span className="sd-yir-fact">{data.busiestMonth.name}</span></div>
            )}
            {data.topGenre && (
              <div><span className="sd-tile-l sd-tile-l--s">Top genre</span><span className="sd-yir-fact">{data.topGenre}</span></div>
            )}
          </div>
        )}
      </div>

      <div className="sd-yir-actions">
        <button className="sd-btn primary" type="button" onClick={share}>
          {copied ? 'Copied!' : 'Share'}
        </button>
        <button className="sd-btn" type="button" onClick={downloadImage} disabled={saving}>
          {saving ? 'Rendering…' : 'Save image'}
        </button>
      </div>
    </Section>
  );
}
