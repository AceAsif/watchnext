process.env.TZ = 'Australia/Hobart';
import assert from 'node:assert/strict';
import * as M from '../../src/components/monthRecapLogic.js';
import * as Y from '../../src/components/yearImageLogic.js';
let n = 0; const t = (name, fn) => { fn(); n++; console.log('ok  -', name); };
const w = (at, extra = {}) => ({ at, min: 40, n: 1, ...extra });
const show = (name, watched, extra = {}) => ({ name, poster: '/' + name + '.jpg', genres: ['Drama'], watched, ...extra });

t('local month boundaries in Hobart: an 8am watch on 1 Oct is OCTOBER (UTC would say September); 23:59 on 30 Sep stays September', () => {
  assert.equal(M.monthKeyOf('2026-09-30T14:00:00.000Z'), '2026-10'); // 00:00 1 Oct, AEST (+10)
  assert.equal(M.monthKeyOf('2026-09-30T13:59:59.000Z'), '2026-09');
  assert.equal(M.monthKeyOf('2026-10-01T22:00:00.000Z'), '2026-10'); // 08:00 on 2 Oct
  assert.equal(M.monthKeyOf('2026-03-31T13:00:00.000Z'), '2026-04'); // 00:00 1 Apr, still daylight time (+11)
  assert.equal(M.monthKeyOf('2026-03-31T12:59:00.000Z'), '2026-03');
  assert.equal(M.monthKeyOf('2025-12-31T13:30:00.000Z'), '2026-01'); // new year, local
  assert.equal(M.monthKeyOf('2026-05-05'), '2026-05'); // date-only values pass through
  for (const bad of ['', null, undefined, 'junk']) assert.equal(M.monthKeyOf(bad), '');
});
t('names, labels and the previous month (including January -> December of last year)', () => {
  assert.equal(M.monthName('2026-09'), 'September'); assert.equal(M.monthLabel('2026-01'), 'January 2026'); assert.equal(M.monthLabel('nope'), '');
  assert.equal(M.prevMonth('2026-03'), '2026-02'); assert.equal(M.prevMonth('2026-01'), '2025-12'); assert.equal(M.prevMonth('x'), '');
  assert.equal(M.currentMonthKey(new Date(2026, 9, 4)), '2026-10');
});

const SHOWS = {
  a: show('Suits', { '1x1': w('2026-09-02T12:00:00.000Z'), '1x2': w('2026-09-02T14:00:00.000Z'), '1x3': w('2026-09-05T02:00:00.000Z', { n: 3 }), '1x4': w('2026-09-30T14:30:00.000Z') }, { genres: ['Drama', 'Legal'] }),
  b: show('Office', { '1x1': w('2026-09-10T10:00:00.000Z', { min: 22 }), '1x2': w('2026-08-20T10:00:00.000Z', { min: 22 }), '1x3': w('2026-08-21T10:00:00.000Z', { min: 22 }) }, { genres: ['Comedy'] }),
  c: show('Quiet', { '1x1': { min: 40 }, '1x2': null, 'junk': 5 }),
};
const MOVIES = [
  { name: 'Dune', status: 'watched', watchedAt: '2026-09-12T08:00:00.000Z', runtimeMin: 150 },
  { name: 'NoRuntime', status: 'watched', watchedAt: '2026-09-13T08:00:00.000Z' },
  { name: 'Planned', status: 'planned', watchedAt: '2026-09-14T08:00:00.000Z', runtimeMin: 100 },
  { name: 'Aug film', watchedAt: '2026-08-02T08:00:00.000Z', runtimeMin: 90 },
];
const months = M.collectMonths(SHOWS, MOVIES);

