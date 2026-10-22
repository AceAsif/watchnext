process.env.TZ = 'Australia/Hobart';
import assert from 'node:assert/strict';
const C = await import('../../src/components/monthCompareLogic.js');
let n = 0; const t = (name, fn) => { fn(); n++; console.log('ok  -', name); };
// Local Hobart times (UTC+11 in Oct): 2025-10-05 20:00 local = 09:00Z
const L = (d, h = 20) => new Date(`${d}T${String(h).padStart(2, '0')}:00:00+11:00`).toISOString();
const shows = {
  a: { name: 'Dark', runtimeMin: 60, watched: {
    '1x1': { at: L('2025-10-05'), min: 60 }, '1x2': { at: L('2025-10-06'), min: 60 }, '1x3': { at: L('2025-10-28'), min: 60 },
    '2x1': { at: L('2026-10-03'), min: 60 }, '2x2': { at: L('2026-10-03'), min: 60 }, '2x3': { at: L('2026-10-20'), min: 60 },
    '2x4': { at: L('2022-07-04'), min: 60, n: 2, last: L('2026-10-21') },
  } },
  b: { name: 'Severance', runtimeMin: 50, watched: { '1x1': { at: L('2026-09-30', 23) } }, rewatch: { round: 2, done: {} } },
};
const movies = [{ name: 'Heat', watchedAt: L('2025-10-10'), runtimeMin: 170 }, { name: 'Up', status: 'planned', watchedAt: L('2026-10-01'), runtimeMin: 96 }];
const V = C.viewings(shows, movies);

t('viewings count each watch on its own local day: a +1 on its `last` day, a late-night watch on the local day', () => {
  assert.ok(V.some((v) => v[0] === '2026-10-21' && v[3] === 'a'), 'the +1');
  assert.ok(V.some((v) => v[0] === '2022-07-04'), 'the first watch stays');
  assert.ok(V.some((v) => v[0] === '2026-09-30' && v[3] === 'b'), '11pm local is still 30 Sep');
  assert.ok(!V.some((v) => v[1] === 'movie' && v[0] === '2026-10-01'), 'watchlist movies are not viewings');
});
t('a rewatch tick counts on its rewatch day', () => {
  const s = { x: { name: 'X', watched: { '1x1': { at: L('2020-01-01'), n: 2 } }, rewatch: { round: 2, done: { '1x1': L('2026-10-02') } } } };
  assert.deepEqual(C.viewings(s, []).map((v) => v[0]).sort(), ['2020-01-01', '2026-10-02']);
});
t('this month so far is compared with the SAME days last year (1–22), the whole month shown separately', () => {
  const c = C.compare(V, '2026-10', '2026-10-22');
  assert.equal(c.partial, true); assert.equal(c.nowLabel, 'Oct 1–22, 2026'); assert.equal(c.thenLabel, 'Oct 1–22, 2025');
  const row = (id) => c.rows.find((r) => r.id === id);
  assert.deepEqual([row('episodes').now, row('episodes').then], [4, 2]);
  assert.deepEqual([row('movies').now, row('movies').then], [0, 1]);
  assert.deepEqual([row('days').now, row('days').then], [3, 3]);
  assert.deepEqual([row('hours').now, row('hours').then], [4, 5]); // 240 min vs 290 min
  assert.equal(row('episodes').pct, 100); assert.equal(row('movies').pct, -100);
  assert.deepEqual(c.thenFull, { label: 'October 2025', episodes: 3, hours: 6, movies: 1 });
  assert.equal(c.headline, '17% less than October 2025 at this point');
  assert.deepEqual(c.now.top, { name: 'Dark', count: 4 });
});
t('a past month is compared in full', () => {
  const c = C.compare(V, '2025-10', '2026-10-22');
  assert.equal(c.partial, false); assert.equal(c.nowLabel, 'October 2025'); assert.equal(c.thenLabel, 'October 2024');
  assert.equal(c.thenFull, null); assert.equal(c.headline, 'You didn’t watch anything in October 2024');
});
t('29 February is compared with 28 February', () => {
  const v = [['2024-02-29', 'ep', 60, 'a', 'A'], ['2023-02-28', 'ep', 60, 'a', 'A']];
  const c = C.compare(v, '2024-02', '2024-02-29');
  assert.equal(c.thenLabel, 'Feb 1–28, 2023'); assert.equal(c.headline, 'About the same as February 2023 at this point');
});
t('headlines: more, less, "2× as much", nothing yet', () => {
  assert.equal(C.headline(150, 100, true, '2025-10'), '50% more than October 2025 at this point');
  assert.equal(C.headline(300, 100, false, '2025-10'), '3× as much as October 2025');
  assert.equal(C.headline(250, 100, false, '2025-10'), '2.5× as much as October 2025');
  assert.equal(C.headline(0, 120, true, '2025-10'), 'Nothing yet this month · 2 hrs in October 2025 at this point');
});
t('months to pick: this month first, then months that have a year of history before them', () => {
  assert.deepEqual(C.compareMonths(V, '2026-10'), ['2026-10', '2026-09', '2025-10']); // history starts July 2022
  assert.deepEqual(C.compareMonths(V.filter((v) => v[0] > '2023'), '2026-10'), ['2026-10']); // history from Oct 2025: only this month
});
t('change text: "+2", "−1", "same"', () => {
  assert.equal(C.diffText(2), '+2'); assert.equal(C.diffText(-1), '−1'); assert.equal(C.diffText(0), 'same');
});
console.log(`\n${n} month compare tests passed`);
