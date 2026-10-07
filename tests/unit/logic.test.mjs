import assert from 'node:assert/strict';
import { seasonPremiereDate, seasonInfo, nextToMark, leadingDoneCount, currentSeasonN, leadingWatchedFold } from '../../src/components/showLogic.js';
import { summarizeCredits, mergeCredits } from '../../src/components/creditsLogic.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('ok  -', name); };
const W = (...ks) => Object.fromEntries(ks.map((k) => [k, { at: '2026-01-01', n: 1 }]));
const range = (s, a, b) => Array.from({ length: b - a + 1 }, (_, i) => `${s}x${a + i}`);
const TODAY = '2026-09-30';

// ---- seasonInfo
t('seasonInfo: partial season', () => {
  const show = { watched: W(...range(1, 1, 5)) };
  const i = seasonInfo(show, { n: 1, count: 10 }, TODAY);
  assert.deepEqual([i.seen, i.count, i.pct, i.done, i.upcoming], [5, 10, 50, false, false]);
});
t('seasonInfo: 14/13 (rewatch/special overflow) clamps bar to 100 and counts as done', () => {
  const show = { watched: W(...range(2, 1, 14)) };
  const i = seasonInfo(show, { n: 2, count: 13 }, TODAY);
  assert.equal(i.pct, 100); assert.equal(i.done, true); assert.equal(i.seen, 14);
});
t('seasonInfo: "1x1" must not match season 11 keys (prefix bug guard)', () => {
  const show = { watched: W('11x1', '11x2') };
  assert.equal(seasonInfo(show, { n: 1, count: 5 }, TODAY).seen, 0);
});
t('seasonInfo: future air date => upcoming', () => {
  assert.equal(seasonInfo({ watched: {} }, { n: 3, count: 8, air: '2027-01-01' }, TODAY).upcoming, true);
});
t('seasonInfo: undated + empty + unwatched => upcoming; undated but watched => not', () => {
  assert.equal(seasonInfo({ watched: {} }, { n: 3, count: 0 }, TODAY).upcoming, true);
  assert.equal(seasonInfo({ watched: W('3x1') }, { n: 3, count: 0 }, TODAY).upcoming, false);
});
t('seasonInfo: nextAir dates an otherwise undated season', () => {
  const show = { watched: {}, nextAir: { season: 4, date: '2027-02-02', episode: 1 } };
  assert.equal(seasonInfo(show, { n: 4, count: 6 }, TODAY).upcoming, true);
});
t('seasonInfo: count 0 does not divide by zero', () => {
  assert.equal(seasonInfo({ watched: {} }, { n: 1, count: 0 }, TODAY).pct, 0);
});

// ---- nextToMark
const suits = { seasons: [{ n: 1, count: 3 }, { n: 2, count: 3 }], watched: W(...range(1, 1, 3), '2x1', '2x2') };
t('nextToMark: first unwatched', () => assert.deepEqual(nextToMark(suits, TODAY), { season: 2, episode: 3 }));
t('nextToMark: fills an earlier gap (skipped ep), not the latest', () => {
  const s = { seasons: [{ n: 1, count: 4 }], watched: W('1x1', '1x3', '1x4') };
  assert.deepEqual(nextToMark(s, TODAY), { season: 1, episode: 2 });
});
t('nextToMark: fully watched => null', () => {
  assert.equal(nextToMark({ seasons: [{ n: 1, count: 2 }], watched: W('1x1', '1x2') }, TODAY), null);
});
t('nextToMark: skips specials (season 0)', () => {
  const s = { seasons: [{ n: 0, count: 5 }, { n: 1, count: 1 }], watched: {} };
  assert.deepEqual(nextToMark(s, TODAY), { season: 1, episode: 1 });
});
t('nextToMark: NEVER offers an unaired episode (nextAir in the future)', () => {
  const s = { seasons: [{ n: 1, count: 4 }], watched: W('1x1', '1x2'), nextAir: { season: 1, episode: 3, date: '2026-10-10' } };
  assert.equal(nextToMark(s, TODAY), null);
});
t('nextToMark: airing episode that has already aired IS offered', () => {
  const s = { seasons: [{ n: 1, count: 4 }], watched: W('1x1', '1x2'), nextAir: { season: 1, episode: 3, date: '2026-09-01' } };
  assert.deepEqual(nextToMark(s, TODAY), { season: 1, episode: 3 });
});
t('nextToMark: next season not yet released => null', () => {
  const s = { seasons: [{ n: 1, count: 1 }, { n: 2, count: 8, air: '2027-01-01' }], watched: W('1x1') };
  assert.equal(nextToMark(s, TODAY), null);
});
t('nextToMark: no seasons loaded => null (no crash)', () => {
  assert.equal(nextToMark({ watched: {} }, TODAY), null);
  assert.equal(nextToMark({}, TODAY), null);
});

