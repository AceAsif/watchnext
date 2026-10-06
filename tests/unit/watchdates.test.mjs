process.env.TZ = 'Australia/Hobart';
import assert from 'node:assert/strict';
const store = new Map();
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
const ep = (at, extra = {}) => ({ at, min: 40, n: 1, ...extra });
const W = (from, to, at) => Object.fromEntries(Array.from({ length: to - from + 1 }, (_, i) => [`1x${from + i}`, ep(at)]));
store.set('watchnext-state-v1', JSON.stringify({ shows: {
  'tmdb:1': { followed: true, name: 'Dahmer', totalEpisodes: 10, watched: { ...W(1, 10, '2026-07-07T03:00:00.000Z'), '2x1': ep('2026-07-20T10:00:00.000Z', { n: 3 }) }, notes: { '1x1': { react: 'love', at: 'x' } }, rating: 4 },
  'tmdb:2': { followed: true, name: 'Fresh', totalEpisodes: 6, watched: {} },
}, movies: [], settings: {} }));
const D = await import('/home/claude/wl/src/store/db.js');
const M = await import('/home/claude/wl/src/store/watchedMerge.js');
const L = await import('/home/claude/wl/src/components/watchDatesLogic.js');
let n = 0; const t = (name, fn) => { fn(); n++; console.log('ok  -', name); };
const show = (id) => D.getState().shows[id];