t('collect: the 14:30Z watch on 30 Sep lands in OCTOBER; Aug / Sep / Oct are the months with activity, newest first', () => {
  assert.deepEqual(M.monthList(months), ['2026-10', '2026-09', '2026-08']);
  assert.equal(months['2026-10'].episodes, 1);
});
t('review (September): episodes count every viewing (n), hours = TV + movie minutes, Days = distinct local days, movies exclude planned', () => {
  const r = M.monthReview(months, '2026-09', '2026-10');
  assert.equal(r.episodes, 1 + 1 + 3 + 1); // Suits 1x1, 1x2, 1x3 (n=3), Office 1x1
  assert.equal(r.hours, Math.round((40 + 40 + 120 + 22 + 150 + 110) / 60)); // NoRuntime film defaults to 110 min
  assert.equal(r.movies, 2); assert.equal(r.partial, false); assert.equal(r.name, 'September'); assert.equal(r.yearNum, 2026);
  const days = new Set(['2026-09-02', '2026-09-03' /* 14:00Z is midnight on the 3rd in Hobart */, '2026-09-05', '2026-09-10', '2026-09-12', '2026-09-13']); assert.equal(r.activeDays, days.size);
});
t('top shows: by episodes in THAT month (ties by name), max 3, with poster; top genre weighted by episodes', () => {
  const r = M.monthReview(months, '2026-09', '2026-10');
  assert.deepEqual(r.topShows.map((s) => [s.name, s.count, s.poster]), [['Suits', 5, '/Suits.jpg'], ['Office', 1, '/Office.jpg']]);
  assert.equal(r.topGenre, 'Drama'); // Drama 5, Legal 5, Comedy 1: tie -> alphabetical
});
t('facts: busiest LOCAL day (weekday + date + episode count); ties go to the earlier day; Top genre second', () => {
  const r = M.monthReview(months, '2026-09', '2026-10');
  assert.deepEqual(r.facts[0], ['BUSIEST DAY', 'Sat 5 Sep · 3 eps']); // 02:00Z on the 5th = 12:00 local the 5th (a Saturday); n=3
  assert.deepEqual(r.facts[1], ['TOP GENRE', 'Drama']); assert.deepEqual(r.busiestDay, { date: '2026-09-05', label: 'Sat 5 Sep', episodes: 3 });
  const tie = M.monthReview(M.collectMonths({ a: show('T', { '1x1': w('2026-05-20T10:00:00.000Z'), '1x2': w('2026-05-03T10:00:00.000Z') }) }, []), '2026-05');
  assert.equal(tie.busiestDay.date, '2026-05-03'); assert.match(tie.facts[0][1], /1 ep$/);
});
t('delta vs the previous month: % change and the wording slot; none when last month was empty; January compares with December and names the year', () => {
  const sep = M.monthReview(months, '2026-09', '2026-10'); assert.equal(sep.epDelta, Math.round(((6 - 2) / 2) * 100)); assert.equal(sep.prevYear, 'August');
  assert.equal(M.monthReview(months, '2026-08', '2026-10').epDelta, null); assert.equal(M.monthReview(months, '2026-08', '2026-10').prevYear, null);
  const jan = M.collectMonths({ a: show('X', { '1x1': w('2025-12-10T10:00:00.000Z'), '1x2': w('2025-12-11T10:00:00.000Z'), '1x3': w('2026-01-10T10:00:00.000Z') }) }, []);
  const r = M.monthReview(jan, '2026-01'); assert.equal(r.prevYear, 'December 2025'); assert.equal(r.epDelta, -50);
  assert.equal(Y.deltaLine(r).text, '▼ 50% fewer episodes than December 2025'); // the Year card's own wording helper works unchanged
});
t('partial month (the current one) is flagged; caption / sub / share line say "so far"', () => {
  const r = M.monthReview(months, '2026-10', '2026-10'); assert.equal(r.partial, true);
  assert.equal(M.monthCaption(r), 'MONTH IN REVIEW · 2026 · SO FAR'); assert.equal(M.monthSub(r), '2026 · so far');
  assert.match(M.monthShareLine(r), /^My October 2026 so far on WatchNext:/);
  const f = M.monthReview(months, '2026-09', '2026-10'); assert.equal(M.monthCaption(f), 'MONTH IN REVIEW · 2026'); assert.equal(M.monthSub(f), '2026');
  assert.equal(M.monthShareLine(f), 'My September 2026 on WatchNext: 6 episodes (8 hrs) + 2 movies. Top show: Suits. Busiest day: Sat 5 Sep.');
});
t('a movies-only month works: no top shows, no busiest day, no genre, zero episodes, no delta', () => {
  const m = M.collectMonths({}, [{ name: 'F', watchedAt: '2026-06-06T10:00:00.000Z', runtimeMin: 120 }]); const r = M.monthReview(m, '2026-06');
  assert.deepEqual([r.episodes, r.movies, r.hours, r.activeDays, r.topShows.length, r.busiestDay, r.topGenre, r.epDelta], [0, 1, 2, 1, 0, null, null, null]); assert.deepEqual(r.facts, []);
});
t('unknown / empty months give null; options are labelled newest first', () => {
  assert.equal(M.monthReview(months, '2026-07'), null); assert.equal(M.monthReview(months, 'nope'), null); assert.equal(M.monthReview({}, '2026-09'), null);
  assert.deepEqual(M.monthOptions(M.monthList(months)).map((o) => o.label), ['October 2026', 'September 2026', 'August 2026']);
});
t('fits the Year image plan: no overlap with the footer for a full month, and facts feed the shared planner', () => {
  const r = M.monthReview(months, '2026-09', '2026-10'); const p = Y.planYearImage(r);
  assert.deepEqual(p.facts.map((f) => f[0]), ['BUSIEST DAY', 'TOP GENRE']); assert.ok(p.bottom < p.footerRule - 24); assert.equal(p.delta.up, true);
});
t('junk input never throws; inputs are not mutated', () => {
  for (const bad of [undefined, null, {}, [], 'x']) assert.deepEqual(M.collectMonths(bad, bad), {});
  assert.deepEqual(M.collectMonths({ a: null, b: { watched: { '1x1': { at: 'garbage', n: 'x' } } }, __proto__: { c: 1 } }, [null, 5, {}]), {});
  const a = JSON.stringify(SHOWS), b = JSON.stringify(MOVIES); M.collectMonths(SHOWS, MOVIES); assert.equal(JSON.stringify(SHOWS), a); assert.equal(JSON.stringify(MOVIES), b);
});
t('odd counts: n of 0 / NaN / 2.9 behave like the Year card (at least 1, whole numbers)', () => {
  const m = M.collectMonths({ a: show('X', { '1x1': w('2026-04-01T10:00:00.000Z', { n: 0 }), '1x2': w('2026-04-01T11:00:00.000Z', { n: NaN }), '1x3': w('2026-04-01T12:00:00.000Z', { n: 2.9 }) }) }, []);
  assert.equal(m['2026-04'].episodes, 1 + 1 + 2);
});
t('scale: 20,000 watches over ~3.5 years in well under a second', () => {
  const big = { a: show('Big', Object.fromEntries(Array.from({ length: 20000 }, (_, i) => [`${1 + (i / 500 | 0)}x${1 + (i % 500)}`, w(new Date(Date.UTC(2021, 0, 1) + i * 5400e3).toISOString())]))) };
  const t0 = Date.now(); const mm = M.collectMonths(big, []); assert.ok(Date.now() - t0 < 1500, String(Date.now() - t0)); const nm = M.monthList(mm).length; assert.ok(nm >= 40 && nm <= 43, 'months: ' + nm); // 20,000 x 1.5 h = ~1,250 days
});
console.log(`\n${n} tests passed`);
