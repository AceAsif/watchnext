process.env.TZ = 'Australia/Hobart';
import assert from 'node:assert/strict';
import * as F from '../../src/components/finishCardLogic.js';
import * as Y from '../../src/components/yearImageLogic.js';
import { BATCH_MIN } from '../../src/components/statsLogic.js';
let n = 0; const t = (name, fn) => { fn(); n++; console.log('ok  -', name); };
const eps = (count, at = (i) => `2026-08-${String(1 + (i % 28)).padStart(2, '0')}T10:00:00.000Z`, min = 40) => Object.fromEntries(Array.from({ length: count }, (_, i) => [`1x${i + 1}`, { at: at(i), min, n: 1 }]));
const show = (extra = {}) => ({ name: 'Suits', poster: '/s.jpg', totalEpisodes: 10, status: 'Ended', watched: eps(10), ...extra });

t('finished = every listed episode watched AND the show is not still running', () => {
  assert.equal(F.isFinishedShow(show()), true); assert.equal(F.isFinishedShow(show({ status: 'Canceled' })), true);
  assert.equal(F.isFinishedShow(show({ status: undefined })), true, 'imported shows with no status count');
  assert.equal(F.isFinishedShow(show({ status: 'Returning Series' })), false, 'caught up is not finished'); assert.equal(F.isFinishedShow(show({ status: 'In Production' })), false);
  assert.equal(F.isFinishedShow(show({ watched: eps(9) })), false); assert.equal(F.isFinishedShow(show({ totalEpisodes: 0 })), false); assert.equal(F.isFinishedShow(show({ totalEpisodes: undefined })), false);
  assert.equal(F.isFinishedShow(show({ watched: eps(12) })), true, 'more watched than listed is still finished'); assert.equal(F.isFinishedShow(null), false); assert.equal(F.isFinishedShow({}), false);
});
t('becomesFinished: only the action that crosses the line, never for running shows, never twice', () => {
  const s9 = show({ watched: eps(9) });
  assert.equal(F.becomesFinished(s9, 1), true); assert.equal(F.becomesFinished(s9, 3), true, 'a whole season can complete it');
  assert.equal(F.becomesFinished(show({ watched: eps(8) }), 1), false); assert.equal(F.becomesFinished(show({ watched: eps(8) }), 2), true);
  assert.equal(F.becomesFinished(show(), 1), false, 'already finished'); assert.equal(F.becomesFinished(s9, 0), false); assert.equal(F.becomesFinished(s9, -1), false);
  assert.equal(F.becomesFinished({ ...s9, status: 'Returning Series' }, 1), false); assert.equal(F.becomesFinished({ ...s9, totalEpisodes: 0 }, 1), false);
});
t('bulkMinutes: a minute with >= BATCH_MIN watches across shows, same rule as Stats', () => {
  const dump = { a: show({ watched: eps(BATCH_MIN, () => '2019-03-05T10:00:30.000Z') }), b: show({ watched: eps(BATCH_MIN - 1, () => '2019-03-06T10:00:30.000Z') }) };
  const b = F.bulkMinutes(dump); assert.equal(b.has('2019-03-05T10:00'), true); assert.equal(b.has('2019-03-06T10:00'), false);
  const split = F.bulkMinutes({ a: show({ watched: eps(8, () => '2019-03-07T10:00:10.000Z') }), b: show({ watched: eps(8, () => '2019-03-07T10:00:50.000Z') }) }); assert.equal(split.has('2019-03-07T10:00'), true);
  assert.equal(F.bulkMinutes(undefined).size, 0); assert.equal(F.bulkMinutes({ a: null, b: { watched: { x: null } } }).size, 0);
});
t('facts: distinct episodes, hours from per-episode minutes (rewatches do not inflate), local dates, days = inclusive span', () => {
  const s = show({ watched: { ...eps(10, (i) => (i === 0 ? '2026-08-01T10:00:00.000Z' : i === 9 ? '2026-10-03T22:00:00.000Z' : `2026-08-${String(2 + i).padStart(2, '0')}T10:00:00.000Z`)), '1x2': { at: '2026-08-02T12:00:00.000Z', min: 40, n: 9 } }, rating: 4 });
  const f = F.finishFacts(s, new Set());
  assert.equal(f.episodes, 10); assert.equal(f.hours, Math.round(400 / 60)); assert.equal(f.rating, 4);
  assert.equal(f.startedDate, '2026-08-01'); assert.equal(f.finishedDate, '2026-10-04', '22:00Z on 3 Oct is 09:00 on 4 Oct in Hobart (daylight time starts 4 Oct)');
  assert.equal(f.days, 65); // 1 Aug .. 4 Oct inclusive = 31 + 30 + 4
});
t('start date / days are HIDDEN when this show was bulk-stamped; the finish date is still real', () => {
  const dump = show({ watched: eps(BATCH_MIN, () => '2019-03-05T10:00:30.000Z'), totalEpisodes: BATCH_MIN });
  const f = F.finishFacts(dump, F.bulkMinutes({ dump })); assert.equal(f.startedDate, ''); assert.equal(f.days, null); assert.equal(f.finishedDate, '2019-03-05');
  assert.deepEqual(F.finishStatCells(f).map((c) => c[1]), ['EPISODES', 'HOURS']); assert.equal(F.finishDatesLine(f), 'Finished 5 Mar 2019');
  const real = F.finishFacts(show(), new Set()); assert.deepEqual(F.finishStatCells(real).map((c) => c[1]), ['EPISODES', 'HOURS', 'DAYS']);
});
t('same-day finish: one day, "Finished …" only; singular labels', () => {
  const f = F.finishFacts(show({ totalEpisodes: 1, watched: eps(1, () => '2026-09-01T10:00:00.000Z', 60) }), new Set());
  assert.equal(f.days, 1); assert.deepEqual(F.finishStatCells(f), [['1', 'EPISODE'], ['1', 'HOUR'], ['1', 'DAY']]); assert.equal(F.finishDatesLine(f), 'Finished 1 Sep 2026');
  assert.match(F.finishShareLine(f), /^I just finished Suits on WatchNext: 1 episode, 1 hour\.$/);
});
t('dates line and share line wording', () => {
  const f = F.finishFacts(show({ rating: 5 }), new Set());
  assert.match(F.finishDatesLine(f), /^Started \d+ Aug 2026 · Finished \d+ Aug 2026$/); assert.match(F.finishShareLine(f), /I just finished Suits on WatchNext: 10 episodes, 7 hours\. Took 10 days\. ★★★★★$/);
  assert.equal(F.finishDatesLine({ ...f, finishedDate: '' }), '');
});
t('facts are safe with junk: missing times / dates / rating / runtime, and the show is not mutated', () => {
  const junk = { name: 'X', watched: { '1x1': { n: 1 }, '1x2': null, '1x3': { at: 'garbage', min: 'x' } }, rating: 'abc', runtimeMin: -5 };
  const copy = JSON.stringify(junk); const f = F.finishFacts(junk, undefined);
  assert.equal(f.episodes, 2); assert.equal(f.rating, 0); assert.equal(f.hours, Math.round(80 / 60)); assert.equal(JSON.stringify(junk), copy);
  const e = F.finishFacts(null, null); assert.deepEqual([e.name, e.episodes, e.hours, e.days], ['Untitled', 0, 0, null]);
  assert.equal(F.finishFacts({ name: 'R', watched: eps(2), rating: 9 }, new Set()).rating, 5);
});
t('file name: a safe slug, non-Latin letters kept, never empty', () => {
  assert.equal(F.finishFileName({ name: 'The Office (US)' }), 'watchnext-finished-the-office-us.png'); assert.equal(F.finishFileName({ name: '鋼の錬金術師' }), 'watchnext-finished-鋼の錬金術師.png');
  assert.equal(F.finishFileName({ name: '!!!' }), 'watchnext-finished-show.png'); assert.ok(F.finishFileName({ name: 'x'.repeat(200) }).length < 70);
});

