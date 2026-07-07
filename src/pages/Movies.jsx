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

  // Newest watches first; remember each movie's index in the real array so
  // remove/update target the right entry after sorting.
  const movies = useMemo(
    () =>
      state.movies
        .map((m, index) => ({ ...m, index }))
        .sort((a, b) => (b.watchedAt || '').localeCompare(a.watchedAt || '')),
    [state.movies]
  );

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

  async function addFromSearch(r) {
    setBusy(true);
    try {
      const details = await movieDetails(r.id);
      addMovieWatched(details);
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
          {results.slice(0, 10).map((r) => (
            <div key={r.id} className="next-row" style={{ cursor: 'default' }}>
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
              </div>
              <button className="btn primary" onClick={() => addFromSearch(r)} disabled={busy}>
                Watched it
              </button>
            </div>
          ))}
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

      {movies.map((m) => (
        <div key={`${m.name}|${m.watchedAt}|${m.index}`} className="next-row" style={{ cursor: 'default' }}>
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
          </div>
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
      ))}
    </div>
  );
}
