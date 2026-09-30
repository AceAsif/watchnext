import React, { useEffect, useState } from 'react';
import { useStore } from '../store/useStore.js';
import {
  epKey,
  markEpisode,
  markSeason,
  logEpisodeRewatch,
  toggleFollow,
  setShowRating,
  setShowPlatform,
  setShowProviders,
  deleteShow,
  applyTmdbDetails,
  watchedCount,
  episodesLeft,
  hoursLeft,
  paceFinish,
} from '../store/db.js';
import { seasonDetails, resolveShow, searchShows, showDetails, hasKey, img, watchProviders, tvVideos, pickTrailer } from '../api/tmdb.js';
import Stars from '../components/Stars.jsx';
import PlatformPicker from '../components/PlatformPicker.jsx';
import CastCrew from '../components/CastCrew.jsx';

function Check({ on, onClick, label }) {
  return (
    <button className={'check' + (on ? ' on' : '')} onClick={onClick} aria-label={label} aria-pressed={on}>
      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="3">
        <path d="M5 13l4 4 10-10" />
      </svg>
    </button>
  );
}

// "2026-12-25" -> "25 Dec 2026", with no timezone drift.
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function fmtDate(s) {
  if (!s) return '';
  const [y, m, d] = s.split('-').map(Number);
  if (!y || !m || !d) return s;
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

function Season({ id, show, season }) {
  const [eps, setEps] = useState(null);
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState(null);

  async function load() {
    if (eps || !show.tmdbId) return;
    try {
      const data = await seasonDetails(show.tmdbId, season.n);
      setEps(data.episodes || []);
    } catch (e) {
      setErr(e.message);
    }
  }

  const seenInSeason = Object.keys(show.watched || {}).filter(
    (k) => k.startsWith(season.n + 'x')
  ).length;
  const allSeen = season.count > 0 && seenInSeason >= season.count;

  // A season hasn't been released if its air date is still in the future, or
  // (when TMDB hasn't dated it) it has no episodes and nothing watched. The
  // per-season air date comes from a sync; the show's nextAir covers the
  // upcoming season even on data synced before that field existed.
  const today = new Date().toISOString().slice(0, 10);
  const airDate =
    season.air ||
    (show.nextAir && show.nextAir.season === season.n ? show.nextAir.date : null);
  const isFuture = airDate && airDate > today;
  const upcoming = isFuture || (!airDate && season.count === 0 && seenInSeason === 0);

  return (
    <div className={'season-block' + (upcoming ? ' upcoming' : '')}>
      <div className="season-head">
        <h3>
          Season {season.n}{' '}
          {upcoming ? (
            <>
              <span className="badge-soon">Upcoming</span>{' '}
              <span className="muted" style={{ fontWeight: 400, fontSize: 12 }}>
                {airDate ? `Premieres ${fmtDate(airDate)}` : 'Not released yet'}
              </span>
            </>
          ) : (
            <span className="muted" style={{ fontWeight: 400, fontSize: 12 }}>
              {seenInSeason}/{season.count}
            </span>
          )}
        </h3>
        <div className="row">
          {eps && !upcoming && (
            <button
              className="btn"
              onClick={() => markSeason(id, season.n, eps, !allSeen)}
            >
              {allSeen ? 'Unmark season' : 'Mark season watched'}
            </button>
          )}
          <button
            className="btn"
            onClick={() => {
              setOpen(!open);
              if (!open) load();
            }}
          >
            {open ? 'Hide' : 'Episodes'}
          </button>
        </div>
      </div>
      {open && err && <p className="muted">{err}</p>}
      {open && !eps && !err && <p className="muted">Loading episodes…</p>}
      {open &&
        eps &&
        eps.map((ep) => {
          const k = epKey(season.n, ep.episode_number);
          const w = (show.watched || {})[k];
          const on = !!w;
          const n = w && w.n ? w.n : 0;
          return (
            <div className="ep-row" key={ep.id}>
              <Check
                on={on}
                label={`Mark S${season.n}E${ep.episode_number} ${on ? 'unwatched' : 'watched'}`}
                onClick={() =>
                  markEpisode(id, season.n, ep.episode_number, ep.runtime, !on)
                }
              />
              <span className="epcode">
                S{String(season.n).padStart(2, '0')}·E
                {String(ep.episode_number).padStart(2, '0')}
              </span>
              <div className="ep-name">
                {ep.name}
                {on && w.at ? (
                  <div className="airdate" style={{ color: 'var(--amber)' }}>
                    Watched {fmtDate(w.at.slice(0, 10))}
                    {n > 1 ? ` (${n}×)` : ''}
                  </div>
                ) : ep.air_date ? (
                  <div className="airdate">Aired {ep.air_date}</div>
                ) : null}
              </div>
              {on && (
                <button
                  className="btn"
                  title="Log another watch of this episode"
                  style={{ padding: '4px 9px', fontSize: 11.5, flex: 'none' }}
                  onClick={() => logEpisodeRewatch(id, season.n, ep.episode_number, ep.runtime)}
                >
                  + Rewatch
                </button>
              )}
            </div>
          );
        })}
    </div>
  );
}

export default function ShowDetail({ id, onBack }) {
  const state = useStore();
  const show = state.shows[id];
  const [syncing, setSyncing] = useState(false);
  const [fixing, setFixing] = useState(false);
  const [fixQuery, setFixQuery] = useState('');
  const [fixResults, setFixResults] = useState(null);
  const [streamLoading, setStreamLoading] = useState(false);
  const [trailerLoading, setTrailerLoading] = useState(false);

  // Opens a blank tab synchronously (within the click handler, before any
  // await) so browsers treat it as a direct result of the user's click and
  // don't block it as a popup; once the trailer lookup resolves, we point
  // that already-open tab at YouTube. Not persisted on the show — trailers
  // are cheap to re-fetch and rarely worth syncing across devices.
  async function openTrailer() {
    if (!show.tmdbId) return;
    // No 'noopener' here — we need the window reference back to navigate it
    // once the async lookup resolves. 'noopener' makes window.open() return
    // null, which is why the tab used to open and stay stuck on about:blank.
    // The destination is a hardcoded, trusted YouTube URL, so the usual
    // reverse-tabnabbing reason to use noopener doesn't apply.
    const win = window.open('', '_blank');
    if (!win) {
      alert('Your browser blocked the new tab — please allow pop-ups for this site.');
      return;
    }
    setTrailerLoading(true);
    try {
      const data = await tvVideos(show.tmdbId);
      const v = pickTrailer(data);
      if (v) {
        win.location = `https://www.youtube.com/watch?v=${v.key}`;
      } else {
        win.close();
        alert(`No trailer found on TMDB for "${show.name}".`);
      }
    } catch (err) {
      win.close();
      alert('Could not load trailer: ' + err.message);
    } finally {
      setTrailerLoading(false);
    }
  }

  async function refreshStreaming() {
    if (!show.tmdbId) return;
    setStreamLoading(true);
    try {
      const au = await watchProviders('tv', show.tmdbId);
      const flatrate = (au && au.flatrate) || [];
      setShowProviders(
        id,
        flatrate.map((p) => ({ name: p.provider_name, logo: p.logo_path })),
        au && au.link
      );
    } catch (err) {
      alert('Could not load streaming info: ' + err.message);
    } finally {
      setStreamLoading(false);
    }
  }

  async function runFixSearch(e) {
    e && e.preventDefault();
    if (!fixQuery.trim()) return;
    try {
      const data = await searchShows(fixQuery.trim());
      setFixResults(data.results || []);
    } catch (err) {
      alert(err.message);
    }
  }

  async function linkTo(result) {
    try {
      const details = await showDetails(result.id);
      applyTmdbDetails(id, details);
      setFixing(false);
      setFixResults(null);
      setFixQuery('');
    } catch (err) {
      alert(err.message);
    }
  }

  useEffect(() => {
    // Auto-sync a show that has never been resolved against TMDB.
    if (show && !show.lastSynced && hasKey() && !syncing) {
      setSyncing(true);
      resolveShow(show)
        .then((d) => d && applyTmdbDetails(id, d))
        .catch(() => {})
        .finally(() => setSyncing(false));
    }
  }, [id]);

  if (!show) {
    return (
      <div>
        <button className="back" onClick={onBack}>← Back</button>
        <p className="muted">Show not found.</p>
      </div>
    );
  }

  // TMDB ids the user already tracks, so the cast panel can flag "in library".
  const trackedTv = new Set(
    Object.values(state.shows).map((s) => s.tmdbId).filter(Boolean)
  );
  const trackedMovie = new Set(
    (state.movies || []).map((m) => m.tmdbId).filter(Boolean)
  );

  const seen = watchedCount(show);
  const left = episodesLeft(show);
  const hrs = hoursLeft(show);
  const finish = paceFinish(show);

  return (
    <div>
      <button className="back" onClick={onBack}>← Back</button>
      <div className="detail-hero">
        {show.poster ? (
          <img src={img(show.poster)} alt="" />
        ) : (
          <div className="noposter" style={{ width: 128, aspectRatio: '2/3' }}>
            {show.name}
          </div>
        )}
        <div>
          <h2>{show.name}</h2>
          <div className="stat-inline">
            <span>{seen} watched</span>
            {show.totalEpisodes ? <span>{show.totalEpisodes} total</span> : null}
            {show.status ? <span>{show.status}</span> : null}
            {show.nextAir ? <span>next: {show.nextAir.date}</span> : null}
          </div>
          {left > 0 && (
            <div className="stat-inline" style={{ marginTop: -6 }}>
              <span style={{ color: 'var(--amber)' }}>
                {left} episode{left === 1 ? '' : 's'} left
                {hrs > 0 ? ` · ~${hrs} hr${hrs === 1 ? '' : 's'}` : ''}
              </span>
              {finish && <span>≈ finish by {fmtDate(finish.date)} at your recent pace</span>}
            </div>
          )}
          <div className="row">
            <button className="btn" onClick={() => toggleFollow(id)}>
              {show.followed ? 'Unfollow' : 'Follow'}
            </button>
            {hasKey() && show.tmdbId && (
              <button className="btn" onClick={openTrailer} disabled={trailerLoading}>
                {trailerLoading ? 'Loading trailer…' : '▶ Trailer'}
              </button>
            )}
            {hasKey() && (
              <button
                className="btn"
                onClick={() => {
                  setFixing(!fixing);
                  setFixQuery(show.name);
                  setFixResults(null);
                }}
              >
                Fix match
              </button>
            )}
            <button
              className="btn danger"
              onClick={() => {
                if (
                  confirm(
                    `Delete "${show.name}" and its watch history? This removes it ` +
                      `from your library and every signed-in device, and can't be undone.`
                  )
                ) {
                  deleteShow(id);
                  onBack();
                }
              }}
            >
              Delete
            </button>
            {syncing && <span className="muted">Syncing with TMDB…</span>}
          </div>
          <div className="rate-row">
            <span className="muted" style={{ fontSize: 12 }}>Your rating</span>
            <Stars value={show.rating || 0} onChange={(n) => setShowRating(id, n)} />
          </div>
          <div style={{ marginTop: 12 }}>
            <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>
              Where you watch it
            </div>
            <PlatformPicker
              value={show.platform || ''}
              onChange={(p) => setShowPlatform(id, p)}
            />
          </div>

          <div style={{ marginTop: 14 }}>
            <div className="row" style={{ marginBottom: 7 }}>
              <div className="muted" style={{ fontSize: 12 }}>Streaming in Australia</div>
              <div className="spacer" />
              {hasKey() && show.tmdbId && (
                <button
                  className="btn"
                  onClick={refreshStreaming}
                  disabled={streamLoading}
                  style={{ padding: '3px 10px', fontSize: 11.5 }}
                >
                  {streamLoading ? 'Checking…' : show.providersSynced ? 'Refresh' : 'Check'}
                </button>
              )}
            </div>

            {show.providers && show.providers.length > 0 ? (
              <>
                <div className="chips">
                  {show.providers.map((p) => (
                    <span
                      key={p.name}
                      className="chip"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        cursor: 'default',
                        paddingLeft: p.logo ? 4 : 12,
                      }}
                    >
                      {p.logo && (
                        <img
                          src={img(p.logo, 'w45')}
                          alt=""
                          style={{ width: 18, height: 18, borderRadius: 4, display: 'block' }}
                        />
                      )}
                      {p.name}
                    </span>
                  ))}
                </div>
                {show.providersLink && (
                  <a
                    href={show.providersLink}
                    target="_blank"
                    rel="noreferrer"
                    className="muted"
                    style={{ fontSize: 11.5, display: 'inline-block', marginTop: 8 }}
                  >
                    Streaming data by JustWatch →
                  </a>
                )}
              </>
            ) : show.providersSynced ? (
              <p className="muted" style={{ fontSize: 12.5, margin: 0 }}>
                Not currently streaming anywhere in Australia, per TMDB/JustWatch.
              </p>
            ) : show.tmdbId ? (
              <p className="muted" style={{ fontSize: 12.5, margin: 0 }}>
                {hasKey()
                  ? 'Not checked yet — tap "Check" to see where this is streaming.'
                  : 'Add a TMDB API key in Settings to check streaming availability.'}
              </p>
            ) : (
              <p className="muted" style={{ fontSize: 12.5, margin: 0 }}>
                Link this show to TMDB (Fix match) to check streaming availability.
              </p>
            )}
          </div>
        </div>
      </div>

      {hasKey() && show.tmdbId && (
        <CastCrew
          tmdbId={show.tmdbId}
          trackedTv={trackedTv}
          trackedMovie={trackedMovie}
        />
      )}

      {fixing && (
        <div className="notice accent">
          <p style={{ marginTop: 0 }}>
            Search TMDB and pick the correct show. Your watch history stays;
            only the poster, episode data and air dates get relinked.
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
              <p className="muted">No results — try a different name (e.g. the English title).</p>
            ) : (
              fixResults.slice(0, 6).map((r) => (
                <div key={r.id} className="next-row" style={{ cursor: 'default', marginTop: 10 }}>
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
                  <button className="btn primary" onClick={() => linkTo(r)}>
                    Link this
                  </button>
                </div>
              ))
            ))}
        </div>
      )}

      {!show.seasons?.length && !syncing && (
        <div className="notice">
          {hasKey()
            ? 'No episode data loaded yet. Use "Sync with TMDB" on the Shows tab, or reopen this page.'
            : 'Add a TMDB API key in Settings to load seasons and episodes.'}
        </div>
      )}

      {(show.seasons || []).map((season) => (
        <Season key={season.n} id={id} show={show} season={season} />
      ))}
    </div>
  );
}
