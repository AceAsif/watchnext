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
import ListsView from '../components/ListsView.jsx';
import NewOnView from '../components/NewOnView.jsx';
import { liveCount } from '../components/listsLogic.js';
import { isOnMyServices, servicesLabel, statusLine } from '../components/servicesLogic.js';
import { useServicesPrefs, setServicesPrefs } from '../store/servicesPrefs.js';
import useAvailability from '../components/useAvailability.js';
import { ServicesToggle, ServicesStatus, ServicesSheet } from '../components/ServicesUI.jsx';
import { PageHead, MediaRow, Empty, CheckIcon } from '../components/LibraryUI.jsx';
import { localISODate } from '../components/showLogic.js';
import { fmtDay } from '../components/statsLogic.js';
import { showTime, movieTime, watchlistTotal, yourPace, finishEstimate, headline, paceText, fmtLength, fmtShort, SORTS } from '../components/watchlistTimeLogic.js';

const SORT_KEY = 'watchnext-wl-sort';
const loadSort = () => { try { return localStorage.getItem(SORT_KEY) === 'short' ? 'short' : 'az'; } catch (e) { return 'az'; } };

// "≈ 23 days to finish everything" — the queue's total viewing time and when you'd be done.
function TotalTime({ shows, movies, state, filtered, sort, onSort }) {
  const today = localISODate();
  const tot = useMemo(() => watchlistTotal(shows, movies, today), [shows, movies, today]);
  const pace = useMemo(() => yourPace(state), [state.shows, state.movies]); // eslint-disable-line react-hooks/exhaustive-deps
  const est = finishEstimate(tot.minutes, pace, today);
  const parts = [
    tot.shows ? `Shows ${fmtLength(tot.showMin)} · ${tot.eps.toLocaleString('en-AU')} episode${tot.eps === 1 ? '' : 's'}` : null,
    tot.movies ? `Movies ${fmtLength(tot.movieMin)} · ${tot.movies}` : null,
  ].filter(Boolean);
  const notes = [
    tot.coming ? `+${tot.coming} episode${tot.coming === 1 ? '' : 's'} not out yet` : null,
    tot.guessed ? `${tot.guessed} title${tot.guessed === 1 ? ' has' : 's have'} no runtime yet, so a typical length is used` : null,
    pace ? null : 'Watch a few more days and this uses your own pace',
  ].filter(Boolean);
  return (
    <section className="sd-card sd-wltime" data-testid="watchlist-time">
      <div className="sd-wltime-big">{headline(est)}{filtered ? <span className="sd-wltime-on"> · on your services</span> : null}</div>
      {est.days > 0 && (
        <div className="sd-wltime-sub">
          {fmtLength(tot.minutes)} of viewing, {paceText(est)}{est.days <= 3650 ? ` · done around ${fmtDay(est.date)}` : ''}
        </div>
      )}
      {parts.length > 0 && <div className="sd-wltime-parts sd-mono">{parts.map((x) => <div key={x}>{x}</div>)}</div>}
      {notes.length > 0 && <div className="sd-wltime-note">{notes.join(' · ')}</div>}
      <div className="sd-wltime-sort" role="group" aria-label="Sort the watchlist">
        {SORTS.map(([id, label]) => (
          <button key={id} type="button" className="sd-wlsort" aria-pressed={sort === id} onClick={() => onSort(id)}>{label}</button>
        ))}
      </div>
    </section>
  );
}

