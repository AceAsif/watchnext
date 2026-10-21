import assert from 'node:assert/strict';
import * as O from '../../src/components/originsLogic.js';
let n = 0; const t = (name, fn) => { fn(); n++; console.log('ok  -', name); };
const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) }; };

const state = {
  shows: {
    'tmdb:1': { tmdbId: 1, name: 'Squid Game', genres: ['Drama'], watched: { '1x1': { at: '2024-01-01T10:00:00Z' } } },
    'tmdb:2': { tmdbId: 2, name: 'Frieren', genres: ['Animation'], watched: { '1x1': {} } },
    'tvdb:3': { name: 'Old Show', genres: [], watched: { '1x1': {} } },
    'tmdb:4': { tmdbId: 4, name: 'Never watched', watched: {} },
    'tmdb:5': { tmdbId: 5, name: 'Linked anime', genres: ['Drama'], anime: { id: 99 }, watched: { '1x1': {} } },
  },
  movies: [
    { tmdbId: 10, name: 'RRR', status: 'watched', watchedAt: '2024-02-01T00:00:00Z', genres: ['Action'] },
    { tmdbId: 10, name: 'RRR', status: 'watched', watchedAt: '2025-02-01T00:00:00Z', genres: ['Action'] },
    { tmdbId: 11, name: 'Your Name', watchedAt: '2023-02-01T00:00:00Z', genres: ['Animation'] },
    { tmdbId: 12, name: 'Planned', status: 'planned' },
    { name: 'Unlinked film', watchedAt: '2020-01-01T00:00:00Z' },
  ],
};

