// The REAL cloud engine against the in-memory Firestore: a tick made on this device must
// survive a cloud copy arriving before the tick has been uploaded (the "Watched S9E8 twice" bug,
// handover section 12), and an un-tick made on another device must still reach this one.
//   node tests/unit/cloud_live_ticks.test.mjs
import assert from 'node:assert/strict';
import { register } from 'node:module';
register('./fakes/hooks.mjs', import.meta.url);

const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
const handlers = {};
globalThis.document = { visibilityState: 'visible', addEventListener: (type, f) => { handlers[type] = f; }, removeEventListener: () => {} };
globalThis.window = { addEventListener: () => {}, removeEventListener: () => {} };

const T0 = '2026-11-01T10:00:00.000Z';
const eps = (...nums) => Object.fromEntries(nums.map((e) => [`9x${e}`, { at: T0, min: 45, n: 1 }]));
const show = (watched, extra = {}) => ({ tmdbId: 1, name: 'Suits', followed: true, watched, ...extra });
mem.set('watchnext-state-v1', JSON.stringify({ shows: { 'tmdb:1': show(eps(1, 2, 3, 4, 5, 6, 7)) }, movies: [], goals: {}, hidden: {}, settings: {} }));
await import('./fakes/firestore.mjs');
const FS = globalThis.__fs;
const PATH = 'users/u1/shows/tmdb:1';
FS.docs.set(PATH, show(eps(1, 2, 3, 4, 5, 6, 7)));
FS.initialCollectionSnapshot = true; // like real Firestore: every document arrives as "added" when the listener starts

const D = await import('../../src/store/db.js');
const E = await import('../../src/store/cloudEngine.js');

let n = 0;
const t = async (name, fn) => { await fn(); n++; console.log('ok  -', name); };
const settle = async () => { for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r)); };
const flushNow = async () => { document.visibilityState = 'hidden'; handlers.visibilitychange(); document.visibilityState = 'visible'; await settle(); };
const local = () => Object.keys(D.getState().shows['tmdb:1'].watched).sort();
const cloud = () => Object.keys(FS.docs.get(PATH).watched).sort();
const keys = (...nums) => nums.map((e) => `9x${e}`).sort();
const watchedEntries = () => D.getActivity().filter((a) => a.what === 'Watched S9E8').length;

E.initCloudSyncEngine(() => {});
globalThis.__auth.emit({ uid: 'u1', email: 'a@x.co' });
await settle();
await flushNow();

await t('start: this device and the cloud agree on 7 episodes', async () => {
  assert.deepEqual(local(), keys(1, 2, 3, 4, 5, 6, 7));
  assert.deepEqual(cloud(), keys(1, 2, 3, 4, 5, 6, 7));
});

await t('THE BUG: a tick not yet uploaded survives a cloud copy that arrives first, and logs once', async () => {
  D.markEpisode('tmdb:1', 9, 8, 45); // tapped on Up Next; the 2.5 s upload has not run yet
  FS.remoteSet(PATH, show(eps(1, 2, 3, 4, 5, 6, 7))); // the other device re-uploads its copy of Suits
  await settle();
  assert.deepEqual(local(), keys(1, 2, 3, 4, 5, 6, 7, 8), 'S9E8 must still be ticked');
  D.markEpisode('tmdb:1', 9, 8, 45); // the second tap the owner makes when the row seems not to change
  assert.equal(watchedEntries(), 1, 'one "Watched S9E8" entry, not two');
  await flushNow();
  assert.deepEqual(cloud(), keys(1, 2, 3, 4, 5, 6, 7, 8), 'and it reaches the cloud');
});

await t('an un-tick made on the other device still reaches this one', async () => {
  FS.remoteSet(PATH, show(eps(1, 2, 3, 4, 6, 7, 8))); // other device un-ticked S9E5
  await settle();
  assert.deepEqual(local(), keys(1, 2, 3, 4, 6, 7, 8));
});

await t('a tick here and an un-tick there, at the same time, both stand', async () => {
  D.markEpisode('tmdb:1', 9, 9, 45); // tick S9E9 here, not uploaded yet
  FS.remoteSet(PATH, show(eps(1, 2, 3, 4, 7, 8))); // meanwhile the other device un-ticked S9E6
  await settle();
  assert.deepEqual(local(), keys(1, 2, 3, 4, 7, 8, 9));
  await flushNow();
  assert.deepEqual(cloud(), keys(1, 2, 3, 4, 7, 8, 9));
});

await t('an un-tick made here, not uploaded yet, is not undone by an older cloud copy', async () => {
  D.markEpisode('tmdb:1', 9, 7, 45, false); // un-tick S9E7 here
  FS.remoteSet(PATH, show(eps(1, 2, 3, 4, 7, 8, 9))); // the cloud still has S9E7
  await settle();
  assert.deepEqual(local(), keys(1, 2, 3, 4, 8, 9));
  await flushNow();
  assert.deepEqual(cloud(), keys(1, 2, 3, 4, 8, 9), 'the un-tick reaches the cloud');
});

await t('a field changed here (rating) is not lost either, and other fields still come from the cloud', async () => {
  D.update((s) => { s.shows['tmdb:1'] = { ...s.shows['tmdb:1'], rating: 9 }; });
  D.markShowDirty('tmdb:1');
  FS.remoteSet(PATH, show(eps(1, 2, 3, 4, 8, 9), { platform: 'Netflix', rating: 4 })); // other device set the platform; the cloud still has the old rating
  await settle();
  assert.equal(D.getState().shows['tmdb:1'].rating, 9);
  assert.equal(D.getState().shows['tmdb:1'].platform, 'Netflix');
});

await t('START-UP RACE: ticks made while signed out are not wiped by the first snapshot', async () => {
  globalThis.__auth.emit(null); await settle();
  D.markEpisode('tmdb:1', 9, 10, 45); // ticked on the phone before the cloud was reached
  globalThis.__auth.emit({ uid: 'u1', email: 'a@x.co' }); // app start: every cloud doc arrives as "added"
  await settle(); await flushNow();
  assert.ok(local().includes('9x10'), 'S9E10 still ticked here');
  assert.ok(cloud().includes('9x10'), 'and in the cloud');
});

globalThis.__auth.emit(null);
console.log(`\n${n} cloud live tick tests passed`);
process.exit(0);
