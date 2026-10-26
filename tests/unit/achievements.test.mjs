import assert from 'node:assert/strict';
import * as A from '../../src/components/achievementsLogic.js';
import { recordOrigin, emptyCache } from '../../src/components/originsLogic.js';
import { BADGE_ICONS } from '../../src/components/badgeArt.js';
let n = 0; const t = (name, fn) => { fn(); n++; console.log('ok  -', name); };

const eps = (count, day = '2024-03-0', min = 30) => Object.fromEntries(Array.from({ length: count }, (_, i) => [`1x${i + 1}`, { at: `${day}${(i % 3) + 1}T10:00:00Z`, min }]));
const state = {
  shows: {
    'tmdb:1': { tmdbId: 1, name: 'Done show', followed: true, totalEpisodes: 3, genres: ['Drama'], rating: 4, watched: eps(3) },
    'tmdb:2': { tmdbId: 2, name: 'Big show', followed: true, totalEpisodes: 200, genres: ['Comedy', 'Animation'], watched: { ...eps(97, '2024-05-0'), '9x9': { at: '2024-05-04T10:00:00Z', n: 3, min: 30 } } },
    'tmdb:3': { tmdbId: 3, name: 'Dropped but complete', followed: true, dropped: true, totalEpisodes: 1, watched: eps(1) },
    'tmdb:4': { tmdbId: 4, name: 'Anime', genres: ['Animation'], anime: { id: 5 }, watched: eps(1) },
  },
  movies: [
    { tmdbId: 10, name: 'RRR', watchedAt: '2024-03-04T00:00:00Z', year: '2022', runtimeMin: 180, genres: ['Action'], platform: 'cinema', rating: 4.5 },
    { tmdbId: 10, name: 'RRR', watchedAt: '2025-03-04T00:00:00Z', year: '2022', runtimeMin: 180, rating: 5, react: 'love' },
    { tmdbId: 11, name: 'Old one', watchedAt: '2020-01-01T00:00:00Z', year: '1975', genres: ['Drama'] },
    { tmdbId: 12, name: 'Ghibli', watchedAt: '2020-01-02T00:00:00Z', year: '1988', genres: ['Animation'] },
    { tmdbId: 13, name: 'Planned', status: 'planned', year: '2030', genres: ['Horror'] },
  ],
};
let origins = emptyCache();
origins = recordOrigin(origins, 'movie', { id: 10, origin_country: ['IN'], original_language: 'te' });
origins = recordOrigin(origins, 'movie', { id: 11, origin_country: ['US'], original_language: 'en' });
origins = recordOrigin(origins, 'movie', { id: 12, origin_country: ['JP'], original_language: 'ja' });
origins = recordOrigin(origins, 'tv', { id: 1, origin_country: ['KR'], original_language: 'ko' });
const metrics = A.computeMetrics(state, { origins, collections: [{ complete: true }, { complete: false }] });

