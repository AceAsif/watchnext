import React, { useState } from 'react';
import { img } from '../api/tmdb.js';
import { Section, YearSelect } from './StatsUI.jsx';
import { renderYearImage } from './yearImageRender.js';
import { initialOf } from './yearImageLogic.js';

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

  // Render the card to a 1080x1350 (4:5) PNG with the Canvas API and download
  // it. The drawing lives in yearImageRender.js, the layout decisions in
  // yearImageLogic.js. Posters load cross-origin with a placeholder fallback,
  // so the canvas never taints.
  async function downloadImage() {
    setSaving(true);
    try {
      const canvas = await renderYearImage(data, { loadImg, posterUrl: (p) => img(p) });
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
      {/* On-screen card. The saved image (yearImageRender.js) mirrors this
          layout and the same faint warm->teal wash (see .sd-yir in ui.css and
          GLOWS in yearImageLogic.js — a unit test keeps them in sync). */}
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
            <span className="sd-tile-l sd-tile-l--s sd-yir-toplabel">Top shows</span>
            {data.topShows.slice(0, 3).map((sh) => (
              <div className="sd-yir-show" key={sh.name}>
                {sh.poster ? (
                  <img className="sd-yir-art" src={img(sh.poster, 'w342')} alt="" loading="lazy" />
                ) : (
                  <span className="sd-yir-art sd-yir-art--blank" aria-hidden="true">{initialOf(sh.name)}</span>
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
