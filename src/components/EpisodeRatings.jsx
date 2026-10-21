import React, { useMemo } from 'react';
import Stars from './Stars.jsx';
import { starLabel } from './starsLogic.js';
import { ratedEpisodes, bestEpisode, seasonLines, chartGeometry, average, epCode } from './epRatingsLogic.js';

const W = 320;
const H = 96;

// One season's rating line: a dot per rated episode, joined in episode order.
function SeasonChart({ line }) {
  const g = chartGeometry(line, W, H);
  return (
    <svg className="sd-epr-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Season ${line.n}: ${line.points.map((p) => `episode ${p.e} ${starLabel(p.r)} stars`).join(', ')}`}>
      {g.grid.map((l) => (
        <g key={l.label}>
          <line x1="0" x2={W} y1={l.y} y2={l.y} className="sd-epr-grid" />
        </g>
      ))}
      {g.path && <path d={g.path} className="sd-epr-line" />}
      {g.dots.map((d) => (
        <circle key={d.e} cx={d.x} cy={d.y} r="4.5" className={'sd-epr-dot' + (d.e === line.best.e ? ' best' : '')}>
          <title>{`E${d.e}${d.t ? ` · ${d.t}` : ''} · ${starLabel(d.r)}★`}</title>
        </circle>
      ))}
    </svg>
  );
}

// Show page → "Your episode ratings": your best episode, your average, and a rating line for
// every season you have rated something in. Hidden until you rate an episode.
export default function EpisodeRatings({ show }) {
  const rated = useMemo(() => ratedEpisodes(show), [show.epRatings]); // eslint-disable-line react-hooks/exhaustive-deps
  const lines = useMemo(() => seasonLines(rated, show.seasons), [rated, show.seasons]);
  if (!rated.length) return null;
  const best = bestEpisode(rated);
  return (
    <section className="sd-card sd-epr" data-testid="episode-ratings">
      <div className="sd-epr-head">
        <h2 className="sd-h2">Your episode ratings</h2>
        <span className="sd-mono sd-epr-meta">{rated.length} rated · avg ★{average(rated).toFixed(1)}</span>
      </div>

      <div className="sd-epr-best" data-testid="best-episode">
        <span className="sd-lbl">Best episode</span>
        <div className="sd-epr-best-row">
          <span className="sd-mono sd-epr-code">{epCode(best.ep)}</span>
          <span className="sd-epr-title">{best.ep.t || `Episode ${best.ep.e}`}</span>
          <Stars value={best.ep.r} readOnly size={16} />
        </div>
        {best.ties > 0 && <span className="sd-note">…and {best.ties} more rated {starLabel(best.ep.r)}★</span>}
      </div>

      {lines.map((l) => (
        <div key={l.n} className="sd-epr-season" data-season={l.n}>
          <div className="sd-epr-shead">
            <span className="sd-mono">S{String(l.n).padStart(2, '0')}</span>
            <span className="sd-epr-avg">avg ★{l.avg.toFixed(1)}</span>
            <span className="sd-mono sd-epr-meta">{l.points.length} of {l.count} rated</span>
          </div>
          <SeasonChart line={l} />
          <div className="sd-epr-axis sd-mono" aria-hidden="true"><span>E1</span><span>E{l.count}</span></div>
        </div>
      ))}
    </section>
  );
}