// ---- title wrapping with a fake measure: 10px per character at size 100 (scaled), CJK twice as wide
const measureAt = (size, s) => Array.from(s).reduce((w, c) => w + (c.charCodeAt(0) > 0x2e80 ? 2 : 1) * 0.5 * size, 0);
const wrap = (text, o = {}) => F.wrapTitle(measureAt, text, { maxW: 952, ...o });
t('wrapTitle: a short name is one big line; a long one steps the size down; two lines max', () => {
  assert.deepEqual(wrap('Suits'), { size: 150, lines: ['Suits'] });
  const mid = wrap('The Marvelous Mrs Maisel'); assert.ok(mid.lines.length <= 2 && mid.size < 150, JSON.stringify(mid));
  for (const name of ['Brooklyn Nine-Nine', 'Avatar: The Last Airbender', 'It’s Always Sunny in Philadelphia']) { const r = wrap(name); assert.ok(r.lines.length <= 2); assert.ok(r.lines.every((l) => measureAt(r.size, l) <= 952), name); }
});
t('wrapTitle: a very long title gets the smallest size and an ellipsis; nothing is ever wider than the line', () => {
  const r = wrap('A very very long show title that just keeps going and going and going well past two lines of text at any size at all'); assert.equal(r.size, 68); assert.equal(r.lines.length, 2); assert.ok(r.lines[1].endsWith('…'));
  assert.ok(r.lines.every((l) => measureAt(r.size, l) <= 952));
});
t('wrapTitle: CJK / unbroken titles split by character; empty / null become "Untitled"; emoji not split', () => {
  const jp = wrap('鋼の錬金術師 FULLMETAL ALCHEMIST: BROTHERHOOD'); assert.ok(jp.lines.length <= 2 && jp.lines.every((l) => measureAt(jp.size, l) <= 952));
  const one = wrap('鋼'.repeat(40)); assert.ok(one.lines.length <= 2 && one.lines.every((l) => measureAt(one.size, l) <= 952), JSON.stringify(one));
  assert.deepEqual(wrap('').lines, ['Untitled']); assert.deepEqual(wrap(null).lines, ['Untitled']);
  const em = wrap('😀'.repeat(120)); assert.ok(em.lines.every((l) => !/[\ud800-\udbff]$/.test(l.replace('…', ''))));
});

