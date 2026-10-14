// Discover's hit rate: a title counts only once its card has really been on screen (seenTracker),
// and the log syncs through the REAL cloud engine (users/{uid}/library/discover) against the
// in-memory Firestore, merging across devices. Also: restore from backup, and Delete everywhere.
//   node tests/unit/hit_sync.test.mjs
import assert from 'node:assert/strict';
import { register } from 'node:module';
register('./fakes/hooks.mjs', import.meta.url);

const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
const handlers = {};
globalThis.document = { visibilityState: 'visible', addEventListener: (type, f) => { handlers[type] = f; }, removeEventListener: () => {} };
globalThis.window = { addEventListener: () => {}, removeEventListener: () => {} };

const T1 = '2026-10-01T00:00:00.000Z', T2 = '2026-10-02T00:00:00.000Z', T3 = '2026-10-03T00:00:00.000Z';
// An existing device: the OLD device-only log (counted every title loaded, seen or not) is still in
// storage; this device has also seen one title under the new rule. The phone saw two in the cloud.
mem.set('watchnext-discover-log-v1', JSON.stringify({ 'tv:77': { at: T1, name: 'Old unseen' } }));
mem.set('watchnext-state-v1', JSON.stringify({ shows: {}, movies: [], goals: {}, hidden: {}, seenLog: { 'movie:5': { at: T2, name: 'Laptop seen' }, 'tv:1': { at: T3, name: 'Both' } }, settings: {} }));
await import('./fakes/firestore.mjs');
const FS = globalThis.__fs;
FS.docs.set('users/u1/library/discover', { log: { 'tv:1': { at: T1, name: 'Both' }, 'tv:2': { at: T2, name: 'Phone seen' } } });

const { createSeenTracker } = await import('../../src/components/seenTracker.js');
const HL = await import('../../src/components/hitLogic.js');
const D = await import('../../src/store/db.js');
const { mergeBackup } = await import('../../src/store/backupMerge.js');
const E = await import('../../src/store/cloudEngine.js');

let n = 0;
const t = async (name, fn) => { await fn(); n++; console.log('ok  -', name); };
const settle = async () => { for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r)); };
const flushNow = async () => { document.visibilityState = 'hidden'; handlers.visibilitychange(); document.visibilityState = 'visible'; await settle(); };
const cloud = () => (FS.docs.get('users/u1/library/discover') || {}).log;

// ---- on-screen tracker with a hand-cranked clock
function clock() {
  let now = 0, id = 0; const q = new Map();
  return {
    setTimer: (f, ms) => { q.set(++id, { f, at: now + ms }); return id; },
    clearTimer: (i) => q.delete(i),
    tick(ms) { const end = now + ms; for (;;) { const next = [...q.entries()].sort((a, b) => a[1].at - b[1].at)[0]; if (!next || next[1].at > end) break; q.delete(next[0]); now = next[1].at; next[1].f(); } now = end; },
  };
}
await t('a card counts only after staying on screen about a second; a flick past does not', async () => {
  const c = clock(); const got = []; let vis = true;
  const tr = createSeenTracker({ onSeen: (k) => got.push(...k), setTimer: c.setTimer, clearTimer: c.clearTimer, isPageVisible: () => vis, seenMs: 1000, batchMs: 1200 });
  tr.visible('tv:1', true); c.tick(400); tr.visible('tv:1', false); c.tick(5000);
  assert.deepEqual(got, [], 'scrolled past in 0.4 s: not seen');
  tr.visible('tv:2', true); tr.visible('tv:3', true); c.tick(1000);
  assert.deepEqual(got, [], 'seen, but batched');
  c.tick(1200); assert.deepEqual(got, ['tv:2', 'tv:3'], 'one batch for both');
  tr.visible('tv:2', false); tr.visible('tv:2', true); c.tick(5000); assert.deepEqual(got, ['tv:2', 'tv:3'], 'counted once');
  vis = false; tr.visible('tv:4', true); c.tick(3000); assert.equal(got.includes('tv:4'), false, 'background tab: waits');
  vis = true; c.tick(3500); assert.ok(got.includes('tv:4'), 'counted once the tab is back');
  tr.seenNow('tv:9'); assert.equal(got.at(-1), 'tv:9', 'opening or adding counts straight away');
  tr.visible('tv:5', true); tr.stop(); c.tick(5000); assert.equal(got.includes('tv:5'), false, 'leaving Discover drops unfinished timers');
  tr.visible(null, true); tr.seenNow(''); // ignored
});

