import assert from 'node:assert/strict';
const store = new Map();
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
store.set('watchnext-state-v1', JSON.stringify({
  shows: { 'tmdb:1': { followed: true, name: 'Alpha', tmdbId: 1, watched: { '1x1': { at: 'x', n: 1 } }, rating: 4, providers: [{ name: 'Old', logo: null }], providersSynced: '2020-01-01T00:00:00.000Z' }, 'tmdb:2': { watchlist: true, name: 'Beta', tmdbId: 2 } },
  movies: [
    { tmdbId: 10, name: 'Planned A', status: 'planned' },
    { tmdbId: 10, name: 'Planned A (watched copy)', status: 'watched', watchedAt: '2026-01-01T00:00:00.000Z' },
    { tmdbId: 11, name: 'Planned B', status: 'planned' },
    { name: 'Legacy watched', watchedAt: '2025-01-01T00:00:00.000Z' }, // no status = watched
  ], settings: {} }));
const D = await import('/home/claude/wl/src/store/db.js');
let n = 0; const t = (name, fn) => { fn(); n++; console.log('ok  -', name); };
const subs = [{ name: 'Netflix', logo: '/n.png' }], free = [{ name: 'ABC iview', logo: null }];

t('setShowProviders saves the subscription list AND the free list, the link and the time; nothing else on the show changes', () => {
  const before = Date.now(); D.setShowProviders('tmdb:1', subs, 'https://x', free); const s = D.getState().shows['tmdb:1'];
  assert.deepEqual(s.providers, subs); assert.deepEqual(s.providersFree, free); assert.equal(s.providersLink, 'https://x'); assert.ok(Date.parse(s.providersSynced) >= before - 5);
  assert.equal(s.rating, 4); assert.equal(s.name, 'Alpha'); assert.equal(Object.keys(s.watched).length, 1);
});
t('older callers that pass no free list still work: it is stored as an empty list (never undefined)', () => {
  D.setShowProviders('tmdb:2', subs, ''); const s = D.getState().shows['tmdb:2']; assert.deepEqual(s.providersFree, []); assert.equal(s.providersLink, '');
  D.setShowProviders('tmdb:2', null, null, 'junk'); assert.deepEqual(D.getState().shows['tmdb:2'].providers, []); assert.deepEqual(D.getState().shows['tmdb:2'].providersFree, []);
  assert.ok(!JSON.stringify(D.getState()).includes('undefined'));
});
t('setShowProviders marks the show for cloud sync; an unknown show is ignored', () => {
  D.takeDirty(); D.setShowProviders('tmdb:1', subs, '', free); assert.ok(D.takeDirty().showIds.has('tmdb:1')); D.setShowProviders('tmdb:404', subs, '', free); assert.equal(D.getState().shows['tmdb:404'], undefined);
});
t('setMovieProviders updates ONLY planned entries with that TMDB id (not the watched copy, not other films)', () => {
  D.takeDirty(); D.setMovieProviders(10, subs, 'https://m', free); const m = D.getState().movies;
  assert.deepEqual(m[0].providers, subs); assert.deepEqual(m[0].providersFree, free); assert.equal(m[0].providersLink, 'https://m'); assert.ok(m[0].providersSynced);
  assert.ok(!('providers' in m[1]), 'the watched copy is untouched'); assert.ok(!('providers' in m[2]), 'another film is untouched'); assert.ok(!('providers' in m[3]));
  assert.equal(m[0].name, 'Planned A'); assert.equal(m[0].status, 'planned'); assert.equal(D.takeDirty().movies, true);
});
t('setMovieProviders with no match / null id / only watched entries is a no-op and does not mark movies dirty', () => {
  D.takeDirty(); D.setMovieProviders(999, subs, '', free); D.setMovieProviders(null, subs, '', free); D.setMovieProviders(undefined, subs, '', free); assert.equal(D.takeDirty().movies, false);
  const before = JSON.stringify(D.getState().movies); D.setMovieProviders(12345, subs, '', free); assert.equal(JSON.stringify(D.getState().movies), before);
});
t('movie list order and length are preserved; free list defaults to [] for junk', () => {
  D.setMovieProviders(11, subs, '', 'junk'); const m = D.getState().movies; assert.equal(m.length, 4); assert.deepEqual(m.map((x) => x.name), ['Planned A', 'Planned A (watched copy)', 'Planned B', 'Legacy watched']); assert.deepEqual(m[2].providersFree, []);
});
t('the cached lists survive a persisted round trip (reload)', () => {
  const saved = JSON.parse(store.get('watchnext-state-v1')); assert.deepEqual(saved.shows['tmdb:1'].providersFree, free); assert.deepEqual(saved.movies[0].providers, subs);
});
console.log(`\n${n} tests passed`);
