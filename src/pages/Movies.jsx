import React, { useMemo, useState } from 'react';
import { useStore } from '../store/useStore.js';
import {
  addMovieWatched,
  addMovieToWatchlist,
  removeMovie,
  updateMovie,
  setMovieRating,
  setMoviePlatform,
  setMovieNote,
  movieStatus,
} from '../store/db.js';
import { FIX_RESULTS_MAX } from '../components/movieSearchLogic.js';
import { searchMovies, movieDetails, hasKey, img, movieVideos, pickTrailer } from '../api/tmdb.js';
import useCollections, { useCollectionForDetails } from '../components/useCollections.js';
import CollectionsView from '../components/CollectionsView.jsx';
import { progressLabel, nextLabel } from '../components/collectionsLogic.js';
import { fmtDay } from '../components/CollectionsView.jsx';
import Stars from '../components/Stars.jsx';
import { groupMovies, groupOfIndex, viewingsLabel } from '../components/movieGroupsLogic.js';
import { NoteEditor } from '../components/NoteEditor.jsx';
import { movieNoteOf } from '../store/notes.js';
import PlatformPicker, { PlatformChip } from '../components/PlatformPicker.jsx';
import { Sheet } from '../components/ui.jsx';
import { useLibrarySyncing } from '../components/SyncingNote.jsx';
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

// "Movies" (the grid of watched films) or "Collections" (film series and how far you are).
const MOVIE_VIEWS = [
  { id: 'all', label: 'Movies' },
  { id: 'collections', label: 'Collections' },
];

