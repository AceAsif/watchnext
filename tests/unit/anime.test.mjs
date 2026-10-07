import assert from 'node:assert/strict';
import * as L from '../../src/components/animeLogic.js';
import { searchAnime, fetchAnime, AniListError } from '../../src/api/anilist.js';

let n = 0; const t = async (name, fn) => { await fn(); n++; console.log('ok  -', name); };
const NOW = '2026-10-01T00:00:00.000Z', NOWMS = Date.parse(NOW);

const raw = (o = {}) => ({
  id: 108632, idMal: 31240, siteUrl: 'https://anilist.co/anime/108632',
  title: { romaji: 'Re:Zero kara Hajimeru Isekai Seikatsu', english: 'Re:ZERO -Starting Life in Another World-', native: 'Re:ゼロから始める異世界生活' },
  format: 'TV', status: 'RELEASING', episodes: 25, duration: 25, season: 'SPRING', seasonYear: 2016,
  genres: ['Drama', 'Fantasy', 'Psychological'], averageScore: 84,
  studios: { nodes: [{ name: 'White Fox', isAnimationStudio: true }, { name: 'Kadokawa', isAnimationStudio: false }] },
  nextAiringEpisode: { episode: 26, airingAt: Math.floor(NOWMS / 1000) + 3 * 86400 + 600 }, ...o,
});

// =============================== normalizeMedia
await t('normalize: full record maps every field', () => {
  const a = L.normalizeMedia(raw(), NOW);
  assert.equal(a.id, 108632); assert.equal(a.malId, 31240); assert.equal(a.url, 'https://anilist.co/anime/108632');
  assert.equal(a.title.english, 'Re:ZERO -Starting Life in Another World-'); assert.equal(a.format, 'TV'); assert.equal(a.status, 'RELEASING');
  assert.deepEqual([a.episodes, a.duration, a.season, a.year, a.score], [25, 25, 'SPRING', 2016, 84]);
  assert.deepEqual(a.genres, ['Drama', 'Fantasy', 'Psychological']); assert.equal(a.syncedAt, NOW);
});
await t('normalize: licensors/non-animation studios dropped', () => assert.deepEqual(L.normalizeMedia(raw(), NOW).studios, ['White Fox']));
await t('normalize: studios capped at 3, blank names dropped', () => {
  const s = { nodes: ['A', 'B', 'C', 'D'].map((name) => ({ name, isAnimationStudio: true })).concat([{ name: '  ', isAnimationStudio: true }]) };
  assert.deepEqual(L.normalizeMedia(raw({ studios: s }), NOW).studios, ['A', 'B', 'C']);
});
await t('normalize: next airing converts unix seconds to ISO', () => {
  const a = L.normalizeMedia(raw(), NOW); assert.equal(a.next.episode, 26); assert.equal(Date.parse(a.next.at), NOWMS + 3 * 86400000 + 600000);
});
await t('normalize: absurd airingAt does not throw (Invalid Date guard)', () => assert.equal(L.normalizeMedia(raw({ nextAiringEpisode: { episode: 1, airingAt: 1e20 } }), NOW).next, null));
await t('normalize: missing/partial nextAiringEpisode => null', () => {
  for (const v of [null, undefined, {}, { episode: 3 }, { airingAt: 5 }]) assert.equal(L.normalizeMedia(raw({ nextAiringEpisode: v }), NOW).next, null);
});
await t('FIRESTORE SAFETY: no undefined anywhere, for full / minimal / hostile input', () => {
  const inputs = [raw(), { id: 1 }, raw({ title: null, studios: null, genres: null, episodes: undefined, idMal: undefined }), raw({ episodes: NaN, averageScore: 'x', season: 5, format: '' })];
  for (const i of inputs) { const a = L.normalizeMedia(i, NOW); assert.ok(a); assert.equal(L.hasUndefined(a), false, JSON.stringify(a)); JSON.parse(JSON.stringify(a)); }
});
await t('hasUndefined detects nested undefined (self-test of the guard)', () => {
  assert.equal(L.hasUndefined({ a: [{ b: undefined }] }), true); assert.equal(L.hasUndefined({ a: [null, 0, ''] }), false);
});
await t('normalize: minimal {id} => all nulls/empties', () => {
  const a = L.normalizeMedia({ id: 7 }, NOW);
  assert.deepEqual([a.episodes, a.score, a.next, a.url, a.malId, a.format], [null, null, null, null, null, null]);
  assert.deepEqual([a.genres, a.studios], [[], []]);
});
await t('normalize: unusable input => null (null, {}, string id, float id)', () => {
  for (const v of [null, undefined, {}, { id: '5' }, { id: 1.5 }, 'x']) assert.equal(L.normalizeMedia(v, NOW), null);
});

