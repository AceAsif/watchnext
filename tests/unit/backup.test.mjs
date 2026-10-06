import assert from 'node:assert/strict';
import { mergeBackup, isBackupFile, isTvTimeFile } from '/home/claude/wl/src/store/backupMerge.js';
import { backupState } from '/home/claude/wl/src/components/settingsLogic.js';
let n = 0; const t = (name, fn) => { fn(); n++; console.log('ok  -', name); };
const W = (k, at = '2026-03-01T10:00:00.000Z', cnt = 1) => Object.fromEntries(Array.from({ length: k }, (_, i) => [`1x${i + 1}`, { at, min: 40, n: cnt }]));
const ORIGINAL = {
  shows: {
    'tmdb:1': { name: 'Suits', tmdbId: 1, followed: true, poster: '/a.jpg', totalEpisodes: 134, rating: 4, ratedAt: '2026-05-01T00:00:00.000Z', platform: 'netflix', watched: W(30), seasons: [{ n: 1, count: 12 }], genres: ['Drama'], addedAt: '2026-01-01T00:00:00.000Z', lastSynced: '2026-09-01T00:00:00.000Z', nextAir: { season: 9, episode: 1, date: '2027-01-01' } },
    'tmdb:2': { name: 'Wishlist', tmdbId: 2, followed: false, watchlist: true, watched: {} },
    'tvdb:77': { name: 'Old Import', tvdbId: 77, followed: false, watched: W(5, '2018-08-12T00:00:00.000Z', 2) },
  },
  movies: [
    { name: 'Akira', tmdbId: 9, watchedAt: '2026-05-01T10:00:00.000Z', runtimeMin: 124, rating: 5, platform: 'cinema' },
    { name: 'Akira', tmdbId: 9, watchedAt: '2026-08-01T10:00:00.000Z', runtimeMin: 124 },          // a rewatch
    { name: 'Planned One', tmdbId: 10, status: 'planned', runtimeMin: 100 },
  ],
  settings: { tmdbKey: 'SECRET' },
};
const EMPTY = () => ({ shows: {}, movies: [] });
const backup = JSON.parse(JSON.stringify(backupState(ORIGINAL)));      // exactly what "Download backup" writes, then read back

