process.env.TZ = 'Australia/Hobart';
import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { workPath, browserFile, APP_DIST } from '../../tests/paths.mjs';
import { launchBrowser } from './launch.mjs';

// Watch links: [▶ Netflix] [▶ Stan] [All options] on the show page and the movie sheet.
// Uses cached providers when fresh, checks quietly when not, your services first, nothing when
// it isn't streaming, the movie sheet reads watch/providers from its one details request.
// TMDB mocked.
const PORT = 4243;
const DIST = APP_DIST; const OUT = workPath('out_watch_links');
const fontsCss = fs.readFileSync(browserFile('fonts.css'), 'utf8');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => { let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html'; const f = path.join(DIST, p); if (!f.startsWith(DIST) || !fs.existsSync(f)) { res.writeHead(404); return res.end('nf'); } res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res); });
await new Promise((r) => server.listen(PORT, r));
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const CORS = { 'access-control-allow-origin': '*' };
const FIXED = Date.parse('2026-10-21T22:00:00.000Z');
const JW = (k, id) => `https://www.themoviedb.org/${k}/${id}/watch?locale=AU`;
const prov = (...names) => names.map((name) => ({ name, logo: null }));

const STATE = () => ({ shows: {
  // fresh cache (checked yesterday, Australia): no lookup needed
  'tmdb:1': { tmdbId: 1, name: 'Dark', followed: true, runtimeMin: 50, totalEpisodes: 3, seasons: [{ n: 1, count: 3 }], watched: {}, lastSynced: '2026-10-21T00:00:00Z',
    providers: prov('Netflix', 'Stan', 'Foxtel Now'), providersFree: [], providersLink: JW('tv', 1), providersSynced: '2026-10-21T00:00:00.000Z', providersRegion: 'AU' },
  // never checked: the page checks quietly
  'tmdb:2': { tmdbId: 2, name: 'Bluey & Friends: Part 2', followed: true, runtimeMin: 8, totalEpisodes: 3, seasons: [{ n: 1, count: 3 }], watched: {}, lastSynced: '2026-10-21T00:00:00Z' },
  // checked, streams nowhere
  'tmdb:3': { tmdbId: 3, name: 'Nowhere Show', followed: true, runtimeMin: 30, totalEpisodes: 3, seasons: [{ n: 1, count: 3 }], watched: {}, lastSynced: '2026-10-21T00:00:00Z',
    providers: [], providersFree: [], providersLink: '', providersSynced: '2026-10-21T00:00:00.000Z', providersRegion: 'AU' },
  // saved before buy/rent was stored: a TMDB page but nothing streaming -> asked again once
  'tmdb:4': { tmdbId: 4, name: 'Batwoman', followed: true, runtimeMin: 42, totalEpisodes: 3, seasons: [{ n: 1, count: 3 }], watched: {}, lastSynced: '2026-10-21T00:00:00Z',
    providers: [], providersFree: [], providersLink: JW('tv', 4), providersSynced: '2026-10-21T00:00:00.000Z', providersRegion: 'AU' },
  // on the watchlist, never checked: the Watchlist only checks shows when "On my services" is on
  'tmdb:5': { tmdbId: 5, name: 'Queued Show', watchlist: true, runtimeMin: 30, totalEpisodes: 3, seasons: [{ n: 1, count: 3 }], watched: {}, lastSynced: '2026-10-21T00:00:00Z' },
}, movies: [
  { name: 'Heat', status: 'watched', watchedAt: '2026-09-01T10:00:00.000Z', runtimeMin: 170, tmdbId: 949, year: '1995' },
  { name: 'Lost Film', status: 'watched', watchedAt: '2026-08-01T10:00:00.000Z', runtimeMin: 90, tmdbId: 950, year: '2001' },
  // Watchlist movies: never checked (streams), fresh buy/rent-only, never checked (nowhere)
  { name: 'Dune: Part Two', status: 'planned', runtimeMin: 166, tmdbId: 951, year: '2024' },
  { name: 'Rental Only', status: 'planned', runtimeMin: 100, tmdbId: 952, year: '2020',
    providers: [], providersFree: [], providersLink: JW('movie', 952), providersBuyRent: true, providersSynced: '2026-10-21T00:00:00.000Z', providersRegion: 'AU' },
  { name: 'Gone Film', status: 'planned', runtimeMin: 95, tmdbId: 953, year: '1999' },
], settings: { tmdbKey: 'TESTKEY' } });

const PROVIDERS = {
  'tv/4': { results: { AU: { link: JW('tv', 4), buy: [{ provider_name: 'Apple TV' }], rent: [{ provider_name: 'Google Play Movies' }] } } },
  'movie/951': { results: { AU: { link: JW('movie', 951), flatrate: [{ provider_name: 'Netflix' }], rent: [{ provider_name: 'Apple TV' }] } } },
  'tv/2': { results: { AU: { link: JW('tv', 2), flatrate: [{ provider_name: 'Disney Plus' }, { provider_name: 'Netflix' }], free: [{ provider_name: 'ABC iview' }] } } },
};
const MOVIE = {
  949: { id: 949, title: 'Heat', runtime: 170, genres: [], release_date: '1995-12-15', credits: { cast: [], crew: [] },
    'watch/providers': { results: { AU: { link: JW('movie', 949), flatrate: [{ provider_name: 'Binge' }, { provider_name: 'Amazon Prime Video' }], ads: [{ provider_name: 'SBS On Demand' }] }, US: { flatrate: [{ provider_name: 'Max' }] } } } },
  950: { id: 950, title: 'Lost Film', runtime: 90, genres: [], release_date: '2001-01-01', credits: { cast: [], crew: [] }, 'watch/providers': { results: {} } },
};

const browser = await launchBrowser(puppeteer);
const problems = []; let checks = 0; const ok = async (n, f) => { await f(); checks++; console.log('  PASS', n); }; const wait = (ms = 350) => new Promise((r) => setTimeout(r, ms));
const until = async (page, fn, arg, ms = 6000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await page.evaluate(fn, arg)) return true; await wait(100); } throw new Error('timed out waiting for ' + fn.toString().slice(0, 90)); };
let log = [];
async function open({ w = 390, h = 844, mine = [] } = {}) {
  const page = await browser.newPage(); await page.emulateTimezone('Australia/Hobart'); await page.setViewport({ width: w, height: h, deviceScaleFactor: 2 });
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
      log.push(url.pathname + (url.searchParams.get('append_to_response') ? '?append=' + url.searchParams.get('append_to_response') : ''));
      let m = /^\/3\/(tv|movie)\/(\d+)\/watch\/providers$/.exec(url.pathname);
      if (m) return j(PROVIDERS[`${m[1]}/${m[2]}`] || { results: {} });
      m = /^\/3\/movie\/(\d+)$/.exec(url.pathname);
      if (m && MOVIE[m[1]]) return j(MOVIE[m[1]]);
      return j({ results: [], episodes: [], cast: [], crew: [] });
    }
    return r.abort();
  });
  await page.evaluateOnNewDocument((s, fixed, mineIds) => {
    if (!sessionStorage.getItem('__s')) {
      localStorage.setItem('watchnext-state-v1', JSON.stringify(s)); localStorage.setItem('watchnext-badges-seen-v1', JSON.stringify({ v: 1, levels: {} }));
      localStorage.setItem('watchnext-services-v1', JSON.stringify({ mine: mineIds, region: 'AU' }));
      sessionStorage.setItem('__s', '1');
    }
    const RealDate = Date; const start = RealDate.now(); const b = fixed;
    class FakeDate extends RealDate { constructor(...a) { if (a.length === 0) super(b + (RealDate.now() - start)); else super(...a); } static now() { return b + (RealDate.now() - start); } }
    window.Date = FakeDate;
  }, STATE(), FIXED, mine);
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle0' }); await wait(400);
  return page;
}
const tab = async (p, name) => { await p.evaluate((t) => [...document.querySelectorAll('nav.tabbar button')].find((x) => x.textContent.includes(t)).click(), name); await wait(400); };
const openShow = async (p, name) => {
  await tab(p, 'Shows');
  await p.evaluate(() => { const a = document.querySelector('.sd-lstatus [role=tab]'); if (a) a.click(); }); await wait(200);
  await p.evaluate((n) => [...document.querySelectorAll('button.sd-ltile')].find((b) => b.textContent.includes(n)).click(), name); await wait(600);
};
const openMovie = async (p, name) => {
  await tab(p, 'Movies');
  await p.evaluate((n) => [...document.querySelectorAll('.sd-lgrid .sd-ltile')].find((t) => new RegExp(n).test(t.getAttribute('aria-label'))).click(), name); await wait(700);
};
const links = (p) => p.evaluate(() => [...document.querySelectorAll('[data-testid=watch-links] a')].map((a) => ({ text: a.textContent.trim(), href: a.href, target: a.target, rel: a.rel, h: Math.round(a.getBoundingClientRect().height) })));
const noScroll = (p) => p.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
const stored = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('watchnext-state-v1')));

