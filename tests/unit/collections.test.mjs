import assert from 'node:assert/strict';
import * as C from '../../src/components/collectionsLogic.js';
let n = 0; const t = (name, fn) => { fn(); n++; console.log('ok  -', name); };

const NOW = new Date('2026-10-01T10:00:00.000Z');
const TODAY = '2026-10-01';
const mv = (id, watchedAt = '2026-01-01T10:00:00.000Z', o = {}) => ({ name: 'M' + id, tmdbId: id, status: 'watched', watchedAt, ...o });
const HP = {
  id: 1241, name: 'Harry Potter Collection', poster_path: '/hp.jpg',
  parts: [ // TMDB's order is not always release order
    { id: 674, title: 'Goblet of Fire', release_date: '2005-11-16', poster_path: '/4.jpg' },
    { id: 671, title: "Philosopher's Stone", release_date: '2001-11-16', poster_path: '/1.jpg' },
    { id: 672, title: 'Chamber of Secrets', release_date: '2002-11-13' },
    { id: 673, title: 'Prisoner of Azkaban', release_date: '2004-05-31' },
    { id: 675, title: 'Order of the Phoenix', release_date: '2007-06-28' },
    { id: 767, title: 'Half-Blood Prince', release_date: '2009-07-07' },
    { id: 12444, title: 'Deathly Hallows: Part 1', release_date: '2010-10-17' },
    { id: 12445, title: 'Deathly Hallows: Part 2', release_date: '2011-07-07' },
  ],
};
const inHP = (id) => ({ id, belongs_to_collection: { id: 1241, name: 'Harry Potter Collection' } });
const notIn = (id) => ({ id, belongs_to_collection: null });
function hpCache(watchedIds) {
  let c = C.emptyCache();
  for (const id of watchedIds) c = C.recordMovie(c, inHP(id), NOW);
  return C.recordCollection(c, HP, NOW);
}

