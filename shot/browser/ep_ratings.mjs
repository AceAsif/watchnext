process.env.TZ = 'Australia/Hobart';
import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { workPath, browserFile, APP_DIST } from '../../tests/paths.mjs';
import { launchBrowser } from './launch.mjs';

// Episode ratings: rate an episode (half stars) from its sheet, see it on the row, and the
// show page's "Your episode ratings" card (best episode + a rating line per season). TMDB mocked.
const PORT = 4199;
const DIST = APP_DIST; const OUT = workPath('out_epr'); fs.mkdirSync(OUT, { recursive: true });
const fontsCss = fs.readFileSync(browserFile('fonts.css'), 'utf8');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => { let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html'; const f = path.join(DIST, p); if (!f.startsWith(DIST) || !fs.existsSync(f)) { res.writeHead(404); return res.end('nf'); } res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res); });
await new Promise((r) => server.listen(PORT, r));
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const CORS = { 'access-control-allow-origin': '*' };
const season = (n, count) => ({ episodes: Array.from({ length: count }, (_, i) => ({ id: n * 100 + i + 1, episode_number: i + 1, name: `S${n} Ep ${i + 1}`, runtime: 50, air_date: '2020-01-0' + ((i % 9) + 1) })) });
const ep = (d) => ({ at: `${d}T10:00:00.000Z`, min: 50 });
const STATE = () => ({ shows: {
  'tmdb:1': { tmdbId: 1, name: 'Dark', followed: true, poster: null, status: 'Ended', providers: [], lastSynced: '2026-10-01T00:00:00Z', runtimeMin: 50, genres: ['Drama'], totalEpisodes: 18, seasons: [{ n: 1, count: 10 }, { n: 2, count: 8 }],
    watched: { '1x1': ep('2026-10-01'), '1x2': ep('2026-10-02'), '1x3': ep('2026-10-03'), '1x4': ep('2026-10-04') } },
}, movies: [], settings: { tmdbKey: 'TESTKEY' } });
const FIXED = Date.parse('2026-10-21T08:00:00.000Z');

const browser = await launchBrowser(puppeteer);
const problems = []; let checks = 0; const ok = async (n, f) => { await f(); checks++; console.log('  PASS', n); }; const wait = (ms = 350) => new Promise((r) => setTimeout(r, ms));
const until = async (page, fn, arg, ms = 6000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await page.evaluate(fn, arg)) return true; await wait(100); } throw new Error('timed out waiting for ' + fn.toString().slice(0, 80)); };
async function open({ w = 390, h = 844 } = {}) {
  const page = await browser.newPage(); await page.emulateTimezone('Australia/Hobart'); await page.setViewport({ width: w, height: h, deviceScaleFactor: 2 });
  page.on('pageerror', (e) => problems.push('pageerror: ' + e.message)); page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) problems.push('console.error: ' + m.text()); });
  await page.setBypassServiceWorker(true); await page.setRequestInterception(true);
  page.on('request', (r) => {
    const u = r.url();
    if (u.startsWith('http://localhost:')) return r.continue();
    if (u.includes('fonts.googleapis.com')) return r.respond({ status: 200, contentType: 'text/css', body: fontsCss });
    if (u.includes('image.tmdb.org')) return r.respond({ status: 200, contentType: 'image/png', body: PNG });
    const m = /\/tv\/1\/season\/(\d+)\?/.exec(u);
    if (m) return r.respond({ status: 200, headers: CORS, contentType: 'application/json', body: JSON.stringify(season(+m[1], m[1] === '1' ? 10 : 8)) });
    if (u.includes('api.themoviedb.org')) return r.respond({ status: 200, headers: CORS, contentType: 'application/json', body: '{"episodes":[],"results":[],"cast":[],"crew":[]}' });
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
const openShow = async (p) => {
  await p.evaluate(() => [...document.querySelectorAll('nav.tabbar button')].find((x) => x.textContent.includes('Shows')).click()); await wait(400);
  await p.evaluate(() => { const a = document.querySelector('.sd-lstatus [role=tab]'); if (a) a.click(); }); await wait(200);
  await p.evaluate(() => [...document.querySelectorAll('button.sd-ltile')].find((b) => b.textContent.includes('Dark')).click());
  await until(p, () => document.querySelectorAll('.sd-ep').length > 3);
  await p.evaluate(() => { const f = document.querySelector('.sd-foldrow'); if (f && f.getAttribute('aria-expanded') === 'false') f.click(); }); await wait(250);
};
const stored = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('watchnext-state-v1')).shows['tmdb:1'].epRatings || null);
const openSheet = async (p, code) => { await p.evaluate((c) => [...document.querySelectorAll('button[aria-label]')].find((b) => b.getAttribute('aria-label').endsWith(' ' + c) && /rat/i.test(b.getAttribute('aria-label'))).click(), code); await until(p, () => !!document.querySelector('[data-testid=episode-rating]')); };
const closeSheet = async (p) => { await p.evaluate(() => document.querySelector('[role=dialog] .sd-xbtn').click()); await wait(300); };
const star = async (p, n, half = false) => { const h = (await p.$$('[data-testid=episode-rating] .stars button'))[n - 1]; const box = await h.boundingBox(); await p.mouse.click(box.x + (half ? box.width * 0.2 : box.width * 0.8), box.y + box.height / 2); await wait(250); };
const rowSub = (p, n) => p.evaluate((n) => { const row = [...document.querySelectorAll('.sd-ep')].find((r) => r.textContent.includes(`S1 Ep ${n}`)); return row ? row.innerText.replace(/\s+/g, ' ') : ''; }, n);

