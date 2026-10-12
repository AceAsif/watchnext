// The engine reports "still downloading the library" from sign-in until the first download is
// done (or has failed), and the Google sign-in always asks which account to use.
// Runs the REAL cloud engine against the in-memory Firestore.
//   node tests/unit/cloud_syncing.test.mjs
import assert from 'node:assert/strict';
import { register } from 'node:module';
register('./fakes/hooks.mjs', import.meta.url);

const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
globalThis.document = { visibilityState: 'visible', addEventListener: () => {}, removeEventListener: () => {} };
globalThis.window = { addEventListener: () => {}, removeEventListener: () => {} };
mem.set('watchnext-state-v1', JSON.stringify({ shows: {}, movies: [], goals: {}, hidden: {}, settings: {} }));

await import('./fakes/firestore.mjs');
const { GOOGLE_SIGN_IN_PARAMS } = await import('../../src/store/signInParams.js');
const E = await import('../../src/store/cloudEngine.js');

let n = 0;
const t = async (name, fn) => { await fn(); n++; console.log('ok  -', name); };
const settle = async () => { for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r)); };
const calls = [];
E.initCloudSyncEngine(() => {}, (v) => calls.push(v));

await t('Google sign-in always shows the account chooser (so a second account can be picked)', async () => {
  assert.equal(GOOGLE_SIGN_IN_PARAMS.prompt, 'select_account');
  assert.ok(Object.isFrozen(GOOGLE_SIGN_IN_PARAMS), 'cannot be changed by accident');
});
await t('nothing is reported before anyone signs in', async () => { assert.deepEqual(calls, []); });
await t('sign-in reports "syncing" straight away, and "done" once the first download has finished', async () => {
  globalThis.__auth.emit({ uid: 'u1', email: 'a@b.co' });
  assert.deepEqual(calls, [true], 'true immediately, before any network answer');
  await settle();
  assert.deepEqual(calls, [true, false]);
});
await t('signing out reports "not syncing"', async () => {
  globalThis.__auth.emit({ uid: 'u2', email: 'c@d.co' }); assert.equal(calls.at(-1), true);
  await settle(); globalThis.__auth.emit(null); assert.equal(calls.at(-1), false);
});
await t('signing out while the first download is still running ends with "not syncing" (it cannot get stuck on)', async () => {
  calls.length = 0;
  globalThis.__auth.emit({ uid: 'u3', email: 'e@f.co' }); globalThis.__auth.emit(null); await settle();
  assert.equal(calls.at(0), true); assert.equal(calls.at(-1), false);
});
await t('a second device-style sign-in as a different account after sign-out starts again from "syncing"', async () => {
  calls.length = 0;
  globalThis.__auth.emit({ uid: 'u4', email: 'g@h.co' }); assert.deepEqual(calls, [true]); await settle(); assert.equal(calls.at(-1), false);
});
globalThis.__auth.emit(null); // stops the engine's timer so the process can exit
console.log(`\n${n} tests passed`);
