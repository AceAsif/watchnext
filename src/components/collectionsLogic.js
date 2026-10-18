// Movie collections ("Harry Potter: 3 of 8 watched", plus the next film in order).
// Pure functions: no DOM, no store, no network, so they unit-test in plain Node.
//
// TMDB knows which collection a film belongs to (movie details → belongs_to_collection) and
// lists every film in a collection (/collection/{id} → parts). We keep what we learn in a
// small cache on THIS device only (localStorage key watchnext-collections-v1). It is not part
// of the library, not synced and not in backups: it can always be rebuilt from TMDB.
//
// cache = {
//   v: 1,
//   byMovie: { [tmdbId]: { c: collectionId | 0, at: ISO } },  // 0 = checked, not in a collection
//   colls:   { [collectionId]: { name, poster, parts: [{ id, title, date, poster }], at: ISO } },
// }

export const CACHE_KEY = 'watchnext-collections-v1';
export const MOVIE_RECHECK_DAYS = 90; // "not in a collection" is re-asked after this long
export const COLL_RECHECK_DAYS = 30; // a collection's film list is refreshed after this long (new sequels)
export const COLLECTIONS_PREVIEW = 6; // how many collections the list shows before "Show all"

const DAY = 24 * 60 * 60 * 1000;

export const emptyCache = () => ({ v: 1, byMovie: {}, colls: {} });

const isObj = (x) => x && typeof x === 'object' && !Array.isArray(x);
const posInt = (x) => (Number.isInteger(x) && x > 0 ? x : null);
const str = (x) => (typeof x === 'string' ? x : '');

function cleanPart(p) {
  if (!isObj(p) || !posInt(p.id)) return null;
  return { id: p.id, title: str(p.title) || 'Untitled', date: /^\d{4}-\d{2}-\d{2}$/.test(str(p.date)) ? p.date : '', poster: str(p.poster) || null };
}

// Anything odd in storage (hand edits, an older shape) is dropped rather than trusted.
export function sanitizeCache(raw) {
  const out = emptyCache();
  if (!isObj(raw)) return out;
  if (isObj(raw.byMovie)) {
    for (const [k, v] of Object.entries(raw.byMovie)) {
      const id = Number(k);
      if (!posInt(id) || !isObj(v) || !str(v.at)) continue;
      out.byMovie[id] = { c: posInt(v.c) || 0, at: v.at };
    }
  }
  if (isObj(raw.colls)) {
    for (const [k, v] of Object.entries(raw.colls)) {
      const id = Number(k);
      if (!posInt(id) || !isObj(v) || !Array.isArray(v.parts) || !str(v.at)) continue;
      out.colls[id] = { name: str(v.name) || 'Collection', poster: str(v.poster) || null, parts: v.parts.map(cleanPart).filter(Boolean), at: v.at };
    }
  }
  return out;
}

export function loadCache(storage) {
  try {
    const raw = storage && storage.getItem(CACHE_KEY);
    return raw ? sanitizeCache(JSON.parse(raw)) : emptyCache();
  } catch (e) {
    return emptyCache();
  }
}
export function saveCache(storage, cache) {
  try { if (storage) storage.setItem(CACHE_KEY, JSON.stringify(cache)); } catch (e) { /* storage full or blocked: the cache just isn't kept */ }
}

// Save what a /movie/{id} response says about its collection. Returns a NEW cache.
export function recordMovie(cache, details, now = new Date()) {
  if (!details || !posInt(details.id)) return cache;
  const b = details.belongs_to_collection;
  const c = (b && posInt(b.id)) || 0;
  return { ...cache, byMovie: { ...cache.byMovie, [details.id]: { c, at: now.toISOString() } } };
}

// Save a /collection/{id} response. Returns a NEW cache.
export function recordCollection(cache, data, now = new Date()) {
  if (!data || !posInt(data.id)) return cache;
  const parts = (Array.isArray(data.parts) ? data.parts : [])
    .map((p) => cleanPart({ id: p && p.id, title: p && p.title, date: p && p.release_date, poster: p && p.poster_path }))
    .filter(Boolean);
  return {
    ...cache,
    colls: { ...cache.colls, [data.id]: { name: str(data.name) || 'Collection', poster: str(data.poster_path) || null, parts, at: now.toISOString() } },
  };
}

const older = (iso, days, now) => { const t = Date.parse(iso); return !Number.isFinite(t) || now.getTime() - t > days * DAY; };
const isWatched = (m) => m && (m.status === 'watched' || !m.status); // legacy entries have no status

// Watched films (by TMDB id) we have not asked TMDB about yet, or whose "not in a collection"
// answer is old. A film known to be IN a collection is never re-asked: that does not change.
export function moviesToCheck(movies, cache, now = new Date()) {
  const seen = new Set();
  const out = [];
  for (const m of movies || []) {
    const id = posInt(m && m.tmdbId);
    if (!id || !isWatched(m) || seen.has(id)) continue;
    seen.add(id);
    const known = cache.byMovie[id];
    if (!known || (known.c === 0 && older(known.at, MOVIE_RECHECK_DAYS, now))) out.push(id);
  }
  return out;
}

