import assert from 'node:assert/strict';
import { parseSeason, isFresh, bestEpisode, scoreText, seasonKey, validImdbId, loadCache, saveCache, trimCache, CACHE_KEY } from '../../src/components/epScoresLogic.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('ok  -', name); };
const NOW = Date.parse('2026-10-25T09:00:00Z');
const ago = (d) => new Date(NOW - d * 86400000).toISOString();

const OMDB = { Title: 'Stranger Things', Season: '4', totalSeasons: '5', Response: 'True', Episodes: [
  { Title: 'Chapter One', Released: '2022-05-27', Episode: '1', imdbRating: '8.5', imdbID: 'tt1' },
  { Title: 'Chapter Four', Released: '2022-05-27', Episode: '4', imdbRating: '9.6', imdbID: 'tt4' },
  { Title: 'Chapter Two', Released: '2022-05-27', Episode: '2', imdbRating: '8.1', imdbID: 'tt2' },
  { Title: 'Chapter Nine', Released: '2022-07-01', Episode: '9', imdbRating: '9.3', imdbID: 'tt9' },
] };

t('a season answer becomes episode → score, plus the latest release', () => {
  assert.deepEqual(parseSeason(OMDB), { eps: { 1: 8.5, 2: 8.1, 4: 9.6, 9: 9.3 }, latest: '2022-07-01', pending: false });
});
t('unrated episodes ("N/A") are left out and mark the season as still changing', () => {
  const p = parseSeason({ Response: 'True', Episodes: [{ Episode: '1', imdbRating: '7.9', Released: '2026-10-01' }, { Episode: '2', imdbRating: 'N/A', Released: '2026-10-29' }] });
  assert.deepEqual(p, { eps: { 1: 7.9 }, latest: '2026-10-29', pending: true });
});
t('OMDb "not found" or junk → null', () => {
  assert.equal(parseSeason({ Response: 'False', Error: 'Series or season not found!' }), null);
  assert.equal(parseSeason(null), null); assert.equal(parseSeason({ Response: 'True' }), null);
  assert.equal(parseSeason({ Response: 'True', Episodes: [null, { Episode: 'x', imdbRating: '9' }, { Episode: '1', imdbRating: '11' }] }), null);
});
t('fresh: an older season for 30 days', () => {
  const e = { at: ago(29), eps: { 1: 8 }, latest: '2022-07-01' };
  assert.equal(isFresh(e, NOW), true); assert.equal(isFresh({ ...e, at: ago(31) }, NOW), false);
});
t('fresh: a season still airing (recent or unrated episode) only for 3 days', () => {
  assert.equal(isFresh({ at: ago(2), eps: { 1: 8 }, latest: '2026-10-10' }, NOW), true);
  assert.equal(isFresh({ at: ago(4), eps: { 1: 8 }, latest: '2026-10-10' }, NOW), false);
  assert.equal(isFresh({ at: ago(4), eps: { 1: 8 }, latest: '2020-01-01', pending: true }, NOW), false);
});
t('fresh: "nothing found" is asked again after 7 days; bad entries are never fresh', () => {
  assert.equal(isFresh({ at: ago(6), none: true }, NOW), true); assert.equal(isFresh({ at: ago(8), none: true }, NOW), false);
  assert.equal(isFresh(null, NOW), false); assert.equal(isFresh({ at: 'x' }, NOW), false); assert.equal(isFresh({ at: ago(-1), eps: {} }, NOW), false);
});
t('best episode: the highest score (earlier one on a tie), only with 3+ scores', () => {
  assert.equal(bestEpisode({ 1: 8.5, 2: 8.1, 4: 9.6, 9: 9.3 }), 4);
  assert.equal(bestEpisode({ 1: 9, 2: 9, 3: 8 }), 1);
  assert.equal(bestEpisode({ 1: 9, 2: 8 }), null); assert.equal(bestEpisode(null), null);
});
t('labels and ids', () => {
  assert.equal(scoreText(9), '9.0'); assert.equal(scoreText(8.65), '8.7'); assert.equal(scoreText(null), '');
  assert.equal(seasonKey('tt4574334', '4'), 'tt4574334:4');
  assert.equal(validImdbId('tt4574334'), true); assert.equal(validImdbId('4574334'), false); assert.equal(validImdbId(null), false);
});
t('device cache: save, load, junk ignored, oldest dropped past the limit, blocked storage is safe', () => {
  const mem = { v: null, getItem(k) { assert.equal(k, CACHE_KEY); return this.v; }, setItem(k, v) { this.v = v; } };
  assert.deepEqual(loadCache(mem), {});
  assert.ok(saveCache(mem, { 'tt1:1': { at: ago(1), eps: { 1: 8 } }, 'bad': { at: ago(1) }, 'tt2:1': 'x' }));
  assert.deepEqual(Object.keys(loadCache(mem)), ['tt1:1']);
  const big = {}; for (let i = 0; i < 5; i++) big[`tt${i}:1`] = { at: ago(i), eps: {} };
  assert.deepEqual(Object.keys(trimCache(big, 2)).sort(), ['tt0:1', 'tt1:1']);
  assert.deepEqual(loadCache({ getItem() { throw new Error('no'); } }), {});
  assert.equal(saveCache({ setItem() { throw new Error('full'); } }, {}), false);
});
console.log(`\n${n} episode score tests passed`);
