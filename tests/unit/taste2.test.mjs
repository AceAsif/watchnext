// Discover Phase 2: time-of-day nudges, the shared profile in Tonight and Movie night, the
// AniList anime row, the "Your taste" summary and the hit rate.   node tests/unit/taste2.test.mjs
process.env.TZ = 'Australia/Hobart';
import assert from 'node:assert/strict';
import * as T from '../../src/components/tasteLogic.js';
import { runDiscover, localProfile } from '../../src/components/discoverEngine.js';
import { suggest, contextNote, tasteWeight, TASTE_WEIGHT, TASTE_FULL_AT, CONTEXT_POINTS } from '../../src/components/tonightLogic.js';
import { suggestMovies } from '../../src/components/movieNightLogic.js';
import * as HL from '../../src/components/hitLogic.js';

let n = 0; const tests = []; const t = (name, fn) => tests.push([name, fn]);
const local = (s) => new Date(s); // a wall-clock time in Hobart (TZ set above)
const NOW = new Date('2026-10-01T22:00:00.000Z'); // Fri 2 Oct 08:00 Hobart
const ago = (d) => new Date(NOW.getTime() - d * T.DAY).toISOString();
const eps = (count, at) => Object.fromEntries(Array.from({ length: count }, (_, i) => [`1x${i + 1}`, { at, min: 25 }]));

// ------------------------------------------------------------------ time of day
t('time context: Fri 17:00 → Sun night is the weekend; Mon–Thu evenings weeknight; 22:00–05:00 late; else daytime', () => {
  const slot = (s) => T.timeContext(local(s)).slot;
  assert.equal(slot('2026-10-09T16:59:00'), 'daytime', 'Fri afternoon');
  assert.equal(slot('2026-10-09T17:00:00'), 'weekend', 'Fri 5 pm');
  assert.equal(slot('2026-10-10T10:00:00'), 'weekend', 'Sat morning');
  assert.equal(slot('2026-10-11T23:30:00'), 'weekend', 'Sun late is still the weekend');
  assert.equal(slot('2026-10-12T19:00:00'), 'weeknight', 'Mon 7 pm');
  assert.equal(slot('2026-10-13T22:15:00'), 'late', 'Tue 10:15 pm');
  assert.equal(slot('2026-10-14T03:00:00'), 'late', 'Wed 3 am');
  assert.equal(slot('2026-10-14T05:00:00'), 'daytime');
  assert.equal(T.timeContext(local('2026-10-10T20:00:00')).prefer, 'movie'); assert.equal(T.timeContext(local('2026-10-12T19:00:00')).prefer, 'tv');
  assert.equal(T.timeContext(local('2026-10-14T10:00:00')).prefer, null);
});
t('Top picks subtitle says how the moment tilts it (and nothing extra in the daytime)', () => {
  assert.equal(T.contextSub(T.timeContext(local('2026-10-10T20:00:00'))), 'Ranked on everything you watch · leaning to films for the weekend');
  assert.equal(T.contextSub(T.timeContext(local('2026-10-12T19:00:00'))), 'Ranked on everything you watch · leaning to series for tonight');
  assert.equal(T.contextSub(T.timeContext(local('2026-10-14T10:00:00'))), 'Ranked on everything you watch'); assert.equal(T.contextSub(null), 'Ranked on everything you watch');
});
const RAW = (id, name, o = {}) => ({ id, name, poster_path: `/p${id}.jpg`, first_air_date: '2022-01-01', vote_average: 7.4, vote_count: 900, genre_ids: [18], original_language: 'en', ...o });
const MRAW = (id, title, o = {}) => ({ id, title, poster_path: `/m${id}.jpg`, release_date: '2022-01-01', vote_average: 7.4, vote_count: 900, genre_ids: [18], original_language: 'en', ...o });
const PROF = { g: { drama: 0.5 }, l: { en: 0.5 }, d: { '2020s': 0.4 }, k: {}, p: {}, mass: 1, titles: 3 };
t('the time nudge is light: at the weekend an equal film edges ahead of an equal series, never past a clearly better one', () => {
  const via = { type: 'seed', key: 'tv:1', name: 'X', w: 1 };
  const pool = T.mergeCandidates([[T.candidateFrom(RAW(1, 'Series'), 'tv', via), T.candidateFrom(MRAW(2, 'Film'), 'movie', via), T.candidateFrom(RAW(3, 'Great series', { vote_average: 9, vote_count: 9000 }), 'tv', via), T.candidateFrom(RAW(4, 'S4'), 'tv', via), T.candidateFrom(RAW(5, 'S5'), 'tv', via)]]);
  const wk = T.timeContext(local('2026-10-10T20:00:00')), day = T.timeContext(local('2026-10-14T10:00:00'));
  const order = (ctx) => T.buildRows({ pool, prof: PROF, seeds: [], now: NOW, ctx })[0].items.map((c) => c.name);
  assert.equal(order(wk)[0], 'Great series', 'a clearly better series still wins');
  assert.ok(order(wk).indexOf('Film') < order(wk).indexOf('Series'), 'weekend: the film edges ahead of an equal series');
  const scores = (ctx) => Object.fromEntries(T.buildRows({ pool, prof: PROF, seeds: [], now: NOW, ctx })[0].items.map((c) => [c.name, c.score]));
  assert.ok(Math.abs(scores(wk).Film - scores(day).Film - T.CONTEXT_BONUS) < 1e-9); assert.equal(scores(wk).Series, scores(day).Series);
});