console.log('A. SHOW PAGE, FRESH CACHE');
let p = await open();
log = [];
await openShow(p, 'Dark');
await ok('Dark shows ▶ Netflix, ▶ Stan and "All options · +1" (Foxtel Now has no button)', async () => {
  const l = await links(p);
  assert.deepEqual(l.map((x) => x.text), ['Netflix', 'Stan', 'All options · +1']);
  assert.equal(l[0].href, 'https://www.netflix.com/search?q=Dark');
  assert.equal(l[1].href, 'https://play.stan.com.au/search?q=Dark');
  assert.equal(l[2].href, JW('tv', 1));
});
await ok('links open in a new tab, safely, and are 44px tall', async () => {
  for (const x of await links(p)) { assert.equal(x.target, '_blank'); assert.match(x.rel, /noopener/); assert.match(x.rel, /noreferrer/); assert.equal(x.h, 44); }
});
await ok('a fresh answer is used as it is (no new lookup)', async () => { assert.ok(!log.some((x) => x.includes('/watch/providers')), log.join(' ')); });
await ok('phone: no sideways scroll', async () => { assert.ok(await noScroll(p)); });
await p.screenshot({ path: path.join(OUT, 'show_phone.png') });
await p.close();

console.log('B. YOUR SERVICES FIRST');
p = await open({ mine: ['stan'] });
await openShow(p, 'Dark');
await ok('with Stan ticked in My services, Stan comes first and is marked as yours', async () => {
  assert.deepEqual((await links(p)).map((x) => x.text), ['Stan', 'Netflix', 'All options · +1']);
  assert.ok(await p.evaluate(() => document.querySelector('[data-testid=watch-links] a').classList.contains('mine')));
});
await p.close();

