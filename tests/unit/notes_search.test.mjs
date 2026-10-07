import assert from 'node:assert/strict';
import * as N from '../../src/components/notesSearchLogic.js';
let n = 0; const t = (name, fn) => { fn(); n++; console.log('ok  -', name); };
const nt = (react, text, at) => ({ ...(react ? { react } : {}), ...(text ? { text } : {}), ...(at ? { at } : {}) });
const SHOWS = {
  'tmdb:1': { name: 'Suits', poster: '/s.jpg', notes: { '1x5': nt('love', 'Harvey’s best speech', '2026-09-03T10:00:00.000Z'), '2x10': nt('', 'Mike sold out?!', '2026-09-05T10:00:00.000Z'), '1x1': nt('funny', '', '2026-09-01T10:00:00.000Z') } },
  'tmdb:2': { name: 'The Office', notes: { '3x4': nt('funny', 'Dwight and the fire drill', '2026-08-01T10:00:00.000Z'), '1x2': nt('love', '', '2026-08-02T10:00:00.000Z'), '4x4': nt('bored', 'slow one', '') } },
  'tmdb:3': { name: 'Nothing', notes: { '1x1': { at: 'x' }, 'bad': nt('love', 'x'), '1x2': nt('nope', '   ') } },
  'tmdb:4': { name: 'No notes at all' },
};
const MOVIES = [
  { tmdbId: 9, name: 'Dune', status: 'watched', watchedAt: '2026-07-01T10:00:00.000Z', year: 2021, react: 'shocked', note: 'That ending' },
  { tmdbId: 9, name: 'Dune', status: 'watched', watchedAt: '2026-09-10T10:00:00.000Z', year: 2021, react: 'love' },
  { tmdbId: 10, name: 'Planned', status: 'planned', react: 'love', note: 'not watched yet' },
  { tmdbId: 11, name: 'Blank', status: 'watched', watchedAt: '2026-01-01T00:00:00.000Z' },
];
const all = N.collectNotes(SHOWS, MOVIES);

t('collect: every episode note + movie viewing with a reaction or text; blanks, bad keys, junk reactions, planned films skipped', () => {
  assert.equal(all.length, 8); // 3 Suits + 3 Office + 2 Dune viewings
  assert.ok(!all.some((e) => e.name === 'Nothing' || e.name === 'Planned' || e.name === 'Blank'));
});
t('collect: newest first, undated last; each entry carries code, reaction, text, poster', () => {
  assert.deepEqual(all.map((e) => e.name + (e.code ? ' ' + e.code : '')), ['Dune', 'Suits S2E10', 'Suits S1E5', 'Suits S1E1', 'The Office S1E2', 'The Office S3E4', 'Dune', 'The Office S4E4']);
  const s15 = all.find((e) => e.code === 'S1E5'); assert.deepEqual([s15.react, s15.text, s15.poster, s15.kind], ['love', 'Harvey’s best speech', '/s.jpg', 'episode']);
  const dunes = all.filter((e) => e.kind === 'movie'); assert.equal(new Set(dunes.map((e) => e.key)).size, 2, 'two viewings = two rows with distinct keys');
  assert.equal(new Set(all.map((e) => e.key)).size, all.length);
});
t('collect: junk input never throws', () => { for (const bad of [undefined, null, {}, [], 'x']) assert.deepEqual(N.collectNotes(bad, bad), []); assert.deepEqual(N.collectNotes({ a: { notes: 5 }, b: null, __proto__: { x: 1 } }, [null, 3, {}]), []); });
t('collect: does not mutate its inputs', () => { const a = JSON.stringify(SHOWS), b = JSON.stringify(MOVIES); N.collectNotes(SHOWS, MOVIES); assert.equal(JSON.stringify(SHOWS), a); assert.equal(JSON.stringify(MOVIES), b); });

