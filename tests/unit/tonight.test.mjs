import assert from 'node:assert/strict';
import * as T from '../../src/components/tonightLogic.js';
let n = 0; const t = (name, fn) => { fn(); n++; console.log('ok  -', name); };
const TODAY = '2026-10-05';
const h = { watchedCount: (s) => Object.keys(s.watched || {}).length, lastWatchDate: (s) => Object.values(s.watched || {}).map((w) => String(w.at).slice(0, 10)).sort().pop() || null };
const W = (count, at = '2026-10-01T10:00:00.000Z', min = 22) => Object.fromEntries(Array.from({ length: count }, (_, i) => [`1x${i + 1}`, { at, min, n: 1 }]));
const show = (name, o = {}) => ({ name, followed: true, poster: '/' + name + '.jpg', genres: ['Drama'], runtimeMin: 45, totalEpisodes: 10, seasons: [{ n: 1, count: 10 }], watched: W(3), ...o });
const wl = (name, o = {}) => show(name, { followed: false, watchlist: true, watched: {}, ...o });
const mov = (name, o = {}) => ({ name, status: 'planned', tmdbId: o.tmdbId ?? name.length, runtimeMin: 100, genres: ['Drama'], poster: null, year: 2020, ...o });
const STATE = {
  shows: {
    a: show('Sitcom', { genres: ['Comedy'], runtimeMin: 22 }), b: show('Crime Drama', { genres: ['Crime', 'Drama'], runtimeMin: 45 }), c: show('Long Epic', { genres: ['Sci-Fi & Fantasy'], runtimeMin: 62 }),
    d: show('Dropped One', { dropped: true }), e: show('Finished One', { totalEpisodes: 3, seasons: [{ n: 1, count: 3 }], watched: W(3) }),
    f: wl('Fresh Comedy', { genres: ['Comedy', 'Animation'], runtimeMin: 25 }), g: wl('Fresh Thriller', { genres: ['Thriller'], runtimeMin: 50 }), hh: wl('Not Out Yet', { seasons: [{ n: 1, count: 8, air: '2027-01-01' }] }),
    i: show('Not Followed Or Listed', { followed: false, watchlist: false, watched: {} }),
  },
  movies: [mov('Short Funny Film', { runtimeMin: 88, genres: ['Comedy'] }), mov('Long Drama Film', { runtimeMin: 150, genres: ['Drama'] }), mov('No Genres Yet', { runtimeMin: 95, genres: undefined }), mov('Watched Film', { status: 'watched' }), { name: 'Legacy no status', runtimeMin: 90 }],
};
const cands = T.buildCandidates(STATE, TODAY, h);
const byName = (name) => cands.find((c) => c.name === name);