console.log('C. NEVER CHECKED: QUIET CHECK');
p = await open();
log = [];
await openShow(p, 'Bluey');
await until(p, () => !!document.querySelector('[data-testid=watch-links]'));
await ok('the page checks once and shows the buttons (free iview before Disney+ and Netflix)', async () => {
  assert.equal(log.filter((x) => x === '/3/tv/2/watch/providers').length, 1, log.join(' '));
  const l = await links(p);
  assert.deepEqual(l.map((x) => x.text), ['ABC iview', 'Disney+', 'Netflix', 'All options']);
});
await ok('the title is put in the search links safely ("&", ":" and spaces)', async () => {
  assert.equal((await links(p))[0].href, 'https://iview.abc.net.au/search?keyword=Bluey%20%26%20Friends%3A%20Part%202');
});
await ok('the answer is saved on the show (and shows in "Streaming in Australia")', async () => {
  const s = (await stored(p)).shows['tmdb:2'];
  assert.deepEqual(s.providers.map((x) => x.name), ['Disney Plus', 'Netflix']); assert.equal(s.providersRegion, 'AU'); assert.ok(s.providersSynced);
  assert.match(await p.evaluate(() => document.body.innerText), /Disney Plus · Netflix · Free: ABC iview/);
});
await p.evaluate(() => document.querySelector('.sd-back').click()); await wait(300);
log = [];
await openShow(p, 'Bluey');
await ok('opening it again does not look it up again', async () => { assert.ok(!log.some((x) => x.includes('/watch/providers')), log.join(' ')); });
await p.close();

