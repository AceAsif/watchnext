import React, { useMemo } from 'react';
import { useStore } from '../store/useStore.js';
import { watchedCount, lastWatched, lastWatchDate } from '../store/db.js';
import { img, hasKey } from '../api/tmdb.js';

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

  const { inProgress, upcoming } = useMemo(() => {
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
    return { inProgress, upcoming };
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
          {upcoming.slice(0, 8).map(([id, show]) => (
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
                  </span>{' '}
                  airs {show.nextAir.date}
                </div>
              </div>
            </button>
          ))}
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