t('candidates: Up Next "continue" shows, Watchlist shows that are out, and planned movies — nothing dropped / finished / unlisted / not yet out / already watched', () => {
  assert.deepEqual(cands.map((c) => c.name).sort(), ['Crime Drama', 'Fresh Comedy', 'Fresh Thriller', 'Long Drama Film', 'Long Epic', 'No Genres Yet', 'Short Funny Film', 'Sitcom'].sort());
  assert.deepEqual(['continue', 'start', 'movie'].map((k) => cands.filter((c) => c.kind === k).length), [3, 2, 3]); assert.equal(new Set(cands.map((c) => c.key)).size, cands.length);
});
t('candidate details: next episode, what is waiting, runtime, last watched, genres (movies: null = not fetched yet)', () => {
  const s = byName('Sitcom'); assert.deepEqual(s.next, { season: 1, episode: 4 }); assert.equal(s.avail, 7); assert.deepEqual(s.runtime, { min: 22, approx: false }); assert.equal(s.lastWatch, '2026-10-01');
  assert.deepEqual(byName('Fresh Comedy').next, { season: 1, episode: 1 }); assert.equal(byName('No Genres Yet').genres, null); assert.deepEqual(byName('Short Funny Film').genres, ['Comedy']);
});
t('a dropped show is never suggested — in the library OR on the watchlist', () => {
  const st = { shows: { a: show('Lib Dropped', { dropped: true, runtimeMin: 20 }), b: wl('Watchlist Dropped', { dropped: true, runtimeMin: 20 }), c: wl('Watchlist Fine', { runtimeMin: 20 }) }, movies: [] };
  assert.deepEqual(T.buildCandidates(st, TODAY, h).map((c) => c.name), ['Watchlist Fine']);
});
t('episodes still to air are not "waiting": 10 episodes, 3 seen, 2 not aired yet -> 5 waiting', () => {
  const st = { shows: { x: show('Airing', { upcoming: [{ s: 1, e: 9, air: '2026-10-12' }, { s: 1, e: 10, air: '2026-10-19' }] }) }, movies: [] }; assert.equal(T.buildCandidates(st, TODAY, h)[0].avail, 5);
  const st2 = { shows: { x: show('Airing2', { nextAir: { season: 1, episode: 9, date: '2026-10-12' } }) }, movies: [] }; assert.equal(T.buildCandidates(st2, TODAY, h)[0].avail, 6);
});
t('runtime: stored episode runtime; else the MEDIAN of minutes you actually watched; else 40 marked "about"; movies default 105 "about"', () => {
  assert.deepEqual(T.episodeRuntime({ runtimeMin: 30 }), { min: 30, approx: false }); assert.deepEqual(T.episodeRuntime({ watched: { a: { min: 20 }, b: { min: 60 }, c: { min: 22 } } }), { min: 22, approx: false });
  assert.deepEqual(T.episodeRuntime({}), { min: 40, approx: true }); assert.deepEqual(T.episodeRuntime({ runtimeMin: 0, watched: { a: { min: -5 }, b: null } }), { min: 40, approx: true }); assert.deepEqual(T.episodeRuntime(null), { min: 40, approx: true });
  assert.deepEqual(T.movieRuntime({ runtimeMin: 97 }), { min: 97, approx: false }); assert.deepEqual(T.movieRuntime({}), { min: 105, approx: true }); assert.deepEqual(T.movieRuntime({ runtimeMin: 'x' }), { min: 105, approx: true });
});
t('fit (shows): as many whole episodes as the time allows, never more than are waiting, never more than 6', () => {
  const f = (name, m) => T.fitFor(byName(name), m);
  assert.deepEqual(f('Sitcom', 45), { fits: true, episodes: 2, used: 44, spare: 1 }); assert.deepEqual(f('Crime Drama', 45), { fits: true, episodes: 1, used: 45, spare: 0 }); assert.equal(f('Crime Drama', 30).fits, false); assert.equal(f('Long Epic', 60).fits, false); assert.equal(f('Long Epic', 90).episodes, 1);
  assert.equal(f('Sitcom', 180).episodes, 6, 'capped at 6 even though 8 fit'); const few = { ...byName('Sitcom'), avail: 2 }; assert.equal(T.fitFor(few, 180).episodes, 2, 'capped by what is waiting');
});
t('fit (movies): the whole film must fit; spare time is reported', () => {
  assert.deepEqual(T.fitFor(byName('Short Funny Film'), 90), { fits: true, episodes: 1, used: 88, spare: 2 }); assert.equal(T.fitFor(byName('Short Funny Film'), 60).fits, false); assert.equal(T.fitFor(byName('Long Drama Film'), 120).fits, false); assert.equal(T.fitFor(byName('Long Drama Film'), 180).fits, true);
});
const names = (r) => r.picks.map((p) => p.name);
t('45 minutes: only what fits — the sitcom (2 episodes), the 45-min drama, the 25-min fresh comedy; never the 62-min epic, the 50-min thriller or a 88-min film', () => {
  const r = T.suggest(cands, { minutes: 45, today: TODAY }); assert.deepEqual(names(r).sort(), ['Crime Drama', 'Fresh Comedy', 'Sitcom'].sort()); assert.equal(r.fitting, 3);
});
t('mood "Make me laugh" puts comedies first; non-matching come last and are flagged; unknown genres sit in between', () => {
  const r = T.suggest(cands, { minutes: 120, mood: 'funny', today: TODAY, exclude: new Set() });
  assert.ok(['Sitcom', 'Fresh Comedy', 'Short Funny Film'].includes(names(r)[0])); assert.deepEqual(names(r).slice(0, 3).sort(), ['Fresh Comedy', 'Short Funny Film', 'Sitcom'].sort());
  assert.ok(r.picks.slice(0, 3).every((p) => p.moodState === 'match')); assert.equal(r.matching, 3);
  const all = T.suggest(cands, { minutes: 180, mood: 'funny', today: TODAY, exclude: new Set(['s:a', 's:f', 'm:' + 'Short Funny Film'.length + ':0']) }); const order = all.picks.map((p) => p.moodState); assert.deepEqual(order, [...order].sort((a, b) => ({ match: 0, unknown: 1, no: 2 }[a] - { match: 0, unknown: 1, no: 2 }[b])));
});
t('mood "Edge of my seat": the crime drama and the thriller; "Surprise me" applies no mood at all', () => {
  const r = T.suggest(cands, { minutes: 60, mood: 'gripping', today: TODAY }); assert.deepEqual(names(r).slice(0, 2).sort(), ['Crime Drama', 'Fresh Thriller'].sort());
  assert.ok(T.suggest(cands, { minutes: 60, mood: 'any', today: TODAY }).picks.every((p) => p.moodState === null));
});
t('movies with no genres fetched yet are "unknown" for a mood (ranked after real matches, before non-matches) — and fine for "Surprise me"', () => {
  assert.equal(T.moodState(byName('No Genres Yet'), 'funny'), 'unknown'); assert.equal(T.moodState(byName('No Genres Yet'), 'any'), null); assert.equal(T.moodState({ genres: [] }, 'funny'), 'unknown'); assert.equal(T.moodState({ genres: ['Drama'] }, 'funny'), 'no'); assert.equal(T.moodState({ genres: ['Drama'] }, 'thoughtful'), 'match');
});
t('ranking (no mood): something you are mid-way through beats a new show beats a movie; recently watched beats long ago; the closer it fills your time the better', () => {
  const st = { shows: { a: show('Recent', { runtimeMin: 30, watched: W(3, '2026-10-04T10:00:00.000Z') }), b: show('Old', { runtimeMin: 30, watched: W(3, '2026-08-01T10:00:00.000Z') }), c: wl('NewShow', { runtimeMin: 30 }) }, movies: [mov('A Film', { runtimeMin: 30 })] };
  const r = T.suggest(T.buildCandidates(st, TODAY, h), { minutes: 30, today: TODAY }); assert.deepEqual(names(r), ['Recent', 'Old', 'NewShow']);
  const r4 = T.suggest(T.buildCandidates(st, TODAY, h), { minutes: 30, today: TODAY, exclude: new Set(['s:a', 's:b', 's:c']) }); assert.deepEqual(names(r4), ['A Film']);
  const fill = T.suggest(T.buildCandidates({ shows: { a: show('Fills', { runtimeMin: 60, watched: W(3, '2026-08-01T10:00:00.000Z') }), b: show('Half', { runtimeMin: 30, avail: 1, watched: W(9, '2026-08-01T10:00:00.000Z'), totalEpisodes: 10 }) }, movies: [] }, TODAY, h), { minutes: 60, today: TODAY }); assert.equal(names(fill)[0], 'Fills');
});
t('your 😍 reactions give a show a small boost; 😂 boosts it for "Make me laugh"', () => {
  const notes = (react, k = 3) => Object.fromEntries(Array.from({ length: k }, (_, i) => [`1x${i + 1}`, { react }]));
  const st = { shows: { a: show('Plain', { runtimeMin: 30, watched: W(3, '2026-08-01T10:00:00.000Z') }), b: show('Loved', { runtimeMin: 30, watched: W(3, '2026-08-01T10:00:00.000Z'), notes: notes('love') }) }, movies: [] };
  assert.equal(names(T.suggest(T.buildCandidates(st, TODAY, h), { minutes: 30, today: TODAY }))[0], 'Loved');
  const st2 = { shows: { a: show('Plain', { genres: ['Comedy'], runtimeMin: 30, watched: W(3, '2026-08-01T10:00:00.000Z') }), b: show('Giggles', { genres: ['Comedy'], runtimeMin: 30, watched: W(3, '2026-08-01T10:00:00.000Z'), notes: notes('funny') }) }, movies: [] };
  assert.equal(names(T.suggest(T.buildCandidates(st2, TODAY, h), { minutes: 30, mood: 'funny', today: TODAY }))[0], 'Giggles'); assert.deepEqual(T.reactionCounts({ notes: { '1x1': { react: 'love' }, '1x2': { react: 'funny' }, bad: { react: 'love' }, '1x3': { react: 'sad' } } }), { love: 1, funny: 1 });
});
t('"Only on my services": drops anything not confirmed on a ticked service (or free); shows where; unchecked titles are left out', () => {
  const st = JSON.parse(JSON.stringify(STATE)); const A = { providers: [{ name: 'Netflix' }], providersFree: [], providersSynced: '2026-10-01T00:00:00.000Z' };
  Object.assign(st.shows.a, A); Object.assign(st.shows.f, { providers: [], providersFree: [{ name: 'ABC iview' }], providersSynced: '2026-10-01T00:00:00.000Z' }); Object.assign(st.shows.b, { providers: [{ name: 'Binge' }], providersFree: [], providersSynced: '2026-10-01T00:00:00.000Z' });
  const c = T.buildCandidates(st, TODAY, h); const r = T.suggest(c, { minutes: 45, today: TODAY, onlyMine: true, mine: new Set(['netflix']) });
  assert.deepEqual(names(r).sort(), ['Fresh Comedy', 'Sitcom']); assert.deepEqual(r.picks.map((p) => p.where).sort(), ['Free: ABC iview', 'Netflix']);
  assert.equal(T.suggest(c, { minutes: 45, today: TODAY, onlyMine: true, mine: null }).picks.length, 0); assert.ok(T.suggest(c, { minutes: 45, today: TODAY, onlyMine: false, mine: new Set(['netflix']) }).picks.length === 3);
});
t('at most 3 picks; same inputs = same answer; a different seed can reorder otherwise-equal picks', () => {
  const st = { shows: Object.fromEntries(Array.from({ length: 12 }, (_, i) => ['s' + i, wl('Show ' + i, { runtimeMin: 40 })])), movies: [] }; const c = T.buildCandidates(st, TODAY, h);
  const r1 = T.suggest(c, { minutes: 45, today: TODAY, seed: 0 }), r1b = T.suggest(c, { minutes: 45, today: TODAY, seed: 0 }), r2 = T.suggest(c, { minutes: 45, today: TODAY, seed: 1 });
  assert.equal(r1.picks.length, 3); assert.deepEqual(names(r1), names(r1b)); assert.notDeepEqual(names(r1), names(r2), 'a new seed shows different ones'); assert.equal(r1.fitting, 12);
});
t('"Another": excluded ones are skipped; once everything has been shown it wraps around instead of going empty', () => {
  const st = { shows: Object.fromEntries(Array.from({ length: 5 }, (_, i) => ['s' + i, wl('Show ' + i, { runtimeMin: 40 })])), movies: [] }; const c = T.buildCandidates(st, TODAY, h);
  const a = T.suggest(c, { minutes: 45, today: TODAY }); const b = T.suggest(c, { minutes: 45, today: TODAY, exclude: new Set(a.picks.map((p) => p.key)) });
  assert.equal(b.picks.length, 2); assert.ok(b.picks.every((p) => !a.picks.some((q) => q.key === p.key))); assert.equal(b.wrapped, false);
  const w = T.suggest(c, { minutes: 45, today: TODAY, exclude: new Set(c.map((x) => x.key)) }); assert.equal(w.wrapped, true); assert.equal(w.picks.length, 3);
});
t('nothing fits -> empty picks and an explanation that names the time, the mood and the services switch', () => {
  assert.equal(T.suggest(T.buildCandidates({ shows: { a: show('Long', { runtimeMin: 90 }) }, movies: [] }, TODAY, h), { minutes: 30, today: TODAY }).picks.length, 0); assert.equal(T.suggest([], { minutes: 45 }).picks.length, 0);
  assert.equal(T.emptyText(20, 'funny', false), 'Nothing on your Up Next or Watchlist fits 20 min for “Make me laugh”. Try more time or a different mood.'); assert.match(T.emptyText(45, 'any', true), /fits 45 min on your services\. Try more time, switching off “On my services”, or a different mood\./);
});
t('bad time / mood values fall back safely (45 minutes, "Surprise me")', () => {
  assert.equal(T.suggest(cands, { minutes: 7, mood: 'nope', today: TODAY }).picks.length, 3); assert.equal(T.moodById('zzz').id, 'any'); assert.equal(T.suggest(cands, { today: TODAY }).fitting, 3);
});
t('wording: why-lines for a show you are mid-way through, a new show, an "about" runtime, and a movie', () => {
  const r = T.suggest(cands, { minutes: 45, today: TODAY }); const sit = r.picks.find((p) => p.name === 'Sitcom'), fresh = r.picks.find((p) => p.name === 'Fresh Comedy');
  assert.deepEqual(T.whyLines(sit, 45), ['Next up: S01·E04', '7 episodes waiting', 'Fits 2 episodes · 44 min']); assert.deepEqual(T.whyLines(fresh, 45), ['Start with S01·E01', '25 min an episode · fits 1 episode']);
  const film = T.suggest(cands.filter((c) => c.name === 'Short Funny Film'), { minutes: 120, today: TODAY }).picks[0];
  assert.deepEqual(T.whyLines(film, 120), ['88 min', '32 min to spare']); const about = T.suggest(T.buildCandidates({ shows: { a: wl('NoRuntime', { runtimeMin: undefined }) }, movies: [mov('Unknown', { runtimeMin: null })] }, TODAY, h), { minutes: 120, today: TODAY });
  assert.ok(about.picks.some((p) => T.whyLines(p, 120).join(' ').includes('~40 min'))); assert.ok(about.picks.some((p) => T.whyLines(p, 120).join(' ').includes('(runtime not stored)')));
  assert.equal(T.moodNote({ moodState: 'match' }, 'funny'), 'Matches “Make me laugh”'); assert.equal(T.moodNote({ moodState: 'no' }, 'funny'), 'Closest fit, not a mood match'); assert.equal(T.moodNote({ moodState: 'unknown' }, 'funny'), 'Genres not known yet'); assert.equal(T.moodNote({ moodState: null }, 'any'), '');
});
t('time labels', () => { assert.deepEqual([20, 45, 60, 90, 120, 180, 150].map(T.formatMinutes), ['20 min', '45 min', '1 hr', '1 hr 30 min', '2 hr', '3 hr', '2 hr 30 min']); assert.equal(T.formatMinutes(0), ''); assert.equal(T.formatMinutes('x'), ''); });
t('remembered choices are sanitised; corrupt, missing and throwing storage are safe', () => {
  assert.deepEqual(T.sanitizePrefs({ minutes: 60, mood: 'funny', onlyMine: true }), { minutes: 60, mood: 'funny', onlyMine: true }); assert.deepEqual(T.sanitizePrefs({ minutes: 7, mood: 'x', onlyMine: 'yes' }), { minutes: 45, mood: 'any', onlyMine: false }); assert.deepEqual(T.sanitizePrefs(null), { minutes: 45, mood: 'any', onlyMine: false });
  const m = new Map(); const st = { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) }; T.savePrefs(st, { minutes: 90, mood: 'escape', onlyMine: false }); assert.deepEqual(T.loadPrefs(st), { minutes: 90, mood: 'escape', onlyMine: false }); m.set(T.PREFS_KEY, '{oops'); assert.equal(T.loadPrefs(st).minutes, 45);
  const bad = { getItem() { throw new Error('x'); }, setItem() { throw new Error('y'); } }; assert.equal(T.loadPrefs(bad).minutes, 45); T.savePrefs(bad, {}); assert.equal(T.PREFS_KEY, 'watchnext-tonight-v1');
});
t('junk data never throws and inputs are not mutated', () => {
  for (const bad of [undefined, null, {}, { shows: null, movies: 5 }, { shows: { a: null, b: 7, __proto__: { c: 1 } }, movies: [null, 3, {}, { status: 'planned' }] }]) assert.ok(Array.isArray(T.buildCandidates(bad, TODAY, h)));
  const copy = JSON.stringify(STATE); T.suggest(T.buildCandidates(STATE, TODAY, h), { minutes: 60, mood: 'funny', today: TODAY }); assert.equal(JSON.stringify(STATE), copy);
});
t('scale: 3,000 shows + 1,000 movies are ranked in well under a second', () => {
  const st = { shows: Object.fromEntries(Array.from({ length: 3000 }, (_, i) => ['s' + i, i % 2 ? wl('W' + i, { genres: ['Comedy'] }) : show('C' + i)])), movies: Array.from({ length: 1000 }, (_, i) => mov('M' + i, { tmdbId: i, runtimeMin: 80 + (i % 50) })) };
  const t0 = Date.now(); const r = T.suggest(T.buildCandidates(st, TODAY, h), { minutes: 120, mood: 'funny', today: TODAY }); assert.ok(Date.now() - t0 < 1500, String(Date.now() - t0)); assert.equal(r.picks.length, 3);
});
console.log(`\n${n} tests passed`);
