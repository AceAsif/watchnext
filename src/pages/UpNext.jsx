import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../store/useStore.js';
import {
  watchedCount,
  lastWatched,
  lastWatchDate,
  setShowUpcoming,
  markEpisode,
  episodesLeft,
  hoursLeft,
  paceFinish,
} from '../store/db.js';
import { hasKey, fetchUpcomingEpisodes } from '../api/tmdb.js';
import CalendarGrid from '../components/CalendarGrid.jsx';
import TonightSheet from '../components/TonightSheet.jsx';
import { Chevron } from '../components/ui.jsx';
import { Poster, EpisodeRow } from '../components/AgendaEpisode.jsx';
import { localISODate } from '../components/showLogic.js';
import {
  buildUpNext,
  groupAgenda,
  headerDate,
  codeOf,
  shortDate,
  isRepeatTap,
} from '../components/upnextLogic.js';

// Up Next — the "v2" layout from the Claude Design round: today's date, a
// compact "Continue watching" card (one tap marks the next episode), then
// "On the way" as a dated agenda (or the calendar). The next-episode logic is
// the same nextToMark the show page uses, so the two screens never disagree —
// and never offer an episode that hasn't aired yet.

const CONTINUE_PREVIEW = 4; // rows shown before "See all"
const CONTINUE_MAX = 30;
const TOAST_MS = 6000;

const CheckIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </svg>
);
const RefreshIcon = ({ spinning }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
    className={spinning ? 'sd-spin' : undefined}>
    <path d="M4 12a8 8 0 0 1 14-5.3M20 12a8 8 0 0 1-14 5.3" />
    <path d="M18 3v4h-4M6 21v-4h4" />
  </svg>
);

function Notice({ children, accent }) {
  return (
    <div
      className="sd-card"
      style={{
        padding: '14px 16px',
        marginTop: 16,
        fontSize: 13.5,
        lineHeight: 1.5,
        color: 'var(--text-dim)',
        borderColor: accent ? 'var(--amber)' : undefined,
      }}
    >
      {children}
    </div>
  );
}

