import assert from 'node:assert/strict';
const store = new Map();
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
const W1 = '2020-05-01T10:00:00.000Z';
const fin = () => ({ tmdbId: 1, name: 'Dark', followed: true, totalEpisodes: 3, seasons: [{ n: 1, count: 2 }, { n: 2, count: 1 }], watched: { '1x1': { at: W1, min: 50 }, '1x2': { at: W1, min: 50 }, '2x1': { at: '2020-06-01T10:00:00.000Z', min: 50, n: 1 } } });
store.set('watchnext-state-v1', JSON.stringify({ shows: { 'tmdb:1': fin(), 'tmdb:2': { name: 'Unwatched', followed: true, watched: {}, seasons: [{ n: 1, count: 3 }] } }, movies: [], settings: {} }));
const R = await import('../../src/components/rewatchModeLogic.js');
const D = await import('../../src/store/db.js');
const U = await import('../../src/components/upnextLogic.js');
let n = 0; const t = (name, fn) => { fn(); n++; console.log('ok  -', name); };
const T1 = '2026-10-20T10:00:00.000Z', T2 = '2026-10-21T10:00:00.000Z', TODAY = '2026-10-22';

t('startRewatch: round 2 on a watched show; not on an unwatched one; not twice', () => {
  const s = R.startRewatch(fin(), T1);
  assert.deepEqual(s.rewatch, { round: 2, started: T1, done: {} }); assert.equal(R.isRewatching(s), true);
  assert.equal(R.startRewatch(s, T2), s);
  const none = { watched: {} }; assert.equal(R.startRewatch(none, T1), none);
});
t('rewatchNext walks the episodes in order from the start, skipping ones done this round', () => {
  let s = R.startRewatch(fin(), T1);
  assert.deepEqual(R.rewatchNext(s, TODAY), { season: 1, episode: 1 });
  s = R.markInRound(s, 1, 1, true, T1);
  assert.deepEqual(R.rewatchNext(s, TODAY), { season: 1, episode: 2 });
});
t('markInRound keeps the FIRST watch date and adds one to the count; untick puts it back', () => {
  let s = R.startRewatch(fin(), T1);
  s = R.markInRound(s, 1, 1, true, T2);
  assert.equal(s.watched['1x1'].at, W1); assert.equal(s.watched['1x1'].n, 2); assert.equal(s.rewatch.done['1x1'], T2);
  assert.equal(R.markInRound(s, 1, 1, true, T2), s, 'ticking twice changes nothing');
  s = R.markInRound(s, 1, 1, false, T2);
  assert.equal(s.watched['1x1'].at, W1); assert.equal(s.watched['1x1'].n, 1); assert.equal(s.rewatch.done['1x1'], undefined);
});
t('an episode you never saw (it came out later) counts as a first watch; untick removes it again', () => {
  let s = R.startRewatch({ ...fin(), seasons: [{ n: 1, count: 3 }], totalEpisodes: 3, watched: { '1x1': { at: W1 } } }, T1);
  s = R.markInRound(s, 1, 3, true, T2);
  assert.equal(s.watched['1x3'].at, T2); assert.equal(s.watched['1x3'].n, 1);
  s = R.markInRound(s, 1, 3, false, T2); assert.equal(s.watched['1x3'], undefined);
});
t('progress, completion and ending: the round goes into the log; first dates untouched', () => {
  let s = R.startRewatch(fin(), T1);
  s = R.markInRound(R.markInRound(s, 1, 1, true, T1), 1, 2, true, T1);
  assert.deepEqual(R.rewatchProgress(s, TODAY), { done: 2, total: 3, left: 1 });
  assert.equal(R.roundLabel(s, TODAY), 'Rewatch #1 · 2 of 3');
  s = R.markInRound(s, 2, 1, true, T2);
  assert.equal(R.roundComplete(s, TODAY), true);
  s = R.endRewatch(s, T2);
  assert.equal(R.isRewatching(s), false); assert.equal('rewatch' in s, false);
  assert.deepEqual(s.rewatchLog, [{ round: 2, started: T1, finished: T2, eps: 3 }]);
  assert.equal(s.watched['1x1'].at, W1); assert.equal(s.watched['2x1'].n, 2);
  assert.equal(R.startRewatch(s, T2).rewatch.round, 3, 'the next rewatch is round 3');
});
t('ending with nothing rewatched leaves no log entry', () => {
  const s = R.endRewatch(R.startRewatch(fin(), T1), T2);
  assert.equal('rewatchLog' in s, false); assert.equal('rewatch' in s, false);
});
t('unaired episodes are not offered (a season still to come)', () => {
  let s = R.startRewatch({ ...fin(), seasons: [{ n: 1, count: 2 }, { n: 2, count: 2, air: '2027-01-01' }], totalEpisodes: 4 }, T1);
  s = R.markInRound(R.markInRound(s, 1, 1, true, T1), 1, 2, true, T1);
  // 2x1 was watched before, so it has aired; 2x2 has not
  s = R.markInRound(s, 2, 1, true, T1);
  assert.equal(R.rewatchNext(s, TODAY), null); assert.equal(R.roundComplete(s, TODAY), true);
});
t('latestWatch includes rewatch ticks (so the show counts as recently watched)', () => {
  const s = R.markInRound(R.startRewatch(fin(), T1), 1, 1, true, T2);
  assert.equal(R.latestWatch(s), T2); assert.equal(R.latestWatch(fin()), '2020-06-01T10:00:00.000Z');
});

t('db: start, tick in Up Next order, auto-finish on the last episode; dates kept; queues a sync', () => {
  D.takeDirty();
  D.startRewatch('tmdb:1'); assert.equal(D.getState().shows['tmdb:1'].rewatch.round, 2); assert.ok(D.takeDirty().showIds.has('tmdb:1'));
  const cont = () => U.buildUpNext(Object.entries(D.getState().shows), TODAY, { watchedCount: D.watchedCount, lastWatchDate: D.lastWatchDate }).cont;
  assert.deepEqual(cont().map((c) => [c.id, c.rewatch, c.next]), [['tmdb:1', true, { season: 1, episode: 1 }]]);
  assert.deepEqual(D.markRewatchEpisode('tmdb:1', 1, 1), { finished: false });
  D.markRewatchEpisode('tmdb:1', 1, 2);
  assert.deepEqual(D.markRewatchEpisode('tmdb:1', 2, 1), { finished: true });
  const s = D.getState().shows['tmdb:1'];
  assert.equal(R.isRewatching(s), false); assert.equal(s.rewatchLog.length, 1); assert.equal(s.watched['1x1'].at, W1);
  assert.deepEqual(cont(), [], 'a finished show leaves Up Next again');
});
t('db: replaceShow restores a record exactly (Undo); endRewatch stops early', () => {
  D.startRewatch('tmdb:1'); const before = D.getState().shows['tmdb:1'];
  D.markRewatchEpisode('tmdb:1', 1, 1); D.replaceShow('tmdb:1', before);
  assert.deepEqual(D.getState().shows['tmdb:1'], before);
  D.markRewatchEpisode('tmdb:1', 1, 1); D.endRewatch('tmdb:1');
  assert.equal(D.getState().shows['tmdb:1'].rewatchLog.length, 2); assert.equal(D.getState().shows['tmdb:1'].rewatchLog[1].eps, 1);
});
console.log(`\n${n} rewatch mode tests passed`);
