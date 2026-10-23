import { useSyncExternalStore } from 'react';

// Spoiler shield: when it's on, episodes you haven't watched show as "Episode 6" instead of
// their title, and their summary stays hidden until you choose "Show anyway".
// The switch is kept on THIS device only (like Region and My services).

export const SHIELD_KEY = 'watchnext-spoilers-v1';

const storage = () => { try { return window.localStorage; } catch (e) { return null; } };
const read = () => { try { const s = storage(); return !!s && s.getItem(SHIELD_KEY) === 'on'; } catch (e) { return false; } };

let on = read();
const listeners = new Set();
const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
const snapshot = () => on;

export function setSpoilerShield(v) {
  on = !!v;
  try { const s = storage(); if (s) { if (on) s.setItem(SHIELD_KEY, 'on'); else s.removeItem(SHIELD_KEY); } } catch (e) { /* blocked: works until reload */ }
  listeners.forEach((fn) => fn());
}
export const useSpoilerShield = () => useSyncExternalStore(subscribe, snapshot, () => false);

// ------------------------------------------------------------------ pure helpers
// Is this episode hidden? show: the show record (or null when unknown), s/e: numbers.
export function isShielded(shieldOn, show, s, e) {
  if (!shieldOn) return false;
  const w = show && show.watched && show.watched[`${s}x${e}`];
  return !w;
}
// The title to show for an episode.
export const epTitle = (name, e, hidden) => (hidden || !name ? `Episode ${e}` : name);
