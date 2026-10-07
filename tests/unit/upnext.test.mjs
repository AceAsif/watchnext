process.env.TZ = 'Australia/Hobart';   // the user's timezone; set before any Date is used
import assert from 'node:assert/strict';
import { localISODate } from '../../src/components/showLogic.js';
import * as U from '../../src/components/upnextLogic.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('ok  -', name); };

// ---- the helpers db.js exports (copied verbatim in behaviour)
const h = {
  watchedCount: (s) => Object.keys(s.watched || {}).length,
  lastWatchDate: (s) => { let l = null; for (const w of Object.values(s.watched || {})) if (w.at && (!l || w.at > l)) l = w.at; return l; },
};
const W = (s, from, to, at = '2026-09-20T10:00:00.000Z') => Object.fromEntries(Array.from({ length: to - from + 1 }, (_, i) => [`${s}x${from + i}`, { at, n: 1 }]));
const TODAY = '2026-10-01';

// =============================== local date
t('TZ sanity: this run really is Hobart (UTC+10 on 1 Oct, before DST starts 4 Oct)', () => {
  assert.equal(new Date('2026-10-01T00:00:00Z').getHours(), 10);
});
t('localISODate vs the old UTC shortcut at 7am Hobart: local says 2 Oct, UTC says 1 Oct (the bug)', () => {
  const d = new Date('2026-10-01T21:00:00Z'); // = 2 Oct 07:00 in Hobart
  assert.equal(localISODate(d), '2026-10-02');
  assert.equal(d.toISOString().slice(0, 10), '2026-10-01');
});
t('localISODate: zero-pads month/day and uses the local calendar day', () => {
  assert.equal(localISODate(new Date(2026, 0, 5, 23, 59)), '2026-01-05');
  assert.equal(localISODate(new Date(2026, 11, 31, 0, 0)), '2026-12-31');
});

// =============================== date helpers
t('daysBetween: same day / forward / backward / month & year boundaries', () => {
  assert.equal(U.daysBetween('2026-10-01', '2026-10-01'), 0);
  assert.equal(U.daysBetween('2026-10-01', '2026-10-03'), 2);
  assert.equal(U.daysBetween('2026-10-03', '2026-10-01'), -2);
  assert.equal(U.daysBetween('2026-09-30', '2026-10-01'), 1);
  assert.equal(U.daysBetween('2026-12-31', '2027-01-01'), 1);
});
t('daysBetween: not thrown by DST (Hobart clocks change 4 Oct) — still whole days', () => {
  assert.equal(U.daysBetween('2026-10-03', '2026-10-05'), 2);
  assert.equal(U.daysBetween('2026-10-01', '2026-10-08'), 7);
  assert.equal(U.daysBetween('2027-04-03', '2027-04-05'), 2); // DST ends
});
t('daysBetween: invalid input => null', () => {
  for (const [a, b] of [['x', '2026-10-01'], ['2026-10-01', ''], [null, undefined], ['2026-13-01', '2026-10-01'], ['2026-10-32', '2026-10-01']]) assert.equal(U.daysBetween(a, b), null);
});
t('dateParts: weekday is right (30 Sep 2026 is a Wednesday, matching the design)', () => {
  assert.deepEqual(U.dateParts('2026-09-30'), { wd: 'WED', d: 30, mon: 'SEP', monthIndex: 8, year: 2026 });
  assert.equal(U.dateParts('2026-10-01').wd, 'THU'); assert.equal(U.dateParts('nope'), null);
});
t('headerDate / relLabel / codeOf', () => {
  assert.equal(U.headerDate('2026-09-30'), 'WED 30 SEP'); assert.equal(U.headerDate('bad'), '');
  assert.equal(U.relLabel('2026-10-01', TODAY), 'TODAY'); assert.equal(U.relLabel('2026-10-03', TODAY), '+2 D');
  assert.equal(U.relLabel('2026-11-07', TODAY), '+37 D'); assert.equal(U.relLabel('x', TODAY), '');
  assert.equal(U.codeOf(8, 14), 'S08·E14'); assert.equal(U.codeOf(1, 3), 'S01·E03'); assert.equal(U.codeOf(12, 105), 'S12·E105');
});

