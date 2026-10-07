import assert from 'node:assert/strict';
const store = new Map();
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
// an OLD saved state: written before goals existed
store.set('watchnext-state-v1', JSON.stringify({ shows: { 'tmdb:1': { name: 'A', watched: {} } }, movies: [], settings: { tmdbKey: 'K' } }));
const D = await import('../../src/store/db.js');
const S = await import('../../src/components/settingsLogic.js');
const BM = await import('../../src/store/backupMerge.js');
let n = 0; const t = (name, fn) => { fn(); n++; console.log('ok  -', name); };
const T0 = '2026-10-05T01:00:00.000Z', T9 = '2099-01-01T00:00:00.000Z';
const saved = () => JSON.parse(store.get('watchnext-state-v1'));

t('a state saved before goals existed loads with an empty goals map (nothing breaks)', () => { assert.deepEqual(D.getState().goals, {}); assert.equal(D.getState().shows['tmdb:1'].name, 'A'); });
t('setYearGoal saves the targets with a time stamp, persists them, and hands React a NEW goals object', () => {
  const before = D.getState().goals; const t0 = Date.now(); D.setYearGoal(2026, { episodes: 400, hours: 500 });
  const g = D.getState().goals; assert.notEqual(g, before); assert.deepEqual([g['2026'].episodes, g['2026'].hours, g['2026'].movies], [400, 500, undefined]); assert.ok(Date.parse(g['2026'].at) >= t0 - 5);
  assert.deepEqual(saved().goals['2026'].episodes, 400); assert.equal(saved().settings.tmdbKey, 'K', 'other state untouched');
});
t('every change marks goals for cloud sync, once; the flag is cleared when taken', () => {
  D.takeDirty(); D.setYearGoal(2026, { movies: 24 }); const d = D.takeDirty(); assert.equal(d.goals, true); assert.equal(D.takeDirty().goals, false); assert.equal(d.movies, false, 'goals do not touch the movies flag');
});
t('clearing every target keeps an entry (with a new time) so the clearing can sync; a later set works again', () => {
  const was = D.getState().goals['2026'].at; const wait = Date.now(); while (Date.now() === wait) {}
  D.setYearGoal(2026, { episodes: null, movies: 0, hours: null }); const e = D.getState().goals['2026']; assert.deepEqual(Object.keys(e), ['at']); assert.ok(Date.parse(e.at) > Date.parse(was));
  D.setYearGoal(2026, { episodes: 300 }); assert.equal(D.getState().goals['2026'].episodes, 300);
});
t('junk targets are ignored, never stored, and never become "undefined" in the saved data', () => {
  D.setYearGoal(2027, { episodes: 'abc', movies: -4, hours: 1e9 }); assert.deepEqual(Object.keys(D.getState().goals['2027']), ['at']); assert.ok(!store.get('watchnext-state-v1').includes('undefined'));
});
t('applyRemoteGoals: a NEWER cloud copy replaces this device\'s year (no push needed); a cloud copy equal to ours changes nothing', () => {
  D.takeDirty(); const push = D.applyRemoteGoals({ 2026: { episodes: 777, at: T9 } }); assert.equal(D.getState().goals['2026'].episodes, 777); assert.equal(push, true, 'we still hold 2027 which the cloud lacks');
  D.takeDirty(); const same = D.applyRemoteGoals(D.getState().goals); assert.equal(same, false); assert.equal(D.takeDirty().goals, false);
});
t('applyRemoteGoals: an OLDER cloud copy never reverts this device; we are told to push ours', () => {
  D.setYearGoal(2026, { episodes: 650 }); D.takeDirty(); const push = D.applyRemoteGoals({ 2026: { episodes: 111, at: T0 } }); assert.equal(D.getState().goals['2026'].episodes, 650); assert.equal(push, true); assert.equal(D.takeDirty().goals, true);
});
t('applyRemoteGoals: junk from the cloud is harmless; a year only the cloud has is added', () => {
  for (const bad of [undefined, null, 5, 'x', [], { 2026: 'x', abc: {} }]) D.applyRemoteGoals(bad); assert.equal(D.getState().goals['2026'].episodes, 650);
  D.applyRemoteGoals({ 2031: { hours: 100, at: T0 } }); assert.equal(D.getState().goals['2031'].hours, 100);
});
t('a backup file carries the goals (but still never the TMDB key)', () => {
  const b = S.backupState(D.getState()); assert.equal(b.goals['2026'].episodes, 650); assert.equal(b.settings.tmdbKey, undefined);
});
t('restore: adds the years you have no goal for, keeps the goals you already set, reports it, and syncs the change', () => {
  D.takeDirty(); const file = { shows: {}, movies: [], goals: { 2026: { episodes: 1, at: T9 }, 2020: { episodes: 200, hours: 300, at: T0 }, 2019: { at: T0 }, 2018: { episodes: 'x', at: T0 } } };
  const sum = D.restoreBackup(file); assert.equal(sum.goalsAdded, 1); assert.deepEqual(D.getState().goals['2020'], { episodes: 200, hours: 300, at: T0 }); assert.equal(D.getState().goals['2026'].episodes, 650, 'your goal is never overwritten');
  assert.ok(!('2019' in D.getState().goals) && !('2018' in D.getState().goals)); assert.equal(D.takeDirty().goals, true); assert.match(S.restoreResultText(sum), /1 yearly goal restored/);
  assert.equal(D.restoreBackup(file).goalsAdded, 0); assert.equal(D.takeDirty().goals, false); assert.match(S.restoreResultText(D.restoreBackup(file)), /Nothing to restore/);
});
t('restoring an older backup that has no goals at all is fine; a hostile goals value is ignored', () => {
  assert.equal(D.restoreBackup({ shows: {}, movies: [] }).goalsAdded, 0); for (const bad of ['x', 5, [], null, { __proto__: { episodes: 5 } }]) assert.equal(D.restoreBackup({ shows: {}, movies: [], goals: bad }).goalsAdded, 0);
});
t('mergeBackup stays pure: it reports the new goals without touching the input', () => {
  const local = { shows: {}, movies: [], goals: { 2026: { episodes: 5, at: T0 } } }; const copy = JSON.stringify(local); const r = BM.mergeBackup(local, { shows: {}, movies: [], goals: { 2025: { hours: 9, at: T0 } } });
  assert.equal(JSON.stringify(local), copy); assert.deepEqual(Object.keys(r.goals).sort(), ['2025', '2026']); assert.equal(r.goalsChanged, true);
});
t('"Delete all data" on this device clears the goals (and the TMDB key, as before)', () => {
  D.resetAll(); assert.deepEqual(D.getState().goals, {}); assert.deepEqual(saved().goals, {});
});
t('another device\'s wipe-everywhere clears the goals here but keeps this device\'s TMDB key, and forgets pending goal uploads', () => {
  D.setYearGoal(2026, { episodes: 400 }); D.getState().settings.tmdbKey = 'KEEP'; D.wipeLibrary(); assert.deepEqual(D.getState().goals, {}); assert.equal(D.getState().settings.tmdbKey, 'KEEP'); assert.equal(D.takeDirty().goals, false);
});
console.log(`\n${n} tests passed`);
