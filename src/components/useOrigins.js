import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { movieDetails, showDetails, hasKey } from '../api/tmdb.js';
import { useOriginsCache, getOriginsCache, rememberOrigin } from '../store/originsCache.js';
import { watchedTitles, titlesToCheck } from './originsLogic.js';

const POOL = 4; // lookups at a time; tmdb.js already backs off if TMDB says "slow down"

// Where everything you watched comes from. While `active` (the World or Badges tab is open)
// it asks TMDB, a few at a time, for each title not looked up yet. Answers are cached on this
// device, so the first visit is the slow one; later visits only check new titles.
//
// returns { titles, cache, checking, done, total, failed, noKey, retry }
export default function useOrigins(state, active) {
  const cache = useOriginsCache();
  const titles = useMemo(() => watchedTitles(state), [state.shows, state.movies]); // eslint-disable-line react-hooks/exhaustive-deps
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
    const jobs = titlesToCheck(titles, getOriginsCache()).filter((t) => !failed.current.has(t.key));
    if (!jobs.length) return;
    running.current = true;
    let done = 0;
    let next = 0;
    setProgress({ done: 0, total: jobs.length });
    const worker = async () => {
      while (alive.current && activeRef.current && next < jobs.length) {
        const t = jobs[next++];
        try {
          const d = await (t.kind === 'tv' ? showDetails(t.tmdbId) : movieDetails(t.tmdbId));
          rememberOrigin(t.kind, d);
          if (!getOriginsCache().items[t.key]) failed.current.add(t.key); // odd answer: don't ask again in a loop
        } catch (e) {
          failed.current.add(t.key); // offline / TMDB error: skipped until Retry
        }
        done++;
        if (alive.current && (done % 5 === 0 || done === jobs.length)) setProgress({ done, total: jobs.length });
      }
    };
    Promise.all(Array.from({ length: Math.min(POOL, jobs.length) }, worker)).finally(() => {
      running.current = false;
      if (!alive.current) return;
      setFailedCount(failed.current.size);
      setProgress({ done: 0, total: 0 });
      if (activeRef.current) setTick((n) => n + 1); // pick up titles added meanwhile
    });
  }, [active, tick, titles]);

  const retry = useCallback(() => { failed.current.clear(); setFailedCount(0); setTick((n) => n + 1); }, []);
  return {
    titles,
    cache,
    checking: progress.total > 0,
    done: progress.done,
    total: progress.total,
    failed: failedCount,
    noKey: !hasKey(),
    retry,
  };
}
