import { useMemo } from 'react';
import { localProfile } from './discoverEngine.js';
import { loadCache, timeContext } from './tasteLogic.js';

// Your taste profile from what this device already knows (Discover's learned keywords and people,
// plus the genres on your library records), for Tonight, Movie night and the Stats card. No network.
// -> { prof, cache, ctx }
export default function useTaste(state) {
  const cache = useMemo(() => { try { return loadCache(window.localStorage); } catch (e) { return { items: {} }; } }, []);
  const prof = useMemo(() => localProfile(state, state.hidden, cache), [state.shows, state.movies, state.hidden, cache]); // eslint-disable-line react-hooks/exhaustive-deps
  const ctx = useMemo(() => timeContext(new Date()), []);
  return { prof, cache, ctx };
}
