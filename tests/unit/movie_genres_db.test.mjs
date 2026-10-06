import assert from 'node:assert/strict';
const store = new Map();
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
store.set('watchnext-state-v1', JSON.stringify({ shows: {}, movies: [{ tmdbId: 5, name: 'Old planned', status: 'planned', runtimeMin: 90 }, { tmdbId: 5, name: 'Old watched copy', status: 'watched', watchedAt: '2026-01-01T00:00:00.000Z' }, { tmdbId: 6, name: 'Other', status: 'planned' }], settings: {} }));
const D = await import('/home/claude/wl/src/store/db.js');
let n = 0; const t = (name, fn) => { fn(); n++; console.log('ok  -', name); };
t('queueing a movie now stores its genre names', () => {
  D.addMovieToWatchlist({ id: 7, title: 'New planned', runtime: 101, poster_path: '/p.jpg', release_date: '2024-03-02', genres: [{ id: 35, name: 'Comedy' }, { id: 18, name: 'Drama' }] });
  const m = D.getState().movies.find((x) => x.tmdbId === 7); assert.deepEqual(m.genres, ['Comedy', 'Drama']); assert.equal(m.status, 'planned'); assert.equal(m.runtimeMin, 101);
});
t('details without genres store an empty list (so "no genres listed" is distinguishable from "never fetched")', () => {
  D.addMovieToWatchlist({ id: 8, title: 'No genres', runtime: 90 }); assert.deepEqual(D.getState().movies.find((x) => x.tmdbId === 8).genres, []);
});
t('logging a movie as watched also stores genres', () => {
  D.addMovieWatched({ id: 9, title: 'Seen it', runtime: 80, genres: [{ name: 'Horror' }] }); assert.deepEqual(D.getState().movies.find((x) => x.tmdbId === 9).genres, ['Horror']);
});
t('setMovieGenres backfills ONLY the planned entry with that TMDB id (not the watched copy, not other films)', () => {
  D.takeDirty(); D.setMovieGenres(5, ['Comedy', 'Family']); const m = D.getState().movies;
  assert.deepEqual(m[0].genres, ['Comedy', 'Family']); assert.ok(!('genres' in m[1]), 'the watched copy is untouched'); assert.ok(!('genres' in m[2])); assert.equal(m[0].runtimeMin, 90); assert.equal(D.takeDirty().movies, true);
});
t('setMovieGenres ignores junk: unknown id, null id, non-array, non-string names; and does not mark movies dirty when nothing changed', () => {
  D.takeDirty(); D.setMovieGenres(999, ['X']); D.setMovieGenres(null, ['X']); D.setMovieGenres(6, 'Comedy'); D.setMovieGenres(6, null); assert.equal(D.takeDirty().movies, false); assert.ok(!('genres' in D.getState().movies[2]));
  D.setMovieGenres(6, ['Drama', 5, null, 'Crime']); assert.deepEqual(D.getState().movies[2].genres, ['Drama', 'Crime']); assert.ok(!JSON.stringify(D.getState()).includes('undefined'));
});
t('order and count of movies are preserved', () => { assert.deepEqual(D.getState().movies.map((x) => x.name), ['Old planned', 'Old watched copy', 'Other', 'New planned', 'No genres', 'Seen it']); });
console.log(`\n${n} tests passed`);