// ---- store + cloud
E.initCloudSyncEngine(() => {});
globalThis.__auth.emit({ uid: 'u1', email: 'a@x.co' });
await settle();

await t('the old device-only log is ignored (it counted titles never on screen)', async () => {
  assert.equal(D.getState().seenLog['tv:77'], undefined);
});
await t('sign-in: phone and laptop logs combine, earliest date per title, and the union goes back up', async () => {
  const s = D.getState().seenLog;
  assert.deepEqual(Object.keys(s).sort(), ['movie:5', 'tv:1', 'tv:2']);
  assert.equal(s['tv:1'].at, T1);
  assert.deepEqual(Object.keys(cloud()).sort(), ['movie:5', 'tv:1', 'tv:2']);
});
await t('a newly seen title is uploaded with the next flush (one write, the discover doc)', async () => {
  FS.writes.length = 0;
  assert.equal(D.recordDiscoverSeen([{ key: 'movie:8', name: 'Seen here' }]), true);
  assert.equal(D.recordDiscoverSeen([{ key: 'movie:8', name: 'Seen here' }]), false, 'seen again: nothing new');
  await flushNow();
  assert.equal(cloud()['movie:8'].name, 'Seen here');
  assert.deepEqual(FS.writes, [['set', 'users/u1/library/discover']]);
});
await t('titles seen on another device arrive live; the hit rate counts them', async () => {
  FS.remoteSet('users/u1/library/discover', { log: { ...cloud(), 'tv:40': { at: T3, name: 'Phone today' } } });
  await settle();
  assert.equal(D.getState().seenLog['tv:40'].name, 'Phone today');
  assert.equal(HL.hitStats(D.getState().seenLog, { shows: { a: { tmdbId: 40, watched: {} } }, movies: [] }).added, 1);
});
await t('an anime pick added as a show is relinked, synced, and counted once', async () => {
  D.recordDiscoverSeen([{ key: 'anime:900', name: 'Frieren' }]);
  D.relinkDiscoverSeen('anime:900', 'tv:209867'); await flushNow();
  assert.equal(cloud()['anime:900'].moved, 'tv:209867');
  const st = HL.hitStats(cloud(), { shows: { f: { tmdbId: 209867, watched: {} } }, movies: [] });
  assert.equal(st.suggested, Object.keys(cloud()).length - 1);
});
await t('a failed upload is retried with the next flush', async () => {
  FS.failNextCommit = true; const orig = console.error; console.error = () => {};
  D.recordDiscoverSeen([{ key: 'tv:55', name: 'Offline' }]); await flushNow(); console.error = orig;
  assert.equal(cloud()['tv:55'], undefined);
  D.recordDiscoverSeen([{ key: 'tv:56', name: 'Later' }]); await flushNow();
  assert.ok(cloud()['tv:55'] && cloud()['tv:56']);
});
await t('restore from backup adds the backup\'s seen titles (never removes any)', async () => {
  const local = { shows: {}, movies: [], goals: {}, hidden: {}, seenLog: { 'tv:1': { at: T2, name: 'x' } } };
  const r = mergeBackup(local, { app: 'watchnext', version: 1, shows: {}, movies: [], seenLog: { 'tv:1': { at: T1, name: 'x' }, 'tv:9': { at: T3, name: 'y' } } });
  assert.equal(r.seenChanged, true); assert.equal(r.seenLog['tv:1'].at, T1); assert.ok(r.seenLog['tv:9']);
  const same = mergeBackup(local, { app: 'watchnext', version: 1, shows: {}, movies: [] });
  assert.equal(same.seenChanged, false);
});
await t('Delete everywhere empties the cloud log and this device\'s', async () => {
  await E.wipeEverywhere();
  assert.deepEqual(cloud(), {});
  assert.deepEqual(D.getState().seenLog, {});
});
globalThis.__auth.emit(null);
console.log(`\n${n} tests passed`);
