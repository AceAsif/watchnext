process.env.TZ = 'Australia/Hobart';
import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { workPath, browserFile, APP_DIST } from '../../tests/paths.mjs';
import { launchBrowser } from './launch.mjs';

// Episode IMDb scores: opening a season asks OMDb once for the whole season; each episode row
// shows "IMDb 8.7", the season's best is marked; saved on the device (no second lookup);
// Spoiler shield hides scores of unwatched episodes; seasons you don't open cost nothing;
// a site without an OMDb key shows none. TMDB and OMDb mocked. Needs .harness-work/dist-scores.
const PORT = 4246;
const SCORES_DIST = workPath('dist-scores');
const OUT = workPath('out_ep_scores');
let DIST = SCORES_DIST;
const fontsCss = fs.readFileSync(browserFile('fonts.css'), 'utf8');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => { let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html'; const f = path.join(DIST, p); if (!f.startsWith(DIST) || !fs.existsSync(f)) { res.writeHead(404); return res.end('nf'); } res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res); });
await new Promise((r) => server.listen(PORT, r));
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const CORS = { 'access-control-allow-origin': '*' };
const FIXED = Date.parse('2026-10-25T08:00:00.000Z');
const W = (k) => Object.fromEntries(k.map((x) => [x, { at: '2022-06-01T10:00:00.000Z', min: 70 }]));

const STATE = () => ({ shows: {
  'tmdb:66732': { tmdbId: 66732, name: 'Stranger Things', followed: true, runtimeMin: 70, totalEpisodes: 13, status: 'Ended', lastSynced: '2026-10-21T00:00:00Z',
    seasons: [{ n: 1, count: 4, air: '2016-07-15' }, { n: 2, count: 9, air: '2017-10-27' }], watched: W(['1x1', '1x2', '1x3', '1x4', '2x1', '2x2']),
    providers: [], providersFree: [], providersLink: '', providersSynced: '2026-10-24T00:00:00.000Z', providersRegion: 'AU' },
}, movies: [], settings: { tmdbKey: 'TESTKEY' } });
const TV = { 66732: { id: 66732, name: 'Stranger Things', vote_average: 8.6, vote_count: 18000, first_air_date: '2016-07-15', last_air_date: '2025-12-31', number_of_episodes: 13, seasons: [{ season_number: 1, episode_count: 4 }, { season_number: 2, episode_count: 9 }], external_ids: { imdb_id: 'tt4574334' } } };
const EPS = { 1: [1, 2, 3, 4], 2: [1, 2, 3, 4, 5, 6, 7, 8, 9] };
const seasonJson = (n) => ({ season_number: n, episodes: EPS[n].map((e) => ({ id: n * 100 + e, season_number: n, episode_number: e, name: `Chapter ${e}`, overview: '', air_date: n === 1 ? '2016-07-15' : '2017-10-27', runtime: 50 })) });
const OMDB_SEASON = {
  1: { Response: 'True', Season: '1', Episodes: [{ Episode: '1', imdbRating: '8.5', Released: '2016-07-15' }, { Episode: '2', imdbRating: '8.3', Released: '2016-07-15' }, { Episode: '3', imdbRating: '8.4', Released: '2016-07-15' }, { Episode: '4', imdbRating: '8.9', Released: '2016-07-15' }] },
  2: { Response: 'True', Season: '2', Episodes: EPS[2].map((e) => ({ Episode: String(e), imdbRating: e === 9 ? '9.2' : e === 7 ? '6.1' : '8.4', Released: '2017-10-27' })) },
};

const browser = await launchBrowser(puppeteer);
const problems = []; let checks = 0; const ok = async (n, f) => { await f(); checks++; console.log('  PASS', n); }; const wait = (ms = 350) => new Promise((r) => setTimeout(r, ms));
const until = async (page, fn, arg, ms = 6000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await page.evaluate(fn, arg)) return true; await wait(100); } throw new Error('timed out waiting for ' + fn.toString().slice(0, 90)); };
let omdbLog = [];
async function open({ w = 390, h = 844, fresh = true, shield = false } = {}) {
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
    if (url.hostname === 'www.omdbapi.com') {
      const s = url.searchParams.get('Season');
      omdbLog.push(s ? `${url.searchParams.get('i')}:S${s}` : url.searchParams.get('i'));
      if (s) return j(OMDB_SEASON[s] || { Response: 'False', Error: 'Series or season not found!' });
      return j({ Response: 'True', imdbRating: '8.7', imdbVotes: '1,400,000', Ratings: [] });
    }
    let m = /^\/3\/tv\/(\d+)\/season\/(\d+)$/.exec(url.pathname);
    if (m) return j(seasonJson(Number(m[2])));
    m = /^\/3\/tv\/(\d+)$/.exec(url.pathname);
    if (m && TV[m[1]]) return j(TV[m[1]]);
    if (u.includes('api.themoviedb.org')) return j({ results: [], episodes: [], cast: [], crew: [] });
    return r.abort();
  });
  await page.evaluateOnNewDocument((s, fixed, fr, sh) => {
    if (fr && !sessionStorage.getItem('__s')) {
      localStorage.clear();
      localStorage.setItem('watchnext-state-v1', JSON.stringify(s)); localStorage.setItem('watchnext-badges-seen-v1', JSON.stringify({ v: 1, levels: {} }));
      if (sh) localStorage.setItem('watchnext-spoilers-v1', 'on');
      sessionStorage.setItem('__s', '1');
    }
    const RealDate = Date; const start = RealDate.now(); const b = fixed;
    class FakeDate extends RealDate { constructor(...a) { if (a.length === 0) super(b + (RealDate.now() - start)); else super(...a); } static now() { return b + (RealDate.now() - start); } }
    window.Date = FakeDate;
  }, STATE(), FIXED, fresh, shield);
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle0' }); await wait(400);
  return page;
}
const openShow = async (p) => {
  await p.evaluate(() => [...document.querySelectorAll('nav.tabbar button')].find((x) => x.textContent.includes('Shows')).click()); await wait(400);
  await p.evaluate(() => { const a = document.querySelector('.sd-lstatus [role=tab]'); if (a) a.click(); }); await wait(200);
  await p.evaluate(() => [...document.querySelectorAll('button.sd-ltile')].find((b) => b.textContent.includes('Stranger')).click()); await wait(900);
};
const openSeason = async (p, n) => {
  await p.evaluate((s) => { const h = [...document.querySelectorAll('button.sd-season-head')].find((b) => b.textContent.includes(`S0${s}`)); if (h && h.getAttribute('aria-expanded') === 'false') h.click(); }, n); await wait(500);
  await p.evaluate(() => { document.querySelectorAll('.sd-foldrow[aria-expanded=false]').forEach((f) => f.click()); }); await wait(300);
};
const scoresIn = (p, n) => p.evaluate((s) => {
  const head = [...document.querySelectorAll('button.sd-season-head')].find((b) => b.textContent.includes(`S0${s}`));
  const box = head.parentElement;
  return [...box.querySelectorAll('.sd-ep')].filter((r) => r.querySelector('.sd-ep-title')).map((r) => {
    const sc = r.querySelector('[data-testid=ep-imdb]');
    return [r.querySelector('.sd-mono').textContent, sc ? sc.textContent.replace(/^ · /, '') : null, sc ? sc.classList.contains('best') : false];
  });
}, n);

