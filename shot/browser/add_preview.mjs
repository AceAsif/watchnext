process.env.TZ = 'Australia/Hobart';
import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { workPath, browserFile, APP_DIST } from '../../tests/paths.mjs';
import { launchBrowser } from './launch.mjs';

// Add a movie / Add a show: tap a result's poster or name to read about it BEFORE adding it — description,
// scores, where to watch, cast — with the add buttons in the sheet. Nothing is added by reading. TMDB mocked.
const PORT = 4259;
const DIST = APP_DIST; const OUT = workPath('out_add_preview');
const fontsCss = fs.readFileSync(browserFile('fonts.css'), 'utf8');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => { let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html'; const f = path.join(DIST, p); if (!f.startsWith(DIST) || !fs.existsSync(f)) { res.writeHead(404); return res.end('nf'); } res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res); });
await new Promise((r) => server.listen(PORT, r));
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const CORS = { 'access-control-allow-origin': '*' };
const FIXED = Date.parse('2026-10-27T07:00:00.000Z'); // 6pm 27 Oct 2026, Hobart

const STATE = () => ({ shows: {}, movies: [], settings: { tmdbKey: 'TESTKEY' } });
const MOVIE = { id: 900, title: 'Bad Apples', tagline: 'Some lessons bite back.', overview: 'A teacher takes matters into her own hands.', runtime: 100, release_date: '2026-03-01', vote_average: 6.4, poster_path: null,
  genres: [{ id: 27, name: 'Horror' }], credits: { cast: [{ id: 1, name: 'Saoirse Ronan', character: 'Maria', profile_path: null }], crew: [] },
  'watch/providers': { results: { AU: { link: 'https://www.themoviedb.org/movie/900/watch?locale=AU', flatrate: [{ provider_name: 'Netflix' }] } } } };
const TV = { id: 80, name: 'Bad Apples', overview: 'A Finnish crime drama about a village.', first_air_date: '2021-02-01', last_air_date: '2023-04-01', status: 'Ended', number_of_seasons: 2, number_of_episodes: 12, episode_run_time: [50],
  genres: [{ id: 80, name: 'Crime' }], seasons: [{ season_number: 1, episode_count: 6, air_date: '2021-02-01' }, { season_number: 2, episode_count: 6, air_date: '2023-03-01' }], poster_path: null,
  created_by: [], aggregate_credits: { cast: [{ id: 5, name: 'Finnish Lead', profile_path: null, roles: [{ character: 'Detective', episode_count: 12 }] }], crew: [] },
  'watch/providers': { results: { AU: { link: 'https://www.themoviedb.org/tv/80/watch?locale=AU', free: [{ provider_name: 'SBS On Demand' }] } } } };
const browser = await launchBrowser(puppeteer);
const problems = []; let checks = 0; const ok = async (n, f) => { await f(); checks++; console.log('  PASS', n); }; const wait = (ms = 350) => new Promise((r) => setTimeout(r, ms));
const until = async (page, fn, ms = 6000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await page.evaluate(fn)) return true; await wait(100); } throw new Error('timed out waiting for ' + fn.toString().slice(0, 90)); };
let log = [];
const page = await browser.newPage(); const p = page;
await page.emulateTimezone('Australia/Hobart'); await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
page.on('pageerror', (e) => problems.push('pageerror: ' + e.message)); page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) problems.push('console.error: ' + m.text()); });
await page.setBypassServiceWorker(true); await page.setRequestInterception(true);
page.on('request', (r) => {
  const u = r.url();
  if (u.startsWith('http://localhost:')) return r.continue();
  if (u.includes('fonts.googleapis.com')) return r.respond({ status: 200, contentType: 'text/css', body: fontsCss });
  if (u.includes('image.tmdb.org')) return r.respond({ status: 200, contentType: 'image/png', body: PNG });
  const j = (b) => r.respond({ status: 200, headers: CORS, contentType: 'application/json', body: JSON.stringify(b) });
  const url = new URL(u);
  if (url.hostname === 'api.themoviedb.org') {
    const ap = url.searchParams.get('append_to_response');
    log.push(url.pathname + (ap ? '?' + ap : ''));
    if (url.pathname === '/3/search/movie') return j({ results: [{ id: 900, title: 'Bad Apples', release_date: '2026-03-01', poster_path: null, popularity: 50, overview: 'A teacher takes matters into her own hands.' }] });
    if (url.pathname === '/3/search/tv') return j({ results: [{ id: 80, name: 'Bad Apples', first_air_date: '2021-02-01', poster_path: null, popularity: 20 }] });
    if (url.pathname === '/3/movie/900') return j(MOVIE);
    if (url.pathname === '/3/tv/80') return j(TV);
    if (url.pathname === '/3/tv/80/videos') return j({ results: [{ site: 'YouTube', type: 'Trailer', official: true, key: 'FINNISH1' }] });
    if (url.pathname === '/3/tv/80/season/1' || url.pathname === '/3/tv/80/season/2') return j({ episodes: [] });
    return j({ results: [], episodes: [], cast: [], crew: [] });
  }
  return r.abort();
});
await page.evaluateOnNewDocument((s, fixed) => {
  if (!sessionStorage.getItem('__s')) { localStorage.setItem('watchnext-state-v1', JSON.stringify(s)); localStorage.setItem('watchnext-badges-seen-v1', JSON.stringify({ v: 1, levels: {} })); sessionStorage.setItem('__s', '1'); }
  const RealDate = Date; const start = RealDate.now(); const b = fixed;
  class FakeDate extends RealDate { constructor(...a) { if (a.length === 0) super(b + (RealDate.now() - start)); else super(...a); } static now() { return b + (RealDate.now() - start); } }
  window.Date = FakeDate;
  // record where the trailer tab is sent
  window.__opened = []; window.open = () => { const w = { closed: false, close() { this.closed = true; }, set location(v) { window.__opened.push(String(v)); } }; return w; };
}, STATE(), FIXED);
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle0' }); await wait(400);
const tab = async (name) => { await p.evaluate((t) => [...document.querySelectorAll('nav.tabbar button')].find((x) => x.textContent.includes(t)).click(), name); await wait(400); };
const stored = () => p.evaluate(() => JSON.parse(localStorage.getItem('watchnext-state-v1')));
const sheetText = () => p.evaluate(() => { const s = document.querySelector('.sd-sheet'); return s ? s.innerText.replace(/\s+/g, ' ') : ''; });
const openMovie = async (name) => { await p.evaluate((n) => [...document.querySelectorAll('[data-testid=wl-movie] .sd-open')].find((b) => b.textContent.includes(n)).click(), name); await wait(300); };


