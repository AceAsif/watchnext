import { useCallback, useEffect, useRef, useState } from 'react';
import { watchProviders, hasKey } from '../api/tmdb.js';
import { setShowProviders, setMovieProviders } from '../store/db.js';
import { normalizeProviders, pending, nextBatch, needsCheck, GAP_MS } from './servicesLogic.js';

// Checks streaming availability in the background for the titles a list is showing, a
// few at a time, saving each result on the show / planned movie (so it is remembered for
// two weeks and the list updates as answers arrive).
//
// items: [{ key, kind: 'tv' | 'movie', id (show id, for tv), tmdbId, rec }]
// returns { remaining, failed, noKey, noId, retry }
export default function useAvailability(items, active) {
  const failed = useRef(new Set());
  const inflight = useRef(new Set());
  const timers = useRef(new Set());
  const alive = useRef(true);
  const [tick, setTick] = useState(0); // bumped when a lookup finishes or Retry is pressed, so the next ones start
  const [failedCount, setFailedCount] = useState(0);

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; timers.current.forEach(clearTimeout); timers.current.clear(); };
  }, []);

  useEffect(() => {
    if (!active || !hasKey()) return;
    const batch = nextBatch(items, { failed: failed.current, inflight: inflight.current });
    batch.forEach((item, i) => {
      inflight.current.add(item.key); // reserve the slot now so a re-render can't start the same lookup twice
      const t = setTimeout(async () => {
        timers.current.delete(t);
        try {
          const au = await watchProviders(item.kind, item.tmdbId);
          const { providers, free, link } = normalizeProviders(au); // no AU block at all = "streams nowhere", still a valid answer
          if (item.kind === 'movie') setMovieProviders(item.tmdbId, providers, link, free);
          else setShowProviders(item.id, providers, link, free);
        } catch (e) {
          failed.current.add(item.key); // offline / TMDB error: leave it unchecked, try again on Retry or next visit
          if (alive.current) setFailedCount(failed.current.size);
        } finally {
          inflight.current.delete(item.key);
          if (alive.current) setTick((n) => n + 1);
        }
      }, i * GAP_MS);
      timers.current.add(t);
    });
  }, [items, active, tick]); // eslint-disable-line react-hooks/exhaustive-deps

  const retry = useCallback(() => { failed.current.clear(); setFailedCount(0); setTick((n) => n + 1); }, []);
  const now = new Date();
  return {
    remaining: active ? pending(items, failed.current, now).length : 0,
    failed: failedCount,
    noKey: !hasKey(),
    noId: active ? items.filter((i) => !i.tmdbId && needsCheck(i.rec, now)).length : 0,
    retry,
  };
}