console.log('A. SCORES ON EPISODE ROWS');
let p = await open();
omdbLog = [];
await openShow(p);
await openSeason(p, 2);
await until(p, () => document.querySelectorAll('[data-testid=ep-imdb]').length >= 9);
await ok('opening Season 2 asks OMDb once for the whole season (Season 1, not opened, costs nothing)', async () => {
  assert.deepEqual(omdbLog.filter((x) => x.includes(':S')), ['tt4574334:S2']);
});
await ok('every Season 2 episode shows its IMDb score; E09 (9.2) is marked best', async () => {
  const s = await scoresIn(p, 2);
  assert.equal(s.length, 9);
  assert.deepEqual(s.find((x) => x[0] === 'E09'), ['E09', 'IMDb 9.2 · best', true]);
  assert.deepEqual(s.find((x) => x[0] === 'E07'), ['E07', 'IMDb 6.1', false]);
  assert.equal(s.filter((x) => x[2]).length, 1);
});
await ok('a watched episode keeps its watched date and adds the score after it', async () => {
  const t = await p.evaluate(() => [...document.querySelectorAll('.sd-ep')].find((r) => /E01/.test(r.textContent) && /Watched/.test(r.textContent) && r.closest('.sd-sep').querySelector('.sd-season-head').textContent.includes('S02')).innerText.replace(/\s+/g, ' '));
  assert.match(t, /Watched 1 Jun 2022 · IMDb 8\.4/);
});
await ok('phone: no sideways scroll', async () => { assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)); });
await p.evaluate(() => { const e = [...document.querySelectorAll('[data-testid=ep-imdb]')].find((x) => x.classList.contains('best')); e.scrollIntoView({ block: 'center' }); }); await wait(300);
await p.screenshot({ path: path.join(OUT, 'episodes_phone.png') });
await openSeason(p, 1);
await until(p, () => document.querySelectorAll('[data-testid=ep-imdb]').length >= 13);
await ok('opening Season 1 then asks for Season 1 only', async () => {
  assert.deepEqual(omdbLog.filter((x) => x.includes(':S')), ['tt4574334:S2', 'tt4574334:S1']);
  assert.deepEqual((await scoresIn(p, 1)).map((x) => x[1]), ['IMDb 8.5', 'IMDb 8.3', 'IMDb 8.4', 'IMDb 8.9 · best']);
});
await ok('the scores are saved on this device', async () => {
  const c = await p.evaluate(() => JSON.parse(localStorage.getItem('watchnext-ep-scores-v1')));
  assert.deepEqual(Object.keys(c).sort(), ['tt4574334:1', 'tt4574334:2']); assert.equal(c['tt4574334:2'].eps['9'], 9.2);
  assert.ok(!(await p.evaluate(() => localStorage.getItem('watchnext-state-v1'))).includes('imdb'), 'not in the synced library');
});
await p.reload({ waitUntil: 'networkidle0' }); await wait(400);
omdbLog = [];
await openShow(p); await openSeason(p, 2);
await until(p, () => document.querySelectorAll('[data-testid=ep-imdb]').length >= 9);
await ok('coming back later uses the saved scores: no new OMDb season lookups', async () => {
  assert.deepEqual(omdbLog.filter((x) => x.includes(':S')), []);
});
await p.close();

console.log('B. SPOILER SHIELD');
p = await open({ shield: true });
await openShow(p); await openSeason(p, 2);
await until(p, () => document.querySelectorAll('[data-testid=ep-imdb]').length >= 2);
await wait(500);
await ok('with Spoiler shield on, only watched episodes show a score (E01–E02), unwatched ones show none', async () => {
  const s = await scoresIn(p, 2);
  assert.deepEqual(s.filter((x) => x[1]).map((x) => x[0]), ['E01', 'E02']);
});
await p.close();

console.log('C. NO OMDb KEY');
DIST = APP_DIST; omdbLog = [];
p = await open();
await openShow(p); await openSeason(p, 2); await wait(800);
await ok('a site without an OMDb key shows no episode scores and makes no OMDb calls', async () => {
  assert.equal(await p.evaluate(() => document.querySelectorAll('[data-testid=ep-imdb]').length), 0);
  assert.deepEqual(omdbLog, []);
});
await p.close();

console.log(`\n${checks} checks passed`); console.log('PROBLEMS:', problems.length ? '\n' + problems.join('\n') : 'none'); await browser.close(); server.close();
if (problems.length) process.exit(1);
