// Pure logic for the Shows and Movies library pages (Claude Design, Direction
// A: one filter box, with adding behind a separate "+ Add" button). No React and
// no store imports (db.js touches localStorage when loaded), so it can be unit-
// tested with plain node. The two store helpers it needs are passed in as `h`:
//   h.watchedCount(show)   h.lastWatchDate(show)
//
// Every rule here is the one the page already used (statuses, sort orders, name
// matching) — only the *presentation* changed — and the tests check that against
// a verbatim copy of the old code.

// ------------------------------------------------------------------ shows
export const SHOW_STATUSES = ['All', 'Watching', 'Finished', 'Not started', 'Dropped'];

// id = the value the sorter understands; label = what the sheet shows.
export const SHOW_SORTS = [
  { id: 'Alphabetical', label: 'Title' },
  { id: 'Recently watched', label: 'Recently watched' },
  { id: 'Recently added', label: 'Recently added' },
  { id: 'Progress', label: 'Progress' },
  { id: 'Rating', label: 'Rating' },
];

export const DEFAULT_SHOW_FILTERS = { status: 'All', platform: 'All', query: '' };

// Exactly one of 'Watching' | 'Finished' | 'Not started' | 'Dropped' per show,
// so the counts always add up. A dropped show is only ever 'Dropped' (its
// history is kept; it just stops being "Watching" / "Not started").
export function showStatus(show, h) {
  if (show.dropped === true) return 'Dropped';
  const seen = h.watchedCount(show);
  const total = show.totalEpisodes;
  if (seen === 0) return 'Not started';
  if (total && seen >= total) return 'Finished';
  return 'Watching';
}

// entries: [[id, show], …]. The library is the shows you follow.
export function filterShows(entries, f, h) {
  const q = ((f && f.query) || '').trim().toLowerCase();
  const status = (f && f.status) || 'All';
  const platform = (f && f.platform) || 'All';
  return entries.filter(([, s]) => {
    if (!s.followed) return false;
    if (status !== 'All' && showStatus(s, h) !== status) return false;
    if (platform !== 'All' && s.platform !== platform) return false;
    if (q && !(s.name || '').toLowerCase().includes(q)) return false;
    return true;
  });
}

// Every comparator tie-breaks by name, so it is a total order: reversing it is
// an exact "other direction" (Z→A; oldest first; lowest first).
export function sortShows(list, sortBy, sortDir, h) {
  const out = list.slice();
  const frac = (s) => (s.totalEpisodes ? h.watchedCount(s) / s.totalEpisodes : 0);
  if (sortBy === 'Recently watched') {
    out.sort(
      (a, b) =>
        (h.lastWatchDate(b[1]) || '').localeCompare(h.lastWatchDate(a[1]) || '') ||
        a[1].name.localeCompare(b[1].name)
    );
  } else if (sortBy === 'Recently added') {
    // Newest addedAt first. Imported shows have no addedAt, so they fall to the
    // bottom, ordered alphabetically among themselves.
    out.sort(
      (a, b) =>
        (b[1].addedAt || '').localeCompare(a[1].addedAt || '') || a[1].name.localeCompare(b[1].name)
    );
  } else if (sortBy === 'Progress') {
    out.sort((a, b) => frac(b[1]) - frac(a[1]) || a[1].name.localeCompare(b[1].name));
  } else if (sortBy === 'Rating') {
    out.sort(
      (a, b) => (b[1].rating || 0) - (a[1].rating || 0) || a[1].name.localeCompare(b[1].name)
    );
  } else {
    out.sort((a, b) => a[1].name.localeCompare(b[1].name));
  }
  if (sortDir === 'desc') out.reverse();
  return out;
}

// Status tab counts. They respect the platform + name filters (but not the
// status itself), so with "Stan" chosen the tabs say how many Stan shows are
// Watching / Finished / Not started — and the numbers always add up to All.
export function statusCounts(entries, f, h) {
  const base = filterShows(entries, { ...f, status: 'All' }, h);
  const c = { All: base.length, Watching: 0, Finished: 0, 'Not started': 0, Dropped: 0 };
  for (const [, s] of base) c[showStatus(s, h)]++;
  return c;
}

// Per-platform counts for the Platform picker, respecting the status + name
// filters (but not the platform itself).
export function platformCounts(entries, f, h) {
  const base = filterShows(entries, { ...f, platform: 'All' }, h);
  const byId = {};
  for (const [, s] of base) if (s.platform) byId[s.platform] = (byId[s.platform] || 0) + 1;
  return { total: base.length, byId };
}

// The platforms actually in use by followed shows (so the picker never offers
// one that would show nothing), in the canonical order of `allPlatforms`.
export function platformsInUse(entries, allPlatforms) {
  const present = new Set();
  for (const [, s] of entries) if (s.followed && s.platform) present.add(s.platform);
  return allPlatforms.filter((p) => present.has(p.id));
}

export const isFiltered = (f) =>
  !!f && ((f.status && f.status !== 'All') || (f.platform && f.platform !== 'All') || !!(f.query || '').trim());

