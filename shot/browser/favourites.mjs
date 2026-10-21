process.env.TZ = 'Australia/Hobart';
import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { workPath, browserFile, APP_DIST } from '../../tests/paths.mjs';
import { launchBrowser } from './launch.mjs';

// Favourites (♥ on the show page → top of Shows and Up Next) and episode summaries (tap an
// episode title to read TMDB's summary). TMDB mocked.
const PORT = 4201;
const DIST = APP_DIST; const OUT = workPath('out_fav'); fs.mkdirSync(OUT, { recursive: true });
const fontsCss = fs.readFileSync(browserFile('fonts.css'), 'utf8');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => { let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html'; const f = path.join(DIST, p); if (!f.startsWith(DIST) || !fs.existsSync(f)) { res.writeHead(404); return res.end('nf'); } res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res); });
await new Promise((r) => server.listen(PORT, r));
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const CORS = { 'access-control-allow-origin': '*' };
const FIXED = Date.parse('2026-10-21T08:00:00.000Z');
const ep = (d) => ({ at: `${d}T10:00:00.000Z`, min: 50 });
const mk = (id, name, last) => ({ tmdbId: id, name, followed: true, poster: null, status: 'Ended', providers: [], lastSynced: '2026-10-01T00:00:00Z', runtimeMin: 50, genres: ['Drama'], totalEpisodes: 10, seasons: [{ n: 1, count: 10 }], watched: { '1x1': ep(last) } });
const STATE = () => ({ shows: { 'tmdb:1': mk(1, 'Alpha', '2026-10-10'), 'tmdb:2': mk(2, 'Bravo', '2026-10-15'), 'tmdb:3': mk(3, 'Zulu', '2026-09-01') }, movies: [], settings: { tmdbKey: 'TESTKEY' } });
const SEASON = { episodes: Array.from({ length: 10 }, (_, i) => ({ id: 900 + i, episode_number: i + 1, name: `Zulu ep ${i + 1}`, runtime: 50, air_date: '2020-01-0' + ((i % 9) + 1), overview: i === 2 ? '' : `In episode ${i + 1}, a secret comes out.` })) };

const browser = await launchBrowser(puppeteer);
const problems = []; let checks = 0; const ok = async (n, f) => { await f(); checks++; console.log('  PASS', n); }; const wait = (ms = 350) => new Promise((r) => setTimeout(r, ms));
const until = async (page, fn, arg, ms = 6000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await page.evaluate(fn, arg)) return true; await wait(100); } throw new Error('timed out waiting for ' + fn.toString().slice(0, 90)); };
async function open({ w = 390, h = 844 } = {}) {
  const page = await browser.newPage(); await page.emulateTimezone('Australia/Hobart'); await page.setViewport({ width: w, height: h, deviceScaleFactor: 2 });
  page.on('pageerror', (e) => problems.push('pageerror: ' + e.message)); page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) problems.push('console.error: ' + m.text()); });
  await page.setBypassServiceWorker(true); await page.setRequestInterception(true);
  page.on('request', (r) => {
    const u = r.url();
    if (u.startsWith('http://localhost:')) return r.continue();
    if (u.includes('fonts.googleapis.com')) return r.respond({ status: 200, contentType: 'text/css', body: fontsCss });
    if (u.includes('image.tmdb.org')) return r.respond({ status: 200, contentType: 'image/png', body: PNG });
    const j = (b) => r.respond({ status: 200, headers: CORS, contentType: 'application/json', body: JSON.stringify(b) });
    if (/\/tv\/\d+\/season\/1\?/.test(u)) return j(SEASON);
    if (u.includes('api.themoviedb.org')) return j({ episodes: [], results: [], cast: [], crew: [] });
    return r.abort();
  });
  await page.evaluateOnNewDocument((s, fixed) => {
    if (!sessionStorage.getItem('__s')) { localStorage.setItem('watchnext-state-v1', JSON.stringify(s)); sessionStorage.setItem('__s', '1'); }
    const RealDate = Date; const start = RealDate.now(); const b = fixed;
    class FakeDate extends RealDate { constructor(...a) { if (a.length === 0) super(b + (RealDate.now() - start)); else super(...a); } static now() { return b + (RealDate.now() - start); } }
    window.Date = FakeDate;
  }, STATE(), FIXED);
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle0' }); await wait(400);
  return page;
}
const tab = async (p, name) => { await p.evaluate((t) => [...document.querySelectorAll('nav.tabbar button')].find((x) => x.textContent.includes(t)).click(), name); await wait(400); };
const shelf = (p) => p.evaluate(() => [...document.querySelectorAll('button.sd-ltile')].map((b) => b.querySelector('.sd-ltile-name').textContent));
const upNext = (p) => p.evaluate(() => { const lbl = [...document.querySelectorAll('.sd-lbl')].find((x) => /Continue watching/.test(x.textContent)); const sec = lbl.closest('section') || lbl.parentElement.parentElement; return [...sec.querySelectorAll('button[aria-label^="Mark "]')].map((b) => b.getAttribute('aria-label').replace(/^Mark (.*) S\d+.*$/, '$1')); });

