import assert from 'node:assert/strict';
import * as N from '../../src/components/newOnLogic.js';
import { summarizeMovieCredits, mergeCredits } from '../../src/components/creditsLogic.js';
let n = 0; const t = (name, fn) => { fn(); n++; console.log('ok  -', name); };
const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) }; };

const PROVIDERS = [
  { provider_id: 8, provider_name: 'Netflix' }, { provider_id: 1796, provider_name: 'Netflix basic with Ads' },
  { provider_id: 119, provider_name: 'Amazon Prime Video' }, { provider_id: 2100, provider_name: 'Amazon Prime Video with Ads' },
  { provider_id: 21, provider_name: 'Stan' }, { provider_id: 337, provider_name: 'Disney Plus' }, { provider_id: 999, provider_name: 'Some Other' },
];
t('daysBefore: calendar days, across month ends', () => {
  assert.equal(N.daysBefore('2026-10-22', 7), '2026-10-15'); assert.equal(N.daysBefore('2026-03-02', 3), '2026-02-27');
});
t('myServices: only YOUR services, one entry per service with all its TMDB ids, duplicates once', () => {
  const s = N.myServices([...PROVIDERS, { provider_id: 8, provider_name: 'Netflix' }], ['netflix', 'prime']);
  assert.deepEqual(s, [{ platform: 'netflix', label: 'Netflix', ids: [8, 1796] }, { platform: 'prime', label: 'Prime Video', ids: [119, 2100] }]);
  assert.deepEqual(N.myServices(PROVIDERS, []), []); assert.deepEqual(N.myServices(null, ['netflix']), []);
});
t('buildQueries: three per service with the right windows, region and provider ids', () => {
  const q = N.buildQueries([{ platform: 'stan', label: 'Stan', ids: [21] }], 'AU', '2026-10-22');
  assert.deepEqual(q.map((x) => [x.section, x.kind]), [['episodes', 'tv'], ['series', 'tv'], ['films', 'movie']]);
  assert.equal(q[0].params['air_date.gte'], '2026-10-15'); assert.equal(q[0].params['air_date.lte'], '2026-10-22');
  assert.equal(q[1].params['first_air_date.gte'], '2026-09-22');
  assert.equal(q[2].params['primary_release_date.gte'], '2026-07-24');
  assert.ok(q.every((x) => x.params.watch_region === 'AU' && x.params.with_watch_providers === '21'));
});
const state = { shows: { 'tmdb:10': { tmdbId: 10, name: 'Followed', followed: true }, 'tmdb:11': { tmdbId: 11, name: 'Queued', watchlist: true, followed: false } }, movies: [{ tmdbId: 20, status: 'watched' }, { tmdbId: 21, status: 'planned' }] };
const answers = [
  { section: 'episodes', kind: 'tv', platform: 'netflix', results: [{ id: 10, name: 'Followed', popularity: 5, first_air_date: '2020-01-01' }, { id: 12, name: 'Brand new', popularity: 50 }, { id: 13, name: 'Popular', popularity: 90 }] },
  { section: 'series', kind: 'tv', platform: 'stan', results: [{ id: 12, name: 'Brand new', popularity: 50, first_air_date: '2026-10-10' }] },
  { section: 'episodes', kind: 'tv', platform: 'stan', results: [{ id: 13, name: 'Popular', popularity: 90 }, { id: 11, name: 'Queued', popularity: 1 }] },
  { section: 'films', kind: 'movie', platform: 'netflix', results: [{ id: 20, title: 'Seen it', popularity: 3 }, { id: 22, title: 'Hidden one', popularity: 99 }, { id: 21, title: 'Planned', popularity: 7 }, { bad: 1 }] },
];
t('collect: one section per title (a new series is not repeated as new episodes), services merged', () => {
  const g = N.collect(answers, state, new Set(['movie:22']));
  assert.deepEqual(g.series.map((x) => [x.name, x.services]), [['Brand new', ['netflix', 'stan']]]);
  assert.deepEqual(g.episodes.map((x) => x.name), ['Followed', 'Popular', 'Queued']);
  assert.deepEqual(g.episodes.find((x) => x.name === 'Popular').services, ['netflix', 'stan']);
});
t('collect: shows you follow come first; "Not interested" titles are left out; your status is marked', () => {
  const g = N.collect(answers, state, new Set(['movie:22']));
  assert.equal(g.episodes[0].library.tone, 'following'); assert.equal(g.episodes[0].library.showId, 'tmdb:10');
  assert.deepEqual(g.films.map((x) => [x.name, x.library.label]), [['Planned', 'On your watchlist'], ['Seen it', 'Watched']]);
  assert.equal(N.collect(answers, state).films[0].name, 'Hidden one');
});
t('collect: empty or junk answers are fine', () => { assert.deepEqual(N.collect(null, state), { episodes: [], series: [], films: [] }); });
t('cache: same services + day reuses the answer for a few hours; a change of services, day or age refetches', () => {
  const s = mem(); const svcs = [{ platform: 'netflix', ids: [8] }];
  const id = N.cacheId(svcs, 'AU', '2026-10-22'); const now = Date.parse('2026-10-22T01:00:00Z');
  N.saveCache(s, id, answers, now);
  assert.equal(N.loadCache(s, id, now + 3600000).length, 4);
  assert.equal(N.loadCache(s, id, now + 7 * 3600000), null);
  assert.equal(N.loadCache(s, N.cacheId(svcs, 'AU', '2026-10-23'), now), null);
  assert.equal(N.loadCache(s, N.cacheId([{ platform: 'stan' }], 'AU', '2026-10-22'), now), null);
  s.setItem(N.CACHE_KEY, '{oops'); assert.equal(N.loadCache(s, id, now), null);
});
t('servicesText names our services', () => { assert.equal(N.servicesText(['netflix', 'stan']), 'Netflix · Stan'); });

t('summarizeMovieCredits: cast in billing order, crew grouped, same shape as TV', () => {
  const d = { credits: { cast: [{ id: 2, name: 'B', order: 1, character: 'Bee' }, { id: 1, name: 'A', order: 0, character: 'Ay', profile_path: '/a.jpg' }], crew: [{ id: 9, name: 'Dir', job: 'Director' }, { id: 9, name: 'Dir', job: 'Screenplay' }, { id: 8, name: 'Writer', job: 'Writer' }, { id: 7, name: 'Prod', job: 'Producer' }, { id: 6, name: 'Grip', job: 'Grip' }] } };
  const s = summarizeMovieCredits(d);
  assert.deepEqual(s.cast.map((c) => [c.name, c.character]), [['A', 'Ay'], ['B', 'Bee']]);
  assert.deepEqual(s.groups.map((g) => [g.title, g.people.map((p) => p.name)]), [['Directors', ['Dir']], ['Writers', ['Dir', 'Writer']], ['Producers', ['Prod']]]);
  assert.deepEqual(s.created, []); assert.equal(s.directors.length, 1); assert.equal(s.crewTotal, 5);
  assert.deepEqual(summarizeMovieCredits(null).cast, []);
});
t('mergeCredits leaves out the film you are looking at', () => {
  const m = mergeCredits({ cast: [{ id: 5, media_type: 'movie', title: 'This film' }, { id: 6, media_type: 'movie', title: 'Other' }], crew: [] }, null, 5);
  assert.deepEqual(m.map((x) => x.name), ['Other']);
});
console.log(`\n${n} new on services tests passed`);
