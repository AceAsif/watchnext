import assert from 'node:assert/strict';
import { parseMovieQuery as P, searchWithYear as W } from '../../src/components/movieSearchLogic.js';
let n = 0; const t = (name, fn) => Promise.resolve(fn()).then(() => { n++; console.log('ok  -', name); });

await t('parse: trailing year splits off', () => {
  assert.deepEqual(P('Ready 2011'), { title: 'Ready', year: '2011' });
  assert.deepEqual(P('  Ready   (2011) '), { title: 'Ready', year: '2011' });
  assert.deepEqual(P('Ready(2011)'), { title: 'Ready', year: '2011' });
});
await t('parse: no year, or a title that is only a number, stays as typed', () => {
  assert.deepEqual(P('Ready'), { title: 'Ready', year: null });
  assert.deepEqual(P('1917'), { title: '1917', year: null });
  assert.deepEqual(P('2012'), { title: '2012', year: null });
  assert.deepEqual(P('Blade Runner 2049'), { title: 'Blade Runner', year: '2049' });
  assert.deepEqual(P('Ready 99999'), { title: 'Ready 99999', year: null });
  assert.deepEqual(P(null), { title: '', year: null });
});
await t('search: year goes to TMDB as a param', async () => {
  const calls = [];
  const r = await W(async (p) => { calls.push(p); return { results: [{ id: 1 }] }; }, 'Ready 2011');
  assert.deepEqual(calls, [{ query: 'Ready', year: '2011' }]); assert.equal(r.results.length, 1);
});
await t('search: empty year search falls back to year-filtered loose results, then raw text', async () => {
  let calls = [];
  let r = await W(async (p) => { calls.push(p); return p.year ? { results: [] } : { results: [{ id: 1, release_date: '2011-06-03' }, { id: 2, release_date: '2019-01-01' }] }; }, 'Ready 2011');
  assert.deepEqual(r.results.map((x) => x.id), [1]);
  calls = [];
  r = await W(async (p) => { calls.push(p); return p.query === 'Foo 2011' ? { results: [{ id: 9 }] } : { results: [] }; }, 'Foo 2011');
  assert.deepEqual(r.results, [{ id: 9 }]); assert.equal(calls.length, 3);
});
await t('search: plain query is one call', async () => {
  const calls = [];
  await W(async (p) => { calls.push(p); return { results: [] }; }, 'Ready');
  assert.deepEqual(calls, [{ query: 'Ready' }]);
});
console.log(`\n${n} tests passed`);
