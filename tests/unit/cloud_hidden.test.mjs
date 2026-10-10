// The REAL cloud engine (store/cloudEngine.js) syncing Discover's "Not interested" list, run
// against an in-memory Firestore (tests/unit/fakes). Covers: pull + merge at sign-in, upload,
// live changes from another device, newest-change-wins, retry after a failed upload, and
// "Delete everywhere".   node tests/unit/cloud_hidden.test.mjs
import assert from 'node:assert/strict';
import { register } from 'node:module';
register('./fakes/hooks.mjs', import.meta.url);

const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
const handlers = {};
globalThis.document = { visibilityState: 'visible', addEventListener: (type, f) => { handlers[type] = f; }, removeEventListener: () => {} };
globalThis.window = { addEventListener: () => {}, removeEventListener: () => {} };

const T1 = '2026-10-01T00:00:00.000Z', T2 = '2026-10-02T00:00:00.000Z', T9 = '2099-01-01T00:00:00.000Z';
// This device hid a movie before ever signing in; the cloud holds a show hidden on the phone.
mem.set('watchnext-state-v1', JSON.stringify({ shows: {}, movies: [], goals: {}, hidden: { 'movie:2': { on: true, at: T1, name: 'Laptop pick' } }, settings: {} }));
await import('../../tests/unit/fakes/firestore.mjs'); // so __fs exists before the engine loads
const FS = globalThis.__fs;
FS.docs.set('users/u1/library/hidden', { hidden: { 'tv:1': { on: true, at: T1, name: 'Phone pick' } } });

const D = await import('../../src/store/db.js');
const E = await import('../../src/store/cloudEngine.js');

let n = 0;
const t = async (name, fn) => { await fn(); n++; console.log('ok  -', name); };
const settle = async () => { for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r)); };
const flushNow = async () => { document.visibilityState = 'hidden'; handlers.visibilitychange(); document.visibilityState = 'visible'; await settle(); };
const cloud = () => (FS.docs.get('users/u1/library/hidden') || {}).hidden;

E.initCloudSyncEngine(() => {});
globalThis.__auth.emit({ uid: 'u1' });
await settle();

await t('sign-in: the cloud list is merged in, and this device\'s own picks are uploaded', async () => {
  assert.equal(D.getState().hidden['tv:1'].name, 'Phone pick');
  assert.equal(D.getState().hidden['movie:2'].name, 'Laptop pick');
  assert.deepEqual(Object.keys(cloud()).sort(), ['movie:2', 'tv:1']);
});
await t('hiding a title here is uploaded on the next flush (and only the list doc is written)', async () => {
  FS.writes.length = 0;
  D.setDiscoverHidden({ kind: 'tv', id: 3, name: 'Hidden here', poster: '/p.jpg', year: 2020, g: ['drama'] }, true);
  await flushNow();
  assert.equal(cloud()['tv:3'].on, true); assert.equal(cloud()['tv:3'].name, 'Hidden here');
  assert.deepEqual(FS.writes, [['set', 'users/u1/library/hidden']]);
});
await t('another device\'s newer change arrives live (an undo there brings the title back here)', async () => {
  FS.remoteSet('users/u1/library/hidden', { hidden: { ...cloud(), 'tv:1': { on: false, at: T9, name: 'Phone pick' } } });
  await settle();
  assert.equal(D.getState().hidden['tv:1'].on, false);
});
await t('an older copy from another device never reverts this device; ours is pushed back up', async () => {
  D.setDiscoverHidden({ kind: 'movie', id: 2 }, false); await flushNow();
  const mine = D.getState().hidden['movie:2'];
  FS.remoteSet('users/u1/library/hidden', { hidden: { ...cloud(), 'movie:2': { on: true, at: T2, name: 'Laptop pick' } } });
  await settle(); await flushNow();
  assert.equal(D.getState().hidden['movie:2'].on, false); assert.equal(cloud()['movie:2'].at, mine.at);
});
await t('a failed upload (offline) is retried with the next flush', async () => {
  FS.failNextCommit = true;
  D.setDiscoverHidden({ kind: 'tv', id: 4, name: 'Offline hide' }, true);
  const orig = console.error; console.error = () => {};
  await flushNow();
  console.error = orig;
  assert.ok(!cloud()['tv:4'], 'not there yet');
  await flushNow();
  assert.equal(cloud()['tv:4'].on, true);
});
await t('"Delete everywhere" empties the cloud list along with everything else, and this device\'s', async () => {
  const res = await E.wipeEverywhere();
  assert.ok(res);
  assert.deepEqual(cloud(), {}); assert.deepEqual(D.getState().hidden, {});
});

globalThis.__auth.emit(null); // stop syncing (clears the flush timer)
console.log(`\n${n} cloud hidden tests passed`);