// ============================================================ db: setWatchDates / restoreWatchDates
t('setWatchDates changes ONLY the date (+ a fixedAt stamp): n, minutes, notes, rating and other episodes are untouched; returns the previous values', () => {
  const keys = Array.from({ length: 10 }, (_, i) => `1x${i + 1}`);
  const prev = D.setWatchDates('tmdb:1', keys, '2023-06-14T02:00:00.000Z');
  assert.deepEqual(Object.keys(prev).sort(), [...keys].sort()); assert.deepEqual(prev['1x1'], { at: '2026-07-07T03:00:00.000Z', fixedAt: null });
  for (const k of keys) { const w = show('tmdb:1').watched[k]; assert.equal(w.at, '2023-06-14T02:00:00.000Z'); assert.equal(w.n, 1); assert.equal(w.min, 40); assert.match(w.fixedAt, /^\d{4}-\d\d-\d\dT/); }
  assert.equal(show('tmdb:1').watched['2x1'].at, '2026-07-20T10:00:00.000Z', 'an episode outside the keys is untouched'); assert.equal(show('tmdb:1').watched['2x1'].n, 3);
  assert.equal(show('tmdb:1').rating, 4); assert.ok(show('tmdb:1').notes['1x1']);
});
t('restoreWatchDates puts the original dates back, and the undo counts as a NEWER correction', () => {
  const keys = ['1x1', '1x2']; const before = D.getState().shows['tmdb:1'].watched['1x1'].fixedAt;
  const prev = { '1x1': { at: '2026-07-07T03:00:00.000Z', fixedAt: null }, '1x2': { at: '2026-07-07T03:00:00.000Z', fixedAt: null } };
  const wait = Date.now(); while (Date.now() === wait) {} // make sure the new stamp is later
  D.restoreWatchDates('tmdb:1', prev);
  for (const k of keys) { const w = show('tmdb:1').watched[k]; assert.equal(w.at, '2026-07-07T03:00:00.000Z'); assert.ok(Date.parse(w.fixedAt) >= Date.parse(before)); }
  assert.equal(show('tmdb:1').watched['1x3'].at, '2023-06-14T02:00:00.000Z', 'others stay corrected');
});
t('setWatchDates ignores unknown episodes, bad dates and unknown shows; never writes undefined; marks the show dirty only if something changed', () => {
  D.takeDirty();
  assert.deepEqual(D.setWatchDates('tmdb:1', ['9x9', 'nope'], '2020-01-01T00:00:00.000Z'), {}); assert.equal(D.takeDirty().showIds.size, 0);
  assert.deepEqual(D.setWatchDates('tmdb:1', ['1x3'], 'garbage'), {}); assert.deepEqual(D.setWatchDates('tmdb:1', ['1x3'], ''), {}); assert.deepEqual(D.setWatchDates('tmdb:1', ['1x3'], 42), {});
  assert.deepEqual(D.setWatchDates('tmdb:404', ['1x1'], '2020-01-01T00:00:00.000Z'), {});
  D.setWatchDates('tmdb:1', ['1x3'], '2023-06-15T02:00:00.000Z'); assert.ok(D.takeDirty().showIds.has('tmdb:1'));
  assert.ok(!JSON.stringify(D.getState()).includes('undefined'));
});
t('restore with an episode that no longer exists, or junk, is harmless', () => { D.restoreWatchDates('tmdb:1', { '9x9': { at: 'x', fixedAt: null }, '1x1': null }); D.restoreWatchDates('tmdb:1', null); D.restoreWatchDates('tmdb:404', {}); });
const eps = [1, 2, 3].map((e) => ({ episode_number: e, runtime: 30 }));
t('markSeason WITHOUT a date is unchanged: stamped now, no fixedAt', () => {
  const before = Date.now(); D.markSeason('tmdb:2', 1, eps, true);
  for (const k of ['1x1', '1x2', '1x3']) { const w = show('tmdb:2').watched[k]; assert.ok(Date.parse(w.at) >= before - 5); assert.ok(!('fixedAt' in w)); assert.equal(w.min, 30); }
});
t('markSeason WITH a date stamps the chosen date and remembers it was hand-set; already-watched episodes keep their own date', () => {
  D.markSeason('tmdb:2', 1, [...eps, { episode_number: 4, runtime: 30 }, { episode_number: 5, runtime: 30 }], true, '2023-05-05T02:00:00.000Z');
  assert.equal(show('tmdb:2').watched['1x1'].at.slice(0, 4), '2026', 'already marked: untouched'); assert.ok(!('fixedAt' in show('tmdb:2').watched['1x1']));
  for (const k of ['1x4', '1x5']) { const w = show('tmdb:2').watched[k]; assert.equal(w.at, '2023-05-05T02:00:00.000Z'); assert.match(w.fixedAt, /^\d{4}/); }
});
t('markSeason ignores a junk date (falls back to now); un-marking ignores the date and removes the episodes', () => {
  D.markSeason('tmdb:2', 2, [{ episode_number: 1, runtime: 30 }], true, 'junk'); assert.equal(show('tmdb:2').watched['2x1'].at.slice(0, 4), '2026'); assert.ok(!('fixedAt' in show('tmdb:2').watched['2x1']));
  D.markSeason('tmdb:2', 2, [{ episode_number: 1 }], false, '2023-05-05T02:00:00.000Z'); assert.ok(!('2x1' in show('tmdb:2').watched));
});
t('a dropped show is still resumed when a season is marked with a past date', () => {
  D.setShowDropped('tmdb:2', true); D.markSeason('tmdb:2', 3, [{ episode_number: 1 }], true, '2022-01-01T02:00:00.000Z'); assert.strictEqual(show('tmdb:2').dropped, false);
});

