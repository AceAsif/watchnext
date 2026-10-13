// Signing in as a DIFFERENT Google account on a device that holds another account's library
// must ask first (Start fresh / Add this device's library / Cancel) instead of silently copying
// that library into the new account. Pure rules first, then the REAL cloud engine against the
// in-memory Firestore.
//   node tests/unit/account_switch.test.mjs
import assert from 'node:assert/strict';
import { register } from 'node:module';
register('./fakes/hooks.mjs', import.meta.url);

const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
globalThis.document = { visibilityState: 'visible', addEventListener: () => {}, removeEventListener: () => {} };
globalThis.window = { addEventListener: () => {}, removeEventListener: () => {} };
const show = (name, eps = {}) => ({ name, watched: eps });
// Device set up by account A before this feature: only the sync record knows the owner.
mem.set('watchnext-state-v1', JSON.stringify({
  shows: { 'tmdb:1': show('Stranger Things', { 's1e1': { at: '2026-01-01T00:00:00Z' } }), 'tmdb:2': show('Dark') },
  movies: [{ name: 'Heat', watchedAt: '2026-02-01' }], goals: {}, hidden: {}, settings: { tmdbKey: 'k' },
}));
mem.set('watchnext-sync-v1', JSON.stringify({ uid: 'uA', lastSync: '2026-10-01T00:00:00Z' }));
mem.set('watchnext-tombstones-v1', JSON.stringify(['tmdb:9'])); // A deleted show 9

const S = await import('../../src/store/accountSwitch.js');
await import('./fakes/firestore.mjs');
const db = await import('../../src/store/db.js');
const E = await import('../../src/store/cloudEngine.js');

let n = 0;
const t = async (name, fn) => { await fn(); n++; console.log('ok  -', name); };
const settle = async () => { for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r)); };
const fs = globalThis.__fs;
const shows = () => Object.keys(db.getState().shows).sort();
const cloudShows = (u) => [...fs.docs.keys()].filter((p) => p.startsWith(`users/${u}/shows/`)).map((p) => p.split('/').pop()).sort();

// ---- pure rules ----
await t('owner: the owner record wins; old devices fall back to the sync record (no email)', async () => {
  assert.deepEqual(S.readOwner('{"uid":"u1","email":"a@x.co"}', '{"uid":"u2"}'), { uid: 'u1', email: 'a@x.co' });
  assert.deepEqual(S.readOwner(null, '{"uid":"u2","lastSync":"x"}'), { uid: 'u2', email: '' });
  assert.equal(S.readOwner(null, null), null);
  assert.equal(S.readOwner('not json', '{"uid":""}'), null);
});
await t('decision: same account, no owner, empty device, and a different account with a library', async () => {
  const lib = { shows: 2, movies: 0, goals: 0, hidden: 0 };
  const none = { shows: 0, movies: 0, goals: 0, hidden: 0 };
  assert.equal(S.switchDecision({ uid: 'a' }, { uid: 'a' }, lib), 'same');
  assert.equal(S.switchDecision(null, { uid: 'a' }, lib), 'adopt', 'first sign-in uploads the library as before');
  assert.equal(S.switchDecision({ uid: 'a' }, { uid: 'b' }, none), 'adopt', 'nothing to copy: no question needed');
  assert.equal(S.switchDecision({ uid: 'a' }, { uid: 'b' }, lib), 'ask');
  assert.equal(S.switchDecision({ uid: 'a' }, { uid: 'b' }, { ...none, goals: 1 }), 'ask', 'goals alone still count');
});
await t('wording names both accounts and the size of the library', async () => {
  const c = S.switchCopy({ fromEmail: 'a@x.co', toEmail: 'b@y.co', shows: 1, movies: 3 });
  assert.match(c.intro, /a@x\.co \(1 show and 3 movies\)/);
  assert.match(c.intro, /signing in as b@y\.co/);
  assert.match(c.merge.line, /1 show and 3 movies into b@y\.co/);
  assert.match(S.switchCopy({ toEmail: 'b@y.co', shows: 2 }).intro, /another Google account \(2 shows\)/, 'unknown old email');
});

// ---- the real engine ----
const switches = []; const syncing = [];
E.initCloudSyncEngine(() => {}, (v) => syncing.push(v), (v) => switches.push(v));

