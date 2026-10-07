import assert from 'node:assert/strict';
import * as G from '../../src/components/goalsLogic.js';
let n = 0; const t = (name, fn) => { fn(); n++; console.log('ok  -', name); };
const T0 = '2026-10-05T01:00:00.000Z', T1 = '2026-10-05T02:00:00.000Z', T2 = '2026-10-05T03:00:00.000Z';

t('sanitise: whole numbers 1..99999 only; bad years / junk dropped; __proto__ never written; an entry with no targets (a cleared year) is kept', () => {
  const s = G.sanitizeGoals({ 2026: { episodes: 400, movies: '24', hours: 0, at: T0, junk: 1 }, '26': { episodes: 5 }, 2027: { episodes: 1.5, movies: -3, hours: 100000, at: 'x' }, 1979: { episodes: 5 }, __proto__: { episodes: 9 }, 2028: null, 2029: 'x', 2030: { at: T1 } });
  assert.deepEqual(s, { 2026: { episodes: 400, movies: 24, at: T0 }, 2027: { at: '' }, 2030: { at: T1 } });
  for (const bad of [undefined, null, 5, 'x', [], [{ episodes: 1 }]]) assert.deepEqual(G.sanitizeGoals(bad), {});
  assert.ok(!Object.prototype.hasOwnProperty.call(G.sanitizeGoals(JSON.parse('{"__proto__":{"episodes":5}}')), '__proto__'));
});
t('setGoal: sets targets, removes with null/0/"", leaves undefined alone, stamps the time, never mutates, clamps junk away', () => {
  const a = Object.freeze({ 2026: Object.freeze({ episodes: 400, at: T0 }) });
  const b = G.setGoal(a, 2026, { movies: 24, hours: 500 }, T1); assert.deepEqual(b, { 2026: { episodes: 400, movies: 24, hours: 500, at: T1 } });
  const c = G.setGoal(b, 2026, { episodes: null, movies: 0, hours: '' }, T2); assert.deepEqual(c, { 2026: { at: T2 } }, 'cleared year keeps an entry so the clearing can sync');
  assert.deepEqual(G.setGoal(b, 2026, { episodes: undefined }, T2)[2026].episodes, 400); assert.deepEqual(G.setGoal({}, 2027, { episodes: 'abc' }, T1), { 2027: { at: T1 } });
  assert.deepEqual(G.setGoal(undefined, '2026', { episodes: 100 }, T1), { 2026: { episodes: 100, at: T1 } }); assert.deepEqual(a, { 2026: { episodes: 400, at: T0 } });
});
t('goalsOfYear / hasGoals: only set targets; a cleared year has none', () => {
  const g = { 2026: { episodes: 400, hours: 500, at: T0 }, 2027: { at: T1 } };
  assert.deepEqual(G.goalsOfYear(g, 2026), { episodes: 400, hours: 500 }); assert.deepEqual(G.goalsOfYear(g, '2027'), {}); assert.deepEqual(G.goalsOfYear(g, 2030), {}); assert.equal(G.hasGoals(g, 2026), true); assert.equal(G.hasGoals(g, 2027), false);
});

