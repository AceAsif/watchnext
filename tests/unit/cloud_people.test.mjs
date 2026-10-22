// The REAL cloud engine syncing the people you follow, against an in-memory Firestore.
import assert from 'node:assert/strict';
import { register } from 'node:module';
register('./fakes/hooks.mjs', import.meta.url);
const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
const handlers = {};
globalThis.document = { visibilityState: 'visible', addEventListener: (type, f) => { handlers[type] = f; }, removeEventListener: () => {} };
globalThis.window = { addEventListener: () => {}, removeEventListener: () => {} };
const T1 = '2026-10-01T00:00:00.000Z', T9 = '2099-01-01T00:00:00.000Z';
mem.set('watchnext-state-v1', JSON.stringify({ shows: {}, movies: [], people: { 1: { name: 'Laptop follow', on: true, at: T1 } }, settings: {} }));
await import('../../tests/unit/fakes/firestore.mjs');
const FS = globalThis.__fs;
FS.docs.set('users/u1/library/people', { people: { 2: { name: 'Phone follow', on: true, at: T1 } } });
const D = await import('../../src/store/db.js');
const E = await import('../../src/store/cloudEngine.js');
let n = 0;
const t = async (name, fn) => { await fn(); n++; console.log('ok  -', name); };
const settle = async () => { for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r)); };
const flushNow = async () => { document.visibilityState = 'hidden'; handlers.visibilitychange(); document.visibilityState = 'visible'; await settle(); };
const cloud = () => (FS.docs.get('users/u1/library/people') || {}).people;
E.initCloudSyncEngine(() => {});
globalThis.__auth.emit({ uid: 'u1' });
await settle();
await t('sign-in: follows from both devices are merged and uploaded', async () => {
  assert.equal(D.getState().people['2'].name, 'Phone follow'); assert.deepEqual(Object.keys(cloud()).sort(), ['1', '2']);
});
await t('following someone here is uploaded (only the people doc is written)', async () => {
  FS.writes.length = 0;
  D.followPerson({ id: 3, name: 'New here' }); await flushNow();
  assert.equal(cloud()['3'].on, true); assert.deepEqual(FS.writes, [['set', 'users/u1/library/people']]);
});
await t('an unfollow on another device arrives live', async () => {
  FS.remoteSet('users/u1/library/people', { people: { ...cloud(), 2: { ...cloud()['2'], on: false, at: T9 } } });
  await settle();
  assert.equal(D.getState().people['2'].on, false);
});
await t('"Delete everywhere" empties the cloud follows', async () => {
  assert.ok(await E.wipeEverywhere()); assert.deepEqual(cloud(), {}); assert.deepEqual(D.getState().people, {});
});
globalThis.__auth.emit(null);
console.log(`\n${n} cloud people tests passed`);
