// The signed-in account's email is written to its own user document (users/{uid}), and nothing
// else from the Google profile. Runs the REAL cloud engine against the in-memory Firestore.
//   node tests/unit/cloud_email.test.mjs
import assert from 'node:assert/strict';
import { register } from 'node:module';
register('./fakes/hooks.mjs', import.meta.url);

const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
const handlers = {};
globalThis.document = { visibilityState: 'visible', addEventListener: (type, f) => { handlers[type] = f; }, removeEventListener: () => {} };
globalThis.window = { addEventListener: () => {}, removeEventListener: () => {} };
mem.set('watchnext-state-v1', JSON.stringify({ shows: {}, movies: [], goals: {}, hidden: {}, settings: {} }));

await import('./fakes/firestore.mjs');
const FS = globalThis.__fs;
const { cleanEmail } = await import('../../src/store/accountEmail.js');
const E = await import('../../src/store/cloudEngine.js');

let n = 0;
const t = async (name, fn) => { await fn(); n++; console.log('ok  -', name); };
const settle = async () => { for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r)); };
const emailWrites = () => FS.writes.filter((w) => w[0] === 'setDoc');

await t('cleanEmail: trims and lower-cases a real address; rejects junk, non-strings and absurd lengths', async () => {
  assert.equal(cleanEmail('  Asif3678@Gmail.com '), 'asif3678@gmail.com');
  assert.equal(cleanEmail('first.last+tag@sub.example.co'), 'first.last+tag@sub.example.co');
  for (const bad of [null, undefined, 42, {}, [], '', 'a', 'no-at-sign', 'two@@at.com', 'sp ace@x.com', 'a@b', '@x.com', 'a@.com', 'a,b@x.com', '<a@x.com>', 'a'.repeat(250) + '@x.com']) assert.equal(cleanEmail(bad), null, String(bad).slice(0, 30));
});

E.initCloudSyncEngine(() => {});

await t('sign-in writes the email (lower-cased) to users/{uid} and NOTHING else: no name, photo or other profile field', async () => {
  globalThis.__auth.emit({ uid: 'u1', email: 'Asif3678@Gmail.com', displayName: 'Asif Iqbal', photoURL: 'https://x/p.jpg', phoneNumber: '+61000' });
  await settle();
  assert.deepEqual(FS.docs.get('users/u1'), { email: 'asif3678@gmail.com' });
  assert.deepEqual(emailWrites(), [['setDoc', 'users/u1']]);
});
await t('signing in again with the same account in the same session does not write it again', async () => {
  globalThis.__auth.emit(null); globalThis.__auth.emit({ uid: 'u1', email: 'asif3678@gmail.com' }); await settle();
  assert.equal(emailWrites().length, 1);
});
await t('the write merges: another field already on the user document is kept', async () => {
  globalThis.__auth.emit(null);
  FS.docs.set('users/u2', { note: 'keep me' });
  globalThis.__auth.emit({ uid: 'u2', email: 'second@example.com' }); await settle();
  assert.deepEqual(FS.docs.get('users/u2'), { note: 'keep me', email: 'second@example.com' });
  assert.deepEqual(FS.docs.get('users/u1'), { email: 'asif3678@gmail.com' }, 'the other account is untouched');
});
await t('an account with no usable email (missing, empty, malformed) writes nothing, and sync still starts', async () => {
  globalThis.__auth.emit(null); FS.writes.length = 0;
  FS.docs.set('users/u3/shows/tmdb:1', { name: 'Seen on pull', tmdbId: 1, followed: true });
  for (const [i, email] of [null, undefined, '', 'not-an-email'].entries()) { globalThis.__auth.emit({ uid: 'u3', email }); await settle(); globalThis.__auth.emit(null); }
  assert.equal(emailWrites().length, 0); assert.equal(FS.docs.has('users/u3'), false);
});
await t('a refused write (rules, offline) is swallowed: sync carries on, and the next sign-in tries again', async () => {
  const D = await import('../../src/store/db.js');
  FS.docs.set('users/u4/shows/tmdb:9', { name: 'Pulled anyway', tmdbId: 9, followed: true });
  D.wipeLibrary(); // an empty device changing accounts (a full one now asks first: account_switch.test.mjs)
  FS.failNextSetDoc = true; const orig = console.error; console.error = () => {};
  globalThis.__auth.emit({ uid: 'u4', email: 'four@example.com' }); await settle(); console.error = orig;
  assert.equal(FS.docs.has('users/u4'), false, 'nothing was recorded');
  assert.equal(Object.values(D.getState().shows).some((s) => s.name === 'Pulled anyway'), true, 'the show still synced down');
  globalThis.__auth.emit(null); globalThis.__auth.emit({ uid: 'u4', email: 'four@example.com' }); await settle();
  assert.deepEqual(FS.docs.get('users/u4'), { email: 'four@example.com' });
});
await t('"Delete everywhere" leaves the email on the user document (it identifies the account; it is not library data)', async () => {
  globalThis.__auth.emit(null); (await import('../../src/store/db.js')).wipeLibrary();
  globalThis.__auth.emit({ uid: 'u1', email: 'asif3678@gmail.com' }); await settle();
  const res = await E.wipeEverywhere(); assert.ok(res);
  assert.deepEqual(FS.docs.get('users/u1'), { email: 'asif3678@gmail.com' });
});

globalThis.__auth.emit(null);
console.log(`\n${n} cloud email tests passed`);
