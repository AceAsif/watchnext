import assert from 'node:assert/strict';
import * as S from '../../src/components/settingsLogic.js';
let n = 0; const t = (name, fn) => { fn(); n++; console.log('ok  -', name); };

t('keyStatus: empty / saved / unsaved (typed, edited, cleared, whitespace-tolerant)', () => {
  assert.equal(S.keyStatus('', ''), 'empty'); assert.equal(S.keyStatus(undefined, '  '), 'empty');
  assert.equal(S.keyStatus('abc', 'abc'), 'saved'); assert.equal(S.keyStatus(' abc ', 'abc'), 'saved');
  assert.equal(S.keyStatus('', 'abc'), 'unsaved'); assert.equal(S.keyStatus('abc', 'abcd'), 'unsaved'); assert.equal(S.keyStatus('abc', ''), 'unsaved');
});
const state = { shows: { a: { name: 'A' } }, movies: [{ name: 'M' }], settings: { tmdbKey: 'SECRET-KEY-123', other: 'keep' }, extra: 1 };
t('BACKUP NEVER CONTAINS THE TMDB KEY (anywhere in the JSON), and keeps everything else', () => {
  const b = S.backupState(state); const json = JSON.stringify(b);
  assert.ok(!json.includes('SECRET-KEY-123')); assert.ok(!('tmdbKey' in b.settings));
  assert.deepEqual(b.shows, state.shows); assert.deepEqual(b.movies, state.movies); assert.equal(b.settings.other, 'keep'); assert.equal(b.extra, 1);
});
t('backupState does not mutate the live state', () => { const before = JSON.stringify(state); S.backupState(state); assert.equal(JSON.stringify(state), before); assert.equal(state.settings.tmdbKey, 'SECRET-KEY-123'); });
t('backupState tolerates missing settings / empty key', () => {
  assert.deepEqual(S.backupState({ shows: {} }), { shows: {} }); assert.deepEqual(S.backupState({ settings: { tmdbKey: '' } }), { settings: {} });
});
t('backupFileName', () => assert.equal(S.backupFileName('2026-10-02'), 'watchnext-backup-2026-10-02.json'));
t('importResultText: real counts, singular/plural, and points at Tools (not the old "Sync with TMDB" button)', () => {
  const a = S.importResultText({ shows: 12, watches: 3400 }); assert.match(a, /^Imported 12 shows and 3,400 new episode watches\./); assert.match(a, /Tools on the Shows tab/); assert.doesNotMatch(a, /Sync with TMDB"/);
  assert.match(S.importResultText({ shows: 1, watches: 1 }), /^Imported 1 show and 1 new episode watch\./);
  assert.match(S.importResultText({ shows: 0, watches: 0 }), /^Imported 0 shows and 0 new episode watches\./);
});
t('orphanShows: neither followed nor on the watchlist, sorted by name, nameless safe', () => {
  const shows = { a: { name: 'Zed', followed: false }, b: { name: 'Abe' }, c: { name: 'In', followed: true }, d: { name: 'Wl', watchlist: true }, e: {} };
  assert.deepEqual(S.orphanShows(shows).map(([id]) => id), ['e', 'b', 'a']);
});
t('orphanMeta / orphanIntro', () => {
  assert.equal(S.orphanMeta(0), 'no history'); assert.equal(S.orphanMeta(60), '60 watched'); assert.equal(S.orphanMeta(1234), '1,234 watched');
  assert.match(S.orphanIntro(1), /^This show is in your data/); assert.match(S.orphanIntro(4), /^These 4 shows are in your data/); assert.match(S.orphanIntro(4), /including from the cloud and your other devices/);
});
t('deleteShowEffects: mentions the watched episodes only when there are some', () => {
  assert.deepEqual(S.deleteShowEffects(0), ['Removed from this device', 'Also removed from the cloud and your other signed-in devices']);
  assert.equal(S.deleteShowEffects(60)[0], 'Its 60 watched episodes are deleted too'); assert.equal(S.deleteShowEffects(1)[0], 'Its 1 watched episode is deleted too');
});
t('DELETE ALL is honest: device-only wording, and when signed in it says the cloud copy is NOT deleted', () => {
  assert.doesNotMatch(S.deleteAllIntro(false), /cloud/i); assert.match(S.deleteAllIntro(false), /from this device/);
  assert.match(S.deleteAllIntro(true), /cloud copy is NOT deleted and may sync back/);
  assert.equal(S.deleteAllEffects(false).length, 2); assert.match(S.deleteAllEffects(true)[2], /not deleted/);
  for (const s of [false, true]) assert.ok(!S.deleteAllEffects(s).some((l) => /cleared too|every other device/i.test(l)), 'must never claim the cloud is cleared');
});
t('restoreResultText: real counts, singular/plural, "nothing to restore", and skipped entries are reported', () => {
  const z = { showsAdded: 0, showsUpdated: 0, watchesAdded: 0, moviesAdded: 0, skipped: 0 };
  assert.equal(S.restoreResultText(z), 'Nothing to restore — this device already has everything in that file.');
  assert.equal(S.restoreResultText({ ...z, showsAdded: 6, watchesAdded: 107, moviesAdded: 4 }), 'Restored from backup: 6 shows added, 107 episode watches restored, 4 movies added.');
  assert.equal(S.restoreResultText({ ...z, showsAdded: 1, showsUpdated: 1, watchesAdded: 1, moviesAdded: 1 }), 'Restored from backup: 1 show added, 1 show updated, 1 episode watch restored, 1 movie added.');
  assert.equal(S.restoreResultText({ ...z, showsUpdated: 2, skipped: 1 }), 'Restored from backup: 2 shows updated, 1 unreadable entry skipped.');
  assert.match(S.restoreResultText({ ...z, skipped: 3 }), /3 unreadable entries skipped/);
});
console.log(`\n${n} settings tests passed`);
