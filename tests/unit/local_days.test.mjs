// Stats days are YOUR local days, not UTC days. Runs in Hobart time (UTC+11 in summer, +10 in winter),
// where a watch before 10–11am is "yesterday" in UTC.
process.env.TZ = 'Australia/Hobart';
import assert from 'node:assert/strict';
const { localDate } = await import('../../src/components/csvExport.js');
const { computeMetrics, longestStreak } = await import('../../src/components/achievementsLogic.js');
const { yourPace } = await import('../../src/components/watchlistTimeLogic.js');
const { collectMonths } = await import('../../src/components/monthRecapLogic.js');

let n = 0; const t = (name, fn) => { fn(); n++; console.log('ok  -', name); };

t('a 1:30am watch in Hobart is that day, not yesterday (UTC)', () => {
  assert.equal(localDate('2026-10-25T14:30:00.000Z'), '2026-10-26'); // 1:30am 26 Oct AEDT
  assert.equal(localDate('2026-10-25T12:30:00.000Z'), '2026-10-25'); // 11:30pm 25 Oct
  assert.equal(localDate('2026-07-01T13:00:00.000Z'), '2026-07-01'); // 11pm, winter (+10)
  assert.equal(localDate('2026-07-01T14:30:00.000Z'), '2026-07-02'); // 12:30am, winter
  assert.equal(localDate('2026-10-26'), '2026-10-26'); assert.equal(localDate('junk'), ''); assert.equal(localDate(''), '');
});
t('New Year: 1am on 1 Jan counts in the new year', () => {
  assert.equal(localDate('2025-12-31T14:00:00.000Z').slice(0, 4), '2026');
});
const show = (ats) => ({ name: 'S', followed: true, watched: Object.fromEntries(ats.map((at, i) => [`1x${i + 1}`, { at, min: 30 }])) });
t('badge streak uses local days', () => {
  // 9pm 23 Oct (10:00Z), 1am 25 Oct (24th 14:00Z), 9pm 25 Oct: UTC days 23, 24, 25 (a 3-day run),
  // but your days are 23, 25, 25, so no run at all.
  const m1 = computeMetrics({ shows: { a: show(['2026-10-23T10:00:00.000Z', '2026-10-24T14:00:00.000Z', '2026-10-25T10:00:00.000Z']) }, movies: [] });
  assert.equal(m1.streak, 1);
  // 1am on the 24th, 25th and 26th, and a film at 1am on the 27th: four days in a row
  const m2 = computeMetrics({ shows: { a: show(['2026-10-23T14:00:00.000Z', '2026-10-24T14:00:00.000Z', '2026-10-25T14:00:00.000Z']) }, movies: [{ name: 'M', status: 'watched', watchedAt: '2026-10-26T14:00:00.000Z' }] });
  assert.equal(m2.streak, 4);
  assert.equal(longestStreak(['2026-10-24', '2026-10-25', '2026-10-27']), 2);
});
t('Watchlist pace counts local days with watching', () => {
  const now = Date.parse('2026-10-26T09:00:00.000Z');
  // three different local evenings, all within the window
  const s = show(['2026-10-20T10:00:00.000Z', '2026-10-21T10:00:00.000Z', '2026-10-22T10:00:00.000Z']);
  assert.equal(yourPace({ shows: { a: s }, movies: [] }, now).days, 3);
  // 9pm 20 Oct and 1am 21 Oct local (20th 14:00Z): UTC sees one day (the 20th), local sees two
  const s2 = show(['2026-10-20T10:00:00.000Z', '2026-10-20T14:00:00.000Z', '2026-10-22T10:00:00.000Z']);
  assert.equal(yourPace({ shows: { a: s2 }, movies: [] }, now).days, 3);
});
t('Month in review agrees: a 1am watch on 1 Nov is November', () => {
  const m = collectMonths({ a: show(['2026-10-31T14:00:00.000Z']) }, []);
  assert.deepEqual(Object.keys(m), ['2026-11']);
});
console.log(`\n${n} local days tests passed`);