// ============================================================ merge
const f = (at, fixedAt, n) => ({ at, min: 40, ...(n != null ? { n } : {}), ...(fixedAt ? { fixedAt } : {}) });
t('merge: with no corrections THIS device still wins (as before) and nothing is lost from either side', () => {
  const r = M.mergeWatched({ '1x1': f('R'), '1x2': f('R2') }, { '1x1': f('L'), '1x3': f('L3') });
  assert.deepEqual(Object.keys(r).sort(), ['1x1', '1x2', '1x3']); assert.equal(r['1x1'].at, 'L'); assert.equal(r['1x2'].at, 'R2'); assert.equal(r['1x3'].at, 'L3');
});
t('merge: a corrected date in the cloud BEATS this device\'s older, uncorrected one (the phone must not undo the computer\'s fix)', () => {
  const r = M.mergeWatched({ '1x1': f('2023-06-14T02:00:00.000Z', '2026-10-05T01:00:00.000Z') }, { '1x1': f('2026-07-07T03:00:00.000Z') });
  assert.equal(r['1x1'].at, '2023-06-14T02:00:00.000Z'); assert.equal(r['1x1'].fixedAt, '2026-10-05T01:00:00.000Z');
});
t('merge: this device\'s correction beats the cloud\'s uncorrected copy; two corrections: the NEWER one wins; ties go local', () => {
  assert.equal(M.mergeWatched({ a: f('R') }, { a: f('L', '2026-10-05T01:00:00.000Z') }).a.at, 'L');
  assert.equal(M.mergeWatched({ a: f('R', '2026-10-05T03:00:00.000Z') }, { a: f('L', '2026-10-05T01:00:00.000Z') }).a.at, 'R');
  assert.equal(M.mergeWatched({ a: f('R', '2026-10-05T01:00:00.000Z') }, { a: f('L', '2026-10-05T03:00:00.000Z') }).a.at, 'L');
  assert.equal(M.mergeWatched({ a: f('R', '2026-10-05T01:00:00.000Z') }, { a: f('L', '2026-10-05T01:00:00.000Z') }).a.at, 'L');
});
t('merge: an UNDO (a newer correction back to the old date) beats the earlier correction on the other device', () => {
  const r = M.mergeWatched({ a: f('2023-06-14T02:00:00.000Z', '2026-10-05T01:00:00.000Z') }, { a: f('2026-07-07T03:00:00.000Z', '2026-10-05T02:00:00.000Z') });
  assert.equal(r.a.at, '2026-07-07T03:00:00.000Z');
});
t('merge: a rewatch count is never lost whichever copy wins (the higher n is kept)', () => {
  assert.equal(M.mergeWatched({ a: f('R', '2026-10-05T01:00:00.000Z', 1) }, { a: f('L', null, 4) }).a.n, 4);
  assert.equal(M.mergeWatched({ a: f('R', null, 5) }, { a: f('L', null, 2) }).a.n, 5); assert.equal(M.mergeWatched({ a: f('R') }, { a: f('L') }).a.n, undefined, 'no n invented');
  assert.equal(M.mergeWatched({ a: f('R', null, 0) }, { a: f('L', null, NaN) }).a.n, 1);
});
t('merge: junk is skipped, __proto__ is never written, bad fixedAt counts as "not corrected", inputs are not mutated', () => {
  assert.deepEqual(M.mergeWatched(undefined, undefined), {}); assert.deepEqual(M.mergeWatched(null, 5), {}); assert.deepEqual(M.mergeWatched([1], 'x'), {});
  const r = M.mergeWatched({ a: null, b: 7, c: f('R') }, { a: f('L'), __proto__: { z: 1 }, constructor: f('X') }); assert.equal(r.a.at, 'L'); assert.ok(!('b' in r)); assert.equal(r.c.at, 'R'); assert.ok(!Object.prototype.hasOwnProperty.call(r, 'constructor'));
  assert.equal(M.mergeWatched({ a: f('R', 'not a date') }, { a: f('L') }).a.at, 'L');
  const a = { x: f('R') }, b = { x: f('L', '2026-01-01T00:00:00.000Z') }; const ja = JSON.stringify(a), jb = JSON.stringify(b); M.mergeWatched(a, b); assert.equal(JSON.stringify(a), ja); assert.equal(JSON.stringify(b), jb);
});
t('merge: 10,000 episodes in well under a second', () => {
  const big = (p) => Object.fromEntries(Array.from({ length: 10000 }, (_, i) => [`${1 + (i / 500 | 0)}x${1 + (i % 500)}`, f(p + i)]));
  const t0 = Date.now(); const r = M.mergeWatched(big('R'), big('L')); assert.ok(Date.now() - t0 < 800); assert.equal(Object.keys(r).length, 10000);
});

