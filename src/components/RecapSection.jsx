import React, { useState } from 'react';
import { img } from '../api/tmdb.js';
import { Section, YearSelect } from './StatsUI.jsx';
import { renderPeriodImage } from './yearImageRender.js';
import { initialOf, deltaLine, factCells } from './yearImageLogic.js';
import { loadImg, canvasToBlob, downloadBlob, shareText } from './shareImage.js';

// One shareable "period" card: the on-screen card, a period picker, and the Share /
// Save image buttons. Year in review and Month in review are both just this with
// different words (YearInReview.jsx, MonthInReview.jsx). The saved PNG is drawn by
// yearImageRender.js and mirrors this layout and the same faint warm->teal wash
// (see .sd-yir in ui.css and GLOWS in yearImageLogic.js, kept in sync by a unit test).
//
// props: title, className, select { id, label, value, onChange, options },
//   data  { episodes, hours, movies, activeDays, topShows, epDelta, prevYear, topGenre,
//           busiestMonth | facts }   (planYearImage's shape)
//   big, sub        headline and optional small line under it ("2026", "September" + "2026 · so far")
//   imageCaption    small caption on the saved image
//   fileName, shareTitle, shareLine, errorLabel
export default function RecapSection({ title, className, select, data, big, sub, imageCaption, fileName, shareTitle, shareLine, errorLabel }) {
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const delta = deltaLine(data);
  const facts = factCells(data);

  // Render to a 1080x1350 (4:5) PNG with the Canvas API and download it. Posters load
  // cross-origin with a placeholder fallback, so the canvas never taints.
  async function downloadImage() {
    setSaving(true);
    try {
      const canvas = await renderPeriodImage(data, { loadImg, posterUrl: (p) => img(p) }, { label: imageCaption, big });
      downloadBlob(await canvasToBlob(canvas), fileName);
    } catch (e) {
      console.error(`${errorLabel} export failed`, e);
      alert('Sorry — could not generate the image.' + (e && e.message ? ` (${e.message})` : ''));
    } finally {
      setSaving(false);
    }
  }

  const share = async () => {
    const res = await shareText({ title: shareTitle, text: shareLine });
    if (res === 'copied') {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    }
  };

  return (
    <Section
      title={title}
      className={className}
      right={<YearSelect id={select.id} label={select.label} value={select.value} onChange={select.onChange} options={select.options} />}
    >
      <div className="sd-card sd-yir">
        <div className="sd-yir-top">
          <span className="sd-yir-year">{big}</span>
          {sub ? <span className="sd-yir-sub sd-mono">{sub}</span> : null}
          {delta && (
            <span className="sd-yir-delta" style={{ color: delta.up ? 'var(--teal)' : 'var(--text-dim)' }}>
              {delta.text}
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

        {facts.length > 0 && (
          <div className="sd-yir-facts">
            {facts.map(([k, v]) => (
              <div key={k}>
                <span className="sd-tile-l sd-tile-l--s">{k.charAt(0) + k.slice(1).toLowerCase()}</span>
                <span className="sd-yir-fact">{v}</span>
              </div>
            ))}
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