// ---- layout
const plans = (name, f) => { const title = wrap(name); return F.planFinishImage(f, title); };
const fReal = F.finishFacts(show({ rating: 4 }), new Set()), fBulk = F.finishFacts(show({ watched: eps(BATCH_MIN, () => '2019-03-05T10:00:30.000Z'), totalEpisodes: BATCH_MIN }), F.bulkMinutes({ a: show({ watched: eps(BATCH_MIN, () => '2019-03-05T10:00:30.000Z') }) }));
const variants = { short: ['Suits', fReal], twoLines: ['The Marvelous Mrs Maisel', fReal], long: ['A very very long show title that just keeps going and going and going well past two lines of text at any size at all', fReal], noRating: ['Suits', { ...fReal, rating: 0 }], bulk: ['Suits', fBulk], noDates: ['Suits', { ...fReal, finishedDate: '', startedDate: '', days: null }], bare: ['Suits', { ...fBulk, rating: 0, finishedDate: '' }] };
for (const [k, [name, f]] of Object.entries(variants)) {
  t(`layout "${k}": everything stays above the footer, the poster never touches the stats column, caption on top`, () => {
    const p = plans(name, f);
    assert.ok(p.bottom < p.footerRule - 24, `${k}: bottom ${p.bottom} vs rule ${p.footerRule}`);
    assert.ok(p.poster.x + p.poster.w + 40 <= p.col.x); assert.ok(p.col.x + p.col.w <= Y.IMG_W - Y.IMG_PAD + 0.5);
    assert.ok(p.titleBases[0] > p.labelY && p.poster.y > p.titleBases[p.titleBases.length - 1], 'title sits between the caption and the poster');
    for (const s of p.stats) { assert.ok(s.valueY > p.poster.y && s.labelY < p.poster.y + p.poster.h + 400); }
    if (p.datesY != null) assert.ok(p.datesY > p.poster.y + p.poster.h && p.datesY < p.footerRule - 8);
    assert.equal(p.stats.length, f.days != null ? 3 : 2);
  });
}
t('layout: the poster grows into the free space (600..720 tall, always 2:3): bigger under a one-line title, never larger than 720', () => {
  const a = plans('Suits', fReal), b = plans('The Marvelous Mrs Maisel', fReal), c = plans('A very very long show title that just keeps going and going and going well past two lines of text at any size at all', fReal);
  for (const p of [a, b, c]) { assert.ok(p.poster.h >= F.FINISH_POSTER_H.min && p.poster.h <= F.FINISH_POSTER_H.max, String(p.poster.h)); assert.ok(Math.abs(p.poster.h / p.poster.w - 1.5) < 0.01); }
  assert.equal(a.poster.h, 720); assert.ok(a.poster.h >= b.poster.h);
  assert.ok(a.footerRule - a.bottom < 130, 'no big hole above the footer: ' + (a.footerRule - a.bottom));
  assert.ok(a.poster.y - a.titleBases[0] < 160, 'the poster sits close under a one-line title');
});
t('layout: stats spread down the poster (150..190px apart) and the stars sit below the last stat, inside the poster height', () => {
  const p = plans('Suits', fReal); const gaps = p.stats.slice(1).map((s, i) => s.valueY - p.stats[i].valueY);
  assert.ok(gaps.every((g) => g >= 150 && g <= 190), JSON.stringify(gaps)); assert.ok(p.starsY > p.stats[p.stats.length - 1].labelY && p.starsY < p.poster.y + p.poster.h);
});
console.log(`\n${n} tests passed`);
