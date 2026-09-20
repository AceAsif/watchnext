import React, { useMemo } from 'react';
import { useStore } from '../store/useStore.js';
import { watchedCount, lastWatched, lastWatchDate } from '../store/db.js';
import { img, hasKey } from '../api/tmdb.js';

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

  const { inProgress, upcoming, agenda } = useMemo(() => {
    const inProgress = [];
    const upcoming = [];
    const today = new Date().toISOString().slice(0, 10);
    for (const [id, show] of shows) {
      if (!show.followed) continue;
      const seen = watchedCount(show);
      const total = show.totalEpisodes;
      if (seen > 0 && (!total || seen < total)) inProgress.push([id, show]);
      if (show.nextAir && show.nextAir.date >= today) upcoming.push([id, show]);
    }
    inProgress.sort(
      (a, b) => (lastWatchDate(b[1]) || '').localeCompare(lastWatchDate(a[1]) || '')
    );
    upcoming.sort((a, b) => a[1].nextAir.date.localeCompare(b[1].nextAir.date));

    // Group upcoming shows by their air date so the section reads like a
    // dated agenda instead of a flat list.
    const byDate = new Map();
    for (const entry of upcoming) {
      const date = entry[1].nextAir.date;
      if (!byDate.has(date)) byDate.set(date, []);
      byDate.get(date).push(entry);
    }
    const agenda = [...byDate.entries()]; // already date-ascending from the sort

    return { inProgress, upcoming, agenda };
  }, [state.shows]);

  const empty = shows.length === 0;

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

      {upcoming.length > 0 && (
        <>
          <h2 className="section">On the way</h2>
          {agenda.map(([date, rows]) => {
            const rel = relHint(date);
            return (
              <div key={date}>
                <div className="agenda-date">
                  {fmtAgenda(date)}
                  {rel && <span className="rel"> · {rel}</span>}
                </div>
                {rows.map(([id, show]) => (
                  <button key={id} className="next-row" onClick={() => openShow(id)}>
                    {show.poster ? (
                      <img src={img(show.poster, 'w154')} alt="" loading="lazy" />
                    ) : (
                      <div className="thumb" />
                    )}
                    <div className="info">
                      <div className="name">{show.name}</div>
                      <div className="detail">
                        <span className="epcode">
                          S{String(show.nextAir.season).padStart(2, '0')}·E
                          {String(show.nextAir.episode).padStart(2, '0')}
                        </span>
                        {show.nextAir.name ? ` — ${show.nextAir.name}` : ''}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            );
          })}
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

      {!empty && inProgress.length === 0 && upcoming.length === 0 && (
        <div className="notice">
          Nothing in progress. Sync with TMDB in the Shows tab to load episode
          counts, or open a show to mark where you're up to.
        </div>
      )}
    </div>
  );
}
