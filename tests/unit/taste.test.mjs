// Discover's taste engine: engagement weights, features, profile, scoring, rows and the
// whole pipeline against a fake TMDB.   node tests/unit/taste.test.mjs
import assert from 'node:assert/strict';
import * as T from '../../src/components/tasteLogic.js';
import { runDiscover, ownedKeys, mapLimit } from '../../src/components/discoverEngine.js';

let n = 0;
const tests = [];
const t = (name, fn) => tests.push([name, fn]);
const NOW = new Date('2026-10-01T22:00:00.000Z');
const ago = (d) => new Date(NOW.getTime() - d * T.DAY).toISOString();
const eps = (count, at) => Object.fromEntries(Array.from({ length: count }, (_, i) => [`1x${i + 1}`, { at }]));

// ------------------------------------------------------------------ engagement
t('ratings decide first: 5★ strongly yes, 3★ neutral, 1★ strongly no — even on a dropped show', () => {
  assert.equal(T.showEngagement({ rating: 5, watched: {} }).w, 1.2);
  assert.equal(T.showEngagement({ rating: 3, watched: {} }).w, 0);
  assert.equal(T.showEngagement({ rating: 1, dropped: true, watched: eps(1, ago(5)) }).w, -1.2);
  assert.equal(T.showEngagement({ rating: 4, dropped: true, watched: eps(1, ago(5)) }).why, 'rated');
  assert.equal(T.movieEngagement({ rating: 2 }).w, -0.6);
});
t('dropped after 1–2 episodes is a "no"; dropped after most of it (13 Reasons Why after 2 of 4 seasons) is still a "yes"', () => {
  const early = T.showEngagement({ dropped: true, totalEpisodes: 49, watched: eps(2, ago(10)) });
  assert.equal(early.why, 'dropped-early'); assert.ok(early.w < 0);
  const late = T.showEngagement({ dropped: true, totalEpisodes: 49, watched: eps(26, ago(10)) });
  assert.equal(late.why, 'dropped-late'); assert.ok(late.w > 0);
  const lots = T.showEngagement({ dropped: true, totalEpisodes: 300, watched: eps(25, ago(10)) });
  assert.equal(lots.why, 'dropped-late', '20+ episodes is a real investment even in a long show');
  const quarter = T.showEngagement({ dropped: true, totalEpisodes: 40, watched: eps(6, ago(10)) });
  assert.ok(quarter.w < 0 && quarter.w > early.w, 'a quarter in is a mild no');
});
t('finished > watching (grows with progress) > watchlist > nothing; caught-up on a running show counts as finished', () => {
  const fin = T.showEngagement({ status: 'Ended', totalEpisodes: 10, watched: eps(10, ago(1)) });
  const cu = T.showEngagement({ status: 'Returning Series', totalEpisodes: 10, watched: eps(10, ago(1)) });
  const half = T.showEngagement({ totalEpisodes: 10, watched: eps(5, ago(1)) });
  const start = T.showEngagement({ totalEpisodes: 10, watched: eps(1, ago(1)) });
  const wl = T.showEngagement({ watchlist: true, watched: {} });
  const none = T.showEngagement({ watched: {} });
  assert.equal(fin.why, 'finished'); assert.equal(cu.why, 'caught-up'); assert.equal(fin.w, cu.w);
  assert.ok(fin.w > half.w && half.w > start.w && start.w > 0);
  assert.equal(wl.w, 0.25); assert.equal(none.w, 0);
  assert.equal(T.showEngagement({ seasons: [{ n: 1, count: 4 }, { n: 2, count: 4 }], watched: eps(8, ago(1)) }).why, 'caught-up', 'total falls back to the season counts');
});
t('movies: watched unrated is a mild yes, planned a small maybe', () => {
  assert.equal(T.movieEngagement({ status: 'watched' }).w, 0.5);
  assert.equal(T.movieEngagement({}).why, 'watched', 'old movies without a status are watched');
  assert.equal(T.movieEngagement({ status: 'planned' }).w, 0.25);
});
t('decay: today 1, two years ago 0.5, very old never below 0.25, unknown 0.5', () => {
  assert.equal(T.decay(NOW.toISOString(), NOW), 1);
  assert.ok(Math.abs(T.decay(ago(730), NOW) - 0.5) < 1e-9);
  assert.equal(T.decay(ago(10000), NOW), T.MIN_DECAY);
  assert.equal(T.decay(undefined, NOW), 0.5); assert.equal(T.decay('junk', NOW), 0.5);
  assert.equal(T.decay(new Date(NOW.getTime() + 5 * T.DAY).toISOString(), NOW), 1, 'a future date (clock skew) is "now"');
});
t('last activity is the latest of watches, rating and add date', () => {
  const e = T.showEngagement({ watched: { '1x1': { at: ago(400) }, '1x2': { at: ago(3) } }, ratedAt: ago(100), addedAt: ago(900) });
  assert.equal(e.at, ago(3));
});

