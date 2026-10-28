process.env.TZ = 'Australia/Hobart';
import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { workPath, browserFile, APP_DIST } from '../../tests/paths.mjs';
import { launchBrowser } from './launch.mjs';

// Credits: TMDB's required notice ("This product uses the TMDB API but is not endorsed or
// certified by TMDB.") at the bottom of Settings and of Help & FAQ, with JustWatch / OMDb /
// AniList credits; and a searchable Help answer about where the data comes from.
const PORT = 4256;
const DIST = APP_DIST;
const fontsCss = fs.readFileSync(browserFile('fonts.css'), 'utf8');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => { let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html'; const f = path.join(DIST, p); if (!f.startsWith(DIST) || !fs.existsSync(f)) { res.writeHead(404); return res.end('nf'); } res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res); });
await new Promise((r) => server.listen(PORT, r));
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const CORS = { 'access-control-allow-origin': '*' };
const FIXED = Date.parse('2026-10-21T22:00:00.000Z');
const STATE = () => ({ shows: {
  'tmdb:1': { tmdbId: 1, name: 'Dark', followed: true, runtimeMin: 50, totalEpisodes: 3, seasons: [{ n: 1, count: 3 }], lastSynced: '2026-10-21T00:00:00Z', watched: { '1x1': { at: '2026-10-01T10:00:00.000Z', min: 50 } } },
}, movies: [], settings: { tmdbKey: 'TESTKEY' } });

const browser = await launchBrowser(puppeteer);
const problems = []; let checks = 0; const ok = async (n, f) => { await f(); checks++; console.log('  PASS', n); }; const wait = (ms = 350) => new Promise((r) => setTimeout(r, ms));
async function open({ w = 390, h = 844 } = {}) {
  const page = await browser.newPage(); await page.emulateTimezone('Australia/Hobart'); await page.setViewport({ width: w, height: h, deviceScaleFactor: 2 });
  page.on('pageerror', (e) => problems.push('pageerror: ' + e.message)); page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) problems.push('console.error: ' + m.text()); });
  await page.setBypassServiceWorker(true); await page.setRequestInterception(true);
  page.on('request', (r) => {
    const u = r.url();
    if (u.startsWith('http://localhost:')) return r.continue();
    if (u.includes('fonts.googleapis.com')) return r.respond({ status: 200, contentType: 'text/css', body: fontsCss });
    if (u.includes('image.tmdb.org')) return r.respond({ status: 200, contentType: 'image/png', body: PNG });
    if (u.includes('api.themoviedb.org')) return r.respond({ status: 200, headers: CORS, contentType: 'application/json', body: JSON.stringify({ results: [], episodes: [], cast: [], crew: [] }) });
    return r.abort();
  });
  await page.evaluateOnNewDocument((s, fixed) => {
    if (!sessionStorage.getItem('__s')) { localStorage.setItem('watchnext-state-v1', JSON.stringify(s)); localStorage.setItem('watchnext-badges-seen-v1', JSON.stringify({ v: 1, levels: {} })); sessionStorage.setItem('__s', '1'); }
    const RealDate = Date; const start = RealDate.now(); const b = fixed;
    class FakeDate extends RealDate { constructor(...a) { if (a.length === 0) super(b + (RealDate.now() - start)); else super(...a); } static now() { return b + (RealDate.now() - start); } }
    window.Date = FakeDate;
  }, STATE(), FIXED);
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle0' }); await wait(400);
  return page;
}
const tab = async (p, name) => { await p.evaluate((t) => [...document.querySelectorAll('nav.tabbar button')].find((x) => x.textContent.includes(t)).click(), name); await wait(400); };
const active = (p) => p.evaluate(() => { const a = document.querySelector('nav.tabbar button.active'); return a ? a.textContent.trim() : ''; });
const onHelp = (p) => p.evaluate(() => !!document.querySelector('.sd-helppage'));
const sections = (p) => p.evaluate(() => [...document.querySelectorAll('.sd-help-sec h2')].map((h) => h.textContent));
const openQs = (p) => p.evaluate(() => [...document.querySelectorAll('.sd-help-q[aria-expanded="true"]')].map((b) => b.textContent));
const clickQ = (p, re) => p.evaluate((src) => { const b = [...document.querySelectorAll('.sd-help-q')].find((x) => new RegExp(src, 'i').test(x.textContent)); if (!b) throw new Error('no question ' + src); b.click(); }, re);
const typeSearch = async (p, text) => { await p.evaluate(() => { const i = document.querySelector('.sd-helppage input'); i.focus(); }); await p.keyboard.type(text); await wait(300); };
const noSideways = (p) => p.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

const NOTICE = 'This product uses the TMDB API but is not endorsed or certified by TMDB.';
const credits = (p) => p.evaluate(() => { const c = document.querySelector('[data-testid=credits]'); return c ? { text: c.innerText.replace(/\s+/g, ' '), links: [...c.querySelectorAll('a')].map((a) => [a.textContent, a.href, a.target, a.rel]) } : null; });

let p = await open();
await tab(p, 'Settings');
await ok('Settings ends with Credits: the exact TMDB notice', async () => {
  const c = await credits(p); assert.ok(c, 'no credits'); assert.ok(c.text.includes(NOTICE), c.text);
  const last = await p.evaluate(() => { const c = document.querySelector('[data-testid=credits]'); return !c.nextElementSibling || !c.nextElementSibling.matches('section, .sd-card'); });
  assert.ok(last, 'credits come after the last card');
});
await ok('it credits TMDB, JustWatch, OMDb and AniList, with safe links that open in a new tab', async () => {
  const c = await credits(p);
  assert.deepEqual(c.links.map((l) => l[0]), ['The Movie Database (TMDB)', 'AniList', 'JustWatch', 'OMDb API']);
  for (const [, href, target, rel] of c.links) { assert.match(href, /^https:\/\//); assert.equal(target, '_blank'); assert.match(rel, /noopener/); }
});
await ok('phone: no sideways scroll', async () => { assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)); });
await p.evaluate(() => document.querySelector('[data-testid=credits]').scrollIntoView({ block: 'center' })); await wait(200);
await p.screenshot({ path: workPath('out_help', 'credits_settings_phone.png') });
await p.evaluate(() => document.querySelector('[data-testid=open-help]').click()); await wait(400);
await ok('Help & FAQ ends with the same Credits', async () => { const c = await credits(p); assert.ok(c && c.text.includes(NOTICE)); });
await typeSearch(p, 'TMDB');
await ok('searching Help for "TMDB" finds "Where does WatchNext get its show and movie information?"', async () => {
  const qs = await p.evaluate(() => [...document.querySelectorAll('.sd-help-q')].map((b) => b.textContent));
  assert.ok(qs.some((q) => /Where does WatchNext get its show and movie information\?/.test(q)), qs.join(' | '));
});
await p.close();

console.log(`\n${checks} checks passed`); console.log('PROBLEMS:', problems.length ? '\n' + problems.join('\n') : 'none'); await browser.close(); server.close();
if (problems.length) process.exit(1);
