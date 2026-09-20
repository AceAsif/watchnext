import React, { useRef, useState, useMemo, useSyncExternalStore } from 'react';
import { useStore } from '../store/useStore.js';
import {
  setTmdbKey,
  importTvTime,
  getState,
  resetAll,
  deleteShow,
  watchedCount,
  removeMovie,
  updateMovie,
  movieStatus,
} from '../store/db.js';
import { searchMovies, movieDetails, hasKey, img } from '../api/tmdb.js';
import {
  isCloudAvailable,
  getCloudUser,
  subscribeCloudUser,
  signIn,
  signOutCloud,
} from '../store/cloud.js';

export default function Settings() {
  const state = useStore();
  const [key, setKey] = useState(state.settings.tmdbKey || '');
  const [msg, setMsg] = useState('');
  const fileRef = useRef();
  const cloudUser = useSyncExternalStore(subscribeCloudUser, getCloudUser);
  const [cloudBusy, setCloudBusy] = useState(false);

  // Inline "Fix" state for the movie-match review list below.
  const [mvFix, setMvFix] = useState(null); // movie index being re-matched
  const [mvFixQuery, setMvFixQuery] = useState('');
  const [mvFixResults, setMvFixResults] = useState(null);
  const [mvBusy, setMvBusy] = useState(false);

  // Movies that likely matched the wrong TMDB film. Two detectable signals:
  //   1. the matched film was released AFTER you watched it (impossible), and
  //   2. two differently-named entries share one TMDB id (one must be wrong).
  // Same-named doubles are legitimate rewatches, so they're not flagged. This
  // can't catch a match to a plausible look-alike (e.g. an older same-title
  // film) — those have no signal — so the list is a helper, not a guarantee.
  const movieSuspects = useMemo(() => {
    const watched = state.movies
      .map((m, index) => ({ ...m, index }))
      .filter((m) => movieStatus(m) === 'watched');
    const namesById = new Map();
    for (const m of watched) {
      if (!m.tmdbId) continue;
      if (!namesById.has(m.tmdbId)) namesById.set(m.tmdbId, new Set());
      namesById.get(m.tmdbId).add(m.name);
    }
    const out = [];
    for (const m of watched) {
      const wy = (m.watchedAt || '').slice(0, 4);
      const ry = m.year || '';
      let reason = null;
      if (/^\d{4}$/.test(wy) && /^\d{4}$/.test(ry) && Number(ry) > Number(wy)) {
        reason = `Matched to a ${ry} film, but you watched it in ${wy}`;
      } else if (m.tmdbId && (namesById.get(m.tmdbId)?.size || 0) > 1) {
        const others = [...namesById.get(m.tmdbId)].filter((n) => n !== m.name);
        reason = `Shares a TMDB match with ${others.map((n) => `"${n}"`).join(', ')}`;
      }
      if (reason) out.push({ ...m, reason });
    }
    return out;
  }, [state.movies]);

  async function runMovieFixSearch(e) {
    e && e.preventDefault();
    if (!mvFixQuery.trim()) return;
    setMvBusy(true);
    try {
      const data = await searchMovies(mvFixQuery.trim());
      setMvFixResults(data.results || []);
    } catch (err) {
      alert(err.message);
    } finally {
      setMvBusy(false);
    }
  }

  async function linkMovieMatch(index, r) {
    setMvBusy(true);
    try {
      const details = await movieDetails(r.id);
      updateMovie(index, {
        tmdbId: details.id,
        name: details.title,
        poster: details.poster_path || null,
        year: (details.release_date || '').slice(0, 4) || null,
        runtimeMin: details.runtime || null,
      });
      setMvFix(null);
      setMvFixResults(null);
      setMvFixQuery('');
    } catch (err) {
      alert(err.message);
    } finally {
      setMvBusy(false);
    }
  }

  // Shows sitting in the data but not in the library or watchlist — leftovers
  // from unfollowing or old imports (unfollow only hides; it never deletes).
  const orphans = Object.entries(state.shows)
    .filter(([, sh]) => !sh.followed && !sh.watchlist)
    .sort((a, b) => (a[1].name || '').localeCompare(b[1].name || ''));

  async function handleSignIn() {
    setCloudBusy(true);
    try {
      await signIn();
    } catch (err) {
      alert('Sign-in failed: ' + err.message);
    } finally {
      setCloudBusy(false);
    }
  }

  function saveKey() {
    setTmdbKey(key);
    setMsg('TMDB key saved. It stays in this browser only.');
  }

  function onImportFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const json = JSON.parse(reader.result);
        if (!json.shows && !json.movies) {
          throw new Error('That file does not look like a WatchNext import.');
        }
        const res = importTvTime(json);
        setMsg(
          `Imported ${res.shows} shows and ${res.watches} new episode watches. ` +
            'Now add a TMDB key (if you have not) and run "Sync with TMDB" on the Shows tab.'
        );
      } catch (err) {
        setMsg('Import failed: ' + err.message);
      }
      e.target.value = '';
    };
    reader.readAsText(file);
  }

  function exportBackup() {
    const blob = new Blob([JSON.stringify(getState(), null, 1)], {
      type: 'application/json',
    });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `watchnext-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function reset() {
    if (confirm('Delete all local WatchNext data? This cannot be undone.')) {
      resetAll();
      setKey('');
      setMsg('All local data deleted.');
    }
  }

  return (
    <div>
      <h2 className="section">Sync across devices</h2>
      {!isCloudAvailable() && (
        <p className="muted" style={{ fontSize: 13.5, lineHeight: 1.5 }}>
          Cloud sync isn't configured for this deployment yet — see the README
          for setup. Until then, use the backup file below to move data
          between devices.
        </p>
      )}
      {isCloudAvailable() && !cloudUser && (
        <>
          <p className="muted" style={{ fontSize: 13.5, lineHeight: 1.5 }}>
            Sign in with Google to keep this browser and every other device
            you sign into showing the same watch history automatically.
          </p>
          <button className="btn primary" onClick={handleSignIn} disabled={cloudBusy}>
            {cloudBusy ? 'Opening sign-in…' : 'Sign in with Google'}
          </button>
        </>
      )}
      {isCloudAvailable() && cloudUser && (
        <>
          <p style={{ fontSize: 13.5 }}>
            Signed in as <strong>{cloudUser.email}</strong>. Changes here sync
            to the cloud automatically and appear on your other signed-in
            devices within a few seconds.
          </p>
          <button className="btn" onClick={() => signOutCloud()}>
            Sign out
          </button>
        </>
      )}

      <h2 className="section">TMDB API key</h2>
      <p className="muted" style={{ fontSize: 13.5, lineHeight: 1.5 }}>
        Show posters, episode lists and air dates come from The Movie Database.
        Create a free account at themoviedb.org, request an API key under
        Settings → API, and paste the v3 key here. The key is stored only in
        this browser.
      </p>
      <div className="row">
        <input
          type="password"
          placeholder="TMDB v3 API key"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          style={{ flex: 1 }}
          autoComplete="off"
        />
        <button className="btn primary" onClick={saveKey}>
          Save key
        </button>
      </div>

      <h2 className="section">Import TV Time history</h2>
      <p className="muted" style={{ fontSize: 13.5, lineHeight: 1.5 }}>
        Run <code>python tools/convert_tvtime.py gdpr-data.zip -o tvtime_import.json</code>{' '}
        on your TV Time export, then load the JSON here. Importing merges with
        anything already tracked; it never deletes.
      </p>
      <input
        ref={fileRef}
        type="file"
        accept="application/json"
        onChange={onImportFile}
        style={{ display: 'none' }}
      />
      <button className="btn primary" onClick={() => fileRef.current.click()}>
        Choose import file
      </button>

      {msg && <div className="notice accent">{msg}</div>}

      {orphans.length > 0 && (
        <>
          <h2 className="section">Clean up shows</h2>
          <p className="muted" style={{ fontSize: 13.5, lineHeight: 1.5 }}>
            These {orphans.length} show{orphans.length === 1 ? ' is' : 's are'} in
            your data but not in your library or watchlist — usually leftovers
            from unfollowing or old test imports. Deleting one removes it for
            good, including from the cloud and your other devices.
          </p>
          {orphans.map(([id, sh]) => {
            const seen = watchedCount(sh);
            return (
              <div
                key={id}
                className="row"
                style={{ padding: '8px 0', borderBottom: '1px solid var(--line)' }}
              >
                <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {sh.name}
                </span>
                <span className="muted" style={{ fontSize: 12 }}>
                  {seen ? `${seen} watched` : 'no history'}
                </span>
                <div className="spacer" />
                <button
                  className="btn danger"
                  onClick={() => {
                    if (confirm(`Delete "${sh.name}" for good?`)) deleteShow(id);
                  }}
                >
                  Delete
                </button>
              </div>
            );
          })}
        </>
      )}

      {movieSuspects.length > 0 && (
        <>
          <h2 className="section">Review movie matches</h2>
          <p className="muted" style={{ fontSize: 13.5, lineHeight: 1.5 }}>
            These {movieSuspects.length} movie
            {movieSuspects.length === 1 ? '' : 's'} look like they matched the
            wrong film on TMDB (common with shared or non-English titles).
            <strong> Fix</strong> re-links to the correct film and keeps your
            watch date; <strong>Remove</strong> deletes the entry. A movie
            matched to a plausible look-alike won't be flagged here, so this is
            a helper, not a full guarantee.
          </p>
          {movieSuspects.map((m) => (
            <div
              key={`${m.tmdbId}|${m.index}`}
              style={{ padding: '10px 0', borderBottom: '1px solid var(--line)' }}
            >
              <div className="row" style={{ alignItems: 'flex-start' }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="name">
                    {m.name}{' '}
                    {m.year ? <span className="muted">({m.year})</span> : null}
                  </div>
                  <div className="muted" style={{ fontSize: 12 }}>
                    {m.reason} · watched {(m.watchedAt || '').slice(0, 10)}
                  </div>
                </div>
                {hasKey() && (
                  <button
                    className="btn"
                    onClick={() => {
                      setMvFix(mvFix === m.index ? null : m.index);
                      setMvFixQuery(m.name);
                      setMvFixResults(null);
                    }}
                  >
                    {mvFix === m.index ? 'Cancel' : 'Fix'}
                  </button>
                )}
                <button
                  className="btn danger"
                  onClick={() => {
                    if (confirm(`Remove "${m.name}" from your watched movies?`)) {
                      removeMovie(m.index);
                      setMvFix(null);
                    }
                  }}
                >
                  Remove
                </button>
              </div>

              {mvFix === m.index && (
                <div className="notice" style={{ marginTop: 8 }}>
                  <form onSubmit={runMovieFixSearch} className="row">
                    <input
                      type="search"
                      value={mvFixQuery}
                      onChange={(e) => setMvFixQuery(e.target.value)}
                      style={{ flex: 1 }}
                    />
                    <button className="btn" type="submit" disabled={mvBusy}>
                      Search
                    </button>
                  </form>
                  {mvFixResults &&
                    (mvFixResults.length === 0 ? (
                      <p className="muted">No results — try a different title.</p>
                    ) : (
                      mvFixResults.slice(0, 6).map((r) => (
                        <div key={r.id} className="movie-row" style={{ marginTop: 8 }}>
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
                          <button
                            className="btn primary"
                            onClick={() => linkMovieMatch(m.index, r)}
                            disabled={mvBusy}
                          >
                            Link this
                          </button>
                        </div>
                      ))
                    ))}
                </div>
              )}
            </div>
          ))}
        </>
      )}

      <h2 className="section">Backup</h2>
      <p className="muted" style={{ fontSize: 13.5, lineHeight: 1.5 }}>
        Everything lives in this browser's storage. Download a backup now and
        then whenever you have marked a lot of episodes — a backup file can be
        re-imported on any device.
      </p>
      <div className="row">
        <button className="btn" onClick={exportBackup}>
          Download backup
        </button>
        <div className="spacer" />
        <button className="btn danger" onClick={reset}>
          Delete all data
        </button>
      </div>
    </div>
  );
}
