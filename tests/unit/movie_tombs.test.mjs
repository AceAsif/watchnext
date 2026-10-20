import assert from 'node:assert/strict';
// db.js reads localStorage when it loads, so provide a tiny in-memory one first.
const store = new Map();
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
const A = { tmdbId: 1, name: 'Alvin', status: 'watched', watchedAt: '2026-10-19T02:00:00.000Z', rating: 3 };
const B = { tmdbId: 1, name: 'Alvin', status: 'watched', watchedAt: '2026-10-01T02:00:00.000Z' };
const C = { tmdbId: 2, name: 'Heat', status: 'watched', watchedAt: '2026-09-01T02:00:00.000Z' };
const P = { tmdbId: 3, name: 'Dune', status: 'planned', addedAt: '2026-09-02T02:00:00.000Z' };
store.set('watchnext-state-v1', JSON.stringify({ shows: {}, movies: [A, B, C, P], settings: {} }));
const L = await import('../../src/store/movieTombsLogic.js');
const D = await import('../../src/store/db.js');
let n = 0; const t = async (name, fn) => { await fn(); n++; console.log('ok  -', name); };
const key = L.movieKeyOf;
const saved = () => JSON.parse(store.get('watchnext-movie-tombs-v1') || '[]');
const idx = (m) => D.getState().movies.findIndex((x) => key(x) === key(m));

// ---------------------------------------------------------------- pure logic
await t('cleanTombs: drops junk and repeats, keeps order, caps at MAX_TOMBS (newest kept)', () => {
  assert.deepEqual(L.cleanTombs(['a', 'a', '', 5, null, 'b']), ['a', 'b']);
  assert.deepEqual(L.cleanTombs('nope'), []);
  const big = Array.from({ length: L.MAX_TOMBS + 5 }, (_, i) => 'k' + i);
  const out = L.cleanTombs(big);
  assert.equal(out.length, L.MAX_TOMBS); assert.equal(out[out.length - 1], 'k' + (L.MAX_TOMBS + 4)); assert.equal(out[0], 'k5');
});
await t('lostKeys: viewings that were removed or re-dated, once each', () => {
  assert.deepEqual(L.lostKeys([A, B, C], [A, C]), [key(B)]);
  assert.deepEqual(L.lostKeys([A, B], [{ ...A, watchedAt: '2026-01-01T00:00:00.000Z' }, B]), [key(A)]);
  assert.deepEqual(L.lostKeys([A, A], [A]), [], 'one of two identical rows removed -> the viewing still exists');
  assert.deepEqual(L.lostKeys([A, B], [A, B, C]), []);
});
await t('addTombs keeps the order of old ones; liftPresent removes tombs of viewings that exist', () => {
  assert.deepEqual(L.addTombs(['x', 'y'], ['y', 'z']), ['x', 'y', 'z']);
  assert.deepEqual(L.liftPresent([key(A), 'gone|1'], [A, C]), ['gone|1']);
});
await t('mergeRemoteMovies: the OLD behaviour still works (cloud-only viewings are added, nothing lost)', () => {
  const r = L.mergeRemoteMovies([A], [A, C], [], []);
  assert.deepEqual(r.movies.map(key), [key(A), key(C)]); assert.equal(r.dropped, 0);
});
await t('mergeRemoteMovies: a viewing removed HERE is not brought back from the cloud', () => {
  const r = L.mergeRemoteMovies([A], [A, B], [key(B)], []);
  assert.deepEqual(r.movies.map(key), [key(A)]); assert.deepEqual(r.tombs, [key(B)]);
});
await t('mergeRemoteMovies: a viewing removed on ANOTHER device is dropped here too', () => {
  const r = L.mergeRemoteMovies([A, B], [A], [], [key(B)]);
  assert.deepEqual(r.movies.map(key), [key(A)]); assert.equal(r.dropped, 1); assert.deepEqual(r.tombs, [key(B)]);
});
await t('mergeRemoteMovies: tombs from both sides are kept; the rest of the list keeps its order', () => {
  const r = L.mergeRemoteMovies([C, A], [B, P], [key(A)], [key(B)]);
  assert.deepEqual(r.movies.map(key), [key(C), key(P)]); assert.deepEqual(r.tombs.sort(), [key(A), key(B)].sort());
});
await t('mergeRemoteMovies: two identical rows on this device are both kept (as before)', () => {
  assert.equal(L.mergeRemoteMovies([A, A], [A], [], []).movies.length, 2);
});