// =============================== titles
const A = L.normalizeMedia(raw(), NOW);
await t('titleOf: english > romaji > native > Untitled', () => {
  assert.equal(L.titleOf(A), 'Re:ZERO -Starting Life in Another World-');
  assert.equal(L.titleOf({ title: { english: null, romaji: 'R', native: 'N' } }), 'R');
  assert.equal(L.titleOf({ title: { english: null, romaji: null, native: 'N' } }), 'N');
  assert.equal(L.titleOf({ title: {} }), 'Untitled'); assert.equal(L.titleOf(null), 'Untitled');
});
await t('titlesMatch: ignores case/punctuation/accents, matches any title incl. native', () => {
  assert.equal(L.titlesMatch('re:zero -starting life in another world-', A), true);
  assert.equal(L.titlesMatch('Re Zero kara Hajimeru Isekai Seikatsu', A), true);
  assert.equal(L.titlesMatch('Re:ゼロから始める異世界生活', A), true);
  assert.equal(L.titlesMatch('Pokémon', { title: { english: 'Pokemon' } }), true);
});
await t('titlesMatch: different / empty / punctuation-only => false (no false positives)', () => {
  assert.equal(L.titlesMatch('Suits', A), false); assert.equal(L.titlesMatch('', A), false);
  assert.equal(L.titlesMatch('!!!', { title: { english: '???' } }), false); assert.equal(L.titlesMatch('x', null), false);
});
await t('altTitles: native then romaji, skips the show\'s own name, max 2', () => {
  assert.deepEqual(L.altTitles({ name: 'Re:ZERO -Starting Life in Another World-' }, A), ['Re:ゼロから始める異世界生活', 'Re:Zero kara Hajimeru Isekai Seikatsu']);
  assert.deepEqual(L.altTitles({ name: 'Re:Zero kara Hajimeru Isekai Seikatsu' }, A), ['Re:ゼロから始める異世界生活', 'Re:ZERO -Starting Life in Another World-']);
  assert.deepEqual(L.altTitles({ name: 'x' }, null), []);
});

// =============================== labels
await t('labels: known + unknown enums fall back readably', () => {
  assert.equal(L.formatLabel('TV_SHORT'), 'TV short'); assert.equal(L.formatLabel('NEW_THING'), 'New thing'); assert.equal(L.formatLabel(null), null);
  assert.equal(L.statusLabel('RELEASING'), 'Airing'); assert.equal(L.statusLabel('ON_HOLD'), 'On hold');
});
await t('seasonLabel: both / season only / year only / none', () => {
  assert.equal(L.seasonLabel('FALL', 2016), 'Fall 2016'); assert.equal(L.seasonLabel('FALL', null), 'Fall');
  assert.equal(L.seasonLabel(null, 2016), '2016'); assert.equal(L.seasonLabel(null, null), null);
});
await t('summaryLine: composes, handles 1 ep and missing parts', () => {
  assert.equal(L.summaryLine({ format: 'TV', episodes: 25, status: 'FINISHED' }), 'TV · 25 eps · Finished');
  assert.equal(L.summaryLine({ format: 'MOVIE', episodes: 1, status: null }), 'Movie · 1 ep');
  assert.equal(L.summaryLine({ format: null, episodes: null, status: null }), ''); assert.equal(L.summaryLine(null), '');
});

