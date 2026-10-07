import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { workPath, browserFile, APP_DIST } from '../../tests/paths.mjs';
import { launchBrowser } from './launch.mjs';
import { pathToFileURL } from 'node:url';

const DIST = APP_DIST;
const OUT = workPath('out3');
fs.mkdirSync(OUT, { recursive: true });
const fontsCss = fs.readFileSync(browserFile('fonts.css'), 'utf8');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
  const f = path.join(DIST, p);
  if (!f.startsWith(DIST) || !fs.existsSync(f)) { res.writeHead(404); return res.end('nf'); }
  res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(4175, r));
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

// ---- "now" = Wed 30 Sep 2026, 07:30 in Hobart (UTC+10) = 29 Sep 21:30 UTC.
// UTC is still the 29th, which is exactly where the old toISOString() code went wrong.
const FIXED_ISO = '2026-09-29T21:30:00.000Z';

const W = (s, from, to, at = '2026-08-01T10:00:00.000Z') => Object.fromEntries(Array.from({ length: to - from + 1 }, (_, i) => [`${s}x${from + i}`, { at, min: 40, n: 1 }]));
const merge = (...o) => Object.assign({}, ...o);
const base = { followed: true, poster: null, status: 'Returning Series', providers: [], lastSynced: '2026-09-01T00:00:00Z', runtimeMin: 40, genres: [] };
const up = (list) => list.map(([s, e, name, air]) => ({ s, e, name, air }));
const nx = (s, e, date, name = '') => ({ season: s, episode: e, date, name });