// ------------------------------------------------------------------ shared profile
t('titleTaste: uses the device cache when it knows the title, otherwise the genre names on the record', () => {
  const prof = { g: { mystery: 0.6, comedy: -0.4 }, l: { de: 0.5 }, d: { '2010s': 0.3 }, k: {}, p: {}, mass: 1 };
  const cache = { items: { 'tv:9': { g: ['mystery'], l: 'de', y: 2017, k: [], p: [], t: ago(1) } } };
  const known = T.titleTaste(prof, cache, { kind: 'tv', tmdbId: 9, genres: ['Comedy'] });
  assert.ok(known.taste > 0.9, 'cache (mystery, German, 2010s) beats the record\'s genre'); assert.equal(known.genre, 'mystery');
  const unknown = T.titleTaste(prof, cache, { kind: 'tv', tmdbId: 10, genres: ['Comedy'] });
  assert.ok(unknown.taste < 0); assert.equal(unknown.genre, null);
  assert.equal(T.tasteLine(known), `${known.match}% match · you like Mystery`); assert.equal(T.tasteLine(unknown), `${unknown.match}% match`); assert.equal(T.tasteLine(null), '');
});
t('profileIsEmpty: a brand-new library says nothing (so Tonight/Movie night stay exactly as before)', () => {
  assert.equal(T.profileIsEmpty(localProfile({ shows: {}, movies: [] }, {}, { items: {} }, NOW)), true);
  assert.equal(T.profileIsEmpty(null), true);
  assert.equal(T.profileIsEmpty(localProfile({ shows: { a: { name: 'A', rating: 5, genres: ['Drama'], watched: {} } }, movies: [] }, {}, { items: {} }, NOW)), false);
});

