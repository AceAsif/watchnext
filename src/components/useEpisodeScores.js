import { useEffect, useSyncExternalStore } from 'react';
import { omdbSeason, hasOmdb } from '../api/omdb.js';
import { seasonKey, validImdbId, parseSeason, isFresh, loadCache, saveCache } from './epScoresLogic.js';

// Episode IMDb scores for one season of a show, looked up when the season is OPENED on the show
// page (one OMDb call per season) and saved on this device. See epScoresLogic.js for the rules.
const storage = () => { try { return window.localStorage; } catch (e) { return null; } };
let cache = storage() ? loadCache(storage()) : {};
const listeners = new Set();
const inflight = new Set();
const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
const snapshot = () => cache;
const emit = () => { cache = { ...cache }; listeners.forEach((fn) => fn()); };

function request(imdbId, season) {
  const key = seasonKey(imdbId, season);
  if (isFresh(cache[key]) || inflight.has(key)) return;
  inflight.add(key);
  omdbSeason(imdbId, season)
    .then((j) => {
      const p = parseSeason(j);
      cache = { ...cache, [key]: p ? { at: new Date().toISOString(), ...p } : { at: new Date().toISOString(), none: true } };
      if (storage()) saveCache(storage(), cache);
      emit();
    })
    .catch(() => { /* offline or the daily limit: the season just shows no scores, try again later */ })
    .finally(() => inflight.delete(key));
}

/** { 1: 8.7, 2: 9.1 } for that season (empty while unknown). `enabled` = the season is open. */
export default function useEpisodeScores(imdbId, season, enabled) {
  const all = useSyncExternalStore(subscribe, snapshot);
  const ok = hasOmdb() && validImdbId(imdbId) && Number(season) > 0;
  useEffect(() => { if (ok && enabled) request(imdbId, season); }, [ok, enabled, imdbId, season]);
  const e = ok ? all[seasonKey(imdbId, season)] : null;
  return (e && e.eps) || {};
}
