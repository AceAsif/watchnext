import assert from 'node:assert/strict';
import * as T from '../../src/components/watchlistTimeLogic.js';
let n = 0; const t = (name, fn) => { fn(); n++; console.log('ok  -', name); };
const TODAY = '2026-10-22';

t('a show: only episodes that are out count, minus the ones you saw', () => {
  const s = { runtimeMin: 50, seasons: [{ n: 1, count: 8 }, { n: 2, count: 8, air: '2027-03-01' }], watched: { '1x1': { at: 'x' } } };
  assert.deepEqual(T.showTime(s, TODAY), { minutes: 7 * 50, eps: 7, coming: 8, guessed: false });
});
t('a season airing now: episodes from the next one to air are "not out yet"', () => {
  const s = { runtimeMin: 30, seasons: [{ n: 1, count: 10, air: '2026-10-01' }], nextAir: { date: '2026-10-29', season: 1, episode: 5 } };
  assert.deepEqual(T.showTime(s, TODAY), { minutes: 4 * 30, eps: 4, coming: 6, guessed: false });
});
t('no runtime: 40 min an episode, and it is marked a guess; no episode list: totalEpisodes is used', () => {
  assert.deepEqual(T.showTime({ totalEpisodes: 6 }, TODAY), { minutes: 240, eps: 6, coming: 0, guessed: true });
});
t('movies use their runtime, or 110 min as a guess', () => {
  assert.deepEqual(T.movieTime({ runtimeMin: 95 }), { minutes: 95, guessed: false });
  assert.deepEqual(T.movieTime({}), { minutes: 110, guessed: true });
});
t('the total adds shows and movies and counts episodes, unaired ones and guesses', () => {
  const tot = T.watchlistTotal([{ runtimeMin: 60, seasons: [{ n: 1, count: 10 }] }, { totalEpisodes: 2 }], [{ runtimeMin: 120 }, {}], TODAY);
  assert.deepEqual(tot, { minutes: 600 + 80 + 120 + 110, showMin: 680, movieMin: 230, shows: 2, movies: 2, eps: 12, coming: 0, guessed: 2 });
});
const NOW = Date.parse('2026-10-22T12:00:00Z');
const day = (d) => new Date(NOW - d * 86400000).toISOString();
t('your pace: minutes a day over the last 60 days, with imports left out', () => {
  const watched = {};
  for (let i = 1; i <= 30; i++) watched[`1x${i}`] = { at: day(i * 2), min: 60 }; // 30 hrs over 60 days = 30 min a day
  for (let i = 1; i <= 40; i++) watched[`2x${i}`] = { at: '2026-10-01T05:00:00.000Z', min: 60 }; // a TV Time import in one minute
  const p = T.yourPace({ shows: { a: { watched } }, movies: [] }, NOW);
  assert.equal(Math.round(p.perDay), 30); assert.equal(p.days, 30);
});
t('your pace counts movies, +1 watches and rewatch ticks; ignores watchlist movies and old watches', () => {
  const state = {
    shows: { a: { runtimeMin: 50, watched: { '1x1': { at: day(100), last: day(3), min: 50 } }, rewatch: { round: 2, done: { '1x1': day(2) } } } },
    movies: [{ watchedAt: day(1), runtimeMin: 100 }, { status: 'planned', watchedAt: day(1), runtimeMin: 999 }],
  };
  const p = T.yourPace(state, NOW);
  assert.equal(p.days, 3); assert.equal(Math.round(p.perDay), Math.round(200 / 7)); // under a week of history: averaged over 7 days
});
t('too little watching: no pace (a plain 2 hours a day is used instead)', () => {
  assert.equal(T.yourPace({ shows: {}, movies: [{ watchedAt: day(1), runtimeMin: 100 }] }, NOW), null);
  const est = T.finishEstimate(600, null, TODAY);
  assert.deepEqual(est, { days: 5, date: '2026-10-27', perDay: 120, yours: false });
  assert.equal(T.paceText(est), 'at 2 hrs a day');
});
t('finish estimate and headline: "≈ 23 days to finish everything"', () => {
  const est = T.finishEstimate(23 * 90 - 10, { perDay: 90, days: 20 }, TODAY);
  assert.equal(est.days, 23); assert.equal(T.headline(est), '≈ 23 days to finish everything');
  assert.equal(T.paceText(est), 'at your pace of 1 hr 30 min a day');
  assert.equal(T.headline({ days: 1 }), '≈ 1 day to finish everything');
  assert.equal(T.headline({ days: 900 }), '≈ 2 years to finish everything');
  assert.equal(T.headline({ days: 0 }), 'Nothing left to watch');
});
t('lengths read naturally', () => {
  assert.equal(T.fmtLength(45), '45 min'); assert.equal(T.fmtLength(60), '1 hr'); assert.equal(T.fmtLength(320), '5 hrs 20 min');
  assert.equal(T.fmtLength(24 * 60), '1 day'); assert.equal(T.fmtLength(54 * 60 + 20), '2 days 6 hrs');
  assert.equal(T.fmtShort(105), '1 hr 45 min'); assert.equal(T.fmtShort(420), '7 hrs'); assert.equal(T.fmtShort(30 * 60), '30 hrs'); assert.equal(T.fmtShort(100 * 60), '4 days');
});
console.log(`\n${n} watchlist time tests passed`);
