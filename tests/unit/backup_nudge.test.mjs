process.env.TZ = 'Australia/Hobart';
import assert from 'node:assert/strict';
import * as B from '../../src/components/backupNudgeLogic.js';
let n = 0; const t = (name, fn) => { fn(); n++; console.log('ok  -', name); };
const NOW = new Date('2026-10-05T00:00:00.000Z');
const ago = (days, from = NOW) => new Date(from.getTime() - days * 86400000).toISOString();
const meta = (o = {}) => ({ ...B.EMPTY_META, ...o });

t('overdue = 30+ whole days since the last backup AND the library changed since: 29 days no, 30 days yes, 31 days yes', () => {
  const m = (d) => meta({ lastAt: ago(d), lastCount: 100 });
  assert.equal(B.nudgeStatus(m(29), 150, NOW).show, false); assert.equal(B.nudgeStatus(m(29.9), 150, NOW).show, false);
  const s = B.nudgeStatus(m(30), 150, NOW); assert.deepEqual(s, { show: true, kind: 'overdue', days: 30 });
  assert.equal(B.nudgeStatus(m(31), 150, NOW).days, 31); assert.equal(B.nudgeStatus(m(400), 150, NOW).days, 400);
});
t('a library that has NOT changed since the backup needs no reminder (even after a year); any change (more or fewer) brings it back', () => {
  const m = meta({ lastAt: ago(90), lastCount: 250 });
  assert.equal(B.nudgeStatus(m, 250, NOW).show, false); assert.equal(B.nudgeStatus(m, 251, NOW).show, true); assert.equal(B.nudgeStatus(m, 249, NOW).show, true);
  assert.equal(B.nudgeStatus(meta({ lastAt: ago(90), lastCount: null }), 250, NOW).show, true, 'unknown count at backup time = assume changed');
});
t('never backed up: nothing until this device has had the library for 7 days, then "never"', () => {
  assert.equal(B.nudgeStatus(meta(), 50, NOW).show, false, 'no baseline yet'); assert.equal(B.nudgeStatus(meta({ since: ago(6) }), 50, NOW).show, false);
  assert.deepEqual(B.nudgeStatus(meta({ since: ago(7) }), 50, NOW), { show: true, kind: 'never', days: 7 }); assert.equal(B.nudgeStatus(meta({ since: ago(200) }), 50, NOW).kind, 'never');
});
t('an empty library is never nagged, whatever the dates say', () => {
  assert.equal(B.nudgeStatus(meta({ lastAt: ago(99), lastCount: 5 }), 0, NOW).show, false); assert.equal(B.nudgeStatus(meta({ since: ago(99) }), 0, NOW).show, false);
});
t('snooze: hidden until the snooze ends, then it returns; a snooze in the past is ignored', () => {
  const base = meta({ lastAt: ago(60), lastCount: 1 });
  const z = B.afterSnooze(base, NOW); assert.equal(z.snoozedUntil, new Date(NOW.getTime() + 7 * 86400000).toISOString());
  assert.equal(B.nudgeStatus(z, 5, NOW).show, false); assert.equal(B.nudgeStatus(z, 5, new Date(NOW.getTime() + 6.9 * 86400000)).show, false);
  assert.equal(B.nudgeStatus(z, 5, new Date(NOW.getTime() + 7 * 86400000 + 1)).show, true);
  assert.equal(B.nudgeStatus({ ...base, snoozedUntil: ago(3) }, 5, NOW).show, true);
});
t('taking a backup resets everything: stamps the time + the library size, clears any snooze, sets the baseline; the banner goes away', () => {
  const m = B.afterBackup(meta({ snoozedUntil: ago(-3), since: '' }), 321, NOW);
  assert.deepEqual(m, { lastAt: NOW.toISOString(), lastCount: 321, since: NOW.toISOString(), snoozedUntil: '' });
  assert.equal(B.nudgeStatus(m, 321, NOW).show, false); assert.equal(B.nudgeStatus(m, 400, new Date(NOW.getTime() + 29 * 86400000)).show, false);
  assert.equal(B.nudgeStatus(m, 400, new Date(NOW.getTime() + 30 * 86400000)).show, true, '30 days later, with new data');
  assert.equal(B.afterBackup(meta({ since: '2026-01-01T00:00:00.000Z' }), 1, NOW).since, '2026-01-01T00:00:00.000Z', 'an existing baseline is kept');
});
t('baseline: set once, the first time a non-empty library is seen; never for an empty one; never overwritten', () => {
  assert.equal(B.withSince(meta(), 0, NOW).since, ''); const a = B.withSince(meta(), 3, NOW); assert.equal(a.since, NOW.toISOString());
  assert.equal(B.withSince(a, 3, new Date(NOW.getTime() + 99 * 86400000)), a, 'unchanged object when already set');
});
t('clock skew: a backup dated in the FUTURE never triggers; garbage dates behave like "no backup"', () => {
  assert.equal(B.nudgeStatus(meta({ lastAt: ago(-5), lastCount: 1 }), 9, NOW).show, false);
  assert.equal(B.daysSince('nope', NOW), null); assert.equal(B.daysSince('', NOW), null); assert.equal(B.daysSince(undefined, NOW), null); assert.equal(B.daysSince(ago(-2), NOW), -2);
});
t('wording: overdue says the number of days, never says it needs doing "now"; first-time message; both explain why', () => {
  const o = B.nudgeCopy({ kind: 'overdue', days: 34 }); assert.equal(o.title, 'It’s been 34 days since your last backup'); assert.match(o.body, /in case you ever delete something or a sync goes wrong/);
  const f = B.nudgeCopy({ kind: 'never', days: 9 }); assert.equal(f.title, 'You haven’t made a backup yet'); assert.equal(f.body, o.body);
});
t('last-backup line: none / today / yesterday / dated with the local day and "N days ago"', () => {
  assert.equal(B.lastBackupLine(meta(), NOW), 'No backup downloaded from this device yet.');
  assert.equal(B.lastBackupLine(meta({ lastAt: ago(0.2) }), NOW), 'Last backup: today'); assert.equal(B.lastBackupLine(meta({ lastAt: ago(1.2) }), NOW), 'Last backup: yesterday');
  assert.equal(B.lastBackupLine(meta({ lastAt: '2026-09-12T02:00:00.000Z' }), NOW), 'Last backup: 12 Sep 2026 (22 days ago)');
  assert.equal(B.lastBackupLine(meta({ lastAt: ago(-3) }), NOW), 'Last backup: today', 'a future stamp reads as today, not "-3 days ago"');
});
t('library fingerprint: shows + watched episodes + movies; junk is ignored; changes with data', () => {
  const st = { shows: { a: { watched: { '1x1': {}, '1x2': {} } }, b: { watched: {} }, c: null, d: 'x' }, movies: [{}, {}, {}] };
  assert.equal(B.libraryCount(st), (1 + 2) + (1 + 0) + 3); assert.equal(B.libraryCount({}), 0); assert.equal(B.libraryCount(null), 0); assert.equal(B.libraryCount({ shows: { a: {} }, movies: 'no' }), 1);
  const more = JSON.parse(JSON.stringify(st)); more.shows.b.watched['1x1'] = {}; assert.equal(B.libraryCount(more), B.libraryCount(st) + 1);
});
// ---- storage helpers with a fake storage
const fake = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), raw: m }; };
t('storage: round trip; missing / corrupt / hostile values load as safe defaults; bad fields are dropped one by one', () => {
  const s = fake(); assert.deepEqual(B.loadMeta(s), B.EMPTY_META);
  B.saveMeta(s, { lastAt: NOW.toISOString(), lastCount: 7, since: NOW.toISOString(), snoozedUntil: '' }); assert.deepEqual(B.loadMeta(s), { lastAt: NOW.toISOString(), lastCount: 7, since: NOW.toISOString(), snoozedUntil: '' });
  s.raw.set(B.META_KEY, '{oops'); assert.deepEqual(B.loadMeta(s), B.EMPTY_META); s.raw.set(B.META_KEY, 'null'); assert.deepEqual(B.loadMeta(s), B.EMPTY_META); s.raw.set(B.META_KEY, '[1,2]'); assert.deepEqual(B.loadMeta(s), B.EMPTY_META);
  s.raw.set(B.META_KEY, JSON.stringify({ lastAt: 'x', lastCount: -4, since: 5, snoozedUntil: { a: 1 }, extra: 'ignored' })); assert.deepEqual(B.loadMeta(s), B.EMPTY_META);
  s.raw.set(B.META_KEY, JSON.stringify({ lastAt: NOW.toISOString(), lastCount: 2.5 })); assert.equal(B.loadMeta(s).lastCount, null);
});
t('storage that throws (private mode / full) never breaks anything', () => {
  const bad = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('full'); } };
  assert.deepEqual(B.loadMeta(bad), B.EMPTY_META); B.saveMeta(bad, B.EMPTY_META);
});
t('the backup record is its own key (never inside the library, so it is not synced or exported)', () => assert.equal(B.META_KEY, 'watchnext-backup-v1'));
console.log(`\n${n} tests passed`);
