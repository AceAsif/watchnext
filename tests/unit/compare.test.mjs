import assert from 'node:assert/strict';
import {
  buildCompareFile, parseCompareFile, compareLibraries, myExtras, isLoved, fileName,
  loadFriends, saveFriends, addFriend, removeFriend, countLine, FILE_KIND, FRIENDS_KEY,
} from '../../src/components/compareLogic.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('ok  -', name); };
const W = (k) => Object.fromEntries(k.map((x) => [x, { at: '2026-01-01T00:00:00Z' }]));
const NOW = new Date('2026-10-24T10:00:00Z');

const ME = { shows: {
  'tmdb:1': { tmdbId: 1, name: 'Dark', watched: W(['1x1', '1x2']), totalEpisodes: 2, status: 'Ended', rating: 5, poster: '/dark.jpg', notes: { '1x1': { text: 'secret' } } },
  'tmdb:2': { tmdbId: 2, name: 'Andor', watched: W(['1x1']), rating: 3, favourite: true },
  'tmdb:3': { tmdbId: 3, name: 'Bluey', watched: {}, watchlist: true }, // watchlist only: not in the file
  'tmdb:4': { tmdbId: 4, name: 'Severance', watched: W(['1x1']), dropped: true, rating: 2 },
  'name:Old Show': { name: 'Old Show', watched: W(['1x1']), rating: 4.5 },
  'tmdb:9': { tmdbId: 9, name: 'Followed Not Started', followed: true, watched: {} },
}, movies: [
  { tmdbId: 10, name: 'Heat', status: 'watched', rating: 4, year: '1995', watchedAt: '2026-01-01T00:00:00Z', note: 'private' },
  { tmdbId: 10, name: 'Heat', status: 'watched', rating: 4.5, year: '1995', watchedAt: '2026-05-01T00:00:00Z' },
  { tmdbId: 11, name: 'Arrival', status: 'planned', year: 2016 },
  { tmdbId: 12, name: 'Dune', status: 'watched', rating: 3, year: '2021' },
] };

t('the file holds only what was asked: titles, ratings, ♥, finished/dropped', () => {
  const f = buildCompareFile(ME, '  Asif  ', NOW);
  assert.equal(f.kind, FILE_KIND); assert.equal(f.v, 1); assert.equal(f.name, 'Asif'); assert.equal(f.at, NOW.toISOString());
  assert.deepEqual(f.shows.map((s) => s.n).sort(), ['Andor', 'Dark', 'Old Show', 'Severance']);
  const dark = f.shows.find((s) => s.n === 'Dark');
  assert.deepEqual(dark, { id: 1, n: 'Dark', w: 2, p: '/dark.jpg', r: 5, done: 1 });
  assert.deepEqual(f.shows.find((s) => s.n === 'Andor'), { id: 2, n: 'Andor', w: 1, r: 3, f: 1 });
  assert.equal(f.shows.find((s) => s.n === 'Severance').drop, 1);
  const txt = JSON.stringify(f);
  for (const bad of ['secret', 'private', 'watchedAt', 'notes', '2026-01-01', 'Arrival', 'Bluey', 'email']) assert.ok(!txt.includes(bad), bad);
});
t('a film watched twice is one row with the highest rating and the count', () => {
  const f = buildCompareFile(ME, 'A', NOW);
  assert.deepEqual(f.movies.find((m) => m.n === 'Heat'), { id: 10, n: 'Heat', y: '1995', r: 4.5, x: 2 });
  assert.equal(f.movies.length, 2);
});
t('file name is safe and dated', () => {
  assert.equal(fileName('Md Asif Iqbal', NOW), 'watchnext-compare-md-asif-iqbal-2026-10-24.json');
  assert.equal(fileName('', NOW), 'watchnext-compare-friend-2026-10-24.json');
});
t('reading a file back gives the same data', () => {
  const f = buildCompareFile(ME, 'Asif', NOW);
  const p = parseCompareFile(JSON.stringify(f));
  assert.equal(p.name, 'Asif'); assert.equal(p.at, NOW.toISOString());
  assert.deepEqual(p.shows, f.shows); assert.deepEqual(p.movies, f.movies);
});
t('bad files are refused with a plain message', () => {
  assert.throws(() => parseCompareFile('not json'), /isn’t a WatchNext compare file/);
  assert.throws(() => parseCompareFile({ hello: 1 }), /isn’t a WatchNext compare file/);
  assert.throws(() => parseCompareFile({ app: 'WatchNext', shows: {} }), /looks like a backup/);
  assert.throws(() => parseCompareFile({ kind: FILE_KIND, v: 9 }), /newer WatchNext/);
  assert.throws(() => parseCompareFile({ kind: FILE_KIND }), /damaged/);
});
t('a file is cleaned: odd values, scripts and huge names are dropped or cut', () => {
  const p = parseCompareFile({ kind: FILE_KIND, v: 1, name: 'x'.repeat(99), at: 'nope', shows: [
    null, 5, { n: '' }, { id: -3, n: 'Ok', w: 'lots', r: 7.3, p: 'javascript:alert(1)', f: 'yes' }, { id: 2.5, n: ' Spaced ', r: 4.26, f: true },
  ], movies: [{ n: 'Film', y: '19x5', r: -1, x: 1.5 }, { n: 'Two', y: 2001, x: 3 }] });
  assert.equal(p.name.length, 40); assert.equal(p.at, null);
  assert.deepEqual(p.shows, [{ id: null, n: 'Ok', w: 0, r: 5 }, { id: null, n: 'Spaced', w: 0, r: 4.5, f: 1 }]);
  assert.deepEqual(p.movies, [{ id: null, n: 'Film' }, { id: null, n: 'Two', y: '2001', x: 3 }]);
});
t('loved = 4★ or more, or ♥', () => {
  assert.equal(isLoved({ r: 4 }), true); assert.equal(isLoved({ r: 3.5 }), false);
  assert.equal(isLoved({ f: 1 }), true); assert.equal(isLoved({}), false);
});

