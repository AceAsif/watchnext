import assert from 'node:assert/strict';
import * as S from '../../src/components/starsLogic.js';
import * as L from '../../src/components/letterboxdLogic.js';
import * as T from '../../src/components/tasteLogic.js';
let n = 0; const t = (name, fn) => { fn(); n++; console.log('ok  -', name); };

t('starFill: full, half and empty stars for 3.5', () => {
  assert.deepEqual([1, 2, 3, 4, 5].map((i) => S.starFill(3.5, i)), ['full', 'full', 'full', 'half', 'empty']);
  assert.deepEqual([1, 2, 3, 4, 5].map((i) => S.starFill(0.5, i)), ['half', 'empty', 'empty', 'empty', 'empty']);
  assert.deepEqual([1, 2, 3, 4, 5].map((i) => S.starFill(4, i)), ['full', 'full', 'full', 'full', 'empty']);
  assert.deepEqual([1, 2, 3, 4, 5].map((i) => S.starFill(0, i)), ['empty', 'empty', 'empty', 'empty', 'empty']);
});
t('starFromPointer: left half of star 1 is 0.5, right half is 1; no width means the whole star', () => {
  assert.equal(S.starFromPointer(1, 3, 24), 0.5); assert.equal(S.starFromPointer(1, 20, 24), 1);
  assert.equal(S.starFromPointer(4, 11.9, 24), 3.5); assert.equal(S.starFromPointer(4, 12, 24), 4); assert.equal(S.starFromPointer(3, 0, 0), 3);
});
t('cleanRating / starLabel', () => {
  assert.deepEqual([0.5, '3.5', 4, 7, -1, 'x', null, 0.2, 2.74].map(S.cleanRating), [0.5, 3.5, 4, 5, 0, 0, 0, 0.5, 2.5]);
  assert.equal(S.starLabel(3.5), '3.5'); assert.equal(S.starLabel(4), '4');
});

// ---- re-import puts the exact half back on ratings an earlier import rounded up
const info = { id: 7, title: 'Tár', release_date: '2022-10-07', runtime: 158, genres: [] };
const film = (rating, day = '2023-02-01') => ({ name: 'Tár', year: '2022', views: [{ day, rating }] });
t('an old import saved 0.5 as 1 star: re-importing changes it to 0.5 and counts it as updated', () => {
  const old = L.entriesFor(film(0.5), info).map((e) => ({ ...e, rating: 1 })); // what the old version saved
  const r = L.mergeLetterboxd(old, L.entriesFor(film(0.5), info));
  assert.equal(r.added, 0); assert.equal(r.skipped, 1); assert.equal(r.updated, 1); assert.equal(r.movies.length, 1); assert.equal(r.movies[0].rating, 0.5);
  assert.equal(old[0].rating, 1); // the old array is not changed in place
});
t('3.5 saved as 4 becomes 3.5; a rating changed in WatchNext since (2) is left alone', () => {
  const a = { ...L.entriesFor(film(3.5), info)[0], rating: 4 };
  assert.equal(L.mergeLetterboxd([a], L.entriesFor(film(3.5), info)).movies[0].rating, 3.5);
  const b = { ...L.entriesFor(film(3.5), info)[0], rating: 2 };
  const r = L.mergeLetterboxd([b], L.entriesFor(film(3.5), info)); assert.equal(r.updated, 0); assert.equal(r.movies[0].rating, 2);
});
t('entries not from Letterboxd, or whole-star ratings, are never touched', () => {
  const manual = { ...L.entriesFor(film(0.5), info)[0], rating: 1 }; delete manual.source;
  assert.equal(L.mergeLetterboxd([manual], L.entriesFor(film(0.5), info)).movies[0].rating, 1);
  const whole = L.entriesFor(film(4), info); assert.equal(L.mergeLetterboxd(whole, L.entriesFor(film(4), info)).updated, 0);
});
t('result text mentions the changed ratings', () => {
  assert.equal(L.resultText({ added: 0, skipped: 9, updated: 2, unmatched: [], stopped: false }), '0 entries added, 9 already there, 2 ratings changed to the exact half star.');
  assert.equal(L.resultText({ added: 0, skipped: 9, updated: 1, unmatched: [], stopped: false }), '0 entries added, 9 already there, 1 rating changed to the exact half star.');
});
t('the taste profile counts a 0.5-star movie as rated (strongly disliked), not ignored', () => {
  const s = T.movieEngagement({ name: 'x', tmdbId: 1, rating: 0.5, status: 'watched', watchedAt: '2026-01-01T00:00:00Z' });
  assert.equal(s.why, 'rated'); assert.equal(s.stars, 0.5); assert.ok(s.w < -1.4);
  assert.ok(T.movieEngagement({ rating: 3.5 }).w > 0);
});

const L2 = await (async () => {
  let lib = [{ ...L.entriesFor(film(0.5), info)[0], rating: 1 }];
  const plan = { films: [film(0.5)], watchlist: [] };
  const r = await L.runImport(plan, { search: async () => ({ results: [{ id: 7, title: 'Tár', release_date: '2022-10-07' }] }), details: async () => info, save: (e) => { const m = L.mergeLetterboxd(lib, e); lib = m.movies; return m; } });
  return { r, lib };
})();
assert.equal(L2.r.updated, 1); assert.equal(L2.lib[0].rating, 0.5); n++; console.log('ok  - runImport: re-import updates the rating through save()');

console.log(`\n${n} half stars tests passed`);
