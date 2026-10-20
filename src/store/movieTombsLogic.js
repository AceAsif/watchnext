// "Removed movies stay removed". PURE: no DOM, no store.
//
// Signing in pulls the cloud copy of your movies and adds back every viewing this device
// doesn't have. So a viewing you removed (or moved to another date) came back whenever the
// cloud still held the old copy: the push hadn't landed yet, or another device still had it.
//
// A viewing is identified by "name|watchedAt" (the same key the pull always used). When a
// key disappears from the movie list (removed, or its date changed) it is written down as a
// "tomb". Tombs are kept on this device AND saved with the cloud movies, so the pull skips
// them and other devices drop the viewing too. Adding the same viewing back on purpose
// (logging it again, importing, restoring a backup) lifts its tomb.

export const MAX_TOMBS = 1000; // newest kept; keeps the cloud document small

export const movieKeyOf = (m) => `${m && m.name}|${m && m.watchedAt}`;

// Anything -> a clean array of unique non-empty strings, newest last, at most MAX_TOMBS.
export function cleanTombs(raw) {
  const seen = new Set();
  const out = [];
  for (const k of Array.isArray(raw) ? raw : []) {
    if (typeof k !== 'string' || !k || seen.has(k)) continue;
    seen.add(k);
    out.push(k);
  }
  return out.length > MAX_TOMBS ? out.slice(out.length - MAX_TOMBS) : out;
}

// Keys that were in `before` but are not in `after`: the viewings that were removed or
// moved to another date by this change.
export function lostKeys(before, after) {
  const now = new Set((after || []).map(movieKeyOf));
  const gone = [];
  const seen = new Set();
  for (const m of before || []) {
    const k = movieKeyOf(m);
    if (!now.has(k) && !seen.has(k)) { seen.add(k); gone.push(k); }
  }
  return gone;
}

// The tomb list after adding `keys`.
export function addTombs(tombs, keys) {
  const have = new Set(tombs || []);
  return cleanTombs([...(tombs || []), ...(keys || []).filter((k) => !have.has(k))]);
}

// The tomb list without the keys of viewings that exist right now (a deliberate re-add).
export function liftPresent(tombs, movies) {
  if (!tombs || !tombs.length) return tombs || [];
  const present = new Set((movies || []).map(movieKeyOf));
  return tombs.filter((k) => !present.has(k));
}

// Sign-in merge of the movie lists.
//   local / remote:           arrays of movie entries
//   localTombs / remoteTombs: tomb arrays
// -> { movies, tombs, dropped }
//   - a viewing is dropped if EITHER side has a tomb for it (that is the point)
//   - the rest of this device's list is kept in order, then cloud viewings it doesn't have
//   - tombs from both sides are kept (so both sides learn them)
export function mergeRemoteMovies(local, remote, localTombs, remoteTombs) {
  const tombs = cleanTombs([...(remoteTombs || []), ...(localTombs || [])]);
  const dead = new Set(tombs);
  const movies = [];
  const seen = new Set();
  let dropped = 0;
  for (const m of local || []) {
    const k = movieKeyOf(m);
    if (dead.has(k)) { dropped++; continue; }
    movies.push(m);
    seen.add(k);
  }
  for (const m of remote || []) {
    if (!m || typeof m !== 'object') continue;
    const k = movieKeyOf(m);
    if (dead.has(k) || seen.has(k)) continue;
    movies.push(m);
    seen.add(k);
  }
  return { movies, tombs, dropped };
}
