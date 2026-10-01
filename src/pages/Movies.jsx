import React, { useMemo, useState } from 'react';
import { useStore } from '../store/useStore.js';
import {
  addMovieWatched,
  addMovieToWatchlist,
  removeMovie,
  updateMovie,
  setMovieRating,
  setMoviePlatform,
  movieStatus,
} from '../store/db.js';
import { searchMovies, movieDetails, hasKey, img, movieVideos, pickTrailer } from '../api/tmdb.js';
import Stars from '../components/Stars.jsx';
import PlatformPicker, { PlatformChip } from '../components/PlatformPicker.jsx';
import { Sheet } from '../components/ui.jsx';
import { PageHead, SearchField, PosterTile, MediaRow, Poster, Empty } from '../components/LibraryUI.jsx';

export default function Movies() {
  const state = useStore();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [busy, setBusy] = useState(false);
  const [fixIndex, setFixIndex] = useState(null); // movie index being fixed
  const [fixQuery, setFixQuery] = useState('');
  const [fixResults, setFixResults] = useState(null);
  const [openIndex, setOpenIndex] = useState(null); // movie index showing details
  const [details, setDetails] = useState({}); // tmdbId -> TMDB movie details
  const [libQuery, setLibQuery] = useState(''); // filters the watched grid
  const [sortBy, setSortBy] = useState('recent'); // 'recent' | 'title' | 'rating'

  // Overviews are fetched on demand rather than stored: they're always
  // re-queryable from TMDB, and keeping 395 of them in local storage would
  // bloat the saved state for no real gain.
  async function openMovie(m) {
    setOpenIndex(m.index);
    if (!m.tmdbId || details[m.tmdbId]) return;
    try {
      const d = await movieDetails(m.tmdbId);
      setDetails((prev) => ({ ...prev, [m.tmdbId]: d }));
    } catch (err) {
      setDetails((prev) => ({ ...prev, [m.tmdbId]: { error: err.message } }));
    }
  }

  const [trailerBusy, setTrailerBusy] = useState(null); // movie index while looking up

  // Opens a blank tab synchronously (before any await) so it isn't blocked as
  // a popup, then points it at YouTube once the trailer lookup resolves.
  async function openTrailer(m) {
    if (!m.tmdbId) return;
    // See ShowDetail.jsx's openTrailer for why 'noopener' is deliberately not
    // used here — it makes window.open() return null.
    const win = window.open('', '_blank');
    if (!win) {
      alert('Your browser blocked the new tab — please allow pop-ups for this site.');
      return;
    }
    setTrailerBusy(m.index);
    try {
      const data = await movieVideos(m.tmdbId);
      const v = pickTrailer(data);
      if (v) {
        win.location = `https://www.youtube.com/watch?v=${v.key}`;
      } else {
        win.close();
        alert(`No trailer found on TMDB for "${m.name}".`);
      }
    } catch (err) {
      win.close();
      alert('Could not load trailer: ' + err.message);
    } finally {
      setTrailerBusy(null);
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
        .filter((m) => movieStatus(m) === 'watched')
        .sort((a, b) => (b.watchedAt || '').localeCompare(a.watchedAt || '')),
    [state.movies]
  );

  // What's already logged, keyed by TMDB id -> { count, last }, so search
  // results can say "already watched" instead of silently doing nothing.
  // Planned (watchlist) entries don't count as "watched" here.
  const watchedByTmdb = useMemo(() => {
    const map = new Map();
    for (const m of state.movies) {
      if (!m.tmdbId || movieStatus(m) !== 'watched') continue;
      const prev = map.get(m.tmdbId) || { count: 0, last: null };
      const last =
        !prev.last || (m.watchedAt || '') > prev.last ? m.watchedAt : prev.last;
      map.set(m.tmdbId, { count: prev.count + 1, last });
    }
    return map;
  }, [state.movies]);

  // Already queued on the watchlist, so search results can say so instead of
  // offering to queue it a second time.
  const plannedTmdbIds = useMemo(() => {
    const set = new Set();
    for (const m of state.movies) {
      if (m.tmdbId && movieStatus(m) === 'planned') set.add(m.tmdbId);
    }
    return set;
  }, [state.movies]);

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

  function removeLoggedMovie(r) {
    // Delete the most recent watched entry for this TMDB film (used to clear a
    // wrongly-matched movie straight from search). Leaves older rewatches, if
    // any, in place. Reads the current array each call so the index is fresh.
    const matches = state.movies
      .map((m, index) => ({ ...m, index }))
      .filter((m) => m.tmdbId === r.id && movieStatus(m) === 'watched');
    if (matches.length === 0) return;
    matches.sort((a, b) => (b.watchedAt || '').localeCompare(a.watchedAt || ''));
    const target = matches[0];
    if (
      confirm(
        `Remove your logged watch of "${target.name}"` +
          (target.watchedAt ? ` (${target.watchedAt.slice(0, 10)})` : '') +
          '? This deletes it from your history.'
      )
    ) {
      removeMovie(target.index);
    }
  }

  async function addToWatchlistFromSearch(r) {
    setBusy(true);
    try {
      const details = await movieDetails(r.id);
      addMovieToWatchlist(details);
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

  const shown = useMemo(() => {
    const q = libQuery.trim().toLowerCase();
    let list = q ? movies.filter((m) => (m.name || '').toLowerCase().includes(q)) : movies.slice();
    if (sortBy === 'title') list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    else if (sortBy === 'rating')
      list.sort((a, b) => (b.rating || 0) - (a.rating || 0) || (b.watchedAt || '').localeCompare(a.watchedAt || ''));
    return list;
  }, [movies, libQuery, sortBy]);

  const sel = openIndex != null ? movies.find((m) => m.index === openIndex) : null;
  const d = sel && sel.tmdbId ? details[sel.tmdbId] : null;
  const fixing = sel && fixIndex === sel.index;
  const closeSheet = () => {
    setOpenIndex(null);
    setFixIndex(null);
    setFixResults(null);
  };

  return (
    <div className="sd-page sd-page--wide">
      <PageHead title="Movies" count={movies.length} />

      <SearchField
        value={query}
        onChange={(v) => {
          setQuery(v);
          if (!v.trim()) setResults(null); // emptying the box clears the list
        }}
        placeholder="Search TMDB to log a movie"
        onSubmit={runSearch}
        busy={busy}
        disabled={!hasKey()}
      />
      {!hasKey() && (
        <p className="sd-sub" style={{ marginTop: 8 }}>Search needs a TMDB API key — add one in Settings.</p>
      )}

      {results && (
        <section className="sd-sec2" style={{ marginTop: 22 }}>
          <div className="sd-sec2-head has-ctl">
            <span className="sd-lbl">Search results</span>
            <button className="sd-linkbtn" onClick={() => setResults(null)}>Clear</button>
          </div>
          {results.length === 0 ? (
            <Empty>No movies found for that search.</Empty>
          ) : (
            <div className="sd-card">
              {results.slice(0, 10).map((r, i) => {
                const seen = watchedByTmdb.get(r.id);
                return (
                  <MediaRow key={r.id} sep={i > 0} path={r.poster_path} name={r.title}>
                    <span className="sd-mrow-name">{r.title}</span>
                    <span className="sd-mrow-meta">
                      {(r.release_date || '').slice(0, 4) || 'unknown year'}
                      {seen && (
                        <span className="ok">
                          {' · '}✓ logged {(seen.last || '').slice(0, 10)}
                          {seen.count > 1 ? ` (${seen.count}×)` : ''}
                        </span>
                      )}
                    </span>
                    {r.overview ? (
                      <span className="sd-mrow-over">{r.overview}</span>
                    ) : null}
                    <span className="sd-mrow-actions" style={{ justifyContent: 'flex-start', marginTop: 6 }}>
                      {seen ? (
                        <>
                          <button className="sd-btn sm" onClick={() => addFromSearch(r, true)} disabled={busy} title="Add another watch with today's date">
                            Log rewatch
                          </button>
                          <button className="sd-btn sm danger" onClick={() => removeLoggedMovie(r)} disabled={busy} title="Delete this logged watch">
                            {seen.count > 1 ? 'Remove latest' : 'Remove'}
                          </button>
                        </>
                      ) : (
                        <button className="sd-btn sm primary" onClick={() => addFromSearch(r)} disabled={busy}>
                          Watched it
                        </button>
                      )}
                      {!seen &&
                        (plannedTmdbIds.has(r.id) ? (
                          <button className="sd-btn sm" disabled>On watchlist</button>
                        ) : (
                          <button className="sd-btn sm" onClick={() => addToWatchlistFromSearch(r)} disabled={busy}>
                            ＋ Watchlist
                          </button>
                        ))}
                    </span>
                  </MediaRow>
                );
              })}
            </div>
          )}
        </section>
      )}

      <section className="sd-sec2" style={{ marginTop: 24 }}>
        <div className="sd-sec2-head has-ctl">
          <span className="sd-lbl">Watched · {shown.length}</span>
          <div className="sd-seg" role="group" aria-label="Sort movies">
            {[['recent', 'Recent'], ['title', 'A–Z'], ['rating', 'Rating']].map(([id, label]) => (
              <button key={id} aria-pressed={sortBy === id} onClick={() => setSortBy(id)}>{label}</button>
            ))}
          </div>
        </div>

        {movies.length > 0 && (
          <SearchField value={libQuery} onChange={setLibQuery} placeholder="Filter your movies" />
        )}

        {movies.length === 0 ? (
          <Empty>No movies yet. Search above to log one, or import your TV Time history in Settings.</Empty>
        ) : shown.length === 0 ? (
          <Empty>No watched movie matches “{libQuery}”.</Empty>
        ) : (
          <div className="sd-pgrid" style={{ marginTop: 6 }}>
            {shown.map((m) => (
              <PosterTile
                key={`${m.name}|${m.watchedAt}|${m.index}`}
                path={m.poster}
                name={m.name}
                badge={m.rating ? `★ ${m.rating}` : null}
                meta={(m.watchedAt || '').slice(0, 10) || m.year || ''}
                onClick={() => openMovie(m)}
              />
            ))}
          </div>
        )}
      </section>

      <Sheet
        open={!!sel}
        title={sel ? sel.name : ''}
        subtitle={sel ? [sel.year, `watched ${(sel.watchedAt || '').slice(0, 10) || 'sometime'}`].filter(Boolean).join(' · ') : ''}
        onClose={closeSheet}
      >
        {sel && (
          <>
            <div className="sd-mdet-head">
              <Poster path={sel.poster} name={sel.name} width={84} height={126} radius={10} />
              <div className="sd-gap10" style={{ minWidth: 0, flex: 1 }}>
                <Stars value={sel.rating || 0} size={24} onChange={(n) => setMovieRating(sel.index, n)} />
                {sel.platform ? <div><PlatformChip id={sel.platform} /></div> : null}
                {d && !d.error && (
                  <div className="sd-mdet-facts">
                    {d.runtime ? <span>{d.runtime} min</span> : null}
                    {d.vote_average ? <span>★ {d.vote_average.toFixed(1)}</span> : null}
                    {(d.genres || []).length ? <span>{d.genres.map((g) => g.name).join(', ')}</span> : null}
                  </div>
                )}
              </div>
            </div>

            <div className="sd-mdet-sec">
              <span className="sd-lbl">About</span>
              {!sel.tmdbId ? (
                <p className="sd-mdet-over">Not linked to TMDB yet — use Fix match to link it, then details will load here.</p>
              ) : !d ? (
                <p className="sd-mdet-over">Loading details…</p>
              ) : d.error ? (
                <p className="sd-mdet-over">Couldn't load details: {d.error}</p>
              ) : (
                <>
                  {d.tagline ? <p className="sd-mdet-over" style={{ fontStyle: 'italic' }}>{d.tagline}</p> : null}
                  <p className="sd-mdet-over">{d.overview || 'No description available on TMDB.'}</p>
                </>
              )}
            </div>

            <div className="sd-mdet-sec">
              <span className="sd-lbl">Where you watched it</span>
              <PlatformPicker value={sel.platform || ''} onChange={(pl) => setMoviePlatform(sel.index, pl)} />
            </div>

            {fixing && (
              <div className="sd-mdet-sec">
                <span className="sd-lbl">Fix match</span>
                <p className="sd-sub">Search TMDB and pick the correct movie — try the English title. Your watch date stays.</p>
                <SearchField value={fixQuery} onChange={setFixQuery} placeholder="Movie title" onSubmit={runFixSearch} />
                {fixResults &&
                  (fixResults.length === 0 ? (
                    <p className="sd-sub">No results — try another spelling or the English title.</p>
                  ) : (
                    <div className="sd-card">
                      {fixResults.slice(0, 6).map((r, i) => (
                        <MediaRow
                          key={r.id}
                          sep={i > 0}
                          path={r.poster_path}
                          name={r.title}
                          actions={<button className="sd-btn sm primary" onClick={() => linkMovie(r)}>Link</button>}
                        >
                          <span className="sd-mrow-name">{r.title}</span>
                          <span className="sd-mrow-meta">{(r.release_date || '').slice(0, 4) || 'unknown year'}</span>
                        </MediaRow>
                      ))}
                    </div>
                  ))}
              </div>
            )}

            <div className="sd-mdet-actions">
              {sel.tmdbId ? (
                <button className="sd-btn" onClick={() => openTrailer(sel)} disabled={trailerBusy === sel.index}>
                  {trailerBusy === sel.index ? 'Loading…' : '▶ Trailer'}
                </button>
              ) : <span />}
              <button
                className="sd-btn"
                onClick={() => {
                  setFixIndex(fixing ? null : sel.index);
                  setFixQuery(sel.name);
                  setFixResults(null);
                }}
              >
                Fix match
              </button>
              <button
                className="sd-btn danger"
                onClick={() => {
                  if (confirm(`Remove "${sel.name}" from your watched movies?`)) {
                    removeMovie(sel.index);
                    closeSheet();
                  }
                }}
              >
                Remove
              </button>
            </div>
          </>
        )}
      </Sheet>
    </div>
  );
}
