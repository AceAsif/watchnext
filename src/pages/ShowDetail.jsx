import React, { useEffect, useState } from 'react';
import { useStore } from '../store/useStore.js';
import {
  epKey,
  markEpisode,
  markSeason,
  toggleFollow,
  applyTmdbDetails,
  watchedCount,
} from '../store/db.js';
import { seasonDetails, resolveShow, hasKey, img } from '../api/tmdb.js';

function Check({ on, onClick, label }) {
  return (
    <button className={'check' + (on ? ' on' : '')} onClick={onClick} aria-label={label} aria-pressed={on}>
      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="3">
        <path d="M5 13l4 4 10-10" />
      </svg>
    </button>
  );
}

function Season({ id, show, season }) {
  const [eps, setEps] = useState(null);
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState(null);

  async function load() {
    if (eps || !show.tmdbId) return;
    try {
      const data = await seasonDetails(show.tmdbId, season.n);
      setEps(data.episodes || []);
    } catch (e) {
      setErr(e.message);
    }
  }

  const seenInSeason = Object.keys(show.watched || {}).filter(
    (k) => k.startsWith(season.n + 'x')
  ).length;
  const allSeen = season.count > 0 && seenInSeason >= season.count;

  return (
    <div className="season-block">
      <div className="season-head">
        <h3>
          Season {season.n}{' '}
          <span className="muted" style={{ fontWeight: 400, fontSize: 12 }}>
            {seenInSeason}/{season.count}
          </span>
        </h3>
        <div className="row">
          {eps && (
            <button
              className="btn"
              onClick={() => markSeason(id, season.n, eps, !allSeen)}
            >
              {allSeen ? 'Unmark season' : 'Mark season watched'}
            </button>
          )}
          <button
            className="btn"
            onClick={() => {
              setOpen(!open);
              if (!open) load();
            }}
          >
            {open ? 'Hide' : 'Episodes'}
          </button>
        </div>
      </div>
      {open && err && <p className="muted">{err}</p>}
      {open && !eps && !err && <p className="muted">Loading episodes…</p>}
      {open &&
        eps &&
        eps.map((ep) => {
          const k = epKey(season.n, ep.episode_number);
          const on = !!(show.watched || {})[k];
          return (
            <div className="ep-row" key={ep.id}>
              <Check
                on={on}
                label={`Mark S${season.n}E${ep.episode_number} ${on ? 'unwatched' : 'watched'}`}
                onClick={() =>
                  markEpisode(id, season.n, ep.episode_number, ep.runtime, !on)
                }
              />
              <span className="epcode">
                S{String(season.n).padStart(2, '0')}·E
                {String(ep.episode_number).padStart(2, '0')}
              </span>
              <div className="ep-name">
                {ep.name}
                {ep.air_date && <div className="airdate">{ep.air_date}</div>}
              </div>
            </div>
          );
        })}
    </div>
  );
}

export default function ShowDetail({ id, onBack }) {
  const state = useStore();
  const show = state.shows[id];
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    // Auto-sync a show that has never been resolved against TMDB.
    if (show && !show.lastSynced && hasKey() && !syncing) {
      setSyncing(true);
      resolveShow(show)
        .then((d) => d && applyTmdbDetails(id, d))
        .catch(() => {})
        .finally(() => setSyncing(false));
    }
  }, [id]);

  if (!show) {
    return (
      <div>
        <button className="back" onClick={onBack}>← Back</button>
        <p className="muted">Show not found.</p>
      </div>
    );
  }

  const seen = watchedCount(show);

  return (
    <div>
      <button className="back" onClick={onBack}>← Back</button>
      <div className="detail-hero">
        {show.poster ? (
          <img src={img(show.poster)} alt="" />
        ) : (
          <div className="noposter" style={{ width: 128, aspectRatio: '2/3' }}>
            {show.name}
          </div>
        )}
        <div>
          <h2>{show.name}</h2>
          <div className="stat-inline">
            <span>{seen} watched</span>
            {show.totalEpisodes ? <span>{show.totalEpisodes} total</span> : null}
            {show.status ? <span>{show.status}</span> : null}
            {show.nextAir ? <span>next: {show.nextAir.date}</span> : null}
          </div>
          <div className="row">
            <button className="btn" onClick={() => toggleFollow(id)}>
              {show.followed ? 'Unfollow' : 'Follow'}
            </button>
            {syncing && <span className="muted">Syncing with TMDB…</span>}
          </div>
        </div>
      </div>

      {!show.seasons?.length && !syncing && (
        <div className="notice">
          {hasKey()
            ? 'No episode data loaded yet. Use "Sync with TMDB" on the Shows tab, or reopen this page.'
            : 'Add a TMDB API key in Settings to load seasons and episodes.'}
        </div>
      )}

      {(show.seasons || []).map((season) => (
        <Season key={season.n} id={id} show={show} season={season} />
      ))}
    </div>
  );
}
