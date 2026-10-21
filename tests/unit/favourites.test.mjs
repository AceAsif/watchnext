import assert from 'node:assert/strict';
const store = new Map();
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
store.set('watchnext-state-v1', JSON.stringify({ shows: { 'tmdb:1': { tmdbId: 1, name: 'Dark', followed: true, watched: {} } }, movies: [], settings: {} }));
const D = await import('../../src/store/db.js');
const L = await import('../../src/components/libraryLogic.js');
const U = await import('../../src/components/upnextLogic.js');
let n = 0; const t = (name, fn) => { fn(); n++; console.log('ok  -', name); };
const h = { watchedCount: (s) => Object.keys(s.watched || {}).length, lastWatchDate: (s) => Object.values(s.watched || {}).map((w) => w.at || '').sort().pop() || '' };

t('setFavourite: on stores favourite + favAt and queues a sync; off removes both fields (never false/undefined)', () => {
  D.takeDirty();
  D.setFavourite('tmdb:1', true);
  const s = D.getState().shows['tmdb:1'];
  assert.equal(s.favourite, true); assert.ok(s.favAt); assert.ok(D.takeDirty().showIds.has('tmdb:1'));
  D.setFavourite('tmdb:1', false);
  const s2 = D.getState().shows['tmdb:1'];
  assert.equal('favourite' in s2, false); assert.equal('favAt' in s2, false);
  D.setFavourite('nope', true); // unknown show: ignored
});
const ep = (d) => ({ at: d + 'T10:00:00Z' });
const shows = {
  a: { name: 'Alpha', followed: true, totalEpisodes: 10, watched: { '1x1': ep('2026-10-01') }, rating: 3 },
  b: { name: 'Bravo', followed: true, totalEpisodes: 10, watched: { '1x1': ep('2026-10-05') }, rating: 5 },
  c: { name: 'Charlie', followed: true, totalEpisodes: 10, watched: { '1x1': ep('2026-09-01') }, favourite: true, rating: 1 },
  z: { name: 'Zulu', followed: true, totalEpisodes: 10, watched: { '1x1': ep('2026-08-01') }, favourite: true, rating: 2 },
};
const order = (sortBy, dir) => L.sortShows(L.filterShows(Object.entries(shows), {}, h), sortBy, dir, h).map(([id]) => id);
t('Shows: favourites stay at the top whatever the sort and direction; the rest keep their order', () => {
  assert.deepEqual(order('Name', 'asc'), ['c', 'z', 'a', 'b']);
  assert.deepEqual(order('Name', 'desc'), ['z', 'c', 'b', 'a']);
  assert.deepEqual(order('Rating', 'asc'), ['z', 'c', 'b', 'a']);
  assert.deepEqual(order('Recently watched', 'asc'), ['c', 'z', 'b', 'a']);
});
t('Shows: with no favourites the order is exactly as before', () => {
  const plain = Object.fromEntries(Object.entries(shows).map(([k, s]) => { const { favourite, ...r } = s; return [k, r]; })); // eslint-disable-line no-unused-vars
  assert.deepEqual(L.sortShows(Object.entries(plain), 'Name', 'asc', h).map(([id]) => id), ['a', 'b', 'c', 'z']);
});
t('Up Next "Continue watching": favourites first (most recent first among them), then the rest by most recent', () => {
  const cont = U.buildUpNext(Object.entries(shows), '2026-10-22', h).cont.map((x) => x.id);
  assert.deepEqual(cont, ['c', 'z', 'b', 'a']);
});
t('isFavourite only trusts a real true', () => {
  assert.equal(L.isFavourite({ favourite: true }), true); assert.equal(L.isFavourite({ favourite: 'yes' }), false); assert.equal(L.isFavourite(null), false);
});
console.log(`\n${n} favourites tests passed`);