console.log('A. RATE FROM THE EPISODE SHEET');
let p = await open();
await openShow(p);
await ok('before any rating: no "Your episode ratings" card; watched episodes offer "Rate or add a note"', async () => {
  assert.equal(await p.evaluate(() => document.querySelector('[data-testid=episode-ratings]')), null);
  assert.ok(await p.evaluate(() => [...document.querySelectorAll('button[aria-label]')].some((b) => b.getAttribute('aria-label') === 'Rate or add a note for S1E1')));
});
await openSheet(p, 'S1E1');
await ok('the episode sheet has "Your rating" above the reactions, starting at "Not rated"', async () => {
  assert.match(await p.evaluate(() => document.querySelector('[data-testid=episode-rating]').innerText), /Your rating[\s\S]*Not rated/i);
  assert.ok(await p.evaluate(() => { const d = document.querySelector('[role=dialog]'); const t = d.innerText.toLowerCase(); return t.indexOf('your rating') < t.indexOf('loved it'); }));
});
await star(p, 5, true);
await ok('tapping the left half of the 5th star gives 4.5, saved at once with the episode title', async () => {
  assert.match(await p.evaluate(() => document.querySelector('[data-testid=episode-rating]').innerText), /4\.5 \/ 5/);
  const r = await stored(p); assert.equal(r['1x1'].r, 4.5); assert.equal(r['1x1'].t, 'S1 Ep 1'); assert.ok(r['1x1'].at);
});
await closeSheet(p);
await ok('the episode row shows the rating next to the watched date', async () => { assert.match(await rowSub(p, 1), /Watched 1 Oct 2026 · ★ 4\.5/); });
await openSheet(p, 'S1E2'); await star(p, 5); await closeSheet(p);
await openSheet(p, 'S1E3'); await star(p, 2); await closeSheet(p);
await ok('three ratings stored: 4.5, 5, 2', async () => { const r = await stored(p); assert.deepEqual(['1x1', '1x2', '1x3'].map((k) => r[k].r), [4.5, 5, 2]); });

