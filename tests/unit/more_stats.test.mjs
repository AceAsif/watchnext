// "Biggest binges" and "Genres over time", in Hobart time.
process.env.TZ = 'Australia/Hobart';
import assert from 'node:assert/strict';
const M = await import('../../src/components/moreStatsLogic.js');
let n = 0; const t = (name, fn) => { fn(); n++; console.log('ok  -', name); };

// n episodes of a show at 1-hour steps from a UTC start (each its own minute).
const run = (season, from, count, startIso, min = 40) => Object.fromEntries(Array.from({ length: count }, (_, i) => [`${season}x${from + i}`, { at: new Date(Date.parse(startIso) + i * 3600000).toISOString(), min }]));

t('binge: most episodes of ONE show on ONE local day, with time; top 5, most first', () => {
  const shows = {
    a: { name: 'Suits', runtimeMin: 44, watched: { ...run(1, 1, 6, '2026-03-12T06:00:00.000Z', 44), ...run(1, 7, 3, '2026-03-20T06:00:00.000Z', 44) } },
    b: { name: 'Bluey', watched: run(1, 1, 6, '2026-04-01T06:00:00.000Z', 8) },
    c: { name: 'Solo', watched: run(1, 1, 1, '2026-04-02T08:00:00.000Z') },
  };
  const r = M.binges(shows);
  assert.deepEqual(r.map((x) => [x.name, x.day, x.eps, x.minutes]), [['Suits', '2026-03-12', 6, 264], ['Bluey', '2026-04-01', 6, 48], ['Suits', '2026-03-20', 3, 132]]);
  assert.equal(r.find((x) => x.name === 'Solo'), undefined, 'one episode is not a binge');
});
t('binge uses local days: 9pm to 2am counts as two days', () => {
  // 9pm, 10pm, 11pm on 12 Mar (Hobart, UTC+11), then 12am, 1am on 13 Mar
  const r = M.binges({ a: { name: 'Night', watched: run(1, 1, 5, '2026-03-12T10:00:00.000Z') } });
  assert.deepEqual(r.map((x) => [x.day, x.eps]), [['2026-03-12', 3], ['2026-03-13', 2]]);
});
t('a bulk-marked batch (15+ ticks in one minute) is left out; a smaller batch counts', () => {
  const at = '2026-05-05T09:00:00.000Z';
  const big = Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`1x${i + 1}`, { at, min: 30 }]));
  const small = Object.fromEntries(Array.from({ length: 4 }, (_, i) => [`1x${i + 1}`, { at, min: 30 }]));
  assert.deepEqual(M.binges({ a: { name: 'Import', watched: big } }), []);
  assert.equal(M.binges({ a: { name: 'Season', watched: small } })[0].eps, 4);
});
t('year filter, limit, rewatches on their own date, bad data is safe', () => {
  const shows = {
    a: { name: 'A', watched: { ...run(1, 1, 3, '2025-06-01T08:00:00.000Z'), ...run(2, 1, 2, '2026-06-01T08:00:00.000Z') } },
    b: { name: 'B', watched: { '1x1': { at: '2024-01-01T08:00:00.000Z', n: 2, last: '2026-07-01T08:00:00.000Z' }, '1x2': { at: '2024-01-01T09:00:00.000Z', n: 2, last: '2026-07-01T09:00:00.000Z' } } },
    bad: null, __proto__x: { watched: 'x' },
  };
  assert.deepEqual(M.binges(shows, { year: '2026' }).map((x) => [x.name, x.eps]), [['B', 2], ['A', 2]]); // a tie: the newer binge first
  assert.deepEqual(M.binges(shows, { year: '2025' }).map((x) => x.eps), [3]);
  assert.equal(M.binges(shows, { limit: 1 }).length, 1);
  assert.deepEqual(M.binges(null), []); assert.deepEqual(M.binges({ x: { watched: { '1x1': 'junk' } } }), []);
});

const ep = (y, k, min = 30) => [`1x${k}`, { at: `${y}-06-${String(k).padStart(2, '0')}T08:00:00.000Z`, min }];
const showOf = (name, genres, years) => ({ name, genres, watched: Object.fromEntries(years.flatMap(([y, count]) => Array.from({ length: count }, (_, i) => ep(y, i + 1)).map(([k, v]) => [`${y}-${k}`, v]))) });
t('genre trends: share of each year, top genres, rising and falling', () => {
  const shows = {
    a: showOf('Comedy Show', ['Comedy'], [['2024', 2], ['2025', 6]]),
    b: showOf('Drama Show', ['Drama', 'Crime'], [['2024', 8], ['2025', 4]]),
  };
  const movies = [{ name: 'F', status: 'watched', watchedAt: '2025-06-20T08:00:00.000Z', genres: ['Comedy'] }, { name: 'P', status: 'planned', genres: ['Horror'] }];
  const r = M.genreTrends(shows, movies);
  assert.deepEqual(r.years, ['2024', '2025']);
  // 2024: 10 watches (2 comedy, 8 drama+crime); 2025: 11 (6+1 comedy, 4 drama+crime)
  assert.deepEqual(r.rows.map((x) => [x.genre, x.shares, x.counts]), [
    ['Crime', [80, 36], [8, 4]], ['Drama', [80, 36], [8, 4]], ['Comedy', [20, 64], [2, 7]], // most watched first (12, 12, 9)
  ]);
  assert.deepEqual(r.rising, { genre: 'Comedy', from: 20, to: 64, fromYear: '2024', toYear: '2025' });
  assert.equal(r.falling.from, 80); assert.equal(r.falling.to, 36);
  assert.ok(['Crime', 'Drama'].includes(r.falling.genre));
});
t('genre trends: local years (1am on 1 Jan is the new year), at most 5 years, top 5 genres', () => {
  const s = { a: { name: 'NY', genres: ['Comedy'], watched: { '1x1': { at: '2025-12-31T14:00:00.000Z' }, '1x2': { at: '2024-06-01T08:00:00.000Z' } } } };
  assert.deepEqual(M.genreTrends(s, []).years, ['2024', '2026']);
  const many = {}; for (let y = 2018; y <= 2026; y++) for (const g of ['A', 'B', 'C', 'D', 'E', 'F', 'G']) many[`${y}${g}`] = showOf(g, [g], [[String(y), 1]]);
  const r = M.genreTrends(many, []);
  assert.deepEqual(r.years, ['2022', '2023', '2024', '2025', '2026']); assert.equal(r.rows.length, 5);
});
t('genre trends: under 2 years, no genres, or bad data -> null; small changes are not "rising"', () => {
  assert.equal(M.genreTrends({ a: showOf('X', ['Comedy'], [['2026', 3]]) }, []), null);
  assert.equal(M.genreTrends({ a: showOf('X', [], [['2025', 3], ['2026', 3]]) }, []), null);
  assert.equal(M.genreTrends(null, null), null);
  const flat = M.genreTrends({ a: showOf('X', ['Comedy'], [['2025', 3], ['2026', 3]]) }, []);
  assert.equal(flat.rising, null); assert.equal(flat.falling, null); assert.deepEqual(flat.rows[0].shares, [100, 100]);
});
console.log(`\n${n} more stats tests passed`);
