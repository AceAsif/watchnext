import React, { useMemo, useState } from 'react';
import { useStore } from '../store/useStore.js';
import { addMovieWatched, removeMovie, updateMovie } from '../store/db.js';
import { searchMovies, movieDetails, hasKey, img } from '../api/tmdb.js';

export default function Movies() {
  const state = useStore();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [busy, setBusy] = useState(false);
  const [match, setMatch] = useState(null); // {done, total} while matching posters
  const [fixIndex, setFixIndex] = useState(null); // movie index being fixed
  const [fixQuery, setFixQuery] = useState('');
  const [fixResults, setFixResults] = useState(null);
  const [openIndex, setOpenIndex] = useState(null); // movie index showing details
  const [details, setDetails] = useState({}); // tmdbId -> TMDB movie details

  // Overviews are fetched on demand rather than stored: they're always
  // re-queryable from TMDB, and keeping 395 of them in local storage would
  // bloat the saved state for no real gain.
  async function toggleDetails(m) {
    if (openIndex === m.index) {
      setOpenIndex(null);
      return;
    }
    setOpenIndex(m.index);
    if (!m.tmdbId || details[m.tmdbId]) return;
    try {
      const d = await movieDetails(m.tmdbId);
      setDetails((prev) => ({ ...prev, [m.tmdbId]: d }));
    } catch (err) {
      setDetails((prev) => ({ ...prev, [m.tmdbId]: { error: err.message } }));
    }
  }

  async function runFixSearch(e) {
    e && e.preventDefault();
    if (!fixQuery.trim()) return;
    try {
      const data = await searchMovies(fixQuery.trim());
      setFixResults(data.results || []);
    } catch (err) {
      alert(err.message);
    }
  }

  async function linkMovie(r) {
    try {
      const details = await movieDetails(r.id);
      updateMovie(fixIndex, {
        tmdbId: details.id,
        name: details.title,
        poster: details.poster_path || null,
        year: (details.release_date || '').slice(0, 4) || null,
        runtimeMin: details.runtime || null,
      });
      setFixIndex(null);
      setFixResults(null);
      setFixQuery('');
    } catch (err) {
      alert(err.message);
    }
  }

  // Newest watches first; remember each movie's index in the real array so
  // remove/update target the right entry after sorting.
  const movies = useMemo(
    () =>
      state.movies
        .map((m, index) => ({ ...m, index }))
        .sort((a, b) => (b.watchedAt || '').localeCompare(a.watchedAt || '')),
    [state.movies]
  );

  // What's already logged, keyed by TMDB id -> { count, last }, so search
  // results can say "already watched" instead of silently doing nothing.
  const watchedByTmdb = useMemo(() => {
    const map = new Map();
    for (const m of state.movies) {
      if (!m.tmdbId) continue;
      const prev = map.get(m.tmdbId) || { count: 0, last: null };
      const last =
        !prev.last || (m.watchedAt || '') > prev.last ? m.watchedAt : prev.last;
      map.set(m.tmdbId, { count: prev.count + 1, last });
    }
    return map;
  }, [state.movies]);

  // Needs matching if it has no poster yet, or its name contains non-Latin
  // characters (imported titles in other languages get renamed to English).
  const needsMatch = (m) => !m.poster || /[^\u0000-\u024F]/.test(m.name);

  const unmatched = useMemo(
    () => state.movies.filter(needsMatch).length,
    [state.movies]
  );

  async function runSearch(e) {
    e && e.preventDefault();
    if (!query.trim()) return;
    setBusy(true);
    try {
      const data = await searchMovies(query.trim());
      setResults(data.results || []);
    } catch (err) {
      alert(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function addFromSearch(r, force = false) {
    setBusy(true);
    try {
      const details = await movieDetails(r.id);
      addMovieWatched(details, force);
      setResults(null);
      setQuery('');
    } catch (err) {
      alert(err.message);
    } finally {
      setBusy(false);
    }
  }

  // Find posters for imported TV Time movies by searching their titles.
  async function matchPosters() {
    const targets = state.movies
      .map((m, index) => ({ ...m, index }))
      .filter(needsMatch);
    setMatch({ done: 0, total: targets.length });
    let done = 0;
    for (const m of targets) {
      try {
        const data = await searchMovies(m.name);
        const hit = (data.results || [])[0];
        if (hit) {
          updateMovie(m.index, {
            tmdbId: hit.id,
            name: hit.title || m.name, // normalize to English title
            poster: hit.poster_path || null,
            year: (hit.release_date || '').slice(0, 4) || null,
          });
        }
      } catch (err) {
        console.warn('poster match failed for', m.name, err);
      }
      done++;
      setMatch({ done, total: targets.length });
    }
    setMatch(null);
  }

  return (
    <div>
      <form onSubmit={runSearch} className="row" style={{ marginTop: 4 }}>
        <input
          type="search"
          placeholder="Search TMDB for a movie you watched"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
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

      {results && (
        <>
          <h2 className="section">Search results</h2>
          {results.length === 0 && <p className="muted">No movies found for that search.</p>}
          {results.slice(0, 10).map((r) => {
            const seen = watchedByTmdb.get(r.id);
            return (
              <div key={r.id} className="movie-row">
                {r.poster_path ? (
                  <img src={img(r.poster_path, 'w154')} alt="" />
                ) : (
                  <div className="thumb" />
                )}
                <div className="info">
                  <div className="name">{r.title}</div>
                  <div className="detail">
                    {(r.release_date || '').slice(0, 4) || 'unknown year'}
                    {seen && (
                      <>
                        {' · '}
                        <span style={{ color: 'var(--teal)' }}>
                          ✓ already logged {(seen.last || '').slice(0, 10)}
                          {seen.count > 1 ? ` (${seen.count}×)` : ''}
                        </span>
                      </>
                    )}
                  </div>
                  {r.overview ? (
                    <p className="movie-overview">
                      {r.overview.length > 220
                        ? r.overview.slice(0, 220).trimEnd() + '…'
                        : r.overview}
                    </p>
                  ) : null}
                  <div className="actions">
                    {seen ? (
                      <button
                        className="btn"
                        onClick={() => addFromSearch(r, true)}
                        disabled={busy}
                        title="Add another watch with today's date"
                      >
                        Log rewatch
                      </button>
                    ) : (
                      <button
                        className="btn primary"
                        onClick={() => addFromSearch(r)}
                        disabled={busy}
                      >
                        Watched it
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          <button className="btn" onClick={() => setResults(null)}>
            Clear results
          </button>
        </>
      )}

      <div className="row" style={{ marginTop: 22 }}>
        <h2 className="section" style={{ margin: 0 }}>
          Watched <span className="muted">({movies.length})</span>
        </h2>
        <div className="spacer" />
        {unmatched > 0 && (
          <button className="btn" onClick={matchPosters} disabled={!hasKey() || !!match}>
            {match
              ? `Matching ${match.done}/${match.total}`
              : `Find posters for ${unmatched} imported`}
          </button>
        )}
      </div>

      {movies.length === 0 && (
        <p className="muted">
          No movies yet. Search above to log one, or import your TV Time
          history in Settings.
        </p>
      )}

      {movies.map((m) => {
        const d = m.tmdbId ? details[m.tmdbId] : null;
        const isOpen = openIndex === m.index;
        return (
          <React.Fragment key={`${m.name}|${m.watchedAt}|${m.index}`}>
            <div className="movie-row">
              {m.poster ? (
                <img src={img(m.poster, 'w154')} alt="" loading="lazy" />
              ) : (
                <div className="thumb" />
              )}
              <div className="info">
                <div className="name">{m.name}</div>
                <div className="detail">
                  {m.year ? `${m.year} · ` : ''}
                  watched {(m.watchedAt || '').slice(0, 10) || 'sometime'}
                </div>

                {isOpen && (
                  <>
                    {!m.tmdbId ? (
                      <p className="movie-overview">
                        Not linked to TMDB yet — use Fix to match it, then
                        details will load here.
                      </p>
                    ) : !d ? (
                      <p className="movie-overview">Loading details…</p>
                    ) : d.error ? (
                      <p className="movie-overview">Couldn't load details: {d.error}</p>
                    ) : (
                      <>
                        <div className="movie-facts">
                          {d.runtime ? <span>{d.runtime} min</span> : null}
                          {d.vote_average ? (
                            <span>★ {d.vote_average.toFixed(1)}</span>
                          ) : null}
                          {(d.genres || []).length ? (
                            <span>{d.genres.map((g) => g.name).join(', ')}</span>
                          ) : null}
                          {d.release_date ? <span>{d.release_date}</span> : null}
                        </div>
                        {d.tagline ? (
                          <p className="movie-overview" style={{ fontStyle: 'italic' }}>
                            {d.tagline}
                          </p>
                        ) : null}
                        <p className="movie-overview">
                          {d.overview || 'No description available on TMDB.'}
                        </p>
                      </>
                    )}
                  </>
                )}

                <div className="actions">
                  <button className="btn" onClick={() => toggleDetails(m)}>
                    {isOpen ? 'Hide' : 'Details'}
                  </button>
                  <button
                    className="btn"
                    onClick={() => {
                      setFixIndex(fixIndex === m.index ? null : m.index);
                      setFixQuery(m.name);
                      setFixResults(null);
                    }}
                  >
                    Fix
                  </button>
                  <button
                    className="btn danger"
                    onClick={() => {
                      if (confirm(`Remove "${m.name}" from your watched movies?`)) {
                        removeMovie(m.index);
                      }
                    }}
                  >
                    Remove
                  </button>
                </div>
              </div>
            </div>
            {fixIndex === m.index && (
              <div className="notice accent">
                <p style={{ marginTop: 0 }}>
                  Search TMDB and pick the correct movie — try the English title
                  (e.g. "Tiger Zinda Hai"). Your watch date stays.
                </p>
                <form onSubmit={runFixSearch} className="row">
                  <input
                    type="search"
                    value={fixQuery}
                    onChange={(e) => setFixQuery(e.target.value)}
                    style={{ flex: 1 }}
                  />
                  <button className="btn" type="submit">Search</button>
                </form>
                {fixResults &&
                  (fixResults.length === 0 ? (
                    <p className="muted">No results — try another spelling or the English title.</p>
                  ) : (
                    fixResults.slice(0, 6).map((r) => (
                      <div key={r.id} className="movie-row" style={{ marginTop: 10 }}>
                        {r.poster_path ? (
                          <img src={img(r.poster_path, 'w154')} alt="" />
                        ) : (
                          <div className="thumb" />
                        )}
                        <div className="info">
                          <div className="name">{r.title}</div>
                          <div className="detail">
                            {(r.release_date || '').slice(0, 4) || 'unknown year'}
                          </div>
                          <div className="actions">
                            <button className="btn primary" onClick={() => linkMovie(r)}>
                              Link this
                            </button>
                          </div>
                        </div>
                      </div>
                    ))
                  ))}
              </div>
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}