// ------------------------------------------------------------------ genres + features
t('TV and movie genre ids map to one shared set (Sci-Fi & Fantasy -> scifi + fantasy)', () => {
  assert.deepEqual(T.genreKeysFromIds([10765, 18, 878]), ['scifi', 'fantasy', 'drama']);
  assert.deepEqual(T.genreKeysFromNames(['Action & Adventure', 'Mystery', 'Nonsense']), ['action', 'adventure', 'mystery']);
  assert.deepEqual(T.genreIdsFor('tv', ['scifi', 'fantasy', 'thriller']), [10765], 'TV has no thriller id; scifi+fantasy share one');
  assert.deepEqual(T.genreIdsFor('movie', ['scifi', 'thriller']), [878, 53]);
});
t('features from a TV details response: keywords (results), creators then top cast, language and year', () => {
  const d = { genres: [{ id: 18 }, { id: 9648 }], original_language: 'ko', first_air_date: '2021-09-17',
    keywords: { results: [{ id: 1, name: 'survival' }, { id: 2, name: 'debt' }] },
    created_by: [{ id: 50, name: 'Hwang Dong-hyuk' }],
    credits: { cast: [{ id: 60, name: 'Lee Jung-jae' }, { id: 50, name: 'Hwang Dong-hyuk' }, { id: 61, name: 'A' }, { id: 62, name: 'B' }, { id: 63, name: 'C' }] } };
  const f = T.featuresFromDetails('tv', d);
  assert.deepEqual(f.g, ['drama', 'mystery']); assert.equal(f.l, 'ko'); assert.equal(f.y, 2021);
  assert.deepEqual(f.k, [[1, 'survival'], [2, 'debt']]);
  assert.deepEqual(f.p.map((x) => x[0]), [50, 60, 61, 62], 'the creator once, then cast (max 4 checked)');
  assert.equal(f.p[0][2], 'c'); assert.equal(f.p[1][2], 'a');
});
t('features from a movie details response: keywords (keywords), directors from the crew', () => {
  const f = T.featuresFromDetails('movie', { genres: [{ id: 878 }], release_date: '2016-11-10', original_language: 'en',
    keywords: { keywords: [{ id: 9, name: 'alien' }] }, credits: { crew: [{ id: 7, name: 'Denis Villeneuve', job: 'Director' }, { id: 8, name: 'X', job: 'Writer' }], cast: [] } });
  assert.deepEqual(f.p, [[7, 'Denis Villeneuve', 'c']]); assert.deepEqual(f.k, [[9, 'alien']]); assert.equal(f.y, 2016);
  assert.equal(T.featuresFromDetails('movie', null), null);
  assert.deepEqual(T.featuresFromDetails('tv', {}), { g: [], l: null, y: null, k: [], p: [] }, 'an empty response is harmless');
});

// ------------------------------------------------------------------ cache
t('cache: expired, malformed and unknown entries are dropped; the newest CACHE_MAX are kept', () => {
  const items = {
    'tv:1': { g: ['drama', 'bogus'], l: 'en', y: 2020, k: [[1, 'a'], 'x'], p: [], t: ago(3) },
    'tv:2': { g: [], t: ago(T.CACHE_TTL_DAYS + 1) }, 'xx:3': { t: ago(1) }, 'movie:4': { t: 'nope' }, 'movie:5': null,
  };
  const c = T.sanitizeCache({ items }, NOW);
  assert.deepEqual(Object.keys(c.items), ['tv:1']); assert.deepEqual(c.items['tv:1'].g, ['drama']); assert.deepEqual(c.items['tv:1'].k, [[1, 'a']]);
  const many = {}; for (let i = 0; i < T.CACHE_MAX + 5; i++) many[`tv:${i}`] = { t: new Date(NOW.getTime() - i * 60000).toISOString() };
  const kept = T.sanitizeCache({ items: many }, NOW).items;
  assert.equal(Object.keys(kept).length, T.CACHE_MAX); assert.ok(kept['tv:0'] && !kept[`tv:${T.CACHE_MAX + 4}`]);
  for (const bad of [null, 5, 'x', [], { items: 'x' }]) assert.deepEqual(T.sanitizeCache(bad, NOW), { items: {} });
});
t('cache load/save survive broken or blocked storage', () => {
  const store = new Map();
  const st = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  T.saveCache(st, { items: { 'tv:1': { g: ['drama'], t: ago(1) } } }, NOW);
  assert.deepEqual(T.loadCache(st, NOW).items['tv:1'].g, ['drama']);
  store.set(T.CACHE_KEY, '{oops'); assert.deepEqual(T.loadCache(st, NOW), { items: {} });
  const blocked = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('full'); } };
  assert.deepEqual(T.loadCache(blocked, NOW), { items: {} }); T.saveCache(blocked, { items: {} }, NOW);
});