export default function Movies() {
  const state = useStore();
  const librarySyncing = useLibrarySyncing();
  const [addOpen, setAddOpen] = useState(false); // the "Add a movie" dialog
  const [addQuery, setAddQuery] = useState('');
  const [fixIndex, setFixIndex] = useState(null); // movie index being fixed
  const [fixQuery, setFixQuery] = useState('');
  const [fixResults, setFixResults] = useState(null);
  const [openIndex, setOpenIndex] = useState(null); // movie index showing details
  const [details, setDetails] = useState({}); // tmdbId -> TMDB movie details
  const [libQuery, setLibQuery] = useState(''); // filters the watched grid
  const [sortBy, setSortBy] = useState('recent'); // 'recent' | 'title' | 'rating'
  const [view, setView] = useState('all'); // 'all' | 'collections'
  const [collFocus, setCollFocus] = useState(null); // { id } the collection a movie sheet asked to see

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

  // One tile per film: rewatches are grouped, and the tile shows "4×" (movieGroupsLogic.js).
  const groups = useMemo(() => groupMovies(movies), [movies]);
  // Collections: only asks TMDB while the Collections view is open; answers are cached on this device.
  const collInfo = useCollections(state.movies, view === 'collections');
  // From a collection's film list: open the sheet of the latest watch of that film.
  const openByTmdb = (tmdbId) => {
    const m = movies.find((x) => x.tmdbId === tmdbId); // `movies` is newest-first
    if (m) openMovie(m);
  };
  const addNextToWatchlist = async (part) => addMovieToWatchlist(await movieDetails(part.id));
  const shown = useMemo(() => shownMovies(groups, libQuery, sortBy), [groups, libQuery, sortBy]);

  const sel = openIndex != null ? movies.find((m) => m.index === openIndex) : null;
  const selGroup = sel ? groupOfIndex(groups, sel.index) : null;
  const d = sel && sel.tmdbId ? details[sel.tmdbId] : null;
  const fixing = sel && fixIndex === sel.index;
  const selCollId = useCollectionForDetails(d);
  const selColl = selCollId ? collInfo.collections.find((c) => c.id === selCollId) || null : null;
  const closeSheet = () => {
    setOpenIndex(null);
    setFixIndex(null);
    setFixResults(null);
  };

  return (
    <div className="sd-page sd-page--wide">
      <LibHead title="Movies" count={groups.length}>
        <AddButton label="Add a movie from TMDB" onClick={() => openAdd()} />
      </LibHead>

      {movies.length > 0 && (
        <div className="sd-lviews">
          <SegmentedSort options={MOVIE_VIEWS} value={view} onChange={setView} label="Movies view" />
        </div>
      )}

      {view === 'collections' && movies.length > 0 ? (
        <CollectionsView info={collInfo} focus={collFocus} onOpenMovie={openByTmdb} onAddNext={addNextToWatchlist} />
      ) : null}

      {view === 'all' && movies.length > 0 && (
        <>
          <div className="sd-lbar">
            <FilterField
              value={libQuery}
              onChange={setLibQuery}
              placeholder={`Filter ${groups.length.toLocaleString()} movie${groups.length === 1 ? '' : 's'}`}
            />
            <div className="sd-lbar-sort">
              <span className="sd-lbl">Sort</span>
              <SegmentedSort options={MOVIE_SORTS} value={sortBy} onChange={setSortBy} label="Sort movies" />
            </div>
            {libQuery.trim() && <ToolbarClear onClear={() => setLibQuery('')} />}
          </div>
          <CountLine
            shown={shown.length}
            total={groups.length}
            noun="movies"
            summary={movieSortSummary(sortBy)}
            filtered={!!libQuery.trim()}
            onClear={() => setLibQuery('')}
          />
        </>
      )}

      {view === 'collections' && movies.length > 0 ? null : shown.length > 0 ? (
        <div className="sd-lgrid">
          {shown.map((g) => (
            <MovieTile key={g.key} movie={g} times={g.times} onOpen={() => openMovie(g.latest)} />
          ))}
        </div>
      ) : movies.length === 0 && librarySyncing ? (
        <LibEmpty icon={<FilmIcon size={28} />} title="Syncing your library…">
          Your movies are on their way from the cloud and will appear in a moment.
        </LibEmpty>
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
                <Stars value={sel.rating || 0} size={24} half onChange={(n) => setMovieRating(sel.index, n)} />
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

            {selGroup && selGroup.times > 1 ? (
              <div className="sd-mdet-sec" data-testid="viewings">
                <span className="sd-lbl">{viewingsLabel(selGroup.times)}</span>
                <div className="sd-views" role="group" aria-label="Your viewings, newest first">
                  {selGroup.viewings.map((v) => (
                    <button
                      key={v.index}
                      type="button"
                      className={'sd-view' + (v.index === sel.index ? ' on' : '')}
                      aria-pressed={v.index === sel.index}
                      onClick={() => setOpenIndex(v.index)}
                    >
                      {fmtDay((v.watchedAt || '').slice(0, 10)) || 'No date'}
                      {Number(v.rating) > 0 ? <span className="r">★ {v.rating}</span> : null}
                    </button>
                  ))}
                </div>
                <p className="sd-sub">Rating, notes and platform below are for the viewing you pick here.</p>
              </div>
            ) : null}

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

            {selCollId ? (
              <div className="sd-mdet-sec" data-testid="sheet-coll">
                <span className="sd-lbl">Collection</span>
                {selColl ? (
                  <div className="sd-card sd-pad sd-coll-mini">
                    <b>{selColl.name}</b>
                    <span>{progressLabel(selColl)} · {nextLabel(selColl, fmtDay)}</span>
                    <button
                      type="button"
                      className="sd-btn sm"
                      onClick={() => {
                        setView('collections');
                        setCollFocus({ id: selColl.id });
                        closeSheet();
                      }}
                    >
                      See all films
                    </button>
                  </div>
                ) : (
                  <p className="sd-mdet-over">Loading collection…</p>
                )}
              </div>
            ) : null}

            <div className="sd-mdet-sec">
              <span className="sd-lbl">Your thoughts</span>
              <NoteEditor
                key={`${sel.index}|${sel.watchedAt}`}
                value={movieNoteOf(sel)}
                saveLabel="Save thoughts"
                onSave={(v) => setMovieNote(sel.index, v)}
                onRemove={() => setMovieNote(sel.index, {})}
              />
            </div>

            <div className="sd-mdet-sec">
              <span className="sd-lbl">Where you watched it</span>
              <PlatformPicker value={sel.platform || ''} onChange={(pl) => setMoviePlatform(sel.index, pl)} />
            </div>

            {fixing && (
              <div className="sd-mdet-sec">
                <span className="sd-lbl">Fix match</span>
                <p className="sd-sub">Search TMDB and pick the correct movie — try the English title, and add the year if it is a common name (e.g. Ready 2011). Your watch date stays.</p>
                <SearchField value={fixQuery} onChange={setFixQuery} placeholder="Movie title" onSubmit={runFixSearch} />
                {fixResults &&
                  (fixResults.length === 0 ? (
                    <p className="sd-sub">No results — try another spelling or the English title.</p>
                  ) : (
                    <div className="sd-card">
                      {fixResults.slice(0, FIX_RESULTS_MAX).map((r, i) => (
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
                  const msg = selGroup && selGroup.times > 1
                    ? `Remove the ${fmtDay((sel.watchedAt || '').slice(0, 10)) || 'undated'} viewing of "${sel.name}"? Your other ${selGroup.times - 1 === 1 ? 'viewing stays' : `${selGroup.times - 1} viewings stay`}.`
                    : `Remove "${sel.name}" from your watched movies?`;
                  if (confirm(msg)) {
                    removeMovie(sel.index);
                    closeSheet();
                  }
                }}
              >
                {selGroup && selGroup.times > 1 ? 'Remove this one' : 'Remove'}
              </button>
            </div>
          </>
        )}
      </Sheet>
    </div>
  );
}
