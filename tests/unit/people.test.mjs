import assert from 'node:assert/strict';
const store = new Map();
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
store.set('watchnext-state-v1', JSON.stringify({ shows: {}, movies: [], settings: {} }));
const P = await import('../../src/components/peopleLogic.js');
const D = await import('../../src/store/db.js');
const { restoreResultText } = await import('../../src/components/settingsLogic.js');
let n = 0; const t = (name, fn) => { fn(); n++; console.log('ok  -', name); };
const T1 = '2026-10-01T00:00:00.000Z', T2 = '2026-10-02T00:00:00.000Z', T3 = '2026-10-03T00:00:00.000Z';
const pacino = { id: 1158, name: 'Al Pacino', profile: '/p.jpg' };

t('setFollow: follow, unfollow keeps a marker, following twice changes nothing', () => {
  let p = P.setFollow({}, pacino, true, T1);
  assert.deepEqual(p['1158'], { id: 1158, name: 'Al Pacino', profile: '/p.jpg', at: T1, on: true, dismissed: [] });
  assert.deepEqual(P.setFollow(p, pacino, true, T2), p);
  p = P.setFollow(p, pacino, false, T2);
  assert.equal(p['1158'].on, false); assert.equal(p['1158'].at, T2); assert.deepEqual(P.followed(p), []);
  assert.deepEqual(P.setFollow({}, { id: 'x' }, true, T1), {});
});
t('sanitizePeople: junk ids, bad posters and bad dismissed keys are dropped', () => {
  const s = P.sanitizePeople({ abc: {}, 12: { name: 'A', on: true, profile: 'http://evil', dismissed: ['tv:1', 'tv:1', 'book:2', 5] }, 13: 'x' });
  assert.deepEqual(Object.keys(s), ['12']); assert.equal(s['12'].profile, null); assert.deepEqual(s['12'].dismissed, ['tv:1']);
});
t('dismiss: remembers the title for that person, once', () => {
  let p = P.setFollow({}, pacino, true, T1);
  p = P.dismiss(p, 1158, 'movie:5', T2); p = P.dismiss(p, 1158, 'movie:5', T3);
  assert.deepEqual(p['1158'].dismissed, ['movie:5']); assert.equal(p['1158'].at, T2);
  assert.deepEqual(P.dismiss(p, 999, 'movie:5', T3), p);
});
t('mergePeople: per person the newer change wins (an unfollow on another device sticks)', () => {
  const local = { 1: { name: 'A', on: true, at: T1 }, 2: { name: 'B', on: true, at: T3 } };
  const remote = { 1: { name: 'A', on: false, at: T2 }, 2: { name: 'B', on: false, at: T1 }, 3: { name: 'C', on: true, at: T1 } };
  const m = P.mergePeople(remote, local);
  assert.equal(m['1'].on, false); assert.equal(m['2'].on, true); assert.equal(m['3'].name, 'C');
});
t('fillPeople (backup): adds people you have no record of; never overwrites or revives an unfollow', () => {
  const r = P.fillPeople({ 1: { name: 'A', on: false, at: T3 } }, { 1: { name: 'A', on: true, at: T1 }, 2: { name: 'B', on: true, at: T1 }, 3: { name: 'C', on: false, at: T1 } });
  assert.equal(r.added, 1); assert.equal(r.people['1'].on, false); assert.equal(r.people['2'].on, true); assert.equal(r.people['3'], undefined);
});
const combined = {
  cast: [
    { id: 1, media_type: 'movie', title: 'New Film', release_date: '2026-10-10', character: 'Lead', poster_path: '/a.jpg' },
    { id: 2, media_type: 'tv', name: 'Talk Show', first_air_date: '2026-10-11', character: 'Guest', genre_ids: [10767] },
    { id: 3, media_type: 'tv', name: 'Doc', first_air_date: '2026-10-12', character: 'Himself' },
    { id: 4, media_type: 'movie', title: 'Coming Soon', release_date: '2027-01-15', character: 'Villain' },
    { id: 5, media_type: 'movie', title: 'Old Film', release_date: '1995-12-15', character: 'Cop' },
    { id: 6, media_type: 'movie', title: 'Far Future', release_date: '2028-06-01', character: 'X' },
    { id: 7, media_type: 'movie', title: 'No Date', character: 'Y' },
  ],
  crew: [{ id: 1, media_type: 'movie', title: 'New Film', release_date: '2026-10-10', job: 'Director' }, { id: 8, media_type: 'movie', title: 'Grip Job', release_date: '2026-10-01', job: 'Grip' }],
};
t('slimCredits: one row per title with roles joined; talk shows, self-appearances and minor crew jobs dropped', () => {
  const s = P.slimCredits(combined);
  assert.deepEqual(s.map((x) => x.key), ['movie:1', 'movie:4', 'movie:5', 'movie:6', 'movie:7']);
  assert.equal(s[0].role, 'as Lead, Director'); assert.equal(s.find((x) => x.key === 'movie:7').date, '');
});
t('newTitles: out in the last 45 days or coming in the next 180; library and dismissed left out; out-now first', () => {
  let people = P.setFollow({}, pacino, true, T1);
  const credits = { 1158: { at: T1, list: P.slimCredits(combined) } };
  let news = P.newTitles(people, credits, new Set(), '2026-10-22');
  assert.deepEqual(news.map((x) => [x.title.name, x.upcoming]), [['New Film', false], ['Coming Soon', true]]);
  assert.equal(news[0].person.name, 'Al Pacino');
  assert.deepEqual(P.newTitles(people, credits, new Set(['movie:1']), '2026-10-22').map((x) => x.title.name), ['Coming Soon']);
  people = P.dismiss(people, 1158, 'movie:4', T2);
  assert.deepEqual(P.newTitles(people, credits, new Set(), '2026-10-22').map((x) => x.title.name), ['New Film']);
  assert.deepEqual(P.newTitles(P.setFollow(people, pacino, false, T3), credits, new Set(), '2026-10-22'), [], 'unfollowed: nothing');
});
t('peopleToCheck: missing or older than 12 hours', () => {
  const people = { 1: { name: 'A', on: true, at: T1 }, 2: { name: 'B', on: true, at: T1 }, 3: { name: 'C', on: false, at: T1 } };
  const now = Date.parse('2026-10-22T12:00:00Z');
  const credits = { 1: { at: '2026-10-22T06:00:00Z', list: [] }, 2: { at: '2026-10-21T20:00:00Z', list: [] } };
  assert.deepEqual(P.peopleToCheck(people, credits, now).sort(), [2]);
  assert.deepEqual(P.peopleToCheck(people, {}, now).sort(), [1, 2]);
});
t('credits cache round-trip; junk ignored', () => {
  P.saveCredits(localStorage, { 5: { at: T1, list: [{ key: 'movie:1', name: 'X' }, { key: 'bad' }] } });
  assert.deepEqual(P.loadCredits(localStorage)['5'].list.map((x) => x.key), ['movie:1']);
  localStorage.setItem(P.CREDITS_KEY, '{oops'); assert.deepEqual(P.loadCredits(localStorage), {});
});
t('db: follow / dismiss / unfollow queue a sync of the people doc', () => {
  D.takeDirty();
  D.followPerson(pacino); assert.equal(D.getState().people['1158'].on, true); assert.equal(D.takeDirty().people, true);
  D.followPerson(pacino); assert.equal(D.takeDirty().people, false, 'no change, no sync');
  D.dismissPersonTitle(1158, 'movie:4'); assert.deepEqual(D.getState().people['1158'].dismissed, ['movie:4']);
  D.followPerson(pacino, false); assert.equal(D.getState().people['1158'].on, false);
});
t('backup restore brings back people you follow; the banner says so', () => {
  const sum = D.restoreBackup({ shows: {}, movies: [], settings: {}, people: { 380: { name: 'Robert De Niro', on: true, at: T1 } } });
  assert.equal(sum.peopleAdded, 1); assert.match(restoreResultText(sum), /1 followed person restored/);
  assert.equal(D.getState().people['380'].on, true);
});
console.log(`\n${n} people tests passed`);
