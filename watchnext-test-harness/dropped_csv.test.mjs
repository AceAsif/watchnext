process.env.TZ = 'Australia/Hobart';
import assert from 'node:assert/strict';
import * as L from '/home/claude/wl/src/components/libraryLogic.js';
import * as U from '/home/claude/wl/src/components/upnextLogic.js';
import * as B from '/home/claude/wl/src/store/backupMerge.js';
import * as C from '/home/claude/wl/src/components/csvExport.js';
import * as S from '/home/claude/wl/src/components/statsLogic.js';
import fs from 'node:fs';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('ok  -', name); };
const H = { watchedCount: (s) => Object.keys(s.watched || {}).length, lastWatchDate: (s) => Object.values(s.watched || {}).map((w) => w.at).sort().pop() || null };
const W = (s, from, to, at = '2026-09-01T10:00:00.000Z') => Object.fromEntries(Array.from({ length: to - from + 1 }, (_, i) => [`${s}x${from + i}`, { at, min: 40, n: 1 }]));
const show = (name, extra = {}) => ({ followed: true, name, totalEpisodes: 10, seasons: [{ n: 1, count: 10 }], watched: W(1, 1, 3), ...extra });
const F = { status: 'All', platform: 'All', query: '' };

// ====================================================== library status
t('Dropped is a fifth status, last', () => assert.deepEqual(L.SHOW_STATUSES, ['All', 'Watching', 'Finished', 'Not started', 'Dropped']));
const lib = [['a', show('A')], ['b', show('B', { dropped: true })], ['c', show('C', { watched: {} })], ['d', show('D', { watched: W(1, 1, 10) })], ['e', show('E', { dropped: true, watched: {} })], ['f', show('F', { dropped: false })], ['g', show('G', { dropped: 'yes' })]];
t('showStatus: dropped wins over everything; false / junk values do not drop', () => {
  assert.equal(L.showStatus(lib[1][1], H), 'Dropped'); assert.equal(L.showStatus(lib[4][1], H), 'Dropped');
  assert.equal(L.showStatus(lib[5][1], H), 'Watching'); assert.equal(L.showStatus(lib[6][1], H), 'Watching');
  assert.equal(L.showStatus(lib[0][1], H), 'Watching'); assert.equal(L.showStatus(lib[2][1], H), 'Not started'); assert.equal(L.showStatus(lib[3][1], H), 'Finished');
});
t('counts add up: All = Watching + Finished + Not started + Dropped', () => {
  const c = L.statusCounts(lib, F, H);
  assert.deepEqual(c, { All: 7, Watching: 3, Finished: 1, 'Not started': 1, Dropped: 2 });
  assert.equal(c.All, c.Watching + c.Finished + c['Not started'] + c.Dropped);
});
t('filterShows: the Dropped tab lists exactly the dropped shows; Watching no longer includes them', () => {
  assert.deepEqual(L.filterShows(lib, { ...F, status: 'Dropped' }, H).map((e) => e[0]), ['b', 'e']);
  assert.ok(!L.filterShows(lib, { ...F, status: 'Watching' }, H).some((e) => e[0] === 'b'));
  assert.equal(L.filterShows(lib, F, H).length, 7); // All still lists everything
});
t('a dropped show that is not in the library (followed=false) is still hidden', () => {
  assert.equal(L.filterShows([['x', show('X', { followed: false, dropped: true })]], { ...F, status: 'Dropped' }, H).length, 0);
});