// ---- leadingDoneCount / currentSeasonN
const D = (done) => ({ done });
t('leadingDoneCount: Suits-like 7 done + 2 left => 7', () => assert.equal(leadingDoneCount([...Array(7).fill(D(true)), D(false), D(false)]), 7));
t('leadingDoneCount: only 2 done => 0 (not worth folding)', () => assert.equal(leadingDoneCount([D(true), D(true), D(false)]), 0));
t('leadingDoneCount: everything done => 0 (list all, don\'t hide the whole show)', () => assert.equal(leadingDoneCount([D(true), D(true), D(true), D(true)]), 0));
t('leadingDoneCount: gap in the middle stops the run', () => assert.equal(leadingDoneCount([D(true), D(true), D(true), D(false), D(true)]), 3));
t('currentSeasonN: next episode wins', () => assert.equal(currentSeasonN([], { season: 8, episode: 14 }), 8));
t('currentSeasonN: else first started-unfinished aired season', () => {
  const x = [{ season: 1, info: { done: true, upcoming: false, seen: 3 } }, { season: 2, info: { done: false, upcoming: false, seen: 2 } }];
  assert.equal(currentSeasonN(x, null), 2);
});
t('currentSeasonN: nothing started => null', () => assert.equal(currentSeasonN([{ season: 1, info: { done: false, upcoming: false, seen: 0 } }], null), null));

// ---- mid-season airing (regression: found by looking at the rendered page)
const airing = { seasons: [{ n: 1, count: 8 }], watched: W('1x1', '1x2', '1x3'), nextAir: { season: 1, episode: 5, date: '2026-10-20' } };
t('airing (next ep is E5, season undated): season is NOT upcoming', () => {
  const i = seasonInfo(airing, airing.seasons[0], TODAY);
  assert.equal(i.upcoming, false); assert.equal(i.airDate, null);
});
t('airing: offers the aired-but-unwatched E4, not null', () => assert.deepEqual(nextToMark(airing, TODAY), { season: 1, episode: 4 }));
t('airing: once E4 is watched, next is the unaired E5 => null', () => {
  assert.equal(nextToMark({ ...airing, watched: W(...range(1, 1, 4)) }, TODAY), null);
});
t('premiere fallback: nextAir E1 in the future still marks the season upcoming', () => {
  const sh = { seasons: [{ n: 2, count: 8 }], watched: {}, nextAir: { season: 2, episode: 1, date: '2027-03-01' } };
  assert.equal(seasonInfo(sh, sh.seasons[0], TODAY).upcoming, true);
  assert.equal(nextToMark(sh, TODAY), null);
});
t('premiere fallback: missing episode number treated as premiere (legacy data)', () => {
  assert.equal(seasonPremiereDate({ nextAir: { season: 2, date: '2027-03-01' } }, { n: 2 }), '2027-03-01');
});
t('premiere fallback: other season\'s nextAir is ignored; own air date wins', () => {
  assert.equal(seasonPremiereDate({ nextAir: { season: 3, episode: 1, date: 'X' } }, { n: 2 }), null);
  assert.equal(seasonPremiereDate({ nextAir: { season: 2, episode: 1, date: 'X' } }, { n: 2, air: '2020-01-01' }), '2020-01-01');
});

// ---- leadingWatchedFold
const nums = (n) => Array.from({ length: n }, (_, i) => i + 1);
t('fold: Suits S8 (E1-13 watched of 16) folds E1-12, keeps E13 visible => 12', () => assert.equal(leadingWatchedFold(nums(16), W(...range(8, 1, 13)), 8), 12));
t('fold: anime 120/140 watched => 119', () => assert.equal(leadingWatchedFold(nums(140), W(...range(1, 1, 120)), 1), 119));
t('fold: short run (3 watched) => 0 (not worth it)', () => assert.equal(leadingWatchedFold(nums(10), W(...range(1, 1, 3)), 1), 0));
t('fold: threshold — 5 watched folds 4, 4 watched folds 0', () => {
  assert.equal(leadingWatchedFold(nums(10), W(...range(1, 1, 5)), 1), 4);
  assert.equal(leadingWatchedFold(nums(10), W(...range(1, 1, 4)), 1), 0);
});
t('fold: a skipped episode stops the run (only the leading run folds)', () => {
  const w = W(...range(1, 1, 6), ...range(1, 8, 12)); // ep 7 missing
  assert.equal(leadingWatchedFold(nums(15), w, 1), 5);
});
t('fold: nothing watched / empty list => 0', () => {
  assert.equal(leadingWatchedFold(nums(10), {}, 1), 0);
  assert.equal(leadingWatchedFold([], {}, 1), 0);
});
t('fold: fully watched season keeps last ep visible (run-1)', () => assert.equal(leadingWatchedFold(nums(13), W(...range(2, 1, 13)), 2), 12));
t('fold: other seasons\' keys are ignored', () => assert.equal(leadingWatchedFold(nums(10), W(...range(3, 1, 10)), 1), 0));

