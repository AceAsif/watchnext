import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { scoreDetails, hasKey } from '../api/tmdb.js';
import { omdbById, hasOmdb } from '../api/omdb.js';
import { scoreKey, parseOmdb, fromTmdb, isFresh, loadCache, saveCache } from './scoresLogic.js';

// The saved scores, shared by every screen, and a small queue that looks titles up
// (2 at a time, each title once even if several screens ask).
const storage = () => { try { return window.localStorage; } catch (e) { return null; } };
let cache = storage() ? loadCache(storage()) : {};
const listeners = new Set();
const inflight = new Map();
const queue = [];
let running = 0;
const POOL = 2;

const emit = () => { cache = { ...cache }; listeners.forEach((fn) => fn()); };
const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
const snapshot = () => cache;

async function lookUp(kind, tmdbId, known) {
  const t = known && known.imdbId !== undefined ? known : fromTmdb(await scoreDetails(kind, tmdbId));
  const base = { at: new Date().toISOString(), imdbId: t.imdbId, tmdb: t.tmdb, tmdbVotes: t.tmdbVotes, released: t.released };
  if (!t.imdbId) return { ...base, none: true };
  const o = parseOmdb(await omdbById(t.imdbId));
  return o ? { ...base, ...o } : { ...base, none: true };
}

function pump() {
  while (running < POOL && queue.length) {
    const job = queue.shift();
    running++;
    lookUp(job.kind, job.tmdbId, job.known)
      .then((e) => { cache = { ...cache, [job.key]: e }; if (storage()) saveCache(storage(), cache); emit(); })
      .catch(() => { /* offline, or the daily limit: try again another time */ })
      .finally(() => { running--; inflight.delete(job.key); pump(); });
  }
}

// Ask for one title's scores (no-op when fresh, already queued, or keys are missing).
// known: TMDB details you already have ({ imdbId, tmdb, tmdbVotes, released } via fromTmdb), saves a request.
export function requestScores(kind, tmdbId, known = null) {
  if (!tmdbId || !hasOmdb() || !hasKey()) return;
  const key = scoreKey(kind, tmdbId);
  if (isFresh(cache[key]) || inflight.has(key)) return;
  inflight.set(key, true);
  queue.push({ key, kind, tmdbId, known });
  pump();
}

export const scoresOn = () => hasOmdb();

// One title's scores (null while unknown). Looks it up when needed.
export default function useScores(kind, tmdbId, known = null) {
  const all = useSyncExternalStore(subscribe, snapshot);
  const key = tmdbId ? scoreKey(kind, tmdbId) : null;
  useEffect(() => { if (key) requestScores(kind, tmdbId, known); }, [key, known && known.imdbId]); // eslint-disable-line react-hooks/exhaustive-deps
  return key ? all[key] || null : null;
}

// Scores for many titles at once: items [{ kind, tmdbId }]. Looks them up only when `fetch` is true
// (e.g. while sorting by "Highest rated"); otherwise just returns what's saved.
export function useScoresMany(items, fetch) {
  const all = useSyncExternalStore(subscribe, snapshot);
  const sig = items.map((i) => `${i.kind}:${i.tmdbId}`).join(',');
  useEffect(() => { if (fetch) items.forEach((i) => requestScores(i.kind, i.tmdbId)); }, [sig, fetch]); // eslint-disable-line react-hooks/exhaustive-deps
  return useMemo(() => all, [all]);
}