// Tonight
const H = { watchedCount: (s) => Object.keys(s.watched || {}).length, lastWatchDate: () => '' };
const TONIGHT_STATE = () => ({
  shows: {
    // liked: rated mysteries; disliked: a reality show dropped after 1 episode
    'tmdb:1': { tmdbId: 1, name: 'Loved Mystery', rating: 5, ratedAt: ago(5), genres: ['Mystery'], totalEpisodes: 10, watched: eps(10, ago(5)), followed: true, status: 'Ended' },
    'tmdb:2': { tmdbId: 2, name: 'Reality Dud', dropped: true, genres: ['Reality'], totalEpisodes: 20, watched: eps(1, ago(40)), followed: true },
    // on the watchlist, not started, same runtime: one fits your taste, one doesn't
    'tmdb:11': { tmdbId: 11, name: 'New Mystery', watchlist: true, genres: ['Mystery'], runtimeMin: 45, totalEpisodes: 8, seasons: [{ n: 1, count: 8, air: '2020-01-01' }], watched: {} },
    'tmdb:12': { tmdbId: 12, name: 'New Reality', watchlist: true, genres: ['Reality'], runtimeMin: 45, totalEpisodes: 8, seasons: [{ n: 1, count: 8, air: '2020-01-01' }], watched: {} },
    'tmdb:13': { tmdbId: 13, name: 'Short Sitcom', watchlist: true, genres: ['Comedy'], runtimeMin: 22, totalEpisodes: 8, seasons: [{ n: 1, count: 8, air: '2020-01-01' }], watched: {} },
  },
  movies: [{ tmdbId: 50, name: 'Planned Film', status: 'planned', runtimeMin: 100, genres: ['Drama'] }],
});
import { buildCandidates } from '../../src/components/tonightLogic.js';
t('Tonight: with your taste, the watchlist show you\'d like ranks above the one you wouldn\'t; each pick carries its match', () => {
  const st = TONIGHT_STATE(); const cands = buildCandidates(st, '2026-10-02', H);
  const prof = localProfile(st, {}, { items: {} }, NOW);
  const opts = { minutes: 45, mood: 'any', seed: 3, today: '2026-10-02' };
  const r = suggest(cands, { ...opts, taste: { prof, cache: { items: {} } } }).picks.map((p) => p.name);
  assert.ok(r.indexOf('New Mystery') >= 0 && (r.indexOf('New Reality') === -1 || r.indexOf('New Mystery') < r.indexOf('New Reality')), r.join(','));
  const p = suggest(cands, { ...opts, taste: { prof, cache: { items: {} } } }).picks.find((x) => x.name === 'New Mystery');
  assert.ok(p.taste && p.taste.match > 80 && p.taste.genre === 'mystery');
  const plain = suggest(cands, opts).picks; assert.ok(plain.every((x) => x.taste === null && x.ctxNote === ''), 'no taste passed = old behaviour');
  // exactly tasteWeight × taste is added to the old score (same seed, so same jitter); 6 titles -> 6/10 of the full weight
  assert.equal(prof.titles, 6); assert.equal(tasteWeight(prof), TASTE_WEIGHT * 0.6);
  const withT = suggest(cands, { ...opts, taste: { prof, cache: { items: {} } } }).picks.find((x) => x.name === 'New Mystery');
  const without = suggest(cands, opts).picks.find((x) => x.name === 'New Mystery');
  assert.ok(without, 'in the plain top 3 too'); assert.ok(Math.abs(withT.score - without.score - tasteWeight(prof) * withT.taste.taste) < 1e-9);
});
t('Tonight time nudge: short episodes on a weeknight or late, a film at the weekend; with a note saying so', () => {
  const st = TONIGHT_STATE(); const cands = buildCandidates(st, '2026-10-02', H);
  const sitcom = cands.find((c) => c.name === 'Short Sitcom'), film = cands.find((c) => c.kind === 'movie'), mystery = cands.find((c) => c.name === 'New Mystery');
  const wn = T.timeContext(local('2026-10-12T19:00:00')), late = T.timeContext(local('2026-10-12T23:00:00')), wk = T.timeContext(local('2026-10-10T20:00:00'));
  assert.equal(contextNote(wn, sitcom), 'Short episodes for a weeknight'); assert.equal(contextNote(late, sitcom), 'Short episodes for a late night');
  assert.equal(contextNote(wn, mystery), '', '45-minute episodes are not "short"'); assert.equal(contextNote(wn, film), '');
  assert.equal(contextNote(wk, film), 'A film for the weekend'); assert.equal(contextNote(wk, sitcom), '');
  // "Something thoughtful" (Drama) puts the planned film first either way; the weekend adds CONTEXT_POINTS and the note
  const o = { minutes: 120, mood: 'thoughtful', seed: 1, today: '2026-10-02' };
  const f1 = suggest(cands, { ...o, ctx: wk }).picks[0], f0 = suggest(cands, o).picks[0];
  assert.equal(f1.kind, 'movie'); assert.equal(f1.ctxNote, 'A film for the weekend'); assert.equal(f0.ctxNote, '');
  assert.equal(f1.score - f0.score, CONTEXT_POINTS);
});