// ------------------------------------------------------------------ profile
const F = (g, l, y, k = [], p = []) => ({ g, l, y, k, p, t: ago(1) });
const cacheOf = (o) => ({ items: o });
t('profile: liked features go up, disliked down; shares are relative to all your engagement', () => {
  const entries = [
    { key: 'tv:1', w: 1.2, d: 1 }, { key: 'tv:2', w: 0.8, d: 1 }, { key: 'tv:3', w: -1.2, d: 1 },
  ];
  const prof = T.buildProfile(entries, cacheOf({ 'tv:1': F(['mystery'], 'ko', 2021), 'tv:2': F(['mystery', 'drama'], 'en', 2019), 'tv:3': F(['reality'], 'en', 2015) }));
  assert.ok(prof.g.mystery > prof.g.drama && prof.g.drama > 0 && prof.g.reality < 0);
  assert.ok(Math.abs(prof.mass - 3.2) < 1e-9); assert.ok(prof.l.ko > 0 && prof.l.en < 0, 'English here is mostly what you disliked');
  assert.ok(prof.d['2020s'] > 0 && prof.d['2010s'] < 0);
  assert.deepEqual(T.topGenres(prof, 2), ['mystery', 'drama']);
});
t('profile falls back to the genres saved on the library record when TMDB details are missing', () => {
  const prof = T.buildProfile([{ key: null, w: 1, d: 1, rec: { g: ['comedy'], k: [], p: [] } }, { key: 'tv:9', w: 1, d: 1, rec: { g: ['drama'], k: [], p: [] } }], cacheOf({}));
  assert.ok(prof.g.comedy > 0 && prof.g.drama > 0);
});
t('a keyword or person only becomes a row when two or more liked titles share it; makers count double', () => {
  const c = cacheOf({
    'tv:1': F(['drama'], 'en', 2020, [[5, 'high school'], [6, 'one-off']], [[100, 'Actor A', 'a'], [200, 'Maker M', 'c']]),
    'tv:2': F(['drama'], 'en', 2020, [[5, 'high school']], [[100, 'Actor A', 'a'], [200, 'Maker M', 'c']]),
    'tv:3': F(['drama'], 'en', 2020, [[5, 'high school']], [[100, 'Actor A', 'a']]),
  });
  const prof = T.buildProfile([{ key: 'tv:1', w: 1, d: 1 }, { key: 'tv:2', w: 1, d: 1 }, { key: 'tv:3', w: 1, d: 1 }], c);
  assert.deepEqual(T.topKeyword(prof), { id: 5, name: 'high school' });
  assert.equal(prof.k[6].n, 1);
  assert.deepEqual(T.topPerson(prof), { id: 200, name: 'Maker M', role: 'c' }, 'in 2 titles as maker (x2) beats 3 titles as actor');
  const lone = T.buildProfile([{ key: 'tv:1', w: 1, d: 1 }], c);
  assert.equal(T.topKeyword(lone), null); assert.equal(T.topPerson(lone), null);
  const disliked = T.buildProfile([{ key: 'tv:1', w: -1, d: 1 }, { key: 'tv:2', w: -1, d: 1 }], c);
  assert.equal(T.topKeyword(disliked), null, 'shared by disliked titles is no reason for a row');
});
t('seeds: strongest liked titles TMDB knows, recency-weighted, no duplicates, nothing hidden or disliked', () => {
  const e = [
    { key: 'tv:1', tmdbId: 1, name: 'Old Fave', w: 1.2, d: 0.3, why: 'rated' },
    { key: 'tv:2', tmdbId: 2, name: 'New Fave', w: 1.2, d: 1, why: 'rated' },
    { key: 'tv:2', tmdbId: 2, name: 'New Fave dup', w: 0.8, d: 1, why: 'finished' },
    { key: null, tmdbId: null, name: 'No id', w: 1.2, d: 1, why: 'rated' },
    { key: 'tv:3', tmdbId: 3, name: 'Meh', w: 0.25, d: 1, why: 'watchlist' },
    { key: 'tv:4', tmdbId: 4, name: 'Nope', w: -0.5, d: 1, why: 'hidden' },
  ];
  assert.deepEqual(T.pickSeeds(e).map((s) => s.name), ['New Fave', 'Old Fave']);
});