console.log('B. YOUR EPISODE RATINGS CARD');
await until(p, () => !!document.querySelector('[data-testid=episode-ratings]'));
const card = () => p.evaluate(() => document.querySelector('[data-testid=episode-ratings]').innerText.replace(/\s+/g, ' '));
await ok('header: 3 rated, average 3.8', async () => { assert.match(await card(), /3 rated · avg ★3\.8/); });
await ok('best episode: S1E2 "S1 Ep 2" with five stars', async () => {
  const b = await p.evaluate(() => document.querySelector('[data-testid=best-episode]').innerText.replace(/\s+/g, ' '));
  assert.match(b, /Best episode S1E2 S1 Ep 2/i);
  assert.equal(await p.evaluate(() => document.querySelector('[data-testid=best-episode] .stars').getAttribute('aria-label')), '5 out of 5 stars');
});
await ok('season 1 line: avg 3.8, "3 of 10 rated", three dots joined by a line, the best dot filled', async () => {
  const s = await p.evaluate(() => { const el = document.querySelector('.sd-epr-season[data-season="1"]'); return { text: el.innerText.replace(/\s+/g, ' '), dots: el.querySelectorAll('circle.sd-epr-dot').length, best: el.querySelectorAll('circle.sd-epr-dot.best').length, line: !!el.querySelector('path.sd-epr-line'), axis: el.querySelector('.sd-epr-axis').innerText.replace(/\s+/g, ' ') }; });
  assert.match(s.text, /S01 avg ★3\.8 3 of 10 rated/); assert.equal(s.dots, 3); assert.equal(s.best, 1); assert.equal(s.line, true); assert.equal(s.axis, 'E1 E10');
});
await ok('dots climb with the rating: the 5-star dot is highest, the 2-star dot lowest', async () => {
  const ys = await p.evaluate(() => [...document.querySelectorAll('.sd-epr-season[data-season="1"] circle')].map((c) => +c.getAttribute('cy')));
  assert.ok(ys[1] < ys[0] && ys[0] < ys[2], JSON.stringify(ys));
});

console.log('C. CHANGE, CLEAR, KEEP');
await openSheet(p, 'S1E3'); await star(p, 2);
await ok('tapping the current star again clears the rating', async () => {
  assert.match(await p.evaluate(() => document.querySelector('[data-testid=episode-rating]').innerText), /Not rated/);
  assert.equal((await stored(p))['1x3'], undefined);
});
await closeSheet(p);
await ok('the card updates: 2 rated, avg 4.8', async () => { assert.match(await card(), /2 rated · avg ★4\.8/); });
await p.evaluate(() => [...document.querySelectorAll('.sd-check[aria-label]')].find((b) => b.getAttribute('aria-label') === 'Mark S1E1 unwatched').click()); await wait(300);
await ok('un-marking an episode keeps its rating (and the row still opens the sheet)', async () => {
  assert.equal((await stored(p))['1x1'].r, 4.5);
  assert.match(await rowSub(p, 1), /★ 4\.5/);
  assert.ok(await p.evaluate(() => [...document.querySelectorAll('button[aria-label]')].some((b) => b.getAttribute('aria-label') === 'Edit rating and note for S1E1')));
});
await ok('phone: no sideways scroll', async () => { assert.equal(await p.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false); });
await p.evaluate(() => document.querySelector('[data-testid=episode-ratings]').scrollIntoView()); await wait(200);
await p.screenshot({ path: `${OUT}/ep_ratings_phone.png` });
await p.reload({ waitUntil: 'networkidle0' }); await wait(400);
await openShow(p);
await ok('after a reload the ratings and the card are still there', async () => { assert.match(await card(), /2 rated · avg ★4\.8/); });
await p.close();

console.log('D. DESKTOP');
p = await open({ w: 1280, h: 900 });
await openShow(p);
await openSheet(p, 'S1E4'); await star(p, 3, true); await closeSheet(p);
await until(p, () => !!document.querySelector('[data-testid=episode-ratings]'));
await ok('desktop: card shows, no sideways scroll', async () => { assert.equal(await p.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false); assert.match(await card(), /1 rated · avg ★2\.5/); });
await p.evaluate(() => document.querySelector('[data-testid=episode-ratings]').scrollIntoView()); await wait(200);
await p.screenshot({ path: `${OUT}/ep_ratings_desktop.png` });
await p.close();

console.log(`\n${checks} checks passed`); console.log('PROBLEMS:', problems.length ? '\n' + problems.join('\n') : 'none'); await browser.close(); server.close();