const mine = buildCompareFile(ME, 'Me', NOW);
const theirs = parseCompareFile({ kind: FILE_KIND, v: 1, name: 'Rob', shows: [
  { id: 1, n: 'Dark', w: 10, r: 4.5 },              // both, both loved
  { id: 2, n: 'Andor', w: 3, r: 2 },                // both, only I loved (♥)
  { id: 4, n: 'Severance', w: 1 },                  // both, they didn't rate
  { id: 3, n: 'Bluey', w: 50, r: 5 },               // they loved; on my watchlist
  { id: 9, n: 'Followed Not Started', w: 5, f: 1 }, // they loved (♥); in my library, not watched
  { id: 20, n: 'The Bear', w: 20, r: 4 },           // they loved
  { id: 21, n: 'Meh Show', w: 2, r: 3 },            // they watched, not loved: nowhere
  { id: 22, n: 'Never Started', w: 0, r: 5 },       // rated but 0 episodes: not watched, not loved-unseen either? counts as loved
  { n: 'old show', w: 1, r: 4 },                    // no id: matches my "Old Show" by name
], movies: [
  { id: 10, n: 'Heat', y: '1995', r: 5 },          // both
  { id: 12, n: 'Dune', y: '2021', r: 1 },          // both
  { id: 11, n: 'Arrival', y: '2016', r: 4.5 },     // they loved; planned for me
  { n: 'Heat', y: '1986', r: 5 },                  // same name, other year: not my Heat
] });
const extras = myExtras(ME);
const res = compareLibraries(mine, theirs, extras);
const names = (xs) => xs.map((x) => x.n);