// =============================== buildUpNext
const mk = (o) => ({ followed: true, name: 'Show', ...o });
const suits = mk({ name: 'Suits', tmdbId: 1, totalEpisodes: 6, seasons: [{ n: 1, count: 6 }], watched: W(1, 1, 3, '2026-09-30T10:00:00.000Z') });
const emily = mk({ name: 'Emily in Paris', tmdbId: 2, totalEpisodes: 10, seasons: [{ n: 1, count: 10 }], watched: W(1, 1, 2, '2026-09-25T10:00:00.000Z') });

t('cont: in-progress shows with an aired next episode, most-recently-watched first', () => {
  const r = U.buildUpNext([['a', emily], ['b', suits]], TODAY, h);
  assert.deepEqual(r.cont.map((c) => c.id), ['b', 'a']);
  assert.deepEqual(r.cont[0].next, { season: 1, episode: 4 });
});
t('cont: ties on last-watched sort by name', () => {
  const x = mk({ name: 'Zed', totalEpisodes: 5, seasons: [{ n: 1, count: 5 }], watched: W(1, 1, 1) });
  const y = mk({ name: 'Abe', totalEpisodes: 5, seasons: [{ n: 1, count: 5 }], watched: W(1, 1, 1) });
  assert.deepEqual(U.buildUpNext([['x', x], ['y', y]], TODAY, h).cont.map((c) => c.id), ['y', 'x']);
});
t('cont: unfollowed, not-started and finished shows are excluded', () => {
  const r = U.buildUpNext([
    ['u', { ...suits, followed: false }],
    ['n', mk({ totalEpisodes: 5, seasons: [{ n: 1, count: 5 }], watched: {} })],
    ['f', mk({ totalEpisodes: 3, seasons: [{ n: 1, count: 3 }], watched: W(1, 1, 3) })],
  ], TODAY, h);
  assert.equal(r.cont.length, 0);
});
t('CAUGHT UP mid-season: not offered as "continue" (next ep is unaired) but IS in the agenda with its date', () => {
  const airing = mk({ name: 'Airing', tmdbId: 9, totalEpisodes: 8, seasons: [{ n: 1, count: 8 }], watched: W(1, 1, 4),
    nextAir: { season: 1, episode: 5, date: '2026-10-08', name: 'Five' } });
  const r = U.buildUpNext([['a', airing]], TODAY, h);
  assert.equal(r.cont.length, 0);
  assert.deepEqual(r.items.map((i) => [i.s, i.e, i.date]), [[1, 5, '2026-10-08']]);
});
t('mid-season with an AIRED unwatched episode IS offered (E4 aired, E5 upcoming)', () => {
  const airing = mk({ name: 'Airing', tmdbId: 9, totalEpisodes: 8, seasons: [{ n: 1, count: 8 }], watched: W(1, 1, 3),
    nextAir: { season: 1, episode: 5, date: '2026-10-08' } });
  assert.deepEqual(U.buildUpNext([['a', airing]], TODAY, h).cont[0].next, { season: 1, episode: 4 });
});
t('a show with NO season data yet is kept (so it is never silently hidden), with no next', () => {
  const r = U.buildUpNext([['s', mk({ watched: W(1, 1, 5) })]], TODAY, h);
  assert.equal(r.cont.length, 1); assert.equal(r.cont[0].next, null);
});
t('a show whose next season is unreleased is not offered', () => {
  const s = mk({ totalEpisodes: 16, seasons: [{ n: 1, count: 8 }, { n: 2, count: 8, air: '2027-02-01' }], watched: W(1, 1, 8) });
  assert.equal(U.buildUpNext([['s', s]], TODAY, h).cont.length, 0);
});
t('items: cached upcoming list wins, past dates dropped, today kept, sorted date>name>s>e', () => {
  const s = mk({ name: 'B', tmdbId: 1, nextAir: { season: 1, episode: 9, date: '2026-10-09' }, watched: {},
    upcoming: [{ s: 1, e: 3, name: 'c', air: '2026-10-05' }, { s: 1, e: 2, name: 'old', air: '2026-09-01' }, { s: 1, e: 1, name: 'today', air: TODAY }] });
  const o = mk({ name: 'A', tmdbId: 2, nextAir: { season: 2, episode: 1, date: '2026-10-05' }, watched: {} });
  const r = U.buildUpNext([['b', s], ['a', o]], TODAY, h);
  assert.deepEqual(r.items.map((i) => `${i.date} ${i.show.name} ${i.s}x${i.e}`), ['2026-10-01 B 1x1', '2026-10-05 A 2x1', '2026-10-05 B 1x3']);
});
t('items: nextAir fallback only if it is not in the past', () => {
  const past = mk({ tmdbId: 1, nextAir: { season: 1, episode: 2, date: '2026-09-01' }, watched: {} });
  assert.equal(U.buildUpNext([['p', past]], TODAY, h).items.length, 0);
});
t('items: unfollowed shows contribute nothing; syncTargets need tmdbId + nextAir', () => {
  const a = mk({ tmdbId: 1, nextAir: { season: 1, episode: 2, date: '2026-10-09' }, watched: {} });
  const r = U.buildUpNext([['a', a], ['u', { ...a, followed: false }], ['n', mk({ nextAir: { season: 1, episode: 2, date: '2026-10-09' }, watched: {} })]], TODAY, h);
  assert.equal(r.items.length, 2); assert.deepEqual(r.syncTargets.map(([id]) => id), ['a']);
});
t('items: malformed upcoming entries (no air date) never crash and are dropped', () => {
  const s = mk({ tmdbId: 1, watched: {}, upcoming: [{ s: 1, e: 1 }, { s: 1, e: 2, air: undefined }, { s: 1, e: 3, air: '2026-10-03' }] });
  assert.deepEqual(U.buildUpNext([['s', s]], TODAY, h).items.map((i) => i.e), [3]);
});

