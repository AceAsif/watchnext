import assert from 'node:assert/strict';
import * as W from '../../src/store/wipeLogic.js';
let n = 0; const t = (name, fn) => Promise.resolve().then(fn).then(() => { n++; console.log('ok  -', name); });

await t('confirmOk: DELETE in any case, trimmed; nothing else', () => {
  for (const ok of ['DELETE', 'delete', ' Delete ', 'dElEtE\n']) assert.equal(W.confirmOk(ok), true, ok);
  for (const bad of ['', 'DEL', 'DELETE ALL', 'deleted', 'D E L E T E', null, undefined, 0]) assert.equal(W.confirmOk(bad), false, String(bad));
});
await t('chunk: sizes, empty, exact multiple', () => {
  assert.deepEqual(W.chunk([], 3), []); assert.deepEqual(W.chunk([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]); assert.deepEqual(W.chunk([1, 2], 2), [[1, 2]]);
});
const T0 = '2026-10-04T10:00:00.000Z', T1 = '2026-10-04T11:00:00.000Z', T2 = '2026-10-04T12:00:00.000Z';
const wipe = { id: 'w1', at: T1 };
await t('wipeDecision: device last synced BEFORE the wipe -> apply', () => assert.equal(W.wipeDecision(wipe, { lastSync: T0 }), 'apply'));
await t('wipeDecision: device synced AFTER the wipe -> record only (its data is newer)', () => assert.equal(W.wipeDecision(wipe, { lastSync: T2 }), 'record'));
await t('wipeDecision: never synced with this account -> record only (its local data is safe)', () => { assert.equal(W.wipeDecision(wipe, {}), 'record'); assert.equal(W.wipeDecision(wipe, undefined), 'record'); assert.equal(W.wipeDecision(wipe, { lastSync: 'junk' }), 'record'); });
await t('wipeDecision: same time is not "before"; already-seen marker is ignored; junk markers ignored', () => {
  assert.equal(W.wipeDecision(wipe, { lastSync: T1 }), 'record');
  assert.equal(W.wipeDecision(wipe, { lastSync: T0, seenWipeId: 'w1' }), 'ignore');
  for (const bad of [null, undefined, {}, { id: 'x' }, { id: '', at: T1 }, { id: 'x', at: 'nope' }, 'str', 5]) assert.equal(W.wipeDecision(bad, { lastSync: T0 }), 'ignore', JSON.stringify(bad));
});
await t('readMeta/writeMeta: per-account; other account, garbage and missing = never synced', () => {
  const raw = W.writeMeta({}, 'u1', { lastSync: T0, seenWipeId: 'w0' });
  assert.deepEqual(W.readMeta(raw, 'u1'), { lastSync: T0, seenWipeId: 'w0' });
  assert.deepEqual(W.readMeta(raw, 'u2'), {}); assert.deepEqual(W.readMeta('{oops', 'u1'), {}); assert.deepEqual(W.readMeta(null, 'u1'), {}); assert.deepEqual(W.readMeta(raw, ''), {});
  assert.deepEqual(W.readMeta(JSON.stringify({ uid: 'u1', lastSync: 'bad', seenWipeId: 5 }), 'u1'), { lastSync: undefined, seenWipeId: undefined });
  const merged = W.writeMeta(W.readMeta(raw, 'u1'), 'u1', { lastSync: T2 });
  assert.deepEqual(W.readMeta(merged, 'u1'), { lastSync: T2, seenWipeId: 'w0' }, 'patching keeps the other field');
});

// ---------------------------------------------------------------- runWipe with fakes
function fake({ remote = [], local = [], failOn = null, now = () => T1 } = {}) {
  const log = [];
  return {
    log,
    p: {
      listRemoteIds: async () => { log.push('list'); return remote; },
      localIds: () => local,
      markSeen: (id) => log.push('seen:' + id),
      commitDeletes: async (ids) => { log.push('del:' + ids.length); if (failOn === 'del') throw new Error('network down'); },
      commitFinal: async (ids, m) => { log.push(`final:${ids.length}:${m.id}:${m.at}`); if (failOn === 'final') throw new Error('permission denied'); },
      clearLocal: (ids) => log.push('clear:' + ids.length),
      now, randomId: () => 'W',
    },
  };
}
await t('runWipe: normal library = ONE atomic final commit; marker remembered first; local cleared last', async () => {
  const f = fake({ remote: ['a', 'b', 'c'], local: ['c', 'd'] });
  const r = await W.runWipe(f.p);
  assert.deepEqual(f.log, ['list', 'seen:W', `final:4:W:${T1}`, 'clear:4']);
  assert.equal(r.shows, 4); assert.deepEqual(r.marker, { id: 'W', at: T1 });
});
await t('runWipe: ids that exist only in the cloud (never downloaded here) are deleted too; duplicates collapse', async () => {
  const f = fake({ remote: ['x', 'y'], local: ['y', 'z'] }); const r = await W.runWipe(f.p); assert.equal(r.shows, 3);
});
await t('runWipe: empty account still writes the marker + empties movies (so other devices clear)', async () => {
  const f = fake(); const r = await W.runWipe(f.p);
  assert.deepEqual(f.log, ['list', 'seen:W', `final:0:W:${T1}`, 'clear:0']); assert.equal(r.shows, 0);
});
await t('runWipe: more than 450 shows -> earlier chunks first, the last chunk rides with the marker', async () => {
  const ids = Array.from({ length: 1000 }, (_, i) => 's' + i);
  const f = fake({ remote: ids }); await W.runWipe(f.p);
  assert.deepEqual(f.log.slice(2, 5), ['del:450', 'del:450', `final:100:W:${T1}`]);
  assert.ok(Math.max(450, 100 + 2) < 500, 'every batch stays under the 500-write limit');
});
await t('runWipe: exactly 450 shows is still one commit', async () => {
  const f = fake({ remote: Array.from({ length: 450 }, (_, i) => 's' + i) }); await W.runWipe(f.p);
  assert.deepEqual(f.log.filter((x) => x.startsWith('del') || x.startsWith('final')), [`final:450:W:${T1}`]);
});
await t('runWipe: the marker time is taken when the final commit starts (after the earlier chunks)', async () => {
  let clock = 0; const times = [T0, T1, T2];
  const f = fake({ remote: Array.from({ length: 900 }, (_, i) => 's' + i), now: () => times[clock++] });
  await W.runWipe(f.p); assert.equal(clock, 1, 'now() called once');
  assert.ok(f.log.some((x) => x.endsWith(':' + T0)));
});
await t('runWipe: a failing FINAL commit throws and leaves this device untouched (no clearLocal)', async () => {
  const f = fake({ remote: ['a', 'b'], failOn: 'final' });
  await assert.rejects(() => W.runWipe(f.p), /permission denied/); assert.ok(!f.log.some((x) => x.startsWith('clear')));
});
await t('runWipe: a failing earlier chunk throws before the marker is written', async () => {
  const f = fake({ remote: Array.from({ length: 900 }, (_, i) => 's' + i), failOn: 'del' });
  await assert.rejects(() => W.runWipe(f.p), /network down/); assert.ok(!f.log.some((x) => x.startsWith('final') || x.startsWith('clear')));
});
await t('runWipe: listing the cloud failing stops before anything is written', async () => {
  const f = fake(); f.p.listRemoteIds = async () => { throw new Error('offline'); };
  await assert.rejects(() => W.runWipe(f.p), /offline/); assert.deepEqual(f.log, []);
});

// ---------------------------------------------------------------- two-device simulation (in-memory cloud)
function world() {
  // cloud shows are { v, w }: the show and the wipe time stamped on it by the device that uploaded it
  const cloud = { shows: new Map(), movies: [], wipe: null };
  const mkDevice = (name) => ({ name, shows: new Map(), movies: [], meta: {}, tomb: new Map() });
  // a sign-in pull: same rules as cloudEngine.pullAndMerge
  const pull = (d, now) => {
    const decision = W.wipeDecision(cloud.wipe, d.meta);
    if (decision === 'apply') { d.shows.clear(); d.movies = []; d.meta = { ...d.meta, seenWipeId: cloud.wipe.id, seenWipeAt: cloud.wipe.at }; }
    else if (decision === 'record') d.meta = { ...d.meta, seenWipeId: cloud.wipe.id, seenWipeAt: cloud.wipe.at };
    for (const [id, c] of [...cloud.shows]) {
      if (d.tomb.has(id) && W.blockedByWipe(d.tomb.get(id), c.w)) { cloud.shows.delete(id); continue; } // stale doc: refused and cleaned up
      d.tomb.delete(id);                                                                                  // accepted: the tombstone is lifted
      if (!d.shows.has(id)) d.shows.set(id, c.v);
    }
    const seen = new Set(d.movies.map((m) => m)); for (const m of cloud.movies) if (!seen.has(m)) d.movies.push(m);
    for (const [id, v] of d.shows) cloud.shows.set(id, { v, w: d.meta.seenWipeAt }); cloud.movies = [...new Set([...cloud.movies, ...d.movies])];
    d.meta = { ...d.meta, lastSync: now };
  };
  const wipeFrom = async (d, now) => {
    await W.runWipe({
      listRemoteIds: async () => [...cloud.shows.keys()], localIds: () => [...d.shows.keys()],
      markSeen: (id) => { d.meta = { ...d.meta, seenWipeId: id }; },
      commitDeletes: async (ids) => ids.forEach((i) => cloud.shows.delete(i)),
      commitFinal: async (ids, m) => { ids.forEach((i) => cloud.shows.delete(i)); cloud.movies = []; cloud.wipe = m; },
      clearLocal: (ids, m) => { d.shows.clear(); d.movies = []; ids.forEach((i) => d.tomb.set(i, m.at)); d.meta = { ...d.meta, seenWipeAt: m.at, lastSync: now }; },
      now: () => now, randomId: () => 'wipe-' + now,
    });
  };
  return { cloud, mkDevice, pull, wipeFrom };
}
await t('SIM: phone wipes; an OFFLINE laptop comes back later and clears itself instead of pushing its old shows + movies back', async () => {
  const w = world(); const phone = w.mkDevice('phone'), laptop = w.mkDevice('laptop');
  phone.shows.set('a', 1); phone.shows.set('b', 2); phone.movies.push('film1');
  w.pull(phone, T0); w.pull(laptop, T0);                       // both in sync at T0
  laptop.shows.set('c', 3); laptop.movies.push('film2');       // laptop goes offline and keeps watching…
  await w.wipeFrom(phone, T1);                                 // …phone wipes everything at T1
  assert.equal(w.cloud.shows.size, 0); assert.deepEqual(w.cloud.movies, []);
  w.pull(laptop, T2);                                          // laptop opens the app at T2
  assert.equal(laptop.shows.size, 0, 'laptop cleared'); assert.deepEqual(laptop.movies, []);
  assert.equal(w.cloud.shows.size, 0, 'nothing was pushed back'); assert.deepEqual(w.cloud.movies, []);
});
await t('SIM: WITHOUT the marker the same scenario brings old movies back (why the marker exists)', async () => {
  const w = world(); const phone = w.mkDevice('phone'), laptop = w.mkDevice('laptop');
  phone.movies.push('film1'); w.pull(phone, T0); w.pull(laptop, T0);
  phone.movies = []; w.cloud.movies = []; w.cloud.shows.clear();     // a cloud-only clear, no marker
  w.pull(laptop, T2); assert.deepEqual(w.cloud.movies, ['film1'], 'the old movie is pushed straight back');
});
await t('SIM: a brand-new device signed in for the first time AFTER the wipe keeps its own local data', async () => {
  const w = world(); const phone = w.mkDevice('phone'), tablet = w.mkDevice('tablet');
  phone.shows.set('a', 1); w.pull(phone, T0); await w.wipeFrom(phone, T1);
  tablet.shows.set('imported', 9); tablet.movies.push('myfilm'); // never synced with this account
  w.pull(tablet, T2);
  assert.equal(tablet.shows.has('imported'), true); assert.deepEqual(tablet.movies, ['myfilm']);
  assert.equal(w.cloud.shows.has('imported'), true, 'and it is uploaded as new data');
});
await t('SIM: a device that synced AFTER the wipe is not wiped again, and a second pull is a no-op', async () => {
  const w = world(); const phone = w.mkDevice('phone'), laptop = w.mkDevice('laptop');
  w.pull(phone, T0); w.pull(laptop, T0); await w.wipeFrom(phone, T1);
  w.pull(laptop, T2); laptop.shows.set('new', 1); w.pull(laptop, '2026-10-04T13:00:00.000Z');
  w.pull(laptop, '2026-10-04T14:00:00.000Z');
  assert.equal(laptop.shows.has('new'), true); assert.equal(w.cloud.shows.has('new'), true);
});
await t('SIM: the device that wiped keeps working afterwards (new data syncs; its own marker is ignored)', async () => {
  const w = world(); const phone = w.mkDevice('phone'); phone.shows.set('a', 1); w.pull(phone, T0); await w.wipeFrom(phone, T1);
  assert.equal(phone.shows.size, 0); phone.shows.set('fresh', 1); w.pull(phone, T2);
  assert.equal(phone.shows.has('fresh'), true); assert.equal(w.cloud.shows.has('fresh'), true);
});
await t('SIM (the bug): wipe on the PHONE, then Restore on the LAPTOP -> the shows stay on phone, laptop and tablet', async () => {
  const w = world(); const phone = w.mkDevice('phone'), laptop = w.mkDevice('laptop'), tablet = w.mkDevice('tablet');
  phone.shows.set('a', 1); phone.shows.set('b', 2); phone.movies.push('film1');
  w.pull(phone, T0); w.pull(laptop, T0); w.pull(tablet, T0);
  await w.wipeFrom(phone, T1);                                  // phone: Delete everywhere
  w.pull(laptop, T2); w.pull(tablet, T2);                       // the others hear about it and clear
  assert.equal(laptop.shows.size, 0); assert.equal(tablet.shows.size, 0);
  laptop.shows.set('a', 1); laptop.shows.set('b', 2); laptop.movies.push('film1'); // laptop: Restore from backup (deliberate)
  w.pull(laptop, '2026-10-04T12:30:00.000Z');                   // …and it uploads
  w.pull(phone, '2026-10-04T13:00:00.000Z'); w.pull(tablet, '2026-10-04T13:00:00.000Z');
  assert.deepEqual([...phone.shows.keys()].sort(), ['a', 'b'], 'the wiping phone keeps the restored shows');
  assert.deepEqual([...tablet.shows.keys()].sort(), ['a', 'b']); assert.deepEqual([...w.cloud.shows.keys()].sort(), ['a', 'b'], 'and the cloud still has them');
  assert.equal(phone.tomb.size, 0, 'the wipe tombstones were lifted');
});
await t('SIM: a STALE device that never heard about the wipe still cannot push its old shows back (the tombstone still protects)', async () => {
  const w = world(); const phone = w.mkDevice('phone'), laptop = w.mkDevice('laptop');
  phone.shows.set('a', 1); w.pull(phone, T0); w.pull(laptop, T0);
  await w.wipeFrom(phone, T1);
  // the laptop was open but offline; its queued upload of 'a' lands after the wipe, with no wipe stamp
  w.cloud.shows.set('a', { v: 1, w: laptop.meta.seenWipeAt });
  w.pull(phone, T2);
  assert.equal(phone.shows.size, 0, 'phone refuses it'); assert.equal(w.cloud.shows.size, 0, 'and cleans the zombie doc out of the cloud');
});
await t('SIM: after refusing a stale doc, a later deliberate restore of the SAME show still works (the refusal is not permanent)', async () => {
  const w = world(); const phone = w.mkDevice('phone'), laptop = w.mkDevice('laptop');
  phone.shows.set('a', 1); w.pull(phone, T0); w.pull(laptop, T0);
  await w.wipeFrom(phone, T1);
  w.cloud.shows.set('a', { v: 1, w: undefined }); w.pull(phone, T2);   // stale push refused
  w.pull(laptop, T2); laptop.shows.set('a', 1); w.pull(laptop, '2026-10-04T12:30:00.000Z'); // deliberate restore
  w.pull(phone, '2026-10-04T13:00:00.000Z');
  assert.equal(phone.shows.has('a'), true); assert.equal(w.cloud.shows.has('a'), true);
});
await t('blockedByWipe: no stamp / older stamp is blocked; same or newer stamp is let through; no valid tombstone time never blocks', () => {
  assert.equal(W.blockedByWipe(T1, undefined), true); assert.equal(W.blockedByWipe(T1, 'junk'), true); assert.equal(W.blockedByWipe(T1, T0), true);
  assert.equal(W.blockedByWipe(T1, T1), false); assert.equal(W.blockedByWipe(T1, T2), false);
  assert.equal(W.blockedByWipe(undefined, T2), false); assert.equal(W.blockedByWipe('junk', undefined), false);
});
await t('readMeta/writeMeta: seenWipeAt is kept when valid, left out when missing or junk, and survives patching', () => {
  const raw = W.writeMeta({}, 'u1', { lastSync: T0, seenWipeId: 'w0', seenWipeAt: T1 });
  assert.deepEqual(W.readMeta(raw, 'u1'), { lastSync: T0, seenWipeId: 'w0', seenWipeAt: T1 });
  assert.equal('seenWipeAt' in W.readMeta(JSON.stringify({ uid: 'u1', seenWipeAt: 'nope' }), 'u1'), false);
  assert.equal(W.readMeta(W.writeMeta(W.readMeta(raw, 'u1'), 'u1', { lastSync: T2 }), 'u1').seenWipeAt, T1);
});
await t('runWipe: clearLocal also receives the marker (its time tags the wipe tombstones)', async () => {
  let got; const f = fake({ remote: ['a'] }); f.p.clearLocal = (ids, m) => { got = { ids, m }; };
  await W.runWipe(f.p); assert.deepEqual(got, { ids: ['a'], m: { id: 'W', at: T1 } });
});
await t('SIM: wiping a huge library (1,000 shows) clears everything on both sides', async () => {
  const w = world(); const phone = w.mkDevice('phone'); for (let i = 0; i < 1000; i++) phone.shows.set('s' + i, i);
  w.pull(phone, T0); await w.wipeFrom(phone, T1); assert.equal(w.cloud.shows.size, 0); assert.equal(phone.shows.size, 0);
});
await t('wording: intro/effects/done/fail say what really happens', () => {
  assert.match(W.wipeIntro, /every other device/); assert.match(W.wipeIntro, /backup file downloads first/);
  assert.equal(W.wipeEffects().length, 4); assert.ok(W.wipeEffects().some((l) => /TMDB key on this device/.test(l)));
  assert.match(W.wipeDoneText(1), /1 show and all movies/); assert.match(W.wipeDoneText(171), /171 shows/);
  assert.match(W.wipeFailText(new Error('offline')), /\(offline\)\. Your backup file was downloaded/); assert.match(W.wipeFailText(null), /Deleting did not finish\. Your backup/);
});
console.log(`\n${n} tests passed`);