// Collections one of your watched films belongs to whose film list we don't have yet (or is old).
export function collectionsToFetch(movies, cache, now = new Date()) {
  const want = new Set();
  for (const m of movies || []) {
    const id = posInt(m && m.tmdbId);
    if (!id || !isWatched(m)) continue;
    const known = cache.byMovie[id];
    if (known && known.c) want.add(known.c);
  }
  return [...want].filter((c) => !cache.colls[c] || older(cache.colls[c].at, COLL_RECHECK_DAYS, now)).sort((a, b) => a - b);
}

// Watched films with no TMDB id can't be placed in a collection (Fix match links them).
export const unlinkedCount = (movies) => (movies || []).filter((m) => isWatched(m) && !posInt(m.tmdbId)).length;

// Films in release order; films with no date yet go last, in TMDB's order.
export function partsInOrder(parts) {
  return (parts || [])
    .map((p, i) => ({ p, i }))
    .sort((a, b) => {
      if (a.p.date && b.p.date) return a.p.date.localeCompare(b.p.date) || a.i - b.i;
      if (a.p.date) return -1;
      if (b.p.date) return 1;
      return a.i - b.i;
    })
    .map((x) => x.p);
}

// Every collection you have watched at least one film of, ready to show.
//   today: 'YYYY-MM-DD' (films dated after it, or undated, are "coming" and don't count in the total)
// → [{ id, name, poster, parts: [{ id, title, year, date, poster, state }], released, watched,
//      next, upcoming, complete, lastWatched }]
//   state: 'watched' | 'planned' (on your watchlist) | 'todo' | 'upcoming'
export function buildCollections(movies, cache, today) {
  const watched = new Map(); // tmdbId -> latest watch ISO
  const planned = new Set();
  for (const m of movies || []) {
    const id = posInt(m && m.tmdbId);
    if (!id) continue;
    if (isWatched(m)) {
      const prev = watched.get(id) || '';
      const at = str(m.watchedAt);
      watched.set(id, at > prev ? at : prev);
    } else if (m.status === 'planned') planned.add(id);
  }
  const ids = new Set();
  for (const id of watched.keys()) {
    const known = cache.byMovie[id];
    if (known && known.c && cache.colls[known.c]) ids.add(known.c);
  }
  const out = [];
  for (const cid of ids) {
    const c = cache.colls[cid];
    const parts = partsInOrder(c.parts).map((p) => {
      const coming = !p.date || p.date > today;
      const state = watched.has(p.id) ? 'watched' : coming ? 'upcoming' : planned.has(p.id) ? 'planned' : 'todo';
      return { ...p, year: p.date ? p.date.slice(0, 4) : '', state };
    });
    const released = parts.filter((p) => p.state !== 'upcoming');
    if (released.length < 2) continue; // a "collection" of one released film is not worth a row
    const seen = released.filter((p) => p.state === 'watched').length;
    if (!seen) continue;
    const lastWatched = parts.reduce((best, p) => { const at = watched.get(p.id) || ''; return at > best ? at : best; }, '');
    out.push({
      id: cid,
      name: c.name,
      poster: c.poster,
      parts,
      released: released.length,
      watched: seen,
      next: released.find((p) => p.state !== 'watched') || null,
      upcoming: parts.find((p) => p.state === 'upcoming') || null,
      complete: seen === released.length,
      lastWatched,
    });
  }
  // Unfinished first (most recently watched on top), then finished ones, A to Z.
  return out.sort((a, b) => {
    if (a.complete !== b.complete) return a.complete ? 1 : -1;
    if (!a.complete) return b.lastWatched.localeCompare(a.lastWatched) || a.name.localeCompare(b.name);
    return a.name.localeCompare(b.name);
  });
}

// The one collection a film belongs to, if we know it and you've watched any of it.
export function collectionOfMovie(collections, tmdbId) {
  return (collections || []).find((c) => c.parts.some((p) => p.id === tmdbId)) || null;
}

export const progressLabel = (c) => `${c.watched} of ${c.released} watched`;

// "Next: Prisoner of Azkaban (2004)"; when everything out is watched, the next one coming.
export function nextLabel(c, fmtDate = (d) => d) {
  if (c.next) return `Next: ${c.next.title}${c.next.year ? ` (${c.next.year})` : ''}`;
  if (c.upcoming) return c.upcoming.date ? `All watched · next out ${fmtDate(c.upcoming.date)}` : `All watched · ${c.upcoming.title} is coming`;
  return 'All watched';
}

// Short summary for the top of the list, e.g. "4 collections · 2 finished".
export function listSummary(collections) {
  const n = collections.length;
  const done = collections.filter((c) => c.complete).length;
  return `${n} collection${n === 1 ? '' : 's'}${done ? ` · ${done} finished` : ''}`;
}
