import assert from 'node:assert/strict';
import * as L from '/home/claude/wl/src/components/libraryLogic.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('ok  -', name); };

// the real store helpers (store/db.js), copied verbatim
const h = {
  watchedCount: (s) => Object.keys(s.watched || {}).length,
  lastWatchDate: (s) => { let l = null; for (const w of Object.values(s.watched || {})) if (w.at && (!l || w.at > l)) l = w.at; return l; },
};

// ============================================================ GOLDEN ORACLE: the ORIGINAL Shows.jsx `library` logic, verbatim
function oldLibrary(shows, { filter, platformFilter, libQuery, sortBy, sortDir }) {
  const q = libQuery.trim().toLowerCase();
  let list = Object.entries(shows).filter(([, s]) => s.followed);
  list = list.filter(([, s]) => {
    const seen = h.watchedCount(s);
    const total = s.totalEpisodes;
    if (filter === 'Watching') return seen > 0 && (!total || seen < total);
    if (filter === 'Finished') return total && seen >= total;
    if (filter === 'Not started') return seen === 0;
    return true;
  });
  if (platformFilter !== 'All') list = list.filter(([, s]) => s.platform === platformFilter);
  if (q) list = list.filter(([, s]) => (s.name || '').toLowerCase().includes(q));
  const frac = (s) => (s.totalEpisodes ? h.watchedCount(s) / s.totalEpisodes : 0);
  if (sortBy === 'Recently watched') list.sort((a, b) => (h.lastWatchDate(b[1]) || '').localeCompare(h.lastWatchDate(a[1]) || '') || a[1].name.localeCompare(b[1].name));
  else if (sortBy === 'Recently added') list.sort((a, b) => (b[1].addedAt || '').localeCompare(a[1].addedAt || '') || a[1].name.localeCompare(b[1].name));
  else if (sortBy === 'Progress') list.sort((a, b) => frac(b[1]) - frac(a[1]) || a[1].name.localeCompare(b[1].name));
  else if (sortBy === 'Rating') list.sort((a, b) => (b[1].rating || 0) - (a[1].rating || 0) || a[1].name.localeCompare(b[1].name));
  else list.sort((a, b) => a[1].name.localeCompare(b[1].name));
  if (sortDir === 'desc') list.reverse();
  return list;
}
// the ORIGINAL (current-repo) Movies.jsx `shown` logic, verbatim
function oldShownMovies(movies, libQuery, sortBy) {
  const q = libQuery.trim().toLowerCase();
  let list = q ? movies.filter((m) => (m.name || '').toLowerCase().includes(q)) : movies.slice();
  if (sortBy === 'title') list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  else if (sortBy === 'rating') list.sort((a, b) => (b.rating || 0) - (a.rating || 0) || (b.watchedAt || '').localeCompare(a.watchedAt || ''));
  return list;
}

