process.env.TZ = 'Australia/Hobart';
import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { workPath, browserFile, APP_DIST } from '../../tests/paths.mjs';
import { launchBrowser } from './launch.mjs';

// Critic and audience scores: the show page row, the movie sheet row, Watchlist → "Highest rated",
// the saved answers, and nothing at all when the site has no OMDb key. TMDB and OMDb mocked.
// Needs .harness-work/dist-scores (node shot/build-test-dists.mjs builds it with a test key).
const PORT = 4231;
const SCORES_DIST = workPath('dist-scores');
const OUT = workPath('out_scores');
const fontsCss = fs.readFileSync(browserFile('fonts.css'), 'utf8');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
let DIST = SCORES_DIST;
const server = http.createServer((req, res) => { let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html'; const f = path.join(DIST, p); if (!f.startsWith(DIST) || !fs.existsSync(f)) { res.writeHead(404); return res.end('nf'); } res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res); });
await new Promise((r) => server.listen(PORT, r));
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const CORS = { 'access-control-allow-origin': '*' };
const FIXED = Date.parse('2026-10-21T22:00:00.000Z');

const STATE = () => ({ shows: {
  'tmdb:1': { tmdbId: 1, name: 'Dark', followed: true, runtimeMin: 50, totalEpisodes: 3, seasons: [{ n: 1, count: 3 }], watched: {}, lastSynced: '2026-10-21T00:00:00Z' },
  'tmdb:2': { tmdbId: 2, name: 'Andor', watchlist: true, followed: false, runtimeMin: 45, seasons: [{ n: 1, count: 12 }], watched: {} },
  'tmdb:3': { tmdbId: 3, name: 'Bluey', watchlist: true, followed: false, runtimeMin: 8, seasons: [{ n: 1, count: 50 }], watched: {} },
}, movies: [
  { name: 'Heat', status: 'watched', watchedAt: '2026-09-01T10:00:00.000Z', runtimeMin: 170, tmdbId: 949, year: '1995' },
  { name: 'Arrival', status: 'planned', runtimeMin: 116, tmdbId: 329865, year: 2016 },
  { name: 'Zed Film', status: 'planned', runtimeMin: 90, tmdbId: 777, year: 2024 },
], settings: { tmdbKey: 'TESTKEY' } });

const TV = {
  1: { id: 1, name: 'Dark', vote_average: 8.4, vote_count: 6800, first_air_date: '2017-12-01', last_air_date: '2020-06-27', number_of_episodes: 3, seasons: [{ season_number: 1, episode_count: 3, air_date: '2017-12-01' }], external_ids: { imdb_id: 'tt5753856' } },
  2: { id: 2, name: 'Andor', vote_average: 8.2, vote_count: 1500, first_air_date: '2022-09-21', last_air_date: '2025-05-13', external_ids: { imdb_id: 'tt9253284' } },
  3: { id: 3, name: 'Bluey', vote_average: 8.6, vote_count: 400, first_air_date: '2018-10-01', last_air_date: '2025-04-01', external_ids: { imdb_id: 'tt7678620' } },
};
const MOVIE = {
  949: { id: 949, title: 'Heat', imdb_id: 'tt0113277', vote_average: 7.9, vote_count: 7000, release_date: '1995-12-15', runtime: 170, genres: [] },
  329865: { id: 329865, title: 'Arrival', imdb_id: 'tt2543164', vote_average: 7.6, vote_count: 18000, release_date: '2016-11-10', runtime: 116, genres: [] },
  777: { id: 777, title: 'Zed Film', imdb_id: null, vote_average: 6.5, vote_count: 40, release_date: '2024-01-01', runtime: 90, genres: [] },
};
const OMDB = {
  tt5753856: { Response: 'True', imdbRating: '8.7', imdbVotes: '512,345', Metascore: 'N/A', Ratings: [{ Source: 'Internet Movie Database', Value: '8.7/10' }] },
  tt9253284: { Response: 'True', imdbRating: '8.5', imdbVotes: '260,000', Metascore: 'N/A', Ratings: [] },
  tt7678620: { Response: 'True', imdbRating: '9.3', imdbVotes: '45,000', Metascore: 'N/A', Ratings: [] },
  tt0113277: { Response: 'True', imdbRating: '8.3', imdbVotes: '760,123', Metascore: '76', Ratings: [{ Source: 'Internet Movie Database', Value: '8.3/10' }, { Source: 'Rotten Tomatoes', Value: '88%' }, { Source: 'Metacritic', Value: '76/100' }] },
  tt2543164: { Response: 'True', imdbRating: '7.9', imdbVotes: '800,000', Metascore: '81', Ratings: [{ Source: 'Rotten Tomatoes', Value: '94%' }] },
};

const browser = await launchBrowser(puppeteer);
const problems = []; let checks = 0; const ok = async (n, f) => { await f(); checks++; console.log('  PASS', n); }; const wait = (ms = 350) => new Promise((r) => setTimeout(r, ms));
const until = async (page, fn, arg, ms = 6000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await page.evaluate(fn, arg)) return true; await wait(100); } throw new Error('timed out waiting for ' + fn.toString().slice(0, 90)); };
const omdbLog = [];
let omdbDelay = 0;
async function open({ w = 390, h = 844, fresh = true } = {}) {
  const page = await browser.newPage(); await page.emulateTimezone('Australia/Hobart'); await page.setViewport({ width: w, height: h, deviceScaleFactor: 2 });
  page.on('pageerror', (e) => problems.push('pageerror: ' + e.message)); page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) problems.push('console.error: ' + m.text()); });
  await page.setBypassServiceWorker(true); await page.setRequestInterception(true);
  page.on('request', async (r) => {
    const u = r.url();
    if (u.startsWith('http://localhost:')) return r.continue();
    if (u.includes('fonts.googleapis.com')) return r.respond({ status: 200, contentType: 'text/css', body: fontsCss });
    if (u.includes('image.tmdb.org')) return r.respond({ status: 200, contentType: 'image/png', body: PNG });
    const j = (b) => r.respond({ status: 200, headers: CORS, contentType: 'application/json', body: JSON.stringify(b) });
    const url = new URL(u);
    if (url.hostname === 'www.omdbapi.com') {
      // Season lookups (episode scores) are tested in ep_scores.mjs; this suite counts title lookups only.
      if (url.searchParams.get('Season')) return j({ Response: 'False', Error: 'Series or season not found!' });
      const id = url.searchParams.get('i');
      omdbLog.push(id);
      assert.equal(url.searchParams.get('apikey'), 'TESTOMDB');
      if (omdbDelay) await wait(omdbDelay);
      return j(OMDB[id] || { Response: 'False', Error: 'Incorrect IMDb ID.' });
    }
    let m = /^\/3\/tv\/(\d+)$/.exec(url.pathname);
    if (m && TV[m[1]]) return j(TV[m[1]]);
    m = /^\/3\/movie\/(\d+)$/.exec(url.pathname);
    if (m && MOVIE[m[1]]) return j(MOVIE[m[1]]);
    if (u.includes('api.themoviedb.org')) return j({ results: [], episodes: [], cast: [], crew: [] });
    return r.abort();
  });
  await page.evaluateOnNewDocument((s, fixed, fresh) => {
    if (!sessionStorage.getItem('__s')) { localStorage.setItem('watchnext-state-v1', JSON.stringify(s)); if (fresh) localStorage.removeItem('watchnext-scores-v1'); localStorage.removeItem('watchnext-wl-sort'); sessionStorage.setItem('__s', '1'); }
    const RealDate = Date; const start = RealDate.now(); const b = fixed;
    class FakeDate extends RealDate { constructor(...a) { if (a.length === 0) super(b + (RealDate.now() - start)); else super(...a); } static now() { return b + (RealDate.now() - start); } }
    window.Date = FakeDate;
  }, STATE(), FIXED, fresh);
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
  await p.evaluate((n) => [...document.querySelectorAll('.sd-lgrid .sd-ltile')].find((t) => new RegExp(n).test(t.getAttribute('aria-label'))).click(), name);
};
const rowText = (p) => p.evaluate(() => { const s = document.querySelector('[data-testid=scores]'); return s ? s.innerText.replace(/\s+/g, ' ').trim() : null; });
const noScroll = (p) => p.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