t('taste counts in full from TASTE_FULL_AT titles, proportionally less before (a 2-title profile is a hint, not a verdict)', () => {
  assert.equal(TASTE_FULL_AT, 10);
  assert.equal(tasteWeight({ titles: 2 }), TASTE_WEIGHT * 0.2); assert.equal(tasteWeight({ titles: 10 }), TASTE_WEIGHT); assert.equal(tasteWeight({ titles: 400 }), TASTE_WEIGHT);
  assert.equal(tasteWeight({ titles: 0 }), 0); assert.equal(tasteWeight({}), TASTE_WEIGHT); assert.equal(tasteWeight(null), TASTE_WEIGHT);
});

// Movie night
const MN = (id, name, genres, o = {}) => ({ key: 'n:' + id, tmdbId: id, name, year: '2021', poster: '/p', genres, voteAvg: 7, runtime: 110, details: { original_language: 'en' }, avail: null, because: [], seedScore: 0, popular: true, onMine: true, via: 'subs', ...o });
t('Movie night: your taste across shows AND movies lifts the film you\'d like; picks carry the match', () => {
  const prof = { g: { mystery: 0.6, thriller: 0.3, comedy: -0.4 }, l: { en: 0.5 }, d: { '2020s': 0.3 }, k: {}, p: {}, mass: 1 };
  const cands = [MN(1, 'Comedy Film', ['Comedy']), MN(2, 'Mystery Film', ['Mystery', 'Thriller'])];
  for (const seed of [0, 1, 2, 3, 4]) { // whatever the shuffle, taste puts the mystery first
    const tasted = suggestMovies(cands, { minutes: 120, seed, taste: { prof, cache: { items: {} } } }).picks;
    assert.equal(tasted[0].name, 'Mystery Film'); assert.ok(tasted[0].taste.match > tasted[1].taste.match);
    const plain = suggestMovies(cands, { minutes: 120, seed }).picks; const pm = plain.find((x) => x.name === 'Mystery Film');
    assert.ok(Math.abs(tasted[0].score - pm.score - TASTE_WEIGHT * tasted[0].taste.taste) < 1e-9, 'a profile without a title count counts in full');
  }
  assert.ok(suggestMovies(cands, { minutes: 120 }).picks.every((p) => p.taste === null));
});

