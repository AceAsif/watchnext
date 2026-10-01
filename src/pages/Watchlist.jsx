import React, { useMemo, useState } from 'react';
import { useStore } from '../store/useStore.js';
import {
  toggleWatchlist,
  startWatchingShow,
  markPlannedMovieWatched,
  removeMovie,
  movieStatus,
} from '../store/db.js';
import Discover from '../components/Discover.jsx';
import { PageHead, MediaRow, Empty, CheckIcon } from '../components/LibraryUI.jsx';

export default function Watchlist({ openShow }) {
  const state = useStore();
  const [tab, setTab] = useState('queue'); // 'queue' | 'discover'

  // A show can only be a watchlist item while it isn't followed yet —
  // once "Start watching" clears watchlist and sets followed, it belongs
  // to the Shows/Up Next tabs instead. The !s.followed guard is a safety
  // net in case a record ever ends up with both flags set.
  const shows = useMemo(() => {
    const list = Object.entries(state.shows).filter(
      ([, s]) => s.watchlist && !s.followed
    );
    list.sort((a, b) => a[1].name.localeCompare(b[1].name));
    return list;
  }, [state.shows]);

  const movies = useMemo(() => {
    return state.movies
      .map((m, index) => ({ ...m, index }))
      .filter((m) => movieStatus(m) === 'planned')
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }, [state.movies]);

  const empty = shows.length === 0 && movies.length === 0;

  const count = shows.length + movies.length;
  const TABS = [['queue', count ? `Queue · ${count}` : 'Queue'], ['discover', 'Discover']];

  return (
    <div className="sd-page">
      <PageHead title="Watchlist" count={empty ? null : count} />

      <div className="sd-tabs2" role="tablist" aria-label="Watchlist sections">
        {TABS.map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>

      <div style={{ marginTop: 18 }}>
        {tab === 'discover' ? (
          <Discover />
        ) : empty ? (
          <Empty title="Nothing queued up yet.">
            Search for a show or movie on the Shows or Movies tab and use “＋ Watchlist” to plan it for
            later without marking it watched.
          </Empty>
        ) : (
          <div className="sd-cols-2 sd-stackv">
            {shows.length > 0 && (
              <section className="sd-sec2">
                <div className="sd-sec2-head"><span className="sd-lbl">Shows to watch · {shows.length}</span></div>
                <div className="sd-card">
                  {shows.map(([id, show], i) => (
                    <MediaRow
                      key={id}
                      sep={i > 0}
                      path={show.poster}
                      name={show.name}
                      onClick={openShow ? () => openShow(id) : undefined}
                      actions={
                        <>
                          <button className="sd-btn sm primary" onClick={() => startWatchingShow(id)}>Start</button>
                          <button
                            className="sd-ib sd-ib--sm"
                            onClick={() => toggleWatchlist(id)}
                            aria-label={`Remove ${show.name} from watchlist`}
                            title="Remove"
                          >
                            ✕
                          </button>
                        </>
                      }
                    >
                      <span className="sd-mrow-name">{show.name}</span>
                      {show.genres && show.genres.length ? (
                        <span className="sd-mrow-meta">{show.genres.slice(0, 3).join(' · ')}</span>
                      ) : null}
                    </MediaRow>
                  ))}
                </div>
              </section>
            )}

            {movies.length > 0 && (
              <section className="sd-sec2">
                <div className="sd-sec2-head"><span className="sd-lbl">Movies to watch · {movies.length}</span></div>
                <div className="sd-card">
                  {movies.map((m, i) => (
                    <MediaRow
                      key={`${m.tmdbId || m.name}|${m.index}`}
                      sep={i > 0}
                      path={m.poster}
                      name={m.name}
                      actions={
                        <>
                          <button
                            className="sd-markbtn"
                            onClick={() => markPlannedMovieWatched(m.index)}
                            aria-label={`Mark ${m.name} watched`}
                            title="Mark watched"
                          >
                            <CheckIcon />
                          </button>
                          <button
                            className="sd-ib sd-ib--sm"
                            onClick={() => {
                              if (confirm(`Remove "${m.name}" from your watchlist?`)) removeMovie(m.index);
                            }}
                            aria-label={`Remove ${m.name} from watchlist`}
                            title="Remove"
                          >
                            ✕
                          </button>
                        </>
                      }
                    >
                      <span className="sd-mrow-name">{m.name}</span>
                      {m.year ? <span className="sd-mrow-meta">{m.year}</span> : null}
                    </MediaRow>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