// ------------------------------------------------------------------ candidates + scoring
const RAW = (id, name, o = {}) => ({ id, name, poster_path: `/p${id}.jpg`, first_air_date: '2022-01-01', vote_average: 7.5, vote_count: 900, genre_ids: [18], original_language: 'en', ...o });
t('candidates: posterless, nameless, adult and unknown-kind results are dropped; trending items keep their own type', () => {
  assert.equal(T.candidateFrom(RAW(1, 'A', { poster_path: null }), 'tv'), null);
  assert.equal(T.candidateFrom(RAW(1, undefined), 'tv'), null);
  assert.equal(T.candidateFrom(RAW(1, 'A', { adult: true }), 'tv'), null);
  assert.equal(T.candidateFrom({ ...RAW(1, 'A'), media_type: 'person' }, undefined), null);
  const m = T.candidateFrom({ id: 5, title: 'Film', media_type: 'movie', poster_path: '/x', release_date: '2019-05-01', genre_ids: [10765] }, 'tv');
  assert.equal(m.kind, 'movie'); assert.equal(m.key, 'movie:5'); assert.equal(m.year, 2019); assert.deepEqual(m.g, ['scifi', 'fantasy']);
});
t('merging: one entry per title, reasons combined, owned and hidden titles removed', () => {
  const a = T.candidateFrom(RAW(1, 'A'), 'tv', { type: 'seed', key: 'tv:9', name: 'S', w: 1 });
  const b = T.candidateFrom(RAW(1, 'A'), 'tv', { type: 'seed', key: 'tv:8', name: 'R', w: 0.5 });
  const c = T.candidateFrom(RAW(2, 'B'), 'tv', { type: 'trending' });
  const d = T.candidateFrom(RAW(3, 'C'), 'tv', { type: 'trending' });
  const out = T.mergeCandidates([[a, null, c], [b, a], [d]], new Set(['tv:3']));
  assert.deepEqual(out.map((x) => x.key), ['tv:1', 'tv:2']); assert.equal(out[0].via.length, 2);
  assert.equal(a.via.length, 1, 'inputs untouched');
});
t('quality shrinks small vote counts toward the middle; support grows with how many favourites point at it', () => {
  const few = T.quality({ vote: 9.5, votes: 5 }), many = T.quality({ vote: 8.6, votes: 5000 });
  assert.ok(many > few, 'a 8.6 from 5,000 votes beats a 9.5 from 5');
  assert.equal(T.quality({ vote: 2, votes: 9999 }), 0); assert.equal(T.quality({ vote: 10, votes: 1e6 }), 1);
  assert.equal(T.support({ via: [{ type: 'trending' }] }), 0);
  assert.ok(T.support({ via: [{ type: 'seed', w: 1 }, { type: 'seed', w: 1 }] }) > T.support({ via: [{ type: 'seed', w: 1 }] }));
});
t('taste match: a candidate in your favourite genre/language/decade beats one in a genre you dislike', () => {
  const prof = { g: { mystery: 0.6, reality: -0.4 }, l: { ko: 0.5, en: 0.1 }, d: { '2020s': 0.4 } };
  const good = { g: ['mystery'], l: 'ko', year: 2023 }, bad = { g: ['reality'], l: 'en', year: 1995 };
  assert.ok(T.tasteMatch(prof, good) > 0.9); assert.ok(T.tasteMatch(prof, bad) < 0);
  assert.equal(T.tasteMatch({ g: {}, l: {}, d: {} }, good), 0, 'an empty profile is neutral, not an error');
  assert.ok(T.matchPercent(1) <= 99 && T.matchPercent(-1) >= 1 && T.matchPercent(0.5) > T.matchPercent(0));
});

