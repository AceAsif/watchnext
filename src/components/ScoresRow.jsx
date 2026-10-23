import React from 'react';
import useScores, { scoresOn } from './useScores.js';
import { chips } from './scoresLogic.js';

// IMDb ★ 8.1 (1.2M) · 🍅 94% · Metacritic 84 · TMDB 7.9 — each a link to that site.
// Hidden when the site has no OMDb key or nothing is known about the title.
export default function ScoresRow({ kind, tmdbId, name, known = null, compact = false, label = null, className = '' }) {
  const e = useScores(kind, scoresOn() ? tmdbId : null, known);
  if (!scoresOn() || !tmdbId) return null;
  const list = chips(e, kind, tmdbId, name);
  if (e && !list.length) return null;
  const wrap = (inner) => (label ? <div className={className} data-testid="scores-box"><span className="sd-lbl">{label}</span>{inner}</div> : inner);
  if (!e) return wrap(<div className="sd-scores" data-testid="scores" aria-busy="true"><span className="sd-scores-wait">Loading scores…</span></div>);
  return wrap(
    <div className={'sd-scores' + (compact ? ' compact' : '')} data-testid="scores">
      {list.map((c) => (
        <a key={c.id} className={`sd-score s-${c.id}${c.tone ? ` t-${c.tone}` : ''}`} href={c.url} target="_blank" rel="noopener noreferrer" title={c.title} aria-label={c.title}>
          <span className="lbl">{c.id === 'rt' ? 'RT' : c.label}</span>
          <span className="val">{c.value}</span>
          {c.sub ? <span className="sub">{c.sub}</span> : null}
        </a>
      ))}
    </div>
  );
}