const sheetBtn = (re) => p.evaluate((src) => { const b = [...document.querySelectorAll('.sd-sheet .sd-minfo-acts button')].find((x) => new RegExp(src).test(x.textContent)); if (!b) throw new Error('no sheet button ' + src); b.click(); }, re);
const sheetBtns = () => p.evaluate(() => [...document.querySelectorAll('.sd-sheet .sd-minfo-acts button')].map((b) => b.textContent.trim()));
const rowOf = (type) => p.evaluate((t) => [...document.querySelectorAll('[data-testid=search-result]')].findIndex((r) => r.querySelector('.detail').textContent.includes(t)), type);

const rowsText = () => p.evaluate(() => [...document.querySelectorAll('.sd-res')].map((r) => r.innerText.replace(/\s+/g, ' ')));
const dialogOpen = () => p.evaluate(() => !!document.querySelector('.sd-sheet--add'));
const infoText = () => p.evaluate(() => { const s = [...document.querySelectorAll('.sd-sheet')].find((x) => x.querySelector('[data-testid=add-info]')); return s ? s.innerText.replace(/\s+/g, ' ') : ''; });
const infoBtns = () => p.evaluate(() => [...document.querySelectorAll('.sd-minfo-acts button')].map((b) => b.textContent.replace(/\s+/g, ' ').trim()));
const infoBtn = (re) => p.evaluate((src) => { const b = [...document.querySelectorAll('.sd-minfo-acts button')].find((x) => new RegExp(src).test(x.textContent)); if (!b) throw new Error('no button ' + src); b.click(); }, re);

