import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import * as L from '../../src/components/letterboxdLogic.js';
import { readZipTexts, isLetterboxdCsv } from '../../src/components/letterboxdZip.js';
let n = 0; const t = async (name, fn) => { await fn(); n++; console.log('ok  -', name); };

const WATCHED = 'Date,Name,Year,Letterboxd URI\n2020-05-01,Ready,2011,https://boxd.it/a\n2021-02-03,"Tár",2022,https://boxd.it/b\n2019-01-01,Inception,2010,https://boxd.it/c\n';
const DIARY = 'Date,Name,Year,Letterboxd URI,Rating,Rewatch,Tags,Watched Date\n2020-05-02,Inception,2010,x,4.5,,,2020-03-22\n2021-06-01,Inception,2010,x,5,Yes,,2021-05-30\n2021-06-01,Inception,2010,x,5,Yes,,2021-05-30\n';
const RATINGS = 'Date,Name,Year,Letterboxd URI,Rating\n2020-05-01,Ready,2011,x,3.5\n2021-02-03,"Tár",2022,x,0.5\n';
const WL = 'Date,Name,Year,Letterboxd URI\n2022-01-01,Dune,2021,x\n2022-01-01,Ready,2011,x\n2022-01-02,Dune,2021,x\n';
const rec = L.csvRecords;

