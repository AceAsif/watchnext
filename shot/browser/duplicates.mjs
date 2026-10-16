process.env.TZ = 'Australia/Hobart';
import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { workPath, browserFile, APP_DIST } from '../../tests/paths.mjs';
import { launchBrowser } from './launch.mjs';

// Settings → Duplicate movies: a read-only list of movies that appear more than once.
const DIST = APP_DIST; const OUT = workPath('out_dm'); fs.mkdirSync(OUT, { recursive: true });
const fontsCss = fs.readFileSync(browserFile('fonts.css'), 'utf8');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => { let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html'; const f = path.join(DIST, p); if (!f.startsWith(DIST) || !fs.existsSync(f)) { res.writeHead(404); return res.end('nf'); } res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res); });
await new Promise((r) => server.listen(4194, r));
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const FIXED = Date.parse('2026-10-01T22:00:00.000Z');
const P = (name) => ({ provider_name: name, logo_path: '/x.png' });


const mv = (name, id, d, o = {}) => ({ name, ...(id != null ? { tmdbId: id } : null), status: 'watched', watchedAt: `${d}T10:00:00.000Z`, runtimeMin: 100, poster: null, year: 2023, ...o });
const FILLER = Array.from({ length: 10 }, (_, i) => [mv('Filler ' + String.fromCharCode(65 + i), 100 + i, '2026-01-10'), mv('Filler ' + String.fromCharCode(65 + i), 100 + i, '2026-02-10')]).flat();
const MOVIES = [
  mv('Tiger 3', 1, '2026-07-07'), mv('Tiger 3', 1, '2026-03-19', { rating: 5 }),
  mv('Dhurandhar: The Revenge', 2, '2026-04-08'), mv('Dhurandhar: The Revenge', 2, '2026-03-16'),
  mv('Animal', 3, '2026-07-07', { rating: 4, note: 'Loud' }), mv('Animal', 3, '2026-07-07'),
  mv('Heat', 4, '2026-01-01'), mv('heat', null, '2026-02-02'),
  mv('Dune', 5, '2026-01-01', { year: 1984 }), mv('Dune', 6, '2026-02-01', { year: 2021 }),
  mv('Remake', 7, '2026-01-01'), mv('Remake', 8, '2026-02-01'), mv('Remake', null, '2026-03-01'),
  mv('Once Only', 9, '2026-05-05'),
  { tmdbId: 10, name: 'Planned Twice', status: 'planned' }, mv('Planned Twice', 10, '2026-06-06'),
  ...FILLER,
];
const STATE = (movies = MOVIES) => ({ shows: {}, movies, settings: { tmdbKey: 'TESTKEY' } });

const browser = await launchBrowser(puppeteer);
const problems = []; let checks = 0; const ok = async (n, f) => { await f(); checks++; console.log('  PASS', n); }; const wait = (ms = 350) => new Promise((r) => setTimeout(r, ms));
async function open(state, { w = 390, h = 844 } = {}) {
  const page = await browser.newPage(); await page.emulateTimezone('Australia/Hobart'); await page.setViewport({ width: w, height: h, deviceScaleFactor: 2 });
  page.on('pageerror', (e) => problems.push('pageerror: ' + e.message)); page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) problems.push('console.error: ' + m.text()); });
  await page.setBypassServiceWorker(true); await page.setRequestInterception(true);
  page.on('request', (r) => { const u = r.url(); if (u.startsWith('http://localhost:')) return r.continue(); if (u.includes('fonts.googleapis.com')) return r.respond({ status: 200, contentType: 'text/css', body: fontsCss }); if (u.includes('image.tmdb.org')) return r.respond({ status: 200, contentType: 'image/png', body: PNG }); if (u.includes('api.themoviedb.org')) return r.respond({ status: 200, contentType: 'application/json', body: '{"episodes":[],"results":[]}' }); return r.abort(); });
  await page.evaluateOnNewDocument((s) => { if (!sessionStorage.getItem('__s')) { localStorage.setItem('watchnext-state-v1', JSON.stringify(s)); sessionStorage.setItem('__s', '1'); } }, state);
  await page.goto('http://localhost:4194/', { waitUntil: 'networkidle0' }); await wait(500);
  await page.evaluate(() => [...document.querySelectorAll('nav.tabbar button')].find((x) => x.textContent.includes('Settings')).click()); await wait(500);
  return page;
}
const card = (p) => p.evaluate(() => { const c = [...document.querySelectorAll('section')].find((s) => /Duplicate movies/.test((s.querySelector('h2') || {}).textContent || '')); if (!c) return null; return { text: c.innerText.replace(/\s+/g, ' '), pill: (c.querySelector('.sd-pill') || {}).textContent, rows: [...c.querySelectorAll('[data-testid=dup-row]')].map((r) => ({ name: r.querySelector('.nm').textContent.replace(/\s+/g, ' ').trim(), tag: r.querySelector('.sd-dup-chip').textContent, copies: r.querySelector('.sd-dup-tag .mt').textContent, entries: [...r.querySelectorAll('.sd-dup-entries li')].map((l) => l.innerText.replace(/\s+/g, ' ').trim()) })), buttons: [...c.querySelectorAll('button')].map((b) => b.textContent.trim()) }; });

