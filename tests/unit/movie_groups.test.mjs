process.env.TZ = 'Australia/Hobart';
import assert from 'node:assert/strict';
import * as G from '../../src/components/movieGroupsLogic.js';
import { shownMovies } from '../../src/components/libraryLogic.js';
let n = 0; const t = (name, fn) => { fn(); n++; console.log('ok  -', name); };
const mv = (index, name, tmdbId, day, o = {}) => ({ index, name, ...(tmdbId != null ? { tmdbId } : null), status: 'watched', watchedAt: `${day}T10:00:00.000Z`, ...o });

const LIB = [
  mv(0, 'Alvin and the Chipmunks', 6477, '2020-01-01', { rating: 3, poster: '/a.jpg' }),
  mv(1, 'Alvin and the Chipmunks', 6477, '2026-10-19'),
  mv(2, 'Alvin and the Chipmunks', 6477, '2023-05-05', { rating: 4 }),
  mv(3, 'Alvin and the Chipmunks', 6477, '2024-01-01'),
  mv(4, 'Shaun of the Dead', 747, '2026-10-10', { rating: 0.5 }),
  mv(5, 'heat', null, '2021-01-01'), mv(6, 'Heat ', null, '2022-01-01', { rating: 5 }),
  mv(7, 'Heat', 949, '2019-01-01'), // linked: a different group from the name-only copies
];

t('four viewings of one film become ONE group with times = 4, newest viewing first', () => {
  const g = G.groupMovies(LIB).find((x) => x.tmdbId === 6477);
  assert.equal(g.times, 4); assert.deepEqual(g.viewings.map((v) => v.index), [1, 3, 2, 0]);
  assert.equal(g.latest.index, 1); assert.equal(g.watchedAt, '2026-10-19T10:00:00.000Z');
});
t('the tile rating is the newest rating given (4, from 2023), and the poster comes from any viewing that has one', () => {
  const g = G.groupMovies(LIB).find((x) => x.tmdbId === 6477);
  assert.equal(g.rating, 4); assert.equal(g.poster, '/a.jpg');
});
t('unlinked copies group by name ignoring case and spaces; a linked film with the same name stays separate', () => {
  const gs = G.groupMovies(LIB); assert.equal(gs.length, 4);
  const nameOnly = gs.find((x) => x.key === 'nheat'); assert.equal(nameOnly.times, 2); assert.equal(nameOnly.rating, 5);
  assert.equal(gs.find((x) => x.tmdbId === 949).times, 1);
});
t('groups are newest-watched first, and the existing filter/sort works on them', () => {
  const gs = G.groupMovies(LIB);
  assert.deepEqual(gs.map((g) => g.name), ['Alvin and the Chipmunks', 'Shaun of the Dead', 'Heat ', 'Heat']);
  assert.deepEqual(shownMovies(gs, 'alvin', 'recent').map((g) => g.times), [4]);
  assert.deepEqual(shownMovies(gs, '', 'rating').map((g) => g.rating), [5, 4, 0.5, 0]);
});
t('groupOfIndex finds the film a viewing belongs to; viewingsLabel', () => {
  const gs = G.groupMovies(LIB);
  assert.equal(G.groupOfIndex(gs, 2).times, 4); assert.equal(G.groupOfIndex(gs, 99), null);
  assert.equal(G.viewingsLabel(1), 'Watched once'); assert.equal(G.viewingsLabel(4), 'Watched 4 times');
});
t('empty and junk input', () => {
  assert.deepEqual(G.groupMovies([]), []); assert.deepEqual(G.groupMovies(null), []);
  assert.equal(G.groupMovies([null, mv(0, '', null, '2020-01-01'), mv(1, '', null, '2020-01-02')]).length, 2); // no name, no id: never merged
});


// ---- Change date
const ALV = G.groupMovies([mv(0, 'Alvin', 1, '2026-10-19'), mv(1, 'Alvin', 1, '2026-10-19'), mv(2, 'Alvin', 1, '2023-05-05')].map((m) => ({ ...m, watchedAt: m.watchedAt.replace('T10:00', 'T01:00') })))[0];
const TODAY = '2026-10-19';
t('viewingDay is the LOCAL day (01:00 UTC on 19 Oct is 12:00 on 19 Oct in Hobart; 14:00 UTC on 18 Oct is the 19th)', () => {
  assert.equal(G.viewingDay({ watchedAt: '2026-10-19T01:00:00.000Z' }), '2026-10-19');
  assert.equal(G.viewingDay({ watchedAt: '2026-10-18T14:00:00.000Z' }), '2026-10-19');
  assert.equal(G.viewingDay({}), ''); assert.equal(G.viewingDay({ watchedAt: 'junk' }), '');
});
t('checkNewDay: a past day is fine and the hint says what happens', () => {
  assert.deepEqual(G.checkNewDay(ALV, 0, '2021-12-25', TODAY), { ok: true, msg: 'This viewing will be dated 25 Dec 2021. Rating and notes stay.' });
});
t('checkNewDay: future, before 1980, not a real day, or empty are refused', () => {
  for (const d of ['2026-10-20', '1979-12-31', '2023-02-30', 'abc']) { const r = G.checkNewDay(ALV, 0, d, TODAY); assert.equal(r.ok, false, d); assert.match(r.msg, /real date that is not in the future/); }
  assert.deepEqual(G.checkNewDay(ALV, 0, '', TODAY), { ok: false, msg: '' });
});
t('checkNewDay: the same day it already has is not a change; a day another viewing of this film has is refused', () => {
  assert.deepEqual(G.checkNewDay(ALV, 2, '2023-05-05', TODAY), { ok: false, msg: '' }); // unchanged: no warning
  const r = G.checkNewDay(ALV, 0, '2023-05-05', TODAY); assert.equal(r.ok, false); assert.match(r.msg, /already have a viewing of this film on that day/);
  // the two copies dated today: moving one of them to today is "already the date"; to another day is fine
  assert.equal(G.checkNewDay(ALV, 1, '2019-07-07', TODAY).ok, true);
});
t('watchedAtFor stores local noon on that day, and never a time in the future', () => {
  assert.equal(G.watchedAtFor('2021-12-25'), new Date(2021, 11, 25, 12).toISOString());
  const now = new Date(2026, 9, 19, 8, 30); assert.equal(G.watchedAtFor('2026-10-19', now), now.toISOString());
  assert.equal(G.viewingDay({ watchedAt: G.watchedAtFor('2021-12-25') }), '2021-12-25');
});

console.log(`\n${n} movie groups tests passed`);
