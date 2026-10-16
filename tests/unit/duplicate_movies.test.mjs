import assert from 'node:assert/strict';
import * as D from '../../src/components/duplicateMoviesLogic.js';
let n = 0; const t = (name, fn) => { fn(); n++; console.log('ok  -', name); };
const mv = (name, tmdbId, watchedAt, o = {}) => ({ name, ...(tmdbId != null ? { tmdbId } : null), watchedAt, status: 'watched', ...o });
const names = (r) => r.groups.map((g) => g.name);

t('same TMDB id twice is a duplicate; entries are listed oldest first with their dates', () => {
  const r = D.findDuplicateMovies([mv('Tiger 3', 1, '2026-07-07T10:00:00.000Z'), mv('Tiger 3', 1, '2026-03-19T09:00:00.000Z'), mv('Once', 2, '2026-01-01T00:00:00.000Z')]);
  assert.equal(r.titles, 1); assert.equal(r.extra, 1); assert.deepEqual(r.groups[0].entries.map((e) => e.date), ['2026-03-19', '2026-07-07']);
  assert.equal(r.groups[0].sameDay, false); assert.equal(D.dupTag(r.groups[0]), 'Different days');
});
t('same day twice is flagged "Same day" and listed before other duplicates', () => {
  const r = D.findDuplicateMovies([mv('Zed', 1, '2026-02-01T01:00:00Z'), mv('Zed', 1, '2026-03-01T01:00:00Z'), mv('Animal', 3, '2026-07-07T01:00:00Z'), mv('Animal', 3, '2026-07-07T23:00:00Z')]);
  assert.deepEqual(names(r), ['Animal', 'Zed']); assert.equal(r.groups[0].sameDay, true); assert.equal(D.dupTag(r.groups[0]), 'Same day');
});
t('no TMDB id: matched by title, ignoring case and extra spaces', () => {
  const r = D.findDuplicateMovies([mv('The  Hangover', null, '2026-01-01T00:00:00Z'), mv('the hangover ', null, '2026-02-01T00:00:00Z')]);
  assert.equal(r.titles, 1); assert.equal(r.groups[0].entries.length, 2); assert.equal(r.groups[0].unlinked, true);
});
t('an unlinked copy joins the ONE linked film with the same title, and is flagged', () => {
  const r = D.findDuplicateMovies([mv('Heat', 4, '2026-01-01T00:00:00Z'), mv('heat', null, '2026-02-01T00:00:00Z')]);
  assert.equal(r.titles, 1); assert.equal(r.groups[0].unlinked, true); assert.equal(D.dupTag(r.groups[0]), 'One not linked'); assert.deepEqual(r.groups[0].entries.map((e) => e.linked), [true, false]);
});
t('two different films with the same name (remakes) are NOT duplicates, and an unlinked copy is not guessed onto either', () => {
  const r = D.findDuplicateMovies([mv('Dune', 5, '2026-01-01T00:00:00Z'), mv('Dune', 6, '2026-02-01T00:00:00Z'), mv('Dune', null, '2026-03-01T00:00:00Z')]);
  assert.equal(r.titles, 0); assert.deepEqual(r.groups, []);
});
t('watchlist (planned) entries are ignored; a watched copy plus a planned one is not a duplicate', () => {
  const r = D.findDuplicateMovies([mv('Up', 7, '2026-01-01T00:00:00Z'), { name: 'Up', tmdbId: 7, status: 'planned' }]);
  assert.equal(r.titles, 0);
});
t('legacy entries with no status count as watched', () => {
  const a = { name: 'Old', tmdbId: 8, watchedAt: '2020-01-01T00:00:00Z' }; const b = { name: 'Old', tmdbId: 8, watchedAt: '2021-01-01T00:00:00Z' };
  assert.equal(D.findDuplicateMovies([a, b]).titles, 1);
});
t('three copies: extra counts every copy beyond the first, across titles', () => {
  const r = D.findDuplicateMovies([mv('A', 1, '2026-01-01Z'), mv('A', 1, '2026-02-01Z'), mv('A', 1, '2026-03-01Z'), mv('B', 2, '2026-01-01Z'), mv('B', 2, '2026-02-01Z')]);
  assert.equal(r.titles, 2); assert.equal(r.extra, 3);
});
t('entries carry rating and whether a note or reaction exists (never the note text)', () => {
  const r = D.findDuplicateMovies([mv('A', 1, '2026-01-01T00:00:00Z', { rating: 5, note: 'great' }), mv('A', 1, '2026-02-01T00:00:00Z', { react: 'love' }), mv('A', 1, '2026-03-01T00:00:00Z', { note: '   ' })]);
  assert.deepEqual(r.groups[0].entries.map((e) => [e.rating, e.hasNote]), [[5, true], [0, true], [0, false]]); assert.ok(!JSON.stringify(r).includes('great'));
});
t('junk never throws: null, non-arrays, missing names, bad dates, text ratings', () => {
  for (const bad of [null, undefined, 5, 'x', {}, [null, 5, 'x', {}, { status: 'watched' }, { name: '' }]]) assert.equal(D.findDuplicateMovies(bad).titles, 0);
  const r = D.findDuplicateMovies([mv('A', 1, 'nope', { rating: 'abc' }), mv('A', 1, undefined)]);
  assert.equal(r.titles, 1); assert.deepEqual(r.groups[0].entries.map((e) => e.date), ['', '']); assert.equal(r.groups[0].sameDay, false); assert.equal(r.groups[0].entries[0].rating, 0);
});
t('does not change its input', () => {
  const list = [mv('A', 1, '2026-02-01Z'), mv('A', 1, '2026-01-01Z')]; const before = JSON.stringify(list); D.findDuplicateMovies(list); assert.equal(JSON.stringify(list), before);
});
t('dayLabel: readable dates, "no date" for anything unusable', () => {
  assert.equal(D.dayLabel('2026-07-07T10:00:00.000Z'), '7 Jul 2026'); assert.equal(D.dayLabel('2026-12-31'), '31 Dec 2026');
  for (const x of ['', null, undefined, 'abc', '2026-13-01', 5]) assert.equal(D.dayLabel(x), 'no date');
});
t('intro wording: singular and plural', () => {
  assert.match(D.duplicatesIntro(1, 1), /^1 movie appears more than once.*\(1 extra copy\)/); assert.match(D.duplicatesIntro(12, 15), /^12 movies appear more than once.*\(15 extra copies\)/);
  assert.match(D.duplicatesIntro(2, 2), /Nothing is changed here/);
});
t('scale: 5,000 films with 300 duplicated, well under a second', () => {
  const list = []; for (let i = 0; i < 5000; i++) { list.push(mv('F' + i, i, '2026-01-01T00:00:00Z')); if (i % 16 === 0) list.push(mv('F' + i, i, '2026-02-01T00:00:00Z')); }
  const t0 = Date.now(); const r = D.findDuplicateMovies(list); assert.ok(Date.now() - t0 < 1000); assert.equal(r.titles, 313);
});
console.log(`\n${n} tests passed`);
