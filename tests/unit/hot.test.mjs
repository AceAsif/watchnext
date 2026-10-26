// "Watch it Hot" / "Hot Ticket": watching right after release, in YOUR local days (Hobart).
process.env.TZ = 'Australia/Hobart';
import assert from 'node:assert/strict';
const H = await import('../../src/components/hotLogic.js');
let n = 0; const t = (name, fn) => { fn(); n++; console.log('ok  -', name); };

t('episode: the air day or the day after counts (local days)', () => {
  assert.equal(H.isHotEp('2026-10-25T09:00:00.000Z', '2026-10-25'), true);  // 8pm on the air day
  assert.equal(H.isHotEp('2026-10-26T12:00:00.000Z', '2026-10-26'), true);  // 11pm
  assert.equal(H.isHotEp('2026-10-26T12:30:00.000Z', '2026-10-26'), true);  // 11:30pm
  assert.equal(H.isHotEp('2026-10-26T14:00:00.000Z', '2026-10-26'), true);  // 1am on the 27th = the next day
  assert.equal(H.isHotEp('2026-10-27T13:30:00.000Z', '2026-10-26'), false); // 12:30am on the 28th = 2 days later
  assert.equal(H.isHotEp('2026-10-24T09:00:00.000Z', '2026-10-25'), false); // before it aired (a wrong date)
  assert.equal(H.isHotEp('2026-10-25T09:00:00.000Z', null), false); assert.equal(H.isHotEp('junk', '2026-10-25'), false);
});
t('movie: up to 7 days after release', () => {
  assert.equal(H.isHotMovie('2026-10-25T09:00:00.000Z', '2026-10-18'), true);
  assert.equal(H.isHotMovie('2026-10-25T09:00:00.000Z', '2026-10-17'), false);
  assert.equal(H.isHotMovie('2026-10-25T09:00:00.000Z', '2026-10-25'), true);
  assert.equal(H.isHotMovie('2026-10-25T09:00:00.000Z', '2026'), false);
});
t('airOf: the hint first, then TMDB last aired, next episode, the upcoming list', () => {
  const show = { lastAir: { date: '2026-10-20', season: 2, episode: 4 }, nextAir: { date: '2026-10-27', season: 2, episode: 5 }, upcoming: [{ s: 2, e: 6, air: '2026-11-03' }] };
  assert.equal(H.airOf(show, 2, 4), '2026-10-20'); assert.equal(H.airOf(show, 2, 5), '2026-10-27'); assert.equal(H.airOf(show, '2', '6'), '2026-11-03');
  assert.equal(H.airOf(show, 2, 4, '2026-10-21'), '2026-10-21'); assert.equal(H.airOf(show, 1, 1), null); assert.equal(H.airOf(null, 1, 1), null);
  assert.equal(H.airOf({ lastAir: { date: 'soon', season: 1, episode: 1 } }, 1, 1), null);
});
t('hotPatch: { air } only when the watch was hot', () => {
  const show = { lastAir: { date: '2026-10-25', season: 1, episode: 8 } };
  assert.deepEqual(H.hotPatch(show, 1, 8, '2026-10-25T10:00:00.000Z'), { air: '2026-10-25' });
  assert.deepEqual(H.hotPatch(show, 1, 8, '2026-11-25T10:00:00.000Z'), {});
  assert.deepEqual(H.hotPatch(show, 1, 7, '2026-10-25T10:00:00.000Z'), {});
  assert.deepEqual(H.hotPatch({}, 1, 7, '2026-10-25T10:00:00.000Z', '2026-10-25'), { air: '2026-10-25' });
});
t('counts: hot episodes (first watches), different hot films (a rewatch of the same film counts once), planned films skipped', () => {
  const shows = { a: { watched: { '1x1': { at: '2026-10-25T10:00:00.000Z', air: '2026-10-25', n: 3 }, '1x2': { at: '2026-10-25T10:00:00.000Z' }, '1x3': { at: '2026-11-25T10:00:00.000Z', air: '2026-10-25' } } }, b: null, c: { watched: 'x' } };
  assert.equal(H.countHotEpisodes(shows), 1); assert.equal(H.countHotEpisodes(null), 0);
  const movies = [
    { tmdbId: 1, status: 'watched', watchedAt: '2026-10-25T10:00:00.000Z', released: '2026-10-20' },
    { tmdbId: 1, status: 'watched', watchedAt: '2026-10-26T10:00:00.000Z', released: '2026-10-20' },
    { tmdbId: 2, status: 'planned', released: '2026-10-20' },
    { name: 'No Id', watchedAt: '2026-10-21T10:00:00.000Z', released: '2026-10-20' },
    { tmdbId: 3, status: 'watched', watchedAt: '2026-10-25T10:00:00.000Z' },
    null,
  ];
  assert.equal(H.countHotMovies(movies), 2); assert.equal(H.countHotMovies(undefined), 0);
});
console.log(`\n${n} hot tests passed`);