const names = (f) => N.filterNotes(all, f).map((e) => e.name + (e.code ? ' ' + e.code : ''));
t('search by note text (case-insensitive, any word order, all words must match)', () => {
  assert.deepEqual(names({ q: 'FIRE drill' }), ['The Office S3E4']); assert.deepEqual(names({ q: 'drill dwight' }), ['The Office S3E4']); assert.deepEqual(names({ q: 'speech nonsense' }), []);
});
t('search by show or movie name', () => { assert.equal(names({ q: 'suits' }).length, 3); assert.equal(names({ q: 'dune' }).length, 2); });
t('search by episode code in every spelling: s1e5, S01E05, 1x5; combined with a name', () => {
  for (const q of ['s1e5', 'S01E05', '1x5', 's001e0005']) assert.deepEqual(names({ q }), ['Suits S1E5'], q);
  assert.deepEqual(names({ q: 'suits s2e10' }), ['Suits S2E10']); assert.deepEqual(names({ q: 'office s2e10' }), []);
});
t('an episode code is an EXACT match: s1e5 must not find S1E50-S1E59, and s1 / e5 are just words', () => {
  const big = N.collectNotes({ a: { name: 'Long Show', notes: Object.fromEntries(Array.from({ length: 60 }, (_, i) => [`1x${i + 1}`, { react: 'love' }])) } }, []);
  assert.deepEqual(N.filterNotes(big, { q: 's1e5' }).map((e) => e.code), ['S1E5']);
  assert.deepEqual(N.filterNotes(big, { q: '1x5' }).map((e) => e.code), ['S1E5']); assert.deepEqual(N.filterNotes(big, { q: 's1e50' }).map((e) => e.code), ['S1E50']);
  assert.equal(N.filterNotes(big, { q: 's1e61' }).length, 0); assert.equal(N.filterNotes(big, { q: 's2e5' }).length, 0);
  assert.equal(N.filterNotes(all, { q: 's1e1' }).every((e) => e.kind === 'episode'), true, 'a code never matches a movie');
});
t('search by reaction word or emoji', () => { assert.equal(names({ q: 'loved' }).length, 3); assert.equal(names({ q: '😂' }).length, 2); assert.equal(names({ q: 'funny office' }).length, 1); });
t('reaction filter: OR across chips; empty = all; "Words only" = a note with no emoji', () => {
  assert.equal(N.filterNotes(all, { reacts: ['love'] }).length, 3); assert.equal(N.filterNotes(all, { reacts: ['love', 'funny'] }).length, 5);
  assert.equal(N.filterNotes(all, { reacts: [] }).length, 8); assert.deepEqual(names({ reacts: [N.NO_REACTION] }), ['Suits S2E10']);
});
t('kind filter: Episodes / Movies / All; combined with a query and a reaction', () => {
  assert.equal(N.filterNotes(all, { kind: 'Episodes' }).length, 6); assert.equal(N.filterNotes(all, { kind: 'Movies' }).length, 2); assert.equal(N.filterNotes(all, { kind: 'All' }).length, 8);
  assert.deepEqual(names({ kind: 'Movies', reacts: ['love'] }), ['Dune']); assert.deepEqual(names({ kind: 'Episodes', q: 'dune' }), []);
});
t('query punctuation / whitespace / null are safe; regex characters are literal', () => {
  assert.equal(N.filterNotes(all, { q: '   ' }).length, 8); assert.equal(N.filterNotes(all, { q: null }).length, 8); assert.equal(N.filterNotes(all, undefined).length, 8);
  assert.equal(N.filterNotes(all, { q: '.*' }).length, 0); assert.equal(N.filterNotes(all, { q: '(' }).length, 0); assert.deepEqual(names({ q: 'sold out?!' }), ['Suits S2E10']);
});
t('facets: counts respect the other filters and add up', () => {
  const k = N.kindCounts(all, { q: '', reacts: ['love'] }); assert.deepEqual(k, { All: 3, Episodes: 2, Movies: 1 }); assert.equal(k.All, k.Episodes + k.Movies);
  const r = N.reactionCounts(all, { q: '', kind: 'All' }); assert.deepEqual(r, { none: 1, love: 3, funny: 2, shocked: 1, sad: 0, angry: 0, bored: 1 });
  assert.equal(Object.values(r).reduce((a, b) => a + b, 0), 8);
  assert.equal(N.reactionCounts(all, { q: 'suits' }).love, 1); assert.equal(N.reactionCounts(all, { kind: 'Movies' }).love, 1);
});
t('summary line, hasFilters, toggleReaction', () => {
  assert.equal(N.summaryLine(all), '8 entries · 5 with a written note'); assert.equal(N.summaryLine(all.slice(1, 2)), '1 entry · 1 with a written note'); assert.equal(N.summaryLine([]), '0 entries · 0 with a written note');
  assert.equal(N.hasFilters({ q: '', reacts: [], kind: 'All' }), false); assert.equal(N.hasFilters({ q: ' x ' }), true); assert.equal(N.hasFilters({ reacts: ['love'] }), true); assert.equal(N.hasFilters({ kind: 'Movies' }), true);
  assert.deepEqual(N.toggleReaction(['love'], 'funny'), ['love', 'funny']); assert.deepEqual(N.toggleReaction(['love', 'funny'], 'love'), ['funny']);
});
t('newNotesMemo gives a fresh object each time', () => { const a = N.newNotesMemo(), b = N.newNotesMemo(); a.reacts.push('x'); assert.deepEqual(b.reacts, []); assert.equal(a.shown, N.PAGE_SIZE); });