const SHOWS = {
  // ---- continue watching (most-recently-watched first by `at`)
  'tmdb:3': { ...base, name: 'Suits', tmdbId: 3, totalEpisodes: 26, seasons: [{ n: 8, count: 16 }, { n: 9, count: 10 }], watched: W(8, 1, 13, '2026-09-29T08:00:00.000Z') },
  'tmdb:2': { ...base, name: 'Emily in Paris', tmdbId: 2, totalEpisodes: 20, seasons: [{ n: 5, count: 10 }, { n: 6, count: 10 }],
    watched: merge(W(5, 1, 5, '2026-07-01T10:00:00.000Z'), { '5x6': { at: '2026-09-24T20:00:00.000Z', min: 40, n: 1 }, '5x7': { at: '2026-09-25T20:00:00.000Z', min: 40, n: 1 }, '5x8': { at: '2026-09-26T20:00:00.000Z', min: 40, n: 1 }, '5x9': { at: '2026-09-27T20:00:00.000Z', min: 40, n: 1 }, '5x10': { at: '2026-09-28T20:00:00.000Z', min: 40, n: 1 } }) },
  'tmdb:4': { ...base, name: 'Chainsaw Man', tmdbId: 4, runtimeMin: 24, totalEpisodes: 12, seasons: [{ n: 1, count: 12 }], watched: W(1, 1, 2, '2026-09-27T10:00:00.000Z') },
  'tmdb:5': { ...base, name: 'Only Murders in the Building', tmdbId: 5, totalEpisodes: 11, seasons: [{ n: 5, count: 10 }, { n: 6, count: 1 }], watched: W(5, 1, 10, '2026-09-26T10:00:00.000Z') },
  'tmdb:6': { ...base, name: 'Severance', tmdbId: 6, totalEpisodes: 9, seasons: [{ n: 1, count: 9 }], watched: W(1, 1, 3, '2026-09-20T10:00:00.000Z') },
  'tmdb:7': { ...base, name: 'The Bear', tmdbId: 7, totalEpisodes: 8, seasons: [{ n: 1, count: 8 }], watched: W(1, 1, 3, '2026-09-19T10:00:00.000Z') },
  'tmdb:8': { ...base, name: 'Arcane', tmdbId: 8, totalEpisodes: 9, seasons: [{ n: 1, count: 9 }], watched: W(1, 1, 3, '2026-09-18T10:00:00.000Z') },
  // mid-season: E4 HAS aired and is unwatched (E5 airs 7 Oct) -> offered E04, never E05
  'tmdb:18': { ...base, name: 'Behind On Airing', tmdbId: 18, totalEpisodes: 8, seasons: [{ n: 1, count: 8 }], watched: W(1, 1, 3, '2026-09-17T10:00:00.000Z'),
    nextAir: nx(1, 5, '2026-10-07', 'Five'), upcoming: up([[1, 5, 'Five', '2026-10-07']]) },
  // no season data yet -> kept in the list, but nothing to mark
  'tmdb:20': { ...base, name: 'Not Synced Yet', tmdbId: null, totalEpisodes: null, seasons: [], watched: W(1, 1, 5, '2026-09-16T10:00:00.000Z') },
  // CAUGHT UP mid-season: next episode (E5) is unaired -> NOT in continue, but IS in the agenda
  'tmdb:17': { ...base, name: 'Caught Up Airing', tmdbId: 17, totalEpisodes: 8, seasons: [{ n: 1, count: 8 }], watched: W(1, 1, 4, '2026-09-29T20:00:00.000Z'),
    nextAir: nx(1, 5, '2026-10-07', 'Five'), upcoming: up([[1, 5, 'Five', '2026-10-07'], [1, 6, 'Six', '2026-10-14']]) },
  // ---- upcoming-only shows (nothing watched => not in continue)
  'tmdb:10': { ...base, name: 'Re: ZERO, Starting Life in Another World', tmdbId: 10, watched: {}, nextAir: nx(1, 85, '2026-09-30', 'Episode 85'), upcoming: up([[1, 85, 'Episode 85', '2026-09-30']]) },
  'tmdb:11': { ...base, name: 'South Park', tmdbId: 11, watched: {}, nextAir: nx(29, 2, '2026-09-30', 'Billionaire Weenietown'), upcoming: up([[29, 2, 'Billionaire Weenietown', '2026-09-30']]) },
  'tmdb:12': { ...base, name: 'JoJo’s Bizarre Adventure', tmdbId: 12, watched: {}, nextAir: nx(6, 3, '2026-10-02', 'Episode 3'), upcoming: up([[6, 3, 'Episode 3', '2026-10-02'], [6, 4, 'Episode 4', '2026-10-09']]) },
  'tmdb:13': { ...base, name: 'The Simpsons', tmdbId: 13, watched: {}, nextAir: nx(38, 2, '2026-10-04', 'Diary of a Chimpy Kid'), upcoming: up([[38, 2, 'Diary of a Chimpy Kid', '2026-10-04']]) },
  'tmdb:14': { ...base, name: 'Phineas and Ferb', tmdbId: 14, watched: {}, nextAir: nx(5, 39, '2026-10-06', 'Night of the Living Candace'), upcoming: up([[5, 39, 'Night of the Living Candace', '2026-10-06'], [5, 40, 'Terrors of the AltSpace', '2026-10-06']]) },
  'tmdb:15': { ...base, name: 'The Late Show', tmdbId: 15, watched: {}, nextAir: nx(1, 1, '2026-11-05', 'Pilot'), upcoming: up([[1, 1, 'Pilot', '2026-11-05']]) },
  'tmdb:16': { ...base, name: 'Future Show', tmdbId: 16, watched: {}, nextAir: nx(1, 1, '2027-01-12', 'Premiere'), upcoming: up([[1, 1, 'Premiere', '2027-01-12']]) },
  // unfollowed: must appear nowhere
  'tmdb:19': { ...base, name: 'Unfollowed Ghost', followed: false, tmdbId: 19, totalEpisodes: 5, seasons: [{ n: 1, count: 5 }], watched: W(1, 1, 2, '2026-09-29T09:00:00.000Z'), nextAir: nx(1, 3, '2026-10-03'), upcoming: up([[1, 3, 'Ghost', '2026-10-03']]) },
};
const CONT_EXPECTED = ['Suits', 'Emily in Paris', 'Chainsaw Man', 'Only Murders in the Building', 'Severance', 'The Bear', 'Arcane', 'Behind On Airing', 'Not Synced Yet'];
const AGENDA_COUNT = 12; // 1+1+2+1+2+1+1 (+ Caught Up 2 + Behind 1 = 12 total across all)

let seasonCalls = [];
const seed = (key = true, empty = false) => ({ shows: empty ? {} : SHOWS, movies: [], settings: { tmdbKey: key ? 'TESTKEY' : '' } });