// ====================================================== Up Next
const TODAY = '2026-10-04';
const air = (d) => ({ upcoming: [{ s: 1, e: 4, name: 'Four', air: d }], nextAir: { season: 1, episode: 4, date: d, name: 'Four' }, tmdbId: 5 });
const upShows = [
  ['live', show('Live')], // episodes 4+ have aired and are unwatched -> Continue
  ['gone', show('Gone', { dropped: true })],
  ['airLive', show('AirLive', air('2026-10-07'))], // caught up, next episode airs soon -> On the way
  ['airGone', show('AirGone', { dropped: true, ...air('2026-10-08') })],
];
t('Up Next: a dropped show is in no list (Continue, On the way, or refresh targets)', () => {
  const r = U.buildUpNext(upShows, TODAY, H);
  assert.deepEqual(r.cont.map((x) => x.id), ['live']);
  assert.deepEqual(r.items.map((x) => x.id), ['airLive']);
  assert.deepEqual(r.syncTargets.map(([id]) => id), ['airLive']);
});
t('Up Next: resuming (dropped:false) brings every list back', () => {
  const resumed = upShows.map(([id, s]) => [id, s.dropped ? { ...s, dropped: false } : s]);
  const r = U.buildUpNext(resumed, TODAY, H);
  assert.deepEqual(r.cont.map((x) => x.id).sort(), ['gone', 'live']);
  assert.deepEqual(r.items.map((x) => x.id).sort(), ['airGone', 'airLive']);
  assert.deepEqual(r.syncTargets.map(([id]) => id).sort(), ['airGone', 'airLive']);
});

// ====================================================== backup merge
const local = (shows, movies = []) => ({ shows, movies });
const file = (shows) => ({ shows, movies: [] });
t('restore: a show you have no dropped flag for takes the file’s (true + date)', () => {
  const r = B.mergeBackup(local({ 'tmdb:1': show('A') }), file({ 'tmdb:1': show('A', { dropped: true, droppedAt: '2026-08-01T00:00:00.000Z' }) }));
  assert.equal(r.shows['tmdb:1'].dropped, true); assert.equal(r.shows['tmdb:1'].droppedAt, '2026-08-01T00:00:00.000Z');
});
t('restore: YOUR explicit choice wins — resumed (false) stays resumed, dropped stays dropped', () => {
  let r = B.mergeBackup(local({ 'tmdb:1': show('A', { dropped: false, droppedAt: null }) }), file({ 'tmdb:1': show('A', { dropped: true, droppedAt: '2026-08-01T00:00:00.000Z' }) }));
  assert.equal(r.shows['tmdb:1'].dropped, false); assert.equal(r.shows['tmdb:1'].droppedAt, null);
  r = B.mergeBackup(local({ 'tmdb:1': show('A', { dropped: true, droppedAt: '2026-09-09T00:00:00.000Z' }) }), file({ 'tmdb:1': show('A', { dropped: false }) }));
  assert.equal(r.shows['tmdb:1'].dropped, true); assert.equal(r.shows['tmdb:1'].droppedAt, '2026-09-09T00:00:00.000Z');
});
t('restore: hostile values are removed (junk dropped, non-string date), for new and existing shows', () => {
  const bad = show('A', { dropped: 'true', droppedAt: { x: 1 } });
  let r = B.mergeBackup(local({}), file({ 'tmdb:9': bad }));
  assert.ok(!('dropped' in r.shows['tmdb:9']) && !('droppedAt' in r.shows['tmdb:9']));
  r = B.mergeBackup(local({ 'tmdb:9': show('A') }), file({ 'tmdb:9': bad }));
  assert.ok(!('dropped' in r.shows['tmdb:9']) && !('droppedAt' in r.shows['tmdb:9']));
  r = B.mergeBackup(local({}), file({ 'tmdb:9': show('A', { dropped: true, droppedAt: 12345 }) }));
  assert.equal(r.shows['tmdb:9'].dropped, true); assert.equal(r.shows['tmdb:9'].droppedAt, null);
});
t('restore twice is a no-op (idempotent) with dropped shows', () => {
  const f = file({ 'tmdb:1': show('A', { dropped: true, droppedAt: '2026-08-01T00:00:00.000Z' }) });
  const once = B.mergeBackup(local({}), f);
  const twice = B.mergeBackup(local(once.shows), f);
  assert.equal(twice.touchedIds.length, 0);
  const plain = B.mergeBackup(local({ 'tmdb:1': show('A') }), file({ 'tmdb:1': show('A') }));
  assert.equal(plain.touchedIds.length, 0, 'shows without the flag are not rewritten');
});