// ---- Most loved shows
t('loved: 😍 counts 2, 😂 counts 1; other reactions and text-only notes do not count; sorted by score', () => {
  const r = N.lovedShows(SHOWS);
  assert.deepEqual(r.rows, [{ label: 'The Office', value: 3, love: 1, funny: 1 }, { label: 'Suits', value: 3, love: 1, funny: 1 }].sort((a, b) => b.value - a.value || b.love - a.love || a.label.localeCompare(b.label)));
  assert.equal(r.titles, 2);
});
t('loved: weights are applied (two 😂 = one 😍), tie goes to the show with more 😍, then name', () => {
  const mk = (name, love, funny) => ({ name, notes: Object.fromEntries([...Array(love).fill('love'), ...Array(funny).fill('funny')].map((r, i) => [`1x${i + 1}`, { react: r }])) });
  const r = N.lovedShows({ a: mk('Zed', 0, 4), b: mk('Amy', 2, 0), c: mk('Bob', 1, 1), d: mk('Cat', 1, 0) }).rows;
  assert.deepEqual(r.map((x) => [x.label, x.value]), [['Amy', 4], ['Zed', 4], ['Bob', 3], ['Cat', 2]]); // Amy has more 😍 than Zed at the same score
  assert.equal(N.LOVE_WEIGHT, 2); assert.equal(N.FUNNY_WEIGHT, 1);
});
t('loved: limit caps rows only; same-named shows get unique labels; junk is ignored', () => {
  const many = Object.fromEntries(Array.from({ length: 12 }, (_, i) => ['s' + i, { name: 'S' + i, notes: { '1x1': { react: 'love' } } }]));
  const r = N.lovedShows(many); assert.equal(r.rows.length, 8); assert.equal(r.titles, 12); assert.equal(N.lovedShows(many, 3).rows.length, 3);
  const d = N.lovedShows({ a: { name: 'Dup', notes: { '1x1': { react: 'love' } } }, b: { name: 'Dup', notes: { '1x1': { react: 'funny' } } } }).rows; assert.deepEqual(d.map((x) => x.label), ['Dup', 'Dup (2)']);
  for (const bad of [undefined, null, {}, { a: null }, { a: { name: 'x', notes: 'no' } }, { a: { name: 'x', notes: { bad: { react: 'love' }, '1x1': null } } }]) assert.deepEqual(N.lovedShows(bad), { rows: [], titles: 0 });
});
t('scale: 3,000 shows x 20 notes collect + search in well under a second', () => {
  const big = Object.fromEntries(Array.from({ length: 3000 }, (_, i) => ['s' + i, { name: 'Show ' + i, notes: Object.fromEntries(Array.from({ length: 20 }, (_, j) => [`1x${j + 1}`, { react: ['love', 'funny', 'sad'][j % 3], text: 'note ' + j, at: `2026-0${1 + (j % 9)}-01T00:00:00.000Z` }])) }]));
  const t0 = Date.now(); const e = N.collectNotes(big, []); const f = N.filterNotes(e, { q: 'show 29 note 7', reacts: ['funny'] }); assert.equal(e.length, 60000); assert.ok(Date.now() - t0 < 2500, (Date.now() - t0) + ' ms'); assert.ok(f.length >= 1);
});
console.log(`\n${n} tests passed`);