// ============================================================ logic
t('day validation: real dates only, not before 1980, not after today', () => {
  for (const ok of ['2023-06-14', '2024-02-29', '1980-01-01', '2026-10-05']) assert.equal(L.isAllowedDay(ok, '2026-10-05'), true, ok);
  for (const bad of ['2023-02-30', '2025-02-29', '2023-13-01', '2026-10-06', '1979-12-31', '', null, undefined, '2023-6-1', 'tomorrow', '20230614']) assert.equal(L.isAllowedDay(bad, '2026-10-05'), false, String(bad));
});
t('stampForDay: local noon on the chosen day (so it lands on that day in Hobart AND in UTC); today never stamps the future', () => {
  const s = L.stampForDay('2023-06-14', new Date('2026-10-05T00:00:00Z')); assert.equal(s, new Date(2023, 5, 14, 12).toISOString());
  assert.equal(new Date(s).getFullYear(), 2023); assert.equal(s.slice(0, 10), '2023-06-14', 'the stored UTC date is the same day');
  const now = new Date(2026, 9, 5, 8, 0, 0); assert.equal(L.stampForDay('2026-10-05', now), now.toISOString()); // 8am today: not noon
  const late = new Date(2026, 9, 5, 15, 0, 0); assert.equal(L.stampForDay('2026-10-05', late), new Date(2026, 9, 5, 12).toISOString());
});
const dahmer = { name: 'Dahmer', watched: { ...W(1, 10, '2026-07-07T03:00:00.000Z'), ...Object.fromEntries(Array.from({ length: 6 }, (_, i) => [`2x${i + 1}`, ep(`2026-0${3 + (i % 2)}-1${i}T03:00:00.000Z`)])), '3x1': ep('2026-09-30T14:30:00.000Z'), 'bad': ep('x'), '4x1': null } };
t('scopes: All, each season (when several), and days where several episodes were marked together (biggest first)', () => {
  const sc = L.dateScopes(dahmer); assert.equal(sc[0].id, 'all'); assert.equal(sc[0].keys.length, 17);
  assert.deepEqual(sc.map((s) => s.label), ['All watched episodes (17)', 'Season 1 (10)', 'Season 2 (6)', 'Season 3 (1)', 'Marked on 7 Jul 2026 (10)']);
  assert.equal(sc.find((s) => s.id === 'd:2026-07-07').keys.length, 10);
});
t('scopes: one season only -> no season rows; a day cluster equal to ALL is not repeated; fewer than 3 together is not a cluster; none watched -> no scopes', () => {
  const one = L.dateScopes({ watched: W(1, 5, '2026-07-07T03:00:00.000Z') }); assert.deepEqual(one.map((s) => s.id), ['all']);
  assert.deepEqual(L.dateScopes({ watched: { '1x1': ep('2026-07-07T03:00:00.000Z'), '1x2': ep('2026-07-07T03:00:00.000Z'), '1x3': ep('2026-07-08T03:00:00.000Z') } }).map((s) => s.id), ['all']);
  assert.deepEqual(L.dateScopes({ watched: {} }), []); assert.deepEqual(L.dateScopes(null), []); assert.deepEqual(L.dateScopes({}), []);
});
t('scopes: at most 4 day clusters', () => {
  const many = { watched: Object.fromEntries(Array.from({ length: 8 * 3 + 5 }, (_, i) => [`1x${i + 1}`, ep(`2026-05-${String(1 + (i < 24 ? i % 8 : 20)).padStart(2, '0')}T03:00:00.000Z`)])) };
  assert.equal(L.dateScopes(many).filter((s) => s.id.startsWith('d:')).length, 4, '9 candidate days, capped at 4'); assert.ok(L.dateScopes(many).find((s) => s.id === 'd:2026-05-21').keys.length === 5, 'the biggest cluster is kept');
});
t('the 14:30Z watch is dated by the LOCAL day (00:30 on 1 Oct)', () => { assert.equal(L.watchedList(dahmer).find((e) => e.key === '3x1').day, '2026-10-01'); });
t('wording: range line and previews, singular/plural', () => {
  assert.equal(L.describeRange(dahmer), 'Currently dated between 10 Mar 2026 and 1 Oct 2026.'); assert.equal(L.describeRange({ watched: W(1, 3, '2026-07-07T03:00:00.000Z') }), 'Currently dated 7 Jul 2026.'); assert.equal(L.describeRange({}), '');
  assert.equal(L.fixPreview(10, '2023-06-14'), '10 episodes will be dated 14 Jun 2023.'); assert.equal(L.fixPreview(1, '2023-06-14'), '1 episode will be dated 14 Jun 2023.');
  assert.equal(L.fixedToast(8, '2018-03-02'), 'Updated 8 episodes to 2 Mar 2018');
});
console.log(`\n${n} tests passed`);