t('longestStreak: consecutive days, repeats ignored, gaps break the run', () => {
  assert.equal(A.longestStreak([]), 0);
  assert.equal(A.longestStreak(['2024-01-01', '2024-01-01', '2024-01-02', '2024-01-03', '2024-01-05']), 3);
  assert.equal(A.longestStreak(['2024-02-28', '2024-02-29', '2024-03-01']), 3);
});
t('computeMetrics: episodes count rewatches (n), films counted once, hours from runtimes', () => {
  assert.equal(metrics.episodes, 3 + 97 + 3 + 1 + 1);
  assert.equal(metrics.movies, 3);
  // TV: 105 eps x 30 min = 3150; films: 180 + 180 + 110 + 110 = 580 -> 3730 min
  assert.equal(metrics.hours, Math.floor(3730 / 60));
});
t('computeMetrics: finished shows skip dropped ones; ratings, cinema, rewatches, notes, collections', () => {
  assert.equal(metrics.finished, 1);
  assert.equal(metrics.critic, 3); // 1 show + 2 film viewings
  assert.equal(metrics.cinema, 1);
  assert.equal(metrics.rewatch, 1);
  assert.equal(metrics.notes, 1);
  assert.equal(metrics.collections, 1);
});
t('computeMetrics: genres and decades from watched titles only (the planned film does not count)', () => {
  assert.equal(metrics.genres, 4); // Drama, Comedy, Animation, Action
  assert.equal(metrics.decades, 3); // 1970s, 1980s, 2020s
});
t('computeMetrics: countries, film languages and anime come from the origins cache', () => {
  assert.equal(metrics.countries, 4); // IN, US, JP, KR
  assert.equal(metrics.languages, 3); // films only: te, en, ja
  assert.equal(metrics.anime, 2); // the AniList-linked show + the Japanese animated film
  assert.equal(metrics.originsKnown, 4);
  const none = A.computeMetrics(state, {});
  assert.equal(none.countries, 0); assert.equal(none.anime, 1); assert.equal(none.collections, 0);
});
t('computeMetrics: the longest streak uses episodes and films together', () => {
  assert.equal(metrics.streak, 4); // episodes 1–3 Mar 2024 + the film on 4 Mar = 4 days in a row
});
t('badgeFor: levels, progress to the next goal, labels', () => {
  const def = A.BADGES.find((b) => b.id === 'episodes');
  const zero = A.badgeFor(def, 0);
  assert.equal(zero.level, 0); assert.equal(zero.pct, 0); assert.equal(zero.label, 'Not yet'); assert.equal(zero.nextLabel, 'Next: Bronze at 100 episodes · 100 to go');
  const b = A.badgeFor(def, 300);
  assert.equal(b.level, 1); assert.equal(b.levelName, 'Bronze'); assert.equal(b.next, 500); assert.equal(b.pct, 50);
  assert.equal(b.label, 'Bronze · 100 episodes'); assert.equal(b.nextLabel, 'Next: Silver at 500 episodes · 200 to go');
  const max = A.badgeFor(def, 50000);
  assert.equal(max.done, true); assert.equal(max.level, 6); assert.equal(max.pct, 100); assert.equal(max.nextLabel, 'Legend reached · 50,000 episodes');
  assert.equal(A.badgeFor(def, 99).pct, 99); assert.equal(A.badgeFor(def, NaN).level, 0);
});
t('buildBadges + badgeSummary: one badge per definition, levels add up', () => {
  const badges = A.buildBadges(metrics);
  assert.equal(badges.length, A.BADGES.length);
  const s = A.badgeSummary(badges);
  assert.equal(s.total, A.BADGES.length);
  assert.equal(s.levels, badges.reduce((x, b) => x + b.level, 0));
  assert.ok(s.earned > 0 && s.earned <= s.total);
  assert.equal(badges.find((b) => b.id === 'episodes').level, 1);
  assert.equal(badges.find((b) => b.id === 'languages').level, 1); // 3 languages = Bronze
});
t('sortBadges: highest level first (Legend, Diamond…), then the nearest to a first level', () => {
  const s = A.sortBadges([
    { id: 'a', level: 0, maxLevel: 5, pct: 10 }, { id: 'b', level: 1, maxLevel: 5, pct: 0 },
    { id: 'c', level: 0, maxLevel: 5, pct: 80 }, { id: 'd', level: 3, maxLevel: 5, pct: 0 },
  ]);
  assert.deepEqual(s.map((x) => x.id), ['d', 'b', 'c', 'a']);
});
t('every badge has rising goals, its own Gem hex icon and a unit label', () => {
  for (const b of A.BADGES) {
    assert.equal(b.goals.length, b.rare ? 1 : A.LEVEL_NAMES.length, b.id + ': every badge has all six levels (a rare badge has one), so a colour means the same everywhere');
    assert.ok(b.goals.every((g, i) => i === 0 || g > b.goals[i - 1]), b.id);
    assert.ok(Array.isArray(BADGE_ICONS[b.id]) && BADGE_ICONS[b.id].length > 0, b.id + ' has no icon');
    assert.ok(b.title && b.what && b.unit(2).includes('2'), b.id);
  }
});
t('the next-level line never names a level you already have', () => {
  for (const def of A.BADGES.filter((b) => !b.rare)) for (const v of [0, def.goals[0], def.goals[2] + 1, def.goals[5]]) { // rare badges: see their own test
    const b = A.badgeFor(def, v);
    if (b.done) assert.match(b.nextLabel, /^Legend reached/);
    else { assert.ok(b.nextLabel.startsWith('Next: ' + A.LEVEL_NAMES[b.level] + ' at '), b.nextLabel); assert.notEqual(A.LEVEL_NAMES[b.level], b.levelName); }
  }
});
t('the old confusing case: Genre hopper at 19 genres is now Platinum of 6, not "every level reached"', () => {
  const b = A.badgeFor(A.BADGES.find((x) => x.id === 'genres'), 19);
  assert.equal(b.levelName, 'Platinum'); assert.equal(b.level, 4); assert.equal(b.done, false);
  assert.equal(b.nextLabel, 'Next: Diamond at 20 genres · 1 to go');
});
t('rare badge (Hot Ticket): one goal, earned or not, Legend colour, chip "Rare"', () => {
  const def = A.BADGES.find((b) => b.id === 'hotticket');
  assert.equal(def.rare, true); assert.deepEqual(def.goals, [10]);
  const no = A.badgeFor(def, 7);
  assert.deepEqual([no.level, no.tier, no.done, no.label, no.levelName], [0, 0, false, 'Not yet', '']);
  assert.equal(no.nextLabel, 'Rare badge at 10 films · 3 to go'); assert.equal(no.pct, 70);
  const yes = A.badgeFor(def, 12);
  assert.deepEqual([yes.level, yes.maxLevel, yes.tier, yes.done, yes.levelName, yes.label], [1, 1, 6, true, 'Rare', 'Rare · 10 films']);
  assert.equal(yes.nextLabel, 'Rare badge earned · 12 films');
  assert.equal(A.badgeFor(A.BADGES.find((b) => b.id === 'hot'), 10).tier, 2, 'normal badges: tier = level');
  // an earned rare badge sorts with the Legends
  const s = A.sortBadges([{ id: 'x', level: 5, tier: 5, pct: 0 }, { id: 'r', level: 1, tier: 6, pct: 100 }, { id: 'y', level: 1, tier: 1, pct: 0 }]);
  assert.deepEqual(s.map((b) => b.id), ['r', 'x', 'y']);
});
t('Watch it Hot / Hot Ticket metrics come from saved air and release dates', () => {
  const m = A.computeMetrics({ shows: { a: { name: 'A', watched: {
    '1x1': { at: '2026-10-25T10:00:00.000Z', air: '2026-10-25' }, '1x2': { at: '2026-10-25T10:00:00.000Z' }, '1x3': { at: '2026-10-29T10:00:00.000Z', air: '2026-10-25' },
  } } }, movies: [{ name: 'F', tmdbId: 1, status: 'watched', watchedAt: '2026-10-25T10:00:00.000Z', released: '2026-10-20' }, { name: 'G', tmdbId: 2, status: 'watched', watchedAt: '2026-10-25T10:00:00.000Z', released: '2026-01-01' }] });
  assert.equal(m.hot, 1); assert.equal(m.hotticket, 1);
});
console.log(`\n${n} achievements tests passed`);