console.log('A. SHOW PAGE');
omdbDelay = 900;
let p = await open();
await openShow(p, 'Dark');
await ok('while looking up, the row says "Loading scores…"', async () => {
  await until(p, () => !!document.querySelector('[data-testid=scores-box]'));
  assert.match(await rowText(p), /Loading scores…/);
});
omdbDelay = 0;
await until(p, () => /IMDb/i.test((document.querySelector('[data-testid=scores]') || {}).innerText || ''));
await ok('the show page shows IMDb with its vote count, and the TMDB users score', async () => {
  const t = await rowText(p);
  assert.match(t, /IMDb ★ 8\.7 512k/i); assert.match(t, /TMDB 8\.4/); assert.doesNotMatch(t, /RT|Metacritic/i, 'TV usually has no critic scores');
});
await ok('each score links to its site, opening in a new tab', async () => {
  const links = await p.evaluate(() => [...document.querySelectorAll('[data-testid=scores] a')].map((a) => [a.href, a.target]));
  assert.deepEqual(links, [['https://www.imdb.com/title/tt5753856/', '_blank'], ['https://www.themoviedb.org/tv/1', '_blank']]);
});
await ok('the scores are saved on this device', async () => {
  const c = await p.evaluate(() => JSON.parse(localStorage.getItem('watchnext-scores-v1')));
  assert.equal(c['tv:1'].imdb, 8.7); assert.equal(c['tv:1'].imdbId, 'tt5753856');
});
await ok('phone: no sideways scroll', async () => { assert.ok(await noScroll(p)); });
await p.screenshot({ path: path.join(OUT, 'show_phone.png') });
await p.close();