console.log('A. THE LIST');
let p = await open(STATE());
await ok('a "Duplicate movies" card appears after Clean up / before Backup, with a count pill', async () => {
  const c = await card(p); assert.ok(c); const order = await p.evaluate(() => [...document.querySelectorAll('.sd-setcard h2')].map((h) => h.textContent));
  assert.ok(order.indexOf('Duplicate movies') > order.indexOf('Import TV Time history') && order.indexOf('Duplicate movies') < order.indexOf('Backup'), order.join(' | '));
  assert.equal(c.pill, '14 titles'); // Tiger 3, Dhurandhar, Animal, Heat, 10 fillers; NOT Dune, Remake, Once, Planned
});
await ok('the intro counts titles and extra copies and says nothing is changed', async () => { const c = await card(p); assert.match(c.text, /14 movies appear more than once in your watched list \(14 extra copies\)\. Nothing is changed here/); });
await ok('same-day pairs come first; then A to Z', async () => { const c = await card(p); const nm = (r) => r.name.replace(/ \(\d{4}\)$/, ''); assert.equal(nm(c.rows[0]), 'Animal'); assert.equal(c.rows[0].tag, 'Same day'); assert.equal(nm(c.rows[1]), 'Dhurandhar: The Revenge'); });
await ok('only the first 8 show, with a button for the rest; it expands and collapses', async () => {
  let c = await card(p); assert.equal(c.rows.length, 8); assert.ok(c.buttons.includes('Show all 14'));
  await p.evaluate(() => [...document.querySelectorAll('section button')].find((b) => /Show all 14/.test(b.textContent)).click()); await wait(250);
  c = await card(p); assert.equal(c.rows.length, 14); assert.ok(c.buttons.includes('Show fewer'));
  await p.evaluate(() => [...document.querySelectorAll('section button')].find((b) => /Show fewer/.test(b.textContent)).click()); await wait(250);
  assert.equal((await card(p)).rows.length, 8);
  await p.evaluate(() => [...document.querySelectorAll('section button')].find((b) => /Show all 14/.test(b.textContent)).click()); await wait(250); // leave it open for the checks below
});
await ok('each row shows its copies oldest first with dates, rating and note markers', async () => {
  const c = await card(p); const by = Object.fromEntries(c.rows.map((r) => [r.name.replace(/ \(\d{4}\)$/, ''), r]));
  assert.deepEqual(by['Tiger 3'].entries, ['19 Mar 2026 ★ 5 oldest', '7 Jul 2026']); assert.equal(by['Tiger 3'].tag, 'Different days'); assert.equal(by['Tiger 3'].copies, '2 copies');
  assert.deepEqual(by['Dhurandhar: The Revenge'].entries, ['16 Mar 2026 oldest', '8 Apr 2026']);
  assert.deepEqual(by['Animal'].entries, ['7 Jul 2026 ★ 4 note oldest', '7 Jul 2026']);
});
await ok('a copy with no TMDB id is paired with the linked film of the same name and tagged', async () => {
  const c = await card(p); const heat = c.rows.find((r) => /^Heat/.test(r.name)); assert.equal(heat.tag, 'One not linked'); assert.deepEqual(heat.entries, ['1 Jan 2026 oldest', '2 Feb 2026 not linked']);
});
await ok('remakes with the same name (Dune 1984 / 2021, Remake x2 + one unlinked), a single film, and a watchlist copy are NOT listed', async () => {
  const c = await card(p); const all = c.text; for (const x of ['Dune', 'Remake', 'Once Only', 'Planned Twice']) assert.doesNotMatch(all, new RegExp(x));
});
await ok('the card explains how to remove a copy, and offers NO delete button of its own', async () => {
  const c = await card(p); assert.match(c.text, /Movies → find the title → tap the one to remove → Remove/); assert.ok(!c.buttons.some((b) => /delete|remove/i.test(b)), c.buttons.join(','));
});
await ok('looking at the list changes nothing: the library is exactly as seeded', async () => {
  const st = await p.evaluate(() => JSON.parse(localStorage.getItem('watchnext-state-v1'))); assert.equal(st.movies.length, MOVIES.length); assert.equal(JSON.stringify(st.movies.map((m) => [m.name, m.tmdbId, m.watchedAt])), JSON.stringify(MOVIES.map((m) => [m.name, m.tmdbId, m.watchedAt])));
});
await ok('phone: no sideways scroll', async () => { assert.equal(await p.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false); });
await p.evaluate(() => { const c = [...document.querySelectorAll('section')].find((s) => /Duplicate movies/.test(s.innerText)); c.scrollIntoView({ block: 'start' }); }); await wait(300);
await p.screenshot({ path: `${OUT}/duplicates_phone.png` });
await p.close();

console.log('B. NOTHING TO LIST');
p = await open(STATE([mv('A', 1, '2026-01-01'), mv('B', 2, '2026-01-01')]));
await ok('no duplicates: no card at all (nothing to clutter Settings)', async () => { assert.equal(await card(p), null); });
await p.close();
p = await open(STATE([]));
await ok('empty library: no card, no errors', async () => { assert.equal(await card(p), null); });
await p.close();
p = await open(STATE([mv('Only', 1, '2026-01-01'), mv('Only', 1, '2026-01-02')]));
await ok('one duplicate title reads in the singular: "1 title", "1 movie appears", "1 extra copy", no Show all button', async () => {
  const c = await card(p); assert.equal(c.pill, '1 title'); assert.match(c.text, /1 movie appears more than once.*\(1 extra copy\)/); assert.ok(!c.buttons.some((b) => /Show all/.test(b)));
});
await p.close();

console.log('C. DESKTOP');
p = await open(STATE(), { w: 1280, h: 900 });
await ok('desktop: no sideways scroll; the long title stays on one line', async () => { assert.equal(await p.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false); });
await p.evaluate(() => { const c = [...document.querySelectorAll('section')].find((s) => /Duplicate movies/.test(s.innerText)); c.scrollIntoView({ block: 'start' }); }); await wait(300);
await p.screenshot({ path: `${OUT}/duplicates_desktop.png` });
await p.close();

console.log(`\n${checks} checks passed`); console.log('PROBLEMS:', problems.length ? '\n' + problems.join('\n') : 'none'); await browser.close(); server.close();