console.log('A. ADD A MOVIE: READ ABOUT IT FIRST');
await tab('Movies');
await p.evaluate(() => document.querySelector('button[aria-label="Add a movie from TMDB"]').click()); await wait(400);
await p.type('input[aria-label="Search TMDB for a movie"]', 'Bad apples'); await p.keyboard.press('Enter');
await until(p, () => document.querySelectorAll('.sd-res').length === 1);
await ok('the result shows its name with a › so it looks tappable, and the add buttons', async () => {
  const t = (await rowsText())[0]; assert.match(t, /Bad Apples ›/); assert.match(t, /Watched it/); assert.match(t, /Add to watchlist/);
});
log = [];
await p.evaluate(() => document.querySelector('[data-testid=res-open]').click());
await until(p, () => !!document.querySelector('[data-testid=title-overview]'));
await ok('tapping the name opens the info sheet: "2026 · Movie · Not in your library", runtime, genre', async () => {
  const t = await infoText(); assert.match(t, /2026 · Movie · Not in your library/); assert.match(t, /100 min/); assert.match(t, /Horror/);
});
await ok('description, tagline, where to watch (Netflix) and cast show before anything is added', async () => {
  const t = await infoText(); assert.match(t, /A teacher takes matters into her own hands\./); assert.match(t, /Some lessons bite back\./); assert.match(t, /Netflix/); assert.match(t, /Saoirse Ronan/);
  assert.equal((await stored()).movies.length, 0, 'reading adds nothing');
});
await ok('the sheet has "Watched it" and "Add to watchlist"', async () => { const b = (await infoBtns()).join('|'); assert.match(b, /Watched it/); assert.match(b, /Add to watchlist/); });
await ok('phone: no sideways scroll in the sheet', async () => { assert.ok(await p.evaluate(() => { const s = [...document.querySelectorAll('.sd-sheet')].pop(); return s.scrollWidth <= s.clientWidth; })); });
await p.screenshot({ path: path.join(OUT, 'add_movie_info_phone.png') });
await p.keyboard.press('Escape'); await wait(300);
await ok('closing the info sheet leaves the Add dialog open and adds nothing', async () => { assert.ok(await dialogOpen()); assert.equal(await p.evaluate(() => document.querySelectorAll('[data-testid=add-info]').length), 0); assert.equal((await stored()).movies.length, 0); });
await p.evaluate(() => document.querySelector('.sd-res-poster').closest('button').click());
await until(p, () => !!document.querySelector('[data-testid=title-overview]'));
await ok('tapping the poster opens the same info sheet', async () => assert.match(await infoText(), /Bad Apples/));
await infoBtn('Add to watchlist'); await wait(700);
await ok('"Add to watchlist" in the sheet adds it as planned and closes the sheet', async () => {
  const s = await stored(); assert.equal(s.movies.length, 1); assert.equal(s.movies[0].status, 'planned');
  assert.equal(await p.evaluate(() => document.querySelectorAll('[data-testid=add-info]').length), 0);
  assert.ok(await dialogOpen());
  assert.match(await p.evaluate(() => document.querySelector('.sd-addstatus').innerText), /watchlist/i);
});
await ok('the row now says "On watchlist"', async () => assert.match((await rowsText())[0], /On watchlist/));
await p.evaluate(() => document.querySelector('[data-testid=res-open]').click());
await until(p, () => !!document.querySelector('[data-testid=title-overview]'));
await infoBtn('Watched it'); await wait(700);
await ok('"Watched it" from the sheet logs it as watched', async () => { const s = await stored(); assert.ok(s.movies.some((m) => m.tmdbId === 900 && m.status !== 'planned' && m.watchedAt)); });
await ok('a film already in the library: the sheet says so and offers Open / Log again', async () => {
  await p.evaluate(() => document.querySelector('[data-testid=res-open]').click());
  await until(p, () => !!document.querySelector('[data-testid=title-overview]'));
  assert.match(await infoText(), /Movie · In library/);
  const b = (await infoBtns()).join('|'); assert.match(b, /Open/); assert.match(b, /Log again/);
});
await infoBtn('^Open$'); await wait(700);
await ok('"Open" closes the Add dialog and opens the film in your library', async () => {
  assert.equal(await dialogOpen(), false);
  assert.ok(await p.evaluate(() => !!document.querySelector('[data-testid=saved-as], .sd-mdet-head')));
});
await p.keyboard.press('Escape'); await wait(300);

console.log('B. ADD A SHOW: READ ABOUT IT FIRST');
await tab('Shows');
await p.evaluate(() => document.querySelector('button[aria-label="Add a show from TMDB"]').click()); await wait(400);
await p.type('input[aria-label="Search TMDB for a show"]', 'Bad apples'); await p.keyboard.press('Enter');
await until(p, () => document.querySelectorAll('.sd-res').length === 1);
await p.evaluate(() => document.querySelector('[data-testid=res-open]').click());
await until(p, () => /Finnish crime drama/.test((document.querySelector('[data-testid=title-overview]') || {}).textContent || ''));
await ok('show sheet: "2021 · Show · Not in your library", 2021–2023, 2 seasons · 12 episodes, free on SBS, cast; nothing added', async () => {
  const t = await infoText(); assert.match(t, /2021 · Show · Not in your library/); assert.match(t, /2 seasons · 12 episodes/); assert.match(t, /SBS On Demand/); assert.match(t, /Finnish Lead/);
  assert.deepEqual(Object.keys((await stored()).shows), []);
});
await ok('the sheet has "Add" and "Add to watchlist"', async () => { const b = (await infoBtns()).join('|'); assert.match(b, /Add\b/); assert.match(b, /Add to watchlist/); });
await infoBtn('Add to watchlist'); await wait(700);
await ok('"Add to watchlist" adds the show to the watchlist (not followed) and closes the sheet', async () => {
  const s = await stored(); const sh = Object.values(s.shows)[0]; assert.ok(sh); assert.equal(sh.watchlist, true); assert.ok(!sh.followed);
  assert.equal(await p.evaluate(() => document.querySelectorAll('[data-testid=add-info]').length), 0);
});

console.log(`\n${checks} checks passed`); console.log('PROBLEMS:', problems.length ? '\n' + problems.join('\n') : 'none'); await browser.close(); server.close();
if (problems.length) process.exit(1);
