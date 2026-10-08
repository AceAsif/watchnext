import assert from 'node:assert/strict';
// db.js reads localStorage when it loads, so provide a tiny in-memory one first.
const store = new Map();
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
store.set('watchnext-state-v1', JSON.stringify({ shows: {}, movies: [], settings: {} }));
const D = await import('../../src/store/db.js');
let n = 0; const t = async (name, fn) => { await fn(); n++; console.log('ok  -', name); };
const T0 = '2026-10-04T10:00:00.000Z', T1 = '2026-10-04T11:00:00.000Z', T2 = '2026-10-04T12:00:00.000Z';
const wipeKey = () => JSON.parse(store.get('watchnext-wipe-tombstones-v1') || '{}');

await t('addWipeTombstones: remembers each id with the wipe time, persists, queues NO cloud deletes', () => {
  D.takeDirty(); D.addWipeTombstones(['w:1', 'w:2'], T1);
  assert.equal(D.takeDirty().deletedIds.size, 0); assert.deepEqual(wipeKey(), { 'w:1': T1, 'w:2': T1 });
});
await t('isTombstoned(id): no stamp or an OLDER stamp is blocked (a stale device)', () => {
  assert.equal(D.isTombstoned('w:1'), true); assert.equal(D.isTombstoned('w:1', undefined), true); assert.equal(D.isTombstoned('w:1', T0), true); assert.equal(D.isTombstoned('w:1', 'junk'), true);
});
await t('isTombstoned(id, stamp): a stamp from a device that saw THIS wipe (or a later one) is let through', () => {
  assert.equal(D.isTombstoned('w:1', T1), false); assert.equal(D.isTombstoned('w:1', T2), false);
});
await t('an id that was never tombstoned is never blocked, stamp or not', () => { assert.equal(D.isTombstoned('other'), false); assert.equal(D.isTombstoned('other', T0), false); });
await t('addWipeTombstones ignores a missing or invalid wipe time (no tombstone it could never lift)', () => {
  D.addWipeTombstones(['bad:1'], undefined); D.addWipeTombstones(['bad:2'], 'nope');
  assert.equal(D.isTombstoned('bad:1'), false); assert.equal(D.isTombstoned('bad:2'), false);
});
await t('clearTombstone lifts a wipe tombstone (and it is gone from storage)', () => {
  D.clearTombstone('w:1'); assert.equal(D.isTombstoned('w:1'), false); assert.deepEqual(wipeKey(), { 'w:2': T1 });
});
await t('a NORMAL tombstone (a show you deleted) blocks regardless of any stamp', () => {
  D.markShowDeleted('del:1'); D.takeDirty();
  assert.equal(D.isTombstoned('del:1'), true); assert.equal(D.isTombstoned('del:1', T2), true);
});
await t('queueShowDelete queues the cloud delete but does NOT add a permanent tombstone', () => {
  D.takeDirty(); D.queueShowDelete('q:1');
  assert.deepEqual([...D.takeDirty().deletedIds], ['q:1']); assert.equal(D.isTombstoned('q:1'), false);
  assert.equal(JSON.parse(store.get('watchnext-tombstones-v1') || '[]').includes('q:1'), false);
});
await t('queueShowDelete also drops a pending update of the same show (a delete wins)', () => {
  D.takeDirty(); D.markShowDirty('q:2'); D.queueShowDelete('q:2'); const d = D.takeDirty(); assert.equal(d.showIds.has('q:2'), false); assert.equal(d.deletedIds.has('q:2'), true);
});
await t('restoring a backup lifts the wipe tombstone of the shows it brings back (on the device that wiped)', () => {
  D.addWipeTombstones(['tmdb:9'], T1); assert.equal(D.isTombstoned('tmdb:9'), true);
  D.restoreBackup({ shows: { 'tmdb:9': { name: 'Back', tmdbId: 9, followed: true, watched: {} } }, movies: [], settings: {} });
  assert.equal(D.isTombstoned('tmdb:9'), false); assert.deepEqual(wipeKey()['tmdb:9'], undefined);
});
await t('a corrupt wipe-tombstone record is ignored on load (nothing blocked, no crash)', async () => {
  store.set('watchnext-wipe-tombstones-v1', '{oops');
  const mod = await import('../../src/store/db.js?fresh=1'); assert.equal(mod.isTombstoned('anything', undefined), false);
});
console.log(`\n${n} wipe tombstone tests passed`);
