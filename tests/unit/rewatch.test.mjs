import assert from 'node:assert/strict';
import * as R from '/home/claude/wl/src/components/rewatchLogic.js';
let n = 0; const t = (name, fn) => { fn(); n++; console.log('ok  -', name); };
const ep = (nn, at = '2026-09-01T10:00:00.000Z') => ({ at, min: 40, n: nn });
const show = (name, ns) => ({ name, watched: Object.fromEntries(ns.map((v, i) => [`1x${i + 1}`, ep(v)])) });

t('shows: rewatches = sum of (n-1); eps = how many episodes were rewatched; sorted high to low', () => {
  const r = R.rewatchedShows({ a: show('Suits', [1, 3, 2, 1]), b: show('Office', [5, 1]), c: show('Once', [1, 1, 1]) });
  assert.deepEqual(r.rows, [{ label: 'Office', value: 4, eps: 1 }, { label: 'Suits', value: 3, eps: 2 }]);
  assert.equal(r.total, 7); assert.equal(r.titles, 2);
});
t('shows: ties break on episodes rewatched, then name', () => {
  const r = R.rewatchedShows({ a: show('Zed', [3]), b: show('Amy', [2, 2]), c: show('Bob', [3]) });
  assert.deepEqual(r.rows.map((x) => x.label), ['Amy', 'Bob', 'Zed']); // all value 2; Amy has 2 eps; Bob < Zed
});
t('shows: n of 1, missing, 0, negative, NaN, text, decimals — never a rewatch / never throws; 2.9 counts as 2', () => {
  const r = R.rewatchedShows({ a: show('X', [1, undefined, 0, -3, NaN, 'abc', null]), b: show('Y', [2.9]) });
  assert.deepEqual(r.rows.map((x) => [x.label, x.value]), [['Y', 1]]);
});
t('shows: nothing rewatched, empty, junk input', () => {
  for (const bad of [undefined, null, {}, { a: null }, { a: 5 }, { a: { name: 'x' } }, { a: { name: 'x', watched: { '1x1': null } } }]) assert.deepEqual(R.rewatchedShows(bad), { rows: [], total: 0, titles: 0 }, JSON.stringify(bad));
});
t('shows: limit applies to rows only; total and titles still cover everyone', () => {
  const many = Object.fromEntries(Array.from({ length: 20 }, (_, i) => ['s' + i, show('S' + String(i).padStart(2, '0'), [2 + (i % 4)])]));
  const r = R.rewatchedShows(many); assert.equal(r.rows.length, R.REWATCH_LIMIT); assert.equal(r.titles, 20);
  assert.equal(r.total, Object.values(many).reduce((a, s) => a + Object.values(s.watched)[0].n - 1, 0));
  assert.equal(R.rewatchedShows(many, 3).rows.length, 3);
});
t('shows: same name twice stays distinguishable (unique list keys)', () => {
  const r = R.rewatchedShows({ a: show('Dup', [3]), b: show('Dup', [2]) });
  assert.deepEqual(r.rows.map((x) => x.label), ['Dup', 'Dup (2)']); assert.equal(new Set(r.rows.map((x) => x.label)).size, 2);
});
t('shows: missing name, and the shows map is not mutated', () => {
  const s = { a: { watched: { '1x1': ep(2) } } }; const copy = JSON.stringify(s);
  assert.equal(R.rewatchedShows(s).rows[0].label, 'Untitled'); assert.equal(JSON.stringify(s), copy);
});

const mv = (name, extra = {}) => ({ name, status: 'watched', watchedAt: '2026-05-05T10:00:00.000Z', ...extra });
t('movies: viewings are separate entries; 3 viewings = 2 rewatches; sorted; single viewings excluded', () => {
  const r = R.rewatchedMovies([mv('Dune', { tmdbId: 1 }), mv('Dune', { tmdbId: 1 }), mv('Dune', { tmdbId: 1 }), mv('Up', { tmdbId: 2 }), mv('Up', { tmdbId: 2 }), mv('Once', { tmdbId: 3 })]);
  assert.deepEqual(r.rows, [{ label: 'Dune', value: 2, times: 3 }, { label: 'Up', value: 1, times: 2 }]); assert.equal(r.total, 3); assert.equal(r.titles, 2);
});
t('movies: planned (watchlist) entries are not viewings; entries with no status count as watched', () => {
  const r = R.rewatchedMovies([mv('Dune', { tmdbId: 1 }), mv('Dune', { tmdbId: 1, status: 'planned' }), { name: 'Old', tmdbId: 4, watchedAt: 'x' }, { name: 'Old', tmdbId: 4, watchedAt: 'y' }]);
  assert.deepEqual(r.rows.map((x) => [x.label, x.value]), [['Old', 1]]);
});
t('movies: imported films with no tmdbId group by name, ignoring case and spaces; a tmdbId film is separate from a same-named import', () => {
  const r = R.rewatchedMovies([mv('Heat'), mv(' heat '), mv('HEAT'), mv('Heat', { tmdbId: 9 })]);
  assert.deepEqual(r.rows.map((x) => [x.value, x.times]), [[2, 3]]);
});
t('movies: junk entries (null, no name, no id, non-array) are skipped, never thrown on', () => {
  for (const bad of [undefined, null, {}, 'x', [null, 5, {}, { status: 'watched' }, { name: '  ' }]]) assert.deepEqual(R.rewatchedMovies(bad), { rows: [], total: 0, titles: 0 });
});
t('movies: the label is the most recent non-empty name; same-id films keep one row', () => {
  const r = R.rewatchedMovies([mv('Old Title', { tmdbId: 7 }), mv('', { tmdbId: 7 }), mv('New Title', { tmdbId: 7 })]);
  assert.equal(r.rows.length, 1); assert.equal(r.rows[0].label, 'New Title');
});
t('summary wording: singular/plural', () => {
  assert.equal(R.rewatchSummary(1, 1, 'show'), '1 rewatch across 1 show, all time.');
  assert.equal(R.rewatchSummary(12, 4, 'movie'), '12 rewatches across 4 movies, all time.');
  assert.equal(R.rewatchSummary(1234, 2, 'show'), '1,234 rewatches across 2 shows, all time.');
});
t('scale: 5,000 shows x 20 episodes in well under a second', () => {
  const big = Object.fromEntries(Array.from({ length: 5000 }, (_, i) => ['s' + i, show('S' + i, Array.from({ length: 20 }, (_, j) => 1 + ((i + j) % 3)))]));
  const t0 = Date.now(); const r = R.rewatchedShows(big); assert.ok(Date.now() - t0 < 1000); assert.equal(r.rows.length, 8);
});
console.log(`\n${n} tests passed`);