await t('same account as the device owner: syncs straight away, no question', async () => {
  globalThis.__auth.emit({ uid: 'uA', email: 'a@x.co' }); await settle();
  assert.deepEqual(switches, []);
  assert.deepEqual(cloudShows('uA'), ['tmdb:1', 'tmdb:2'], 'library uploaded to its own account');
  assert.equal(JSON.parse(mem.get('watchnext-owner-v1')).email, 'a@x.co', 'owner now remembered with email');
  globalThis.__auth.emit(null); await settle();
});
fs.docs.set('users/uB/shows/tmdb:9', { name: 'B show also deleted by A' });
fs.docs.set('users/uB/shows/tmdb:5', { name: 'Severance' });
await t('a different account: asks, and NOTHING is uploaded or downloaded while it waits', async () => {
  fs.writes.length = 0;
  globalThis.__auth.emit({ uid: 'uB', email: 'b@y.co' }); await settle();
  assert.deepEqual(switches.at(-1), { fromEmail: 'a@x.co', toEmail: 'b@y.co', shows: 2, movies: 1, goals: 0, hidden: 0 });
  assert.deepEqual(fs.writes, [], 'no writes at all');
  assert.deepEqual(cloudShows('uB'), ['tmdb:5', 'tmdb:9'], 'B untouched');
  assert.deepEqual(shows(), ['tmdb:1', 'tmdb:2'], 'device untouched');
});
await t('Cancel: signs out, prompt closes, nothing changed anywhere', async () => {
  assert.equal(await E.resolveAccountSwitch('cancel'), true); await settle();
  assert.equal(switches.at(-1), null);
  assert.deepEqual(fs.writes, []);
  assert.deepEqual(shows(), ['tmdb:1', 'tmdb:2']);
  assert.equal(await E.resolveAccountSwitch('fresh'), false, 'a late second tap does nothing');
});
await t('signing out while the prompt waits closes it', async () => {
  globalThis.__auth.emit({ uid: 'uB', email: 'b@y.co' }); await settle();
  assert.ok(switches.at(-1));
  globalThis.__auth.emit(null); await settle();
  assert.equal(switches.at(-1), null);
});
await t('Start fresh: device cleared, B gets only its own library, A’s delete records do not touch B', async () => {
  globalThis.__auth.emit({ uid: 'uB', email: 'b@y.co' }); await settle();
  assert.equal(await E.resolveAccountSwitch('fresh'), true); await settle();
  assert.deepEqual(shows(), ['tmdb:5', 'tmdb:9'], "B's own shows, none of A's");
  assert.equal(db.getState().movies.length, 0);
  assert.deepEqual(cloudShows('uB'), ['tmdb:5', 'tmdb:9'], 'tmdb:9 survives in B although A had deleted it');
  assert.deepEqual(cloudShows('uA'), ['tmdb:1', 'tmdb:2'], "A's cloud copy is untouched");
  assert.equal(db.getState().settings.tmdbKey, 'k', 'device settings kept');
  assert.equal(JSON.parse(mem.get('watchnext-owner-v1')).uid, 'uB', 'B now owns this device');
  globalThis.__auth.emit(null); await settle();
});
await t('Add this device’s library: copies the device library into the new account', async () => {
  globalThis.__auth.emit({ uid: 'uC', email: 'c@z.co' }); await settle();
  assert.equal(switches.at(-1).fromEmail, 'b@y.co');
  assert.equal(await E.resolveAccountSwitch('merge'), true); await settle();
  assert.deepEqual(cloudShows('uC'), ['tmdb:5', 'tmdb:9']);
  assert.equal(JSON.parse(mem.get('watchnext-owner-v1')).uid, 'uC');
  globalThis.__auth.emit(null); await settle();
});
await t('an empty device changing hands: no question, and old delete records are dropped', async () => {
  db.update((st) => { st.shows['tmdb:7'] = show('Lost'); });
  db.deleteShow('tmdb:7'); // C deletes a show: a delete record (tombstone) for tmdb:7
  db.wipeLibrary(); // ...and the device ends up empty
  fs.docs.set('users/uD/shows/tmdb:7', { name: 'Lost (D)' });
  const before = switches.length;
  globalThis.__auth.emit({ uid: 'uD', email: 'd@z.co' }); await settle();
  assert.equal(switches.length, before, 'not asked');
  assert.deepEqual(shows(), ['tmdb:7'], "D's copy of a show C had deleted still loads");
  assert.deepEqual(cloudShows('uD'), ['tmdb:7'], 'and is not deleted from D');
  assert.equal(JSON.parse(mem.get('watchnext-owner-v1')).uid, 'uD');
  globalThis.__auth.emit(null); await settle();
});
console.log(`\n${n} tests passed`);