const browser = await launchBrowser(puppeteer);
const problems = [];
const wait = (ms = 400) => new Promise((r) => setTimeout(r, ms));

async function open({ key = true, empty = false, w = 390, h = 844 } = {}) {
  const page = await browser.newPage();
  await page.emulateTimezone('Australia/Hobart');
  await page.setViewport({ width: w, height: h, deviceScaleFactor: 2 });
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) problems.push(`console.error: ${m.text()}`); });
  await page.setRequestInterception(true);
  page.on('request', (r) => {
    const u = r.url();
    if (u.startsWith('http://localhost:4175')) return r.continue();
    if (u.includes('fonts.googleapis.com')) return r.respond({ status: 200, contentType: 'text/css', body: fontsCss });
    if (u.includes('image.tmdb.org')) return r.respond({ status: 200, contentType: 'image/png', body: PNG });
    if (u.includes('api.themoviedb.org')) {
      const p = new URL(u).pathname.replace('/3', ''); let m; let body = { episodes: [], results: [] };
      if ((m = p.match(/^\/tv\/(\d+)\/season\/(\d+)$/))) {
        seasonCalls.push(+m[1]);
        const id = +m[1]; const sh = SHOWS[`tmdb:${id}`];
        const eps = id === 17
          ? [[1, 5, 'Five', '2026-10-07'], [1, 6, 'Six', '2026-10-14'], [1, 7, 'Seven', '2026-10-21']]
          : (sh && sh.upcoming ? sh.upcoming.map((x) => [x.s, x.e, x.name, x.air]) : []);
        body = { episodes: eps.map(([s, e, name, air]) => ({ id: s * 1000 + e, season_number: s, episode_number: e, name, air_date: air, runtime: 40 })) };
      }
      return r.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    }
    return r.abort();
  });
  await page.evaluateOnNewDocument((s, fixed) => {
    if (!sessionStorage.getItem('__seeded')) { localStorage.setItem('watchnext-state-v1', JSON.stringify(s)); sessionStorage.setItem('__seeded', '1'); }
    const RealDate = Date; const start = RealDate.now(); const base = RealDate.parse(fixed);
    class FakeDate extends RealDate {
      constructor(...a) { if (a.length === 0) super(base + (RealDate.now() - start)); else super(...a); }
      static now() { return base + (RealDate.now() - start); }
    }
    window.Date = FakeDate;
  }, seed(key, empty), FIXED_ISO);
  await page.goto('http://localhost:4175/', { waitUntil: 'networkidle0' });
  await wait(600);
  return page;
}
const OUTSHOT = async (p, name, full = false) => { await p.screenshot({ path: `${OUT}/${name}.png`, fullPage: full }); console.log('  shot', name); };
const text = (p) => p.evaluate(() => document.body.innerText);
const stored = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('watchnext-state-v1')).shows);
const click = (p, label, sel = 'button, a') => p.evaluate((t, s) => { const el = [...document.querySelectorAll(s)].find((e) => (e.getAttribute('aria-label') || e.textContent).trim().includes(t)); if (!el) throw new Error('no element: ' + t); el.click(); }, label, sel);
let checks = 0; const ok = (name, fn) => { fn(); checks++; console.log('  PASS', name); };

