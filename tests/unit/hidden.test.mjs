// Discover's "Not interested" list: the pure rules (hiddenLogic.js) and the store (db.js):
// saving, cloud-sync flags, merging another device's copy, backup restore and wipes.
//   node tests/unit/hidden.test.mjs
import assert from 'node:assert/strict';
const store = new Map();
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
// an OLD saved state: written before "Not interested" existed
store.set('watchnext-state-v1', JSON.stringify({ shows: {}, movies: [], goals: {}, settings: { tmdbKey: 'K' } }));
const H = await import('../../src/components/hiddenLogic.js');
const D = await import('../../src/store/db.js');
const BM = await import('../../src/store/backupMerge.js');
const S = await import('../../src/components/settingsLogic.js');

let n = 0; const t = (name, fn) => { fn(); n++; console.log('ok  -', name); };
const T1 = '2026-10-01T00:00:00.000Z', T2 = '2026-10-02T00:00:00.000Z', T9 = '2099-01-01T00:00:00.000Z';
const ITEM = { kind: 'tv', id: 1399, name: 'Game of Thrones', poster: '/got.jpg', year: 2011, g: ['drama', 'scifi'] };
const saved = () => JSON.parse(store.get('watchnext-state-v1'));

// ------------------------------------------------------------------ pure rules
t('sanitize: only tv:/movie: keys with numeric ids; junk fields cleaned; prototype keys ignored', () => {
  const raw = JSON.parse('{"tv:1":{"on":true,"at":"' + T1 + '","name":"A","poster":"/a.jpg","year":2020,"g":["drama","nope"]},"movie:2":{"on":"yes","at":"bad","poster":"http://evil","year":"2020"},"tv:x":{"on":true},"person:3":{"on":true},"__proto__":{"on":true},"tv:4":null}');
  const h = H.sanitizeHidden(raw);
  assert.deepEqual(Object.keys(h), ['tv:1', 'movie:2']);
  assert.deepEqual(h['tv:1'], { on: true, at: T1, name: 'A', kind: 'tv', id: 1, poster: '/a.jpg', year: 2020, g: ['drama'] });
  assert.deepEqual(h['movie:2'], { on: false, at: '', name: '', kind: 'movie', id: 2, poster: null, year: null, g: [] });
  for (const bad of [null, undefined, 5, 'x', []]) assert.deepEqual(H.sanitizeHidden(bad), {});
});
t('setHidden hides, then "show again" keeps the entry with on:false and a newer time (so the undo syncs)', () => {
  const a = H.setHidden({}, ITEM, true, T1);
  assert.deepEqual(a['tv:1399'], { on: true, at: T1, name: 'Game of Thrones', kind: 'tv', id: 1399, poster: '/got.jpg', year: 2011, g: ['drama', 'scifi'] });
  const b = H.setHidden(a, { kind: 'tv', id: 1399 }, false, T2);
  assert.equal(b['tv:1399'].on, false); assert.equal(b['tv:1399'].at, T2); assert.equal(b['tv:1399'].name, 'Game of Thrones', 'name kept for the list');
  assert.equal(a['tv:1399'].on, true, 'input untouched');
  assert.deepEqual(H.setHidden(a, { kind: 'person', id: 5 }, true, T2), a, 'a bad item changes nothing');
  assert.deepEqual(H.setHidden(a, null, true, T2), a);
});
t('merge: per title the newer change wins (ties keep this device); titles on one side only are kept', () => {
  const remote = { 'tv:1': { on: false, at: T2 }, 'tv:2': { on: true, at: T1 }, 'movie:3': { on: true, at: T1 } };
  const local = { 'tv:1': { on: true, at: T1 }, 'tv:2': { on: false, at: T1 }, 'movie:4': { on: true, at: T2 } };
  const m = H.mergeHidden(remote, local);
  assert.equal(m['tv:1'].on, false, 'undo on the other device is newer'); assert.equal(m['tv:2'].on, false, 'tie -> local');
  assert.ok(m['movie:3'].on && m['movie:4'].on);
  assert.ok(H.sameHidden(m, H.mergeHidden(m, m)));
});
t('hiddenList: only hidden ones, newest first; hiddenKeySet for filtering', () => {
  const h = { 'tv:1': { on: true, at: T1, name: 'Old' }, 'tv:2': { on: true, at: T2, name: 'New' }, 'tv:3': { on: false, at: T9, name: 'Shown again' } };
  assert.deepEqual(H.hiddenList(h).map((e) => e.name), ['New', 'Old']); assert.equal(H.hiddenList(h)[0].key, 'tv:2');
  assert.deepEqual([...H.hiddenKeySet(h)].sort(), ['tv:1', 'tv:2']);
});
t('fillHidden (restore): adds only hidden titles you have no entry for; never overwrites, never adds "shown again" ones', () => {
  const r = H.fillHidden({ 'tv:1': { on: false, at: T2 } }, { 'tv:1': { on: true, at: T9 }, 'tv:2': { on: true, at: T1 }, 'tv:3': { on: false, at: T1 } });
  assert.equal(r.added, 1); assert.equal(r.hidden['tv:1'].on, false); assert.ok(r.hidden['tv:2'].on); assert.ok(!r.hidden['tv:3']);
  assert.deepEqual(H.fillHidden(undefined, 'junk'), { hidden: {}, added: 0 });
});