// ---------------------------------------------------------------- continue row
function ContinueRow({ id, show, next, today, first, onOpen, onMark }) {
  const left = episodesLeft(show);
  const hrs = hoursLeft(show);
  const finish = paceFinish(show);
  const lastEp = lastWatched(show);
  const lastCode = lastEp ? codeOf(lastEp[0], lastEp[1]) : null;

  // Line 2: what's next and how much is left. If there's nothing to mark (the
  // show hasn't been synced with TMDB yet) say where you last got to instead.
  let line2;
  if (next) {
    line2 = (
      <>
        <span className="sd-mono" style={{ color: 'var(--amber)' }}>{codeOf(next.season, next.episode)}</span>
        {left > 0 ? ` · ${left} to go` : ''}
        {left > 0 && hrs > 0 ? ` · ~${hrs} h` : ''}
      </>
    );
  } else {
    line2 = lastCode ? (
      <>
        Last watched <span className="sd-mono" style={{ color: 'var(--amber)' }}>{lastCode}</span>
      </>
    ) : (
      'In progress'
    );
  }
  // Line 3: the pace-based finish estimate, else the last episode watched.
  const line3 = finish
    ? `≈ done by ${shortDate(finish.date, today)} at your pace`
    : next && lastCode
      ? `Last watched ${lastCode}`
      : null;

  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '10px 10px 10px 12px',
        borderTop: first ? 'none' : '1px solid var(--sd-line-soft)',
      }}
    >
      <button className="sd-open" onClick={onOpen}>
        <Poster path={show.poster} w={40} h={60} r={6} />
        <span style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
          <span style={{ fontSize: 15, fontWeight: 600, overflowWrap: 'anywhere' }}>{show.name}</span>
          <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>{line2}</span>
          {line3 && <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>{line3}</span>}
        </span>
      </button>
      {next && (
        <button
          className="sd-markbtn"
          aria-label={`Mark ${show.name} ${codeOf(next.season, next.episode)} watched`}
          onClick={() => onMark(id, show, next)}
        >
          <CheckIcon />
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- page
export default function UpNext({ openShow }) {
  const state = useStore();
  const [refresh, setRefresh] = useState(null); // {done, total} while refreshing
  const [view, setView] = useState('list'); // 'list' | 'calendar'
  const [showAll, setShowAll] = useState(false);
  const [tonightOpen, setTonightOpen] = useState(false); // "What should I watch tonight?"
  const [toast, setToast] = useState(null); // last mark, for Undo

  const today = localISODate();
  const alive = useRef(true);
  const lastTap = useRef({}); // show id -> ms of the last mark tap
  const toastTimer = useRef(null);
  useEffect(
    () => () => {
      alive.current = false;
      clearTimeout(toastTimer.current);
    },
    []
  );

  const { cont, items, syncTargets } = useMemo(
    () => buildUpNext(Object.entries(state.shows), today, { watchedCount, lastWatchDate }),
    [state.shows, today]
  );
  const agenda = useMemo(() => groupAgenda(items, today), [items, today]);

  const empty = Object.keys(state.shows).length === 0;
  const upcomingCount = items.length;

  function markNext(id, show, next) {
    // The same button points at the following episode the instant this one is
    // marked, so ignore a fast double-tap rather than mark two episodes.
    const now = Date.now();
    if (isRepeatTap(lastTap.current[id], now)) return;
    lastTap.current[id] = now;

    markEpisode(id, next.season, next.episode, show.runtimeMin, true);
    setToast({ id, name: show.name, season: next.season, episode: next.episode, runtimeMin: show.runtimeMin });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => alive.current && setToast(null), TOAST_MS);
  }

  function undo() {
    if (!toast) return;
    markEpisode(toast.id, toast.season, toast.episode, toast.runtimeMin, false);
    // Re-marking right after an undo is deliberate, so don't let the
    // double-tap guard swallow it.
    delete lastTap.current[toast.id];
    clearTimeout(toastTimer.current);
    setToast(null);
  }

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
      if (alive.current) setRefresh({ done, total: syncTargets.length });
    }
    if (alive.current) setRefresh(null);
  }

  const contShown = showAll ? cont.slice(0, CONTINUE_MAX) : cont.slice(0, CONTINUE_PREVIEW);
  const hasOnTheWay = !empty && (syncTargets.length > 0 || upcomingCount > 0);
  // Two columns on desktop only when there's something for both; a lone section
  // gets a comfortable single column instead of sitting in a narrow side one.
  const solo = !(cont.length > 0 && hasOnTheWay);

  return (
    <div className="sd-page">
      {/* ---------------- title */}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', paddingTop: 8 }}>
        <h1 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 30, fontWeight: 800 }}>Up Next</h1>
        <span className="sd-mono" style={{ fontSize: 12, color: 'var(--text-dim)' }}>{headerDate(today)}</span>
      </div>

      {!empty && (
        <button type="button" className="sd-tonight" onClick={() => setTonightOpen(true)}>
          <span className="txt">
            <strong>What should I watch tonight?</strong>
            <small>Pick your time and mood</small>
          </span>
          <Chevron />
        </button>
      )}
      {tonightOpen && <TonightSheet openShow={openShow} onClose={() => setTonightOpen(false)} />}

      {empty && (
        <Notice accent>
          <strong style={{ color: 'var(--text)' }}>Welcome to WatchNext.</strong>
          <br />
          Import your TV Time history from the Settings tab, or search for a show in the Shows tab to
          start tracking.
        </Notice>
      )}

      {!hasKey() && !empty && (
        <Notice>
          Add a free TMDB API key in Settings, then run a sync to load posters, episode counts and air
          dates.
        </Notice>
      )}

      {/* Phone: the two sections stack. Desktop: side by side (ui.css). */}
      <div className={'sd-cols sd-cols-un' + (solo ? ' sd-cols-solo' : '')}>
      {/* ---------------- continue watching */}
      {cont.length > 0 && (
        <section className="sd-sec sd-un-left">
          {/* Same 44px header height as "On the way" (which holds the controls),
              so the two desktop columns' cards start level. */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', minHeight: 44 }}>
            <span className="sd-lbl">Continue watching · {cont.length}</span>
            {cont.length > CONTINUE_PREVIEW && (
              <button className="sd-linkbtn" style={{ fontWeight: 400, minHeight: 44, padding: '0 0 0 12px' }}
                onClick={() => setShowAll(!showAll)}>
                {showAll ? 'Show less' : 'See all'}
              </button>
            )}
          </div>
          <div className="sd-card">
            {contShown.map(({ id, show, next }, i) => (
              <ContinueRow
                key={id}
                id={id}
                show={show}
                next={next}
                today={today}
                first={i === 0}
                onOpen={() => openShow(id)}
                onMark={markNext}
              />
            ))}
          </div>
        </section>
      )}

      {/* ---------------- on the way */}
      {hasOnTheWay && (
        <section className="sd-sec sd-sec--2">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <span className="sd-lbl" aria-live="polite">
              {refresh ? `Refreshing ${refresh.done}/${refresh.total}` : `On the way · ${upcomingCount}`}
            </span>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <div className="sd-seg" role="group" aria-label="View">
                <button aria-pressed={view === 'list'} onClick={() => setView('list')}>List</button>
                <button aria-pressed={view === 'calendar'} onClick={() => setView('calendar')}>Calendar</button>
              </div>
              <button
                className="sd-ib"
                aria-label="Refresh upcoming"
                title="Pull every scheduled episode for your airing shows from TMDB"
                aria-busy={!!refresh}
                onClick={refreshUpcoming}
                disabled={!hasKey() || !!refresh || syncTargets.length === 0}
              >
                <RefreshIcon spinning={!!refresh} />
              </button>
            </div>
          </div>

          {view === 'calendar' ? (
            <CalendarGrid items={items} onOpen={openShow} />
          ) : agenda.length === 0 ? (
            <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.5, color: 'var(--text-dim)' }}>
              No upcoming episodes scheduled. Tap the refresh button to check TMDB for newly-dated
              episodes (sync your library in the Shows tab first if you haven't).
            </p>
          ) : (
            agenda.map((g) => (
              <React.Fragment key={g.date}>
                {g.monthLabel && (
                  <div className="sd-lbl" style={{ paddingTop: 6, color: 'var(--sd-text-2)' }}>{g.monthLabel}</div>
                )}
                <div style={{ display: 'flex', gap: 12 }}>
                  <div
                    style={{
                      width: 48, flexShrink: 0, display: 'flex', flexDirection: 'column',
                      alignItems: 'center', paddingTop: 10, gap: 2,
                    }}
                  >
                    <span className="sd-mono" style={{ fontSize: 10, letterSpacing: '0.08em', color: g.isToday ? 'var(--amber)' : 'var(--text-dim)' }}>
                      {g.wd}
                    </span>
                    <span style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 700, lineHeight: 1, color: g.isToday ? 'var(--amber)' : 'var(--text)' }}>
                      {g.d}
                    </span>
                    <span className="sd-mono" style={{ fontSize: 10, color: 'var(--text-dim)' }}>{g.rel}</span>
                  </div>
                  <div
                    className="sd-card"
                    style={{ flexGrow: 1, minWidth: 0, borderColor: g.isToday ? 'rgba(242, 163, 60, 0.4)' : undefined }}
                  >
                    {g.items.map((it, i) => (
                      <EpisodeRow key={`${it.id}:${it.s}x${it.e}`} it={it} onOpen={openShow} divider={i > 0} />
                    ))}
                  </div>
                </div>
              </React.Fragment>
            ))
          )}
        </section>
      )}

      </div>

      {!empty && cont.length === 0 && upcomingCount === 0 && syncTargets.length === 0 && (
        <Notice>
          Nothing in progress. Sync with TMDB in the Shows tab to load episode counts, or open a show to
          mark where you're up to.
        </Notice>
      )}

      {/* ---------------- undo */}
      {toast && (
        <div className="sd-toast" role="status">
          <span className="sd-ell" style={{ flex: 1 }}>
            <span className="sd-mono" style={{ color: 'var(--amber)' }}>{codeOf(toast.season, toast.episode)}</span>{' '}
            marked watched · {toast.name}
          </span>
          <button className="sd-linkbtn" style={{ height: 44, padding: '0 14px', fontSize: 14 }} onClick={undo}>
            Undo
          </button>
        </div>
      )}
    </div>
  );
}
