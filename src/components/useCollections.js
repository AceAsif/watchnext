import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { movieDetails, movieCollection, hasKey } from '../api/tmdb.js';
import { useCollectionsCache, updateCollectionsCache, getCollectionsCache } from '../store/collectionsCache.js';
import {
  moviesToCheck,
  collectionsToFetch,
  buildCollections,
  recordMovie,
  recordCollection,
  unlinkedCount,
} from './collectionsLogic.js';

const POOL = 4; // lookups at a time; tmdb.js already backs off if TMDB says "slow down"

const todayLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// Works out your movie collections. While `active` (the Collections view is open) it asks
// TMDB, a few at a time, which collection each watched film is in, then fetches each
// collection's film list. Answers are cached on this device, so this only happens once;
// later visits just check films added since.
//
// returns { collections, checking, done, total, failed, noKey, unlinked, retry }
export default function useCollections(movies, active) {
  const cache = useCollectionsCache();
  const failed = useRef(new Set());
  const running = useRef(false);
  const alive = useRef(true);
  const activeRef = useRef(active);
  activeRef.current = active;
  const [tick, setTick] = useState(0);
  const [failedCount, setFailedCount] = useState(0);
  const [progress, setProgress] = useState({ done: 0, total: 0 });

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  useEffect(() => {
    if (!active || !hasKey() || running.current) return;
    const now = new Date();
    const c = getCollectionsCache();
    const jobs = [
      ...moviesToCheck(movies, c, now)
        .filter((id) => !failed.current.has('m' + id))
        .map((id) => ({ key: 'm' + id, run: async () => { const d = await movieDetails(id); updateCollectionsCache((x) => recordMovie(x, d)); } })),
      ...collectionsToFetch(movies, c, now)
        .filter((id) => !failed.current.has('c' + id))
        .map((id) => ({ key: 'c' + id, run: async () => { const d = await movieCollection(id); updateCollectionsCache((x) => recordCollection(x, d)); } })),
    ];
    if (!jobs.length) return;
    running.current = true;
    let done = 0;
    setProgress({ done: 0, total: jobs.length });
    let next = 0;
    const worker = async () => {
      while (alive.current && activeRef.current && next < jobs.length) {
        const job = jobs[next++];
        try {
          await job.run();
        } catch (e) {
          failed.current.add(job.key); // offline / TMDB error: skipped until Retry
        }
        done++;
        if (alive.current) setProgress({ done, total: jobs.length });
      }
    };
    Promise.all(Array.from({ length: Math.min(POOL, jobs.length) }, worker)).finally(() => {
      running.current = false;
      if (!alive.current) return;
      setFailedCount(failed.current.size);
      setProgress({ done: 0, total: 0 });
      setTick((n) => n + 1); // films just checked may point at collections still to fetch
    });
  }, [active, tick, movies]); // eslint-disable-line react-hooks/exhaustive-deps

  const retry = useCallback(() => { failed.current.clear(); setFailedCount(0); setTick((n) => n + 1); }, []);
  const collections = useMemo(() => buildCollections(movies, cache, todayLocal()), [movies, cache]);
  return {
    collections,
    checking: progress.total > 0,
    done: progress.done,
    total: progress.total,
    failed: failedCount,
    noKey: !hasKey(),
    unlinked: useMemo(() => unlinkedCount(movies), [movies]),
    retry,
  };
}

// For one open movie sheet: given its TMDB details, remember its collection and fetch that
// collection's film list if we don't have it yet. Uses the same cache as the list.
export function useCollectionForDetails(details) {
  const cache = useCollectionsCache();
  const asked = useRef(new Set());
  const cid = details && !details.error && details.belongs_to_collection ? details.belongs_to_collection.id : null;
  useEffect(() => {
    if (!details || details.error || !details.id) return;
    updateCollectionsCache((x) => {
      const known = x.byMovie[details.id];
      const c = (details.belongs_to_collection && details.belongs_to_collection.id) || 0;
      return known && known.c === c ? x : recordMovie(x, details);
    });
    if (!cid || cache.colls[cid] || asked.current.has(cid) || !hasKey()) return;
    asked.current.add(cid);
    movieCollection(cid)
      .then((d) => updateCollectionsCache((x) => recordCollection(x, d)))
      .catch(() => { asked.current.delete(cid); });
  }, [details, cid]); // eslint-disable-line react-hooks/exhaustive-deps
  return cid;
}

export { todayLocal };