t('Harry Potter: 3 of 8 watched, next film is the first unwatched one in RELEASE order', () => {
  const movies = [mv(671), mv(672), mv(674)];
  const [hp] = C.buildCollections(movies, hpCache([671, 672, 674]), TODAY);
  assert.equal(hp.name, 'Harry Potter Collection');
  assert.equal(C.progressLabel(hp), '3 of 8 watched');
  assert.equal(hp.next.title, 'Prisoner of Azkaban');
  assert.equal(C.nextLabel(hp), 'Next: Prisoner of Azkaban (2004)');
  assert.deepEqual(hp.parts.map((p) => p.year), ['2001', '2002', '2004', '2005', '2007', '2009', '2010', '2011']);
  assert.deepEqual(hp.parts.map((p) => p.state), ['watched', 'watched', 'todo', 'watched', 'todo', 'todo', 'todo', 'todo']);
  assert.equal(hp.complete, false);
});
t('a film on your watchlist is marked "planned" and can still be the next one', () => {
  const movies = [mv(671), { name: 'Chamber', tmdbId: 672, status: 'planned' }];
  const [hp] = C.buildCollections(movies, hpCache([671]), TODAY);
  assert.equal(hp.watched, 1); assert.equal(hp.next.id, 672); assert.equal(hp.next.state, 'planned');
});
t('rewatches and duplicate entries count a film once', () => {
  const movies = [mv(671, '2020-01-01T00:00:00Z'), mv(671, '2026-01-01T00:00:00Z'), mv(672)];
  const [hp] = C.buildCollections(movies, hpCache([671, 672]), TODAY);
  assert.equal(hp.watched, 2); assert.equal(hp.lastWatched, '2026-01-01T10:00:00.000Z');
});
t('all watched: complete, and the label says so', () => {
  const ids = HP.parts.map((p) => p.id);
  const [hp] = C.buildCollections(ids.map((id) => mv(id)), hpCache(ids), TODAY);
  assert.equal(hp.complete, true); assert.equal(hp.next, null); assert.equal(C.nextLabel(hp), 'All watched');
});
t('films not out yet (future or no date) are "upcoming", not counted, and named when the rest are watched', () => {
  const data = { id: 9, name: 'Saga', parts: [{ id: 1, title: 'One', release_date: '2020-01-01' }, { id: 2, title: 'Two', release_date: '2022-01-01' }, { id: 3, title: 'Three', release_date: '2027-05-01' }, { id: 4, title: 'Four', release_date: '' }] };
  let c = C.emptyCache(); for (const id of [1, 2]) c = C.recordMovie(c, { id, belongs_to_collection: { id: 9 } }, NOW); c = C.recordCollection(c, data, NOW);
  const [s] = C.buildCollections([mv(1), mv(2)], c, TODAY);
  assert.equal(C.progressLabel(s), '2 of 2 watched'); assert.equal(s.complete, true);
  assert.deepEqual(s.parts.map((p) => p.state), ['watched', 'watched', 'upcoming', 'upcoming']);
  assert.equal(C.nextLabel(s), 'All watched · next out 2027-05-01');
  assert.equal(C.nextLabel(s, (d) => 'May 2027'), 'All watched · next out May 2027');
});
t('a collection you have watched none of, or with only one released film, is not listed', () => {
  const one = { id: 5, name: 'Solo', parts: [{ id: 50, title: 'Only', release_date: '2020-01-01' }, { id: 51, title: 'Soon', release_date: '2030-01-01' }] };
  let c = hpCache([]); c = C.recordMovie(c, { id: 50, belongs_to_collection: { id: 5 } }, NOW); c = C.recordCollection(c, one, NOW);
  assert.deepEqual(C.buildCollections([mv(50), { name: 'x', tmdbId: 671, status: 'planned' }], c, TODAY), []);
});
t('order: unfinished first (most recently watched on top), then finished A to Z', () => {
  const mk = (cid, name, ids) => ({ id: cid, name, parts: ids.map((id, i) => ({ id, title: name + i, release_date: `200${i}-01-01` })) });
  let c = C.emptyCache();
  const sets = [[1, 'Zeta', [10, 11]], [2, 'Alpha', [20, 21]], [3, 'Beta', [30, 31, 32]], [4, 'Gamma', [40, 41, 42]]];
  for (const [cid, name, ids] of sets) { for (const id of ids) c = C.recordMovie(c, { id, belongs_to_collection: { id: cid } }, NOW); c = C.recordCollection(c, mk(cid, name, ids), NOW); }
  const movies = [mv(10), mv(11), mv(20), mv(21), mv(30, '2026-03-01T00:00:00Z'), mv(40, '2026-05-01T00:00:00Z')];
  assert.deepEqual(C.buildCollections(movies, c, TODAY).map((x) => x.name), ['Gamma', 'Beta', 'Alpha', 'Zeta']);
  assert.equal(C.listSummary(C.buildCollections(movies, c, TODAY)), '4 collections · 2 finished');
});
t('moviesToCheck: watched films with a TMDB id, once each, skipping ones already known', () => {
  let c = C.recordMovie(C.emptyCache(), inHP(671), NOW);
  const movies = [mv(671), mv(2), mv(2), mv(3, null, { status: 'planned' }), { name: 'no id', status: 'watched' }, { name: 'legacy', tmdbId: 4, watchedAt: '2020-01-01' }];
  assert.deepEqual(C.moviesToCheck(movies, c, NOW), [2, 4]);
});
t('"not in a collection" is re-asked after 90 days; "in a collection" never is', () => {
  const old = new Date(NOW.getTime() - 91 * 86400000);
  let c = C.recordMovie(C.emptyCache(), notIn(2), old); c = C.recordMovie(c, inHP(671), old); c = C.recordMovie(c, notIn(3), NOW);
  assert.deepEqual(C.moviesToCheck([mv(2), mv(671), mv(3)], c, NOW), [2]);
});
t('collectionsToFetch: collections of watched films with no film list yet, or one older than 30 days', () => {
  let c = C.recordMovie(C.emptyCache(), inHP(671), NOW); c = C.recordMovie(c, { id: 7, belongs_to_collection: { id: 99 } }, NOW);
  assert.deepEqual(C.collectionsToFetch([mv(671), mv(7)], c, NOW), [99, 1241]);
  c = C.recordCollection(c, HP, NOW);
  assert.deepEqual(C.collectionsToFetch([mv(671), mv(7)], c, NOW), [99]);
  c = C.recordCollection(c, { id: 99, name: 'X', parts: [] }, new Date(NOW.getTime() - 31 * 86400000));
  assert.deepEqual(C.collectionsToFetch([mv(671), mv(7)], c, NOW), [99]);
  assert.deepEqual(C.collectionsToFetch([mv(7, null, { status: 'planned' })], c, NOW), []); // only watched films pull a collection in
});
t('unlinkedCount: watched films with no TMDB id', () => {
  assert.equal(C.unlinkedCount([mv(1), { name: 'a', status: 'watched' }, { name: 'b' }, { name: 'c', status: 'planned' }]), 2);
});
t('collectionOfMovie finds the collection a film is in', () => {
  const list = C.buildCollections([mv(671)].concat([mv(672)]), hpCache([671, 672]), TODAY);
  assert.equal(C.collectionOfMovie(list, 673).name, 'Harry Potter Collection'); assert.equal(C.collectionOfMovie(list, 1), null);
});
t('cache: save → load round-trips; bad or odd storage gives an empty cache, never a crash', () => {
  const store = new Map(); const st = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  const c = hpCache([671]); C.saveCache(st, c);
  assert.deepEqual(C.loadCache(st), c);
  store.set(C.CACHE_KEY, '{oops'); assert.deepEqual(C.loadCache(st), C.emptyCache());
  assert.deepEqual(C.loadCache(null), C.emptyCache());
  assert.deepEqual(C.loadCache({ getItem: () => { throw new Error('blocked'); } }), C.emptyCache());
  C.saveCache({ setItem: () => { throw new Error('full'); } }, c); // must not throw
  const odd = C.sanitizeCache({ byMovie: { abc: { c: 1, at: 'x' }, 5: { c: -2, at: '2026-01-01' }, 6: 'no' }, colls: { 7: { name: 3, parts: [{ id: 'x' }, { id: 8, title: '', date: 'soon' }], at: '2026-01-01' }, 9: { parts: 'no' } } });
  assert.deepEqual(odd.byMovie, { 5: { c: 0, at: '2026-01-01' } });
  assert.deepEqual(odd.colls, { 7: { name: 'Collection', poster: null, parts: [{ id: 8, title: 'Untitled', date: '', poster: null }], at: '2026-01-01' } });
});
t('recordMovie / recordCollection ignore junk and never change the old cache object', () => {
  const c = C.emptyCache();
  assert.equal(C.recordMovie(c, null), c); assert.equal(C.recordMovie(c, { id: 'x' }), c); assert.equal(C.recordCollection(c, { id: 0 }), c);
  const c2 = C.recordMovie(c, inHP(671), NOW); assert.deepEqual(c.byMovie, {}); assert.equal(c2.byMovie[671].c, 1241);
});
t('partsInOrder: dated by release date, undated last in TMDB order', () => {
  const r = C.partsInOrder([{ id: 1, date: '' }, { id: 2, date: '2010-01-01' }, { id: 3, date: '2001-01-01' }, { id: 4, date: '' }]);
  assert.deepEqual(r.map((p) => p.id), [3, 2, 1, 4]);
});
t('listSummary singular', () => {
  assert.equal(C.listSummary([{ complete: false }]), '1 collection');
});

console.log(`\n${n} collections tests passed`);
