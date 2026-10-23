import assert from 'node:assert/strict';
import { buildIcs, esc, fold, uidOf, epCode, fileName, plan, loadExported, rememberExported, EXPORTED_KEY } from '../../src/components/calendarExportLogic.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('ok  -', name); };
const ST = { id: 'tmdb:66732', name: 'Stranger Things', tmdbId: 66732 };
const SP = { id: 'tmdb:2190', name: 'South Park', tmdbId: 2190 };
const items = [
  { id: 'tmdb:66732', show: ST, s: 5, e: 1, name: 'Chapter One: The Crawl', date: '2026-11-26' },
  { id: 'tmdb:2190', show: SP, s: 29, e: 4, name: 'Episode 4', date: '2026-12-31' },
];
const NOW = new Date('2026-10-23T12:00:00.000Z');
const unfold = (txt) => txt.replace(/\r\n /g, '');

t('a valid calendar: CRLF lines, one all-day event per episode', () => {
  const ics = buildIcs(items, { now: NOW, siteUrl: 'https://aceasif.github.io/watchnext/' });
  assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n')); assert.ok(ics.endsWith('END:VCALENDAR\r\n'));
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 2);
  assert.ok(!/[^\r]\n/.test(ics), 'every line ends in CRLF');
  const u = unfold(ics);
  assert.match(u, /DTSTART;VALUE=DATE:20261126\r\nDTEND;VALUE=DATE:20261127/);
  assert.match(u, /DTSTART;VALUE=DATE:20261231\r\nDTEND;VALUE=DATE:20270101/, 'the end date rolls over the year');
  assert.match(u, /DTSTAMP:20261023T120000Z/);
  assert.match(u, /TRANSP:TRANSPARENT/);
});
t('the title is "Show · S05E01 · Episode name" (commas and semicolons escaped)', () => {
  const u = unfold(buildIcs(items, { now: NOW }));
  assert.match(u, /SUMMARY:Stranger Things · S05E01 · Chapter One: The Crawl\r\n/);
});
t('TMDB placeholder names ("Episode 4") are left out', () => {
  assert.match(unfold(buildIcs(items, { now: NOW })), /SUMMARY:South Park · S29E04\r\n/);
});
t('Spoiler shield: hidden episodes have no title anywhere in the file', () => {
  const u = unfold(buildIcs(items, { now: NOW, hide: (it) => it.s === 5 }));
  assert.match(u, /SUMMARY:Stranger Things · S05E01\r\n/); assert.doesNotMatch(u, /Crawl/);
});
t('each episode has the same UID every time (so calendars can update it)', () => {
  assert.equal(uidOf(items[0]), 'watchnext-66732-s5e1@watchnext');
  assert.match(buildIcs(items, { now: NOW }), /UID:watchnext-66732-s5e1@watchnext/);
});
t('escaping and folding follow the .ics rules', () => {
  assert.equal(esc('a,b;c\\d\ne'), 'a\\,b\\;c\\\\d\\ne');
  const long = 'SUMMARY:' + 'Ünïcödé '.repeat(20);
  const f = fold(long);
  for (const line of f.split('\r\n')) assert.ok(new TextEncoder().encode(line).length <= 75, line);
  assert.equal(f.replace(/\r\n /g, ''), long, 'unfolding gives the original line back');
  assert.equal(fold('short'), 'short');
});
t('helpers: code and file name', () => {
  assert.equal(epCode(5, 1), 'S05E01'); assert.equal(epCode(29, 104), 'S29E104');
  assert.equal(fileName('2026-10-24'), 'watchnext-episodes-2026-10-24.ics');
});
t('plan: offers only episodes not exported before; first and last dates', () => {
  const p = plan(items, [uidOf(items[0])]);
  assert.deepEqual(p.fresh.map((x) => x.e), [4]); assert.equal(p.first, '2026-11-26'); assert.equal(p.last, '2026-12-31');
  assert.equal(plan([], []).first, null);
});
t('exported ids are remembered on this device; a broken record counts as none', () => {
  const m = new Map(); const st = { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v) };
  assert.deepEqual(loadExported(st), []);
  const all = rememberExported(st, [], items);
  assert.equal(all.length, 2); assert.deepEqual(loadExported(st), all);
  assert.equal(rememberExported(st, all, items).length, 2, 'no duplicates');
  m.set(EXPORTED_KEY, '{oops'); assert.deepEqual(loadExported(st), []);
});
console.log(`\n${n} calendar export tests passed`);