console.log('D. NOT STREAMING');
p = await open();
await openShow(p, 'Nowhere');
await ok('a show that streams nowhere has no Watch buttons', async () => {
  assert.ok(!(await p.evaluate(() => !!document.querySelector('[data-testid=watch-links]'))));
  assert.match(await p.evaluate(() => document.body.innerText), /Not streaming in Australia/i);
});
await p.close();

console.log('D2. BUY OR RENT ONLY');
p = await open();
log = [];
await openShow(p, 'Batwoman');
await until(p, () => /Buy or rent/.test((document.querySelector('[data-testid=watch-links]') || {}).textContent || ''));
await ok('saved before buy/rent was stored: checked again once, and the button says "Buy or rent"', async () => {
  assert.equal(log.filter((x) => x === '/3/tv/4/watch/providers').length, 1, log.join(' '));
  const l = await links(p);
  assert.deepEqual(l.map((x) => x.text), ['Buy or rent']); assert.equal(l[0].href, JW('tv', 4));
  assert.equal((await stored(p)).shows['tmdb:4'].providersBuyRent, true);
});
await p.evaluate(() => document.querySelector('.sd-back').click()); await wait(300);
log = [];
await openShow(p, 'Batwoman');
await ok('opening it again does not look it up again', async () => { assert.ok(!log.some((x) => x.includes('/watch/providers')), log.join(' ')); });
await p.close();

console.log('D3. WATCHLIST MOVIE ROWS');
p = await open({ mine: ['netflix'] });
log = [];
await tab(p, 'Watchlist');
const rowLinks = (p) => p.evaluate(() => Object.fromEntries([...document.querySelectorAll('[data-testid=wl-movie]')].map((r) => [r.querySelector('.sd-mrow-name').textContent, [...r.querySelectorAll('[data-testid=watch-links] a')].map((a) => a.textContent.trim())])));
await until(p, () => !!document.querySelector('[data-testid=wl-movie] [data-testid=watch-links] a.mine'));
await wait(600);
await ok('each movie row gets its own links: Dune ▶ Netflix (yours) + All options, Rental Only "Buy or rent", Gone Film nothing', async () => {
  assert.deepEqual(await rowLinks(p), { 'Dune: Part Two': ['Netflix', 'All options'], 'Gone Film': [], 'Rental Only': ['Buy or rent'] });
  assert.equal(await p.evaluate(() => document.querySelector('[data-testid=wl-movie] [data-testid=watch-links] a').href), 'https://www.netflix.com/search?q=Dune%3A%20Part%20Two');
});
await ok('movies are checked quietly with the filter off; fresh ones and shows are not', async () => {
  assert.equal(log.filter((x) => x === '/3/movie/951/watch/providers').length, 1, log.join(' '));
  assert.equal(log.filter((x) => x === '/3/movie/953/watch/providers').length, 1, log.join(' '));
  assert.ok(!log.includes('/3/movie/952/watch/providers'), log.join(' '));
  assert.ok(!log.includes('/3/tv/5/watch/providers'), log.join(' '));
  const m = (await stored(p)).movies.find((x) => x.tmdbId === 951); assert.equal(m.providersBuyRent, true); assert.equal(m.providersRegion, 'AU');
});
await ok('row links: new tab, 36px tall, lined up with the title, no sideways scroll', async () => {
  const r = await p.evaluate(() => { const row = document.querySelector('[data-testid=wl-movie]'); const a = row.querySelector('[data-testid=watch-links] a'); return { t: a.target, rel: a.rel, h: Math.round(a.getBoundingClientRect().height), dx: Math.round(a.getBoundingClientRect().left - row.querySelector('.sd-mrow-name').getBoundingClientRect().left) }; });
  assert.equal(r.t, '_blank'); assert.match(r.rel, /noopener/); assert.equal(r.h, 36); assert.equal(r.dx, 0, JSON.stringify(r));
  assert.ok(await noScroll(p));
});
await ok('the ✓ and ✕ buttons still work beside the links', async () => {
  assert.equal(await p.evaluate(() => document.querySelectorAll('[data-testid=wl-movie] .sd-markbtn').length), 3);
});
await p.evaluate(() => document.querySelector('[data-testid=wl-movie]').scrollIntoView({ block: 'center' })); await wait(200);
await p.screenshot({ path: path.join(OUT, 'watchlist_phone.png') });
await p.close();