// ------------------------------------------------------------------ anime row
const AL = (id, en, o = {}) => ({ id, title: { english: en, romaji: en + ' (romaji)' }, seasonYear: 2019, genres: ['Action', 'Drama'], averageScore: 82, popularity: 150000, description: '<b>About</b> ' + en + '.<br>', coverImage: { large: `https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx${id}.jpg` }, trailer: { id: 'abcdefghijk', site: 'youtube' }, ...o });
t('anime candidate: AniList fields mapped (English title, cover, score /10, no HTML, YouTube trailer); adult and coverless dropped', () => {
  const c = T.animeCandidate(AL(21, 'One Piece'), { type: 'seed', key: 'anime:1', name: 'Naruto', w: 1 });
  assert.equal(c.key, 'anime:21'); assert.equal(c.kind, 'anime'); assert.equal(c.name, 'One Piece'); assert.equal(c.vote, 8.2); assert.equal(c.votes, 150000);
  assert.equal(c.overview, 'About One Piece.'); assert.equal(c.trailer, 'abcdefghijk'); assert.equal(c.l, 'ja'); assert.deepEqual(c.g, ['animation', 'action', 'drama']);
  assert.equal(T.animeCandidate(AL(22, 'Adult', { isAdult: true })), null);
  assert.equal(T.animeCandidate(AL(23, 'No cover', { coverImage: {} })), null);
  assert.equal(T.animeCandidate(AL(24, 'Bad cover', { coverImage: { large: 'http://x/y.jpg' } })), null);
  assert.equal(T.animeCandidate(AL(25, '', { title: { romaji: 'Romaji Only' } })).name, 'Romaji Only');
  assert.equal(T.animeCandidate(AL(26, 'Dm', { trailer: { id: 'x', site: 'dailymotion' } })).trailer, null);
});
const ANIME_LIB = () => ({
  shows: {
    'tmdb:300': { tmdbId: 300, name: 'Attack on Titan', rating: 5, ratedAt: ago(10), genres: ['Animation', 'Action & Adventure'], totalEpisodes: 87, watched: eps(87, ago(10)), anime: { id: 16498 } },
    'tmdb:301': { tmdbId: 301, name: 'Disliked Anime', rating: 1, ratedAt: ago(10), genres: ['Animation'], totalEpisodes: 12, watched: eps(12, ago(10)), anime: { id: 777 } },
    'tmdb:302': { tmdbId: 302, name: 'Owned Anime', genres: ['Animation'], totalEpisodes: 12, watched: eps(3, ago(10)), anime: { id: 101 } },
  },
  movies: [], settings: {},
});
t('anime seed: the liked anime linked to AniList (never a disliked one); library anime ids are owned', () => {
  const e = T.libraryEntries(ANIME_LIB(), [], NOW);
  assert.equal(T.pickAnimeSeed(e).name, 'Attack on Titan'); assert.equal(T.pickAnimeSeed(e).anilistId, 16498);
  assert.deepEqual([...T.ownedAnimeKeys(ANIME_LIB())].sort(), ['anime:101', 'anime:16498', 'anime:777']);
  assert.equal(T.pickAnimeSeed(T.libraryEntries({ shows: { a: { name: 'x', rating: 5, watched: {} } }, movies: [] }, [], NOW)), null);
  const onlyDisliked = ANIME_LIB(); delete onlyDisliked.shows['tmdb:300'];
  assert.equal(T.pickAnimeSeed(T.libraryEntries(onlyDisliked, [], NOW)), null, 'a 1★ anime never seeds the row (and the half-watched one is too weak)');
});
t('pipeline: an "Anime like Attack on Titan" row from AniList, without owned or hidden anime, and only in its own row', async () => {
  const log = [];
  const api = {
    details: async () => ({}), recommendations: async () => ({ results: [] }), similar: async () => ({ results: [] }), personCredits: async () => ({}), discover: async () => ({ results: [] }), providerList: async () => ({ results: [] }), trending: async () => ({ results: [] }),
    animeRecs: async (id) => { log.push(id); return [AL(1, 'Vinland Saga'), AL(2, 'Demon Slayer'), AL(101, 'Owned Anime'), AL(3, 'Jujutsu Kaisen'), AL(4, 'Hidden One'), AL(5, 'Mob Psycho 100'), AL(6, 'Adult', { isAdult: true })]; },
  };
  const hidden = { 'anime:4': { on: true, at: ago(1), name: 'Hidden One' } };
  const r = await runDiscover({ state: ANIME_LIB(), hidden, cache: { items: {} }, api, now: NOW, gap: 0 });
  assert.deepEqual(log, [16498], 'one AniList call, for the liked anime');
  const row = r.rows.find((x) => x.type === 'anime'); assert.ok(row, r.rows.map((x) => x.type).join(','));
  assert.equal(row.title, 'Anime like Attack on Titan');
  assert.deepEqual(row.items.map((c) => c.name).sort(), ['Demon Slayer', 'Jujutsu Kaisen', 'Mob Psycho 100', 'Vinland Saga']);
  assert.ok(r.rows.filter((x) => x.type !== 'anime').every((x) => x.items.every((c) => c.kind !== 'anime')));
  assert.ok(row.items.every((c) => /^Action · 2019$|^Drama · 2019$|^Animation · 2019$/.test(c.why)), row.items.map((c) => c.why).join('|'));
});
t('pipeline: AniList down → no anime row, everything else still works; no anime linked → AniList is never asked', async () => {
  let asked = 0;
  const base = { details: async () => ({}), recommendations: async () => ({ results: Array.from({ length: 6 }, (_, i) => RAW(900 + i, 'R' + i, { genre_ids: [16] })) }), similar: async () => ({ results: [] }), personCredits: async () => ({}), discover: async () => ({ results: [] }), providerList: async () => ({ results: [] }), trending: async () => ({ results: [] }) };
  const r = await runDiscover({ state: ANIME_LIB(), hidden: {}, cache: { items: {} }, api: { ...base, animeRecs: async () => { asked++; throw new Error('AniList rate limit'); } }, now: NOW, gap: 0 });
  assert.equal(asked, 1); assert.ok(!r.rows.some((x) => x.type === 'anime')); assert.ok(r.rows.some((x) => x.type === 'seed'));
  const noAnime = { shows: { a: { tmdbId: 1, name: 'A', rating: 5, watched: {}, genres: ['Drama'] } }, movies: [] };
  await runDiscover({ state: noAnime, hidden: {}, cache: { items: {} }, api: { ...base, animeRecs: async () => { asked++; return []; } }, now: NOW, gap: 0 });
  assert.equal(asked, 1);
});

