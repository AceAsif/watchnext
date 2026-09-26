import React, { useMemo, useState } from 'react';
import { useStore } from '../store/useStore.js';
import { watchedCount, lastWatched, lastWatchDate, setShowUpcoming } from '../store/db.js';
import { img, hasKey, fetchUpcomingEpisodes } from '../api/tmdb.js';
import CalendarGrid from '../components/CalendarGrid.jsx';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// "2026-12-24" -> "Thu 24 Dec 2026", built from local date parts (no TZ drift).
function fmtAgenda(dateStr) {
  const [y, m, d] = (dateStr || '').split('-').map(Number);
  if (!y || !m || !d) return dateStr || '';
  const dt = new Date(y, m - 1, d);
  return `${WEEKDAYS[dt.getDay()]} ${d} ${MONTHS[m - 1]} ${y}`;
}

// A short relative hint, only when the date is near.
function relHint(dateStr) {
  const [y, m, d] = (dateStr || '').split('-').map(Number);
  if (!y) return null;
  const target = new Date(y, m - 1, d);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const days = Math.round((target - now) / 86400000);
  if (days <= 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days <= 14) return `in ${days} days`;
  return null;
}

function NextRow({ show, onOpen }) {
  const seen = watchedCount(show);
  const last = lastWatched(show);
  const total = show.totalEpisodes;
  return (
    <button className="next-row" onClick={onOpen}>
      {show.poster ? (
        <img src={img(show.poster, 'w154')} alt="" loading="lazy" />
      ) : (
        <div className="thumb" />
      )}
      <div className="info">
        <div className="name">{show.name}</div>
        <div className="detail">
          {last ? (
            <>
              last watched <span className="epcode">S{String(last[0]).padStart(2, '0')}·E{String(last[1]).padStart(2, '0')}</span>
              {total ? ` — ${total - seen} to go` : ''}
            </>
          ) : (
            'not started yet'
          )}
        </div>
      </div>
    </button>
  );
}

