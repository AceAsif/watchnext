import React, { useMemo, useState } from 'react';
import { useStore } from '../store/useStore.js';
import {
  watchedCount,
  lastWatchDate,
  addShowFromTmdb,
  addShowToWatchlist,
  applyTmdbDetails,
  showId,
} from '../store/db.js';
import { searchShows, showDetails, resolveShow, hasKey, img } from '../api/tmdb.js';
import PosterCard from '../components/PosterCard.jsx';

const FILTERS = ['All', 'Watching', 'Finished', 'Not started'];
const SORTS = ['Alphabetical', 'Recently added', 'Recently watched', 'Progress', 'Rating'];

export default function Shows({ openShow }) {
  const state = useStore();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState('All');
  const [libQuery, setLibQuery] = useState(''); // filters the followed library
  const [sortBy, setSortBy] = useState('Alphabetical');
  const [sync, setSync] = useState(null); // {done, total} while syncing

  const hasFollowed = useMemo(
    () => Object.values(state.shows).some((s) => s.followed),
    [state.shows]
  );

  const library = useMemo(() => {
    const q = libQuery.trim().toLowerCase();
    let list = Object.entries(state.shows).filter(([, s]) => s.followed);

    // status filter
    list = list.filter(([, s]) => {
      const seen = watchedCount(s);
      const total = s.totalEpisodes;
      if (filter === 'Watching') return seen > 0 && (!total || seen < total);
      if (filter === 'Finished') return total && seen >= total;
      if (filter === 'Not started') return seen === 0;
      return true;
    });

    // name search
    if (q) list = list.filter(([, s]) => (s.name || '').toLowerCase().includes(q));

    // sort — fraction watched, guarding shows with no episode count
    const frac = (s) => (s.totalEpisodes ? watchedCount(s) / s.totalEpisodes : 0);
    if (sortBy === 'Recently watched') {
      list.sort(
        (a, b) =>
          (lastWatchDate(b[1]) || '').localeCompare(lastWatchDate(a[1]) || '') ||
          a[1].name.localeCompare(b[1].name)
      );
    } else if (sortBy === 'Recently added') {
      // Newest addedAt first. Imported shows have no addedAt, so they fall to
      // the bottom, ordered alphabetically among themselves.
      list.sort(
        (a, b) =>
          (b[1].addedAt || '').localeCompare(a[1].addedAt || '') ||
          a[1].name.localeCompare(b[1].name)
      );
    } else if (sortBy === 'Progress') {
      list.sort(
        (a, b) => frac(b[1]) - frac(a[1]) || a[1].name.localeCompare(b[1].name)
      );
    } else if (sortBy === 'Rating') {
      list.sort(
        (a, b) =>
          (b[1].rating || 0) - (a[1].rating || 0) ||
          a[1].name.localeCompare(b[1].name)
      );
    } else {
      list.sort((a, b) => a[1].name.localeCompare(b[1].name));
    }
    return list;
  }, [state.shows, filter, libQuery, sortBy]);

  const unsynced = useMemo(
    () => Object.entries(state.shows).filter(([, s]) => s.followed && !s.lastSynced),
    [state.shows]
  );

  const followedTmdbIds = useMemo(
    () =>
      new Set(
        Object.values(state.shows)
          .filter((s) => s.followed && s.tmdbId)
          .map((s) => s.tmdbId)
      ),
    [state.shows]
  );

  const watchlistTmdbIds = useMemo(
    () =>
      new Set(
        Object.values(state.shows)
          .filter((s) => s.watchlist && s.tmdbId)
          .map((s) => s.tmdbId)
      ),
    [state.shows]
  );

  async function runSearch(e) {
    e && e.preventDefault();
    if (!query.trim()) return;
    setBusy(true);
    try {
      const data = await searchShows(query.trim());
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
      const details = await showDetails(r.id);
      addShowFromTmdb(details);
      setResults(null);
      setQuery('');
    } catch (err) {
      alert(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function openFromSearch(r) {
    // If this show is already in the store (followed, on the watchlist, or
    // imported), just open that record. Otherwise add it — which follows it,
    // so any episodes marked land in the Library and Up Next rather than
    // being orphaned on a show that isn't in the library — then open it.
    const existing = Object.entries(state.shows).find(
      ([, s]) => s.tmdbId === r.id
    );
    if (existing) {
      openShow(existing[0]);
      return;
    }
    setBusy(true);
    try {
      const details = await showDetails(r.id);
      addShowFromTmdb(details);
      openShow(`tmdb:${details.id}`);
    } catch (err) {
      alert(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function addToWatchlistFromSearch(r) {
    setBusy(true);
    try {
      const details = await showDetails(r.id);
      addShowToWatchlist(details);
    } catch (err) {
      alert(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function syncAll() {
    const targets = unsynced.length
      ? unsynced
      : Object.entries(state.shows).filter(([, s]) => s.followed);
    setSync({ done: 0, total: targets.length });
    let done = 0;
    for (const [id, show] of targets) {
      try {
        const details = await resolveShow(show);
        if (details) applyTmdbDetails(id, details);
      } catch (err) {
        console.warn('sync failed for', show.name, err);
      }
      done++;
      setSync({ done, total: targets.length });
    }
    setSync(null);
  }

  return (
    <div>
      <form onSubmit={runSearch} className="row" style={{ marginTop: 4 }}>
        <input
          type="search"
          placeholder="Search TMDB for a show to add"
          value={query}
          onChange={(e) => {
            const v = e.target.value;
            setQuery(v);
            if (!v.trim()) setResults(null); // emptying the box clears the list
          }}
          style={{ flex: 1 }}
        />
        <button className="btn" type="submit" disabled={busy || !hasKey()}>
          Search
        </button>
      </form>
      {!hasKey() && (
        <p className="muted" style={{ fontSize: 13 }}>
          Search and sync need a TMDB API key — add one in Settings.
        </p>
      )}

      {results && (
        <>
          <h2 className="section">Search results</h2>
          {results.length === 0 && <p className="muted">No shows found for that search.</p>}
          {results.slice(0, 10).map((r) => (
            <div key={r.id} className="next-row" style={{ cursor: 'default' }}>
              <button
                onClick={() => openFromSearch(r)}
                disabled={busy}
                title={`Open ${r.name}`}
                style={{
                  display: 'flex',
                  gap: 14,
                  alignItems: 'center',
                  flex: 1,
                  minWidth: 0,
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  margin: 0,
                  cursor: 'pointer',
                  color: 'var(--text)',
                  textAlign: 'left',
                  font: 'inherit',
                }}
              >
                {r.poster_path ? (
                  <img src={img(r.poster_path, 'w154')} alt="" />
                ) : (
                  <div className="thumb" />
                )}
                <div className="info">
                  <div className="name">{r.name}</div>
                  <div className="detail">
                    {(r.first_air_date || '').slice(0, 4) || 'unknown year'}
                  </div>
                </div>
              </button>
              <div className="row" style={{ gap: 8 }}>
                {followedTmdbIds.has(r.id) ? (
                  <button className="btn" disabled>
                    Following
                  </button>
                ) : (
                  <button className="btn primary" onClick={() => addFromSearch(r)} disabled={busy}>
                    Follow
                  </button>
                )}
                {!followedTmdbIds.has(r.id) &&
                  (watchlistTmdbIds.has(r.id) ? (
                    <button className="btn" disabled>
                      On watchlist
                    </button>
                  ) : (
                    <button
                      className="btn"
                      onClick={() => addToWatchlistFromSearch(r)}
                      disabled={busy}
                    >
                      ＋ Watchlist
                    </button>
                  ))}
              </div>
            </div>
          ))}
          <button className="btn" onClick={() => setResults(null)}>
            Clear results
          </button>
        </>
      )}

      <div className="row" style={{ marginTop: 22 }}>
        <h2 className="section" style={{ margin: 0 }}>
          Library <span className="muted">({library.length})</span>
        </h2>
        <div className="spacer" />
        <button className="btn" onClick={syncAll} disabled={!hasKey() || !!sync}>
          {sync
            ? `Syncing ${sync.done}/${sync.total}`
            : unsynced.length
              ? `Sync ${unsynced.length} new with TMDB`
              : 'Refresh all from TMDB'}
        </button>
      </div>

      <input
        type="search"
        placeholder="Filter your library by name"
        value={libQuery}
        onChange={(e) => setLibQuery(e.target.value)}
        className="lib-filter"
      />

      <div className="lib-controls">
        <div className="row">
          {FILTERS.map((f) => (
            <button
              key={f}
              className="btn"
              style={
                filter === f
                  ? { borderColor: 'var(--amber)', color: 'var(--amber)' }
                  : {}
              }
              onClick={() => setFilter(f)}
            >
              {f}
            </button>
          ))}
        </div>
        <label className="sort-field">
          <span className="muted" style={{ fontSize: 12 }}>Sort</span>
          <select
            className="select"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            aria-label="Sort library"
          >
            {SORTS.map((sName) => (
              <option key={sName} value={sName}>
                {sName}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid">
        {library.map(([id, show]) => (
          <PosterCard key={id} show={show} onOpen={() => openShow(id)} />
        ))}
      </div>

      {library.length === 0 && (
        <p className="muted">
          {hasFollowed
            ? 'No shows match your filter.'
            : 'No shows here yet. Search above or import in Settings.'}
        </p>
      )}
    </div>
  );
}