console.log('B. MOVIE SHEET');
p = await open({ fresh: false });
const before = omdbLog.length;
await openShow(p, 'Dark');
await until(p, () => /IMDb/i.test((document.querySelector('[data-testid=scores]') || {}).innerText || ''));
await ok('coming back uses the saved scores (OMDb not asked again)', async () => { assert.equal(omdbLog.length, before); });
await openMovie(p, 'Heat');
await until(p, () => /Metacritic|RT/i.test((document.querySelector('[data-testid=scores]') || {}).innerText || ''));
await ok('the movie sheet shows IMDb, Rotten Tomatoes critics, Metacritic and TMDB', async () => {
  const t = await rowText(p);
  assert.match(t, /IMDb ★ 8\.3 760k RT 🍅 88% Metacritic 76 TMDB 7\.9/i, t);
});
await ok('Metacritic 76 is coloured as a good score', async () => {
  assert.ok(await p.evaluate(() => document.querySelector('[data-testid=scores] .s-meta').classList.contains('t-good')));
});
await ok('the old plain "★ 7.9" fact is not shown twice', async () => {
  const facts = await p.evaluate(() => [...document.querySelectorAll('[role=dialog]')].pop().innerText);
  assert.equal((facts.match(/7\.9/g) || []).length, 1, facts);
});
await ok('phone: no sideways scroll', async () => { assert.ok(await noScroll(p)); });
await p.screenshot({ path: path.join(OUT, 'movie_phone.png') });
await p.close();

console.log('C. WATCHLIST → HIGHEST RATED');
p = await open();
await tab(p, 'Watchlist');
const names = () => p.evaluate(() => [...document.querySelectorAll('.sd-mrow-name')].map((x) => x.textContent));
await ok('the sort offers A–Z, Quickest first and Highest rated', async () => {
  assert.deepEqual(await p.evaluate(() => [...document.querySelectorAll('.sd-wlsort')].map((b) => b.textContent)), ['A–Z', 'Quickest first', 'Highest rated']);
});
const n0 = omdbLog.length;
await wait(500);
await ok('nothing is looked up until you pick "Highest rated"', async () => { assert.equal(omdbLog.length, n0); });
await p.evaluate(() => [...document.querySelectorAll('.sd-wlsort')].find((b) => b.textContent === 'Highest rated').click());
await until(p, () => /IMDb 9\.3/.test(document.body.innerText) && /TMDB 6\.5/.test(document.body.innerText) && /IMDb 7\.9/.test(document.body.innerText));
await ok('shows and movies are sorted by score (IMDb, else TMDB), and remembered', async () => {
  assert.deepEqual(await names(), ['Bluey', 'Andor', 'Arrival', 'Zed Film']);
  assert.equal(await p.evaluate(() => localStorage.getItem('watchnext-wl-sort')), 'rated');
});
await ok('each row shows its score next to its length', async () => {
  const t = await p.evaluate(() => document.body.innerText);
  assert.match(t, /Bluey\n50 eps · 6 hr 40 min · IMDb 9\.3/); assert.match(t, /Zed Film\n2024 · 1 hr 30 min · TMDB 6\.5/);
});
await ok('a title with no IMDb page is not sent to OMDb', async () => { assert.ok(!omdbLog.includes(null) && !omdbLog.includes('')); });
await ok('phone: no sideways scroll', async () => { assert.ok(await noScroll(p)); });
await p.screenshot({ path: path.join(OUT, 'watchlist_phone.png') });
await p.close();

console.log('D. NO OMDb KEY');
DIST = APP_DIST;
const n1 = omdbLog.length;
p = await open();
await openShow(p, 'Dark'); await wait(500);
await ok('no key: the show page has no scores row', async () => { assert.equal(await p.evaluate(() => !!document.querySelector('[data-testid=scores-box]')), false); });
await tab(p, 'Watchlist');
await ok('no key: no "Highest rated" sort', async () => {
  assert.deepEqual(await p.evaluate(() => [...document.querySelectorAll('.sd-wlsort')].map((b) => b.textContent)), ['A–Z', 'Quickest first']);
});
await ok('no key: OMDb is never called', async () => { assert.equal(omdbLog.length, n1); });
await p.close();

console.log(`\n${checks} checks passed`); console.log('PROBLEMS:', problems.length ? '\n' + problems.join('\n') : 'none'); await browser.close(); server.close();
if (problems.length) process.exit(1);
