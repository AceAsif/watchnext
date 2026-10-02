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
import { SearchField, MediaRow, Poster } from '../components/LibraryUI.jsx';
import {
  MOVIE_SORTS,
  shownMovies,
  movieSortSummary,
  movieResultState,
} from '../components/libraryLogic.js';
import {
  LibHead,
  AddButton,
  FilterField,
  SegmentedSort,
  CountLine,
  ToolbarClear,
  LibEmpty,
  MovieTile,
  AddDialog,
  ResBtn,
  PlusIcon,
  FilmIcon,
} from '../components/LibraryBar.jsx';

const searchMoviesList = (q) => searchMovies(q).then((d) => d.results || []);

export default function Movies() {
  const state = useStore();
  const [addOpen, setAddOpen] = useState(false); // the "Add a movie" dialog
  const [addQuery, setAddQuery] = useState('');
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

  // ---- the Add dialog (search lives there, not on the page)
  const openAdd = (q = '') => {
    setAddQuery(q);
    setAddOpen(true);
  };
  const addMovie = async (r, force = false) => addMovieWatched(await movieDetails(r.id), force);
  const addWatch = async (r) => addMovieToWatchlist(await movieDetails(r.id));
  // Open = the detail sheet of the most recent watch of that film.
  const openResult = (r) => {
    const m = movies.find((x) => x.tmdbId === r.id); // `movies` is newest-first
    if (m) {
      setAddOpen(false);
      openMovie(m);
    }
  };
  const renderActions = (r, { busy, act }) => {
    const st = movieResultState(r, watchedByTmdb, plannedTmdbIds);
    if (st.kind === 'watched') {
      return (
        <>
          <ResBtn kind="ok" onClick={() => openResult(r)}>Open</ResBtn>
          <ResBtn disabled={busy} onClick={() => act(r, () => addMovie(r, true), `Logged another watch of “${r.title}”`)}>
            Log again
          </ResBtn>
        </>
      );
    }
    return (
      <>
        <ResBtn kind="primary" disabled={busy} onClick={() => act(r, () => addMovie(r), `Logged “${r.title}” as watched`)}>
          <PlusIcon size={16} /> Watched it
        </ResBtn>
        {st.kind === 'planned' ? (
          <ResBtn kind="wide" disabled>On watchlist</ResBtn>
        ) : (
          <ResBtn kind="wide" disabled={busy} onClick={() => act(r, () => addWatch(r), `Added “${r.title}” to your watchlist`)}>
            Add to watchlist
          </ResBtn>
        )}
      </>
    );
  };
  const badgeFor = (r) => {
    const st = movieResultState(r, watchedByTmdb, plannedTmdbIds);
    if (st.kind === 'watched') return st.count > 1 ? `Logged ${st.count}×` : 'In library';
    return st.kind === 'planned' ? 'On watchlist' : null;
  };

  const shown = useMemo(() => shownMovies(movies, libQuery, sortBy), [movies, libQuery, sortBy]);

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
      <LibHead title="Movies" count={movies.length}>
        <AddButton label="Add a movie from TMDB" onClick={() => openAdd()} />
      </LibHead>

      {movies.length > 0 && (
        <>
          <div className="sd-lbar">
            <FilterField
              value={libQuery}
              onChange={setLibQuery}
              placeholder={`Filter ${movies.length.toLocaleString()} movie${movies.length === 1 ? '' : 's'}`}
            />
            <div className="sd-lbar-sort">
              <span className="sd-lbl">Sort</span>
              <SegmentedSort options={MOVIE_SORTS} value={sortBy} onChange={setSortBy} label="Sort movies" />
            </div>
            {libQuery.trim() && <ToolbarClear onClear={() => setLibQuery('')} />}
          </div>
          <CountLine
            shown={shown.length}
            total={movies.length}
            noun="movies"
            summary={movieSortSummary(sortBy)}
            filtered={!!libQuery.trim()}
            onClear={() => setLibQuery('')}
          />
        </>
      )}

      {shown.length > 0 ? (
        <div className="sd-lgrid">
          {shown.map((m) => (
            <MovieTile key={`${m.name}|${m.watchedAt}|${m.index}`} movie={m} onOpen={() => openMovie(m)} />
          ))}
        </div>
      ) : movies.length === 0 ? (
        <LibEmpty
          icon={<FilmIcon size={28} />}
          title="No movies yet"
          actions={<ResBtn kind="primary" onClick={() => openAdd()}><PlusIcon size={16} /> Add a movie</ResBtn>}
        >
          Log the first movie you’ve watched, or import your TV Time history in Settings.
        </LibEmpty>
      ) : (
        <LibEmpty
          icon={<FilmIcon size={28} />}
          title={`Nothing called “${libQuery.trim()}” in your library`}
          actions={
            <>
              <ResBtn kind="primary" onClick={() => openAdd(libQuery.trim())}>Search TMDB for “{libQuery.trim()}”</ResBtn>
              <button type="button" className="sd-lclear" onClick={() => setLibQuery('')}>Clear filter</button>
            </>
          }
        >
          Check the spelling, or look it up on TMDB to add it.
        </LibEmpty>
      )}

      {addOpen && (
        <AddDialog
          kind="movie"
          search={searchMoviesList}
          initialQuery={addQuery}
          onClose={() => setAddOpen(false)}
          badgeFor={badgeFor}
          renderActions={renderActions}
        />
      )}

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
