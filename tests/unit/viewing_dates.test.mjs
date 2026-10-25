process.env.TZ = 'Australia/Hobart';
import assert from 'node:assert/strict';
import { viewingDates, doneDates } from '../../src/components/viewingDates.js';
import { collectMonths, monthReview } from '../../src/components/monthRecapLogic.js';
import { viewings, totals } from '../../src/components/monthCompareLogic.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('ok  -', name); };
const at = (v) => v.map((x) => x.at);

t('one viewing: the first watch only', () => {
  assert.deepEqual(viewingDates({ at: '2026-10-02T10:00:00Z' }), [{ at: '2026-10-02T10:00:00Z', own: true }]);
});
t('a "+1" counts on its own date (last), the first watch keeps its date', () => {
  assert.deepEqual(at(viewingDates({ at: '2019-07-04T10:00:00Z', n: 2, last: '2026-10-10T09:00:00Z' })), ['2019-07-04T10:00:00Z', '2026-10-10T09:00:00Z']);
});
t('a rewatch-mode tick counts on its done date', () => {
  assert.deepEqual(at(viewingDates({ at: '2019-07-04T10:00:00Z', n: 2 }, '2026-10-12T09:00:00Z')), ['2019-07-04T10:00:00Z', '2026-10-12T09:00:00Z']);
});
t('rewatch tick and "+1" together; extras without a date go on the first date (marked own:false)', () => {
  const v = viewingDates({ at: '2019-07-04T10:00:00Z', n: 4, last: '2026-10-20T09:00:00Z' }, '2026-10-12T09:00:00Z');
  assert.deepEqual(v, [
    { at: '2019-07-04T10:00:00Z', own: true }, { at: '2026-10-12T09:00:00Z', own: true },
    { at: '2026-10-20T09:00:00Z', own: true }, { at: '2019-07-04T10:00:00Z', own: false },
  ]);
});
t('n = 1 ignores a stray done/last date (no extra viewing)', () => {
  assert.equal(viewingDates({ at: '2019-07-04T10:00:00Z', n: 1, last: '2026-10-20T09:00:00Z' }, '2026-10-12T09:00:00Z').length, 1);
});
t('bad data: no date or a junk date gives nothing; junk done/last dates are ignored', () => {
  assert.deepEqual(viewingDates(null), []); assert.deepEqual(viewingDates({}), []); assert.deepEqual(viewingDates({ at: 'soon' }), []);
  assert.deepEqual(at(viewingDates({ at: '2019-07-04T10:00:00Z', n: 2, last: 'x' }, 5)), ['2019-07-04T10:00:00Z', '2019-07-04T10:00:00Z']);
  assert.deepEqual(doneDates(null), {}); assert.deepEqual(doneDates({ rewatch: { done: [1] } }), {});
});

// Boss's case: Stranger Things S4 first watched in 2022 (dates brought back from a backup),
// rewatched in October 2026 — 9 episodes, some with "+1", some in Rewatch mode.
const W = {};
for (let e = 1; e <= 9; e++) W[`4x${e}`] = { at: `2022-07-0${Math.min(e, 9)}T10:00:00Z`, n: 2, min: 70, ...(e <= 4 ? { last: `2026-10-0${e + 1}T09:00:00Z` } : {}) };
const DONE = {}; for (let e = 5; e <= 9; e++) DONE[`4x${e}`] = `2026-10-${10 + e}T09:00:00Z`;
const SHOWS = {
  'tmdb:66732': { name: 'Stranger Things', poster: '/st.jpg', genres: ['Drama'], watched: W, rewatch: { round: 2, started: '2026-10-05T00:00:00Z', done: DONE } },
  'tmdb:1': { name: 'Suits', genres: ['Drama'], watched: { '9x1': { at: '2026-10-01T09:00:00Z', min: 40 }, '9x2': { at: '2026-10-01T10:00:00Z', min: 40 } } },
};

t('Month in review: the October rewatch counts in October 2026, and Stranger Things is the top show', () => {
  const months = collectMonths(SHOWS, []);
  const oct = months['2026-10'];
  assert.equal(oct.episodes, 11); // 9 rewatched + 2 Suits
  assert.equal(oct.perShow['tmdb:66732'].count, 9);
  const r = monthReview(months, '2026-10', '2026-10');
  assert.equal(r.topShows[0].name, 'Stranger Things');
});
t('…and the first watches still count in July 2022, once each', () => {
  assert.equal(collectMonths(SHOWS, [])['2022-07'].episodes, 9);
});
t('Month in review and "This month vs last year" now agree for every month', () => {
  const months = collectMonths(SHOWS, []);
  const views = viewings(SHOWS, []);
  for (const ym of Object.keys(months)) {
    const a = months[ym]; const b = totals(views, ym, 31);
    assert.equal(a.episodes, b.episodes, ym); assert.equal(a.days.size, b.days, ym);
  }
});
console.log(`\n${n} viewing date tests passed`);
