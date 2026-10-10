import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../store/useStore.js';
import { addShowToWatchlist, addMovieToWatchlist, setDiscoverHidden } from '../store/db.js';
import { useServicesPrefs } from '../store/servicesPrefs.js';
import {
  img, hasKey, showDetails, movieDetails, tasteDetails, searchShows, tvRecommendations, movieRecommendations,
  tvSimilar, movieSimilar, personCombinedCredits, discoverTitles, movieProviderList, trendingWeek,
  tvVideos, movieVideos, pickTrailer,
} from '../api/tmdb.js';
import { runDiscover, ownedKeys } from './discoverEngine.js';
import { animeRecommendations } from '../api/anilist.js';
import { loadLog, saveLog, recordShown, relinkShown, hitStats, hitLine } from './hitLogic.js';
import { loadCache, saveCache, progressText, genreLabel } from './tasteLogic.js';
import { hiddenKeySet, hiddenList } from './hiddenLogic.js';
import { trailerUrl } from './movieNightLogic.js';
import { Empty } from './LibraryUI.jsx';
import MovieNightSheet from './MovieNightSheet.jsx';
import { Chevron, Sheet } from './ui.jsx';

// Discover: Netflix-style rows built from your taste (see tasteLogic.js for how it works).
// The first visit looks up keywords and people for your library once ("Learning your taste…");
// they're cached on this device, so later visits are quick. "Not interested" syncs.

const api = {
  details: (kind, id) => tasteDetails(kind, id),
  recommendations: (kind, id) => (kind === 'tv' ? tvRecommendations(id, 1) : movieRecommendations(id, 1)),
  similar: (kind, id) => (kind === 'tv' ? tvSimilar(id, 1) : movieSimilar(id, 1)),
  personCredits: (id) => personCombinedCredits(id),
  discover: (kind, params) => discoverTitles(kind, params),
  providerList: () => movieProviderList('AU'),
  trending: () => trendingWeek(),
  animeRecs: (anilistId) => animeRecommendations(anilistId),
};
const artOf = (c) => c.image || img(c.poster, 'w342');

// An anime pick comes from AniList, but the library needs TMDB's record: find it by title
// (preferring a Japanese-language match).
async function tmdbShowForAnime(c) {
  const res = await searchShows(c.name);
  const list = (res && res.results) || [];
  const hit = list.find((r) => r.original_language === 'ja') || list[0];
  if (!hit) throw new Error('No TMDB match for ' + c.name);
  return showDetails(hit.id);
}

// The last result, kept for this session so switching tabs doesn't rebuild everything.
let lastRun = null; // { rows, at }
const trailerCache = new Map(); // 'tv:1' -> YouTube key or null
const UNDO_MS = 6000;

const storage = () => { try { return window.localStorage; } catch (e) { return { getItem: () => null, setItem: () => {} }; } };

