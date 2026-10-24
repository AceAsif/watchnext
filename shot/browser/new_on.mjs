process.env.TZ = 'Australia/Hobart';
import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { workPath, browserFile, APP_DIST } from '../../tests/paths.mjs';
import { launchBrowser } from './launch.mjs';

// Watchlist → New (new on my services this week) and the Cast card in the movie sheet. TMDB mocked.
const PORT = 4202;
const DIST = APP_DIST; const OUT = workPath('out_newon'); fs.mkdirSync(OUT, { recursive: true });
const fontsCss = fs.readFileSync(browserFile('fonts.css'), 'utf8');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => { let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html'; const f = path.join(DIST, p); if (!f.startsWith(DIST) || !fs.existsSync(f)) { res.writeHead(404); return res.end('nf'); } res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res); });
await new Promise((r) => server.listen(PORT, r));
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const CORS = { 'access-control-allow-origin': '*' };
const FIXED = Date.parse('2026-10-21T22:00:00.000Z'); // 22 Oct 2026, 09:00 in Hobart
const STATE = () => ({ shows: {
  'tmdb:10': { tmdbId: 10, name: 'Slow Horses', followed: true, poster: null, status: 'Returning Series', providers: [], lastSynced: '2026-10-01T00:00:00Z', totalEpisodes: 24, seasons: [{ n: 1, count: 6 }], watched: { '1x1': { at: '2026-10-01T10:00:00Z' } } },
}, movies: [{ tmdbId: 949, name: 'Heat', status: 'watched', watchedAt: '2026-09-01T10:00:00.000Z', runtimeMin: 170, poster: null, year: '1995' }], settings: { tmdbKey: 'TESTKEY' } });
const SVC = { mine: ['netflix', 'stan'], region: 'AU', showsOnly: false, watchlistOnly: false };
const DISC = {
  'tv|8|air': [{ id: 10, name: 'Slow Horses', popularity: 20 }, { id: 31, name: 'Big Netflix Show', popularity: 80, first_air_date: '2023-02-02' }],
  'tv|8|first': [{ id: 32, name: 'Fresh Series', popularity: 40, first_air_date: '2026-10-10' }],
  'tv|21|air': [{ id: 32, name: 'Fresh Series', popularity: 40, first_air_date: '2026-10-10' }],
  'tv|21|first': [],
  'movie|8|': [{ id: 41, title: 'New Netflix Film', popularity: 60, release_date: '2026-09-30' }],
  'movie|21|': [{ id: 949, title: 'Heat', popularity: 10, release_date: '2026-08-01' }, { id: 41, title: 'New Netflix Film', popularity: 60, release_date: '2026-09-30' }],
};

const browser = await launchBrowser(puppeteer);
const problems = []; let checks = 0; const ok = async (n, f) => { await f(); checks++; console.log('  PASS', n); }; const wait = (ms = 350) => new Promise((r) => setTimeout(r, ms));
const until = async (page, fn, arg, ms = 6000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await page.evaluate(fn, arg)) return true; await wait(100); } throw new Error('timed out waiting for ' + fn.toString().slice(0, 90)); };
async function open({ w = 390, h = 844, svc = SVC } = {}) {
  const page = await browser.newPage(); await page.emulateTimezone('Australia/Hobart'); await page.setViewport({ width: w, height: h, deviceScaleFactor: 2 });
  page.on('pageerror', (e) => problems.push('pageerror: ' + e.message)); page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) problems.push('console.error: ' + m.text()); });
  await page.setBypassServiceWorker(true); await page.setRequestInterception(true);
  const log = [];
  page.on('request', (r) => {
    const u = r.url();
    if (u.startsWith('http://localhost:')) return r.continue();
    if (u.includes('fonts.googleapis.com')) return r.respond({ status: 200, contentType: 'text/css', body: fontsCss });
    if (u.includes('image.tmdb.org')) return r.respond({ status: 200, contentType: 'image/png', body: PNG });
    const j = (b) => r.respond({ status: 200, headers: CORS, contentType: 'application/json', body: JSON.stringify(b) });
    const url = new URL(u);
    if (/\/watch\/providers\/(movie|tv)$/.test(url.pathname)) return j({ results: [{ provider_id: 8, provider_name: 'Netflix' }, { provider_id: 21, provider_name: 'Stan' }, { provider_id: 337, provider_name: 'Disney Plus' }] });
    const d = /\/discover\/(tv|movie)$/.exec(url.pathname);
    if (d) {
      const q = url.searchParams; log.push(`${d[1]}|${q.get('with_watch_providers')}|${q.get('air_date.gte') || q.get('first_air_date.gte') || q.get('primary_release_date.gte')}`);
      const k = d[1] === 'tv' ? `tv|${q.get('with_watch_providers')}|${q.get('air_date.gte') ? 'air' : 'first'}` : `movie|${q.get('with_watch_providers')}|`;
      return j({ results: DISC[k] || [] });
    }
    if (/\/movie\/949$/.test(url.pathname) && (url.searchParams.get('append_to_response') || '').split(',').includes('credits')) return j({ id: 949, title: 'Heat', credits: { cast: [{ id: 1158, name: 'Al Pacino', character: 'Vincent Hanna', order: 0 }, { id: 380, name: 'Robert De Niro', character: 'Neil McCauley', order: 1 }], crew: [{ id: 2, name: 'Michael Mann', job: 'Director' }, { id: 2, name: 'Michael Mann', job: 'Screenplay' }] } });
    if (/\/movie\/41$/.test(url.pathname)) return j({ id: 41, title: 'New Netflix Film', release_date: '2026-09-30', runtime: 100, genres: [] });
    if (/\/movie\/949$/.test(url.pathname)) return j({ id: 949, title: 'Heat', runtime: 170, belongs_to_collection: null, genres: [] });
    if (/\/person\/1158\/combined_credits$/.test(url.pathname)) return j({ cast: [{ id: 949, media_type: 'movie', title: 'Heat', character: 'Vincent Hanna' }, { id: 10, media_type: 'tv', name: 'Slow Horses', character: 'Cameo', vote_count: 900 }, { id: 77, media_type: 'movie', title: 'The Irishman', character: 'Jimmy Hoffa', vote_count: 500 }], crew: [] });
    if (u.includes('api.themoviedb.org')) return j({ episodes: [], results: [], cast: [], crew: [] });
    return r.abort();
  });
  await page.evaluateOnNewDocument((s, svc, fixed) => {
    if (!sessionStorage.getItem('__s')) { localStorage.setItem('watchnext-state-v1', JSON.stringify(s)); if (svc) localStorage.setItem('watchnext-services-v1', JSON.stringify(svc)); else localStorage.removeItem('watchnext-services-v1'); localStorage.removeItem('watchnext-newon-v1'); sessionStorage.setItem('__s', '1'); }
    const RealDate = Date; const start = RealDate.now(); const b = fixed;
    class FakeDate extends RealDate { constructor(...a) { if (a.length === 0) super(b + (RealDate.now() - start)); else super(...a); } static now() { return b + (RealDate.now() - start); } }
    window.Date = FakeDate;
  }, STATE(), svc, FIXED);
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle0' }); await wait(400);
  return { page, log };
}
const tab = async (p, name) => { await p.evaluate((t) => [...document.querySelectorAll('nav.tabbar button')].find((x) => x.textContent.includes(t)).click(), name); await wait(400); };
const wtab = async (p, name) => { await p.evaluate((t) => [...document.querySelectorAll('.sd-tabs2 [role=tab]')].find((b) => b.textContent.startsWith(t)).click(), name); await wait(300); };
const section = (p, id) => p.evaluate((id) => { const s = document.querySelector(`[data-section=${id}]`); return s ? [...s.querySelectorAll('.sd-newon-card')].map((c) => c.querySelector('.sd-newon-body').innerText.replace(/\s+/g, ' ').trim()) : null; }, id);