console.log('A. FAVOURITE A SHOW');
let p = await open();
await tab(p, 'Shows');
await ok('before: Shows is A–Z (Alpha, Bravo, Zulu)', async () => { assert.deepEqual(await shelf(p), ['Alpha', 'Bravo', 'Zulu']); });
await p.evaluate(() => [...document.querySelectorAll('button.sd-ltile')].find((b) => b.textContent.includes('Zulu')).click());
await until(p, () => !!document.querySelector('.sd-favbtn'));
await ok('the show page has a ♥ button next to ⋯, off at first', async () => {
  assert.equal(await p.evaluate(() => document.querySelector('.sd-favbtn').getAttribute('aria-pressed')), 'false');
  assert.equal(await p.evaluate(() => document.querySelector('.sd-favbtn').getAttribute('aria-label')), 'Add to favourites');
});
await p.evaluate(() => document.querySelector('.sd-favbtn').click()); await wait(200);
await ok('tapping ♥ makes Zulu a favourite (saved)', async () => {
  assert.equal(await p.evaluate(() => document.querySelector('.sd-favbtn').getAttribute('aria-pressed')), 'true');
  assert.equal(await p.evaluate(() => JSON.parse(localStorage.getItem('watchnext-state-v1')).shows['tmdb:3'].favourite), true);
});

console.log('B. EPISODE SUMMARIES');
await until(p, () => document.querySelectorAll('.sd-ep-title').length >= 9);
await ok('summaries are hidden until you tap (no spoilers)', async () => { assert.equal(await p.evaluate(() => document.querySelectorAll('[data-testid=episode-summary]').length), 0); });
await p.evaluate(() => [...document.querySelectorAll('.sd-ep-title')].find((b) => b.textContent === 'Zulu ep 2').click()); await wait(200);
await ok('tapping an episode title shows its TMDB summary, air date and runtime', async () => {
  const t = await p.evaluate(() => document.querySelector('[data-testid=episode-summary]').innerText.replace(/\s+/g, ' '));
  assert.match(t, /In episode 2, a secret comes out\. Aired 2 Jan 2020 · 50 min/);
});
await p.evaluate(() => [...document.querySelectorAll('.sd-ep-title')].find((b) => b.textContent === 'Zulu ep 3').click()); await wait(200);
await ok('one summary at a time; an episode with no summary says so', async () => {
  const all = await p.evaluate(() => [...document.querySelectorAll('[data-testid=episode-summary]')].map((x) => x.innerText));
  assert.equal(all.length, 1); assert.match(all[0], /TMDB has no summary for this episode yet/);
});
await p.evaluate(() => [...document.querySelectorAll('.sd-ep-title')].find((b) => b.textContent === 'Zulu ep 3').click()); await wait(200);
await ok('tapping again hides it', async () => { assert.equal(await p.evaluate(() => document.querySelectorAll('[data-testid=episode-summary]').length), 0); });
await p.evaluate(() => [...document.querySelectorAll('.sd-ep-title')].find((b) => b.textContent === 'Zulu ep 4').click()); await wait(200);
await ok('phone: no sideways scroll with a summary open', async () => { assert.equal(await p.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false); });
await p.evaluate(() => document.querySelector('[data-testid=episode-summary]').scrollIntoView({ block: 'center' })); await wait(150);
await p.screenshot({ path: `${OUT}/summary_phone.png` });

console.log('C. FAVOURITES AT THE TOP');
await p.evaluate(() => [...document.querySelectorAll('button')].find((x) => /back/i.test(x.getAttribute('aria-label') || x.textContent)).click()); await wait(400);
await ok('Shows: Zulu is now first, with a ♥', async () => {
  assert.deepEqual(await shelf(p), ['♥ Zulu', 'Alpha', 'Bravo']);
});
await p.evaluate(() => { const s = [...document.querySelectorAll('select')].find((x) => [...x.options].some((o) => o.value === 'Rating' || o.textContent === 'Rating')); if (s) { s.value = [...s.options].find((o) => /Recently watched/.test(o.textContent)).value; s.dispatchEvent(new Event('change', { bubbles: true })); } }); await wait(300);
await ok('a different sort keeps the favourite on top', async () => { assert.equal((await shelf(p))[0], '♥ Zulu'); });
await tab(p, 'Up Next');
await ok('Up Next "Continue watching": Zulu first (even though watched longest ago), then by most recent', async () => {
  assert.deepEqual(await upNext(p), ['Zulu', 'Bravo', 'Alpha']);
});
await p.screenshot({ path: `${OUT}/upnext_phone.png` });
await tab(p, 'Shows');
await p.evaluate(() => [...document.querySelectorAll('button.sd-ltile')].find((b) => b.textContent.includes('Zulu')).click()); await until(p, () => !!document.querySelector('.sd-favbtn'));
await p.evaluate(() => document.querySelector('.sd-favbtn').click()); await wait(200);
await ok('tapping ♥ again removes it (the field is gone, not false)', async () => {
  assert.equal(await p.evaluate(() => 'favourite' in JSON.parse(localStorage.getItem('watchnext-state-v1')).shows['tmdb:3']), false);
});
await tab(p, 'Up Next');
await ok('Up Next is back to most recent first', async () => { assert.deepEqual(await upNext(p), ['Bravo', 'Alpha', 'Zulu']); });
await p.close();

console.log(`\n${checks} checks passed`); console.log('PROBLEMS:', problems.length ? '\n' + problems.join('\n') : 'none'); await browser.close(); server.close();
