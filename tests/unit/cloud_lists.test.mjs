// The REAL cloud engine (store/cloudEngine.js) syncing your custom lists, run against an
// in-memory Firestore (tests/unit/fakes): pull + merge at sign-in, upload, live changes from
// another device, newest-change-wins, a delete that sticks, retry, and "Delete everywhere".
import assert from 'node:assert/strict';
import { register } from 'node:module';
register('./fakes/hooks.mjs', import.meta.url);

const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
const handlers = {};
globalThis.document = { visibilityState: 'visible', addEventListener: (type, f) => { handlers[type] = f; }, removeEventListener: () => {} };
globalThis.window = { addEventListener: () => {}, removeEventListener: () => {} };

const T1 = '2026-10-01T00:00:00.000Z', T9 = '2099-01-01T00:00:00.000Z';
mem.set('watchnext-state-v1', JSON.stringify({ shows: {}, movies: [], lists: { llaptop1: { name: 'Laptop list', at: T1, created: T1, items: [] } }, settings: {} }));
await import('../../tests/unit/fakes/firestore.mjs');
const FS = globalThis.__fs;
FS.docs.set('users/u1/library/lists', { lists: { lphone11: { name: 'Phone list', at: T1, created: T1, items: [{ key: 'tv:1', name: 'Dark' }] } } });

const D = await import('../../src/store/db.js');
const E = await import('../../src/store/cloudEngine.js');
let n = 0;
const t = async (name, fn) => { await fn(); n++; console.log('ok  -', name); };
const settle = async () => { for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r)); };
const flushNow = async () => { document.visibilityState = 'hidden'; handlers.visibilitychange(); document.visibilityState = 'visible'; await settle(); };
const cloud = () => (FS.docs.get('users/u1/library/lists') || {}).lists;

E.initCloudSyncEngine(() => {});
globalThis.__auth.emit({ uid: 'u1' });
await settle();

await t('sign-in: lists from the cloud and this device are merged, and both end up in the cloud', async () => {
  assert.equal(D.getState().lists.lphone11.name, 'Phone list');
  assert.equal(D.getState().lists.llaptop1.name, 'Laptop list');
  assert.deepEqual(Object.keys(cloud()).sort(), ['llaptop1', 'lphone11']);
});
await t('adding a title here is uploaded on the next flush (only the lists doc is written)', async () => {
  FS.writes.length = 0;
  D.addToList('llaptop1', { kind: 'movie', tmdbId: 5, name: 'RRR' });
  await flushNow();
  assert.equal(cloud().llaptop1.items[0].name, 'RRR');
  assert.deepEqual(FS.writes, [['set', 'users/u1/library/lists']]);
});
await t('another device\'s newer change arrives live', async () => {
  FS.remoteSet('users/u1/library/lists', { lists: { ...cloud(), lphone11: { ...cloud().lphone11, name: 'Renamed on phone', at: T9 } } });
  await settle();
  assert.equal(D.getState().lists.lphone11.name, 'Renamed on phone');
});
await t('a list deleted here stays deleted when another device sends its older copy', async () => {
  D.deleteList('llaptop1'); await flushNow();
  FS.remoteSet('users/u1/library/lists', { lists: { ...cloud(), llaptop1: { name: 'Laptop list', at: T1, created: T1, items: [] } } });
  await settle(); await flushNow();
  assert.equal(D.getState().lists.llaptop1.deleted, true); assert.equal(cloud().llaptop1.deleted, true);
});
await t('a failed upload (offline) is retried with the next flush', async () => {
  FS.failNextCommit = true;
  const id = D.createList('Offline list');
  const orig = console.error; console.error = () => {};
  await flushNow();
  console.error = orig;
  assert.ok(!cloud()[id]);
  await flushNow();
  assert.equal(cloud()[id].name, 'Offline list');
});
await t('"Delete everywhere" empties the cloud lists along with everything else', async () => {
  assert.ok(await E.wipeEverywhere());
  assert.deepEqual(cloud(), {}); assert.deepEqual(D.getState().lists, {});
});
globalThis.__auth.emit(null);
console.log(`\n${n} cloud lists tests passed`);