console.log('A. NEW ON MY SERVICES');
let { page: p, log } = await open();
await tab(p, 'Watchlist');
await ok('Watchlist tabs: Queue, Lists, New, Discover (fit on a phone)', async () => {
  assert.deepEqual(await p.evaluate(() => [...document.querySelectorAll('.sd-tabs2 [role=tab]')].map((b) => b.textContent)), ['Queue', 'Lists', 'New', 'Discover']);
  assert.equal(await p.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false);
});
await wtab(p, 'New');
await until(p, () => document.querySelectorAll('.sd-newon-card').length > 0 && !/Looking for/.test(document.querySelector('[data-testid=newon]').innerText));
await ok('asks TMDB once per section per service, with the right date windows (7 / 30 / 90 days)', async () => {
  assert.deepEqual(log.slice().sort(), ['movie|21|2026-07-24', 'movie|8|2026-07-24', 'tv|21|2026-09-22', 'tv|21|2026-10-15', 'tv|8|2026-09-22', 'tv|8|2026-10-15']);
});
await ok('header names your services and region', async () => { assert.match(await p.evaluate(() => document.querySelector('.sd-newon-head').innerText), /On Netflix · Stan · AU/); });
await ok('New episodes: the show you follow first, then by popularity; each says which service', async () => {
  assert.deepEqual(await section(p, 'episodes'), ['Slow Horses Netflix Show You follow this', 'Big Netflix Show Netflix Show · 2023 ＋ Watchlist']);
});
await ok('New shows: a brand-new series is listed once (not again under episodes), on both services', async () => {
  assert.deepEqual(await section(p, 'series'), ['Fresh Series Netflix · Stan Show · 10 Oct 2026 ＋ Watchlist']);
});
await ok('New films: what you have watched is marked', async () => {
  assert.deepEqual(await section(p, 'films'), ['New Netflix Film Netflix · Stan Film · 30 Sep 2026 ＋ Watchlist', 'Heat Stan Film · 1 Aug 2026 Watched']);
});
await p.evaluate(() => [...document.querySelectorAll('.sd-newon-card')].find((c) => c.textContent.includes('New Netflix Film')).querySelector('.sd-btn').click());
await until(p, () => /On your watchlist/.test([...document.querySelectorAll('.sd-newon-card')].find((c) => c.textContent.includes('New Netflix Film')).innerText));
await ok('"＋ Watchlist" queues the film (and the card says so)', async () => {
  assert.ok(await p.evaluate(() => JSON.parse(localStorage.getItem('watchnext-state-v1')).movies.some((m) => m.tmdbId === 41 && m.status === 'planned')));
});
await ok('phone: no sideways scroll', async () => { assert.equal(await p.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false); });
await p.screenshot({ path: `${OUT}/newon_phone.png`, fullPage: true });
const before = log.length;
await wtab(p, 'Queue'); await wtab(p, 'New'); await wait(400);
await ok('coming back uses the saved answer (no new TMDB calls)', async () => { assert.equal(log.length, before); });
await p.evaluate(() => [...document.querySelectorAll('.sd-newon-head button')].find((b) => b.textContent === 'Refresh').click());
{ const t0 = Date.now(); while (log.length < before + 6 && Date.now() - t0 < 6000) await wait(100); }
await until(p, () => !/Looking for/.test(document.querySelector('[data-testid=newon]').innerText) && document.querySelectorAll('.sd-newon-card').length > 0);
await ok('Refresh asks TMDB again', async () => { assert.equal(log.length, before + 6); });
await p.evaluate(() => [...document.querySelectorAll('.sd-newon-card')].find((c) => c.textContent.includes('Slow Horses')).querySelector('.sd-newon-open').click()); await wait(500);
await ok('tapping a show you follow opens its page', async () => { assert.match(await p.evaluate(() => document.body.innerText), /Seasons/); });
await p.close();