// ============================================================ 1. the page
console.log('1. page, pinned to Wed 30 Sep 07:30 Hobart (UTC is still 29 Sep)');
let p = await open();
let t = await text(p);
ok('header shows the LOCAL date WED 30 SEP (UTC shortcut would say TUE 29 SEP)', () => { assert.match(t, /UP NEXT|Up Next/); assert.match(t, /WED 30 SEP/); assert.doesNotMatch(t, /TUE 29 SEP/); });
ok(`continue list count = ${CONT_EXPECTED.length}`, () => assert.match(t, new RegExp(`CONTINUE WATCHING · ${CONT_EXPECTED.length}\\b`, 'i')));
const rows = await p.evaluate(() => [...document.querySelectorAll('.sd-markbtn, .sd-open')].length);
const names1 = await p.evaluate(() => [...document.querySelectorAll('section')][0].innerText);
ok('only the first 4 continue rows show before "See all", in last-watched order', () => {
  for (const n of CONT_EXPECTED.slice(0, 4)) assert.ok(names1.includes(n), n);
  for (const n of CONT_EXPECTED.slice(4)) assert.ok(!names1.includes(n), 'should be hidden: ' + n);
});
ok('Suits row: next S08·E14, 13 to go, ~9 h', () => { assert.match(names1, /S08·E14 · 13 to go · ~9 h/); });
ok('Emily row: S06·E01, 10 to go, ~7 h, with a pace-based finish estimate', () => { assert.match(names1, /S06·E01 · 10 to go · ~7 h/); assert.match(names1, /≈ done by \d+ \w+ at your pace/); });
ok('Chainsaw Man: no pace yet, so it says Last watched S01·E02', () => assert.match(names1, /Chainsaw Man[\s\S]*Last watched S01·E02/));
ok('Only Murders: 1 to go', () => assert.match(names1, /S06·E01 · 1 to go · ~1 h/));
ok('unfollowed show appears nowhere on the page', () => assert.doesNotMatch(t, /Unfollowed Ghost/));
ok('CAUGHT-UP airing show is NOT offered under Continue watching', () => { assert.ok(!names1.includes('Caught Up Airing')); });
await OUTSHOT(p, '01_top');

// ---- See all
await click(p, 'See all'); await wait(300);
const allText = await p.evaluate(() => [...document.querySelectorAll('section')][0].innerText);
ok('See all reveals every continue row', () => { for (const n of CONT_EXPECTED) assert.ok(allText.includes(n), n); });
ok('mid-season show with an AIRED unwatched ep is offered E04 — never the unaired E05', () => { assert.match(allText, /Behind On Airing[\s\S]{0,40}S01·E04/); assert.doesNotMatch(allText, /Behind On Airing[\s\S]{0,60}S01·E05/); });
const nosea = await p.evaluate(() => { const row = [...document.querySelectorAll('section')][0]; const open = [...row.querySelectorAll('.sd-open')].find((b) => b.innerText.includes('Not Synced Yet')); const wrap = open.parentElement; return { hasMark: !!wrap.querySelector('.sd-markbtn'), text: open.innerText }; });
assert.equal(nosea.hasMark, false); assert.match(nosea.text, /Last watched S01·E05/); checks++; console.log('  PASS not-synced show: listed, "Last watched S01·E05", no mark button');
await OUTSHOT(p, '02_see_all', true);
await click(p, 'Show less'); await wait(200);

// ---- mark flow + undo
const before = await stored(p);
await click(p, 'Mark Suits S08·E14 watched'); await wait(400);
let s1 = await stored(p);
ok('marking writes exactly one episode: Suits 8x14', () => { assert.ok(s1['tmdb:3'].watched['8x14']); assert.equal(Object.keys(s1['tmdb:3'].watched).length, Object.keys(before['tmdb:3'].watched).length + 1); });
t = await text(p);
ok('undo toast appears with the code and show name', () => assert.match(t, /S08·E14\s*marked watched · Suits/));
ok('Suits row advanced to S08·E15 (12 to go)', () => assert.match(t, /S08·E15 · 12 to go/));
await OUTSHOT(p, '03_after_mark_toast');
await click(p, 'Undo'); await wait(300);
s1 = await stored(p);
ok('UNDO removes exactly that episode and restores the row', () => { assert.equal(s1['tmdb:3'].watched['8x14'], undefined); assert.deepEqual(s1['tmdb:3'].watched, before['tmdb:3'].watched); });
assert.doesNotMatch(await text(p), /marked watched/); checks++; console.log('  PASS toast gone after Undo');
assert.match(await text(p), /S08·E14 · 13 to go/); checks++; console.log('  PASS row back to S08·E14 · 13 to go');