// =============================== airing / age
await t('nextEpisodeInfo: minutes / hours / days buckets', () => {
  const at = (ms) => ({ episode: 5, at: new Date(NOWMS + ms).toISOString() });
  assert.equal(L.nextEpisodeInfo(at(20 * 60000), NOWMS).rel, 'in 20 min');
  assert.equal(L.nextEpisodeInfo(at(5 * 3600000), NOWMS).rel, 'in 5 h');
  assert.equal(L.nextEpisodeInfo(at(3 * 86400000), NOWMS).rel, 'in 3 d');
  assert.equal(L.nextEpisodeInfo(at(1000), NOWMS).rel, 'in 1 min');
});
await t('nextEpisodeInfo: stale date says past (no negative countdown); bad input => null', () => {
  const p = L.nextEpisodeInfo({ episode: 5, at: new Date(NOWMS - 1000).toISOString() }, NOWMS); assert.deepEqual([p.past, p.rel], [true, null]);
  for (const v of [null, undefined, {}, { episode: 1, at: 'nope' }]) assert.equal(L.nextEpisodeInfo(v, NOWMS), null);
});
await t('ageLabel: today / yesterday / N days; invalid => null', () => {
  const ago = (d) => new Date(NOWMS - d * 86400000).toISOString();
  assert.equal(L.ageLabel(ago(0), NOWMS), 'Updated today'); assert.equal(L.ageLabel(ago(1), NOWMS), 'Updated yesterday');
  assert.equal(L.ageLabel(ago(9), NOWMS), 'Updated 9 days ago'); assert.equal(L.ageLabel('x', NOWMS), null);
});

// =============================== hints
await t('episodeCountNote: only for single-season TMDB shows with differing counts', () => {
  assert.equal(L.episodeCountNote({ seasons: [{ n: 1 }], totalEpisodes: 24 }, { episodes: 25 }), 'TMDB lists 24 episodes; AniList lists 25.');
  assert.equal(L.episodeCountNote({ seasons: [{ n: 1 }], totalEpisodes: 25 }, { episodes: 25 }), null);
  assert.equal(L.episodeCountNote({ seasons: [{ n: 1 }, { n: 2 }], totalEpisodes: 49 }, { episodes: 13 }), null); // not comparable
  assert.equal(L.episodeCountNote({ seasons: [{ n: 1 }], totalEpisodes: null }, { episodes: 25 }), null);
  assert.equal(L.episodeCountNote({ seasons: [{ n: 1 }], totalEpisodes: 24 }, { episodes: null }), null);  // still airing, total unknown
});
await t('looksLikeAnime: Animation genre only', () => {
  assert.equal(L.looksLikeAnime({ genres: ['Drama', 'Animation'] }), true); assert.equal(L.looksLikeAnime({ genres: ['Drama'] }), false);
  assert.equal(L.looksLikeAnime({}), false); assert.equal(L.looksLikeAnime(null), false);
});

// =============================== why unlink writes null (cloud merge is {...remote, ...local})
await t('sync merge: null overrides remote link; a DELETED key would resurrect it', () => {
  const remote = { anime: { id: 1 }, name: 'x' };
  assert.equal(({ ...remote, ...{ name: 'x', anime: null } }).anime, null);
  assert.deepEqual(({ ...remote, ...{ name: 'x' } }).anime, { id: 1 });
});

// =============================== API client (stubbed fetch)
const resp = (status, body, headers = {}) => ({ status, ok: status >= 200 && status < 300, headers: { get: (k) => headers[k] ?? null }, json: async () => { if (body === '__bad__') throw new SyntaxError('x'); return body; } });
const stub = (...steps) => { const calls = []; globalThis.fetch = async (url, opts) => { calls.push({ url, opts }); const s = steps[Math.min(calls.length - 1, steps.length - 1)]; if (s instanceof Error) throw s; return s; }; return calls; };
const page = (...ms) => resp(200, { data: { Page: { media: ms } } });

