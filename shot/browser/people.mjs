process.env.TZ = 'Australia/Hobart';
import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { workPath, browserFile, APP_DIST } from '../../tests/paths.mjs';
import { launchBrowser } from './launch.mjs';

// Follow a person (from a Cast & crew list) and the Up Next banner "New from people you follow". TMDB mocked.
const PORT = 4203;
const DIST = APP_DIST; const OUT = workPath('out_people'); fs.mkdirSync(OUT, { recursive: true });
const fontsCss = fs.readFileSync(browserFile('fonts.css'), 'utf8');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => { let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html'; const f = path.join(DIST, p); if (!f.startsWith(DIST) || !fs.existsSync(f)) { res.writeHead(404); return res.end('nf'); } res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res); });
await new Promise((r) => server.listen(PORT, r));
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const CORS = { 'access-control-allow-origin': '*' };
const FIXED = Date.parse('2026-10-21T22:00:00.000Z'); // 22 Oct 2026 in Hobart
const STATE = () => ({ shows: { 'tmdb:1': { tmdbId: 1, name: 'Dark', followed: true, poster: null, status: 'Ended', providers: [], lastSynced: '2026-10-01T00:00:00Z', totalEpisodes: 10, seasons: [{ n: 1, count: 10 }], watched: { '1x1': { at: '2026-10-01T10:00:00Z' } } } }, movies: [], settings: { tmdbKey: 'TESTKEY' } });
const CREDITS = { cast: [
  { id: 501, media_type: 'movie', title: 'Out Now Film', release_date: '2026-10-10', character: 'Lead', vote_count: 10 },
  { id: 502, media_type: 'movie', title: 'Coming Soon Film', release_date: '2027-01-15', character: 'Villain' },
  { id: 503, media_type: 'tv', name: 'Talk Tonight', first_air_date: '2026-10-15', character: 'Guest', genre_ids: [10767] },
  { id: 1, media_type: 'tv', name: 'Dark', first_air_date: '2017-12-01', character: 'Jonas' },
  { id: 504, media_type: 'tv', name: 'New Series', first_air_date: '2026-10-01', character: 'Detective' },
  { id: 505, media_type: 'movie', title: 'Old Film', release_date: '2001-01-01', character: 'Kid' },
], crew: [] };

const browser = await launchBrowser(puppeteer);
const problems = []; let checks = 0; const ok = async (n, f) => { await f(); checks++; console.log('  PASS', n); }; const wait = (ms = 350) => new Promise((r) => setTimeout(r, ms));
const until = async (page, fn, arg, ms = 6000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await page.evaluate(fn, arg)) return true; await wait(100); } throw new Error('timed out waiting for ' + fn.toString().slice(0, 90)); };
async function open({ w = 390, h = 844 } = {}) {
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
    if (url.pathname.endsWith('/tv/1') && url.searchParams.get('append_to_response') === 'aggregate_credits') return j({ id: 1, name: 'Dark', created_by: [], aggregate_credits: { cast: [{ id: 77, name: 'Louis Hofmann', profile_path: null, roles: [{ character: 'Jonas' }] }], crew: [] } });
    if (url.pathname.endsWith('/person/77/combined_credits')) { log.push('p77'); return j(CREDITS); }
    if (/\/movie\/501$/.test(url.pathname)) return j({ id: 501, title: 'Out Now Film', release_date: '2026-10-10', runtime: 100, genres: [] });
    if (u.includes('api.themoviedb.org')) return j({ episodes: [], results: [], cast: [], crew: [] });
    return r.abort();
  });
  await page.evaluateOnNewDocument((s, fixed) => {
    if (!sessionStorage.getItem('__s')) { localStorage.setItem('watchnext-state-v1', JSON.stringify(s)); localStorage.removeItem('watchnext-people-credits-v1'); sessionStorage.setItem('__s', '1'); }
    const RealDate = Date; const start = RealDate.now(); const b = fixed;
    class FakeDate extends RealDate { constructor(...a) { if (a.length === 0) super(b + (RealDate.now() - start)); else super(...a); } static now() { return b + (RealDate.now() - start); } }
    window.Date = FakeDate;
  }, STATE(), FIXED);
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle0' }); await wait(400);
  return { page, log };
}
const tab = async (p, name) => { await p.evaluate((t) => [...document.querySelectorAll('nav.tabbar button')].find((x) => x.textContent.includes(t)).click(), name); await wait(400); };
const banner = (p) => p.evaluate(() => { const b = document.querySelector('[data-testid=people-news]'); return b ? [...b.querySelectorAll('.sd-pnews-row')].map((r) => r.querySelector('.sd-pnews-body').innerText.replace(/\s+/g, ' ').trim()) : null; });

