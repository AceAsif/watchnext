import assert from 'node:assert/strict';
import { normTitle, sameTitle, currentFilm, savedAs, newNamePatch, oldNames, allPatches, oldNamesIntro } from '../../src/components/movieNamesLogic.js';
import { groupMovies } from '../../src/components/movieGroupsLogic.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('ok  -', name); };

t('small differences are the same title', () => {
  assert.ok(sameTitle('The Amazing Spider-Man 2', 'amazing spider man 2'));
  assert.ok(sameTitle('Fast & Furious', 'Fast and Furious'));
  assert.ok(sameTitle('Amélie', 'Amelie'));
  assert.ok(sameTitle('A Quiet Place', 'Quiet Place'));
  assert.ok(sameTitle('  Dune:  Part Two ', 'Dune Part Two'));
});
t('real differences are not', () => {
  assert.ok(!sameTitle('The Amazing Spider-Man 2', 'The Amazing Spider-Man'));
  assert.ok(!sameTitle('Amazing Spiderman 2: Rise of Electro', 'The Amazing Spider-Man 2'));
  assert.ok(!sameTitle('Heat', 'Heathers'));
  assert.equal(normTitle(null), '');
});

const D = { id: 102382, title: 'The Amazing Spider-Man 2', poster_path: '/new.jpg', release_date: '2014-04-16' };
const G = { name: 'Amazing Spider-Man 2', poster: '/old.jpg', year: '2014' };
t('the sheet shows TMDB\'s current name, poster and year', () => {
  assert.deepEqual(currentFilm(G, D), { name: 'The Amazing Spider-Man 2', poster: '/new.jpg', year: '2014', fromTmdb: true });
});
t('offline / not loaded / error: the newest viewing\'s name and poster', () => {
  assert.deepEqual(currentFilm(G, null), { name: 'Amazing Spider-Man 2', poster: '/old.jpg', year: '2014', fromTmdb: false });
  assert.deepEqual(currentFilm(G, { error: 'offline' }), { name: 'Amazing Spider-Man 2', poster: '/old.jpg', year: '2014', fromTmdb: false });
  assert.equal(currentFilm(null, null).name, '');
});
t('"Saved as" only for a really different saved name', () => {
  const film = currentFilm(G, D);
  assert.equal(savedAs({ name: 'Amazing Spiderman 2: Rise of Electro' }, film), 'Amazing Spiderman 2: Rise of Electro');
  assert.equal(savedAs({ name: 'the amazing spider-man 2' }, film), null);
  assert.equal(savedAs({ name: '' }, film), null); assert.equal(savedAs(null, film), null);
});
t('"Use the new name" changes only what differs', () => {
  const film = currentFilm(G, D);
  assert.deepEqual(newNamePatch({ name: 'Rise of Electro', poster: '/old.jpg', year: 2014 }, film), { name: 'The Amazing Spider-Man 2', poster: '/new.jpg' });
  assert.deepEqual(newNamePatch({ name: 'The Amazing Spider-Man 2', poster: '/new.jpg', year: '2014' }, film), {});
});

// The tidy: viewings of one film (same TMDB id) saved under different names.
const MOVIES = [
  { index: 0, tmdbId: 102382, name: 'Amazing Spiderman 2: Rise of Electro', poster: '/a.jpg', year: '2014', watchedAt: '2015-01-01T10:00:00Z' },
  { index: 1, tmdbId: 102382, name: 'The Amazing Spider-Man 2', poster: '/b.jpg', year: '2014', watchedAt: '2026-10-01T10:00:00Z' },
  { index: 2, tmdbId: 102382, name: 'the amazing spider man 2', poster: '/b.jpg', year: '2014', watchedAt: '2020-01-01T10:00:00Z' },
  { index: 3, tmdbId: 949, name: 'Heat', poster: '/h.jpg', year: '1995', watchedAt: '2026-01-01T10:00:00Z' },
  { index: 4, tmdbId: 949, name: 'Heat', poster: null, year: '1995', watchedAt: '2020-01-01T10:00:00Z' },
  { index: 5, tmdbId: 7, name: 'Solo Film', watchedAt: '2020-01-01T10:00:00Z' },
];
t('old names: only the viewing with a really different name, updated to the newest viewing', () => {
  const rows = oldNames(groupMovies(MOVIES));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].name, 'The Amazing Spider-Man 2');
  assert.deepEqual(rows[0].old, [{ index: 0, name: 'Amazing Spiderman 2: Rise of Electro' }]);
  assert.deepEqual(allPatches(rows), [{ index: 0, patch: { name: 'The Amazing Spider-Man 2', poster: '/b.jpg' } }]);
  assert.match(oldNamesIntro(rows), /^1 viewing is saved under an older name/);
});
t('nothing to tidy: empty list; bad input is safe', () => {
  assert.deepEqual(oldNames(groupMovies(MOVIES.slice(3))), []);
  assert.deepEqual(oldNames(null), []);
  assert.match(oldNamesIntro([{ old: [1, 2] }]), /^2 viewings are/);
});
console.log(`\n${n} movie name tests passed`);
