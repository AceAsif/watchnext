import assert from 'node:assert/strict';
// db.js reads localStorage when it loads, so provide a tiny in-memory one first.
const store = new Map();
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
const W = (from, to) => Object.fromEntries(Array.from({ length: to - from + 1 }, (_, i) => [`1x${from + i}`, { at: '2026-09-01T10:00:00.000Z', min: 40, n: 1 }]));
const mk = (name, extra = {}) => ({ followed: true, name, tmdbId: 1, totalEpisodes: 10, seasons: [{ n: 1, count: 10 }], watched: W(1, 3), runtimeMin: 40, ...extra });
store.set('watchnext-state-v1', JSON.stringify({ shows: {
  'tmdb:1': mk('Dropped', { dropped: true, droppedAt: '2026-08-01T00:00:00.000Z', rating: 4, notes: { '1x1': { react: 'love', at: 'x' } } }),
  'tmdb:2': mk('Dropped2', { dropped: true, droppedAt: '2026-08-02T00:00:00.000Z' }),
  'tmdb:3': mk('Dropped3', { dropped: true, droppedAt: '2026-08-03T00:00:00.000Z' }),
  'tmdb:4': mk('Dropped4', { dropped: true, droppedAt: '2026-08-04T00:00:00.000Z' }),
  'tmdb:5': mk('Plain'),
  'tmdb:6': mk('Resumed', { dropped: false, droppedAt: null }),
}, movies: [{ name: 'Film', watchedAt: '2026-05-05T10:00:00.000Z' }], settings: { tmdbKey: 'KEY-123' } }));
const D = await import('../../src/store/db.js');
let n = 0; const t = (name, fn) => { fn(); n++; console.log('ok  -', name); };
const show = (id) => D.getState().shows[id];
const isResumed = (id) => show(id).dropped === false && show(id).droppedAt === null;

t('markEpisode(watched=true) on a dropped show resumes it (explicit false + null date), keeps everything else', () => {
  D.markEpisode('tmdb:1', 1, 4, 40, true);
  assert.ok(isResumed('tmdb:1')); assert.equal(Object.keys(show('tmdb:1').watched).length, 4);
  assert.equal(show('tmdb:1').rating, 4); assert.ok(show('tmdb:1').notes['1x1']); assert.equal(show('tmdb:1').followed, true);
});
t('markEpisode(watched=false) (un-marking) does NOT resume', () => {
  D.markEpisode('tmdb:2', 1, 1, 40, false);
  assert.equal(show('tmdb:2').dropped, true); assert.equal(show('tmdb:2').droppedAt, '2026-08-02T00:00:00.000Z'); assert.equal(Object.keys(show('tmdb:2').watched).length, 2);
});
t('markSeason(watched=true) resumes; markSeason(false) and an empty season do not', () => {
  D.markSeason('tmdb:3', 1, [], true); assert.equal(show('tmdb:3').dropped, true, 'empty list = nothing watched');
  D.markSeason('tmdb:3', 1, [{ episode_number: 1, runtime: 40 }], false); assert.equal(show('tmdb:3').dropped, true, 'un-marking');
  D.markSeason('tmdb:3', 1, [{ episode_number: 8, runtime: 40 }, { episode_number: 9, runtime: 40 }], true); assert.ok(isResumed('tmdb:3'));
});
t('logEpisodeRewatch resumes and still bumps the rewatch count', () => {
  D.logEpisodeRewatch('tmdb:4', 1, 1, 40);
  assert.ok(isResumed('tmdb:4')); assert.equal(show('tmdb:4').watched['1x1'].n, 2);
});
t('marking an episode on a normal / already-resumed show adds no dropped keys and does not touch the flag', () => {
  D.markEpisode('tmdb:5', 1, 9, 40, true); assert.ok(!('dropped' in show('tmdb:5')) && !('droppedAt' in show('tmdb:5')));
  D.markEpisode('tmdb:6', 1, 9, 40, true); assert.equal(show('tmdb:6').dropped, false); assert.equal(show('tmdb:6').droppedAt, null);
});
t('no undefined is ever written (Firestore rejects it): every dropped/droppedAt is a boolean/string/null', () => {
  for (const s of Object.values(D.getState().shows)) {
    if ('dropped' in s) assert.ok(typeof s.dropped === 'boolean'); if ('droppedAt' in s) assert.ok(s.droppedAt === null || typeof s.droppedAt === 'string');
  }
  assert.ok(!JSON.stringify(D.getState()).includes('undefined'));
});
t('Undo: setShowDropped(id, true, originalDate) restores the ORIGINAL drop date; without a date it uses now', () => {
  D.setShowDropped('tmdb:1', true, '2026-08-01T00:00:00.000Z');
  assert.equal(show('tmdb:1').dropped, true); assert.equal(show('tmdb:1').droppedAt, '2026-08-01T00:00:00.000Z');
  D.setShowDropped('tmdb:1', false); assert.ok(isResumed('tmdb:1'));
  const before = Date.now(); D.setShowDropped('tmdb:1', true); assert.ok(Date.parse(show('tmdb:1').droppedAt) >= before - 5);
  D.setShowDropped('tmdb:1', true, 42); assert.ok(typeof show('tmdb:1').droppedAt === 'string', 'junk date ignored');
  D.setShowDropped('tmdb:1', false);
});
t('every resume marks the show dirty for cloud sync', () => {
  D.takeDirty(); D.setShowDropped('tmdb:2', true, '2026-08-02T00:00:00.000Z'); D.takeDirty();
  D.markEpisode('tmdb:2', 1, 7, 40, true); const d = D.takeDirty(); assert.ok(d.showIds.has('tmdb:2'));
});

// ------------------------------------------------------------ wipe helpers in db.js
t('wipeLibrary: clears shows + movies, KEEPS this device’s TMDB key, drops queued uploads/deletes', () => {
  D.markShowDirty('tmdb:5'); D.markMoviesDirty(); D.markShowDeleted('tmdb:6');
  D.wipeLibrary();
  assert.deepEqual(D.getState().shows, {}); assert.deepEqual(D.getState().movies, []); assert.equal(D.getState().settings.tmdbKey, 'KEY-123');
  const d = D.takeDirty(); assert.equal(d.showIds.size, 0); assert.equal(d.movies, false); assert.equal(d.deletedIds.size, 0);
  assert.deepEqual(JSON.parse(store.get('watchnext-state-v1')).shows, {}, 'persisted');
});
t('addTombstones: remembers many ids in one write, WITHOUT queueing cloud deletes; idempotent', () => {
  D.takeDirty(); D.addTombstones(['x:1', 'x:2', 'x:3']);
  assert.ok(D.isTombstoned('x:1') && D.isTombstoned('x:3')); assert.equal(D.takeDirty().deletedIds.size, 0);
  assert.deepEqual(JSON.parse(store.get('watchnext-tombstones-v1')).filter((i) => i.startsWith('x:')).sort(), ['x:1', 'x:2', 'x:3']);
  D.addTombstones(['x:1']); D.addTombstones([]); assert.ok(D.isTombstoned('x:2'));
});
t('resetAll (used by Delete everywhere on THIS device) clears the key too, like Delete all data', () => {
  D.resetAll(); assert.equal(D.getState().settings.tmdbKey, ''); assert.deepEqual(D.getState().shows, {});
});
console.log(`\n${n} tests passed`);