export default function UpNext({ openShow }) {
  const state = useStore();
  const shows = Object.entries(state.shows);
  const [refresh, setRefresh] = useState(null); // {done, total} while refreshing
  const [view, setView] = useState('list'); // 'list' | 'calendar'

  const { inProgress, agenda, upcomingCount, syncTargets, items } = useMemo(() => {
    const inProgress = [];
    const today = new Date().toISOString().slice(0, 10);

    // Every still-to-air episode across the library. Prefer the cached
    // `upcoming` list (all episodes of the airing season); fall back to the
    // single `nextAir` so the agenda still works before the first refresh.
    const items = [];
    const syncTargets = []; // shows we can pull upcoming episodes for
    for (const [id, show] of shows) {
      if (!show.followed) continue;

      const seen = watchedCount(show);
      const total = show.totalEpisodes;
      if (seen > 0 && (!total || seen < total)) inProgress.push([id, show]);

      if (show.tmdbId && show.nextAir) syncTargets.push([id, show]);

      const cached = Array.isArray(show.upcoming)
        ? show.upcoming.filter((ep) => ep.air >= today)
        : [];
      if (cached.length) {
        for (const ep of cached) {
          items.push({ id, show, s: ep.s, e: ep.e, name: ep.name, date: ep.air });
        }
      } else if (show.nextAir && show.nextAir.date >= today) {
        items.push({
          id,
          show,
          s: show.nextAir.season,
          e: show.nextAir.episode,
          name: show.nextAir.name,
          date: show.nextAir.date,
        });
      }
    }

    inProgress.sort(
      (a, b) => (lastWatchDate(b[1]) || '').localeCompare(lastWatchDate(a[1]) || '')
    );
    items.sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        a.show.name.localeCompare(b.show.name) ||
        a.s - b.s ||
        a.e - b.e
    );

    // Group by air date so it reads like a dated agenda.
    const byDate = new Map();
    for (const it of items) {
      if (!byDate.has(it.date)) byDate.set(it.date, []);
      byDate.get(it.date).push(it);
    }
    const agenda = [...byDate.entries()]; // already date-ascending

    return { inProgress, agenda, upcomingCount: items.length, syncTargets, items };
  }, [state.shows]);

  const empty = shows.length === 0;

  async function refreshUpcoming() {
    if (!syncTargets.length) return;
    setRefresh({ done: 0, total: syncTargets.length });
    let done = 0;
    for (const [id, show] of syncTargets) {
      try {
        const eps = await fetchUpcomingEpisodes(show);
        setShowUpcoming(id, eps);
      } catch (err) {
        console.warn('upcoming fetch failed for', show.name, err);
      }
      done++;
      setRefresh({ done, total: syncTargets.length });
    }
    setRefresh(null);
  }

  return (
    <div>
      {empty && (
        <div className="notice accent">
          <strong>Welcome to WatchNext.</strong>
          <br />
          Import your TV Time history from the Settings tab, or search for a show
          in the Shows tab to start tracking.
        </div>
      )}

      {!hasKey() && !empty && (
        <div className="notice">
          Add a free TMDB API key in Settings, then run a sync to load posters,
          episode counts and air dates.
        </div>
      )}

      {!empty && (syncTargets.length > 0 || upcomingCount > 0) && (
        <>
          <div className="row" style={{ marginTop: 4 }}>
            <h2 className="section" style={{ margin: 0 }}>
              On the way{' '}
              {upcomingCount > 0 && (
                <span className="muted">({upcomingCount} episode{upcomingCount === 1 ? '' : 's'})</span>
              )}
            </h2>
            <div className="spacer" />
            <div className="row" style={{ gap: 6 }}>
              <button
                className="btn"
                style={view === 'list' ? { borderColor: 'var(--amber)', color: 'var(--amber)' } : {}}
                onClick={() => setView('list')}
              >
                List
              </button>
              <button
                className="btn"
                style={view === 'calendar' ? { borderColor: 'var(--amber)', color: 'var(--amber)' } : {}}
                onClick={() => setView('calendar')}
              >
                Calendar
              </button>
              <button
                className="btn"
                onClick={refreshUpcoming}
                disabled={!hasKey() || !!refresh || syncTargets.length === 0}
                title="Pull every scheduled episode for your airing shows from TMDB"
              >
                {refresh ? `Refreshing ${refresh.done}/${refresh.total}` : 'Refresh upcoming'}
              </button>
            </div>
          </div>

          {view === 'calendar' ? (
            <CalendarGrid items={items} onOpen={openShow} />
          ) : agenda.length === 0 ? (
            <p className="muted" style={{ fontSize: 13.5 }}>
              No upcoming episodes scheduled. Tap "Refresh upcoming" to check TMDB
              for newly-dated episodes (sync your library in the Shows tab first if
              you haven't).
            </p>
          ) : (
            agenda.map(([date, rows]) => {
              const rel = relHint(date);
              return (
                <div key={date}>
                  <div className="agenda-date">
                    {fmtAgenda(date)}
                    {rel && <span className="rel"> · {rel}</span>}
                  </div>
                  {rows.map((it) => (
                    <button
                      key={`${it.id}:${it.s}x${it.e}`}
                      className="next-row"
                      onClick={() => openShow(it.id)}
                    >
                      {it.show.poster ? (
                        <img src={img(it.show.poster, 'w154')} alt="" loading="lazy" />
                      ) : (
                        <div className="thumb" />
                      )}
                      <div className="info">
                        <div className="name">{it.show.name}</div>
                        <div className="detail">
                          <span className="epcode">
                            S{String(it.s).padStart(2, '0')}·E{String(it.e).padStart(2, '0')}
                          </span>
                          {it.name ? ` — ${it.name}` : ''}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              );
            })
          )}
        </>
      )}

      {inProgress.length > 0 && (
        <>
          <h2 className="section">Continue watching</h2>
          {inProgress.slice(0, 30).map(([id, show]) => (
            <NextRow key={id} show={show} onOpen={() => openShow(id)} />
          ))}
        </>
      )}

      {!empty && inProgress.length === 0 && upcomingCount === 0 && syncTargets.length === 0 && (
        <div className="notice">
          Nothing in progress. Sync with TMDB in the Shows tab to load episode
          counts, or open a show to mark where you're up to.
        </div>
      )}
    </div>
  );
}