await t('csv: quotes, commas, newlines, BOM, CRLF', () => {
  const r = L.parseCsv('﻿a,b\r\n"x, y","he said ""hi"""\r\n"multi\nline",z\r\n');
  assert.deepEqual(r, [['a', 'b'], ['x, y', 'he said "hi"'], ['multi\nline', 'z']]);
  assert.deepEqual(L.csvRecords(' A , B \n1,2\n'), [{ A: '1', B: '2' }]);
  assert.deepEqual(L.csvRecords(''), []);
});
await t('kind: by file name, then by columns', () => {
  assert.equal(L.csvKind('diary.csv', ''), 'diary');
  assert.equal(L.csvKind('letterboxd-x/watchlist.csv', ''), 'watchlist');
  assert.equal(L.csvKind('watched (1).csv', ''), 'watched');
  assert.equal(L.csvKind('stuff.csv', DIARY), 'diary');
  assert.equal(L.csvKind('stuff.csv', RATINGS), 'ratings');
  assert.equal(L.csvKind('stuff.csv', WATCHED), null);
  assert.equal(L.csvKind('reviews.csv', 'Date,Name,Year,Letterboxd URI,Rating,Rewatch,Review,Tags,Watched Date'), null);
});
await t('stars: half stars round up to whole, 0.5 stays 1 star, junk is 0', () => {
  assert.deepEqual(['0.5', '1', '3.5', '4.5', '5', '', 'x', '0'].map(L.starsFrom), [1, 1, 4, 5, 5, 0, 0, 0]);
});
await t('plan: diary dates, rewatch, same-day dupes, watched fallback, ratings, watchlist', () => {
  const p = L.buildPlan({ watched: rec(WATCHED), diary: rec(DIARY), ratings: rec(RATINGS), watchlist: rec(WL) });
  const by = Object.fromEntries(p.films.map((f) => [f.name, f]));
  assert.deepEqual(by.Inception.views.map((v) => v.day), ['2020-03-22', '2021-05-30']);
  assert.equal(by.Inception.views[1].rewatch, true);
  assert.equal(by.Inception.views[0].rating, 5); // 4.5 rounds up
  assert.equal(by.Ready.views.length, 1); assert.equal(by.Ready.views[0].day, '2020-05-01'); assert.ok(by.Ready.views[0].approx);
  assert.equal(by.Ready.views[0].rating, 4); // from ratings.csv 3.5
  assert.equal(by['Tár'].views[0].rating, 1);
  assert.deepEqual(p.watchlist.map((w) => w.name), ['Dune']); // Ready is already watched; Dune listed once
  assert.deepEqual(p.counts, { films: 3, viewings: 4, rewatches: 1, rated: 3, watchlist: 1 });
});
await t('plan: rated-only film still counts as watched; empty input is empty', () => {
  const p = L.buildPlan({ ratings: rec('Date,Name,Year,Letterboxd URI,Rating\n2020-01-01,Solo,2018,x,3\n') });
  assert.equal(p.films.length, 1); assert.equal(p.films[0].views[0].day, null); assert.equal(p.films[0].views[0].rating, 3);
  assert.equal(L.buildPlan({}).films.length, 0);
});
await t('match: exact title+year beats a more popular same-name film', () => {
  const res = [{ id: 1, title: 'Ready', release_date: '2019-01-01' }, { id: 2, title: 'Ready', release_date: '2011-06-03' }];
  assert.equal(L.pickMatch(res, 'Ready', '2011').id, 2);
});
await t('match: year off by one ok; wrong year never guessed; accents/case normalised', () => {
  assert.equal(L.pickMatch([{ id: 5, title: 'Dune', release_date: '2020-12-31' }], 'Dune', '2021').id, 5);
  assert.equal(L.pickMatch([{ id: 5, title: 'Dune', release_date: '1984-12-14' }], 'Dune', '2021'), null);
  assert.equal(L.pickMatch([{ id: 7, title: 'Tár', release_date: '2022-10-07' }], 'tár', '2022').id, 7);
  assert.equal(L.pickMatch([], 'x', '2000'), null);
});
await t('match: different spelling accepted only if it is the single film that year; no year needs a unique title', () => {
  assert.equal(L.pickMatch([{ id: 9, title: 'Le Fabuleux Destin', release_date: '2001-04-25' }], 'Amelie', '2001').id, 9);
  assert.equal(L.pickMatch([{ id: 1, title: 'A', release_date: '2001-01-01' }, { id: 2, title: 'B', release_date: '2001-02-02' }], 'Amelie', '2001'), null);
  assert.equal(L.pickMatch([{ id: 1, title: 'Heat', release_date: '1995-12-15' }], 'Heat', null).id, 1);
  assert.equal(L.pickMatch([{ id: 1, title: 'Heat', release_date: '1995-12-15' }, { id: 2, title: 'Heat', release_date: '1986-01-01' }], 'Heat', null), null);
});
await t('entries: one per viewing, noon local, rating on the viewing, unmatched kept by name', () => {
  const film = { name: 'Inception', year: '2010', views: [{ day: '2020-03-22', rating: 5 }, { day: '2021-05-30', rating: 0 }] };
  const info = { id: 27205, title: 'Inception', runtime: 148, poster_path: '/p.jpg', release_date: '2010-07-16', genres: [{ name: 'Sci-Fi' }] };
  const e = L.entriesFor(film, info);
  assert.equal(e.length, 2); assert.equal(e[0].tmdbId, 27205); assert.equal(e[0].rating, 5); assert.equal(e[1].rating, undefined);
  assert.equal(e[0].runtimeMin, 148); assert.deepEqual(e[0].genres, ['Sci-Fi']); assert.equal(e[0].status, 'watched');
  assert.equal(new Date(e[0].watchedAt).getHours(), 12);
  const u = L.entriesFor(film, null);
  assert.equal(u[0].tmdbId, undefined); assert.equal(u[0].name, 'Inception'); assert.equal(u[0].year, '2010');
  const pl = L.plannedEntry({ name: 'Dune', year: '2021', day: '2022-01-01' }, null);
  assert.equal(pl.status, 'planned'); assert.ok(pl.addedAt);
});
await t('merge: re-import adds nothing; same film other day is a rewatch; name-only legacy entry matches by title+day', () => {
  const film = { name: 'Inception', year: '2010', views: [{ day: '2020-03-22', rating: 0 }, { day: '2021-05-30', rating: 0 }] };
  const info = { id: 1, title: 'Inception', release_date: '2010-07-16' };
  const entries = L.entriesFor(film, info);
  const first = L.mergeLetterboxd([], entries);
  assert.equal(first.added, 2);
  const again = L.mergeLetterboxd(first.movies, entries);
  assert.equal(again.added, 0); assert.equal(again.skipped, 2); assert.equal(again.movies.length, 2);
  const legacy = [{ name: 'Inception', watchedAt: L.dayToISO('2020-03-22') }];
  const m = L.mergeLetterboxd(legacy, entries);
  assert.equal(m.added, 1); assert.equal(m.skipped, 1);
  const withNew = L.mergeLetterboxd(first.movies, [...entries, ...L.entriesFor({ name: 'Inception', year: '2010', views: [{ day: '2022-01-01', rating: 0 }] }, info)]);
  assert.equal(withNew.added, 1);
});
await t('merge: planned skipped when the film is already in the library; input never mutated', () => {
  const lib = Object.freeze([Object.freeze({ tmdbId: 3, name: 'Dune', status: 'planned' })]);
  const r = L.mergeLetterboxd(lib, [L.plannedEntry({ name: 'Dune', year: '2021' }, { id: 3, title: 'Dune', release_date: '2021-09-15' }), L.plannedEntry({ name: 'Heat', year: '1995' }, null)]);
  assert.equal(r.added, 1); assert.equal(r.skipped, 1); assert.equal(lib.length, 1);
});
await t('runner: matches with year, batches saves, keeps unmatched, reports progress', async () => {
  const plan = L.buildPlan({ watched: rec(WATCHED), diary: rec(DIARY), watchlist: rec(WL) });
  const queries = []; const saved = []; const prog = [];
  const db = {
    Ready: [{ id: 2, title: 'Ready', release_date: '2011-06-03' }],
    Inception: [{ id: 1, title: 'Inception', release_date: '2010-07-16' }],
    Dune: [{ id: 3, title: 'Dune', release_date: '2021-09-15' }],
  };
  const res = await L.runImport(plan, {
    search: async (p) => { queries.push(p); return { results: db[p.query] || [] }; },
    details: async (id) => ({ id, title: { 1: 'Inception', 2: 'Ready', 3: 'Dune' }[id], runtime: 100, release_date: '2011-01-01' }),
    save: (es) => { saved.push(...es); return { added: es.length, skipped: 0 }; },
    onProgress: (p) => prog.push(p.done),
  }, { batch: 2, concurrency: 2 });
  assert.ok(queries.some((q) => q.query === 'Ready' && q.year === '2011'));
  assert.equal(res.total, 4); assert.equal(res.matched, 3); assert.deepEqual(res.unmatched, [{ name: 'Tár', year: '2022' }]);
  assert.equal(res.added, saved.length); assert.equal(saved.length, 5); // Inception x2, Ready, Tár (by name), Dune planned
  assert.equal(prog[prog.length - 1], 4);
  assert.ok(saved.find((e) => e.name === 'Tár' && e.tmdbId === undefined));
});
await t('runner: stop keeps what is done; a search error skips the film; a missing key is fatal', async () => {
  const plan = L.buildPlan({ watched: rec(WATCHED) });
  let calls = 0; const saved = [];
  const r = await L.runImport(plan, { search: async () => ({ results: [] }), details: async () => ({}), save: (e) => { saved.push(...e); return { added: e.length, skipped: 0 }; }, cancelled: () => calls++ >= 1 }, { concurrency: 1 });
  assert.equal(r.stopped, true); assert.equal(saved.length, 1);
  const r2 = await L.runImport(plan, { search: async () => { throw new Error('TMDB 500'); }, details: async () => ({}), save: (e) => ({ added: e.length, skipped: 0 }) });
  assert.equal(r2.unmatched.length, 3);
  await assert.rejects(L.runImport(plan, { search: async () => { throw new Error('No TMDB API key set. Add one in Settings.'); }, details: async () => ({}), save: () => ({ added: 0, skipped: 0 }) }), /API key/);
});
await t('text: preview and result copy', () => {
  assert.equal(L.previewText({ films: 1204, rewatches: 1, rated: 880, watchlist: 0 }), 'Found 1,204 films, 1 rewatch, 880 ratings.');
  assert.match(L.resultText({ added: 5, skipped: 2, unmatched: [{ name: 'x' }], stopped: false }), /5 entries added, 2 already there\. 1 film couldn’t be matched/);
  assert.match(L.resultText({ added: 1, skipped: 0, unmatched: [], stopped: true }), /^Stopped early\. 1 entry added\.$/);
});