// ---------------------------------------------------------------- the store
await t('removing a viewing writes its key down (on this device) and queues a cloud push', () => {
  D.takeDirty();
  D.removeMovie(idx(B));
  assert.deepEqual(D.getMovieTombs(), [key(B)]); assert.deepEqual(saved(), [key(B)]);
  assert.equal(D.takeDirty().movies, true);
});
await t('the cloud pull from before the removal cannot bring it back (the reported bug)', () => {
  const r = L.mergeRemoteMovies(D.getState().movies, [A, B, C, P], D.getMovieTombs(), []);
  assert.equal(r.movies.some((m) => key(m) === key(B)), false);
  assert.equal(r.movies.length, 3);
});
await t('changing a viewing\'s date tombs the OLD date (otherwise the cloud copy comes back as a duplicate)', () => {
  const newAt = '2026-08-15T02:00:00.000Z';
  D.updateMovie(idx(A), { watchedAt: newAt });
  assert.ok(D.getMovieTombs().includes(key(A)));
  const r = L.mergeRemoteMovies(D.getState().movies, [A, C], D.getMovieTombs(), []);
  assert.equal(r.movies.filter((m) => m.tmdbId === 1).length, 1);
  assert.equal(r.movies.find((m) => m.tmdbId === 1).watchedAt, newAt);
});
await t('rating or a note does not make a tomb (the key does not change)', () => {
  const before = D.getMovieTombs().length;
  D.setMovieRating(idx(C), 4); D.setMovieNote(idx(C), { react: '', note: 'good' });
  assert.equal(D.getMovieTombs().length, before);
});
await t('"Watched it" on a watchlist film tombs the old planned entry so the cloud copy of the plan does not return', () => {
  D.markPlannedMovieWatched(idx(P));
  assert.ok(D.getMovieTombs().includes(key(P)));
  const r = L.mergeRemoteMovies(D.getState().movies, [P], D.getMovieTombs(), []);
  assert.equal(r.movies.filter((m) => m.tmdbId === 3).length, 1);
  assert.equal(r.movies.find((m) => m.tmdbId === 3).status, 'watched');
});
await t('adding a removed viewing back on purpose lifts its tomb (a restore from backup)', () => {
  assert.ok(D.getMovieTombs().includes(key(B)));
  D.restoreBackup({ shows: {}, movies: [B], settings: {} });
  assert.equal(D.getMovieTombs().includes(key(B)), false);
  assert.ok(D.getState().movies.some((m) => key(m) === key(B)));
  assert.equal(saved().includes(key(B)), false);
});
await t('removing one of two IDENTICAL rows makes no tomb (the viewing still exists)', () => {
  D.restoreBackup({ shows: {}, movies: [], settings: {} });
  D.update((s) => { s.movies = [...s.movies, { ...C }]; });
  const before = D.getMovieTombs().slice();
  const i = D.getState().movies.findIndex((m) => key(m) === key(C));
  D.removeMovie(i);
  assert.deepEqual(D.getMovieTombs(), before);
  assert.equal(D.getState().movies.filter((m) => key(m) === key(C)).length, 1);
});
await t('the list survives a reload, and a corrupt saved list is ignored without a crash', async () => {
  const keep = D.getMovieTombs().slice();
  const again = await import('../../src/store/db.js?reload=1');
  assert.deepEqual(again.getMovieTombs(), keep);
  store.set('watchnext-movie-tombs-v1', '{oops');
  const bad = await import('../../src/store/db.js?reload=2');
  assert.deepEqual(bad.getMovieTombs(), []);
  store.set('watchnext-movie-tombs-v1', JSON.stringify(keep));
});
await t('setMovieTombs cleans what it is given and saves it', () => {
  D.setMovieTombs(['p|1', 'p|1', 7, 'q|2']);
  assert.deepEqual(D.getMovieTombs(), ['p|1', 'q|2']); assert.deepEqual(saved(), ['p|1', 'q|2']);
});
await t('clearAllTombstones (another Google account takes over) also forgets removed viewings', () => {
  const cleared = D.clearAllTombstones();
  assert.ok(cleared >= 2); assert.deepEqual(D.getMovieTombs(), []); assert.deepEqual(saved(), []);
});
await t('Delete all data (resetAll) forgets removed viewings too', () => {
  D.setMovieTombs(['z|9']); D.resetAll();
  assert.deepEqual(D.getMovieTombs(), []);
});
console.log(`\n${n} movie tombs tests passed`);
