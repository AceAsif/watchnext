import assert from 'node:assert/strict';
const store = new Map();
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
// Now: S4E1 was +1'd on 11 Oct with the OLD button (first date replaced), S4E9 with the NEW one (kept).
store.set('watchnext-state-v1', JSON.stringify({ shows: {
  'tvdb:305288': { name: 'Stranger Things', tmdbId: 66732, watched: {
    '4x1': { at: '2026-10-11T09:00:00.000Z', min: 62, n: 2 },
    '4x8': { at: '2026-10-21T09:00:00.000Z', min: 62, n: 2 },
    '4x9': { at: '2022-07-04T01:30:43', min: 62, n: 2, last: '2026-10-22T10:00:00.000Z' },
    '5x1': { at: '2026-10-22T10:00:00.000Z', n: 1 },
  } },
  'tmdb:7': { name: 'Dark', tmdbId: 70523, watched: { '1x1': { at: '2026-01-01T10:00:00.000Z', n: 1 } } },
}, movies: [], settings: {} }));
const D = await import('../../src/store/db.js');
const F = await import('../../src/components/firstDatesLogic.js');
const A = await import('../../src/components/activityLogic.js');
let n = 0; const t = (name, fn) => { fn(); n++; console.log('ok  -', name); };
const BACKUP = { shows: {
  'tvdb:305288': { name: 'Stranger Things', watched: {
    '4x1': { at: '2022-06-04T10:26:40', min: 62, n: 1 }, '4x8': { at: '2022-07-01T22:34:53', n: 1 }, '4x9': { at: '2022-07-04T01:30:43', n: 1 },
  } },
  'other-id': { name: 'Dark', tmdbId: 70523, watched: { '1x1': { at: '2026-01-01T10:00:30.000Z' } } },
}, movies: [] };

t('the plan lists only episodes whose backup date is earlier; same-date and newer ones are left alone', () => {
  const plan = F.planFirstDates(D.getState().shows, BACKUP);
  assert.equal(plan.length, 1); assert.equal(plan[0].name, 'Stranger Things');
  assert.deepEqual(plan[0].eps.map((e) => [e.key, e.to]), [['4x1', '2022-06-04T10:26:40'], ['4x8', '2022-07-01T22:34:53']]);
  assert.equal(F.planCount(plan), 2);
});
t('shows are matched by TMDB id or name when the id differs (a 30-second difference is not a change)', () => {
  const plan = F.planFirstDates({ x: { name: 'dark', watched: { '1x1': { at: '2026-02-01T00:00:00Z' } } } }, BACKUP);
  assert.equal(plan[0].eps[0].to, '2026-01-01T10:00:30.000Z');
});
t('applying puts the first date back, keeps the count, turns the replaced date into "last", and stamps fixedAt', () => {
  const plan = F.planFirstDates(D.getState().shows, BACKUP);
  D.takeDirty();
  assert.equal(D.restoreFirstDates(plan), 2);
  const w = D.getState().shows['tvdb:305288'].watched;
  assert.equal(w['4x1'].at, '2022-06-04T10:26:40'); assert.equal(w['4x1'].n, 2); assert.equal(w['4x1'].last, '2026-10-11T09:00:00.000Z');
  assert.ok(w['4x1'].fixedAt, 'wins when devices sync');
  assert.deepEqual(w['4x9'].last, '2026-10-22T10:00:00.000Z', 'untouched');
  assert.ok(D.takeDirty().showIds.has('tvdb:305288'));
});
t('it is in Your recent changes and can be undone', () => {
  const e = D.getActivity()[0];
  assert.equal(e.what, 'Brought back 2 first watch dates from a backup'); assert.equal(e.title, 'Stranger Things');
  D.undoActivity(e.id);
  assert.equal(D.getState().shows['tvdb:305288'].watched['4x1'].at, '2026-10-11T09:00:00.000Z');
  assert.equal(A.status(e, D.getState()), 'undone');
});
t('an episode changed after the plan was made is left alone', () => {
  const plan = F.planFirstDates(D.getState().shows, BACKUP);
  D.markEpisode('tvdb:305288', 4, 8, 62, false); D.markEpisode('tvdb:305288', 4, 8, 62, true);
  assert.equal(D.restoreFirstDates(plan), 1);
});
t('a date you set by hand (Fix watch dates) is never replaced', () => {
  assert.deepEqual(F.planFirstDates({ a: { name: 'Dark', watched: { '1x1': { at: '2026-02-01T00:00:00Z', fixedAt: '2026-02-02T00:00:00Z' } } } }, BACKUP), []);
});
console.log(`\n${n} first watch date tests passed`);
