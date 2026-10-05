import React, { useEffect, useRef, useState } from 'react';
import { useStore } from '../store/useStore.js';
import {
  markEpisode,
  setEpisodeNote,
  markSeason,
  logEpisodeRewatch,
  toggleFollow,
  setShowDropped,
  setWatchDates,
  restoreWatchDates,
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
import {
  seasonDetails,
  resolveShow,
  searchShows,
  showDetails,
  hasKey,
  img,
  watchProviders,
  tvVideos,
  pickTrailer,
} from '../api/tmdb.js';
import { PLATFORMS, platformById } from '../components/PlatformPicker.jsx';
import CastCrew from '../components/CastCrew.jsx';
import { NoteSheet } from '../components/NoteEditor.jsx';
import { reactionById } from '../store/notes.js';
import AnimeSheet from '../components/AnimeSheet.jsx';
import FinishCardSheet from '../components/FinishCardSheet.jsx';
import { WhenSheet, FixDatesSheet } from '../components/WatchDateSheets.jsx';
import { stampForDay, fixedToast, watchedList } from '../components/watchDatesLogic.js';
import { normalizeProviders } from '../components/servicesLogic.js';
import { isFinishedShow, becomesFinished } from '../components/finishCardLogic.js';
import { looksLikeAnime, altTitles, summaryLine } from '../components/animeLogic.js';
import { Bar, Chevron, Sheet } from '../components/ui.jsx';
import {
  epKey,
  seasonInfo,
  nextToMark,
  leadingDoneCount,
  currentSeasonN,
  leadingWatchedFold,
  localISODate,
} from '../components/showLogic.js';

// Show page — "v2 C" from the Claude Design round: a compact hero with the
// one primary action, then grouped list-row cards (rating / where you watch /
// streaming → seasons → cast & crew), with the heavy pickers moved into
// bottom sheets instead of sitting on the page.

// "2026-12-25" -> "25 Dec 2026", with no timezone drift.
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function fmtDate(s) {
  if (!s) return '';
  const [y, m, d] = s.split('-').map(Number);
  if (!y || !m || !d) return s;
  return `${d} ${MONTHS[m - 1]} ${y}`;
}
const pad2 = (n) => String(n).padStart(2, '0');
const isoToday = () => localISODate();

// ---------------------------------------------------------------- icons
const CheckIcon = ({ size = 16, w = 2.4 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </svg>
);
const StarIcon = ({ on }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" strokeWidth="1.5" strokeLinejoin="round"
    fill={on ? 'var(--amber)' : 'none'} stroke={on ? 'var(--amber)' : 'var(--sd-line-strong)'}
    aria-hidden="true">
    <path d="M12 17.3l-6.2 3.7 1.6-7.1L2 9.2l7.2-.6L12 2l2.8 6.6 7.2.6-5.4 4.7 1.6 7.1z" />
  </svg>
);

// ---------------------------------------------------------------- seasons
function Season({ id, show, season, info, isCurrent, next, onResumed, onAdded }) {
  // Watching anything resumes a dropped show (see db.js); tell the page so it can
  // offer Undo. `on` is whether the action marks something as watched.
  const resumes = (on) => { if (on && show.dropped === true && onResumed) onResumed(show.droppedAt || null); };
  // How many episodes are being newly watched (so the page can offer the finish card).
  const added = (n) => { if (n > 0 && onAdded) onAdded(n); };
  // Marking a whole season asks WHEN it was watched (a show seen years ago must not land in this month).
  const [whenOpen, setWhenOpen] = useState(false);
  const markSeasonWhen = (day) => {
    setWhenOpen(false);
    resumes(eps.length > 0);
    added(eps.filter((e) => !(show.watched || {})[epKey(season.n, e.episode_number)]).length);
    markSeason(id, season.n, eps, true, day ? stampForDay(day) : undefined);
  };
  const [eps, setEps] = useState(null);
  const [open, setOpen] = useState(isCurrent);
  const [err, setErr] = useState(null);
  const [expandDone, setExpandDone] = useState(false);
  const [noteEp, setNoteEp] = useState(null); // { n, name } of the episode whose note is open

  async function load() {
    if (eps || !show.tmdbId) return;
    try {
      const data = await seasonDetails(show.tmdbId, season.n);
      setEps(data.episodes || []);
    } catch (e) {
      setErr(e.message);
    }
  }

  // The current season opens by itself, so its episodes load straight away.
  useEffect(() => {
    if (isCurrent) load();
  }, []);

  const { seen, count, pct, done, upcoming, airDate } = info;
  const barColor = done ? 'var(--teal)' : 'var(--amber)';
  const watched = show.watched || {};
  const today = isoToday();
  const fold = eps ? leadingWatchedFold(eps.map((e) => e.episode_number), watched, season.n) : 0;

  return (
    <div className="sd-sep" style={{ background: open ? 'var(--bg-card)' : 'transparent' }}>
      <button
        className="sd-season-head"
        aria-expanded={open}
        onClick={() => {
          setOpen(!open);
          if (!open) load();
        }}
      >
        <span className="sd-mono" style={{ width: 30, fontSize: 12, color: isCurrent ? 'var(--amber)' : 'var(--sd-text-2)' }}>
          S{pad2(season.n)}
        </span>
        {upcoming ? (
          <>
            <span className="sd-ell" style={{ flexGrow: 1, fontSize: 12, color: 'var(--amber)' }}>
              {airDate ? `Premieres ${fmtDate(airDate)}` : 'Not released yet'}
            </span>
          </>
        ) : (
          <>
            <span style={{ flexGrow: 1, display: 'flex' }}>
              <Bar value={pct} color={barColor} height={4} />
            </span>
            <span
              className="sd-mono"
              style={{ width: 44, textAlign: 'right', fontSize: 12, color: done ? 'var(--teal)' : 'var(--text-dim)' }}
            >
              {seen}/{count}
            </span>
          </>
        )}
        <Chevron dir="down" size={18} style={{ transform: open ? 'rotate(180deg)' : 'none' }} />
      </button>

      {open && err && <p className="muted" style={{ padding: '0 16px 12px', margin: 0 }}>{err}</p>}
      {open && !show.tmdbId && (
        <p className="muted" style={{ padding: '0 16px 12px', margin: 0, fontSize: 13 }}>
          Link this show to TMDB (⋯ → Fix TMDB match) to load its episodes.
        </p>
      )}
      {open && show.tmdbId && !eps && !err && (
        <p className="muted" style={{ padding: '0 16px 12px', margin: 0, fontSize: 13 }}>Loading episodes…</p>
      )}

      {open && eps && !upcoming && eps.length > 0 && (
        <div className="sd-ep" style={{ minHeight: 44 }}>
          <button
            className="sd-linkbtn"
            onClick={() => (done ? markSeason(id, season.n, eps, false) : setWhenOpen(true))}
          >
            {done ? 'Unmark season' : 'Mark season watched'}
          </button>
        </div>
      )}
      {whenOpen && (
        <WhenSheet
          title="When did you watch it?"
          subtitle={`${show.name} · Season ${season.n}`}
          today={isoToday()}
          onNow={() => markSeasonWhen(null)}
          onDate={markSeasonWhen}
          onClose={() => setWhenOpen(false)}
        />
      )}

      {open && eps && fold > 0 && (
        <button
          className="sd-ep sd-foldrow"
          aria-expanded={expandDone}
          onClick={() => setExpandDone(!expandDone)}
        >
          <span style={{ flexGrow: 1, fontSize: 13, color: 'var(--text-dim)', textAlign: 'left' }}>
            E01–E{pad2(eps[fold - 1].episode_number)} · all watched
          </span>
          <span className="sd-mono" style={{ fontSize: 11, color: 'var(--amber)', paddingRight: 8 }}>
            {expandDone ? 'HIDE' : 'SHOW'}
          </span>
        </button>
      )}

      {open &&
        eps &&
        eps.slice(expandDone ? 0 : fold).map((ep) => {
          const k = epKey(season.n, ep.episode_number);
          const w = watched[k];
          const on = !!w;
          const n = w && w.n ? w.n : 0;
          const isNext = !!next && next.season === season.n && next.episode === ep.episode_number;
          const code = `S${season.n}E${ep.episode_number}`;
          let sub = null;
          if (on && w.at) {
            sub = { text: `Watched ${fmtDate(w.at.slice(0, 10))}${n > 1 ? ` · ${n}×` : ''}`, color: 'var(--text-dim)' };
          } else if (!on && ep.air_date && ep.air_date > today) {
            sub = { text: `Airs ${fmtDate(ep.air_date)}`, color: 'var(--amber)' };
          }
          const note = (show.notes || {})[k];
          const noteReaction = note && reactionById(note.react);
          return (
            <div className="sd-ep" key={ep.id}>
              <span className="sd-mono" style={{ width: 30, fontSize: 12, color: isNext ? 'var(--amber)' : 'var(--text-dim)' }}>
                E{pad2(ep.episode_number)}
              </span>
              <div style={{ flexGrow: 1, minWidth: 0, padding: '8px 0' }}>
                <div style={{ fontSize: 14 }}>{ep.name || `Episode ${ep.episode_number}`}</div>
                {sub && <div style={{ fontSize: 12, color: sub.color, marginTop: 2 }}>{sub.text}</div>}
              </div>
              {(on || note) && (
                <button
                  className="sd-check"
                  style={{ width: 36 }}
                  title={note ? 'Edit your note' : 'Add a note or reaction'}
                  aria-label={`${note ? 'Edit note for' : 'Add note for'} ${code}`}
                  onClick={() => setNoteEp({ n: ep.episode_number, name: ep.name || `Episode ${ep.episode_number}` })}
                >
                  {noteReaction ? (
                    <span aria-hidden="true" style={{ fontSize: 16, lineHeight: 1 }}>{noteReaction.emoji}</span>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={note ? 'var(--amber)' : 'var(--text-dim)'}
                      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M4 5h16v11H9l-5 4z" />
                    </svg>
                  )}
                </button>
              )}
              {on && (
                <button
                  className="sd-check"
                  style={{ width: 36 }}
                  title="Log another watch of this episode"
                  aria-label={`Log another watch of ${code}`}
                  onClick={() => { resumes(true); logEpisodeRewatch(id, season.n, ep.episode_number, ep.runtime); }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-dim)"
                    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M20 12a8 8 0 1 1-2.6-5.9M20 4v5h-5" />
                  </svg>
                </button>
              )}
              <button
                className={'sd-check' + (on ? ' on' : isNext ? ' next' : '')}
                aria-pressed={on}
                aria-label={`Mark ${code} ${on ? 'unwatched' : 'watched'}`}
                onClick={() => { resumes(!on); if (!on) added(1); markEpisode(id, season.n, ep.episode_number, ep.runtime, !on); }}
              >
                <span>{on && <CheckIcon size={16} w={3} />}</span>
              </button>
            </div>
          );
        })}
      {noteEp && (
        <NoteSheet
          title={`S${season.n}E${noteEp.n}`}
          subtitle={noteEp.name}
          value={(show.notes || {})[epKey(season.n, noteEp.n)]}
          onSave={(v) => { setEpisodeNote(id, epKey(season.n, noteEp.n), v); setNoteEp(null); }}
          onRemove={() => { setEpisodeNote(id, epKey(season.n, noteEp.n), {}); setNoteEp(null); }}
          onClose={() => setNoteEp(null)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------- page
export default function ShowDetail({ id, onBack }) {
  const state = useStore();
  const show = state.shows[id];
  const [syncing, setSyncing] = useState(false);
  const [sheet, setSheet] = useState(null); // 'platform' | 'streaming' | 'menu' | 'fix' | 'anime'
  const [fixQuery, setFixQuery] = useState('');
  const [fixResults, setFixResults] = useState(null);
  const [streamLoading, setStreamLoading] = useState(false);
  const [trailerLoading, setTrailerLoading] = useState(false);
  const [showDone, setShowDone] = useState(false);
  // "Resumed" toast with Undo (shown when watching something resumes a dropped show)
  const [resumed, setResumed] = useState(null); // { at } = the original drop date, so Undo can restore it
  const resumedTimer = useRef(null);
  useEffect(() => () => clearTimeout(resumedTimer.current), []);
  function showResumed(at) {
    setResumed({ at });
    clearTimeout(resumedTimer.current);
    resumedTimer.current = setTimeout(() => setResumed(null), 6000);
  }
  // "Fix watch dates": correct when already-recorded episodes were watched, with Undo.
  const [fixOpen, setFixOpen] = useState(false);
  const [datesToast, setDatesToast] = useState(null); // { text, prev }
  const datesTimer = useRef(null);
  useEffect(() => () => clearTimeout(datesTimer.current), []);
  function applyDates(keys, day) {
    const prev = setWatchDates(id, keys, stampForDay(day));
    setFixOpen(false);
    setSheet(null);
    clearTimeout(resumedTimer.current); setResumed(null);
    setFinishToast(false);
    setDatesToast({ text: fixedToast(Object.keys(prev).length, day), prev });
    clearTimeout(datesTimer.current);
    datesTimer.current = setTimeout(() => setDatesToast(null), 8000);
  }
  function undoDates() {
    if (datesToast) restoreWatchDates(id, datesToast.prev);
    clearTimeout(datesTimer.current);
    setDatesToast(null);
  }

  // "You finished <show>": a card offered right after the final episode is marked.
  const [finishOpen, setFinishOpen] = useState(false);
  const [finishToast, setFinishToast] = useState(false);
  const finishTimer = useRef(null);
  useEffect(() => () => clearTimeout(finishTimer.current), []);
  function undoResume() {
    if (resumed) setShowDropped(id, true, resumed.at || undefined);
    clearTimeout(resumedTimer.current);
    setResumed(null);
  }

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
      const { providers: subs, free, link } = normalizeProviders(au);
      setShowProviders(id, subs, link, free);
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
      setSheet(null);
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
      <div className="sd-page">
        <button className="sd-back" onClick={onBack}><Chevron dir="left" />Back</button>
        <p className="muted">Show not found.</p>
      </div>
    );
  }

  const noteResumed = () => { if (show.dropped === true) showResumed(show.droppedAt || null); };
  // `n` = episodes about to be newly watched. If that completes the show, offer the card
  // (it replaces the "Resumed" toast, since only one toast fits on screen).
  const noteAdded = (n) => {
    if (!becomesFinished(show, n)) return;
    clearTimeout(resumedTimer.current);
    setResumed(null);
    setFinishToast(true);
    clearTimeout(finishTimer.current);
    finishTimer.current = setTimeout(() => setFinishToast(false), 9000);
  };

  // ---- derived state
  const today = isoToday();
  const seen = watchedCount(show);
  const left = episodesLeft(show);
  const hrs = hoursLeft(show);
  const finish = paceFinish(show);
  const total = show.totalEpisodes || 0;
  const pct = total ? Math.min(100, Math.round((seen / total) * 100)) : 0;
  const finished = total > 0 && seen >= total;
  const next = nextToMark(show, today);
  const platform = platformById(show.platform);
  const providers = show.providers || [];
  const anime = show.anime || null;
  // The "Anime details" row appears up front for animation shows (and any
  // already linked); everything else can still link it from the ⋯ menu.
  const animeRow = looksLikeAnime(show) || !!anime;
  const alts = altTitles(show, anime);

  // TMDB ids the user already tracks, so the cast panel can flag "in library".
  const trackedTv = new Set(Object.values(state.shows).map((s) => s.tmdbId).filter(Boolean));
  const trackedMovie = new Set((state.movies || []).map((m) => m.tmdbId).filter(Boolean));

  const seasons = show.seasons || [];
  const infos = seasons.map((se) => ({ season: se.n, se, info: seasonInfo(show, se, today) }));
  const lead = leadingDoneCount(infos.map((x) => x.info));
  const foldedLead = lead > 0 && !showDone ? infos.slice(0, lead) : [];
  const visible = infos.slice(foldedLead.length);
  const currentN = currentSeasonN(infos, next);

  const titleSize = show.name.length <= 18 ? 42 : show.name.length <= 28 ? 34 : 28;
  const kind = `TV${show.status ? ' · ' + show.status : ''}`;

  let streamSub;
  if (!show.tmdbId) streamSub = 'Link to TMDB to check availability';
  else if (!hasKey()) streamSub = 'Add a TMDB API key in Settings';
  else if (providers.length || (show.providersFree || []).length) {
    const free = (show.providersFree || []).map((p) => p.name);
    streamSub = [providers.map((p) => p.name).join(' · '), free.length ? `Free: ${free.slice(0, 2).join(', ')}` : ''].filter(Boolean).join(' · ');
  } else if (show.providersSynced) streamSub = 'Not streaming in Australia';
  else streamSub = 'Tap to check availability';

  const rating = show.rating || 0;

  return (
    <div className="sd-page">
      <button className="sd-back" onClick={onBack}><Chevron dir="left" />Back</button>

      {/* On a phone these two wrappers just stack (hero, settings, seasons,
          cast — exactly as before). On desktop they become a sticky sidebar
          and a wide main column (see "Desktop layout" in ui.css). */}
      <div className="sd-cols">
      <aside className="sd-side">
      {/* ---------------- hero */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingTop: 4 }}>
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end' }}>
          <div style={{ flexGrow: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span className="sd-lbl">{kind}</span>
            <h1
              style={{
                margin: 0,
                fontFamily: 'var(--font-display)',
                fontSize: titleSize,
                lineHeight: 0.95,
                fontWeight: 800,
                overflowWrap: 'break-word',
              }}
            >
              {show.name}
            </h1>
            {alts.length > 0 && (
              <span className="sd-ell" style={{ fontSize: 13, color: 'var(--text-dim)' }}>
                {alts.join(' · ')}
              </span>
            )}
            {show.dropped === true && (
              <span className="sd-mono" data-testid="dropped-pill" style={{ alignSelf: 'flex-start', fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-dim)', border: '1px solid var(--line)', borderRadius: 999, padding: '3px 9px' }}>
                Dropped
              </span>
            )}
          </div>
          {show.poster ? (
            <img
              className="sd-hero-poster"
              src={img(show.poster, 'w185')}
              alt=""
              style={{ flexShrink: 0, borderRadius: 10, objectFit: 'cover', border: '1px solid var(--line)' }}
            />
          ) : (
            <div
              className="sd-hero-poster"
              style={{
                flexShrink: 0, borderRadius: 10,
                background: 'linear-gradient(165deg, #3a3f4d, #171d28)', border: '1px solid var(--line)',
              }}
            />
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Bar value={pct} color={finished ? 'var(--teal)' : 'var(--amber)'} height={8} />
          <div className="sd-mono" style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12, color: 'var(--text-dim)' }}>
            <span>
              <span style={{ color: 'var(--text)' }}>{seen}</span>
              {total ? ` of ${total} watched` : ' watched'}
            </span>
            {left > 0 && (
              <span style={{ color: 'var(--amber)' }}>
                {left} left{hrs > 0 ? ` · ~${hrs} hrs` : ''}
              </span>
            )}
          </div>
          {finish && (
            <div className="sd-mono" style={{ fontSize: 12, color: 'var(--text-dim)' }}>
              ≈ finish by {fmtDate(finish.date)} at your recent pace
            </div>
          )}
        </div>

        {next && (
          <button
            className="sd-btn primary"
            style={{ width: '100%', height: 52, fontSize: 15 }}
            onClick={() => { noteResumed(); noteAdded(1); markEpisode(id, next.season, next.episode, null, true); }}
          >
            <CheckIcon size={18} />
            <span>
              Mark{' '}
              <span className="sd-mono" style={{ fontWeight: 600 }}>
                S{pad2(next.season)}·E{pad2(next.episode)}
              </span>{' '}
              watched
            </span>
          </button>
        )}

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className={'sd-btn' + (show.followed ? ' teal' : '')}
            style={{ flex: 1 }}
            aria-pressed={!!show.followed}
            onClick={() => toggleFollow(id)}
          >
            {show.followed ? <CheckIcon /> : <span aria-hidden="true" style={{ fontSize: 18, lineHeight: 1 }}>+</span>}
            {show.followed ? 'Following' : 'Follow'}
          </button>
          {hasKey() && show.tmdbId && (
            <button className="sd-btn" onClick={openTrailer} disabled={trailerLoading}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M7 5l12 7-12 7z" />
              </svg>
              {trailerLoading ? 'Loading…' : 'Trailer'}
            </button>
          )}
          <button
            className="sd-btn"
            style={{ width: 44, padding: 0 }}
            aria-label="More actions"
            aria-haspopup="dialog"
            onClick={() => setSheet('menu')}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" />
            </svg>
          </button>
        </div>
        {isFinishedShow(show) && (
          <button type="button" className="sd-btn" data-testid="finish-card-btn" onClick={() => { setFinishToast(false); setFinishOpen(true); }}>
            Share your “You finished” card
          </button>
        )}
        {syncing && <span className="sd-mono" style={{ fontSize: 12, color: 'var(--text-dim)' }}>Syncing with TMDB…</span>}
      </div>

      {/* ---------------- rating / where you watch / streaming */}
      <section className="sd-card">
        <div className="sd-row" style={{ justifyContent: 'space-between', paddingRight: 8, cursor: 'default' }}>
          <span>Your rating</span>
          <span role="radiogroup" aria-label="Your rating" style={{ display: 'flex' }}>
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                className="sd-star"
                role="radio"
                aria-checked={n === rating}
                aria-label={`${n} star${n > 1 ? 's' : ''}`}
                onClick={() => setShowRating(id, n === rating ? 0 : n)}
              >
                <StarIcon on={n <= rating} />
              </button>
            ))}
          </span>
        </div>

        <button className="sd-row sd-sep" aria-haspopup="dialog" onClick={() => setSheet('platform')}>
          <span style={{ flexGrow: 1 }}>Where you watch</span>
          {platform ? (
            <span style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--sd-text-2)' }}>
              <span style={{ width: 8, height: 8, borderRadius: 4, background: platform.color, display: 'block' }} />
              {platform.label}
            </span>
          ) : (
            <span style={{ color: 'var(--text-dim)' }}>Not set</span>
          )}
          <span className="sd-mono" style={{ fontSize: 11, color: 'var(--amber)' }}>
            {platform ? 'CHANGE' : 'SET'}
          </span>
          <Chevron />
        </button>

        <button
          className="sd-row sd-sep"
          aria-haspopup="dialog"
          disabled={!show.tmdbId || !hasKey()}
          onClick={() => setSheet('streaming')}
        >
          <span style={{ flexGrow: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span>Streaming in Australia</span>
            <span className="sd-ell" style={{ fontSize: 12, color: 'var(--text-dim)' }}>{streamSub}</span>
          </span>
          {providers.length > 0 && (
            <span style={{ display: 'flex' }}>
              {providers.slice(0, 3).map((p, i) => (
                <span
                  key={p.name}
                  style={{
                    width: 24, height: 24, borderRadius: 6, display: 'block', overflow: 'hidden',
                    background: 'var(--line)', marginLeft: i === 0 ? 0 : -6, border: '2px solid var(--bg-raise)',
                    boxSizing: 'content-box',
                  }}
                >
                  {p.logo && (
                    <img src={img(p.logo, 'w45')} alt="" style={{ width: 24, height: 24, display: 'block' }} />
                  )}
                </span>
              ))}
            </span>
          )}
          <Chevron />
        </button>

        {animeRow && (
          <button className="sd-row sd-sep" aria-haspopup="dialog" onClick={() => setSheet('anime')}>
            <span style={{ flexGrow: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span>Anime details</span>
              <span className="sd-ell" style={{ fontSize: 12, color: 'var(--text-dim)' }}>
                {anime ? `AniList · ${summaryLine(anime)}` : 'Link to AniList for titles and episode info'}
              </span>
            </span>
            {!anime && (
              <span className="sd-mono" style={{ fontSize: 11, color: 'var(--amber)' }}>LINK</span>
            )}
            <Chevron />
          </button>
        )}
      </section>

      </aside>

      <div className="sd-main">
      {/* ---------------- seasons */}
      <section className="sd-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '14px 16px 10px' }}>
          <h2 className="sd-h2">Seasons</h2>
          <span className="sd-mono" style={{ fontSize: 12, color: 'var(--text-dim)' }}>
            {seasons.length} season{seasons.length === 1 ? '' : 's'}
          </span>
        </div>

        {seasons.length === 0 && !syncing && (
          <p className="muted" style={{ margin: 0, padding: '4px 16px 16px', fontSize: 13 }}>
            {hasKey()
              ? 'No episode data loaded yet. Use “Sync with TMDB” on the Shows tab, or reopen this page.'
              : 'Add a TMDB API key in Settings to load seasons and episodes.'}
          </p>
        )}

        {foldedLead.length > 0 && (() => {
          const first = foldedLead[0].season;
          const last = foldedLead[foldedLead.length - 1].season;
          const seenSum = foldedLead.reduce((n, x) => n + Math.min(x.info.seen, x.info.count), 0);
          const countSum = foldedLead.reduce((n, x) => n + x.info.count, 0);
          return (
            <button
              className="sd-season-head sd-sep"
              aria-expanded="false"
              onClick={() => setShowDone(true)}
            >
              <span
                style={{
                  width: 28, height: 28, borderRadius: 14, flex: 'none', display: 'flex',
                  alignItems: 'center', justifyContent: 'center', color: 'var(--teal)',
                  background: 'rgba(86, 200, 181, 0.16)',
                }}
              >
                <CheckIcon size={15} w={3} />
              </span>
              <span style={{ flexGrow: 1, fontSize: 14 }}>Seasons {first}–{last}</span>
              <span className="sd-mono" style={{ fontSize: 12, color: 'var(--text-dim)' }}>
                {seenSum} / {countSum}
              </span>
              <Chevron dir="down" size={18} />
            </button>
          );
        })()}

        {visible.map(({ se, info }) => (
          <Season
            key={`${show.tmdbId || 'x'}:${se.n}`}
            id={id}
            show={show}
            season={se}
            info={info}
            isCurrent={se.n === currentN}
            next={next}
            onResumed={showResumed}
            onAdded={noteAdded}
          />
        ))}
      </section>

      {/* ---------------- cast & crew */}
      {hasKey() && show.tmdbId && (
        <CastCrew tmdbId={show.tmdbId} trackedTv={trackedTv} trackedMovie={trackedMovie} />
      )}
      </div>
      </div>

      {/* ================= sheets ================= */}

      <Sheet
        open={sheet === 'platform'}
        title="Where you watch"
        subtitle="Used in Stats › Where you watch"
        onClose={() => setSheet(null)}
      >
        <div className="sd-opt-grid">
          {PLATFORMS.map((p) => {
            const on = show.platform === p.id;
            return (
              <button
                key={p.id}
                className={'sd-opt' + (on ? ' on' : '')}
                aria-pressed={on}
                onClick={() => setShowPlatform(id, on ? '' : p.id)}
              >
                {on ? '✓ ' : ''}
                {p.label}
              </button>
            );
          })}
        </div>
      </Sheet>

      <Sheet
        open={sheet === 'streaming'}
        title="Streaming in Australia"
        subtitle={show.providersSynced ? 'Subscription services' : 'Not checked yet'}
        onClose={() => setSheet(null)}
      >
        {providers.length > 0 ? (
          <div className="sd-card">
            {providers.map((p, i) => (
              <div key={p.name} className={'sd-row' + (i > 0 ? ' sd-sep' : '')} style={{ cursor: 'default' }}>
                <span
                  style={{
                    width: 32, height: 32, borderRadius: 8, overflow: 'hidden', flex: 'none',
                    background: 'var(--line)', display: 'block',
                  }}
                >
                  {p.logo && <img src={img(p.logo, 'w92')} alt="" style={{ width: 32, height: 32, display: 'block' }} />}
                </span>
                <span style={{ flexGrow: 1 }}>{p.name}</span>
                <span className="sd-mono" style={{ fontSize: 11, color: 'var(--teal)' }}>STREAM</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="muted" style={{ margin: 0, fontSize: 14 }}>
            {show.providersSynced && !(show.providersFree || []).length
              ? 'Not currently streaming anywhere in Australia, per TMDB/JustWatch.'
              : show.providersSynced
              ? 'No subscription service has it right now.'
              : 'Tap “Check” to see where this is streaming.'}
          </p>
        )}
        {(show.providersFree || []).length > 0 && (
          <div className="sd-card" style={{ marginTop: 12 }} aria-label="Free to watch">
            {show.providersFree.map((p, i) => (
              <div key={p.name} className={'sd-row' + (i > 0 ? ' sd-sep' : '')} style={{ cursor: 'default' }}>
                <span style={{ width: 32, height: 32, borderRadius: 8, overflow: 'hidden', flex: 'none', background: 'var(--line)', display: 'block' }}>
                  {p.logo && <img src={img(p.logo, 'w92')} alt="" style={{ width: 32, height: 32, display: 'block' }} />}
                </span>
                <span style={{ flexGrow: 1 }}>{p.name}</span>
                <span className="sd-mono" style={{ fontSize: 11, color: 'var(--amber)' }}>FREE</span>
              </div>
            ))}
          </div>
        )}
        <button
          className="sd-btn"
          style={{ width: '100%', marginTop: 12 }}
          onClick={refreshStreaming}
          disabled={streamLoading}
        >
          {streamLoading ? 'Checking…' : show.providersSynced ? 'Refresh' : 'Check'}
        </button>
        {show.providersLink && (
          <a
            href={show.providersLink}
            target="_blank"
            rel="noreferrer"
            className="muted"
            style={{ fontSize: 12, display: 'inline-block', marginTop: 12 }}
          >
            Streaming data by JustWatch →
          </a>
        )}
      </Sheet>

      <Sheet open={sheet === 'menu'} title={show.name} subtitle="More actions" onClose={() => setSheet(null)}>
        <div className="sd-card">
          <button
            className="sd-row"
            onClick={() => {
              setShowDropped(id, show.dropped !== true);
              clearTimeout(resumedTimer.current);
              setResumed(null);
              setSheet(null);
            }}
          >
            <span style={{ flexGrow: 1, color: 'var(--sd-text-2)' }}>
              {show.dropped === true ? 'Resume watching' : 'Drop this show'}
            </span>
          </button>
          {watchedList(show).length > 0 && (
            <button className="sd-row sd-sep" data-testid="fix-dates-row" onClick={() => { setSheet(null); setFixOpen(true); }}>
              <span style={{ flexGrow: 1, color: 'var(--sd-text-2)' }}>Fix watch dates…</span>
            </button>
          )}
          {!animeRow && (
            <button className="sd-row sd-sep" onClick={() => setSheet('anime')}>
              <span style={{ flexGrow: 1, color: 'var(--sd-text-2)' }}>Anime details (AniList)</span>
              <Chevron />
            </button>
          )}
          {hasKey() && (
            <button
              className="sd-row sd-sep"
              onClick={() => {
                setFixQuery(show.name);
                setFixResults(null);
                setSheet('fix');
              }}
            >
              <span style={{ flexGrow: 1, color: 'var(--sd-text-2)' }}>Fix TMDB match</span>
              <Chevron />
            </button>
          )}
          <button
            className="sd-row sd-sep"
            style={{ color: 'var(--red)' }}
            onClick={() => {
              if (
                confirm(
                  `Delete "${show.name}" and its watch history? This removes it ` +
                    `from your library and every signed-in device, and can't be undone.`
                )
              ) {
                setSheet(null);
                deleteShow(id);
                onBack();
              }
            }}
          >
            Delete from library
          </button>
        </div>
      </Sheet>

      <Sheet open={sheet === 'fix'} title="Fix TMDB match" onClose={() => setSheet(null)}>
        <p className="muted" style={{ margin: '0 0 12px', fontSize: 13 }}>
          Search TMDB and pick the correct show. Your watch history stays; only the poster,
          episode data and air dates get relinked.
        </p>
        <form onSubmit={runFixSearch} style={{ display: 'flex', gap: 8 }}>
          <input
            type="search"
            value={fixQuery}
            onChange={(e) => setFixQuery(e.target.value)}
            aria-label="Search TMDB"
            style={{
              flex: 1, minWidth: 0, height: 44, borderRadius: 12, border: '1px solid var(--line)',
              background: 'var(--bg-raise)', color: 'var(--text)', font: 'inherit', fontSize: 14,
              padding: '0 12px',
            }}
          />
          <button className="sd-btn" type="submit">Search</button>
        </form>
        {fixResults &&
          (fixResults.length === 0 ? (
            <p className="muted" style={{ marginTop: 12 }}>
              No results — try a different name (e.g. the English title).
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
              {fixResults.slice(0, 6).map((r) => (
                <div key={r.id} className="sd-card" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 8 }}>
                  {r.poster_path ? (
                    <img src={img(r.poster_path, 'w154')} alt="" style={{ width: 34, aspectRatio: '2/3', borderRadius: 5, objectFit: 'cover', flex: 'none' }} />
                  ) : (
                    <div style={{ width: 34, aspectRatio: '2/3', borderRadius: 5, background: 'var(--bg-card)', flex: 'none' }} />
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="sd-ell" style={{ fontSize: 14 }}>{r.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
                      {(r.first_air_date || '').slice(0, 4) || 'unknown year'}
                    </div>
                  </div>
                  <button className="sd-btn primary" style={{ height: 36, padding: '0 12px', fontSize: 13 }} onClick={() => linkTo(r)}>
                    Link this
                  </button>
                </div>
              ))}
            </div>
          ))}
      </Sheet>

      {sheet === 'anime' && <AnimeSheet id={id} show={show} onClose={() => setSheet(null)} />}

      {fixOpen && <FixDatesSheet show={show} today={isoToday()} onApply={applyDates} onClose={() => setFixOpen(false)} />}

      {datesToast && !finishToast && (
        <div className="sd-toast" role="status">
          <span className="sd-ell" style={{ flex: 1 }}>{datesToast.text}</span>
          <button className="sd-linkbtn" style={{ height: 44, padding: '0 14px', fontSize: 14 }} onClick={undoDates}>Undo</button>
        </div>
      )}

      {finishOpen && <FinishCardSheet show={show} allShows={state.shows} onClose={() => setFinishOpen(false)} />}

      {finishToast && (
        <div className="sd-toast" role="status">
          <span className="sd-ell" style={{ flex: 1 }}>You finished {show.name}!</span>
          <button className="sd-linkbtn" style={{ height: 44, padding: '0 14px', fontSize: 14 }} onClick={() => { clearTimeout(finishTimer.current); setFinishToast(false); setFinishOpen(true); }}>
            Make card
          </button>
        </div>
      )}

      {resumed && !finishToast && !datesToast && (
        <div className="sd-toast" role="status">
          <span className="sd-ell" style={{ flex: 1 }}>Resumed · {show.name}</span>
          <button className="sd-linkbtn" style={{ height: 44, padding: '0 14px', fontSize: 14 }} onClick={undoResume}>
            Undo
          </button>
        </div>
      )}
    </div>
  );
}