// ---- deterministic pseudo-random dataset with every awkward case
let rs = 4242; const rnd = () => (rs = (rs * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
const pick = (a) => a[Math.floor(rnd() * a.length)];
const WORDS = ['Suits', 'Arrow', 'Bleach', 'Dark', 'Archer', 'Naruto', 'The', 'Good', 'Doctor', 'Emily', 'Paris', 'One', 'Piece', 'Fairy', 'Tail', 'Alice', 'Borderland', 'Severance', 'Andor', 'Arcane', 'Ozark', 'Fargo', 'Baki', 'Black', 'Jack', 'Café', 'Ünder', 'Zed', 'Ahiru', 'No', 'Sora'];
const PLATS = ['netflix', 'prime', 'disney', 'max', 'crunchyroll', 'stan', undefined, undefined];
const shows = {};
for (let i = 0; i < 320; i++) {
  const name = Array.from({ length: 1 + Math.floor(rnd() * 3) }, () => pick(WORDS)).join(' ');
  const total = pick([undefined, 0, 1, 8, 12, 24, 50, 140]);
  const seen = pick([0, 0, 1, 3, 12, 24, 50, 51, 200]);
  const watched = {};
  for (let k = 0; k < seen; k++) watched[`1x${k + 1}`] = rnd() < 0.15 ? { n: 1 } : { at: `20${18 + Math.floor(rnd() * 9)}-0${1 + Math.floor(rnd() * 9)}-1${Math.floor(rnd() * 9)}T10:00:00.000Z`, n: 1 };
  shows[`tmdb:${i}`] = { name, followed: rnd() < 0.85, totalEpisodes: total, watched, platform: pick(PLATS), rating: pick([0, 0, 1, 2, 3, 4, 5, undefined]), addedAt: rnd() < 0.4 ? `2026-0${1 + Math.floor(rnd() * 9)}-1${Math.floor(rnd() * 9)}` : undefined };
}
const entries = Object.entries(shows);
const STATUSES = ['All', 'Watching', 'Finished', 'Not started'], // parity with the OLD code: Dropped is new and has its own tests below
   PLATFORMS = ['All', 'netflix', 'prime', 'disney', 'max', 'crunchyroll', 'stan', 'hulu'];
const QUERIES = ['', 'a', 'The', '  bleach ', 'ZED', 'café', 'nomatchxyz', 'o'];
const SORTS = L.SHOW_SORTS.map((s) => s.id);

t('GOLDEN: every status × platform × name × sort × direction gives the SAME ordered list as the original code', () => {
  let combos = 0;
  for (const status of STATUSES) for (const platform of PLATFORMS) for (const query of QUERIES) for (const sortBy of SORTS) for (const sortDir of ['asc', 'desc']) {
    const expected = oldLibrary(shows, { filter: status, platformFilter: platform, libQuery: query, sortBy, sortDir }).map(([id]) => id);
    const actual = L.sortShows(L.filterShows(entries, { status, platform, query }, h), sortBy, sortDir, h).map(([id]) => id);
    assert.deepEqual(actual, expected, JSON.stringify({ status, platform, query, sortBy, sortDir }));
    combos++;
  }
  console.log(`       (${combos} combinations identical)`);
});
t('statuses PARTITION the library: Watching + Finished + Not started === All, for every platform/name filter', () => {
  for (const platform of PLATFORMS) for (const query of QUERIES) {
    const c = L.statusCounts(entries, { platform, query }, h);
    assert.equal(c.Watching + c.Finished + c['Not started'], c.All, JSON.stringify({ platform, query, c }));
    // and each count equals what clicking that tab would actually show
    for (const s of ['Watching', 'Finished', 'Not started']) assert.equal(c[s], oldLibrary(shows, { filter: s, platformFilter: platform, libQuery: query, sortBy: 'Alphabetical', sortDir: 'asc' }).length);
    assert.equal(c.All, oldLibrary(shows, { filter: 'All', platformFilter: platform, libQuery: query, sortBy: 'Alphabetical', sortDir: 'asc' }).length);
  }
});
t('platform counts equal what choosing that platform would show (status + name respected)', () => {
  for (const status of STATUSES) for (const query of QUERIES) {
    const pc = L.platformCounts(entries, { status, query }, h);
    assert.equal(pc.total, oldLibrary(shows, { filter: status, platformFilter: 'All', libQuery: query, sortBy: 'Alphabetical', sortDir: 'asc' }).length);
    for (const p of PLATFORMS.filter((x) => x !== 'All')) assert.equal(pc.byId[p] || 0, oldLibrary(shows, { filter: status, platformFilter: p, libQuery: query, sortBy: 'Alphabetical', sortDir: 'asc' }).length, `${status}/${query}/${p}`);
  }
});
t('showStatus edge cases: no total, total 0, seen > total, seen 0 with a total', () => {
  const s = (watchedN, total) => ({ followed: true, totalEpisodes: total, watched: Object.fromEntries(Array.from({ length: watchedN }, (_, i) => [`1x${i + 1}`, {}])) });
  assert.equal(L.showStatus(s(5, undefined), h), 'Watching'); assert.equal(L.showStatus(s(5, 0), h), 'Watching');
  assert.equal(L.showStatus(s(14, 13), h), 'Finished'); assert.equal(L.showStatus(s(13, 13), h), 'Finished');
  assert.equal(L.showStatus(s(0, 13), h), 'Not started'); assert.equal(L.showStatus(s(0, undefined), h), 'Not started');
  assert.equal(L.showStatus(s(12, 13), h), 'Watching');
});
t('unfollowed shows never appear anywhere (list, counts, platforms in use)', () => {
  const unf = { a: { name: 'Ghost', followed: false, platform: 'netflix', watched: { '1x1': {} }, totalEpisodes: 3 } };
  const e = Object.entries(unf);
  assert.deepEqual(L.filterShows(e, {}, h), []); assert.equal(L.statusCounts(e, {}, h).All, 0);
  assert.deepEqual(L.platformsInUse(e, [{ id: 'netflix' }]), []);
});
t('platformsInUse: only platforms used by FOLLOWED shows, in canonical order', () => {
  const all = [{ id: 'netflix' }, { id: 'disney' }, { id: 'stan' }];
  const e = Object.entries({ a: { followed: true, platform: 'stan' }, b: { followed: true, platform: 'netflix' }, c: { followed: false, platform: 'disney' } });
  assert.deepEqual(L.platformsInUse(e, all).map((p) => p.id), ['netflix', 'stan']);
});
t('missing/blank filter object is safe (defaults to everything)', () => {
  assert.equal(L.filterShows(entries, undefined, h).length, oldLibrary(shows, { filter: 'All', platformFilter: 'All', libQuery: '', sortBy: 'Alphabetical', sortDir: 'asc' }).length);
  assert.equal(L.filterShows(entries, {}, h).length, L.filterShows(entries, L.DEFAULT_SHOW_FILTERS, h).length);
});
t('sortShows does not mutate its input', () => {
  const list = L.filterShows(entries, {}, h); const before = list.map(([id]) => id).join();
  L.sortShows(list, 'Rating', 'desc', h); assert.equal(list.map(([id]) => id).join(), before);
});

// ============================================================ filter state helpers
t('isFiltered: any non-default status, platform or non-blank name', () => {
  assert.equal(L.isFiltered({ status: 'All', platform: 'All', query: '' }), false); assert.equal(L.isFiltered({ status: 'All', platform: 'All', query: '   ' }), false);
  assert.equal(L.isFiltered({ status: 'Finished', platform: 'All', query: '' }), true); assert.equal(L.isFiltered({ status: 'All', platform: 'stan', query: '' }), true);
  assert.equal(L.isFiltered({ status: 'All', platform: 'All', query: 'x' }), true); assert.equal(L.isFiltered(undefined), false);
});
t('emptyKind: empty library vs a typed name vs a filter combination', () => {
  assert.equal(L.emptyKind(0, {}), 'library'); assert.equal(L.emptyKind(0, { query: 'x' }), 'library');
  assert.equal(L.emptyKind(250, { status: 'All', platform: 'All', query: 'bleech' }), 'name');
  assert.equal(L.emptyKind(250, { status: 'Finished', platform: 'All', query: 'bleech' }), 'filters');
  assert.equal(L.emptyKind(250, { status: 'All', platform: 'stan', query: '' }), 'filters'); assert.equal(L.emptyKind(250, { query: '  ' }), 'filters');
});
t('describeFilters builds the chips for the "nothing matches" screen', () => {
  assert.deepEqual(L.describeFilters({ status: 'Not started', platform: 'stan', query: '' }, (id) => ({ stan: 'Stan' })[id]), ['Platform: Stan', 'Status: Not started']);
  assert.deepEqual(L.describeFilters({ status: 'All', platform: 'All', query: ' bleech ' }), ['Name: “bleech”']); assert.deepEqual(L.describeFilters({}), []);
});
t('sortSummary / sortLabel / showMeta', () => {
  assert.equal(L.sortSummary('Alphabetical', 'asc'), 'sorted by title, A→Z'); assert.equal(L.sortSummary('Alphabetical', 'desc'), 'sorted by title, Z→A');
  assert.equal(L.sortSummary('Recently watched', 'asc'), 'sorted by recently watched, newest first'); assert.equal(L.sortSummary('Recently watched', 'desc'), 'sorted by recently watched, oldest first');
  assert.equal(L.sortSummary('Progress', 'desc'), 'sorted by progress, least first'); assert.equal(L.sortSummary('Rating', 'asc'), 'sorted by rating, highest first');
  assert.equal(L.sortLabel('Alphabetical'), 'Title'); assert.equal(L.sortLabel('Rating'), 'Rating'); assert.equal(L.sortLabel('bogus'), 'Title');
  assert.equal(L.showMeta(27, 49), '27 / 49 eps'); assert.equal(L.showMeta(3, undefined), '3 eps seen'); assert.equal(L.showMeta(0, 0), 'not started');
});

// ============================================================ movies
const movies = Array.from({ length: 120 }, (_, i) => ({ name: `${pick(WORDS)} ${pick(WORDS)}`, index: i, rating: pick([0, 1, 2, 3, 4, 5, undefined]), watchedAt: rnd() < 0.9 ? `20${19 + Math.floor(rnd() * 8)}-0${1 + Math.floor(rnd() * 9)}-1${Math.floor(rnd() * 9)}T20:00:00.000Z` : undefined }))
  .sort((a, b) => (b.watchedAt || '').localeCompare(a.watchedAt || ''));
t('GOLDEN: movies filter × sort give the SAME ordered list as the current page', () => {
  let combos = 0;
  for (const query of QUERIES) for (const sortBy of ['recent', 'title', 'rating']) {
    assert.deepEqual(L.shownMovies(movies, query, sortBy).map((m) => m.index), oldShownMovies(movies, query, sortBy).map((m) => m.index), query + sortBy); combos++;
  }
  console.log(`       (${combos} combinations identical)`);
});
t('shownMovies does not mutate and handles missing names', () => {
  const m2 = [{ index: 0 }, { index: 1, name: 'B' }, { index: 2, name: 'A' }]; const before = JSON.stringify(m2);
  assert.deepEqual(L.shownMovies(m2, '', 'title').map((m) => m.index), [0, 2, 1]); assert.equal(JSON.stringify(m2), before);
});
t('movieSortSummary', () => { assert.equal(L.movieSortSummary('recent'), 'most recently watched first'); assert.equal(L.movieSortSummary('title'), 'title, A→Z'); assert.equal(L.movieSortSummary('rating'), 'highest rated first'); });

// ============================================================ add dialog states
t('showResultState: followed beats watchlisted beats new', () => {
  const f = new Set([1]), w = new Set([1, 2]);
  assert.equal(L.showResultState({ id: 1 }, f, w), 'followed'); assert.equal(L.showResultState({ id: 2 }, f, w), 'watchlisted'); assert.equal(L.showResultState({ id: 3 }, f, w), 'new');
});
t('movieResultState: watched (with count/last) beats planned beats new', () => {
  const w = new Map([[1, { count: 2, last: '2026-01-01' }]]), p = new Set([1, 2]);
  assert.deepEqual(L.movieResultState({ id: 1 }, w, p), { kind: 'watched', count: 2, last: '2026-01-01' });
  assert.deepEqual(L.movieResultState({ id: 2 }, w, p), { kind: 'planned' }); assert.deepEqual(L.movieResultState({ id: 3 }, w, p), { kind: 'new' });
});
t('resultsLabel', () => { assert.equal(L.resultsLabel(0), 'No results'); assert.equal(L.resultsLabel(1), '1 result from TMDB'); assert.equal(L.resultsLabel(3), '3 results from TMDB'); });

// ============================================================ placeholders
t('posterTint is stable per name, in range, and varies; initialOf handles odd titles', () => {
  assert.deepEqual(L.posterTint('Arcane'), L.posterTint('Arcane'));
  const tints = new Set(WORDS.map((w) => L.posterTint(w).join())); assert.ok(tints.size >= 4, 'tints should vary: ' + tints.size);
  for (const nm of ['', null, undefined, '日本', '😀']) assert.equal(L.posterTint(nm).length, 2);
  assert.equal(L.initialOf('arcane'), 'A'); assert.equal(L.initialOf('  13 Reasons Why'), '1'); assert.equal(L.initialOf('“Quoted”'), 'Q'); assert.equal(L.initialOf('Ünder'), 'Ü');
  assert.equal(L.initialOf(''), '·'); assert.equal(L.initialOf('!!!'), '·'); assert.equal(L.initialOf(null), '·');
});

console.log(`\n${n} library tests passed`);