export default function Discover() {
  const state = useStore();
  const svc = useServicesPrefs();
  const [run, setRun] = useState(lastRun); // { rows, at } | null
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState(null);
  const [adding, setAdding] = useState(null);
  const [added, setAdded] = useState({});
  const [open, setOpen] = useState(null); // the card shown in the details sheet
  const [undo, setUndo] = useState(null); // the card just hidden, for Undo
  const [trailer, setTrailer] = useState({ key: null, busy: false, msg: '' });
  const [nightOpen, setNightOpen] = useState(false);
  const alive = useRef(true);
  const undoTimer = useRef(null);
  useEffect(() => { alive.current = true; return () => { alive.current = false; clearTimeout(undoTimer.current); }; }, []);

  const hasLibrary = Object.keys(state.shows).length > 0 || state.movies.length > 0;

  async function build() {
    if (busy) return;
    setBusy(true); setError(null); setProgress({ phase: 'learning', done: 0, total: 0 });
    try {
      const st = storage();
      const cache = loadCache(st);
      const res = await runDiscover({
        state, hidden: state.hidden, cache, api, mine: svc.mine,
        onProgress: (p) => { if (alive.current) setProgress(p); },
      });
      saveCache(st, cache);
      // remember what was suggested (first time only), for the hit rate
      saveLog(st, recordShown(loadLog(st), res.rows.flatMap((r) => r.items), new Date().toISOString()));
      lastRun = { rows: res.rows, at: Date.now() };
      if (alive.current) {
        setRun(lastRun);
        if (!res.rows.length) setError(res.stats.failed && res.stats.failed === res.stats.calls ? 'Could not reach TMDB. Check your connection and try again.' : null);
      }
    } catch (e) {
      console.error('Discover failed', e);
      if (alive.current) setError('Could not load recommendations from TMDB. Try again in a moment.');
    } finally {
      if (alive.current) { setBusy(false); setProgress(null); }
    }
  }

  // Build on the first visit of the session (the result is kept while the app is open).
  useEffect(() => {
    if (hasKey() && hasLibrary && !lastRun) build();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Hidden or already-added titles drop out straight away, including ones hidden on another device.
  const hiddenNow = useMemo(() => hiddenKeySet(state.hidden), [state.hidden]);
  const owned = useMemo(() => ownedKeys(state), [state.shows, state.movies]); // eslint-disable-line react-hooks/exhaustive-deps
  const rows = useMemo(() => (run ? run.rows : [])
    .map((r) => ({ ...r, items: r.items.filter((c) => !hiddenNow.has(c.key) && (!owned.has(c.key) || added[c.key])) }))
    .filter((r) => r.items.length > 0), [run, hiddenNow, owned, added]);
  const hiddenCount = useMemo(() => hiddenList(state.hidden).length, [state.hidden]);
  const hits = useMemo(() => (run ? hitLine(hitStats(loadLog(storage()), state)) : ''), [run, state.shows, state.movies]); // eslint-disable-line react-hooks/exhaustive-deps

  async function addItem(c) {
    setAdding(c.key);
    try {
      if (c.kind === 'anime') {
        const d = await tmdbShowForAnime(c);
        addShowToWatchlist(d);
        const st = storage(); saveLog(st, relinkShown(loadLog(st), c.key, `tv:${d.id}`)); // so it counts as a hit
      }
      else if (c.kind === 'tv') addShowToWatchlist(await showDetails(c.id));
      else addMovieToWatchlist(await movieDetails(c.id));
      setAdded((a) => ({ ...a, [c.key]: true }));
    } catch (e) {
      console.error('Add to watchlist failed', e);
      alert(`Could not add "${c.name}" — try again.`);
    } finally {
      setAdding(null);
    }
  }

  function notInterested(c) {
    setDiscoverHidden(c, true);
    setOpen(null);
    clearTimeout(undoTimer.current);
    setUndo(c);
    undoTimer.current = setTimeout(() => { if (alive.current) setUndo(null); }, UNDO_MS);
  }
  function undoHide() {
    if (undo) setDiscoverHidden(undo, false);
    clearTimeout(undoTimer.current);
    setUndo(null);
  }

  async function watchTrailer(c) {
    const win = window.open('', '_blank');
    if (!win) { setTrailer({ key: c.key, busy: false, msg: 'Your browser blocked the new tab. Allow pop-ups for this site and try again.' }); return; }
    try { win.opener = null; } catch (e) { /* best effort */ }
    setTrailer({ key: c.key, busy: true, msg: '' });
    try {
      let k = c.kind === 'anime' ? c.trailer : trailerCache.get(c.key);
      if (k === undefined) { const v = pickTrailer(await (c.kind === 'tv' ? tvVideos(c.id) : movieVideos(c.id))); k = v ? v.key : null; trailerCache.set(c.key, k); }
      const url = trailerUrl(k);
      if (url) { win.location = url; if (alive.current) setTrailer({ key: c.key, busy: false, msg: '' }); }
      else { win.close(); if (alive.current) setTrailer({ key: c.key, busy: false, msg: 'No trailer found on TMDB for this title.' }); }
    } catch (e) {
      win.close(); if (alive.current) setTrailer({ key: c.key, busy: false, msg: 'Could not load the trailer. Check your connection and try again.' });
    }
  }

  if (!hasKey()) {
    return <Empty>Add a TMDB API key in Settings to get recommendations.</Empty>;
  }

  const movieNight = (
    <>
      <button type="button" className="sd-tonight" style={{ marginTop: 0 }} onClick={() => setNightOpen(true)}>
        <span className="txt">
          <strong>Movie night</strong>
          <small>Find a new movie for tonight: pick your time and mood</small>
        </span>
        <Chevron />
      </button>
      {nightOpen && <MovieNightSheet onClose={() => setNightOpen(false)} />}
    </>
  );

  if (!hasLibrary) {
    return (
      <div className="sd-gap10">
        {movieNight}
        <Empty>
          Watch, rate or add a few shows or movies, and Discover will learn your taste from them to find what to
          watch next.
        </Empty>
      </div>
    );
  }

  const pct = progress && progress.phase === 'learning' && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : null;

  return (
    <div className="sd-gap10 sd-disc">
      {movieNight}

      {busy && (
        <div className="sd-card sd-pad sd-disc-learn" role="status" aria-live="polite" data-testid="disc-progress">
          <strong>{progressText(progress) || 'Getting ready…'}</strong>
          {pct !== null && (
            <span className="sd-disc-bar" aria-hidden="true"><span style={{ width: `${pct}%` }} /></span>
          )}
          <span className="sd-sub">
            {progress && progress.phase === 'learning' && progress.total > 0
              ? 'Only the first time: looking up the themes and people in what you watch. Saved on this device.'
              : 'Ranking suggestions on everything you watch.'}
          </span>
        </div>
      )}

      {!busy && run && (
        <div className="sd-sec2-head has-ctl">
          <span className="sd-sub">Picked for you from everything you watch and rate.</span>
          <button className="sd-btn sm" onClick={build} disabled={busy}>Refresh</button>
        </div>
      )}

      {error && <p className="sd-sub" role="alert">{error}</p>}
      {!busy && !run && !error && (
        <button className="sd-btn primary" onClick={build}>Show me picks</button>
      )}

      {!busy && run && rows.length === 0 && !error && (
        <Empty>
          No new suggestions turned up — you may already have most of what TMDB suggests. Watch or rate a few more
          things and try Refresh.
        </Empty>
      )}

      {undo && (
        <div className="sd-disc-undo" role="status">
          <span>Hidden “{undo.name}”. Discover won’t suggest it again.</span>
          <button type="button" className="sd-linkbtn" onClick={undoHide}>Undo</button>
        </div>
      )}

      {rows.map((r) => (
        <section className="sd-disc-row" key={r.id} aria-label={r.title} data-row={r.type}>
          <div className="sd-disc-rowhead">
            <h3>{r.title}</h3>
            {r.sub && <span className="sd-sub">{r.sub}</span>}
          </div>
          <div className="sd-disc-strip">
            {r.items.map((c) => (
              <div className="sd-disc-card" key={c.key} data-key={c.key}>
                <span className="sd-tilebtn-art">
                  <button type="button" className="sd-pick-x" onClick={() => notInterested(c)} title="Not interested" aria-label={`Not interested in ${c.name}`}>×</button>
                  <button type="button" className="sd-disc-open" onClick={() => { setOpen(c); setTrailer({ key: null, busy: false, msg: '' }); }} aria-label={`About ${c.name}`}>
                    <img src={artOf(c)} alt="" loading="lazy" />
                  </button>
                  <span className="sd-tilebtn-badge sd-disc-match">{c.match}% match</span>
                </span>
                <span className="sd-tilebtn-name" title={c.name}>{c.name}</span>
                <span className="sd-pick-why" title={c.why}>{c.why}</span>
                <button
                  type="button"
                  className="sd-btn sm block"
                  onClick={() => addItem(c)}
                  disabled={adding === c.key || added[c.key]}
                >
                  {added[c.key] ? 'Added ✓' : adding === c.key ? 'Adding…' : '+ Watchlist'}
                </button>
              </div>
            ))}
          </div>
        </section>
      ))}

      {hits && run && !busy && <p className="sd-sub sd-disc-foot" data-testid="disc-hits">{hits}</p>}
      {hiddenCount > 0 && run && !busy && (
        <p className="sd-sub sd-disc-foot" data-testid="disc-hidden">
          {hiddenCount} {hiddenCount === 1 ? 'title' : 'titles'} hidden with “Not interested”. You can bring them back in Settings.
        </p>
      )}

      <Sheet open={!!open} title={open ? open.name : ''} subtitle={open ? [open.year, open.kind === 'movie' ? 'Movie' : open.kind === 'anime' ? 'Anime · from AniList' : 'Show'].filter(Boolean).join(' · ') : ''} onClose={() => setOpen(null)}>
        {open && (
          <div className="sd-disc-detail">
            <div className="sd-mdet-facts">
              <span>{open.match}% match</span>
              {open.vote > 0 && <span>{open.kind === 'anime' ? 'AniList' : 'TMDB'} {open.vote.toFixed(1)}</span>}
              {open.g.length > 0 && <span>{open.g.slice(0, 3).map(genreLabel).join(' · ')}</span>}
            </div>
            <p className="sd-pick-why" style={{ whiteSpace: 'normal' }}>{open.why}</p>
            <p className="sd-mdet-over">{open.overview || 'TMDB has no description for this title yet.'}</p>
            <div className="sd-mdet-actions">
              <button type="button" className="sd-btn sm primary" disabled={adding === open.key || added[open.key]} onClick={() => addItem(open)}>
                {added[open.key] ? 'Added ✓' : adding === open.key ? 'Adding…' : '+ Watchlist'}
              </button>
              <button type="button" className="sd-btn sm" data-testid="disc-trailer" disabled={trailer.busy && trailer.key === open.key} onClick={() => watchTrailer(open)}>
                {trailer.busy && trailer.key === open.key ? 'Opening…' : '▶ Trailer'}
              </button>
              <button type="button" className="sd-btn sm" onClick={() => notInterested(open)}>Not interested</button>
            </div>
            {trailer.key === open.key && trailer.msg ? <p className="sd-sub" role="status">{trailer.msg}</p> : null}
          </div>
        )}
      </Sheet>
    </div>
  );
}