await t('search: POSTs JSON to graphql.anilist.co with the query variable; returns normalized', async () => {
  const calls = stub(page(raw(), raw({ id: 2, title: { english: 'Two' } })));
  const r = await searchAnime('  re zero  ');
  assert.equal(calls.length, 1); assert.equal(calls[0].url, 'https://graphql.anilist.co'); assert.equal(calls[0].opts.method, 'POST');
  assert.equal(calls[0].opts.headers['Content-Type'], 'application/json');
  const body = JSON.parse(calls[0].opts.body); assert.deepEqual(body.variables, { q: 're zero' }); assert.match(body.query, /SEARCH_MATCH/);
  assert.equal(r.length, 2); assert.equal(r[0].id, 108632); assert.equal(L.hasUndefined(r), false);
});
await t('search: blank query => [] with no request', async () => { const calls = stub(page()); assert.deepEqual(await searchAnime('   '), []); assert.equal(calls.length, 0); });
await t('search: unusable entries filtered; empty page => []', async () => {
  stub(page(null, { id: 'bad' }, raw())); assert.equal((await searchAnime('x')).length, 1);
  stub(resp(200, { data: { Page: { media: [] } } })); assert.deepEqual(await searchAnime('x'), []);
  stub(resp(200, { data: { Page: null } })); assert.deepEqual(await searchAnime('x'), []);
});
await t('429: rate error with Retry-After seconds; defaults to 60s; no retry', async () => {
  let calls = stub(resp(429, { errors: [{ message: 'Too Many Requests.' }] }, { 'Retry-After': '42' }));
  await assert.rejects(searchAnime('x'), (e) => e instanceof AniListError && e.kind === 'rate' && /42s/.test(e.message)); assert.equal(calls.length, 1);
  calls = stub(resp(429, null)); await assert.rejects(searchAnime('x'), (e) => e.kind === 'rate' && /60s/.test(e.message)); assert.equal(calls.length, 1);
});
await t('offline (fetch throws) => network error; AbortError => timeout error', async () => {
  stub(new TypeError('Failed to fetch')); await assert.rejects(searchAnime('x'), (e) => e.kind === 'network' && /reach AniList/.test(e.message));
  const ab = new Error('aborted'); ab.name = 'AbortError'; stub(ab); await assert.rejects(searchAnime('x'), (e) => e.kind === 'timeout');
});
await t('SEARCH_MATCH rejected (400): retries ONCE without sort and succeeds', async () => {
  const calls = stub(resp(400, { errors: [{ message: 'Unknown enum value SEARCH_MATCH' }] }), page(raw()));
  const r = await searchAnime('x'); assert.equal(calls.length, 2); assert.equal(r.length, 1);
  assert.match(JSON.parse(calls[0].opts.body).query, /sort: SEARCH_MATCH/); assert.doesNotMatch(JSON.parse(calls[1].opts.body).query, /sort:/);
});
await t('400 on both attempts => graphql error after exactly 2 requests (no loop)', async () => {
  const calls = stub(resp(400, { errors: [{ message: 'Bad query' }] })); await assert.rejects(searchAnime('x'), (e) => e.kind === 'graphql' && e.message === 'Bad query'); assert.equal(calls.length, 2);
});
await t('500 => http error, NO fallback request', async () => {
  const calls = stub(resp(500, null)); await assert.rejects(searchAnime('x'), (e) => e.kind === 'http' && e.status === 500 && /500/.test(e.message)); assert.equal(calls.length, 1);
});
await t('non-JSON body / 200 with errors and no data / 200 with no data => clean errors', async () => {
  stub(resp(200, '__bad__')); await assert.rejects(searchAnime('x'), (e) => e instanceof AniListError);
  stub(resp(200, { errors: [{ message: 'Oops' }] })); await assert.rejects(searchAnime('x'), (e) => e.message === 'Oops');
  stub(resp(200, {})); await assert.rejects(searchAnime('x'), (e) => e instanceof AniListError);
});
await t('fetchAnime: returns normalized entry by id', async () => {
  const calls = stub(resp(200, { data: { Media: raw() } })); const a = await fetchAnime(108632);
  assert.equal(a.id, 108632); assert.deepEqual(JSON.parse(calls[0].opts.body).variables, { id: 108632 });
});
await t('fetchAnime: Media null (entry removed) => helpful error', async () => {
  stub(resp(200, { data: { Media: null } })); await assert.rejects(fetchAnime(1), (e) => e instanceof AniListError && /Change match/.test(e.message));
});

console.log(`\n${n} anime tests passed`);
