import assert from 'node:assert/strict';
import * as M from '../../src/components/movieNightLogic.js';
let n = 0; const t = (name, fn) => { fn(); n++; console.log('ok  -', name); };
const raw = (id, title, o = {}) => ({ id, title, poster_path: '/p' + id + '.jpg', release_date: '2020-05-05', genre_ids: [18], vote_average: 7.2, ...o });
const rec = (id, title, seed = { name: 'Dune', rating: 5 }, o = {}) => M.recommendedCandidate(raw(id, title, o), seed);
const pop = (id, title, via = 'subs', o = {}) => M.popularCandidate(raw(id, title, o), via);
const det = (runtime, genres = [{ id: 35, name: 'Comedy' }], year = '2021-01-01') => ({ runtime, genres, release_date: year });

t('genre ids <-> names (TMDB movie genres); unknown ids are dropped', () => {
  assert.equal(M.MOVIE_GENRE_ID.Comedy, 35); assert.equal(M.MOVIE_GENRE_ID['Science Fiction'], 878); assert.equal(M.MOVIE_GENRE_ID.Horror, 27);
  assert.deepEqual(M.genreNames([35, 27, 999999, 'x']), ['Comedy', 'Horror']); assert.deepEqual(M.genreNames(null), []); assert.deepEqual(M.genreNames(undefined), []);
});
t('moods become TMDB genre ids; TV-only names are ignored; "Surprise me" has none', () => {
  assert.deepEqual(M.moodGenreIds('funny').sort((a, b) => a - b), [16, 35, 10751]); assert.deepEqual(M.moodGenreIds('gripping').sort((a, b) => a - b), [27, 53, 80, 9648].sort((a, b) => a - b));
  assert.ok(M.moodGenreIds('escape').includes(878) && M.moodGenreIds('escape').includes(14) && M.moodGenreIds('escape').includes(28)); assert.deepEqual(M.moodGenreIds('any'), []); assert.deepEqual(M.moodGenreIds('nope'), []);
});
t('your TMDB provider ids come from the provider list by NAME (Netflix, Stan…), only for services you ticked', () => {
  const list = [{ provider_id: 8, provider_name: 'Netflix' }, { provider_id: 21, provider_name: 'Stan' }, { provider_id: 385, provider_name: 'Binge' }, { provider_id: 999, provider_name: 'Netflix Standard with Ads' }, { provider_id: 5, provider_name: 'Foxtel Now' }, null, { provider_name: 'No id' }];
  assert.deepEqual(M.myProviderIds(list, new Set(['netflix', 'stan'])).sort((a, b) => a - b), [8, 21, 999]); assert.deepEqual(M.myProviderIds(list, new Set()), []); assert.deepEqual(M.myProviderIds(undefined, new Set(['netflix'])), []); assert.deepEqual(M.myProviderIds(list, ['binge']), [385]);
});
t('discover query: region, popularity order, quality floor, runtime window from the time you have, mood genres joined with OR, YOUR providers with subscription only', () => {
  const p = M.discoverParams({ providerIds: [8, 21], minutes: 120, mood: 'funny', page: 2, kind: 'subs' });
  assert.deepEqual(p, { watch_region: 'AU', sort_by: 'popularity.desc', include_adult: 'false', page: 2, 'vote_count.gte': 150, 'vote_average.gte': 6, 'with_runtime.gte': 60, 'with_runtime.lte': 120, with_genres: p.with_genres, with_watch_providers: '8|21', with_watch_monetization_types: 'flatrate' });
  assert.deepEqual(p.with_genres.split('|').map(Number).sort((a, b) => a - b), [16, 35, 10751]);
});
t('free query: free or ad-supported on ANY provider (no provider filter); "Surprise me" adds no genre filter', () => {
  const p = M.discoverParams({ providerIds: [8], minutes: 90, mood: 'any', kind: 'free' }); assert.equal(p.with_watch_monetization_types, 'free|ads'); assert.ok(!('with_watch_providers' in p)); assert.ok(!('with_genres' in p)); assert.equal(p['with_runtime.lte'], 90);
});
t('which queries run: subscriptions only when you have ticked services that TMDB knows; the free one always', () => {
  assert.deepEqual(M.popularQueries({ providerIds: [8], minutes: 120, mood: 'any' }).map((q) => q.kind), ['subs', 'free']); assert.deepEqual(M.popularQueries({ providerIds: [], minutes: 120, mood: 'any' }).map((q) => q.kind), ['free']);
});
t('candidates: need an id, a title and a poster; recommended ones remember WHY, popular ones are on your services by construction', () => {
  assert.equal(M.recommendedCandidate(raw(1, 'X', { poster_path: null }), { name: 'S', rating: 4 }), null); assert.equal(M.recommendedCandidate({ id: 1 }, { name: 'S' }), null); assert.equal(M.recommendedCandidate(null, { name: 'S' }), null); assert.equal(M.popularCandidate(raw(2, ''), 'free'), null);
  const r = rec(10, 'Arrival', { name: 'Dune', rating: 5 }); assert.deepEqual([r.because, r.seedScore, r.popular, r.onMine, r.runtime, r.genres], [['Dune'], 5, false, false, null, ['Drama']]);
  const p = pop(11, 'Heat', 'free'); assert.deepEqual([p.because, p.popular, p.onMine, p.via, p.year], [[], true, true, 'free', '2020']);
});
t('merge: one entry per movie; reasons and scores add up; "popular on your services" wins over unknown; movies you already have are dropped', () => {
  const a = rec(1, 'A', { name: 'Dune', rating: 5 }), a2 = rec(1, 'A', { name: 'Heat', rating: 4 }), b = pop(1, 'A', 'subs'), c = pop(2, 'B', 'free'), d = rec(3, 'C');
  const m = M.mergePool([[a, d], [a2], [b, c]], new Set([3])); const one = m.find((x) => x.tmdbId === 1);
  assert.deepEqual(m.map((x) => x.tmdbId).sort(), [1, 2]); assert.deepEqual([one.because, one.seedScore, one.popular, one.onMine, one.via], [['Dune', 'Heat'], 9, true, true, 'subs']);
  assert.deepEqual(M.mergePool([[d]], new Set([3]), new Set([3])).map((x) => x.tmdbId), [3], 'one you just added stays visible'); assert.deepEqual(M.mergePool([], new Set()), []); assert.deepEqual(M.mergePool([[null, undefined]], new Set()), []);
  assert.deepEqual(a.because, ['Dune'], 'inputs are not mutated');
});
t('details add the runtime, exact genres and year; missing or zero runtime stays unknown; junk details change nothing', () => {
  const c = rec(1, 'A'); const d = M.withDetails(c, det(104)); assert.deepEqual([d.runtime, d.genres, d.year], [104, ['Comedy'], '2021']); assert.equal(M.withDetails(c, det(0)).runtime, null); assert.equal(M.withDetails(c, det(undefined)).runtime, null);
  assert.equal(M.withDetails(c, null), c); assert.equal(M.withDetails(c, 'x'), c); assert.deepEqual(M.withDetails(c, { runtime: 100, genres: [] }).genres, ['Drama'], 'no genres listed: keep the list genres'); assert.equal(c.runtime, null);
});
t('which details to look up first: likely mood matches and movies you have reason to like; never ones already looked up; never more than the limit', () => {
  const pool = [rec(1, 'Drama low', { name: 'S', rating: 1 }, { genre_ids: [18], vote_average: 5 }), rec(2, 'Comedy', { name: 'S', rating: 1 }, { genre_ids: [35], vote_average: 5 }), rec(3, 'Drama loved', { name: 'S', rating: 5 }, { genre_ids: [18], vote_average: 8 }), pop(4, 'Pop comedy', 'subs', { genre_ids: [35], vote_average: 7 })];
  assert.deepEqual(M.enrichOrder(pool, { mood: 'funny', limit: 2 }), [4, 2]); assert.deepEqual(M.enrichOrder(pool, { mood: 'any', limit: 2 }), [3, 4]); assert.deepEqual(M.enrichOrder(pool, { mood: 'funny', have: new Set([4, 2]), limit: 4 }), [3, 1]); assert.deepEqual(M.enrichOrder(pool, { mood: 'funny', have: new Set([4, 2]), limit: 2 }), [], 'the top 2 are already known: nothing more to fetch'); assert.deepEqual(M.enrichOrder(pool, { mood: 'funny', have: new Set([4, 2]), limit: 3 }), [3], 'widening the net fetches only the next one');
  assert.deepEqual(M.enrichOrder([], {}), []); assert.equal(M.ENRICH_BATCH, 12);
});
const E = (c, runtime, o = {}) => ({ ...c, runtime, ...o });
t('ranking only considers movies with a KNOWN runtime that fits: 120 minutes keeps 119 and drops 121, 59-minute shorts and not-yet-looked-up ones', () => {
  const pool = [E(pop(1, 'A'), 119), E(pop(2, 'B'), 121), E(pop(3, 'C'), 59), pop(4, 'D'), E(pop(5, 'E'), 60)];
  const r = M.suggestMovies(pool, { minutes: 120, today: 'x' }); assert.deepEqual(r.picks.map((p) => p.tmdbId).sort(), [1, 5]); assert.equal(r.fitting, 2);
});
t('time choices: 90 min to 3 hr; an unknown time falls back to 2 hr', () => {
  assert.deepEqual(M.MOVIE_TIME_CHOICES, [90, 105, 120, 150, 180]); const pool = [E(pop(1, 'A'), 100)]; assert.equal(M.suggestMovies(pool, { minutes: 90 }).picks.length, 0); assert.equal(M.suggestMovies(pool, { minutes: 105 }).picks.length, 1); assert.equal(M.suggestMovies(pool, { minutes: 7 }).picks.length, 1);
});
t('mood: genre matches first (by exact genres once looked up), unknown genres next, non-matching last and flagged', () => {
  const pool = [E(pop(1, 'Drama film'), 100, { genres: ['Drama'] }), E(pop(2, 'Funny film'), 100, { genres: ['Comedy'] }), E(pop(3, 'Mystery genres'), 100, { genres: [] })];
  const r = M.suggestMovies(pool, { minutes: 120, mood: 'funny' }); assert.deepEqual(r.picks.map((p) => [p.name, p.moodState]), [['Funny film', 'match'], ['Mystery genres', 'unknown'], ['Drama film', 'no']]); assert.equal(r.matching, 1);
  assert.ok(M.suggestMovies(pool, { minutes: 120, mood: 'any' }).picks.every((p) => p.moodState === null));
});
t('movies you rated a reason for outrank plain popular ones; better-rated and fuller-time movies score higher', () => {
  const pool = [E(pop(1, 'Popular'), 100), E(rec(2, 'Because', { name: 'Dune', rating: 5 }), 100), E(pop(3, 'Short popular'), 70)];
  assert.deepEqual(M.suggestMovies(pool, { minutes: 105 }).picks.map((p) => p.name), ['Because', 'Popular', 'Short popular']);
  const hi = [E(pop(1, 'Low rated', 'subs', { vote_average: 6 }), 100), E(pop(2, 'High rated', 'subs', { vote_average: 8.5 }), 100)]; assert.equal(M.suggestMovies(hi, { minutes: 105 }).picks[0].name, 'High rated');
});
t('"Only on my services": popular ones qualify by construction; a recommended one only after an availability lookup confirms it (or it is free); unconfirmed ones are left out', () => {
  const mine = new Set(['netflix']); const avail = (subs, free = []) => ({ providers: subs.map((n) => ({ name: n })), providersFree: free.map((n) => ({ name: n })), providersSynced: '2026-10-01T00:00:00.000Z' });
  const pool = [E(pop(1, 'Popular on mine'), 100), E(rec(2, 'Rec unchecked'), 100), E(rec(3, 'Rec on Netflix'), 100, { avail: avail(['Netflix']) }), E(rec(4, 'Rec on Binge'), 100, { avail: avail(['Binge']) }), E(rec(5, 'Rec free'), 100, { avail: avail([], ['ABC iview']) })];
  const r = M.suggestMovies(pool, { minutes: 120, onlyMine: true, mine, exclude: new Set() }); assert.deepEqual(r.picks.map((p) => p.name).sort(), ['Popular on mine', 'Rec free', 'Rec on Netflix']);
  const all = M.suggestMovies(pool, { minutes: 120, onlyMine: false, mine }); assert.equal(all.fitting, 5);
});
t('"where": a looked-up service name when known; otherwise "On your services" / "Free to watch" for popular ones; nothing for an unchecked recommendation', () => {
  const mine = new Set(['netflix']); const w = (c) => M.suggestMovies([c], { minutes: 120, mine }).picks[0].where;
  assert.equal(w(E(rec(1, 'A'), 100, { avail: { providers: [{ name: 'Netflix' }], providersFree: [], providersSynced: 'x' } })), 'Netflix'); assert.equal(w(E(pop(2, 'B', 'subs'), 100)), 'On your services'); assert.equal(w(E(pop(3, 'C', 'free'), 100)), 'Free to watch'); assert.equal(w(E(rec(4, 'D'), 100)), '');
});
t('hidden ("Not for me") movies are never suggested', () => { const pool = [E(pop(1, 'A'), 100), E(pop(2, 'B'), 100)]; assert.deepEqual(M.suggestMovies(pool, { minutes: 120, hidden: new Set(['n:1']) }).picks.map((p) => p.name), ['B']); });
t('at most 3 picks; deterministic; a new seed reshuffles; "different ones" never repeats until all shown, then starts over', () => {
  const pool = Array.from({ length: 8 }, (_, i) => E(pop(100 + i, 'Movie ' + i), 100)); const a = M.suggestMovies(pool, { minutes: 120, seed: 0 }), a2 = M.suggestMovies(pool, { minutes: 120, seed: 0 }), b = M.suggestMovies(pool, { minutes: 120, seed: 1 });
  assert.equal(a.picks.length, 3); assert.deepEqual(a.picks.map((p) => p.key), a2.picks.map((p) => p.key)); assert.notDeepEqual(a.picks.map((p) => p.key), b.picks.map((p) => p.key));
  const seen = new Set(); let round = M.suggestMovies(pool, { minutes: 120 }); for (let i = 0; i < 3; i++) { round.picks.forEach((p) => { assert.ok(!seen.has(p.key), 'repeat'); seen.add(p.key); }); round = M.suggestMovies(pool, { minutes: 120, exclude: new Set(seen) }); if (i < 2) assert.equal(round.wrapped, false); }
  assert.equal(seen.size, 8); assert.equal(round.wrapped, true); assert.equal(round.picks.length, 3);
});
t('wording: why-lines, runtime/spare time, rating, source note, empty text', () => {
  const mine = new Set(['netflix']); const r = M.suggestMovies([E(rec(1, 'A', { name: 'Dune', rating: 5 }), 100), E(pop(2, 'B', 'free'), 119, { voteAvg: 0 })], { minutes: 120, mine });
  const a = r.picks.find((p) => p.name === 'A'), b = r.picks.find((p) => p.name === 'B'); assert.deepEqual(M.whyLines(a), ['Because you liked Dune', '100 min · 20 min to spare', '★ 7.2 on TMDB']); assert.deepEqual(M.whyLines(b), ['Popular and free to watch', '119 min']);
  assert.deepEqual(M.whyLines({ because: ['A', 'B', 'C'], popular: false, runtime: 90, spare: 30, voteAvg: 0 }), ['Because you liked A and B', '90 min · 30 min to spare']);
  assert.equal(M.emptyText(120, 'funny', true), 'No new movie found that fits 2 hr on your services for “Make me laugh”. Try more time, switching off “Only on my services”, or a different mood.'); assert.equal(M.emptyText(90, 'any', false), 'No new movie found that fits 1 hr 30 min. Try more time or a different mood.');
});
t('remembered choices are sanitised (own key); corrupt, missing and throwing storage are safe', () => {
  assert.deepEqual(M.sanitizePrefs({ minutes: 150, mood: 'escape', onlyMine: true }), { minutes: 150, mood: 'escape', onlyMine: true }); assert.deepEqual(M.sanitizePrefs({ minutes: 45, mood: 'zz', onlyMine: 1 }), { minutes: 120, mood: 'any', onlyMine: false }); assert.deepEqual(M.sanitizePrefs(null), { minutes: 120, mood: 'any', onlyMine: false });
  const m = new Map(); const st = { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) }; M.savePrefs(st, { minutes: 90, mood: 'funny', onlyMine: true }); assert.deepEqual(M.loadPrefs(st), { minutes: 90, mood: 'funny', onlyMine: true }); m.set(M.PREFS_KEY, '{oops'); assert.equal(M.loadPrefs(st).minutes, 120);
  const bad = { getItem() { throw new Error('x'); }, setItem() { throw new Error('y'); } }; assert.equal(M.loadPrefs(bad).minutes, 120); M.savePrefs(bad, {}); assert.equal(M.PREFS_KEY, 'watchnext-movienight-v1');
});
t('junk and scale: bad entries never throw; 2,000 candidates rank in well under a second', () => {
  for (const bad of [undefined, null, [], [null, 5, {}, { runtime: 'x' }]]) assert.ok(Array.isArray(M.suggestMovies(bad || [], { minutes: 120 }).picks)); assert.ok(Array.isArray(M.suggestMovies([null, 5, {}, { runtime: 100 }].filter(Boolean).filter((x) => typeof x === 'object'), { minutes: 120 }).picks));
  const pool = Array.from({ length: 2000 }, (_, i) => E(pop(i + 1, 'M' + i, i % 2 ? 'subs' : 'free', { genre_ids: [35] }), 80 + (i % 60))); const t0 = Date.now(); const r = M.suggestMovies(pool, { minutes: 120, mood: 'funny' }); assert.ok(Date.now() - t0 < 800); assert.equal(r.picks.length, 3);
});
t('details panel text: tagline and synopsis come from the details already fetched; trimmed; never undefined', () => {
  const c = M.withDetails(rec(1, 'A'), { runtime: 100, genres: [], overview: '  A thief steals dreams.  ', tagline: ' Dream bigger. ' });
  assert.deepEqual(M.detailsText(c), { tagline: 'Dream bigger.', overview: 'A thief steals dreams.', hasOverview: true });
  assert.deepEqual(M.detailsText(M.withDetails(rec(2, 'B'), { runtime: 90, genres: [], overview: 'Plot.' })), { tagline: '', overview: 'Plot.', hasOverview: true });
});
t('details panel text: a blank/missing/odd synopsis shows the "no description" line; junk input never throws', () => {
  for (const d of [{ overview: '' }, { overview: '   ' }, { overview: null }, { overview: 42 }, {}]) {
    const r = M.detailsText({ details: d }); assert.equal(r.overview, M.NO_OVERVIEW); assert.equal(r.hasOverview, false); assert.equal(r.tagline, '');
  }
  for (const bad of [undefined, null, {}, { details: null }, { details: 'x' }, 5]) { const r = M.detailsText(bad); assert.equal(r.overview, M.NO_OVERVIEW); assert.equal(typeof r.tagline, 'string'); }
  assert.equal(M.NO_OVERVIEW, 'No description available on TMDB.');
});
t('trailer link: a real 11-character YouTube key gives the watch URL; anything else gives null (never a bad link)', () => {
  assert.equal(M.trailerUrl('dQw4w9WgXcQ'), 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'); assert.equal(M.trailerUrl('a_b-C1d2E3f'), 'https://www.youtube.com/watch?v=a_b-C1d2E3f');
  for (const bad of [undefined, null, '', 'short', 'dQw4w9WgXcQ&x=1', 'dQw4w9WgXc ', 'https://evil.example/x', 12345678901, 'dQw4w9WgXcQQ']) assert.equal(M.trailerUrl(bad), null, String(bad));
});
console.log(`\n${n} tests passed`);
