process.env.TZ = 'Australia/Hobart';
import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { workPath, browserFile, APP_DIST } from '../../tests/paths.mjs';
import { launchBrowser } from './launch.mjs';

// In-app messages and questions instead of the browser's alert()/confirm():
// a question is the app's confirm sheet (Cancel / Esc keep things, the red button acts);
// a message shows at the top, closes by itself or with ×; the browser never shows a pop-up.
const PORT = 4247;
const DIST = APP_DIST; const OUT = workPath('out_dialogs');
const fontsCss = fs.readFileSync(browserFile('fonts.css'), 'utf8');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => { let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html'; const f = path.join(DIST, p); if (!f.startsWith(DIST) || !fs.existsSync(f)) { res.writeHead(404); return res.end('nf'); } res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res); });
await new Promise((r) => server.listen(PORT, r));
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const CORS = { 'access-control-allow-origin': '*' };
const FIXED = Date.parse('2026-10-25T08:00:00.000Z');

const STATE = () => ({ shows: {
  'tmdb:1': { tmdbId: 1, name: 'Dark', followed: true, runtimeMin: 50, totalEpisodes: 3, seasons: [{ n: 1, count: 3 }], lastSynced: '2026-10-21T00:00:00Z',
    providers: [], providersFree: [], providersLink: '', providersSynced: '2026-10-24T00:00:00.000Z', providersRegion: 'AU',
    watched: { '1x1': { at: '2026-10-01T10:00:00.000Z', min: 50 } }, rewatch: { round: 2, started: '2026-10-20T00:00:00.000Z', done: {} } },
}, movies: [{ tmdbId: 30, name: 'Arrival', status: 'planned', year: 2016, runtimeMin: 116 }], settings: { tmdbKey: 'TESTKEY' } });

const browser = await launchBrowser(puppeteer);
const problems = []; let checks = 0; const ok = async (n, f) => { await f(); checks++; console.log('  PASS', n); }; const wait = (ms = 350) => new Promise((r) => setTimeout(r, ms));
const until = async (page, fn, arg, ms = 6000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await page.evaluate(fn, arg)) return true; await wait(100); } throw new Error('timed out waiting for ' + fn.toString().slice(0, 90)); };
const native = [];
let offline = false;
async function open({ w = 390, h = 844 } = {}) {
  const page = await browser.newPage(); await page.emulateTimezone('Australia/Hobart'); await page.setViewport({ width: w, height: h, deviceScaleFactor: 2 });
  page.on('pageerror', (e) => problems.push('pageerror: ' + e.message)); page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) problems.push('console.error: ' + m.text()); });
  page.on('dialog', (d) => { native.push(`${d.type()}: ${d.message()}`); d.dismiss(); });
  await page.setBypassServiceWorker(true); await page.setRequestInterception(true);
  page.on('request', (r) => {
    const u = r.url();
    if (u.startsWith('http://localhost:')) return r.continue();
    if (u.includes('fonts.googleapis.com')) return r.respond({ status: 200, contentType: 'text/css', body: fontsCss });
    if (u.includes('image.tmdb.org')) return r.respond({ status: 200, contentType: 'image/png', body: PNG });
    if (u.includes('api.themoviedb.org')) {
      if (offline) return r.abort('internetdisconnected');
      return r.respond({ status: 200, headers: CORS, contentType: 'application/json', body: JSON.stringify({ results: [], episodes: [], cast: [], crew: [] }) });
    }
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
const openShow = async (p) => {
  await tab(p, 'Shows');
  await p.evaluate(() => { const a = document.querySelector('.sd-lstatus [role=tab]'); if (a) a.click(); }); await wait(200);
  await p.evaluate(() => [...document.querySelectorAll('button.sd-ltile')].find((b) => b.textContent.includes('Dark')).click()); await wait(700);
};
const ask = (p) => p.evaluate(() => { const d = document.querySelector('[role=alertdialog]'); return d ? { title: d.getAttribute('aria-label'), text: d.innerText, focus: document.activeElement && document.activeElement.textContent } : null; });
const notices = (p) => p.evaluate(() => [...document.querySelectorAll('[data-testid=notice]')].map((n) => ({ text: n.querySelector('.txt').textContent, err: n.classList.contains('err'), role: n.getAttribute('role') })));
const stored = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('watchnext-state-v1')));

console.log('A. A QUESTION: END THIS REWATCH');
let p = await open();
await openShow(p);
await p.evaluate(() => [...document.querySelectorAll('[data-testid=rewatch-bar] button')].find((b) => /End rewatch/.test(b.textContent)).click()); await wait(500);
await ok('the app asks in its own dialog (title, plain words, Cancel focused)', async () => {
  const a = await ask(p);
  assert.equal(a.title, 'End this rewatch?');
  assert.match(a.text, /What you have rewatched so far is kept/); assert.match(a.text, /End rewatch/); assert.match(a.text, /Cancel/);
  assert.equal(a.focus, 'Cancel');
});
await p.screenshot({ path: path.join(OUT, 'ask_phone.png') });
await p.evaluate(() => document.querySelector('[data-testid=ask-no]').click()); await wait(400);
await ok('Cancel closes it and keeps the rewatch', async () => {
  assert.equal(await ask(p), null); assert.ok((await stored(p)).shows['tmdb:1'].rewatch);
});
await p.evaluate(() => [...document.querySelectorAll('[data-testid=rewatch-bar] button')].find((b) => /End rewatch/.test(b.textContent)).click()); await wait(500);
await p.keyboard.press('Escape'); await wait(400);
await ok('Esc closes it, keeps the rewatch and stays on the show page', async () => {
  assert.equal(await ask(p), null); assert.ok((await stored(p)).shows['tmdb:1'].rewatch);
  assert.ok(await p.evaluate(() => !!document.querySelector('.sd-back')));
});
await p.evaluate(() => [...document.querySelectorAll('[data-testid=rewatch-bar] button')].find((b) => /End rewatch/.test(b.textContent)).click()); await wait(500);
await p.evaluate(() => document.querySelector('[data-testid=ask-yes]').click()); await wait(400);
await ok('"End rewatch" ends it', async () => {
  assert.equal(await ask(p), null); assert.ok(!(await p.evaluate(() => !!document.querySelector('[data-testid=rewatch-bar]'))));
});

