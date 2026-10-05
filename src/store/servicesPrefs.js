import { useSyncExternalStore } from 'react';
import { loadPrefs, savePrefs, sanitizePrefs, toggleService } from '../components/servicesLogic.js';

// "My services" + the two "On my services" switches. Kept on THIS device only (like the
// TMDB key): not part of the library, not synced, not in backups. A tiny external store
// so Settings, the Watchlist and the Shows tab always agree.

const storage = () => { try { return window.localStorage; } catch (e) { return null; } };
let prefs = loadPrefs(storage() || { getItem: () => null });
const listeners = new Set();

export const getServicesPrefs = () => prefs;
export function setServicesPrefs(patch) {
  prefs = sanitizePrefs({ ...prefs, ...patch });
  const st = storage();
  if (st) savePrefs(st, prefs);
  listeners.forEach((f) => f());
}
// Tick / untick one service. Reads the LATEST saved list (not a render's copy), so two quick taps
// before a re-render can't overwrite each other.
export const toggleMyService = (id) => setServicesPrefs({ mine: toggleService(prefs.mine, id) });
const subscribe = (f) => { listeners.add(f); return () => listeners.delete(f); };
export const useServicesPrefs = () => useSyncExternalStore(subscribe, getServicesPrefs);