// ---- summarizeCredits
const details = {
  created_by: [{ name: 'Brian Yorkey' }, { name: '' }],
  aggregate_credits: {
    cast: [{ id: 1, name: 'Dylan Minnette', profile_path: '/a.jpg', roles: [{ character: '' }, { character: 'Clay Jensen' }] }, { id: 2, name: 'No Roles', roles: [] }],
    crew: [
      { id: 10, name: 'Zed Dir', jobs: [{ job: 'Director', episode_count: 2 }] },
      { id: 11, name: 'Amy Dir', jobs: [{ job: 'Director', episode_count: 2 }, { job: 'Writer', episode_count: 5 }] },
      { id: 12, name: 'Top Dir', jobs: [{ job: 'Director', episode_count: 9 }] },
      { id: 13, name: 'Gaffer', jobs: [{ job: 'Gaffer', episode_count: 40 }] },
    ],
  },
};
t('summarizeCredits: created_by drops blanks', () => assert.deepEqual(summarizeCredits(details).created, ['Brian Yorkey']));
t('summarizeCredits: character = first non-empty role; missing => ""', () => {
  const c = summarizeCredits(details).cast; assert.equal(c[0].character, 'Clay Jensen'); assert.equal(c[1].character, '');
});
t('summarizeCredits: directors sorted by episodes desc, ties by name', () => {
  assert.deepEqual(summarizeCredits(details).directors.map((p) => p.name), ['Top Dir', 'Amy Dir', 'Zed Dir']);
});
t('summarizeCredits: writer-director appears in both groups; Gaffer in none', () => {
  const g = summarizeCredits(details).groups;
  assert.deepEqual(g.map((x) => x.title), ['Directors', 'Writers']);
  assert.ok(g[1].people.some((p) => p.name === 'Amy Dir'));
  assert.ok(!g.some((x) => x.people.some((p) => p.name === 'Gaffer')));
});
t('summarizeCredits: crewTotal counts everyone', () => assert.equal(summarizeCredits(details).crewTotal, 4));
t('summarizeCredits: tolerates null / empty / missing aggregate_credits', () => {
  for (const d of [null, undefined, {}, { aggregate_credits: {} }]) {
    const r = summarizeCredits(d); assert.deepEqual([r.cast.length, r.created.length, r.groups.length, r.crewTotal], [0, 0, 0, 0]);
  }
});

// ---- mergeCredits (carried over from the earlier verified version)
t('mergeCredits: dedupe+roles+exclude current show+drop non tv/movie+sort', () => {
  const out = mergeCredits({ cast: [
    { id: 1, media_type: 'tv', name: 'Cur', vote_count: 99, character: 'Self' },
    { id: 2, media_type: 'movie', title: 'Big', release_date: '2019-05-01', vote_count: 500, character: 'Hero' },
    { id: 2, media_type: 'movie', title: 'Big', vote_count: 500, character: 'Hero (voice)' },
    { id: 3, media_type: 'tv', name: 'Anime', first_air_date: '2021-04-02', vote_count: 120, character: 'K' },
    { id: 9, media_type: 'person', name: 'x' } ],
    crew: [{ id: 2, media_type: 'movie', title: 'Big', job: 'Producer' }, { id: 4, media_type: 'movie', title: 'Indie', job: 'Director', vote_count: 10 }] }, 1);
  assert.deepEqual(out.map((o) => o.id), [2, 3, 4]);
  assert.deepEqual(out[0].roles, ['Hero', 'Hero (voice)', 'Producer']);
  assert.equal(out[1].year, '2021');
});
t('mergeCredits: same id in tv vs movie are distinct titles', () => {
  const out = mergeCredits({ cast: [{ id: 5, media_type: 'tv', name: 'A' }, { id: 5, media_type: 'movie', title: 'B' }] }, 999);
  assert.equal(out.length, 2);
});

console.log(`\n${n} tests passed`);
