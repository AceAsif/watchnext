import React from 'react';
import { img } from '../api/tmdb.js';
import { codeOf } from './upnextLogic.js';

// Small pieces shared by the Up Next agenda list and the calendar's selected-day
// list, so both views look the same. Styling lives in ui.css (sd-*).

// A show poster at a fixed size, or the gradient placeholder when there isn't one.
export function Poster({ path, w, h, r = 5 }) {
  const box = { width: w, height: h, borderRadius: r };
  return path ? (
    <img className="sd-poster" src={img(path, 'w92')} alt="" loading="lazy" style={box} />
  ) : (
    <span className="sd-poster" aria-hidden="true" style={box} />
  );
}

// One upcoming episode: poster, show name, "S06·E03  Episode title". Tapping
// opens the show. `it` is { id, show, s, e, name, date }.
export function EpisodeRow({ it, onOpen, divider }) {
  return (
    <button
      className="sd-open"
      onClick={() => onOpen(it.id)}
      style={{
        width: '100%',
        padding: '10px 12px',
        gap: 10,
        borderTop: divider ? '1px solid var(--sd-line-soft)' : 'none',
      }}
    >
      <Poster path={it.show.poster} w={32} h={48} />
      <span style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
        <span style={{ fontSize: 14, fontWeight: 600, overflowWrap: 'anywhere' }}>{it.show.name}</span>
        <span style={{ fontSize: 12, color: 'var(--text-dim)', overflowWrap: 'anywhere' }}>
          <span className="sd-mono" style={{ color: 'var(--amber)' }}>{codeOf(it.s, it.e)}</span>
          {it.name ? ` ${it.name}` : ''}
        </span>
      </span>
    </button>
  );
}
