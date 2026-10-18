import { useSyncExternalStore } from 'react';
import { loadCache, saveCache } from '../components/collectionsLogic.js';

// Which collection each movie belongs to, and each collection's films. Kept on THIS device
// only (like "My services"): not part of the library, not synced, not in backups — it is
// rebuilt from TMDB whenever it is missing. A tiny external store so the Movies page and
// the movie sheet always agree.

const storage = () => { try { return window.localStorage; } catch (e) { return null; } };
let cache = loadCache(storage());
const listeners = new Set();

export const getCollectionsCache = () => cache;

// fn(cache) -> new cache. Always applied to the LATEST cache, so lookups that finish at the
// same time can't overwrite each other.
export function updateCollectionsCache(fn) {
  const next = fn(cache);
  if (next === cache) return;
  cache = next;
  saveCache(storage(), cache);
  listeners.forEach((f) => f());
}

const subscribe = (f) => { listeners.add(f); return () => listeners.delete(f); };
export const useCollectionsCache = () => useSyncExternalStore(subscribe, getCollectionsCache);
