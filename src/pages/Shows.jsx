import React, { useMemo, useState } from 'react';
import { useStore } from '../store/useStore.js';
import {
  watchedCount,
  addShowFromTmdb,
  addShowToWatchlist,
  applyTmdbDetails,
  showId,
} from '../store/db.js';
import { searchShows, showDetails, resolveShow, hasKey, img } from '../api/tmdb.js';
import PosterCard from '../components/PosterCard.jsx';

const FILTERS = ['All', 'Watching', 'Finished', 'Not started'];

export default function Shows({ openShow }) {
  const state = useStore();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState('All');
  const [sync, setSync] = useState(null); // {done, total} while syncing

  const library = useMemo(() => {
    const list = Object.entries(state.shows).filter(([, s]) => s.followed);
    list.sort((a, b) => a[1].name.localeCompare(b[1].name));
    return list.filter(([, s]) => {
      const seen = watchedCount(s);
      const total = s.totalEpisodes;
      if (filter === 'Watching') return seen > 0 && (!total || seen < total);
      if (filter === 'Finished') return total && seen >= total;
      if (filter === 'Not started') return seen === 0;
      return true;
    });
  }, [state.shows, filter]);

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
          onChange={(e) => setQuery(e.target.value)}
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

      <div className="row" style={{ margin: '10px 0 14px' }}>
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

      <div className="grid">
        {library.map(([id, show]) => (
          <PosterCard key={id} show={show} onOpen={() => openShow(id)} />
        ))}
      </div>

      {library.length === 0 && (
        <p className="muted">No shows here yet. Search above or import in Settings.</p>
      )}
    </div>
  );
}