console.log('A. FOLLOW');
let { page: p, log } = await open();
await ok('Up Next has no banner while you follow nobody', async () => { assert.equal(await banner(p), null); });
await tab(p, 'Shows');
await p.evaluate(() => [...document.querySelectorAll('button.sd-ltile')].find((b) => b.textContent.includes('Dark')).click());
await until(p, () => !!document.querySelector('button[aria-label="Cast: see all"]'));
await p.evaluate(() => document.querySelector('button[aria-label="Cast: see all"]').click()); await wait(250);
await p.evaluate(() => [...document.querySelectorAll('.sd-cast-cell')][0].click());
await until(p, () => !!document.querySelector('[data-testid=follow-row]'));
await ok('tapping someone in the cast shows a Follow button above their other titles', async () => {
  assert.match(await p.evaluate(() => document.querySelector('[data-testid=follow-row]').innerText), /Follow to see their new films and shows on Up Next[\s\S]*Follow/);
});
await p.evaluate(() => document.querySelector('[data-testid=follow-row] button').click()); await wait(200);
await ok('Follow → "Following ✓", saved with their name', async () => {
  assert.match(await p.evaluate(() => document.querySelector('[data-testid=follow-row] button').textContent), /Following ✓/);
  const pe = await p.evaluate(() => JSON.parse(localStorage.getItem('watchnext-state-v1')).people['77']);
  assert.equal(pe.on, true); assert.equal(pe.name, 'Louis Hofmann');
});
await p.keyboard.press('Escape'); await wait(150); await p.keyboard.press('Escape'); await wait(150);

console.log('B. THE BANNER');
await tab(p, 'Up Next');
await until(p, () => document.querySelectorAll('[data-testid=people-news] .sd-pnews-row').length > 0);
await ok('Up Next: "New from people you follow" lists what is out now (newest first), then what is coming', async () => {
  assert.deepEqual(await banner(p), [
    'Out Now Film Louis Hofmann · as Lead Film · Out 10 Oct 2026',
    'New Series Louis Hofmann · as Detective Show · Out 1 Oct 2026',
    'Coming Soon Film Louis Hofmann · as Villain Film · Coming 15 Jan 2027',
  ]);
});
await ok('talk shows, old titles and shows already in your library are left out; header counts and names the follows', async () => {
  const t = await p.evaluate(() => document.querySelector('[data-testid=people-news]').innerText);
  assert.doesNotMatch(t, /Talk Tonight|Old Film|Dark/); assert.match(t, /New from people you follow · 3/i); assert.match(t, /Following 1 · Manage/);
});
await p.screenshot({ path: `${OUT}/banner_full_phone.png` });
await p.evaluate(() => [...document.querySelectorAll('.sd-pnews-row')].find((r) => r.textContent.includes('Out Now Film')).querySelector('.sd-btn').click());
await until(p, () => !/Out Now Film/.test(document.querySelector('[data-testid=people-news]').innerText));
await ok('＋ Watchlist adds the film and it leaves the banner (it is in your library now)', async () => {
  assert.ok(await p.evaluate(() => JSON.parse(localStorage.getItem('watchnext-state-v1')).movies.some((m) => m.tmdbId === 501 && m.status === 'planned')));
});
await p.evaluate(() => document.querySelector('[aria-label="Hide New Series"]').click()); await wait(200);
await ok('✕ hides a title for good (remembered, so it syncs)', async () => {
  assert.deepEqual((await banner(p)).map((x) => x.split(' Louis')[0]), ['Coming Soon Film']);
  assert.deepEqual(await p.evaluate(() => JSON.parse(localStorage.getItem('watchnext-state-v1')).people['77'].dismissed), ['tv:504']);
});
await ok('phone: no sideways scroll', async () => { assert.equal(await p.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false); });
await p.screenshot({ path: `${OUT}/banner_phone.png` });
const calls = log.length;
await p.reload({ waitUntil: 'networkidle0' }); await wait(500);
await ok('after a reload the banner is back from the saved credits (no new TMDB call)', async () => {
  assert.deepEqual((await banner(p)).length, 1); assert.equal(log.length, calls);
});

console.log('C. MANAGE / UNFOLLOW');
await p.evaluate(() => [...document.querySelectorAll('[data-testid=people-news] button')].find((b) => /Manage/.test(b.textContent)).click());
await until(p, () => !!document.querySelector('[data-testid=people-manage]'));
await p.evaluate(() => [...document.querySelectorAll('[data-testid=people-manage] button')].find((b) => b.textContent === 'Unfollow').click()); await wait(300);
await p.keyboard.press('Escape'); await wait(200);
await ok('Unfollow from Manage: the banner goes away', async () => { assert.equal(await banner(p), null); });
await p.close();

console.log(`\n${checks} checks passed`); console.log('PROBLEMS:', problems.length ? '\n' + problems.join('\n') : 'none'); await browser.close(); server.close();