// ---- cross-device sync
t('merge: the most recently changed copy of a YEAR wins; years only one side has are kept; a tie goes to this device', () => {
  const r = { 2026: { episodes: 500, at: T2 }, 2027: { movies: 10, at: T0 } }, l = { 2026: { episodes: 400, at: T1 }, 2025: { hours: 300, at: T0 } };
  assert.deepEqual(G.mergeGoals(r, l), { 2026: { episodes: 500, at: T2 }, 2027: { movies: 10, at: T0 }, 2025: { hours: 300, at: T0 } });
  assert.equal(G.mergeGoals({ 2026: { episodes: 1, at: T1 } }, { 2026: { episodes: 2, at: T1 } })[2026].episodes, 2, 'tie: local');
  assert.equal(G.mergeGoals({ 2026: { episodes: 1, at: T2 } }, { 2026: { episodes: 2, at: T1 } })[2026].episodes, 1);
});
t('merge: clearing a goal on one device CLEARS it on the other (a newer empty entry beats an older target)', () => {
  const phone = { 2026: { episodes: 400, at: T0 } }; const computer = G.setGoal(phone, 2026, { episodes: null }, T2);
  assert.deepEqual(G.mergeGoals(computer, phone), { 2026: { at: T2 } }); assert.deepEqual(G.mergeGoals(phone, computer), { 2026: { at: T2 } });
});
t('merge: an entry with a bad/missing time loses to any dated one, and junk on either side is ignored', () => {
  assert.equal(G.mergeGoals({ 2026: { episodes: 1, at: 'nope' } }, { 2026: { episodes: 2, at: T0 } })[2026].episodes, 2); assert.equal(G.mergeGoals({ 2026: { episodes: 1, at: T0 } }, { 2026: { episodes: 2 } })[2026].episodes, 1);
  assert.deepEqual(G.mergeGoals(null, undefined), {}); assert.deepEqual(G.mergeGoals('x', { 2026: { episodes: 5, at: T0 } }), { 2026: { episodes: 5, at: T0 } });
  const a = { 2026: { episodes: 1, at: T1 } }, b = { 2026: { episodes: 2, at: T0 } }; const ja = JSON.stringify(a), jb = JSON.stringify(b); G.mergeGoals(a, b); assert.equal(JSON.stringify(a), ja); assert.equal(JSON.stringify(b), jb);
});
t('SIM: phone sets a goal, the laptop (offline, older copy) comes back later: both end up with the newest, nothing is lost or reverted', () => {
  let cloud = {}, phone = {}, laptop = {};
  phone = G.setGoal(phone, 2026, { episodes: 400 }, T0); cloud = G.mergeGoals(cloud, phone); laptop = G.mergeGoals(cloud, laptop);
  phone = G.setGoal(phone, 2026, { episodes: 450, hours: 500 }, T2); cloud = G.mergeGoals(cloud, phone);        // phone edits later
  laptop = G.setGoal(laptop, 2027, { movies: 20 }, T1); cloud = G.mergeGoals(cloud, laptop);                    // laptop (stale) adds NEXT year's goal
  laptop = G.mergeGoals(cloud, laptop); phone = G.mergeGoals(cloud, phone);
  assert.deepEqual(laptop, phone); assert.deepEqual(laptop[2026], { episodes: 450, hours: 500, at: T2 }); assert.deepEqual(laptop[2027], { movies: 20, at: T1 });
});
t('same-ness check and the backup restore rule (adds missing years, never overwrites yours, ignores empty/hostile entries)', () => {
  assert.equal(G.sameGoals({ 2026: { episodes: 5, at: T0 } }, { 2026: { episodes: 5, at: T0, extra: 1 } }), true); assert.equal(G.sameGoals({ 2026: { episodes: 5, at: T0 } }, {}), false);
  const mine = { 2026: { episodes: 400, at: T0 } }; const r = G.fillGoals(mine, { 2026: { episodes: 999, at: T2 }, 2025: { episodes: 300, at: T1 }, 2024: { at: T1 }, 2023: { episodes: 'x', at: T1 }, __proto__: { episodes: 1 } });
  assert.deepEqual(r.goals, { 2026: { episodes: 400, at: T0 }, 2025: { episodes: 300, at: T1 } }); assert.equal(r.added, 1); assert.deepEqual(mine, { 2026: { episodes: 400, at: T0 } });
  assert.deepEqual(G.fillGoals(undefined, undefined), { goals: {}, added: 0 });
});

// ---- dates
t('calendar: leap years, day of year (1 Jan = 1, 31 Dec = 365/366, 29 Feb 2028 = 60)', () => {
  assert.deepEqual([2024, 2025, 2026, 2100, 2000].map(G.isLeap), [true, false, false, false, true]); assert.equal(G.daysInYear(2028), 366); assert.equal(G.daysInYear('2026'), 365);
  assert.deepEqual(['2026-01-01', '2026-12-31', '2028-12-31', '2028-02-29', '2026-03-01', '2028-03-01'].map(G.dayOfYear), [1, 365, 366, 60, 60, 61]); assert.equal(G.dayOfYear('garbage'), 0); assert.equal(G.dayOfYear(undefined), 0);
});