// ------------------------------------------------------------------ rows + why-lines
const seedA = { key: 'tv:100', kind: 'tv', tmdbId: 100, name: 'Dark', w: 1.2, d: 1, why: 'rated', stars: 5 };
const seedB = { key: 'movie:200', kind: 'movie', tmdbId: 200, name: 'Arrival', w: 0.5, d: 1, why: 'watched', stars: 0 };
const viaA = { type: 'seed', key: seedA.key, name: 'Dark', w: 1.2 }, viaB = { type: 'seed', key: seedB.key, name: 'Arrival', w: 0.5 };
const PROF = { g: { mystery: 0.5, scifi: 0.4, drama: 0.2, reality: -0.3 }, l: { en: 0.4, de: 0.2 }, d: { '2010s': 0.3, '2020s': 0.3 }, k: {}, p: {} };
function pool() {
  const out = [];
  for (let i = 1; i <= 14; i++) out.push(T.candidateFrom(RAW(i, `Mystery ${i}`, { genre_ids: [9648] }), 'tv', viaA));
  for (let i = 21; i <= 30; i++) out.push(T.candidateFrom({ id: i, title: `Film ${i}`, poster_path: '/x', release_date: '2018-01-01', vote_average: 7, vote_count: 800, genre_ids: [878], original_language: 'en' }, 'movie', viaB));
  for (let i = 41; i <= 46; i++) out.push(T.candidateFrom(RAW(i, `Trend ${i}`, { genre_ids: [35], vote_average: 8.2, vote_count: 4000 }), 'tv', { type: 'trending' }));
  out.push(T.candidateFrom(RAW(50, 'Reality junk', { genre_ids: [10764] }), 'tv', { type: 'trending' }));
  return T.mergeCandidates([out]);
}
t('rows: top picks first, then "Because you…" rows, then Something different; themed rows never share a title', () => {
  const rows = T.buildRows({ pool: pool(), prof: PROF, seeds: [seedA, seedB], now: NOW });
  assert.deepEqual(rows.map((r) => r.type), ['top', 'seed', 'seed', 'different']);
  assert.equal(rows[0].title, 'Top picks for you'); assert.equal(rows[0].items.length, T.TOP_PICKS);
  assert.equal(rows[1].title, 'Because you rated Dark 5★'); assert.equal(rows[2].title, 'Because you watched Arrival');
  assert.equal(rows[1].items.length, 14, 'Top picks no longer starves the seed rows'); assert.equal(rows[2].items.length, 10);
  const keys = rows.slice(1).flatMap((r) => r.items.map((c) => c.key)); assert.equal(new Set(keys).size, keys.length);
  const topKeys = rows[0].items.map((c) => c.key); assert.equal(new Set(topKeys).size, topKeys.length, 'no repeats inside Top picks');
  assert.ok(rows[3].items.every((c) => c.via.some((v) => v.type === 'trending') && c.g[0] === 'comedy'));
  assert.ok(!keys.includes('tv:50'), 'a disliked genre never sneaks in as "different"');
});
t('variety: top picks mix genres instead of being all one genre', () => {
  const rows = T.buildRows({ pool: pool(), prof: PROF, seeds: [seedA, seedB], now: NOW });
  const g = new Set(rows[0].items.map((c) => c.g[0]));
  assert.ok(g.size >= 2, `got ${[...g]}`);
});
t('pickVaried: a slightly lower score in a new genre beats the 4th of the same genre; plain order otherwise', () => {
  const mk = (key, g, score) => ({ key, g: [g], via: [], score });
  const list = [mk('a1', 'mystery', 0.90), mk('a2', 'mystery', 0.89), mk('a3', 'mystery', 0.88), mk('a4', 'mystery', 0.87), mk('b1', 'comedy', 0.70)];
  const got = T.pickVaried(list, 4, (c) => c.score).map((c) => c.key);
  assert.deepEqual(got, ['a1', 'a2', 'b1', 'a3'], 'without the variety rule this would be a1 a2 a3 a4');
  assert.deepEqual(T.pickVaried(list, 2, (c) => c.score).map((c) => c.key), ['a1', 'a2']);
  assert.equal(list.length, 5, 'input untouched');
});
t('Top picks prefers titles not already in a row below, but uses them when the pool is thin', () => {
  // 20 mystery shows from one seed: the seed row takes 15, Top picks should lead with the 5 left over
  const many = T.mergeCandidates([Array.from({ length: 20 }, (_, i) => T.candidateFrom(RAW(i + 1, `M${i}`, { genre_ids: [9648], vote_average: 7 + (i % 3) * 0.1 }), 'tv', viaA))]);
  const rows = T.buildRows({ pool: many, prof: PROF, seeds: [seedA], now: NOW });
  const inSeed = new Set(rows[1].items.map((c) => c.key)); const top = rows[0].items.map((c) => c.key);
  assert.equal(rows[1].items.length, T.ROW_MAX); assert.equal(top.length, T.TOP_PICKS);
  assert.deepEqual(top.slice(0, 5).filter((k) => inSeed.has(k)), [], 'the first five Top picks are the ones not shown below');
  assert.ok(top.slice(5).every((k) => inSeed.has(k)), 'then it repeats the best of the rest rather than come up short');
});
t('a row with fewer than ROW_MIN titles left is not shown', () => {
  const tiny = T.mergeCandidates([[1, 2, 3].map((i) => T.candidateFrom(RAW(i, `X${i}`), 'tv', viaA))]);
  const rows = T.buildRows({ pool: tiny, prof: PROF, seeds: [seedA], now: NOW });
  assert.deepEqual(rows, []);
});
t('why-lines: top picks name the liked title; seed rows show genre · year; "different" shows its rating', () => {
  const c = T.candidateFrom(RAW(1, 'M', { genre_ids: [9648] }), 'tv', viaA);
  assert.equal(T.whyLine(PROF, c, 'top'), 'Because you liked Dark');
  assert.equal(T.whyLine(PROF, c, 'seed'), 'Mystery · 2022');
  assert.equal(T.whyLine(PROF, { ...c, via: [{ type: 'services' }] }, 'top'), 'You watch a lot of Mystery');
  assert.equal(T.whyLine(PROF, { ...c, via: [{ type: 'person', name: 'X' }] }, 'person'), 'Mystery · 2022');
  assert.equal(T.whyLine(PROF, { ...c, vote: 8.04 }, 'different'), 'Mystery · rated 8.0');
  const long = { ...c, via: [{ type: 'seed', key: 'k', name: 'A Very Long Show Name That Goes On And On', w: 1 }] };
  assert.ok(T.whyLine(PROF, long, 'top').endsWith('…') && T.whyLine(PROF, long, 'top').length <= 44);
});
t('progress text', () => {
  assert.equal(T.progressText({ phase: 'learning', done: 24, total: 60 }), 'Learning your taste… 24 of 60');
  assert.equal(T.progressText({ phase: 'finding' }), 'Finding picks for you…');
  assert.equal(T.progressText(null), '');
});