// ------------------------------------------------------------------ "Your taste"
t('tasteSummary: genre and language shares add up to 100% of what you lean to; themes/people need 2+ liked titles; steering away lists disliked genres', () => {
  const prof = {
    g: { mystery: 0.3, drama: 0.2, scifi: 0.1, reality: -0.2, talk: -0.005 }, l: { en: 0.4, ko: 0.2, de: -0.1 }, d: {},
    k: { 1: { name: 'time travel', s: 0.3, n: 3 }, 2: { name: 'one-off', s: 0.5, n: 1 }, 3: { name: 'disliked theme', s: -0.2, n: 2 } },
    p: { 7: { name: 'Actor A', s: 0.3, n: 3, role: 'a' }, 8: { name: 'Maker M', s: 0.2, n: 2, role: 'c' }, 9: { name: 'Solo', s: 0.9, n: 1, role: 'c' } },
    mass: 2, titles: 12,
  };
  const s = T.tasteSummary(prof, { learned: 9 });
  assert.deepEqual(s.genres.map((g) => [g.label, g.pct]), [['Mystery', 50], ['Drama', 33], ['Sci-Fi', 17]]);
  assert.deepEqual(s.languages.map((l) => [l.label, l.pct]), [['English', 67], ['Korean', 33]]);
  assert.deepEqual(s.away, ['Reality'], 'tiny negatives are noise, not "steering away"');
  assert.deepEqual(s.themes, ['time travel']); assert.deepEqual(s.people.map((x) => x.name), ['Maker M', 'Actor A'], 'makers count double');
  assert.equal(s.titles, 12); assert.equal(s.learned, 9);
  assert.equal(T.tasteSummary({ g: {}, l: {}, d: {}, k: {}, p: {}, mass: 0 }), null);
  assert.equal(T.languageName('xx'), 'XX'); assert.equal(T.languageName('ko'), 'Korean');
});