console.log('E. MOVIE SHEET');
p = await open({ mine: ['binge'] });
log = [];
await openMovie(p, 'Heat');
await until(p, () => !!document.querySelector('[data-testid=watch-links]'));
await ok('the sheet loads details once, with watch/providers (no extra request)', async () => {
  const movieReqs = log.filter((x) => x.startsWith('/3/movie/949'));
  assert.deepEqual(movieReqs, ['/3/movie/949?append=credits,watch/providers'], log.join(' '));
});
await ok('Heat: ▶ Binge (yours), ▶ SBS On Demand (free), ▶ Prime Video, All options; US-only Max is not shown', async () => {
  const l = await links(p);
  assert.deepEqual(l.map((x) => x.text), ['Binge', 'SBS On Demand', 'Prime Video', 'All options']);
  assert.equal(l[2].href, 'https://www.primevideo.com/search?phrase=Heat');
  assert.equal(l[3].href, JW('movie', 949));
});
await ok('phone: the sheet buttons sit side by side from the left (not one per line in the middle)', async () => {
  const r = await p.evaluate(() => { const g = document.querySelector('[data-testid=watch-links]'); const as = [...g.querySelectorAll('a')].map((a) => a.getBoundingClientRect()); return { left: Math.round(as[0].left - g.getBoundingClientRect().left), rows: new Set(as.map((x) => Math.round(x.top))).size }; });
  assert.equal(r.left, 0); assert.ok(r.rows <= 2, JSON.stringify(r));
});
await ok('phone: the movie sheet has no sideways scroll', async () => {
  assert.ok(await p.evaluate(() => { const s = document.querySelector('.sd-sheet'); return s.scrollWidth <= s.clientWidth; }));
});
await wait(400);
await p.screenshot({ path: path.join(OUT, 'movie_phone.png') });
await p.keyboard.press('Escape'); await wait(400);
await openMovie(p, 'Lost Film');
await wait(500);
await ok('a film streaming nowhere has no Watch buttons on its sheet', async () => {
  assert.ok(await p.evaluate(() => !!document.querySelector('.sd-sheet')));
  assert.ok(!(await p.evaluate(() => !!document.querySelector('[data-testid=watch-links]'))));
});
await p.close();

console.log('F. DESKTOP');
p = await open({ w: 1280, h: 860 });
await openShow(p, 'Dark');
await ok('desktop: the buttons sit in the show page sidebar, in one row', async () => {
  const r = await p.evaluate(() => { const g = document.querySelector('[data-testid=watch-links]'); const as = [...g.querySelectorAll('a')].map((a) => Math.round(a.getBoundingClientRect().top)); return { inSide: !!g.closest('.sd-side'), oneRow: new Set(as).size === 1 }; });
  assert.ok(r.inSide && r.oneRow, JSON.stringify(r));
});
await p.screenshot({ path: path.join(OUT, 'show_desktop.png') });
await p.close();

console.log(`\n${checks} checks passed`); console.log('PROBLEMS:', problems.length ? '\n' + problems.join('\n') : 'none'); await browser.close(); server.close();
if (problems.length) process.exit(1);
