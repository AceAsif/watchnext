import React, { useMemo } from 'react';
import { useStore } from '../store/useStore.js';
import {
  toggleWatchlist,
  startWatchingShow,
  markPlannedMovieWatched,
  removeMovie,
  movieStatus,
} from '../store/db.js';
import { img } from '../api/tmdb.js';

export default function Watchlist({ openShow }) {
  const state = useStore();

  // A show can only be a watchlist item while it isn't followed yet —
  // once "Start watching" clears watchlist and sets followed, it belongs
  // to the Shows/Up Next tabs instead. The !s.followed guard is a safety
  // net in case a record ever ends up with both flags set.
  const shows = useMemo(() => {
    const list = Object.entries(state.shows).filter(
      ([, s]) => s.watchlist && !s.followed
    );
    list.sort((a, b) => a[1].name.localeCompare(b[1].name));
    return list;
  }, [state.shows]);

  const movies = useMemo(() => {
    return state.movies
      .map((m, index) => ({ ...m, index }))
      .filter((m) => movieStatus(m) === 'planned')
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }, [state.movies]);

  const empty = shows.length === 0 && movies.length === 0;

  return (
    <div>
      {empty && (
        <div className="notice accent">
          <strong>Nothing queued up yet.</strong>
          <br />
          Search for a show or movie on the Shows or Movies tab and use
          "＋ Watchlist" to plan it for later without marking it watched.
        </div>
      )}

      {shows.length > 0 && (
        <>
          <h2 className="section" style={{ marginTop: 6 }}>
            Shows to watch <span className="muted">({shows.length})</span>
          </h2>
          {shows.map(([id, show]) => (
            <div key={id} className="movie-row">
              {show.poster ? (
                <img src={img(show.poster, 'w154')} alt="" loading="lazy" />
              ) : (
                <div className="thumb" />
              )}
              <div className="info">
                <div className="name">{show.name}</div>
                {show.genres && show.genres.length ? (
                  <div className="detail">{show.genres.slice(0, 3).join(', ')}</div>
                ) : null}
                <div className="actions">
                  <button className="btn primary" onClick={() => startWatchingShow(id)}>
                    Start watching
                  </button>
                  {openShow && (
                    <button className="btn" onClick={() => openShow(id)}>
                      Details
                    </button>
                  )}
                  <button className="btn danger" onClick={() => toggleWatchlist(id)}>
                    Remove
                  </button>
                </div>
              </div>
            </div>
          ))}
        </>
      )}

      {movies.length > 0 && (
        <>
          <h2 className="section">
            Movies to watch <span className="muted">({movies.length})</span>
          </h2>
          {movies.map((m) => (
            <div key={`${m.tmdbId || m.name}|${m.index}`} className="movie-row">
              {m.poster ? (
                <img src={img(m.poster, 'w154')} alt="" loading="lazy" />
              ) : (
                <div className="thumb" />
              )}
              <div className="info">
                <div className="name">{m.name}</div>
                {m.year ? <div className="detail">{m.year}</div> : null}
                <div className="actions">
                  <button
                    className="btn primary"
                    onClick={() => markPlannedMovieWatched(m.index)}
                  >
                    Mark watched
                  </button>
                  <button
                    className="btn danger"
                    onClick={() => {
                      if (confirm(`Remove "${m.name}" from your watchlist?`)) {
                        removeMovie(m.index);
                      }
                    }}
                  >
                    Remove
                  </button>
                </div>
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
