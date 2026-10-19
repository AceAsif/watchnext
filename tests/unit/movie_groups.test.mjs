import assert from 'node:assert/strict';
import * as G from '../../src/components/movieGroupsLogic.js';
import { shownMovies } from '../../src/components/libraryLogic.js';
let n = 0; const t = (name, fn) => { fn(); n++; console.log('ok  -', name); };
const mv = (index, name, tmdbId, day, o = {}) => ({ index, name, ...(tmdbId != null ? { tmdbId } : null), status: 'watched', watchedAt: `${day}T10:00:00.000Z`, ...o });

const LIB = [
  mv(0, 'Alvin and the Chipmunks', 6477, '2020-01-01', { rating: 3, poster: '/a.jpg' }),
  mv(1, 'Alvin and the Chipmunks', 6477, '2026-10-19'),
  mv(2, 'Alvin and the Chipmunks', 6477, '2023-05-05', { rating: 4 }),
  mv(3, 'Alvin and the Chipmunks', 6477, '2024-01-01'),
  mv(4, 'Shaun of the Dead', 747, '2026-10-10', { rating: 0.5 }),
  mv(5, 'heat', null, '2021-01-01'), mv(6, 'Heat ', null, '2022-01-01', { rating: 5 }),
  mv(7, 'Heat', 949, '2019-01-01'), // linked: a different group from the name-only copies
];

t('four viewings of one film become ONE group with times = 4, newest viewing first', () => {
  const g = G.groupMovies(LIB).find((x) => x.tmdbId === 6477);
  assert.equal(g.times, 4); assert.deepEqual(g.viewings.map((v) => v.index), [1, 3, 2, 0]);
  assert.equal(g.latest.index, 1); assert.equal(g.watchedAt, '2026-10-19T10:00:00.000Z');
});
t('the tile rating is the newest rating given (4, from 2023), and the poster comes from any viewing that has one', () => {
  const g = G.groupMovies(LIB).find((x) => x.tmdbId === 6477);
  assert.equal(g.rating, 4); assert.equal(g.poster, '/a.jpg');
});
t('unlinked copies group by name ignoring case and spaces; a linked film with the same name stays separate', () => {
  const gs = G.groupMovies(LIB); assert.equal(gs.length, 4);
  const nameOnly = gs.find((x) => x.key === 'nheat'); assert.equal(nameOnly.times, 2); assert.equal(nameOnly.rating, 5);
  assert.equal(gs.find((x) => x.tmdbId === 949).times, 1);
});
t('groups are newest-watched first, and the existing filter/sort works on them', () => {
  const gs = G.groupMovies(LIB);
  assert.deepEqual(gs.map((g) => g.name), ['Alvin and the Chipmunks', 'Shaun of the Dead', 'Heat ', 'Heat']);
  assert.deepEqual(shownMovies(gs, 'alvin', 'recent').map((g) => g.times), [4]);
  assert.deepEqual(shownMovies(gs, '', 'rating').map((g) => g.rating), [5, 4, 0.5, 0]);
});
t('groupOfIndex finds the film a viewing belongs to; viewingsLabel', () => {
  const gs = G.groupMovies(LIB);
  assert.equal(G.groupOfIndex(gs, 2).times, 4); assert.equal(G.groupOfIndex(gs, 99), null);
  assert.equal(G.viewingsLabel(1), 'Watched once'); assert.equal(G.viewingsLabel(4), 'Watched 4 times');
});
t('empty and junk input', () => {
  assert.deepEqual(G.groupMovies([]), []); assert.deepEqual(G.groupMovies(null), []);
  assert.equal(G.groupMovies([null, mv(0, '', null, '2020-01-01'), mv(1, '', null, '2020-01-02')]).length, 2); // no name, no id: never merged
});

console.log(`\n${n} movie groups tests passed`);