// ---- progress and pace (2026 is not a leap year: 365 days)
const P = (done, today, o = {}) => G.progressFor({ target: 400, done, year: 2026, today, ...o });
t('on / ahead / behind: expected = target × (day of year ÷ days in year); within 1% of the target counts as "on pace"', () => {
  // 1 July = day 182: expected = 400*182/365 = 199.45
  assert.equal(P(199, '2026-07-01').state, 'on'); assert.equal(P(202, '2026-07-01').state, 'on', 'delta +3, inside the 4-episode (1%) band'); assert.equal(P(203, '2026-07-01').state, 'ahead', 'delta +4'); assert.equal(P(196, '2026-07-01').state, 'on', 'delta -3'); assert.equal(P(195, '2026-07-01').state, 'behind', 'delta -4');
  const a = P(250, '2026-07-01'); assert.deepEqual([a.delta, a.projected, a.state], [51, Math.round(250 / (182 / 365)), 'ahead']); const b = P(150, '2026-07-01'); assert.deepEqual([b.delta, b.state], [-49, 'behind']);
});
t('projection and "a week" are right: projected = done ÷ fraction of year; per week = remaining ÷ weeks left', () => {
  const b = P(150, '2026-07-01'); assert.equal(b.projected, 301); assert.equal(b.daysLeft, 183); assert.ok(Math.abs(b.perWeek - 250 / (183 / 7)) < 1e-9);
});
t('early in the year there is nothing to project (first 13 days); from day 14 there is', () => {
  assert.equal(P(3, '2026-01-13').state, 'early'); assert.equal(P(3, '2026-01-13').projected, null); assert.equal(P(30, '2026-01-14').state, 'ahead'); assert.equal(P(30, '2026-01-14').projected, Math.round(30 / (14 / 365)));
});
t('reaching the goal wins over everything (even on 1 Jan); met this year reports the days to spare', () => {
  const m = P(400, '2026-03-02'); assert.deepEqual([m.state, m.met, m.pct, m.remaining], ['met', true, 100, 0]); assert.equal(P(450, '2026-01-02').state, 'met'); assert.equal(P(450, '2026-01-02').pct, 113);
});
t('year boundaries: 31 Dec expects the full target; a leap year has 366 days; 1 Jan is day 1', () => {
  assert.equal(P(399, '2026-12-31').state, 'on'); assert.equal(P(380, '2026-12-31').state, 'behind'); assert.equal(P(380, '2026-12-31').daysLeft, 0);
  const l = G.progressFor({ target: 366, done: 60, year: 2028, today: '2028-02-29' }); assert.equal(l.fraction, 60 / 366); assert.equal(l.delta, 0); assert.equal(l.state, 'on');
});
t('past years are final (met / missed); future years are "upcoming"; today never matters for them', () => {
  assert.equal(G.progressFor({ target: 400, done: 410, year: 2025, today: '2026-02-01' }).state, 'met'); const x = G.progressFor({ target: 400, done: 355, year: 2025, today: '2026-02-01' }); assert.deepEqual([x.state, x.pct], ['missed', 89]);
  assert.equal(G.progressFor({ target: 400, done: 0, year: 2027, today: '2026-10-05' }).state, 'upcoming');
});
t('odd inputs: negative / NaN / fractional "done" are treated sanely; a target of 1 works', () => {
  assert.equal(P(-5, '2026-07-01').done, 0); assert.equal(P(NaN, '2026-07-01').done, 0); assert.equal(P(12.6, '2026-07-01').done, 13); assert.equal(G.progressFor({ target: 1, done: 1, year: 2026, today: '2026-07-01' }).state, 'met');
});
t('wording for every state, singular/plural, a-week rounding, and the final-week wording', () => {
  assert.equal(G.paceText('episodes', P(250, '2026-07-01')), '51 episodes ahead of pace · on track for 501'); assert.equal(G.paceText('episodes', P(201, '2026-07-01')), 'On pace for ' + Math.round(201 / (182 / 365)));
  assert.equal(G.paceText('episodes', P(150, '2026-07-01')), '49 episodes behind pace · 9.6 a week gets you there'); assert.equal(G.paceText('episodes', P(3, '2026-01-05')), 'Just getting started');
  assert.equal(G.paceText('episodes', P(400, '2026-07-01')), 'Goal reached · 183 days to spare'); assert.equal(G.paceText('episodes', P(400, '2026-12-31')), 'Goal reached'); assert.equal(G.paceText('episodes', P(400, '2026-12-30')), 'Goal reached · 1 day to spare');
  assert.equal(G.paceText('hours', G.progressFor({ target: 500, done: 300, year: 2025, today: '2026-02-01' })), 'Ended the year at 60% of the goal'); assert.equal(G.paceText('movies', G.progressFor({ target: 24, done: 0, year: 2027, today: '2026-10-05' })), 'Starts on 1 Jan');
  assert.equal(G.paceText('episodes', P(380, '2026-12-28')), '17 episodes behind pace · 20 more to go'); assert.equal(G.paceText('movies', G.progressFor({ target: 24, done: 11, year: 2026, today: '2026-07-01' })), '1 movie behind pace · 0.5 a week gets you there');
  assert.equal(G.paceText('episodes', { state: 'bogus' }), '');
});
t('streak wording', () => { assert.equal(G.streakText(5, 12), '5 days in a row · best 12 days'); assert.equal(G.streakText(1, 1), '1 day in a row · best 1 day'); assert.equal(G.streakText(0, 7), 'No streak right now · best 7 days'); });
t('rows for the Goals card: only set targets, in a fixed order (episodes, movies, hours), with pace text', () => {
  const g = { 2026: { hours: 500, episodes: 400, at: T0 } }; const rows = G.goalRows(g, 2026, { episodes: 250, movies: 9, hours: 120 }, '2026-07-01');
  assert.deepEqual(rows.map((r) => [r.id, r.label, r.target, r.done]), [['episodes', 'Episodes', 400, 250], ['hours', 'Hours', 500, 120]]); assert.equal(rows[0].pace, '51 episodes ahead of pace · on track for 501'); assert.equal(rows[1].state, 'behind');
  assert.deepEqual(G.goalRows({}, 2026, {}, '2026-07-01'), []);
});
t('compact version for the Year in Review card + its share line; null when no goals', () => {
  const g = { 2026: { episodes: 400, movies: 24, at: T0 } }; const c = G.cardGoals(g, 2026, { episodes: 355, movies: 30, hours: 9 }, '2026-10-05');
  assert.deepEqual(c, { episodes: { target: 400, done: 355, pct: 89, met: false }, movies: { target: 24, done: 30, pct: 125, met: true } }); assert.equal(G.goalShareText(c), 'Goals: 355/400 episodes, 30/24 movies.');
  assert.equal(G.cardGoals(g, 2025, { episodes: 1 }, '2026-10-05'), null); assert.equal(G.goalShareText(null), '');
});
t('editor input: blank = no goal; whole numbers 1..99999; clear messages for everything else', () => {
  assert.deepEqual(G.parseGoalInput(''), { value: null, error: '' }); assert.deepEqual(G.parseGoalInput(' 400 '), { value: 400, error: '' }); assert.deepEqual(G.parseGoalInput('99999'), { value: 99999, error: '' });
  assert.equal(G.parseGoalInput('0').error, 'Use a number above zero (or clear it).'); assert.equal(G.parseGoalInput('100000').error, 'Use 99,999 or less.'); for (const bad of ['4.5', '-3', 'abc', '1e3', '4 00']) assert.equal(G.parseGoalInput(bad).error, 'Use a whole number.', bad);
  assert.deepEqual(G.parseGoalInput(null), { value: null, error: '' });
});
t('presets exist for each goal type and fit the limits', () => { for (const m of G.METRICS) { assert.ok(m.presets.length >= 3); assert.ok(m.presets.every((p) => p >= 1 && p <= G.MAX_GOAL)); } assert.deepEqual(G.METRIC_IDS, ['episodes', 'movies', 'hours']); });
console.log(`\n${n} tests passed`);