// ---- DOUBLE-TAP guard: two fast taps must mark ONE episode
await p.evaluate(() => { const b = document.querySelector('button[aria-label="Mark Suits S08·E14 watched"]'); b.click(); b.click(); });
await wait(300);
s1 = await stored(p);
ok('DOUBLE TAP: two rapid taps marked only ONE episode (8x14), not two', () => { assert.ok(s1['tmdb:3'].watched['8x14']); assert.equal(s1['tmdb:3'].watched['8x15'], undefined); });
await click(p, 'Undo'); await wait(200);
// a deliberate second tap after the cooldown DOES mark the next one
await click(p, 'Mark Suits S08·E14 watched'); await wait(900);
await click(p, 'Mark Suits S08·E15 watched'); await wait(300);
s1 = await stored(p);
ok('a deliberate second tap after the cooldown marks the next episode (binge-marking still works)', () => { assert.ok(s1['tmdb:3'].watched['8x14'] && s1['tmdb:3'].watched['8x15']); });
await wait(100);

// ---- finishing a show removes it; Undo brings it back
await click(p, 'Mark Only Murders in the Building S06·E01 watched'); await wait(400);
let top = await p.evaluate(() => [...document.querySelectorAll('section')][0].innerText);
ok('marking the FINAL episode removes the show from Continue watching', () => assert.ok(!top.includes('Only Murders in the Building')));
await click(p, 'Undo'); await wait(300);
top = await p.evaluate(() => [...document.querySelectorAll('section')][0].innerText);
ok('…and Undo brings it straight back', () => assert.ok(top.includes('Only Murders in the Building')));
assert.equal((await stored(p))['tmdb:5'].watched['6x1'], undefined); checks++; console.log('  PASS store: 6x1 not watched after undo');

// ============================================================ 2. On the way
console.log('2. on the way (agenda)');
await p.evaluate(() => window.scrollTo(0, 0));
t = await text(p);
const otw = await p.evaluate(() => { const secs = [...document.querySelectorAll('section')]; return secs[secs.length - 1].innerText; });
ok(`ON THE WAY · ${AGENDA_COUNT}`, () => assert.match(t, new RegExp(`ON THE WAY · ${AGENDA_COUNT}\\b`, 'i')));
ok('today (WED 30) is labelled TODAY and lists both of today\'s episodes', () => { assert.match(otw, /WED\s*30\s*TODAY/i); assert.match(otw, /Re: ZERO[\s\S]*S01·E85/); assert.match(otw, /South Park[\s\S]*S29·E02/); });
ok('relative labels +2 D / +4 D / +6 D', () => { for (const r of ['+2 D', '+4 D', '+6 D', '+9 D']) assert.ok(otw.includes(r), r); });
ok('month dividers: OCTOBER, NOVEMBER, JANUARY 2027', () => { assert.match(otw, /OCTOBER/); assert.match(otw, /NOVEMBER/); assert.match(otw, /JANUARY 2027/); });
ok('caught-up airing show appears HERE, with its dates', () => { assert.match(otw, /Caught Up Airing[\s\S]*S01·E05/); });
const todayCard = await p.evaluate(() => { const c = [...document.querySelectorAll('.sd-card')].find((x) => x.innerText.includes('South Park')); return getComputedStyle(c).borderTopColor; });
ok('today\'s card has the amber border', () => assert.match(todayCard, /rgba\(242, 163, 60, 0\.4\)|rgb\(242, 163, 60\)/));
await OUTSHOT(p, '04_agenda_full', true);

// tap an agenda row -> show page
await click(p, 'South Park', '.sd-card .sd-open'); await wait(700);
assert.ok(await p.evaluate(() => !!document.querySelector('.sd-page h1') && document.querySelector('.sd-page h1').innerText.includes('South Park'))); checks++; console.log('  PASS opened South Park');
await p.close();

// ============================================================ 3. refresh + calendar
console.log('3. refresh and calendar');
p = await open(); seasonCalls = [];
const syncN = Object.values(SHOWS).filter((s) => s.followed && s.tmdbId && s.nextAir).length;
await p.evaluate(() => { window.__sawSpin = false; new MutationObserver(() => { if (document.querySelector('.sd-spin')) window.__sawSpin = true; }).observe(document.body, { subtree: true, childList: true, attributes: true }); });
await click(p, 'Refresh upcoming'); await wait(1500);
ok(`refresh made one season request per airing show (${syncN})`, () => assert.equal(seasonCalls.length, syncN));
assert.equal(await p.evaluate(() => window.__sawSpin), true); checks++; console.log('  PASS spinner shown during refresh');
t = await text(p);
ok('refresh pulled the full list for the airing show (now E05, E06 and E07)', () => assert.match(t, /Caught Up Airing[\s\S]*S01·E07/));
ok('count updated (12 -> 13)', () => assert.match(t, /ON THE WAY · 13\b/));
assert.equal(await p.evaluate(() => document.querySelector('button[aria-label="Refresh upcoming"]').disabled), false); checks++; console.log('  PASS refresh re-enabled');