// ------------------------------------------------------------------ store
t('a state saved before this feature loads with an empty list', () => { assert.deepEqual(D.getState().hidden, {}); assert.equal(D.getState().settings.tmdbKey, 'K'); });
t('setDiscoverHidden saves (persisted), stamps the time, marks it for cloud sync once, and hands React a new object', () => {
  D.takeDirty(); const before = D.getState().hidden; const t0 = Date.now();
  D.setDiscoverHidden(ITEM, true);
  const h = D.getState().hidden; assert.notEqual(h, before); assert.equal(h['tv:1399'].on, true); assert.ok(Date.parse(h['tv:1399'].at) >= t0 - 5);
  assert.equal(saved().hidden['tv:1399'].name, 'Game of Thrones');
  const d = D.takeDirty(); assert.equal(d.hidden, true); assert.equal(d.goals, false); assert.equal(d.movies, false); assert.equal(D.takeDirty().hidden, false);
});
t('show again: the entry stays as on:false so other devices learn about the undo', () => {
  const w = Date.now(); while (Date.now() === w) { /* tick */ }
  D.setDiscoverHidden({ kind: 'tv', id: 1399 }, false);
  assert.equal(D.getState().hidden['tv:1399'].on, false); assert.equal(D.takeDirty().hidden, true);
});
t('applyRemoteHidden: a newer cloud copy wins without a push; an older one is ignored and ours is pushed', () => {
  D.takeDirty();
  const push1 = D.applyRemoteHidden({ 'tv:1399': { on: true, at: T9, name: 'GoT' } });
  assert.equal(D.getState().hidden['tv:1399'].on, true); assert.equal(push1, false); assert.equal(D.takeDirty().hidden, false);
  D.setDiscoverHidden({ kind: 'movie', id: 7, name: 'Mine only' }, true); D.takeDirty();
  const push2 = D.applyRemoteHidden({ 'tv:1399': { on: false, at: T1 } });
  assert.equal(D.getState().hidden['tv:1399'].on, true, 'older cloud copy never reverts'); assert.equal(push2, true); assert.equal(D.takeDirty().hidden, true);
  for (const bad of [undefined, null, 5, 'x', []]) D.applyRemoteHidden(bad);
  assert.equal(D.getState().hidden['movie:7'].on, true, 'junk from the cloud is harmless');
});
t('restore from backup adds missing "Not interested" titles, marks them for sync and says so', () => {
  D.takeDirty();
  const sum = D.restoreBackup({ shows: {}, movies: [], hidden: { 'tv:55': { on: true, at: T1, name: 'From backup' }, 'movie:7': { on: false, at: T9 } } });
  assert.equal(sum.hiddenAdded, 1); assert.equal(D.getState().hidden['tv:55'].name, 'From backup'); assert.equal(D.getState().hidden['movie:7'].on, true, 'yours not overwritten');
  assert.equal(D.takeDirty().hidden, true); assert.match(S.restoreResultText(sum), /1 “Not interested” pick restored/);
  assert.equal(D.restoreBackup({ shows: {}, movies: [] }).hiddenAdded, 0); assert.equal(D.takeDirty().hidden, false, 'nothing new -> nothing to sync');
});
t('backups include the list (it is part of the state; only the TMDB key is left out)', () => {
  const b = S.backupState(D.getState()); assert.ok(b.hidden['tv:55']); assert.equal(b.settings.tmdbKey, undefined);
  const r = BM.mergeBackup({ shows: {}, movies: [], hidden: {} }, JSON.parse(JSON.stringify(b))); assert.equal(r.summary.hiddenAdded, Object.values(b.hidden).filter((e) => e.on).length);
});
t('a wipe from another device clears the list and drops a queued upload; this device keeps its key', () => {
  D.setDiscoverHidden(ITEM, true); D.getState().settings.tmdbKey = 'KEEP';
  D.wipeLibrary(); assert.deepEqual(D.getState().hidden, {}); assert.equal(D.takeDirty().hidden, false); assert.equal(D.getState().settings.tmdbKey, 'KEEP');
});

console.log(`\n${n} hidden tests passed`);
