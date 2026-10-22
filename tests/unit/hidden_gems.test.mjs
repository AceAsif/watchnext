import assert from 'node:assert/strict';
import * as T from '../../src/components/tasteLogic.js';
let n = 0; const t = (name, fn) => { fn(); n++; console.log('ok  -', name); };
const prof = { g: { mystery: 0.5, crime: 0.3, drama: 0.15, comedy: -0.2 }, l: { en: 0.6, hi: 0.25, ko: 0.05 }, d: { '2010s': 0.6 }, k: {}, p: {}, mass: 1, titles: 20 };
const raw = (id, kind, o = {}) => ({ id, ...(kind === 'tv' ? { name: `Show ${id}`, first_air_date: '2016-01-01' } : { title: `Film ${id}`, release_date: '2016-01-01' }), poster_path: '/p', vote_average: 7.8, vote_count: 500, genre_ids: [9648], original_language: 'en', ...o });
const cand = (id, kind, o, via = { type: 'gem' }) => T.candidateFrom(raw(id, kind, o), kind, via);

t('isGem: highly rated, enough votes to trust, few enough to be little-known (TV and films have their own limits)', () => {
  assert.equal(T.isGem(cand(1, 'movie')), true);
  assert.equal(T.isGem(cand(2, 'movie', { vote_average: 7.0 })), false, 'not rated highly enough');
  assert.equal(T.isGem(cand(3, 'movie', { vote_count: 40 })), false, 'too few votes to trust');
  assert.equal(T.isGem(cand(4, 'movie', { vote_count: 20000 })), false, 'too famous');
  assert.equal(T.isGem(cand(5, 'tv', { vote_count: 70 })), true, 'TV: 70 votes is enough');
  assert.equal(T.isGem(cand(6, 'tv', { vote_count: 2500 })), false, 'TV: 2,500 votes is famous');
});
t('topOtherLanguage: your main non-English language when it is a real part of your watching', () => {
  assert.equal(T.topOtherLanguage(prof), 'hi');
  assert.equal(T.topOtherLanguage({ l: { en: 0.95, ko: 0.05 } }), null);
});
t('gemQueries: per kind, your top genres, sorted by rating within the vote limits; plus your other language', () => {
  const q = T.gemQueries(prof);
  assert.deepEqual(q.map((x) => [x.kind, x.via.lang || '']), [['tv', ''], ['tv', 'hi'], ['movie', ''], ['movie', 'hi']]);
  assert.equal(q[0].params.with_genres, '9648|80|18'); assert.equal(q[2].params.with_genres, '9648|80|18');
  assert.equal(q[0].params.sort_by, 'vote_average.desc'); assert.equal(q[0].params['vote_count.lte'], 1500); assert.equal(q[2].params['vote_count.lte'], 3000);
  assert.equal(q[1].params.with_original_language, 'hi'); assert.equal(q[1].params.with_genres, undefined);
});
t('buildRows adds a "Hidden gems" row: gems only, that fit your taste, best mix of fit and quality first', () => {
  const pool = [
    cand(10, 'movie', { vote_average: 8.4, vote_count: 900 }),
    cand(11, 'tv', { vote_average: 7.9, vote_count: 300, genre_ids: [80] }),
    cand(12, 'movie', { vote_average: 7.6, vote_count: 200, genre_ids: [18] }),
    cand(13, 'tv', { vote_average: 8.0, vote_count: 400, genre_ids: [9648], original_language: 'hi' }),
    cand(14, 'movie', { vote_average: 8.5, vote_count: 900, genre_ids: [35] }), // comedy: you don't like it
    cand(15, 'movie', { vote_average: 8.6, vote_count: 25000 }), // famous
    cand(16, 'movie', { vote_average: 7.5, vote_count: 400, genre_ids: [80] }),
  ];
  const rows = T.buildRows({ pool, prof, now: new Date('2026-10-22') });
  const gems = rows.find((r) => r.type === 'gems');
  assert.ok(gems, JSON.stringify(rows.map((r) => r.type)));
  assert.equal(gems.title, 'Hidden gems'); assert.match(gems.sub, /less famous/);
  const keys = gems.items.map((c) => c.key);
  assert.ok(!keys.includes('movie:14') && !keys.includes('movie:15'));
  assert.equal(keys.length, 5);
  assert.match(gems.items[0].why, /^★ \d\.\d · [\d.k]+ votes · /);
});
t('gemLine: "★ 8.0 · 400 votes · Mystery"', () => {
  assert.equal(T.gemLine(prof, cand(13, 'tv', { vote_average: 8.0, vote_count: 400 })), '★ 8.0 · 400 votes · Mystery');
  assert.equal(T.gemLine(prof, cand(13, 'tv', { vote_average: 8.0, vote_count: 1400, genre_ids: [] })), '★ 8.0 · 1.4k votes');
});
t('fewer than 4 gems: no row (as with every Discover row)', () => {
  const rows = T.buildRows({ pool: [cand(10, 'movie'), cand(11, 'tv', { genre_ids: [80] })], prof, now: new Date('2026-10-22') });
  assert.equal(rows.some((r) => r.type === 'gems'), false);
});
console.log(`\n${n} hidden gems tests passed`);