t('file detection: backup (shows is an object) vs TV Time export (shows is an array) vs junk', () => {
  assert.equal(isBackupFile(backup), true); assert.equal(isTvTimeFile(backup), false);
  assert.equal(isBackupFile({ shows: [] }), false); assert.equal(isTvTimeFile({ shows: [] }), true);
  for (const j of [null, undefined, 5, 'x', [], { hello: 1 }, { movies: [] }]) { assert.equal(isBackupFile(j), false); assert.equal(isTvTimeFile(j), false); }
  assert.equal(isBackupFile({ shows: {} }), true);
});
t('ROUND TRIP: restoring a backup into an EMPTY state reproduces every show and movie exactly (the key stays out)', () => {
  const r = mergeBackup(EMPTY(), backup);
  assert.deepEqual(r.shows, ORIGINAL.shows); assert.deepEqual(r.movies, ORIGINAL.movies);
  assert.deepEqual(r.summary, { showsAdded: 3, showsUpdated: 0, watchesAdded: 35, moviesAdded: 3, skipped: 0, notesAdded: 0, goalsAdded: 0 });
  assert.deepEqual(r.touchedIds.sort(), ['tmdb:1', 'tmdb:2', 'tvdb:77']); assert.equal(r.moviesChanged, true);
  assert.ok(!JSON.stringify(r).includes('SECRET'));
});
t('IDEMPOTENT: restoring the same backup twice changes nothing the second time', () => {
  const first = mergeBackup(EMPTY(), backup); const second = mergeBackup({ shows: first.shows, movies: first.movies }, backup);
  assert.deepEqual(second.summary, { showsAdded: 0, showsUpdated: 0, watchesAdded: 0, moviesAdded: 0, skipped: 0, notesAdded: 0, goalsAdded: 0 });
  assert.deepEqual(second.touchedIds, []); assert.equal(second.moviesChanged, false); assert.deepEqual(second.shows, first.shows); assert.deepEqual(second.movies, first.movies);
});
t('NEVER modifies its inputs (local state or the parsed file)', () => {
  const local = { shows: { 'tmdb:1': { name: 'Suits', watched: W(2) } }, movies: [] }; const lb = JSON.stringify(local), bb = JSON.stringify(backup);
  mergeBackup(local, backup); assert.equal(JSON.stringify(local), lb); assert.equal(JSON.stringify(backup), bb);
});
t('MERGE keeps YOUR data: your rating/platform/poster win; the backup only adds missing watched episodes and fills blanks', () => {
  const local = { shows: { 'tmdb:1': { name: 'Suits', tmdbId: 1, followed: true, rating: 2, ratedAt: '2026-09-09T00:00:00.000Z', platform: 'prime', poster: '', watched: W(10, '2026-09-01T10:00:00.000Z') } }, movies: [] };
  const r = mergeBackup(local, backup); const s = r.shows['tmdb:1'];
  assert.equal(s.rating, 2); assert.equal(s.ratedAt, '2026-09-09T00:00:00.000Z'); assert.equal(s.platform, 'prime');
  assert.equal(s.poster, '/a.jpg');                              // blank locally -> filled from the backup
  assert.equal(Object.keys(s.watched).length, 30);               // 10 yours + 20 missing ones
  assert.equal(s.watched['1x1'].at, '2026-09-01T10:00:00.000Z'); // your entry for a shared episode is kept
  assert.equal(r.summary.showsUpdated, 1); assert.equal(r.summary.showsAdded, 2); assert.equal(r.summary.watchesAdded, 20 + 5);
});
t('a rating you never set is taken from the backup (with its date)', () => {
  const r = mergeBackup({ shows: { 'tmdb:1': { name: 'Suits', followed: true, watched: {} } }, movies: [] }, backup);
  assert.equal(r.shows['tmdb:1'].rating, 4); assert.equal(r.shows['tmdb:1'].ratedAt, '2026-05-01T00:00:00.000Z');
});
t('a rewatch count is never lost (higher n wins) but a lower one never overwrites', () => {
  const l = { shows: { 'tvdb:77': { name: 'X', watched: { '1x1': { at: 'a', n: 5 }, '1x2': { at: 'b', n: 1 } } } }, movies: [] };
  const r = mergeBackup(l, backup).shows['tvdb:77']; assert.equal(r.watched['1x1'].n, 5); assert.equal(r.watched['1x2'].n, 2);
});
t('library beats watchlist: followed anywhere => followed, not also watchlist; watchlist only if followed nowhere', () => {
  const b = { shows: { a: { name: 'A', watchlist: true, watched: {} }, b: { name: 'B', followed: true, watchlist: true, watched: {} } } };
  const l = { shows: { a: { name: 'A', followed: true, watched: {} }, b: { name: 'B', watched: {} } }, movies: [] };
  const r = mergeBackup(l, b).shows; assert.deepEqual([r.a.followed, r.a.watchlist, r.b.followed, r.b.watchlist], [true, false, true, false]);
  const r2 = mergeBackup({ shows: { c: { name: 'C', watched: {} } }, movies: [] }, { shows: { c: { name: 'C', watchlist: true, watched: {} } } }).shows.c; assert.deepEqual([!!r2.followed, !!r2.watchlist], [false, true]);
});
t('MOVIES: adds missing watches (incl. rewatches), skips ones you have, planned never duplicates a watched film, watched replaces a planned one', () => {
  const local = { shows: {}, movies: [{ name: 'Akira', tmdbId: 9, watchedAt: '2026-05-01T10:00:00.000Z' }, { name: 'Planned One', tmdbId: 10, watchedAt: '2026-09-01T10:00:00.000Z' }] };
  const r = mergeBackup(local, backup);
  assert.equal(r.movies.filter((m) => m.tmdbId === 9).length, 2);   // original + the rewatch from the backup
  assert.equal(r.movies.filter((m) => m.tmdbId === 10).length, 1);  // you already watched it: the planned copy is not added
  assert.equal(r.summary.moviesAdded, 1);
  const r2 = mergeBackup({ shows: {}, movies: [{ name: 'Planned One', tmdbId: 10, status: 'planned' }] }, { shows: {}, movies: [{ name: 'Planned One', tmdbId: 10, watchedAt: '2026-10-01T10:00:00.000Z' }] });
  assert.deepEqual(r2.movies.map((m) => m.status || 'watched'), ['watched']); assert.equal(r2.moviesChanged, true);
});
t('SECURITY: "__proto__" / "constructor" keys from a hostile file are skipped and nothing global is polluted', () => {
  const evil = JSON.parse('{"shows":{"__proto__":{"name":"x","polluted":true},"constructor":{"name":"y"},"tmdb:5":{"name":"Ok","watched":{"__proto__":{"at":"z"},"1x1":{"at":"a","n":1}}}},"movies":[]}');
  const r = mergeBackup(EMPTY(), evil);
  assert.deepEqual(Object.keys(r.shows), ['tmdb:5']); assert.equal({}.polluted, undefined); assert.equal(Object.getPrototypeOf(r.shows), Object.prototype);
  assert.equal(r.summary.skipped, 2);
  const hostileMerge = mergeBackup({ shows: { 'tmdb:5': { name: 'Ok', watched: {} } }, movies: [] }, evil); assert.equal({}.polluted, undefined); assert.equal(Object.keys(hostileMerge.shows['tmdb:5'].watched).includes('__proto__'), false);
});
t('MALFORMED entries are skipped, not fatal: non-object shows, junk movies, watched that is not an object', () => {
  const r = mergeBackup(EMPTY(), { shows: { a: 'nope', b: null, c: [], d: { name: 'D', watched: 'oops' }, e: { name: 'E' } }, movies: ['x', 5, null, { foo: 1 }, { name: 'Good', watchedAt: 'w' }] });
  assert.deepEqual(Object.keys(r.shows).sort(), ['d', 'e']); assert.deepEqual(r.shows.d.watched, {}); assert.equal(r.movies.length, 1); assert.equal(r.summary.skipped, 3 + 4);
});
t('a file that is not a WatchNext backup throws a clear error (TV Time export, junk, wrong shapes)', () => {
  for (const j of [{ shows: [] }, { hello: 1 }, null, 'x', []]) assert.throws(() => mergeBackup(EMPTY(), j), /does not look like a WatchNext backup/);
});
t('an EMPTY backup is valid and changes nothing', () => { const r = mergeBackup({ shows: { a: { name: 'A', watched: {} } }, movies: [] }, { shows: {}, movies: [] }); assert.deepEqual(r.summary, { showsAdded: 0, showsUpdated: 0, watchesAdded: 0, moviesAdded: 0, skipped: 0, notesAdded: 0, goalsAdded: 0 }); assert.equal(r.moviesChanged, false); });
t('OLD backups that still contain the TMDB key: the key is ignored on restore (never copied into state)', () => {
  const old = JSON.parse(JSON.stringify(ORIGINAL)); const r = mergeBackup(EMPTY(), old); assert.ok(!('settings' in r)); assert.ok(!JSON.stringify(r).includes('SECRET'));
});
console.log(`\n${n} backup tests passed`);