console.log('B. A QUESTION FROM INSIDE A SHEET: DELETE SHOW');
await p.evaluate(() => document.querySelector('button[aria-label="More actions"]').click()); await wait(500);
await p.evaluate(() => [...document.querySelectorAll('.sd-sheet button')].find((b) => /Delete from library/.test(b.textContent)).click()); await wait(500);
await ok('the question opens on top of the menu, in red', async () => {
  const a = await ask(p); assert.equal(a.title, 'Delete this show?'); assert.match(a.text, /“Dark” and its watch history/);
  assert.ok(await p.evaluate(() => document.querySelector('[data-testid=ask-yes]').classList.contains('solid-danger')));
});
await p.evaluate(() => document.querySelector('[data-testid=ask-no]').click()); await wait(400);
await ok('Cancel keeps the show', async () => { assert.ok((await stored(p)).shows['tmdb:1']); });

console.log('C. MESSAGES');
await p.keyboard.press('Escape'); await wait(300);
await p.evaluate(() => [...document.querySelectorAll('.sd-btn')].find((b) => /Trailer/.test(b.textContent)).click());
await until(p, () => document.querySelectorAll('[data-testid=notice]').length > 0);
await ok('"No trailer" is an in-app message at the top (not a pop-up)', async () => {
  assert.deepEqual(await notices(p), [{ text: 'No trailer found on TMDB for “Dark”.', err: false, role: 'status' }]);
  const top = await p.evaluate(() => document.querySelector('[data-testid=notice]').getBoundingClientRect().top); assert.ok(top < 60, String(top));
});
await wait(500); // after the short fade-in
await ok('the message is solid (not see-through)', async () => {
  const op = await p.evaluate(() => getComputedStyle(document.querySelector('[data-testid=notice]')).opacity); assert.equal(op, '1');
  const bg = await p.evaluate(() => getComputedStyle(document.querySelector('[data-testid=notice]')).backgroundColor); assert.ok(!/rgba\(.*, 0\)|transparent/.test(bg), bg);
});
await p.screenshot({ path: path.join(OUT, 'notice_phone.png') });
await p.evaluate(() => document.querySelector('[data-testid=notice] .x').click()); await wait(200);
await ok('× closes it', async () => { assert.deepEqual(await notices(p), []); });
offline = true;
await p.evaluate(() => [...document.querySelectorAll('.sd-btn')].find((b) => /Trailer/.test(b.textContent)).click());
await until(p, () => document.querySelectorAll('[data-testid=notice]').length > 0);
await ok('offline: a red message in plain words ("you seem to be offline")', async () => {
  assert.deepEqual(await notices(p), [{ text: 'Couldn’t load the trailer: you seem to be offline.', err: true, role: 'alert' }]);
});
offline = false;
await wait(9400);
await ok('a message closes by itself after a few seconds', async () => { assert.deepEqual(await notices(p), []); });
await ok('phone: no sideways scroll', async () => { assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)); });
await p.close();

console.log('D. WATCHLIST, DESKTOP');
p = await open({ w: 1280, h: 860 });
await tab(p, 'Watchlist');
await p.evaluate(() => document.querySelector('button[aria-label="Remove Arrival from watchlist"]').click()); await wait(500);
await ok('removing a movie from the watchlist asks first (desktop: a centred box, Cancel left)', async () => {
  const a = await ask(p); assert.equal(a.title, 'Remove from your watchlist?'); assert.match(a.text, /“Arrival” will be taken off your watchlist/);
  const r = await p.evaluate(() => { const d = document.querySelector('[role=alertdialog]').getBoundingClientRect(); const bs = [...document.querySelectorAll('.sd-confirm-acts button')].sort((x, y) => x.getBoundingClientRect().left - y.getBoundingClientRect().left).map((b) => b.textContent); return { centred: Math.abs(d.left + d.width / 2 - innerWidth / 2) < 3, order: bs }; });
  assert.ok(r.centred); assert.deepEqual(r.order, ['Cancel', 'Remove']);
});
await p.screenshot({ path: path.join(OUT, 'ask_desktop.png') });
await p.evaluate(() => document.querySelector('[data-testid=ask-yes]').click()); await wait(400);
await ok('"Remove" takes it off the watchlist', async () => { assert.ok(!(await stored(p)).movies.some((m) => m.name === 'Arrival')); });
await p.close();

await ok('the browser never showed an alert() or confirm() pop-up', async () => { assert.deepEqual(native, []); });

console.log(`\n${checks} checks passed`); console.log('PROBLEMS:', problems.length ? '\n' + problems.join('\n') : 'none'); await browser.close(); server.close();
if (problems.length) process.exit(1);
