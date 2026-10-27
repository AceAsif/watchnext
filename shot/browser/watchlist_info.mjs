process.env.TZ = 'Australia/Hobart';
import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { workPath, browserFile, APP_DIST } from '../../tests/paths.mjs';
import { launchBrowser } from './launch.mjs';

// Read about a title BEFORE watching it: a Watchlist movie opens an info sheet (description,
// ▶ Trailer, scores, where to watch, cast, "I watched it" / Remove); a Watchlist show opens the
// show page, which now has an "About" card (one TMDB request, shared with the Cast card). TMDB mocked.
const PORT = 4254;
const DIST = APP_DIST; const OUT = workPath('out_watchlist_info');
const fontsCss = fs.readFileSync(browserFile('fonts.css'), 'utf8');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => { let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html'; const f = path.join(DIST, p); if (!f.startsWith(DIST) || !fs.existsSync(f)) { res.writeHead(404); return res.end('nf'); } res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res); });
await new Promise((r) => server.listen(PORT, r));
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const CORS = { 'access-control-allow-origin': '*' };
const FIXED = Date.parse('2026-10-27T07:00:00.000Z'); // 6pm 27 Oct 2026, Hobart

const STATE = () => ({ shows: {
  'tmdb:70': { tmdbId: 70, name: 'Fresh Show', watchlist: true, followed: false, runtimeMin: 45, totalEpisodes: 8, seasons: [{ n: 1, count: 8 }], watched: {}, lastSynced: '2026-10-27T00:00:00Z' },
}, movies: [
  { name: 'Bad Apples', tmdbId: 900, status: 'planned', year: '2026', runtimeMin: 100, poster: null },
  { name: 'Other Film', tmdbId: 901, status: 'planned', year: '2025', runtimeMin: 90, poster: null },
], settings: { tmdbKey: 'TESTKEY' } });

const MOVIE = { id: 900, title: 'Bad Apples', tagline: 'Some lessons bite back.', overview: 'A teacher takes matters into her own hands.', runtime: 100, release_date: '2026-03-01', vote_average: 6.4, vote_count: 210,
  genres: [{ id: 27, name: 'Horror' }, { id: 35, name: 'Comedy' }],
  credits: { cast: [{ id: 1, name: 'Saoirse Ronan', character: 'Maria', profile_path: null }, { id: 2, name: 'Rob Brydon', character: 'Head', profile_path: null }], crew: [{ id: 3, name: 'Jonatan Etzler', job: 'Director', department: 'Directing', profile_path: null }] },
  'watch/providers': { results: { AU: { link: 'https://www.themoviedb.org/movie/900/watch?locale=AU', rent: [{ provider_name: 'Apple TV' }] } } } };
const TV = { id: 70, name: 'Fresh Show', tagline: 'Every story starts somewhere.', overview: 'Four friends open a bakery in Hobart.', number_of_episodes: 8, seasons: [{ season_number: 1, episode_count: 8 }],
  created_by: [{ id: 50, name: 'A Creator' }], aggregate_credits: { cast: [{ id: 51, name: 'Lead Actor', profile_path: null, roles: [{ character: 'Baker', episode_count: 8 }] }], crew: [] } };

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
    if (url.pathname === '/3/movie/900') return j(MOVIE);
    if (url.pathname === '/3/movie/900/videos') return j({ results: [{ site: 'YouTube', type: 'Trailer', official: true, key: 'BADAPPLES1' }] });
    if (url.pathname === '/3/tv/70') return j(TV);
    if (url.pathname === '/3/tv/70/season/1') return j({ episodes: [] });
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

console.log('A. WATCHLIST MOVIE: READ BEFORE WATCHING');
await tab('Watchlist');
await ok('a Watchlist movie row is a button now', async () => { assert.equal(await p.evaluate(() => document.querySelector('[data-testid=wl-movie] .sd-open').tagName), 'BUTTON'); });
log = [];
await openMovie('Bad Apples');
await until(p, () => !!document.querySelector('[data-testid=movie-overview]'));
await ok('tapping it opens an info sheet: title, year, "On your watchlist", runtime and genres', async () => {
  const t = await sheetText(); assert.match(t, /Bad Apples/); assert.match(t, /2026 · On your watchlist/); assert.match(t, /100 min/); assert.match(t, /Horror, Comedy/);
});
await ok('the description and tagline', async () => { const t = await sheetText(); assert.match(t, /A teacher takes matters into her own hands\./); assert.match(t, /Some lessons bite back\./); });
await ok('a score (TMDB ★ 6.4 here; with critic scores switched on the IMDb / RT / Metacritic row shows) and where to watch ("Buy or rent")', async () => { const t = await sheetText(); assert.match(t, /★ 6\.4 TMDB/); assert.match(t, /Buy or rent/); });
await ok('the cast (Saoirse Ronan, Rob Brydon)', async () => { const t = await sheetText(); assert.match(t, /Saoirse Ronan/); assert.match(t, /Rob Brydon/); });
await ok('one details request for description, cast and where to watch', async () => { assert.equal(log.filter((x) => x.startsWith('/3/movie/900?') && /credits/.test(x)).length, 1, log.join(' ')); });
await p.screenshot({ path: path.join(OUT, 'movie_info_phone.png') });
await p.evaluate(() => [...document.querySelectorAll('.sd-sheet button')].find((b) => /Trailer/.test(b.textContent)).click());
await until(p, () => window.__opened.length > 0);
await ok('▶ Trailer opens the YouTube trailer', async () => { assert.deepEqual(await p.evaluate(() => window.__opened), ['https://www.youtube.com/watch?v=BADAPPLES1']); });
await ok('phone: no sideways scroll in the sheet', async () => { assert.ok(await p.evaluate(() => { const s = document.querySelector('.sd-sheet'); return s.scrollWidth <= s.clientWidth; })); });
await p.evaluate(() => [...document.querySelectorAll('.sd-sheet button')].find((b) => /I watched it/.test(b.textContent)).click()); await wait(400);
await ok('"✓ I watched it" marks it watched, closes the sheet, and it leaves the Watchlist', async () => {
  const m = (await stored()).movies.find((x) => x.tmdbId === 900); assert.equal(m.status, 'watched'); assert.ok(m.watchedAt);
  assert.equal(await p.evaluate(() => !!document.querySelector('.sd-sheet')), false);
  assert.equal(await p.evaluate(() => [...document.querySelectorAll('[data-testid=wl-movie]')].some((r) => /Bad Apples/.test(r.textContent))), false);
});
await openMovie('Other Film'); await wait(500);
await p.evaluate(() => [...document.querySelectorAll('.sd-sheet button')].find((b) => /Remove from watchlist/.test(b.textContent)).click()); await wait(300);
await ok('Remove asks first (in-app), Cancel keeps it', async () => {
  assert.match(await p.evaluate(() => document.querySelector('[role=alertdialog]').innerText), /Remove from your watchlist\?/);
  await p.evaluate(() => document.querySelector('[data-testid=ask-no]').click()); await wait(300);
  assert.ok((await stored()).movies.some((x) => x.tmdbId === 901));
});
await p.evaluate(() => [...document.querySelectorAll('.sd-sheet button')].find((b) => /Remove from watchlist/.test(b.textContent)).click()); await wait(300);
await p.evaluate(() => document.querySelector('[data-testid=ask-yes]').click()); await wait(400);
await ok('…and Remove takes it off', async () => { assert.ok(!(await stored()).movies.some((x) => x.tmdbId === 901)); assert.equal(await p.evaluate(() => !!document.querySelector('.sd-sheet')), false); });

console.log('B. WATCHLIST SHOW: THE SHOW PAGE HAS "ABOUT"');
log = [];
await p.evaluate(() => [...document.querySelectorAll('.sd-mrow .sd-open')].find((b) => /Fresh Show/.test(b.textContent)).click());
await until(p, () => !!document.querySelector('[data-testid=show-about]') && /Four friends/.test(document.querySelector('[data-testid=show-about]').innerText));
await ok('a Watchlist show opens its page, with "About": the tagline and description', async () => {
  const t = await p.evaluate(() => document.querySelector('[data-testid=show-about]').innerText.replace(/\s+/g, ' '));
  assert.match(t, /About/); assert.match(t, /Every story starts somewhere\./); assert.match(t, /Four friends open a bakery in Hobart\./);
});
await until(p, () => /Lead Actor/.test(document.body.innerText));
await ok('the Cast card uses the same download (one /tv request with credits, not two)', async () => {
  assert.equal(log.filter((x) => x === '/3/tv/70?aggregate_credits').length, 1, log.join(' '));
});
await p.evaluate(() => document.querySelector('[data-testid=show-about]').scrollIntoView({ block: 'start' })); await wait(200);
await p.screenshot({ path: path.join(OUT, 'show_about_phone.png') });

console.log(`\n${checks} checks passed`); console.log('PROBLEMS:', problems.length ? '\n' + problems.join('\n') : 'none'); await browser.close(); server.close();
if (problems.length) process.exit(1);