t('originOf: origin_country + original_language; falls back to production_countries; drops junk and "xx"', () => {
  assert.deepEqual(O.originOf({ origin_country: ['KR'], original_language: 'ko' }).c, ['KR']);
  assert.equal(O.originOf({ origin_country: ['KR'], original_language: 'ko' }).l, 'ko');
  assert.deepEqual(O.originOf({ origin_country: [], production_countries: [{ iso_3166_1: 'IN' }, { iso_3166_1: 'GB' }] }).c, ['IN', 'GB']);
  const bad = O.originOf({ origin_country: ['usa', 5, 'US', 'US'], original_language: 'xx' });
  assert.deepEqual(bad.c, ['US']); assert.equal(bad.l, null);
  assert.deepEqual(O.originOf(null).c, []);
});
t('recordOrigin: keyed m<id>/t<id>; same answer -> same cache object; no id -> unchanged', () => {
  let c = O.emptyCache();
  c = O.recordOrigin(c, 'movie', { id: 10, origin_country: ['IN'], original_language: 'te' });
  c = O.recordOrigin(c, 'tv', { id: 1, origin_country: ['KR'], original_language: 'ko' });
  assert.deepEqual(Object.keys(c.items).sort(), ['m10', 't1']);
  assert.equal(O.recordOrigin(c, 'movie', { id: 10, origin_country: ['IN'], original_language: 'te' }), c);
  assert.equal(O.recordOrigin(c, 'movie', { origin_country: ['IN'] }), c);
});
t('loadCache/saveCache round-trip; corrupt or hostile data is cleaned, never crashes', () => {
  const s = mem();
  const c = O.recordOrigin(O.emptyCache(), 'movie', { id: 7, origin_country: ['FR'], original_language: 'fr' });
  O.saveCache(s, c);
  assert.deepEqual(O.loadCache(s).items.m7.c, ['FR']);
  s.setItem(O.CACHE_KEY, '{oops'); assert.deepEqual(O.loadCache(s), O.emptyCache());
  s.setItem(O.CACHE_KEY, JSON.stringify({ items: { __proto__x: {}, m1: { c: 'US', l: 5 }, t2: { c: ['JP'], l: 'ja', t: 'nope' } } }));
  const l = O.loadCache(s);
  assert.deepEqual(l.items.m1.c, []); assert.equal(l.items.m1.l, null); assert.deepEqual(l.items.t2.c, ['JP']);
  assert.equal(Object.keys(l.items).length, 2);
});
t('watchedTitles: films once each (rewatches count once), shows with a watched episode, planned/unwatched left out', () => {
  const ts = O.watchedTitles(state);
  assert.deepEqual(ts.map((x) => x.name).sort(), ['Frieren', 'Linked anime', 'Old Show', 'RRR', 'Squid Game', 'Unlinked film', 'Your Name']);
  assert.equal(ts.find((x) => x.name === 'Old Show').key, '');
  assert.equal(ts.find((x) => x.name === 'Squid Game').key, 't1');
  assert.equal(ts.find((x) => x.name === 'RRR').key, 'm10');
});
t('titlesToCheck: only linked titles not cached yet; an empty answer is re-asked after 90 days', () => {
  const ts = O.watchedTitles(state);
  let c = O.recordOrigin(O.emptyCache(), 'movie', { id: 10, origin_country: ['IN'], original_language: 'te' });
  c = O.recordOrigin(c, 'tv', { id: 1 }, new Date('2026-01-01T00:00:00Z')); // empty answer
  const keys = (now) => O.titlesToCheck(ts, c, now).map((x) => x.key).sort();
  assert.deepEqual(keys(new Date('2026-02-01T00:00:00Z')), ['m11', 't2', 't5']);
  assert.deepEqual(keys(new Date('2026-06-01T00:00:00Z')), ['m11', 't1', 't2', 't5']);
});
t('countryName / languageLabel: English names, TMDB special codes, unknown code shown as-is', () => {
  assert.equal(O.countryName('IN'), 'India'); assert.equal(O.countryName('KR'), 'South Korea'); assert.equal(O.countryName('XK'), 'Kosovo');
  assert.equal(O.languageLabel('hi'), 'Hindi'); assert.equal(O.languageLabel('cn'), 'Cantonese'); assert.equal(O.languageLabel('zh'), 'Mandarin');
  assert.equal(O.countryName('ZZ').length > 0, true);
});
t('isAnime: linked to AniList, or Animation from Japan / in Japanese; plain animation is not anime', () => {
  assert.equal(O.isAnime({ anime: true, genres: [] }, null), true);
  assert.equal(O.isAnime({ anime: false, genres: ['Animation'] }, { c: ['JP'], l: 'en' }), true);
  assert.equal(O.isAnime({ anime: false, genres: ['Animation'] }, { c: ['US'], l: 'ja' }), true);
  assert.equal(O.isAnime({ anime: false, genres: ['Animation'] }, { c: ['US'], l: 'en' }), false);
  assert.equal(O.isAnime({ anime: false, genres: ['Drama'] }, { c: ['JP'], l: 'ja' }), false);
  assert.equal(O.isAnime({ anime: false, genres: ['Animation'] }, null), false);
});
t('buildWorld: counts per country and language, co-productions count for each country, filters work', () => {
  let c = O.emptyCache();
  c = O.recordOrigin(c, 'movie', { id: 10, origin_country: ['IN'], original_language: 'te' });
  c = O.recordOrigin(c, 'movie', { id: 11, origin_country: ['JP'], original_language: 'ja' });
  c = O.recordOrigin(c, 'tv', { id: 1, origin_country: ['KR'], original_language: 'ko' });
  c = O.recordOrigin(c, 'tv', { id: 2, origin_country: ['JP'], original_language: 'ja' });
  c = O.recordOrigin(c, 'tv', { id: 5, origin_country: ['JP', 'US'], original_language: 'ja' });
  const ts = O.watchedTitles(state);
  const w = O.buildWorld(ts, c);
  assert.deepEqual(w.countries.map((x) => [x.code, x.count]), [['JP', 3], ['IN', 1], ['KR', 1], ['US', 1]]);
  assert.deepEqual(w.languages.map((x) => [x.label, x.count]), [['Japanese', 3], ['Korean', 1], ['Telugu', 1]]);
  assert.equal(w.known, 5); assert.equal(w.unlinked, 2); assert.equal(w.pending, 0); assert.equal(w.total, 7);
  assert.deepEqual(w.countries[0].titles.map((x) => x.name), ['Frieren', 'Linked anime', 'Your Name']);
  const films = O.buildWorld(ts, c, 'movie');
  assert.deepEqual(films.countries.map((x) => x.code).sort(), ['IN', 'JP']); assert.equal(films.unlinked, 1);
  assert.equal(O.buildWorld(ts, O.emptyCache()).pending, 5);
});
t('shadeLevel: 0 none, 1 for one title, then 2–9, 10–49, 50+', () => {
  assert.deepEqual([0, 1, 2, 9, 10, 49, 50, 400].map(O.shadeLevel), [0, 1, 2, 2, 3, 3, 4, 4]);
});
console.log(`\n${n} origins tests passed`);
