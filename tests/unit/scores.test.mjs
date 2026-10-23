import assert from 'node:assert/strict';
import * as S from '../../src/components/scoresLogic.js';
let n = 0; const t = (name, fn) => { fn(); n++; console.log('ok  -', name); };
const MATRIX = { Title: 'The Matrix', imdbRating: '8.7', imdbVotes: '2,123,456', Metascore: '73', imdbID: 'tt0133093', Response: 'True',
  Ratings: [{ Source: 'Internet Movie Database', Value: '8.7/10' }, { Source: 'Rotten Tomatoes', Value: '83%' }, { Source: 'Metacritic', Value: '73/100' }] };

t('OMDb: IMDb rating and votes, Rotten Tomatoes critics %, Metacritic', () => {
  assert.deepEqual(S.parseOmdb(MATRIX), { imdb: 8.7, votes: 2123456, rt: 83, meta: 73 });
});
t('a TV show usually has only IMDb; "N/A" values become null; "not found" is null', () => {
  assert.deepEqual(S.parseOmdb({ imdbRating: '8.7', imdbVotes: 'N/A', Metascore: 'N/A', Ratings: [{ Source: 'Internet Movie Database', Value: '8.7/10' }], Response: 'True' }), { imdb: 8.7, votes: null, rt: null, meta: null });
  assert.equal(S.parseOmdb({ Response: 'False', Error: 'Incorrect IMDb ID.' }), null);
});
t('TMDB details give the IMDb id (movie: imdb_id, tv: external_ids) and TMDB score (needs 5+ votes)', () => {
  assert.deepEqual(S.fromTmdb({ imdb_id: 'tt0133093', vote_average: 8.217, vote_count: 26000, release_date: '1999-03-31' }), { imdbId: 'tt0133093', tmdb: 8.2, tmdbVotes: 26000, released: '1999-03-31' });
  assert.equal(S.fromTmdb({ external_ids: { imdb_id: 'tt4574334' }, vote_average: 8.6, vote_count: 3 }).imdbId, 'tt4574334');
  assert.equal(S.fromTmdb({ vote_average: 8.6, vote_count: 3 }).tmdb, null);
  assert.equal(S.fromTmdb({ imdb_id: '' }).imdbId, null);
});
const NOW = Date.parse('2026-10-23T12:00:00Z');
const ago = (d) => new Date(NOW - d * 86400000).toISOString();
t('saved scores: new releases re-checked after 3 days, older titles after 30, "not found" after 7', () => {
  assert.equal(S.isFresh({ at: ago(2), released: '2026-10-01' }, NOW), true);
  assert.equal(S.isFresh({ at: ago(4), released: '2026-10-01' }, NOW), false);
  assert.equal(S.isFresh({ at: ago(20), released: '1999-03-31' }, NOW), true);
  assert.equal(S.isFresh({ at: ago(31), released: '1999-03-31' }, NOW), false);
  assert.equal(S.isFresh({ at: ago(6), none: true }, NOW), true);
  assert.equal(S.isFresh({ at: ago(8), none: true }, NOW), false);
  assert.equal(S.isFresh(null, NOW), false);
});
t('vote counts read short: 2.1M, 840k, 9.5k, 512', () => {
  assert.equal(S.fmtVotes(2123456), '2.1M'); assert.equal(S.fmtVotes(12000000), '12M'); assert.equal(S.fmtVotes(840123), '840k');
  assert.equal(S.fmtVotes(9512), '9.5k'); assert.equal(S.fmtVotes(512), '512'); assert.equal(S.fmtVotes(null), '');
});
t('chips in order IMDb · RT · Metacritic · TMDB, each linking to its site; Metacritic coloured by score', () => {
  const e = { imdbId: 'tt0133093', imdb: 8.7, votes: 2123456, rt: 83, meta: 73, tmdb: 8.2, tmdbVotes: 26000 };
  const c = S.chips(e, 'movie', 603, 'The Matrix');
  assert.deepEqual(c.map((x) => [x.id, x.value, x.sub || '']), [['imdb', '★ 8.7', '2.1M'], ['rt', '🍅 83%', ''], ['meta', '73', ''], ['tmdb', '8.2', '']]);
  assert.equal(c[0].url, 'https://www.imdb.com/title/tt0133093/');
  assert.equal(c[1].url, 'https://www.rottentomatoes.com/search?search=The%20Matrix');
  assert.equal(c[3].url, 'https://www.themoviedb.org/movie/603');
  assert.equal(c[2].tone, 'good'); assert.equal(S.chips({ ...e, meta: 45 }, 'movie', 603)[2].tone, 'mixed'); assert.equal(S.chips({ ...e, meta: 30 }, 'movie', 603)[2].tone, 'bad');
});
t('a title with no IMDb page still shows its TMDB score; nothing at all shows no chips', () => {
  assert.deepEqual(S.chips({ none: true, tmdb: 7.1 }, 'tv', 5, 'X').map((x) => x.id), ['tmdb']);
  assert.deepEqual(S.chips({ none: true }, 'tv', 5), []);
});
t('"Highest rated" uses IMDb, then TMDB', () => {
  assert.equal(S.sortScore({ imdb: 8.1, tmdb: 7 }), 8.1); assert.equal(S.sortScore({ tmdb: 7 }), 7); assert.equal(S.sortScore(null), null);
});
t('the device cache keeps the newest 3,000 and drops bad entries', () => {
  const big = {}; for (let i = 0; i < 3005; i++) big[`movie:${i}`] = { at: new Date(Date.UTC(2026, 0, 1) + i * 1000).toISOString() };
  const kept = S.trimCache(big); assert.equal(Object.keys(kept).length, 3000); assert.ok(!kept['movie:0'] && kept['movie:3004']);
  const store = new Map([[S.CACHE_KEY, JSON.stringify({ 'movie:1': { at: 'x' }, bad: { at: 'x' }, 'tv:2': 5 })]]);
  assert.deepEqual(Object.keys(S.loadCache({ getItem: (k) => store.get(k) })), ['movie:1']);
});
console.log(`\n${n} scores tests passed`);
