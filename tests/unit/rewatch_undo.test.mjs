import assert from 'node:assert/strict';
// db.js reads localStorage when it loads, so provide a tiny in-memory one first.
const store = new Map();
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
const W = { '5x1': { at: '2026-06-01T10:00:00.000Z', min: 50, n: 1 }, '5x2': { at: '2026-06-02T10:00:00.000Z', min: 50, n: 3 }, '5x3': { at: '2026-06-03T10:00:00.000Z', min: 50 } };
store.set('watchnext-state-v1', JSON.stringify({ shows: {
  'tmdb:1': { followed: true, name: 'Stranger', tmdbId: 1, watched: W, runtimeMin: 50, rating: 5, notes: { '5x1': { react: 'love', at: 'x' } } },
  'tmdb:2': { followed: true, name: 'Other', tmdbId: 2, watched: { '1x1': { at: '2026-01-01T10:00:00.000Z', min: 40, n: 1 } } },
}, movies: [], settings: {} }));
const D = await import('../../src/store/db.js');
let n = 0; const t = (name, fn) => { fn(); n++; console.log('ok  -', name); };
const w = (id, k) => D.getState().shows[id].watched[k];

t('logEpisodeRewatch returns a copy of the entry as it was before the extra watch', () => {
  const prev = D.logEpisodeRewatch('tmdb:1', 5, 1, 50);
  assert.deepEqual(prev, { at: '2026-06-01T10:00:00.000Z', min: 50, n: 1 });
  assert.equal(w('tmdb:1', '5x1').n, 2);
  prev.n = 99; assert.equal(w('tmdb:1', '5x1').n, 2, 'the returned copy is not the live entry');
});
t('undoEpisodeRewatch puts the entry back exactly (count, date, minutes) and marks the show for sync', () => {
  D.takeDirty();
  const prev = { at: '2026-06-01T10:00:00.000Z', min: 50, n: 1 };
  assert.equal(D.undoEpisodeRewatch('tmdb:1', 5, 1, prev), true);
  assert.deepEqual(w('tmdb:1', '5x1'), prev);
  assert.ok(D.takeDirty().showIds.has('tmdb:1'));
});
t('undo keeps the episode watched: it removes the extra watch only, never the earlier ones', () => {
  const prev = D.logEpisodeRewatch('tmdb:1', 5, 2, 50); // n 3 -> 4
  assert.equal(w('tmdb:1', '5x2').n, 4);
  D.undoEpisodeRewatch('tmdb:1', 5, 2, prev);
  assert.equal(w('tmdb:1', '5x2').n, 3); assert.ok(w('tmdb:1', '5x2').at === '2026-06-02T10:00:00.000Z');
});
t('two +1 in a row: undoing the latest brings back the count after the first, not the original', () => {
  const p1 = D.logEpisodeRewatch('tmdb:2', 1, 1, 40); const p2 = D.logEpisodeRewatch('tmdb:2', 1, 1, 40);
  assert.equal(w('tmdb:2', '1x1').n, 3);
  D.undoEpisodeRewatch('tmdb:2', 1, 1, p2); assert.equal(w('tmdb:2', '1x1').n, 2);
  D.undoEpisodeRewatch('tmdb:2', 1, 1, p1); assert.equal(w('tmdb:2', '1x1').n, 1);
});
t('an entry that never had a count (n missing) comes back without one', () => {
  const prev = D.logEpisodeRewatch('tmdb:1', 5, 3, 50); assert.equal(w('tmdb:1', '5x3').n, 2);
  D.undoEpisodeRewatch('tmdb:1', 5, 3, prev); assert.ok(!('n' in w('tmdb:1', '5x3')));
});
t('nothing changes (and nothing is queued for sync) when the episode was un-marked in the meantime, or the show is gone', () => {
  const prev = D.logEpisodeRewatch('tmdb:2', 1, 1, 40);
  D.markEpisode('tmdb:2', 1, 1, 40, false); D.takeDirty();
  assert.equal(D.undoEpisodeRewatch('tmdb:2', 1, 1, prev), false);
  assert.equal(w('tmdb:2', '1x1'), undefined); assert.equal(D.takeDirty().showIds.size, 0);
  assert.equal(D.undoEpisodeRewatch('tmdb:404', 1, 1, prev), false);
});
t('rating and notes are untouched by a rewatch and its undo', () => {
  const prev = D.logEpisodeRewatch('tmdb:1', 5, 1, 50); D.undoEpisodeRewatch('tmdb:1', 5, 1, prev);
  const s = D.getState().shows['tmdb:1']; assert.equal(s.rating, 5); assert.ok(s.notes['5x1']);
});
t('no undefined is ever written (Firestore rejects it)', () => {
  assert.ok(!JSON.stringify(D.getState()).includes('undefined'));
});
console.log(`\n${n} tests passed`);
