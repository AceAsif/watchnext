// applyRemoteShow / createBaseTracker (src/store/liveShowMerge.js): pure, no Firestore.
//   node tests/unit/live_show_merge.test.mjs
import assert from 'node:assert/strict';
import { applyRemoteShow, createBaseTracker, cloneShow, sameValue, mergeWatchedOnPull } from '../../src/store/liveShowMerge.js';

let n = 0;
const t = (name, fn) => { fn(); n++; console.log('ok  -', name); };
const T0 = '2026-11-01T10:00:00.000Z', T1 = '2026-11-05T10:00:00.000Z', T2 = '2026-11-09T10:00:00.000Z';
const w = (...ks) => Object.fromEntries(ks.map((k) => [k, { at: T0, min: 45, n: 1 }]));
const show = (watched, extra = {}) => ({ tmdbId: 1, name: 'Suits', watched, ...extra });
const keys = (s) => Object.keys(s.watched).sort();

t('nothing changed here: the cloud copy stands (a tick or un-tick from the other device comes down)', () => {
  const base = show(w('1x1', '1x2', '1x3'));
  assert.deepEqual(keys(applyRemoteShow(cloneShow(base), show(w('1x1', '1x2', '1x3', '1x4')), base)), ['1x1', '1x2', '1x3', '1x4']);
  assert.deepEqual(keys(applyRemoteShow(cloneShow(base), show(w('1x1', '1x3')), base)), ['1x1', '1x3']);
});
t('THE BUG: an episode ticked here and not uploaded yet survives an older cloud copy', () => {
  const base = show(w('1x1', '1x2'));
  const local = show(w('1x1', '1x2', '1x3'));
  assert.deepEqual(keys(applyRemoteShow(local, show(w('1x1', '1x2')), base)), ['1x1', '1x2', '1x3']);
});
t('an episode un-ticked here and not uploaded yet stays un-ticked', () => {
  const base = show(w('1x1', '1x2', '1x3'));
  assert.deepEqual(keys(applyRemoteShow(show(w('1x1', '1x3')), show(w('1x1', '1x2', '1x3')), base)), ['1x1', '1x3']);
});
t('a tick here and an un-tick there, both stand', () => {
  const base = show(w('1x1', '1x2', '1x3'));
  const local = show(w('1x1', '1x2', '1x3', '1x4'));
  assert.deepEqual(keys(applyRemoteShow(local, show(w('1x1', '1x3')), base)), ['1x1', '1x3', '1x4']);
});
t('an episode ticked on both devices keeps one entry and the higher rewatch count', () => {
  const base = show(w('1x1'));
  const local = show({ '1x1': base.watched['1x1'], '1x2': { at: T1, min: 45, n: 1 } });
  const remote = show({ '1x1': base.watched['1x1'], '1x2': { at: T2, min: 45, n: 2 } });
  const r = applyRemoteShow(local, remote, base);
  assert.equal(r.watched['1x2'].at, T1); assert.equal(r.watched['1x2'].n, 2);
});
t('a date corrected on the other device comes down when this device did not touch the episode', () => {
  const base = show(w('1x1'));
  const fixed = show({ '1x1': { at: '2023-01-01T00:00:00.000Z', min: 45, n: 1, fixedAt: T2 } });
  assert.equal(applyRemoteShow(cloneShow(base), fixed, base).watched['1x1'].at, '2023-01-01T00:00:00.000Z');
});
t('a +1 rewatch made here (count 2, not uploaded) is kept', () => {
  const base = show(w('1x1'));
  const local = show({ '1x1': { at: T0, min: 45, n: 2, last: T1 } });
  const r = applyRemoteShow(local, show(w('1x1')), base);
  assert.equal(r.watched['1x1'].n, 2); assert.equal(r.watched['1x1'].last, T1);
});
t('unknown base: keep everything here, add what the cloud has, never lose a tick', () => {
  const r = applyRemoteShow(show(w('1x1', '1x2', '1x9')), show(w('1x1', '1x2', '1x3')), undefined);
  assert.deepEqual(keys(r), ['1x1', '1x2', '1x3', '1x9']);
});
t('a cloud copy with no watched field does not wipe the local episodes', () => {
  const remote = { tmdbId: 1, name: 'Suits' };
  assert.deepEqual(keys(applyRemoteShow(show(w('1x1')), remote, show(w('1x1')))), ['1x1']);
});
t('a show this device does not have is taken as the cloud sent it', () => {
  const remote = show(w('1x1'));
  assert.equal(applyRemoteShow(undefined, remote, undefined), remote);
});
t('fields: changed here = kept; changed only in the cloud = comes down; removed here stays removed', () => {
  const base = show(w('1x1'), { rating: 3, platform: 'Stan', droppedAt: T0 });
  const local = show(w('1x1'), { rating: 9, platform: 'Stan' }); // rated here, un-dropped here
  const remote = show(w('1x1'), { rating: 3, platform: 'Netflix', droppedAt: T0 });
  const r = applyRemoteShow(local, remote, base);
  assert.equal(r.rating, 9); assert.equal(r.platform, 'Netflix'); assert.equal('droppedAt' in r, false);
});
t('notes written on both devices are both kept; a note only the other device changed comes down', () => {
  const base = show(w('1x1'), { notes: { '1x1': { react: 'love', at: T0 } } });
  const mine = applyRemoteShow(show(w('1x1'), { notes: { '1x1': { react: 'love', at: T0 }, '1x2': { text: 'mine', at: T1 } } }), show(w('1x1'), { notes: { '1x1': { react: 'love', at: T0 }, '1x3': { text: 'theirs', at: T2 } } }), base);
  assert.deepEqual(Object.keys(mine.notes).sort(), ['1x1', '1x2', '1x3']);
  const down = applyRemoteShow(cloneShow(base), show(w('1x1'), { notes: { '1x1': { react: 'sad', at: T2 } } }), base);
  assert.equal(down.notes['1x1'].react, 'sad');
});
t('prototype-polluting keys are ignored', () => {
  const remote = JSON.parse('{"tmdbId":1,"watched":{"__proto__":{"at":"x"},"1x1":{"at":"2026-11-01T10:00:00.000Z","n":1}}}');
  const r = applyRemoteShow(show(w('1x1')), remote, show(w('1x1')));
  assert.deepEqual(keys(r), ['1x1']); assert.equal({}.at, undefined);
});
t('inputs are not changed', () => {
  const base = show(w('1x1')), local = show(w('1x1', '1x2')), remote = show(w('1x1', '1x3'));
  const b0 = JSON.stringify([base, local, remote]);
  applyRemoteShow(local, remote, base);
  assert.equal(JSON.stringify([base, local, remote]), b0);
});
t('sameValue ignores key order and undefined fields', () => {
  assert.equal(sameValue({ a: 1, b: { c: 2, d: 3 } }, { b: { d: 3, c: 2 }, a: 1, z: undefined }), true);
  assert.equal(sameValue({ a: 1 }, { a: 2 }), false);
  assert.equal(sameValue(undefined, undefined), true);
});
t('tracker: remembers what the cloud sent, and a later change here is kept against the next cloud copy', () => {
  const tr = createBaseTracker();
  let local = show(w('1x1', '1x2'));
  tr.apply('a', undefined, local);                        // first copy from the cloud becomes the base
  local = show(w('1x1', '1x2', '1x3'));                   // ticked here
  const r = tr.apply('a', local, show(w('1x1', '1x2')));  // the cloud sends the old copy
  assert.deepEqual(keys(r), ['1x1', '1x2', '1x3']);
  // the cloud now un-ticks 1x1; this device did not touch it
  const r2 = tr.apply('a', r, show(w('1x2')));
  assert.deepEqual(keys(r2), ['1x2', '1x3']);
});
t('tracker: after an upload, the uploaded copy is the base (no tick is "pending" any more)', () => {
  const tr = createBaseTracker();
  const sent = show(w('1x1', '1x2', '1x3'));
  tr.remember('a', tr.snap(sent));
  // the other device un-ticks 1x3 later: nothing pending here, so it comes down
  assert.deepEqual(keys(tr.apply('a', cloneShow(sent), show(w('1x1', '1x2')))), ['1x1', '1x2']);
});
t('tracker: base is a copy; editing the live record later cannot change it', () => {
  const tr = createBaseTracker();
  const live = show(w('1x1'));
  tr.remember('a', tr.snap(live));
  live.watched['1x2'] = { at: T0, n: 1 };                 // an in-place edit
  assert.deepEqual(keys(tr.apply('a', live, show(w('1x1')))), ['1x1', '1x2']);
});
t('tracker: forget and clear drop the base', () => {
  const tr = createBaseTracker();
  tr.remember('a', show(w('1x1'))); tr.remember('b', show(w('1x1')));
  tr.forget('a'); assert.equal(tr.has('a'), false); assert.equal(tr.has('b'), true);
  tr.clear(); assert.equal(tr.has('b'), false);
});
t('pull: an episode in the synced list that the cloud no longer has was un-ticked there, so it goes', () => {
  const r = mergeWatchedOnPull(w('1x1', '1x3'), w('1x1', '1x2', '1x3'), ['1x1', '1x2', '1x3']);
  assert.deepEqual(Object.keys(r).sort(), ['1x1', '1x3']);
});
t('pull: a tick made here (not in the synced list) is kept, and a tick from the cloud is added', () => {
  const r = mergeWatchedOnPull(w('1x1', '1x4'), w('1x1', '1x2', '1x3'), ['1x1', '1x2']);
  assert.deepEqual(Object.keys(r).sort(), ['1x1', '1x3', '1x4']); // 1x2 was un-ticked there; 1x3 is new here
});
t('pull: no synced list = the old union, nothing is dropped', () => {
  assert.deepEqual(Object.keys(mergeWatchedOnPull(w('1x1'), w('1x1', '1x2'), undefined)).sort(), ['1x1', '1x2']);
});
t('pull: an episode with a rewatch count or a hand-set date is never dropped', () => {
  const local = { '1x1': { at: T0, n: 2 }, '1x2': { at: T0, n: 1, fixedAt: T1 }, '1x3': { at: T0, n: 1 } };
  const r = mergeWatchedOnPull(w('1x9'), local, ['1x1', '1x2', '1x3', '1x9']);
  assert.deepEqual(Object.keys(r).sort(), ['1x1', '1x2', '1x9']);
});
t('pull: a cloud copy with no watched field drops nothing', () => {
  assert.deepEqual(Object.keys(mergeWatchedOnPull(undefined, w('1x1'), ['1x1'])), ['1x1']);
});
t('pull: an episode missing here but in the synced list stays out of the union only if the cloud has it too (this limit is documented)', () => {
  // un-ticked HERE while offline: the cloud still has it, the union brings it back
  assert.deepEqual(Object.keys(mergeWatchedOnPull(w('1x1', '1x2'), w('1x1'), ['1x1', '1x2'])).sort(), ['1x1', '1x2']);
});
t('tracker: watchedKeys lists the episode keys of each remembered show', () => {
  const tr = createBaseTracker();
  tr.remember('a', show(w('1x1', '1x2'))); tr.remember('b', { tmdbId: 2 });
  assert.deepEqual(tr.watchedKeys(), { a: ['1x1', '1x2'] });
});
console.log(`\n${n} live show merge tests passed`);