({ page: p } = await open({ svc: null }));
await tab(p, 'Watchlist'); await wtab(p, 'New');
await ok('no services chosen: asks you to choose them', async () => { assert.match(await p.evaluate(() => document.querySelector('[data-testid=newon]').innerText), /Which services do you pay for\?[\s\S]*Choose my services/); });
await p.close();

console.log('B. CAST IN THE MOVIE SHEET');
({ page: p } = await open());
await tab(p, 'Movies');
await p.evaluate(() => [...document.querySelectorAll('.sd-lgrid .sd-ltile')].find((t) => /Heat/.test(t.getAttribute('aria-label'))).click());
await until(p, () => /Al Pacino/.test((document.querySelector('[data-testid=movie-cast]') || {}).innerText || ''));
await ok('the movie sheet shows the cast (billing order) and the crew row', async () => {
  const t = await p.evaluate(() => document.querySelector('[data-testid=movie-cast]').innerText.replace(/\s+/g, ' '));
  assert.match(t, /Cast/); assert.match(t, /Al Pacino, Robert De Niro/); assert.match(t, /Full crew · 1 director/);
});
await p.evaluate(() => document.querySelector('[data-testid=movie-cast] button[aria-label="Cast: see all"]').click()); await wait(300);
await ok('"See all" lists everyone with their character', async () => {
  assert.match(await p.evaluate(() => [...document.querySelectorAll('[role=dialog]')].pop().innerText.replace(/\s+/g, ' ')), /Al Pacino Vincent Hanna RD Robert De Niro Neil McCauley/);
});
await p.evaluate(() => [...document.querySelectorAll('.sd-cast-cell')][0].click());
await until(p, () => /The Irishman/.test(document.body.innerText));
await ok('tapping an actor shows their other titles (not this film), with "✓ In library" for ones you have', async () => {
  const t = await p.evaluate(() => [...document.querySelectorAll('[role=dialog]')].pop().innerText.replace(/\s+/g, ' '));
  assert.match(t, /Slow Horses TV · Cameo ✓ In library/); assert.match(t, /The Irishman/); assert.doesNotMatch(t, /Heat Film/);
});
await p.close();

console.log(`\n${checks} checks passed`); console.log('PROBLEMS:', problems.length ? '\n' + problems.join('\n') : 'none'); await browser.close(); server.close();
