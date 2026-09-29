import React, { useMemo, useState } from 'react';
import { useStore } from '../store/useStore.js';
import {
  watchedCount,
  lastWatchDate,
  addShowFromTmdb,
  addShowToWatchlist,
  applyTmdbDetails,
  setShowPlatform,
  setShowProviders,
  showId,
} from '../store/db.js';
import { searchShows, showDetails, resolveShow, hasKey, img, watchProviders } from '../api/tmdb.js';
import PosterCard from '../components/PosterCard.jsx';
import { platformFromProviders, PLATFORMS } from '../components/PlatformPicker.jsx';

const FILTERS = ['All', 'Watching', 'Finished', 'Not started'];
const SORTS = ['Alphabetical', 'Recently added', 'Recently watched', 'Progress', 'Rating'];

export default function Shows({ openShow }) {
  const state = useStore();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState('All');
  const [platformFilter, setPlatformFilter] = useState('All');
  const [libQuery, setLibQuery] = useState(''); // filters the followed library
  const [sortBy, setSortBy] = useState('Alphabetical');
  const [sortDir, setSortDir] = useState('asc');
  const [sync, setSync] = useState(null); // {done, total} while syncing
  const [detect, setDetect] = useState(null); // {done, total} while detecting platforms

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

    // platform filter
    if (platformFilter !== 'All') {
      list = list.filter(([, s]) => s.platform === platformFilter);
    }

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
    // Every comparator above already tie-breaks by name, so it defines a
    // total order — reversing the sorted array is a correct, exact "other
    // direction" for whichever field is active (Z→A for Alphabetical, oldest
    // first for Recently added/watched, lowest first for Progress/Rating).
    if (sortDir === 'desc') list.reverse();
    return list;
  }, [state.shows, filter, platformFilter, libQuery, sortBy, sortDir]);

  // Only platforms actually in use in the library, in PLATFORMS' canonical
  // order, so the filter row never offers a chip that would show zero shows.
  const availablePlatforms = useMemo(() => {
    const present = new Set(
      Object.values(state.shows)
        .filter((s) => s.followed && s.platform)
        .map((s) => s.platform)
    );
    return PLATFORMS.filter((p) => present.has(p.id));
  }, [state.shows]);

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

  async function detectPlatforms() {
    // Fill empty platform chips from TMDB's AU streaming providers, and cache
    // the provider list on each show for the detail page. Only touches shows
    // that don't already have a platform set, so it never overrides your picks.
    const targets = Object.entries(state.shows).filter(
      ([, s]) => s.followed && s.tmdbId && !s.platform
    );
    setDetect({ done: 0, total: targets.length });
    let done = 0;
    for (const [id, show] of targets) {
      try {
        const au = await watchProviders('tv', show.tmdbId);
        const flatrate = (au && au.flatrate) || [];
        setShowProviders(
          id,
          flatrate.map((p) => ({ name: p.provider_name, logo: p.logo_path })),
          au && au.link
        );
        const pid = platformFromProviders(flatrate);
        if (pid) setShowPlatform(id, pid);
      } catch (err) {
        console.warn('provider lookup failed for', show.name, err);
      }
      done++;
      setDetect({ done, total: targets.length });
    }
    setDetect(null);
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
        <div className="row" style={{ gap: 8 }}>
          <button className="btn" onClick={syncAll} disabled={!hasKey() || !!sync}>
            {sync
              ? `Syncing ${sync.done}/${sync.total}`
              : unsynced.length
                ? `Sync ${unsynced.length} new with TMDB`
                : 'Refresh all from TMDB'}
          </button>
          <button
            className="btn"
            onClick={detectPlatforms}
            disabled={!hasKey() || !!detect}
            title="Fill empty platform chips from TMDB's Australian streaming providers"
          >
            {detect ? `Detecting ${detect.done}/${detect.total}` : 'Detect platforms'}
          </button>
        </div>
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
        <div className="sort-field">
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
          <button
            className="btn"
            onClick={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
            title="Reverse sort order"
            aria-label="Reverse sort order"
            style={{ padding: '6px 10px', fontSize: 12 }}
          >
            {sortBy === 'Alphabetical'
              ? sortDir === 'asc' ? 'A → Z' : 'Z → A'
              : sortDir === 'asc' ? '↓ Asc' : '↑ Desc'}
          </button>
        </div>
      </div>

      {availablePlatforms.length > 0 && (
        <div className="chips" style={{ marginTop: -8, marginBottom: 16 }}>
          <button
            className={'chip' + (platformFilter === 'All' ? ' on' : '')}
            style={
              platformFilter === 'All'
                ? { background: 'var(--amber)', borderColor: 'var(--amber)', color: '#16110a' }
                : {}
            }
            onClick={() => setPlatformFilter('All')}
          >
            All platforms
          </button>
          {availablePlatforms.map((p) => {
            const on = platformFilter === p.id;
            const style = on
              ? { background: p.color, borderColor: p.color, color: p.dark ? '#0b0f17' : '#fff' }
              : { '--chip': p.color };
            return (
              <button
                key={p.id}
                className={'chip' + (on ? ' on' : '')}
                style={style}
                onClick={() => setPlatformFilter(on ? 'All' : p.id)}
              >
                {p.label}
              </button>
            );
          })}
        </div>
      )}

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