// ------------------------------------------------------------------ hit rate
t('hit log: first-shown date is kept, junk dropped, newest LOG_MAX kept', () => {
  let log = HL.recordShown({}, [{ key: 'tv:1', name: 'A' }, { key: 'movie:2', name: 'B' }, { key: 'bogus', name: 'x' }, null], ago(10));
  log = HL.recordShown(log, [{ key: 'tv:1', name: 'A again' }, { key: 'anime:3', name: 'C' }], ago(1));
  assert.deepEqual(Object.keys(log).sort(), ['anime:3', 'movie:2', 'tv:1']); assert.equal(log['tv:1'].at, ago(10)); assert.equal(log['tv:1'].name, 'A');
  const many = {}; for (let i = 0; i < HL.LOG_MAX + 3; i++) many[`tv:${i}`] = { at: new Date(NOW.getTime() - i * 60000).toISOString(), name: '' };
  const kept = HL.sanitizeLog(many); assert.equal(Object.keys(kept).length, HL.LOG_MAX); assert.ok(kept['tv:0'] && !kept[`tv:${HL.LOG_MAX + 2}`]);
  for (const bad of [null, 5, 'x', [], { 'tv:1': { at: 'nope' } }]) assert.deepEqual(HL.sanitizeLog(bad), {});
});
t('hit stats: suggested titles now in your library count as added; watched = an episode marked or the movie marked watched', () => {
  const log = HL.recordShown({}, [{ key: 'tv:1', name: 'Show added' }, { key: 'tv:2', name: 'Show watched' }, { key: 'movie:3', name: 'Planned film' }, { key: 'movie:4', name: 'Watched film' }, { key: 'anime:5', name: 'Anime' }, { key: 'tv:9', name: 'Ignored' }], ago(5));
  const state = {
    shows: { 'tmdb:1': { tmdbId: 1, watched: {} }, 'tmdb:2': { tmdbId: 2, watched: eps(1, ago(1)) }, 'tmdb:5': { tmdbId: 55, anime: { id: 5 }, watched: eps(2, ago(1)) } },
    movies: [{ tmdbId: 3, status: 'planned' }, { tmdbId: 4, status: 'watched' }, { name: 'no id' }],
  };
  const st = HL.hitStats(log, state);
  assert.equal(st.suggested, 6); assert.equal(st.added, 5); assert.equal(st.watched, 3);
  const old = HL.hitStats(HL.recordShown({}, [{ key: 'movie:8', name: 'Old entry' }], ago(5)), { shows: {}, movies: [{ tmdbId: 8 }] });
  assert.equal(old.watched, 1, 'a movie saved before statuses existed is a watched one'); assert.equal(st.since, ago(5)); assert.equal(st.recent.length, 5);
  assert.equal(HL.hitLine(st), 'Discover has suggested 6 titles: you added 5 (83%) and watched 3.');
  assert.equal(HL.hitLine(HL.hitStats(HL.recordShown({}, [{ key: 'tv:1', name: 'x' }], ago(1)), { shows: {}, movies: [] })), 'Discover has suggested 1 title so far. Add one you like and it counts here.');
  assert.equal(HL.hitLine({ suggested: 400, added: 1, watched: 0 }), 'Discover has suggested 400 titles: you added 1 (<1%) and watched 0.');
  assert.equal(HL.hitLine(HL.hitStats({}, state)), '');
});
t('relinkShown: an anime pick added as a TMDB show moves to that key and then counts as a hit', () => {
  const log = HL.recordShown({}, [{ key: 'anime:101922', name: 'Demon Slayer' }], ago(3));
  const moved = HL.relinkShown(log, 'anime:101922', 'tv:5100');
  assert.deepEqual(Object.keys(moved), ['tv:5100']); assert.equal(moved['tv:5100'].at, ago(3));
  assert.equal(HL.hitStats(moved, { shows: { x: { tmdbId: 5100, watched: {} } }, movies: [] }).added, 1);
  assert.deepEqual(HL.relinkShown(log, 'anime:9', 'tv:1'), log, 'unknown key: unchanged'); assert.deepEqual(HL.relinkShown(log, 'anime:101922', 'bogus'), log);
});
t('hit log load/save survive broken or blocked storage', () => {
  const mem = new Map(); const st = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
  HL.saveLog(st, { 'tv:1': { at: ago(1), name: 'A' } }); assert.equal(HL.loadLog(st)['tv:1'].name, 'A');
  mem.set(HL.LOG_KEY, '{x'); assert.deepEqual(HL.loadLog(st), {});
  const blocked = { getItem: () => { throw new Error('no'); }, setItem: () => { throw new Error('no'); } }; assert.deepEqual(HL.loadLog(blocked), {}); HL.saveLog(blocked, {});
});

for (const [name, fn] of tests) { await fn(); n++; console.log('ok  -', name); }
console.log(`\n${n} taste phase two tests passed`);
