import React from 'react';
import { img } from '../api/tmdb.js';
import { watchedCount } from '../store/db.js';

export default function PosterCard({ show, onOpen }) {
  const seen = watchedCount(show);
  const total = show.totalEpisodes || null;
  const pct = total ? Math.min(100, (seen / total) * 100) : 0;
  const done = total && seen >= total;

  return (
    <button className="poster-card" onClick={onOpen} title={show.name}>
      {show.poster ? (
        <img className="poster" src={img(show.poster)} alt="" loading="lazy" />
      ) : (
        <div className="noposter">{show.name}</div>
      )}
      <div className="title">{show.name}</div>
      <div className="meta">
        {total ? `${seen} / ${total} eps` : seen ? `${seen} eps seen` : 'not started'}
      </div>
      {total ? (
        <div className={'progress' + (done ? ' done' : '')}>
          <i style={{ width: pct + '%' }} />
        </div>
      ) : null}
    </button>
  );
}
