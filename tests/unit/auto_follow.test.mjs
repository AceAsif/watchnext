import assert from 'node:assert/strict';
// db.js reads localStorage when it loads, so provide a tiny in-memory one first.
const store = new Map();
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
const W = (from, to) => Object.fromEntries(Array.from({ length: to - from + 1 }, (_, i) => [`1x${from + i}`, { at: '2026-09-01T10:00:00.000Z', min: 40, n: 1 }]));
const base = (name, extra = {}) => ({ name, tmdbId: 1, totalEpisodes: 18, seasons: [{ n: 1, count: 18 }], runtimeMin: 25, ...extra });
store.set('watchnext-state-v1', JSON.stringify({ shows: {
  'tmdb:1': base('WatchlistOnly', { followed: false, watchlist: true, watched: {} }),
  'tmdb:2': base('WatchlistSeason', { followed: false, watchlist: true, watched: {} }),
  'tmdb:3': base('WatchlistRewatch', { followed: false, watchlist: true, watched: W(1, 2) }),
  'tmdb:4': base('Followed', { followed: true, watchlist: false, watched: W(1, 2) }),
  'tmdb:5': base('UnfollowedLeftover', { followed: false, watchlist: false, watched: W(1, 2) }),
  'tmdb:6': base('NothingWatched', { followed: false, watchlist: true, watched: {} }),
  // shows ticked before this rule existed
  'tmdb:7': base('StuckA', { followed: false, watchlist: true, watched: W(1, 4) }),
  'tmdb:8': base('StuckB', { watchlist: true, watched: W(1, 1) }),
  'tmdb:9': base('QueuedUntouched', { followed: false, watchlist: true, watched: {} }),
  'tmdb:10': base('LeftoverWithHistory', { followed: false, watchlist: false, watched: W(1, 3) }),
  'tmdb:11': base('DroppedFollowed', { followed: true, dropped: true, droppedAt: '2026-08-01T00:00:00.000Z', watched: W(1, 2) }),
}, movies: [], settings: {} }));
const D = await import('../../src/store/db.js');
let n = 0; const t = (name, fn) => { fn(); n++; console.log('ok  -', name); };
const show = (id) => D.getState().shows[id];

t('ticking an episode on a watchlist show follows it and takes it off the watchlist', () => {
  D.markEpisode('tmdb:1', 1, 1, 25, true);
  assert.equal(show('tmdb:1').followed, true); assert.equal(show('tmdb:1').watchlist, false);
  assert.ok(show('tmdb:1').watched['1x1']);
});
t('marking a season follows it too', () => {
  D.markSeason('tmdb:2', 1, [{ episode_number: 1, runtime: 25 }, { episode_number: 2, runtime: 25 }], true);
  assert.equal(show('tmdb:2').followed, true); assert.equal(show('tmdb:2').watchlist, false);
});
t('an extra watch (rewatch +1) and a rewatch-round tick follow it as well', () => {
  D.logEpisodeRewatch('tmdb:3', 1, 1, 25);
  assert.equal(show('tmdb:3').followed, true); assert.equal(show('tmdb:3').watchlist, false);
  assert.equal(show('tmdb:3').watched['1x1'].n, 2);
});
t('a show nobody followed (not even on the watchlist) is followed by ticking', () => {
  D.markEpisode('tmdb:5', 1, 3, 25, true);
  assert.equal(show('tmdb:5').followed, true); assert.equal(show('tmdb:5').watchlist, false);
});
t('un-ticking never follows, and an empty / un-mark season never follows', () => {
  D.markEpisode('tmdb:6', 1, 1, 25, false);
  assert.equal(show('tmdb:6').followed, false); assert.equal(show('tmdb:6').watchlist, true);
  D.markSeason('tmdb:6', 1, [], true);
  assert.equal(show('tmdb:6').followed, false, 'no episodes = nothing watched');
  D.markSeason('tmdb:6', 1, [{ episode_number: 1, runtime: 25 }], false);
  assert.equal(show('tmdb:6').followed, false);
});
t('an already-followed show keeps its record the same (no extra keys)', () => {
  const before = Object.keys(show('tmdb:4')).sort();
  D.markEpisode('tmdb:4', 1, 5, 25, true);
  assert.deepEqual(Object.keys(show('tmdb:4')).sort(), before);
  assert.equal(show('tmdb:4').followed, true); assert.equal(show('tmdb:4').watchlist, false);
});
t('a dropped, followed show is resumed as before and stays followed', () => {
  D.markEpisode('tmdb:11', 1, 3, 25, true);
  assert.equal(show('tmdb:11').dropped, false); assert.equal(show('tmdb:11').followed, true);
});
t('every auto-follow marks the show dirty for cloud sync', () => {
  D.takeDirty();
  D.markEpisode('tmdb:9', 1, 1, 25, true);
  assert.ok(D.takeDirty().showIds.has('tmdb:9'));
  assert.equal(show('tmdb:9').followed, true);
});
t('followWatchedShows: follows watchlist shows that already have watched episodes, nothing else', () => {
  D.takeDirty();
  const fixed = D.followWatchedShows();
  assert.equal(fixed, 2, 'StuckA and StuckB only');
  for (const id of ['tmdb:7', 'tmdb:8']) { assert.equal(show(id).followed, true); assert.equal(show(id).watchlist, false); }
  assert.equal(show('tmdb:10').followed, false, 'a deliberately unfollowed leftover is left alone');
  assert.equal(show('tmdb:10').watchlist, false);
  const dirty = D.takeDirty().showIds;
  assert.ok(dirty.has('tmdb:7') && dirty.has('tmdb:8') && !dirty.has('tmdb:10'));
});
t('followWatchedShows is safe to run again (fixes nothing the second time)', () => {
  assert.equal(D.followWatchedShows(), 0);
});
t('no undefined is ever written (Firestore rejects it)', () => {
  assert.ok(!JSON.stringify(D.getState()).includes('undefined'));
  for (const s of Object.values(D.getState().shows)) { assert.equal(typeof s.followed, 'boolean'); assert.equal(typeof s.watchlist === 'boolean' || s.watchlist === undefined, true); }
});
console.log(`\n${n} auto follow tests passed`);
