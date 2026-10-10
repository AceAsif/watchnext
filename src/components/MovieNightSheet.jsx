import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../store/useStore.js';
import { addMovieToWatchlist, setDiscoverHidden } from '../store/db.js';
import { hiddenKeySet } from './hiddenLogic.js';
import { genreKeysFromNames, tasteLine } from './tasteLogic.js';
import useTaste from './useTaste.js';
import { discoverMovies, movieProviderList, movieRecommendations, movieSimilar, movieDetails, movieVideos, pickTrailer, watchProviders, hasKey, img } from '../api/tmdb.js';
import { Sheet } from './ui.jsx';
import { initialOf } from './yearImageLogic.js';
import { normalizeProviders } from './servicesLogic.js';
import { ServicesToggle } from './ServicesUI.jsx';
import { useServicesPrefs } from '../store/servicesPrefs.js';
import {
  MOODS, MOVIE_TIME_CHOICES, MAX_SEEDS, ENRICH_BATCH, ENRICH_MAX, formatMinutes, loadPrefs, savePrefs,
  recommendedCandidate, popularCandidate, popularQueries, myProviderIds, mergePool, withDetails, withAvail, enrichOrder,
  suggestMovies, whyLines, sourceNote, emptyText, detailsText, trailerUrl,
} from './movieNightLogic.js';
import { moodNote } from './tonightLogic.js';

// Session caches, so reopening the sheet (or changing time/mood) doesn't repeat lookups.
const detailsCache = new Map(); // tmdb id -> movie details
let providerListCache = null; // TMDB's AU provider list
const trailerCache = new Map(); // tmdb id -> YouTube key, or null when TMDB has no trailer

const GAP_MS = 150;
const CONCURRENCY = 3;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Run `fn` over `list` with at most `n` in flight, starting each a little apart (TMDB rate limits).
async function mapLimit(list, n, fn) {
  let i = 0;
  const worker = async () => { while (i < list.length) { const mine = list[i++]; await fn(mine); await sleep(GAP_MS); } };
  await Promise.all(Array.from({ length: Math.min(n, list.length) }, worker));
}

// Your top-rated movies, the seeds Discover builds "because you liked…" from.
const pickSeeds = (movies) =>
  movies.filter((m) => m.rating > 0 && m.tmdbId).sort((a, b) => b.rating - a.rating || (b.ratedAt || '').localeCompare(a.ratedAt || '')).slice(0, MAX_SEEDS);

async function recommendationsFor(seed) {
  let results = [];
  try { results = ((await movieRecommendations(seed.tmdbId, 1)) || {}).results || []; } catch (e) { return []; }
  if (results.length < 5) { try { results = results.concat(((await movieSimilar(seed.tmdbId, 1)) || {}).results || []); } catch (e) { /* best effort */ } }
  return results.map((r) => recommendedCandidate(r, seed)).filter(Boolean);
}

function Art({ c, onClick }) {
  return c.poster ? <img className="art" src={img(c.poster, 'w154')} alt="" loading="lazy" onClick={onClick} /> : <span className="art blank" aria-hidden="true" onClick={onClick}>{initialOf(c.name)}</span>;
}