await click(p, 'Calendar'); await wait(500);
t = await text(p);
ok('calendar view shows the month of the first upcoming episode', () => assert.match(t, /September 2026/));
const cal = await p.evaluate(() => {
  const cells = [...document.querySelectorAll('section button')].filter((b) => /^\d+\s*\d*$/.test(b.innerText.trim().split('\n')[0]) && b.style.minHeight === '48px');
  const hit = (d) => { const c = cells.find((b) => b.innerText.trim().split('\n')[0] === String(d) && b.style.opacity !== '0.32'); return c ? getComputedStyle(c.querySelector('span')).color : null; };
  return { d29: hit(29), d30: hit(30) };
});
ok('calendar highlights LOCAL today (30) in amber — and not the UTC day (29)', () => { assert.equal(cal.d30, 'rgb(242, 163, 60)'); assert.notEqual(cal.d29, 'rgb(242, 163, 60)'); });
const calRows = await p.evaluate(() => document.querySelectorAll('.sd-card .sd-open').length);
ok('calendar selected-day list uses the same episode rows as the agenda', () => assert.ok(calRows >= 1));
const navSize = await p.evaluate(() => { const b = document.querySelector('button[aria-label="Next month"]').getBoundingClientRect(); return [Math.round(b.width), Math.round(b.height)]; });
ok('calendar month buttons are 44x44', () => assert.deepEqual(navSize, [44, 44]));
await OUTSHOT(p, '05_calendar');
await click(p, 'List'); await wait(300);
assert.match(await text(p), /Caught Up Airing[\s\S]*S01·E05/); checks++; console.log('  PASS back to list');
const sizes = await p.evaluate(() => ({ mark: (() => { const b = document.querySelector('.sd-markbtn').getBoundingClientRect(); return [Math.round(b.width), Math.round(b.height)]; })(), ib: (() => { const b = document.querySelector('.sd-ib').getBoundingClientRect(); return [Math.round(b.width), Math.round(b.height)]; })() }));
ok('mark circle and refresh button are 44x44 touch targets', () => { assert.deepEqual(sizes.mark, [44, 44]); assert.deepEqual(sizes.ib, [44, 44]); });
await p.close();

// ============================================================ 4. empty + no key
console.log('4. empty states');
p = await open({ empty: true });
t = await text(p);
ok('empty library: Welcome notice, no sections', () => { assert.match(t, /Welcome to WatchNext/); assert.doesNotMatch(t, /CONTINUE WATCHING/i); assert.doesNotMatch(t, /ON THE WAY/i); });
await OUTSHOT(p, '06_empty'); await p.close();
p = await open({ key: false });
t = await text(p); assert.match(t, /Add a free TMDB API key/); checks++; console.log('  PASS key prompt');
assert.equal(await p.evaluate(() => document.querySelector('button[aria-label="Refresh upcoming"]').disabled), true); checks++; console.log('  PASS refresh disabled without a key');
await p.close();

// ============================================================ 5. desktop
p = await open({ w: 1280, h: 900 }); await OUTSHOT(p, '07_desktop'); await p.close();

// ============================================================ design reference
p = await browser.newPage(); await p.setViewport({ width: 390, height: 1420, deviceScaleFactor: 2 });
await p.goto(pathToFileURL(workPath('design', 'upnext.html')).href, { waitUntil: 'networkidle0' }); await wait(1500);
await p.screenshot({ path: `${OUT}/00_DESIGN_upnext.png` }); await p.close();

await browser.close(); server.close();
console.log(`\n${checks} checks passed`);
console.log('PROBLEMS:', problems.length ? '\n' + problems.join('\n') : 'none');