// ------------------------------------------------------------------ the whole pipeline (fake TMDB)
function fakeApi({ failDetails = new Set(), log = [] } = {}) {
  const det = {
    'tv:100': { genres: [{ id: 9648 }, { id: 18 }], original_language: 'de', first_air_date: '2017-12-01', keywords: { results: [{ id: 7, name: 'time travel' }] }, created_by: [{ id: 900, name: 'Baran bo Odar' }], credits: { cast: [] } },
    'tv:101': { genres: [{ id: 9648 }], original_language: 'en', first_air_date: '2016-07-15', keywords: { results: [{ id: 7, name: 'time travel' }] }, created_by: [{ id: 900, name: 'Baran bo Odar' }], credits: { cast: [] } },
    'tv:102': { genres: [{ id: 10764 }], original_language: 'en', first_air_date: '2015-01-01', keywords: { results: [] }, credits: { cast: [] } },
    'tv:103': { genres: [{ id: 18 }], original_language: 'en', first_air_date: '2017-03-31', keywords: { results: [{ id: 8, name: 'high school' }] }, credits: { cast: [] } },
    'movie:200': { genres: [{ id: 878 }], original_language: 'en', release_date: '2016-11-10', keywords: { keywords: [{ id: 7, name: 'time travel' }] }, credits: { crew: [], cast: [] } },
  };
  const recs = {
    'tv:100': Array.from({ length: 10 }, (_, i) => RAW(1000 + i, `Dark-like ${i}`, { genre_ids: [9648], original_language: i % 2 ? 'de' : 'en' })),
    'tv:101': [RAW(1100, 'OA-like', { genre_ids: [9648] }), RAW(103, 'Owned 13RW')],
    'tv:103': Array.from({ length: 6 }, (_, i) => RAW(1300 + i, `Teen ${i}`, { genre_ids: [18] })),
    'movie:200': Array.from({ length: 8 }, (_, i) => ({ id: 2000 + i, title: `Sci ${i}`, poster_path: '/s', release_date: '2019-01-01', vote_average: 7.2, vote_count: 3000, genre_ids: [878], original_language: 'en' })),
  };
  const api = {
    details: async (kind, id) => { log.push(['details', `${kind}:${id}`]); if (failDetails.has(`${kind}:${id}`)) throw new Error('boom'); return det[`${kind}:${id}`] || {}; },
    recommendations: async (kind, id) => { log.push(['rec', `${kind}:${id}`]); return { results: recs[`${kind}:${id}`] || [] }; },
    similar: async (kind, id) => { log.push(['similar', `${kind}:${id}`]); return { results: [] }; },
    personCredits: async (id) => { log.push(['person', id]); return { cast: [], crew: Array.from({ length: 5 }, (_, i) => ({ ...RAW(3000 + i, `Odar ${i}`, { genre_ids: [9648] }), media_type: 'tv', job: 'Creator' })).concat([{ ...RAW(3999, 'Obscure', {}), media_type: 'tv', vote_count: 3 }]) }; },
    discover: async (kind, p) => { log.push(['discover', kind, p]); const base = p.with_keywords ? 4000 : 5000; return { results: Array.from({ length: 5 }, (_, i) => (kind === 'tv' ? RAW(base + i, `${p.with_keywords ? 'KW' : 'Svc'} tv ${i}`, { genre_ids: [9648] }) : { id: base + 50 + i, title: `${p.with_keywords ? 'KW' : 'Svc'} film ${i}`, poster_path: '/f', release_date: '2020-01-01', vote_average: 7, vote_count: 500, genre_ids: [878], original_language: 'en' })) }; },
    providerList: async () => { log.push(['providers']); return { results: [{ provider_id: 8, provider_name: 'Netflix' }, { provider_id: 21, provider_name: 'Stan' }] }; },
    trending: async () => { log.push(['trending']); return { results: Array.from({ length: 6 }, (_, i) => ({ ...RAW(6000 + i, `Trend ${i}`, { genre_ids: [35], vote_average: 8, vote_count: 5000 }), media_type: 'tv' })) }; },
  };
  return { api, log };
}
const LIB = () => ({
  shows: {
    'tmdb:100': { tmdbId: 100, name: 'Dark', rating: 5, ratedAt: ago(20), totalEpisodes: 26, watched: eps(26, ago(20)) },
    'tmdb:101': { tmdbId: 101, name: 'The OA', status: 'Canceled', totalEpisodes: 16, watched: eps(16, ago(100)) },
    'tmdb:102': { tmdbId: 102, name: 'Reality Show', dropped: true, totalEpisodes: 30, watched: eps(1, ago(50)) },
    'tmdb:103': { tmdbId: 103, name: '13 Reasons Why', dropped: true, totalEpisodes: 49, watched: eps(26, ago(300)) },
    'tvdb:5': { name: 'Imported, no TMDB id', genres: ['Comedy'], totalEpisodes: 10, watched: eps(10, ago(900)) },
  },
  movies: [{ tmdbId: 200, name: 'Arrival', status: 'watched', watchedAt: ago(60) }],
  settings: {},
});
t('pipeline: learns every library title once (progress reported), then builds rows from your favourites', async () => {
  const { api, log } = fakeApi(); const cache = { items: {} }; const prog = [];
  const r = await runDiscover({ state: LIB(), hidden: {}, cache, api, mine: ['netflix'], now: NOW, gap: 0, onProgress: (p) => prog.push({ ...p }) });
  assert.equal(log.filter((l) => l[0] === 'details').length, 5); assert.deepEqual(Object.keys(cache.items).sort(), ['movie:200', 'tv:100', 'tv:101', 'tv:102', 'tv:103']);
  assert.deepEqual(prog[0], { phase: 'learning', done: 0, total: 5 }); assert.ok(prog.some((p) => p.phase === 'learning' && p.done === 5)); assert.equal(prog[prog.length - 1].phase, 'finding');
  const types = r.rows.map((x) => x.type);
  assert.equal(types[0], 'top'); assert.ok(types.includes('seed')); assert.ok(types.includes('person')); assert.ok(types.includes('keyword')); assert.ok(types.includes('services')); assert.ok(types.includes('different'));
  assert.equal(r.rows.find((x) => x.type === 'person').title, 'More from Baran bo Odar');
  assert.equal(r.rows.find((x) => x.type === 'keyword').title, 'Your kind of story: time travel');
  assert.ok(r.seeds.some((s) => s.name === '13 Reasons Why'), '13 Reasons Why (dropped after 2 seasons) still counts as liked');
  assert.ok(!r.seeds.some((s) => s.name === 'Reality Show'), 'dropped after 1 episode is never a seed');
  const all = r.rows.flatMap((x) => x.items.map((c) => c.key));
  assert.ok(!all.includes('tv:103'), 'owned titles never come back as picks'); assert.ok(!all.includes('tv:3999'), 'obscure credits (few votes) skipped');
  const themed = r.rows.slice(1).flatMap((x) => x.items.map((c) => c.key)); assert.equal(new Set(themed).size, themed.length, 'themed rows never share a title');
  const svc = log.filter((l) => l[0] === 'discover' && l[2].with_watch_providers);
  assert.equal(svc.length, 2); assert.equal(svc[0][2].with_watch_providers, '8', 'only the services you ticked');
  assert.ok(svc.find((l) => l[1] === 'tv')[2].with_genres.split('|').includes('9648'), 'services row is narrowed to your top genres');
});
t('pipeline: the second run uses the cache (no details calls); a failed lookup is skipped and retried next time', async () => {
  const { api, log } = fakeApi({ failDetails: new Set(['tv:101']) }); const cache = { items: {} };
  const r1 = await runDiscover({ state: LIB(), hidden: {}, cache, api, now: NOW, gap: 0 });
  assert.equal(r1.stats.failed, 1); assert.ok(!cache.items['tv:101']); assert.ok(r1.rows.length > 0, 'still works');
  const { api: api2, log: log2 } = fakeApi();
  await runDiscover({ state: LIB(), hidden: {}, cache, api: api2, now: NOW, gap: 0 });
  assert.deepEqual(log2.filter((l) => l[0] === 'details').map((l) => l[1]), ['tv:101']);
  assert.ok(log.length > 0);
});
t('pipeline: no services ticked -> no services row and no provider lookups', async () => {
  const { api, log } = fakeApi();
  const r = await runDiscover({ state: LIB(), hidden: {}, cache: { items: {} }, api, now: NOW, gap: 0 });
  assert.ok(!r.rows.some((x) => x.type === 'services')); assert.equal(log.filter((l) => l[0] === 'providers').length, 0);
});
t('pipeline: "Not interested" titles never appear and pull their genres down', async () => {
  const { api } = fakeApi();
  const hidden = { 'tv:1000': { on: true, at: ago(1), name: 'Dark-like 0', g: ['comedy'] }, 'tv:6000': { on: true, at: ago(1), name: 'Trend 0', g: ['comedy'] }, 'tv:1001': { on: false, at: ago(1), name: 'shown again' } };
  const r = await runDiscover({ state: LIB(), hidden, cache: { items: {} }, api, now: NOW, gap: 0 });
  const all = r.rows.flatMap((x) => x.items.map((c) => c.key));
  assert.ok(!all.includes('tv:1000') && !all.includes('tv:6000')); assert.ok(all.includes('tv:1001'), 'an undone hide is back');
  assert.ok(r.profile.g.comedy < 0.05, 'comedy pulled down by two "not interested"');
});
t('pipeline: an empty library and TMDB being down both end calmly (no rows), never a crash', async () => {
  const { api } = fakeApi();
  const r = await runDiscover({ state: { shows: {}, movies: [] }, hidden: {}, cache: { items: {} }, api, now: NOW, gap: 0 });
  assert.ok(Array.isArray(r.rows));
  const down = Object.fromEntries(Object.keys(api).map((k) => [k, async () => { throw new Error('offline'); }]));
  const r2 = await runDiscover({ state: LIB(), hidden: {}, cache: { items: {} }, api: down, mine: ['netflix'], now: NOW, gap: 0 });
  assert.deepEqual(r2.rows, []); assert.equal(r2.stats.failed, 5);
});
t('helpers: ownedKeys covers shows and movies; mapLimit keeps going after a failure and respects the limit', async () => {
  assert.deepEqual([...ownedKeys(LIB())].sort(), ['movie:200', 'tv:100', 'tv:101', 'tv:102', 'tv:103']);
  let active = 0, max = 0; const done = [];
  await mapLimit([1, 2, 3, 4, 5, 6, 7], 3, async (x) => { active++; max = Math.max(max, active); await new Promise((r) => setTimeout(r, 5)); active--; if (x === 2) throw new Error('x'); done.push(x); }, 0);
  assert.equal(max, 3); assert.deepEqual(done.sort(), [1, 3, 4, 5, 6, 7]);
});

for (const [name, fn] of tests) { await fn(); n++; console.log('ok  -', name); }
console.log(`\n${n} taste tests passed`);