// ====================================================== CSV: cells
t('csvCell: quotes, commas, newlines, quotes-in-quotes; booleans; null', () => {
  assert.equal(C.csvCell('plain'), 'plain'); assert.equal(C.csvCell('a,b'), '"a,b"'); assert.equal(C.csvCell('say "hi"'), '"say ""hi"""');
  assert.equal(C.csvCell('line1\nline2'), '"line1\nline2"'); assert.equal(C.csvCell('x\r\ny'), '"x\r\ny"');
  assert.equal(C.csvCell(true), 'true'); assert.equal(C.csvCell(false), 'false'); assert.equal(C.csvCell(null), ''); assert.equal(C.csvCell(undefined), ''); assert.equal(C.csvCell(0), '0');
});
t('formula-looking TEXT gets an apostrophe; numbers and non-text cells are untouched', () => {
  for (const v of ['=SUM(A1)', '+1', '-2', '@x', '\tfoo']) assert.equal(C.csvCell(v, true).replace(/"/g, '')[0], "'", v);
  assert.equal(C.csvCell(-5), '-5'); assert.equal(C.csvCell('-5'), '-5'); // not a text column
  assert.equal(C.csvCell('Naruto', true), 'Naruto'); assert.equal(C.csvCell('', true), '');
});
t('toCsv: BOM, CRLF, header first, trailing newline, escaped row', () => {
  const out = C.toCsv([{ h: 'a' }, { h: 'b', text: true }], [[1, 'x,y'], [2, '=hack']]);
  assert.equal(out, '\uFEFFa,b\r\n1,"x,y"\r\n2,\'=hack\r\n');
});
t('csvFileName', () => assert.equal(C.csvFileName('episodes', '2026-10-04'), 'watchnext-episodes-2026-10-04.csv'));

// ====================================================== CSV: dates (device = Hobart)
t('localDate/localTime: Hobart date differs from the UTC date in the morning (the Stats caveat)', () => {
  assert.equal(C.localDate('2026-09-30T20:30:00.000Z'), '2026-10-01'); // 06:30 Hobart, AEST
  assert.equal(C.localTime('2026-09-30T20:30:00.000Z'), '06:30');
  assert.equal(C.localDate('2026-10-04T10:00:00.000Z'), '2026-10-04');
  assert.equal(C.localDate('2026-05-05'), '2026-05-05'); assert.equal(C.localTime('2026-05-05'), '');
  assert.equal(C.localDate(''), ''); assert.equal(C.localDate('not a date'), ''); assert.equal(C.localDate(undefined), '');
});

// ====================================================== CSV: data
const state = {
  shows: {
    'tmdb:2': show('Bleach, The "Thousand-Year" Arc', { tmdbId: 2, platform: 'disney', genres: ['Animation', 'Action'], dropped: true, droppedAt: '2026-09-20T01:00:00.000Z', watched: { '1x1': { at: '2026-09-30T20:30:00.000Z', min: 24, n: 2 }, '1x2': { at: '2026-10-01T10:00:00.000Z', min: 24, n: 1 } }, notes: { '1x1': { react: 'love', text: 'Great,\nstart', at: 'x' } } }),
    'tmdb:1': show('Aardvark', { tmdbId: 1, rating: 4, ratedAt: '2026-09-01T00:00:00.000Z', addedAt: '2026-08-01T00:00:00.000Z', watched: { '2x10': { at: '2026-09-02T09:15:00.000Z', min: 40 }, '1x1': { at: '2026-09-01T09:15:00.000Z' } }, runtimeMin: 45, anime: { id: 7 } }),
    'tmdb:3': { followed: false, watchlist: true, name: '=Plan to watch', tmdbId: 3 },
    '__proto__': { name: 'bad', watched: {} },
  },
  movies: [
    { tmdbId: 9, name: 'Film B', status: 'watched', watchedAt: '2026-05-06T10:00:00.000Z', rating: 5, runtimeMin: 100, year: 2026, react: 'funny', note: 'lol' },
    { tmdbId: 8, name: 'Film A', status: 'planned' },
    null,
  ],
  settings: { tmdbKey: 'SECRET-KEY-123' },
};
const parse = (csv) => csv.replace(/^\uFEFF/, '').split('\r\n').filter(Boolean);
t('episodes: one row per watch, sorted by time; local date, drop flag, genres, reaction and note', () => {
  const rows = C.episodeRows(state);
  assert.equal(rows.length, 4);
  assert.deepEqual(rows.map((r) => `${r[2].slice(0, 3)}${r[3]}x${r[4]}`), ['Aar1x1', 'Aar2x10', 'Ble1x1', 'Ble1x2']);
  const b = rows[2];
  assert.deepEqual(b.slice(5, 10), ['2026-09-30T20:30:00.000Z', '2026-10-01', '06:30', 2, 24]);
  assert.equal(b[11], 'disney'); assert.equal(b[12], 'Dropped'); assert.equal(b[13], true); assert.equal(b[14], true);
  assert.equal(b[15], 'Animation|Action'); assert.equal(b[16], 'Loved it'); assert.equal(b[17], 'Great,\nstart');
  assert.equal(rows[0][9], 45, 'falls back to the show runtime when a watch has no minutes');
  assert.equal(rows[0][3], 1); assert.equal(rows[0][8], 1, 'watch_count defaults to 1');
});
t('episodes: the CSV text survives a round trip of quotes / commas / newlines', () => {
  const { text, count, fileName } = C.buildCsv('episodes', state, '2026-10-04');
  assert.equal(count, 4); assert.equal(fileName, 'watchnext-episodes-2026-10-04.csv');
  assert.ok(text.includes('"Bleach, The ""Thousand-Year"" Arc"'));
  assert.ok(text.includes('"Great,\nstart"'));
  assert.equal(parse(text)[0].split(',').length, C.EPISODE_COLUMNS.length);
});
t('episodes: is_bulk_import uses the same minute rule as Stats (>= BATCH_MIN in one minute)', () => {
  const dump = show('Dump', { watched: W(1, 1, S.BATCH_MIN, '2019-03-05T10:00:30.000Z') });
  const justUnder = show('Under', { watched: W(1, 1, S.BATCH_MIN - 1, '2019-03-06T10:00:30.000Z') });
  const rows = C.episodeRows({ shows: { a: dump, b: justUnder } });
  assert.equal(rows.filter((r) => r[2] === 'Dump').every((r) => r[10] === true), true);
  assert.equal(rows.filter((r) => r[2] === 'Under').every((r) => r[10] === false), true);
  // two shows each below the threshold but together over it in the same minute -> bulk (same as Stats, which counts per minute across shows)
  const half = S.BATCH_MIN / 2 | 0;
  const r2 = C.episodeRows({ shows: { a: show('P', { watched: W(1, 1, half + 1, '2019-03-07T10:00:00.000Z') }), b: show('Q', { watched: W(1, 1, half + 1, '2019-03-07T10:00:59.000Z') }) } });
  assert.ok(r2.every((r) => r[10] === true));
});
t('episodes: malformed keys, junk entries and __proto__ shows are skipped, never thrown on', () => {
  const rows = C.episodeRows({ shows: { a: show('A', { watched: { 'oops': { at: 'x' }, '1x1': null, '1x2': { at: '2026-01-01T00:00:00.000Z' } } }) } });
  assert.equal(rows.length, 1);
  assert.deepEqual(C.episodeRows({}), []); assert.deepEqual(C.episodeRows(undefined), []);
});
t('shows: one row each (library, watchlist, dropped), progress, first/last watch, anime flag', () => {
  const rows = C.showRows(state);
  assert.deepEqual(rows.map((r) => r[2]), ['=Plan to watch', 'Aardvark', 'Bleach, The "Thousand-Year" Arc']);
  const [plan, aard, bl] = rows;
  assert.deepEqual([plan[3], plan[4], plan[5]], [false, true, 'Not started']);
  assert.deepEqual([aard[3], aard[5], aard[9], aard[14], aard[15], aard[20]], [true, 'Watching', 4, 2, 20, true]);
  assert.equal(aard[18], '2026-09-01T09:15:00.000Z'); assert.equal(aard[19], '2026-09-02T09:15:00.000Z');
  assert.deepEqual([bl[5], bl[6], bl[7], bl[20]], ['Dropped', true, '2026-09-20T01:00:00.000Z', false]);
  assert.equal(C.csvCell('=Plan to watch', true), "'=Plan to watch");
});
t('movies: rows sorted by date, reaction label, local date, junk entries skipped', () => {
  const rows = C.movieRows(state);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((r) => r[1]), ['Film A', 'Film B']); // planned (no date) sorts first
  const b = rows[1]; assert.deepEqual([b[2], b[3], b[4], b[5], b[10], b[11]], ['watched', '2026-05-06T10:00:00.000Z', '2026-05-06', 5, 'Funny', 'lol']);
  assert.deepEqual(C.movieRows({}), []);
});
t('the TMDB key / settings never appear in any export', () => {
  for (const k of ['episodes', 'shows', 'movies']) assert.ok(!C.buildCsv(k, state, '2026-10-04').text.includes('SECRET-KEY-123'));
});
t('every kind: header column count matches every row; row counts reported', () => {
  for (const k of ['episodes', 'shows', 'movies']) {
    const { text, count } = C.buildCsv(k, state, '2026-10-04');
    assert.equal(parse(text).length - 1 >= count, true);
    for (const r of C.CSV_KINDS[k].rows(state)) assert.equal(r.length, C.CSV_KINDS[k].columns.length, k);
  }
  assert.throws(() => C.buildCsv('nope', state, 'x'));
  assert.equal(C.csvDoneText('episodes', 1), 'Saved 1 episode as a CSV file.'); assert.equal(C.csvDoneText('movies', 1234), 'Saved 1,234 movies as a CSV file.');
});
t('scale: 9,000 episode watches build in well under a second', () => {
  const big = { shows: { a: show('Big', { watched: Object.fromEntries(Array.from({ length: 9000 }, (_, i) => [`${1 + (i / 500 | 0)}x${1 + (i % 500)}`, { at: new Date(Date.UTC(2020, 0, 1) + i * 3600e3).toISOString(), min: 24 }])) }) } };
  const t0 = Date.now(); const out = C.buildCsv('episodes', big, 'x'); const ms = Date.now() - t0;
  assert.equal(out.count, 9000); assert.ok(ms < 1000, ms + ' ms');
});

// ====================================================== wiring guards (source-level)
const src = (p) => fs.readFileSync('/home/claude/wl/src/' + p, 'utf8');
t('Stats completion keeps dropped shows out of Finished / Watching / Not started', () => {
  const s = src('pages/Stats.jsx');
  assert.match(s, /if \(show\.dropped === true\) dropped\+\+;[^\n]*\n\s*else if \(total && seen >= total\) finished\+\+;/);
});
t('db.js: setShowDropped writes explicit booleans and null (never undefined) and marks the show dirty', () => {
  const s = src('store/db.js'); const i = s.indexOf('export function setShowDropped');
  const body = s.slice(i, s.indexOf('\n}\n', i));
  assert.match(body, /dropped: !!dropped/); assert.match(body, /: null/); assert.match(body, /markShowDirty\(id\)/); assert.doesNotMatch(body, /undefined/);
});
t('BATCH_MIN used by the CSV is the Stats one (and still equals db.js PACE_BATCH_MIN)', () => {
  const m = /const PACE_BATCH_MIN\s*=\s*(\d+)/.exec(src('store/db.js')); assert.equal(S.BATCH_MIN, +m[1]);
});

console.log(`\n${n} tests passed`);