// ---- zip
function makeZip(files) {
  const parts = []; const cd = []; let off = 0;
  for (const [name, text, method] of files) {
    const nb = Buffer.from(name); const raw = Buffer.from(text);
    const data = method === 0 ? raw : zlib.deflateRawSync(raw);
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(method === 0 ? 0 : 8, 8); lh.writeUInt32LE(data.length, 18); lh.writeUInt32LE(raw.length, 22); lh.writeUInt16LE(nb.length, 26);
    parts.push(lh, nb, data);
    const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(method === 0 ? 0 : 8, 10); ch.writeUInt32LE(data.length, 20); ch.writeUInt32LE(raw.length, 24); ch.writeUInt16LE(nb.length, 28); ch.writeUInt32LE(off, 42);
    cd.push(ch, nb); off += 30 + nb.length + data.length;
  }
  const cdb = Buffer.concat(cd); const e = Buffer.alloc(22);
  e.writeUInt32LE(0x06054b50, 0); e.writeUInt16LE(files.length, 8); e.writeUInt16LE(files.length, 10); e.writeUInt32LE(cdb.length, 12); e.writeUInt32LE(off, 16);
  return new Uint8Array(Buffer.concat([...parts, cdb, e]));
}
await t('zip: reads deflated and stored entries, filters, handles unicode', async () => {
  const z = makeZip([['diary.csv', DIARY], ['watched.csv', WATCHED, 0], ['deleted/diary.csv', 'old'], ['likes/films.csv', 'x'], ['profile.csv', 'p'], ['lists/', '']]);
  const out = await readZipTexts(z, isLetterboxdCsv);
  assert.deepEqual(out.map((o) => o.name).sort(), ['diary.csv', 'watched.csv']);
  assert.equal(out.find((o) => o.name === 'diary.csv').text, DIARY);
  assert.ok(out.find((o) => o.name === 'watched.csv').text.includes('Tár'));
  const plan = L.buildPlan(Object.fromEntries(out.map((o) => [L.csvKind(o.name, o.text), L.csvRecords(o.text)])));
  assert.equal(plan.counts.films, 3);
  await assert.rejects(readZipTexts(new Uint8Array(40)), /not a zip/);
  assert.ok(isLetterboxdCsv('letterboxd-user-2026/diary.csv')); assert.ok(!isLetterboxdCsv('deleted/diary.csv'));
});
console.log(`\n${n} tests passed`);