t('both watched: shows and films, matched by TMDB id or by name', () => {
  assert.deepEqual(names(res.both).sort(), ['Andor', 'Dark', 'Dune', 'Heat', 'Old Show', 'Severance']);
  const heat = res.both.find((x) => x.n === 'Heat');
  assert.equal(heat.kind, 'movie'); assert.equal(heat.mine, 4.5); assert.equal(heat.theirs, 5);
});
t('both watched: titles you both loved come first', () => {
  assert.deepEqual(names(res.both).slice(0, 3), ['Dark', 'Heat', 'Old Show']);
});
t('they loved, you haven\'t: watchlist ones last and marked, ♥ counts, same-name other-year film counts', () => {
  // Heat (1986) 5★, The Bear 4★, Followed Not Started ♥ … then the watchlist ones: Bluey 5★, Arrival 4.5★.
  // "Never Started" (rated, 0 episodes watched) is not something they watched, so it isn't suggested.
  assert.deepEqual(names(res.theyLoved), ['Heat', 'The Bear', 'Followed Not Started', 'Bluey', 'Arrival']);
  const ids = res.theyLoved.map((x) => `${x.n}${x.onWatchlist ? '*' : ''}${x.inLibrary ? '+' : ''}`);
  assert.ok(ids.includes('The Bear')); assert.ok(ids.includes('Followed Not Started+')); assert.ok(ids.includes('Arrival*')); assert.ok(ids.includes('Bluey*'));
  assert.ok(ids.includes('Heat'), 'the 1986 Heat is a different film');
  assert.ok(!ids.includes('Meh Show') && !ids.includes('Dark'));
  assert.ok(res.theyLoved.slice(-2).every((x) => x.onWatchlist), 'already on your watchlist goes last');
});
t('you loved, they haven\'t', () => {
  assert.deepEqual(names(res.youLoved), []);
  const r2 = compareLibraries(mine, { shows: [], movies: [] }, extras);
  assert.deepEqual(names(r2.youLoved), ['Dark', 'Heat', 'Old Show', 'Andor']);
});
t('taste match %: from titles you both rated (needs 3)', () => {
  // Dark 5 vs 4.5, Andor 3 vs 2, Old Show 4.5 vs 4, Heat 4.5 vs 5, Dune 3 vs 1  → diffs .5,1,.5,.5,2 = 4.5/5 = .9
  assert.deepEqual(res.match, { pct: Math.round(100 * (1 - 0.9 / 4.5)), n: 5 });
  const few = compareLibraries(mine, { shows: [{ id: 1, n: 'Dark', w: 1, r: 5 }], movies: [] });
  assert.deepEqual(few.match, { pct: null, n: 1 });
  const same = compareLibraries(mine, mine);
  assert.equal(same.match.pct, 100);
});
t('empty or missing libraries do not crash', () => {
  const r = compareLibraries(null, undefined);
  assert.deepEqual([r.both, r.theyLoved, r.youLoved], [[], [], []]);
  assert.deepEqual(r.match, { pct: null, n: 0 });
});
t('friends on this device: add, replace by name, remove, survive bad storage', () => {
  const mem = { v: null, getItem() { return this.v; }, setItem(k, v) { assert.equal(k, FRIENDS_KEY); this.v = v; } };
  let d = loadFriends(mem); assert.deepEqual(d, { me: '', friends: [] });
  let r = addFriend(d, { name: 'Rob', at: null, shows: [], movies: [] }, NOW); d = r.data; assert.equal(r.replaced, false);
  r = addFriend(d, { name: 'Sam', at: null, shows: [], movies: [] }, new Date(NOW.getTime() + 1)); d = r.data;
  r = addFriend(d, { name: 'rob', at: null, shows: [{ n: 'X', w: 1 }], movies: [] }, new Date(NOW.getTime() + 2)); d = r.data;
  assert.equal(r.replaced, true); assert.deepEqual(d.friends.map((f) => f.name), ['rob', 'Sam']); assert.equal(d.friends[0].shows.length, 1);
  assert.ok(saveFriends(mem, { ...d, me: 'Asif' }));
  assert.deepEqual(loadFriends(mem).friends.map((f) => f.name), ['rob', 'Sam']); assert.equal(loadFriends(mem).me, 'Asif');
  d = removeFriend(d, d.friends[1].id); assert.deepEqual(d.friends.map((f) => f.name), ['rob']);
  assert.deepEqual(loadFriends({ getItem() { throw new Error('blocked'); } }), { me: '', friends: [] });
  assert.equal(saveFriends({ setItem() { throw new Error('full'); } }, d), false);
});
t('count line', () => { assert.equal(countLine(mine), '4 shows · 2 movies'); assert.equal(countLine({ shows: [{ w: 1 }], movies: [{}] }), '1 show · 1 movie'); });
console.log(`\n${n} compare tests passed`);
