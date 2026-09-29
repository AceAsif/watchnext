import React, { useState, useMemo } from 'react';
import { useStore } from '../store/useStore.js';
import {
  addShowFromTmdb,
  addShowToWatchlist,
  addMovieWatched,
  addMovieToWatchlist,
  movieStatus,
} from '../store/db.js';
import {
  searchShows,
  searchMovies,
  showDetails,
  movieDetails,
  hasKey,
  img,
} from '../api/tmdb.js';

// One search box across both TMDB shows AND movies, flagging what's already in
// your library / watchlist so you don't re-add something. Results are merged
// and ordered by TMDB popularity, so the most relevant title leads regardless
// of whether it's a show or a movie.
export default function Search({ openShow, onClose }) {
  const state = useStore();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [busy, setBusy] = useState(false);
  const [acting, setActing] = useState(null); // result key currently being acted on

  // Tracked-status lookups, rebuilt only when the library changes.
  const status = useMemo(() => {
    const showByTmdb = new Map(); // tmdbId -> [id, show]
    for (const [id, s] of Object.entries(state.shows)) {
      if (s.tmdbId) showByTmdb.set(s.tmdbId, [id, s]);
    }
    const movieWatched = new Set();
    const moviePlanned = new Set();
    for (const m of state.movies) {
      if (!m.tmdbId) continue;
      if (movieStatus(m) === 'watched') movieWatched.add(m.tmdbId);
      else if (movieStatus(m) === 'planned') moviePlanned.add(m.tmdbId);
    }
    return { showByTmdb, movieWatched, moviePlanned };
  }, [state.shows, state.movies]);

  async function runSearch(e) {
    e && e.preventDefault();
    if (!query.trim()) return;
    setBusy(true);
    try {
      const [tv, mv] = await Promise.all([
        searchShows(query.trim()).catch(() => ({ results: [] })),
        searchMovies(query.trim()).catch(() => ({ results: [] })),
      ]);
      const shows = (tv.results || []).map((r) => ({
        key: `show:${r.id}`,
        type: 'show',
        id: r.id,
        name: r.name,
        year: (r.first_air_date || '').slice(0, 4),
        poster: r.poster_path,
        popularity: r.popularity || 0,
      }));
      const movies = (mv.results || []).map((r) => ({
        key: `movie:${r.id}`,
        type: 'movie',
        id: r.id,
        name: r.title,
        year: (r.release_date || '').slice(0, 4),
        poster: r.poster_path,
        popularity: r.popularity || 0,
      }));
      setResults([...shows, ...movies].sort((a, b) => b.popularity - a.popularity));
    } catch (err) {
      alert(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function withActing(key, fn) {
    setActing(key);
    try {
      await fn();
    } catch (err) {
      alert(err.message);
    } finally {
      setActing(null);
    }
  }

  const openShowResult = (it) =>
    withActing(it.key, async () => {
      const existing = status.showByTmdb.get(it.id);
      if (existing) {
        onClose();
        openShow(existing[0]);
        return;
      }
      const details = await showDetails(it.id);
      addShowFromTmdb(details);
      onClose();
      openShow(`tmdb:${details.id}`);
    });

  const followShow = (it) =>
    withActing(it.key, async () => addShowFromTmdb(await showDetails(it.id)));
  const watchlistShow = (it) =>
    withActing(it.key, async () => addShowToWatchlist(await showDetails(it.id)));
  const watchedMovie = (it, force = false) =>
    withActing(it.key, async () => addMovieWatched(await movieDetails(it.id), force));
  const watchlistMovie = (it) =>
    withActing(it.key, async () => addMovieToWatchlist(await movieDetails(it.id)));

  function Row({ it }) {
    const isActing = acting === it.key;
    const tracked = it.type === 'show' ? status.showByTmdb.get(it.id) : null;
    const followed = tracked && tracked[1].followed;
    const onShowWatchlist = tracked && tracked[1].watchlist && !tracked[1].followed;
    const watched = it.type === 'movie' && status.movieWatched.has(it.id);
    const planned = it.type === 'movie' && status.moviePlanned.has(it.id);

    let badge = null;
    if (followed) badge = <span style={{ color: 'var(--teal)' }}> · ✓ Following</span>;
    else if (onShowWatchlist) badge = <span style={{ color: 'var(--teal)' }}> · on watchlist</span>;
    else if (watched) badge = <span style={{ color: 'var(--teal)' }}> · ✓ Watched</span>;
    else if (planned) badge = <span style={{ color: 'var(--teal)' }}> · on watchlist</span>;

    return (
      <div className="movie-row">
        {it.poster ? (
          <img src={img(it.poster, 'w154')} alt="" loading="lazy" />
        ) : (
          <div className="thumb" />
        )}
        <div className="info">
          <div className="name">{it.name}</div>
          <div className="detail">
            {it.year || 'unknown year'} · {it.type === 'show' ? 'Show' : 'Movie'}
            {badge}
          </div>
          <div className="actions">
            {it.type === 'show' ? (
              <>
                <button className="btn" onClick={() => openShowResult(it)} disabled={isActing}>
                  Open
                </button>
                {followed ? (
                  <button className="btn" disabled>Following</button>
                ) : (
                  <button className="btn primary" onClick={() => followShow(it)} disabled={isActing}>
                    Follow
                  </button>
                )}
                {!followed && !onShowWatchlist && (
                  <button className="btn" onClick={() => watchlistShow(it)} disabled={isActing}>
                    ＋ Watchlist
                  </button>
                )}
              </>
            ) : (
              <>
                {watched ? (
                  <button
                    className="btn"
                    onClick={() => watchedMovie(it, true)}
                    disabled={isActing}
                    title="Log another watch with today's date"
                  >
                    Log rewatch
                  </button>
                ) : (
                  <button className="btn primary" onClick={() => watchedMovie(it)} disabled={isActing}>
                    Watched it
                  </button>
                )}
                {!watched && !planned && (
                  <button className="btn" onClick={() => watchlistMovie(it)} disabled={isActing}>
                    ＋ Watchlist
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <button className="back" onClick={onClose}>← Back</button>

      <form onSubmit={runSearch} className="row" style={{ marginTop: 4 }}>
        <input
          type="search"
          autoFocus
          placeholder="Search shows and movies…"
          value={query}
          onChange={(e) => {
            const v = e.target.value;
            setQuery(v);
            if (!v.trim()) setResults(null);
          }}
          style={{ flex: 1 }}
        />
        <button className="btn" type="submit" disabled={busy || !hasKey()}>
          Search
        </button>
      </form>

      {!hasKey() && (
        <p className="muted" style={{ fontSize: 13 }}>
          Search needs a TMDB API key — add one in Settings.
        </p>
      )}

      {busy && <p className="muted" style={{ fontSize: 13 }}>Searching…</p>}

      {results && !busy && (
        <>
          {results.length === 0 ? (
            <p className="muted" style={{ marginTop: 12 }}>Nothing found for that search.</p>
          ) : (
            <div style={{ marginTop: 12 }}>
              {results.slice(0, 20).map((it) => (
                <Row key={it.key} it={it} />
              ))}
            </div>
          )}
        </>
      )}

      {results === null && !busy && hasKey() && (
        <p className="muted" style={{ fontSize: 13.5, marginTop: 12 }}>
          Search once across your shows and movies. Anything already in your
          library or watchlist is flagged so you won't add it twice.
        </p>
      )}
    </div>
  );
}