// =============================== groupAgenda
const it = (date, name = 'X', e = 1) => ({ id: name, show: { name }, s: 1, e, date });
t('groupAgenda: groups by date; today flagged; rel labels; no month label inside the current month', () => {
  const g = U.groupAgenda([it('2026-10-01', 'A'), it('2026-10-01', 'B'), it('2026-10-03', 'C'), it('2026-10-09', 'D')], TODAY);
  assert.deepEqual(g.map((x) => [x.date, x.items.length, x.rel, x.isToday, x.monthLabel]), [
    ['2026-10-01', 2, 'TODAY', true, null], ['2026-10-03', 1, '+2 D', false, null], ['2026-10-09', 1, '+8 D', false, null]]);
  assert.deepEqual([g[0].wd, g[0].d], ['THU', 1]);
});
t('groupAgenda: month label appears when the month changes — including for the first group', () => {
  const g = U.groupAgenda([it('2026-10-09'), it('2026-11-02'), it('2026-11-20'), it('2026-12-01')], TODAY);
  assert.deepEqual(g.map((x) => x.monthLabel), [null, 'NOVEMBER', null, 'DECEMBER']);
  assert.equal(U.groupAgenda([it('2026-11-02')], TODAY)[0].monthLabel, 'NOVEMBER');
});
t('groupAgenda: year shown only when it differs from this year', () => {
  assert.deepEqual(U.groupAgenda([it('2026-12-30'), it('2027-01-05')], TODAY).map((x) => x.monthLabel), ['DECEMBER', 'JANUARY 2027']);
});
t('groupAgenda: empty => []; invalid dates skipped without crashing', () => {
  assert.deepEqual(U.groupAgenda([], TODAY), []);
  assert.deepEqual(U.groupAgenda([it('garbage'), it('2026-10-03')], TODAY).map((x) => x.date), ['2026-10-03']);
});

// =============================== double-tap guard
t('isRepeatTap: ignores taps inside the window, allows later ones, tolerates first tap & clock skew', () => {
  assert.equal(U.isRepeatTap(undefined, 1000), false);
  assert.equal(U.isRepeatTap(1000, 1100), true);
  assert.equal(U.isRepeatTap(1000, 1000 + U.MARK_COOLDOWN_MS - 1), true);
  assert.equal(U.isRepeatTap(1000, 1000 + U.MARK_COOLDOWN_MS), false);
  assert.equal(U.isRepeatTap(1000, 9000), false);
  assert.equal(U.isRepeatTap(5000, 4000), false); // clock went backwards: don't swallow taps
});

console.log(`\n${n} upnext tests passed`);
