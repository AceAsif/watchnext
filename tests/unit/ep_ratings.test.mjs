import assert from 'node:assert/strict';
const store = new Map();
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
store.set('watchnext-state-v1', JSON.stringify({ shows: { 'tmdb:1': { tmdbId: 1, name: 'Dark', watched: { '1x1': { at: '2026-01-01T10:00:00Z' } }, seasons: [{ n: 1, count: 10 }, { n: 2, count: 8 }] } }, movies: [], settings: {} }));
const R = await import('../../src/store/epRatings.js');
const L = await import('../../src/components/epRatingsLogic.js');
const D = await import('../../src/store/db.js');
const { mergeBackup } = await import('../../src/store/backupMerge.js');
const { computeMetrics } = await import('../../src/components/achievementsLogic.js');
let n = 0; const t = (name, fn) => { fn(); n++; console.log('ok  -', name); };
const T1 = '2026-10-01T00:00:00.000Z', T2 = '2026-10-02T00:00:00.000Z';

t('setRatingIn: half steps kept, junk rounded or refused, 0 removes, last one removed -> undefined', () => {
  let m = R.setRatingIn(undefined, '1x3', 4.5, ' Secrets ', T1);
  assert.deepEqual(m, { '1x3': { r: 4.5, at: T1, t: 'Secrets' } });
  m = R.setRatingIn(m, '1x4', 3.3, '', T1); assert.equal(m['1x4'].r, 3.5); assert.equal('t' in m['1x4'], false);
  m = R.setRatingIn(m, '1x3', 2, '', T2); assert.deepEqual(m['1x3'], { r: 2, at: T2, t: 'Secrets' }, 'a re-rate keeps the remembered title');
  assert.deepEqual(R.setRatingIn(m, 'bad', 4, '', T1), m, 'a bad key changes nothing');
  assert.equal(Object.keys(R.setRatingIn(m, '__proto__', 4, '', T1)).includes('__proto__'), false);
  m = R.setRatingIn(m, '1x4', 0, '', T2); m = R.setRatingIn(m, '1x3', 0, '', T2);
  assert.equal(m, undefined);
});
t('withEpRatings never writes undefined', () => {
  assert.equal('epRatings' in R.withEpRatings({ name: 'x', epRatings: { a: 1 } }, undefined), false);
  assert.deepEqual(R.withEpRatings({ name: 'x' }, { '1x1': { r: 3 } }).epRatings, { '1x1': { r: 3 } });
});
t('mergeEpRatings: union; newer rating wins; junk from a file is dropped', () => {
  const mine = { '1x1': { r: 4, at: T1 }, '1x2': { r: 2, at: T2, t: 'Mine' } };
  const theirs = { '1x1': { r: 5, at: T2, t: 'Pilot' }, '1x2': { r: 5, at: T1 }, '1x3': { r: 3 }, '1x4': { r: 'lots' }, nope: { r: 4 }, '2x1': { r: 9, at: 'x' } };
  const m = R.mergeEpRatings(mine, theirs);
  assert.deepEqual(m['1x1'], { r: 5, at: T2, t: 'Pilot' });
  assert.deepEqual(m['1x2'], { r: 2, at: T2, t: 'Mine' });
  assert.deepEqual(m['1x3'], { r: 3 });
  assert.deepEqual(m['2x1'], { r: 5 });
  assert.equal(m['1x4'], undefined); assert.equal(m.nope, undefined);
  assert.equal(R.mergeEpRatings(undefined, null), undefined);
});
t('db.setEpisodeRating: saves on the show, queues a sync, survives un-marking the episode', () => {
  D.takeDirty();
  D.setEpisodeRating('tmdb:1', '1x1', 4.5, 'Secrets');
  assert.deepEqual(D.getState().shows['tmdb:1'].epRatings['1x1'].r, 4.5);
  assert.ok(D.takeDirty().showIds.has('tmdb:1'));
  D.markEpisode('tmdb:1', 1, 1, 50, false);
  assert.equal(R.ratingOf(D.getState().shows['tmdb:1'], '1x1'), 4.5);
  D.setEpisodeRating('tmdb:1', '1x1', 0); assert.equal('epRatings' in D.getState().shows['tmdb:1'], false);
  D.setEpisodeRating('no-such-show', '1x1', 4); // ignored, no crash
});
t('backup restore: ratings from the file merge in (newer wins) and are cleaned; a new show from the file is cleaned too', () => {
  const local = { shows: { 'tmdb:1': { name: 'Dark', watched: {}, epRatings: { '1x1': { r: 3, at: T1 } } } }, movies: [] };
  const backup = { shows: { 'tmdb:1': { name: 'Dark', watched: {}, epRatings: { '1x1': { r: 5, at: T2 }, '1x2': { r: 4 } } }, 'tmdb:2': { name: 'New', watched: {}, epRatings: { '1x1': { r: 2.5 }, bad: { r: 5 }, '1x2': { r: 0 } } } }, movies: [], settings: {} };
  const r = mergeBackup(local, backup);
  assert.deepEqual(r.shows['tmdb:1'].epRatings, { '1x1': { r: 5, at: T2 }, '1x2': { r: 4 } });
  assert.deepEqual(r.shows['tmdb:2'].epRatings, { '1x1': { r: 2.5 } });
  const again = mergeBackup({ shows: r.shows, movies: [] }, backup);
  assert.equal(again.summary.showsUpdated, 0, 'restoring the same file twice changes nothing');
});
const show = { seasons: [{ n: 1, count: 10 }, { n: 2, count: 8 }], epRatings: { '2x3': { r: 5, t: 'Finale-ish' }, '1x1': { r: 3 }, '1x9': { r: 5, t: 'Big twist' }, '1x5': { r: 4 }, '3x2': { r: 2 }, junk: { r: 5 } } };
t('ratedEpisodes: season/episode order, junk keys skipped', () => {
  assert.deepEqual(L.ratedEpisodes(show).map(L.epCode), ['S1E1', 'S1E5', 'S1E9', 'S2E3', 'S3E2']);
  assert.deepEqual(L.ratedEpisodes({}), []);
});
t('bestEpisode: highest rating, earliest wins a tie, ties counted', () => {
  const b = L.bestEpisode(L.ratedEpisodes(show));
  assert.equal(L.epCode(b.ep), 'S1E9'); assert.equal(b.ep.t, 'Big twist'); assert.equal(b.ties, 1);
  assert.equal(L.bestEpisode([]), null);
});
t('seasonLines: one per rated season, average to 1 decimal, x axis uses the season length', () => {
  const lines = L.seasonLines(L.ratedEpisodes(show), show.seasons);
  assert.deepEqual(lines.map((l) => [l.n, l.count, l.points.length, l.avg]), [[1, 10, 3, 4], [2, 8, 1, 5], [3, 2, 1, 2]]);
  assert.equal(lines[0].best.e, 9);
});
t('chartGeometry: E1 at the left, last episode at the right, 5 stars at the top; one dot = no line', () => {
  const [s1, s2] = L.seasonLines(L.ratedEpisodes(show), show.seasons);
  const g = L.chartGeometry(s1, 320, 96, 12);
  assert.equal(g.dots[0].x, 12); assert.equal(g.dots[0].y, 44); // 3 stars: 12 + (2 / 4.5) × 72
  assert.equal(g.dots[2].y, 12); // 5 stars at the top
  assert.ok(g.dots[2].x < 308 && g.dots[2].x > 270);
  assert.match(g.path, /^M12 44L/);
  assert.equal(L.chartGeometry(s2).path, '');
  assert.equal(L.chartGeometry({ count: 1, points: [{ e: 1, r: 4 }] }, 320).dots[0].x, 160);
  assert.deepEqual(g.grid.map((x) => x.label), ['5', '3', '1']);
});
t('Achievements: episode ratings count towards Critic', () => {
  const m = computeMetrics({ shows: { a: { watched: { '1x1': {} }, rating: 4, epRatings: { '1x1': { r: 4 }, '1x2': { r: 1 } } } }, movies: [{ name: 'X', rating: 3, watchedAt: T1 }] }, {});
  assert.equal(m.critic, 4);
});
console.log(`\n${n} episode rating tests passed`);
