import { useSyncExternalStore } from 'react';
import { loadCache, saveCache, recordOrigin } from '../components/originsLogic.js';

// Each watched title's countries and original language (see components/originsLogic.js).
// Kept on THIS device only, like the collections cache: not synced, not in backups.

const storage = () => { try { return window.localStorage; } catch (e) { return null; } };
let cache = loadCache(storage());
const listeners = new Set();

export const getOriginsCache = () => cache;

// fn(cache) -> new cache, always applied to the LATEST cache.
export function updateOriginsCache(fn) {
  const next = fn(cache);
  if (next === cache) return;
  cache = next;
  saveCache(storage(), cache);
  listeners.forEach((f) => f());
}

// Any TMDB /movie or /tv response the app already fetched (a movie sheet, the collections
// lookup) also tells us where the title is from — remember it for free.
export const rememberOrigin = (kind, details) => updateOriginsCache((c) => recordOrigin(c, kind, details));

const subscribe = (f) => { listeners.add(f); return () => listeners.delete(f); };
export const useOriginsCache = () => useSyncExternalStore(subscribe, getOriginsCache);