// What to show when the grid is empty:
//   'library' – nothing followed at all (a brand-new library)
//   'name'    – you typed a name and that's the only filter
//   'filters' – the combination of filters matches nothing
export function emptyKind(followedCount, f) {
  if (followedCount === 0) return 'library';
  const q = ((f && f.query) || '').trim();
  const onlyName = q && (!f.status || f.status === 'All') && (!f.platform || f.platform === 'All');
  return onlyName ? 'name' : 'filters';
}

// "Platform: Stan", "Status: Not started", "Name: “bleech”" — chips on the
// "nothing matches" screen. platformLabel(id) resolves a platform id to text.
export function describeFilters(f, platformLabel = (x) => x) {
  const out = [];
  if (f.platform && f.platform !== 'All') out.push(`Platform: ${platformLabel(f.platform)}`);
  if (f.status && f.status !== 'All') out.push(`Status: ${f.status}`);
  if ((f.query || '').trim()) out.push(`Name: “${f.query.trim()}”`);
  return out;
}

// "sorted by title, A→Z" — the caption under the toolbar on desktop.
export function sortSummary(sortBy, sortDir) {
  const rev = sortDir === 'desc';
  switch (sortBy) {
    case 'Recently watched': return `sorted by recently watched, ${rev ? 'oldest' : 'newest'} first`;
    case 'Recently added': return `sorted by recently added, ${rev ? 'oldest' : 'newest'} first`;
    case 'Progress': return `sorted by progress, ${rev ? 'least' : 'most'} first`;
    case 'Rating': return `sorted by rating, ${rev ? 'lowest' : 'highest'} first`;
    default: return `sorted by title, ${rev ? 'Z→A' : 'A→Z'}`;
  }
}
export const sortLabel = (id) => (SHOW_SORTS.find((s) => s.id === id) || SHOW_SORTS[0]).label;

// "27 / 49 eps" / "3 eps seen" / "not started" — the line under a show poster.
export function showMeta(seen, total) {
  if (total) return `${seen} / ${total} eps`;
  return seen ? `${seen} eps seen` : 'not started';
}

// ------------------------------------------------------------------ movies
export const MOVIE_SORTS = [
  { id: 'recent', label: 'Recent' },
  { id: 'title', label: 'A–Z' },
  { id: 'rating', label: 'Rating' },
];

// `movies` is the watched list, already newest-watch-first (the page builds it).
export function shownMovies(movies, query, sortBy) {
  const q = (query || '').trim().toLowerCase();
  const list = q ? movies.filter((m) => (m.name || '').toLowerCase().includes(q)) : movies.slice();
  if (sortBy === 'title') list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  else if (sortBy === 'rating')
    list.sort(
      (a, b) => (b.rating || 0) - (a.rating || 0) || (b.watchedAt || '').localeCompare(a.watchedAt || '')
    );
  return list;
}
export function movieSortSummary(sortBy) {
  if (sortBy === 'title') return 'title, A→Z';
  if (sortBy === 'rating') return 'highest rated first';
  return 'most recently watched first';
}

// ------------------------------------------------------------------ add dialog
// How a TMDB search result relates to your data, so the dialog can offer the
// right buttons: 'followed' → Open; 'watchlisted' → Add + Open; 'new' → Add +
// Add to watchlist.
export function showResultState(r, followedTmdbIds, watchlistTmdbIds) {
  if (followedTmdbIds.has(r.id)) return 'followed';
  if (watchlistTmdbIds.has(r.id)) return 'watchlisted';
  return 'new';
}
// watchedByTmdb: Map tmdbId -> { count, last }; plannedTmdbIds: Set.
export function movieResultState(r, watchedByTmdb, plannedTmdbIds) {
  const seen = watchedByTmdb.get(r.id);
  if (seen) return { kind: 'watched', count: seen.count, last: seen.last };
  if (plannedTmdbIds.has(r.id)) return { kind: 'planned' };
  return { kind: 'new' };
}
export function resultsLabel(n) {
  if (n === 0) return 'No results';
  return `${n} result${n === 1 ? '' : 's'} from TMDB`;
}

// ------------------------------------------------------------------ placeholders
// A poster-less title gets a gradient (picked from its name, so it's stable) and
// its initial, as in the design.
const TINTS = [
  ['#2f3a5b', '#161a2c'], ['#2f4a5b', '#16222c'], ['#1f4a4a', '#13262e'], ['#4a5b2f', '#1f2616'],
  ['#5b4a2f', '#2a2218'], ['#5b2f52', '#26172a'], ['#3a2f5b', '#1c2540'], ['#5b2f2f', '#261616'],
];
export function posterTint(name) {
  let h = 0;
  for (const ch of String(name || '')) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  return TINTS[h % TINTS.length];
}
export function initialOf(name) {
  const m = /[\p{L}\p{N}]/u.exec(String(name || ''));
  return m ? m[0].toUpperCase() : '·';
}