export default function Watchlist({ openShow }) {
  const state = useStore();
  const [tab, setTab] = useState('queue'); // 'queue' | 'lists' | 'new' | 'discover'
  const [sort, setSortState] = useState(loadSort);
  const setSort = (v) => { setSortState(v); try { localStorage.setItem(SORT_KEY, v); } catch (e) { /* private mode: not remembered */ } };
  const today = localISODate();

  // A show can only be a watchlist item while it isn't followed yet —
  // once "Start watching" clears watchlist and sets followed, it belongs
  // to the Shows/Up Next tabs instead. The !s.followed guard is a safety
  // net in case a record ever ends up with both flags set.
  const shows = useMemo(() => {
    const list = Object.entries(state.shows).filter(
      ([, s]) => s.watchlist && !s.followed
    );
    list.sort((a, b) => (sort === 'short' ? showTime(a[1], today).minutes - showTime(b[1], today).minutes : 0) || a[1].name.localeCompare(b[1].name));
    return list;
  }, [state.shows, sort, today]);

  const movies = useMemo(() => {
    return state.movies
      .map((m, index) => ({ ...m, index }))
      .filter((m) => movieStatus(m) === 'planned')
      .sort((a, b) => (sort === 'short' ? movieTime(a).minutes - movieTime(b).minutes : 0) || (a.name || '').localeCompare(b.name || ''));
  }, [state.movies, sort]);

  const empty = shows.length === 0 && movies.length === 0;

  // "On my services": show only what is confirmed to stream on a service you pay for (or is
  // free to watch). Titles not checked yet are looked up in the background, a few at a time.
  const svc = useServicesPrefs();
  const mine = useMemo(() => new Set(svc.mine), [svc.mine]);
  const on = svc.watchlistOnly;
  const [pick, setPick] = useState(false);
  const checkItems = useMemo(() => {
    const seen = new Set();
    const out = shows.map(([id, s]) => ({ key: 's:' + id, kind: 'tv', id, tmdbId: s.tmdbId, rec: s }));
    for (const m of movies) {
      const key = 'm:' + (m.tmdbId || m.name);
      if (!seen.has(key)) { seen.add(key); out.push({ key, kind: 'movie', tmdbId: m.tmdbId, rec: m }); }
    }
    return out;
  }, [shows, movies]);
  const av = useAvailability(checkItems, on, svc.region);
  const showsShown = on ? shows.filter(([, s]) => isOnMyServices(s, mine, svc.region)) : shows;
  const moviesShown = on ? movies.filter((m) => isOnMyServices(m, mine, svc.region)) : movies;
  const nothingOn = on && showsShown.length === 0 && moviesShown.length === 0;
  const svcStatus = on ? statusLine({ remaining: av.remaining, failed: av.failed, noKey: av.noKey, noServices: svc.mine.length === 0, unknownIds: av.noId }) : null;
  const toggle = () => { setServicesPrefs({ watchlistOnly: !on }); if (!on && svc.mine.length === 0) setPick(true); };

  const count = shows.length + movies.length;
  const nLists = liveCount(state.lists);
  const TABS = [['queue', count ? `Queue · ${count}` : 'Queue'], ['lists', nLists ? `Lists · ${nLists}` : 'Lists'], ['new', 'New'], ['discover', 'Discover']];

  return (
    <div className="sd-page">
      <PageHead title="Watchlist" count={empty ? null : count} />

      <div className="sd-tabs2" role="tablist" aria-label="Watchlist sections">
        {TABS.map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>

      {tab === 'queue' && !empty && (
        <div className="sd-svcbar">
          <ServicesToggle on={on} onToggle={toggle} />
          <button type="button" className="sd-linkbtn" onClick={() => setPick(true)}>
            {svc.mine.length ? `My services (${svc.mine.length})` : 'Choose my services'}
          </button>
          <ServicesStatus text={svcStatus} canRetry={av.failed > 0} onRetry={av.retry} />
        </div>
      )}
      {pick && <ServicesSheet onClose={() => setPick(false)} />}

      <div style={{ marginTop: 18 }}>
        {tab === 'discover' ? (
          <Discover />
        ) : tab === 'lists' ? (
          <ListsView openShow={openShow} />
        ) : tab === 'new' ? (
          <NewOnView openShow={openShow} />
        ) : empty ? (
          <Empty title="Nothing queued up yet.">
            Search for a show or movie on the Shows or Movies tab and use “＋ Watchlist” to plan it for
            later without marking it watched.
          </Empty>
        ) : nothingOn ? (
          <Empty title="Nothing on your watchlist is on your services yet.">
            {av.remaining > 0
              ? 'Still checking: titles appear here as soon as they’re confirmed.'
              : 'Free-to-watch services count too. You can change which services you pay for any time.'}
          </Empty>
        ) : (
          <>
          <TotalTime shows={showsShown.map(([, s]) => s)} movies={moviesShown} state={state} filtered={on} sort={sort} onSort={setSort} />
          <div className="sd-cols-2 sd-stackv">
            {showsShown.length > 0 && (
              <section className="sd-sec2">
                <div className="sd-sec2-head"><span className="sd-lbl">Shows to watch · {on ? `${showsShown.length} of ${shows.length}` : shows.length}</span></div>
                <div className="sd-card">
                  {showsShown.map(([id, show], i) => (
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
                      {(() => { const t = showTime(show, today); return t.eps ? <span className="sd-mrow-meta sd-wl-len">{t.eps} ep{t.eps === 1 ? '' : 's'} · {t.guessed ? '~' : ''}{fmtShort(t.minutes)}</span> : null; })()}
                      {on && servicesLabel(show, mine, svc.region) ? <span className="sd-mrow-meta sd-svc-meta">{servicesLabel(show, mine, svc.region)}</span> : null}
                    </MediaRow>
                  ))}
                </div>
              </section>
            )}

            {moviesShown.length > 0 && (
              <section className="sd-sec2">
                <div className="sd-sec2-head"><span className="sd-lbl">Movies to watch · {on ? `${moviesShown.length} of ${movies.length}` : movies.length}</span></div>
                <div className="sd-card">
                  {moviesShown.map((m, i) => (
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
                      <span className="sd-mrow-meta">{[m.year, (movieTime(m).guessed ? '~' : '') + fmtShort(movieTime(m).minutes)].filter(Boolean).join(' · ')}</span>
                      {on && servicesLabel(m, mine, svc.region) ? <span className="sd-mrow-meta sd-svc-meta">{servicesLabel(m, mine, svc.region)}</span> : null}
                    </MediaRow>
                  ))}
                </div>
              </section>
            )}
          </div>
          </>
        )}
      </div>
    </div>
  );
}