// "Movie night" (Discover tab): a NEW movie that fits your evening. Candidates are Discover's
// "because you liked…" movies plus popular movies on your services / free to watch; see
// movieNightLogic.js for the rules.
export default function MovieNightSheet({ onClose }) {
  const state = useStore();
  const svc = useServicesPrefs();
  const mine = useMemo(() => new Set(svc.mine), [svc.mine]);
  const mineKey = [...mine].sort().join(',');
  const seeds = useRef(pickSeeds(state.movies)); // fixed for this sitting
  // what you had when you opened it, plus movies you marked "Not interested" (on Discover or here)
  const owned = useRef(new Set([
    ...state.movies.map((m) => m.tmdbId).filter(Boolean),
    ...[...hiddenKeySet(state.hidden)].filter((k) => k.startsWith('movie:')).map((k) => Number(k.slice(6))),
  ]));

  const [prefs, setPrefs] = useState(() => loadPrefs(localStorage));
  const [seed, setSeed] = useState(0);
  const [shown, setShown] = useState(() => new Set());
  const [hidden, setHidden] = useState(() => new Set());
  const [added, setAdded] = useState(() => new Set());
  const [expanded, setExpanded] = useState(() => new Set()); // keys of picks whose details panel is open
  const [trailer, setTrailer] = useState({ id: null, busy: false, msg: '' });
  const [rounds, setRounds] = useState(1); // how many batches of details we're willing to look up
  const [pages, setPages] = useState(1); // pages of "popular" fetched

  const [recs, setRecs] = useState(null); // null = still loading
  const [pop, setPop] = useState({}); // `${key}|${page}` -> candidates
  const [details, setDetails] = useState(() => Object.fromEntries(detailsCache));
  const [avail, setAvail] = useState({});
  const [error, setError] = useState('');
  const failed = useRef(new Set());
  const inflight = useRef(new Set());
  const alive = useRef(true);
  const [tick, setTick] = useState(0);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const popKey = `${prefs.minutes}|${prefs.mood}|${mineKey}`;

  // 1) Discover's recommendations (once per sitting)
  useEffect(() => {
    if (!hasKey()) { setRecs([]); return; }
    (async () => {
      const out = [];
      await mapLimit(seeds.current, CONCURRENCY, async (s) => { out.push(...(await recommendationsFor(s))); });
      if (alive.current) setRecs(out);
    })();
  }, []);

  // 2) popular movies on your services / free (re-fetched when time, mood or services change)
  useEffect(() => {
    if (!hasKey()) return;
    for (let page = 1; page <= pages; page++) {
      const k = `${popKey}|${page}`;
      if (pop[k] || inflight.current.has('pop:' + k)) continue;
      inflight.current.add('pop:' + k);
      (async () => {
        try {
          if (!providerListCache) providerListCache = ((await movieProviderList('AU')) || {}).results || [];
          const ids = myProviderIds(providerListCache, mine);
          const lists = await Promise.all(popularQueries({ providerIds: ids, minutes: prefs.minutes, mood: prefs.mood, page }).map(async (q) => {
            const d = await discoverMovies(q.params);
            return ((d && d.results) || []).map((r) => popularCandidate(r, q.kind)).filter(Boolean);
          }));
          if (alive.current) setPop((p) => ({ ...p, [k]: lists.flat() }));
        } catch (e) {
          if (alive.current) { setError('Could not reach TMDB for popular movies. Check your connection and try again.'); setPop((p) => ({ ...p, [k]: [] })); }
        } finally { inflight.current.delete('pop:' + k); }
      })();
    }
  }, [popKey, pages]); // eslint-disable-line react-hooks/exhaustive-deps

  const popLoading = hasKey() && !pop[`${popKey}|1`];
  const pool = useMemo(() => {
    const pops = []; for (let p = 1; p <= pages; p++) if (pop[`${popKey}|${p}`]) pops.push(pop[`${popKey}|${p}`]);
    return mergePool([recs || [], ...pops], owned.current, added);
  }, [recs, pop, popKey, pages, added]);

  // 3) details (runtime, exact genres) for the most promising candidates
  const limit = Math.min(ENRICH_BATCH * rounds, ENRICH_MAX);
  const want = useMemo(() => enrichOrder(pool, { mood: prefs.mood, have: new Set(Object.keys(details).map(Number)), limit }), [pool, details, prefs.mood, limit]);
  useEffect(() => {
    if (!hasKey()) return;
    want.filter((id) => !failed.current.has('d:' + id) && !inflight.current.has('d:' + id)).slice(0, CONCURRENCY - [...inflight.current].filter((k) => k.startsWith('d:')).length).forEach((id, i) => {
      inflight.current.add('d:' + id);
      setTimeout(async () => {
        try {
          const d = detailsCache.get(id) || (await movieDetails(id));
          detailsCache.set(id, d);
          if (alive.current) setDetails((x) => ({ ...x, [id]: d }));
        } catch (e) { failed.current.add('d:' + id); } finally { inflight.current.delete('d:' + id); if (alive.current) setTick((n) => n + 1); }
      }, i * GAP_MS);
    });
  }, [want, tick]);

  const cands = useMemo(() => pool.map((c) => withAvail(withDetails(c, details[c.tmdbId]), avail[c.tmdbId])), [pool, details, avail]);

  // 4) with "Only on my services": check where recommended movies stream (popular ones already do)
  useEffect(() => {
    if (!prefs.onlyMine || !hasKey()) return;
    const todo = cands.filter((c) => c.runtime && c.runtime <= prefs.minutes && !c.onMine && !c.avail && !failed.current.has('a:' + c.tmdbId) && !inflight.current.has('a:' + c.tmdbId));
    todo.slice(0, CONCURRENCY - [...inflight.current].filter((k) => k.startsWith('a:')).length).forEach((c, i) => {
      inflight.current.add('a:' + c.tmdbId);
      setTimeout(async () => {
        try {
          const { providers, free } = normalizeProviders(await watchProviders('movie', c.tmdbId));
          if (alive.current) setAvail((x) => ({ ...x, [c.tmdbId]: { providers, providersFree: free, providersSynced: new Date().toISOString() } }));
        } catch (e) { failed.current.add('a:' + c.tmdbId); } finally { inflight.current.delete('a:' + c.tmdbId); if (alive.current) setTick((n) => n + 1); }
      }, i * GAP_MS);
    });
  }, [cands, prefs.onlyMine, prefs.minutes, tick]); // eslint-disable-line react-hooks/exhaustive-deps

  // your taste (shows AND movies), fixed for this sitting so adding a pick doesn't reshuffle the rest
  const liveTaste = useTaste(state);
  const taste = useRef(null);
  if (!taste.current) taste.current = { prof: liveTaste.prof, cache: liveTaste.cache };
  const result = useMemo(
    () => suggestMovies(cands, { minutes: prefs.minutes, mood: prefs.mood, seed, exclude: shown, hidden, mine, onlyMine: prefs.onlyMine, taste: taste.current }),
    [cands, prefs, seed, shown, hidden, mine]
  );

  const choose = (patch) => {
    const next = { ...prefs, ...patch };
    setPrefs(next); savePrefs(localStorage, next);
    setShown(new Set()); setSeed(0); setRounds(1); setPages(1);
  };
  const another = () => {
    setShown((s) => new Set([...s, ...result.picks.map((p) => p.key)]));
    setSeed((n) => n + 1);
    if (result.fitting - shown.size - result.picks.length < 3) { setRounds((r) => r + 1); setPages((p) => Math.min(p + 1, 4)); } // running low: look further
  };
  const toggleDetails = (key) => setExpanded((s) => { const n = new Set(s); if (n.has(key)) n.delete(key); else n.add(key); return n; });

  // Opens the trailer on YouTube in a new tab (same approach as the Movies tab). The blank tab is opened
  // synchronously, before any await, so the browser doesn't block it as a pop-up.
  const watchTrailer = async (c) => {
    const id = c.tmdbId;
    const win = window.open('', '_blank');
    if (!win) { setTrailer({ id, busy: false, msg: 'Your browser blocked the new tab. Allow pop-ups for this site and try again.' }); return; }
    try { win.opener = null; } catch (e) { /* best effort */ }
    setTrailer({ id, busy: true, msg: '' });
    try {
      let key = trailerCache.get(id);
      if (key === undefined) { const v = pickTrailer(await movieVideos(id)); key = v ? v.key : null; trailerCache.set(id, key); }
      const url = trailerUrl(key);
      if (url) { win.location = url; if (alive.current) setTrailer({ id, busy: false, msg: '' }); }
      else { win.close(); if (alive.current) setTrailer({ id, busy: false, msg: 'No trailer found on TMDB for this movie.' }); }
    } catch (e) {
      win.close(); if (alive.current) setTrailer({ id, busy: false, msg: 'Could not load the trailer. Check your connection and try again.' });
    }
  };
  const addIt = (c) => { if (!c.details) return; addMovieToWatchlist(c.details); setAdded((s) => new Set(s).add(c.tmdbId)); };

  const waiting = hasKey() && (recs === null || popLoading || want.some((id) => !failed.current.has('d:' + id)));
  const rated = seeds.current.length;
  const M = MOODS.find((m) => m.id === prefs.mood) || MOODS[0];

  return (
    <Sheet open title="Movie night" subtitle="A new movie that fits tonight" onClose={onClose}>
      {!hasKey() ? (
        <p className="sd-tn-empty">Add your TMDB API key in Settings to find movies.</p>
      ) : (
        <>
          <div className="sd-tn-q">
            <span className="sd-tn-l">How much time?</span>
            <div className="sd-nchips" role="group" aria-label="Time you have">
              {MOVIE_TIME_CHOICES.map((m) => (
                <button key={m} type="button" className={'sd-nchip' + (prefs.minutes === m ? ' on' : '')} aria-pressed={prefs.minutes === m} onClick={() => choose({ minutes: m })}>{formatMinutes(m)}</button>
              ))}
            </div>
            <span className="sd-tn-l">What mood?</span>
            <div className="sd-nchips" role="group" aria-label="Mood">
              {MOODS.map((m) => (
                <button key={m.id} type="button" className={'sd-nchip' + (prefs.mood === m.id ? ' on' : '')} aria-pressed={prefs.mood === m.id} onClick={() => choose({ mood: m.id })}>{m.label}</button>
              ))}
            </div>
            <div className="sd-svcbar" style={{ marginTop: 4 }}>
              <ServicesToggle on={prefs.onlyMine} onToggle={() => choose({ onlyMine: !prefs.onlyMine })} label="Only on my services" />
            </div>
          </div>

          <p className="sd-tn-count sd-mono" role="status" data-testid="movie-count">
            {waiting && result.picks.length === 0 ? 'Looking for movies…' : result.fitting === 0 ? 'Nothing fits yet' : `${result.fitting} ${result.fitting === 1 ? 'movie fits' : 'movies fit'}${M.id !== 'any' ? ` · ${result.matching} match your mood` : ''}${waiting ? ' · still looking…' : ''}`}
          </p>
          {error ? <p className="sd-tn-empty" role="alert">{error}</p> : null}

          {result.picks.length === 0 ? (
            !waiting ? <p className="sd-tn-empty" data-testid="movie-empty">{emptyText(prefs.minutes, prefs.mood, prefs.onlyMine)}</p> : null
          ) : (
            <ul className="sd-nlist sd-tn-list">
              {result.picks.map((p) => {
                const isOpen = expanded.has(p.key), dt = detailsText(p), busy = trailer.busy && trailer.id === p.tmdbId;
                return (
                <li key={p.key}>
                  <div className="sd-nitem static sd-tn-card" data-testid="movie-pick">
                    <Art c={p} onClick={() => toggleDetails(p.key)} />
                    <span className="body">
                      <span className="sd-tn-kind sd-mono">{p.popular && !p.because.length ? 'Popular' : 'Recommended'}</span>
                      <span className="name" title={p.name} onClick={() => toggleDetails(p.key)}>{p.name}{p.year ? ` (${p.year})` : ''}</span>
                      {whyLines(p).map((l) => <span key={l} className="meta sd-mono">{l}</span>)}
                      {moodNote(p, prefs.mood) ? <span className={'sd-tn-mood' + (p.moodState === 'match' ? ' ok' : '')}>{moodNote(p, prefs.mood)}</span> : null}
                      {p.taste ? <span className="sd-tn-taste" data-testid="pick-taste">{tasteLine(p.taste)}</span> : null}
                      {p.genres && p.genres.length ? <span className="meta sd-mono">{p.genres.slice(0, 3).join(' · ')}</span> : null}
                      {p.where ? <span className="meta sd-mono sd-svc-meta">{p.where}</span> : null}
                      <button type="button" className="sd-tn-more" data-testid="movie-more" aria-expanded={isOpen} aria-controls={`mn-det-${p.tmdbId}`} onClick={() => toggleDetails(p.key)}>
                        {isOpen ? 'Hide details' : 'Details & trailer'}<span aria-hidden="true">{isOpen ? '▴' : '▾'}</span>
                      </button>
                      {isOpen ? (
                        <span className="sd-tn-det" id={`mn-det-${p.tmdbId}`} data-testid="movie-details">
                          {dt.tagline ? <span className="sd-tn-tag">{dt.tagline}</span> : null}
                          <span className="sd-tn-over">{dt.overview}</span>
                          <button type="button" className="sd-btn sm" data-testid="movie-trailer" disabled={busy} onClick={() => watchTrailer(p)}>{busy ? 'Opening…' : '▶ Watch trailer'}</button>
                          {trailer.id === p.tmdbId && trailer.msg ? <span className="sd-tn-note" role="status">{trailer.msg}</span> : null}
                        </span>
                      ) : null}
                      <span className="sd-tn-acts">
                        <button type="button" className="sd-btn sm primary" disabled={added.has(p.tmdbId)} onClick={() => addIt(p)}>{added.has(p.tmdbId) ? 'On your Watchlist ✓' : '+ Watchlist'}</button>
                        <button type="button" className="sd-btn sm" onClick={() => { setHidden((h) => new Set(h).add(p.key)); setDiscoverHidden({ kind: 'movie', id: p.tmdbId, name: p.name, poster: p.poster, year: parseInt(p.year, 10) || null, g: genreKeysFromNames(p.genres) }, true); }}>Not for me</button>
                      </span>
                    </span>
                  </div>
                </li>
                );
              })}
            </ul>
          )}

          {result.wrapped && result.picks.length > 0 ? <p className="sd-tn-count sd-mono">That’s everything that fits so far: starting over.</p> : null}
          <button type="button" className="sd-btn" style={{ width: '100%', marginTop: 12 }} disabled={result.picks.length === 0} onClick={another}>Show me different ones</button>
          <p className="sd-tn-count sd-mono" style={{ marginTop: 12 }}>{sourceNote({ ratedMovies: rated, mineCount: mine.size })}</p>
        </>
      )}
    </Sheet>
  );
}
