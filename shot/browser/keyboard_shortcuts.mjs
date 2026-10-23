process.env.TZ = 'Australia/Hobart';
import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { workPath, browserFile, APP_DIST } from '../../tests/paths.mjs';
import { launchBrowser } from './launch.mjs';

// Keyboard shortcuts (computer): "/" opens Search, 1–6 switch tabs, Esc goes back,
// "?" shows the list. Keys are ignored while typing in a box and while a sheet is open.
// TMDB mocked.
const PORT = 4240;
const DIST = APP_DIST; const OUT = workPath('out_keyboard_shortcuts');
const fontsCss = fs.readFileSync(browserFile('fonts.css'), 'utf8');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => { let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html'; const f = path.join(DIST, p); if (!f.startsWith(DIST) || !fs.existsSync(f)) { res.writeHead(404); return res.end('nf'); } res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res); });
await new Promise((r) => server.listen(PORT, r));
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const CORS = { 'access-control-allow-origin': '*' };
const FIXED = Date.parse('2026-10-21T22:00:00.000Z');

const STATE = () => ({ shows: {
  'tmdb:1': { tmdbId: 1, name: 'Dark', followed: true, runtimeMin: 50, totalEpisodes: 3, seasons: [{ n: 1, count: 3 }], lastSynced: '2026-10-21T00:00:00Z', watched: { '1x1': { at: '2026-10-01T10:00:00.000Z', min: 50 } } },
}, movies: [{ tmdbId: 603, name: 'The Matrix', status: 'watched', watchedAt: '2026-09-01T10:00:00.000Z', runtimeMin: 136, year: 1999 }], settings: { tmdbKey: 'TESTKEY' } });

const browser = await launchBrowser(puppeteer);
const problems = []; let checks = 0; const ok = async (n, f) => { await f(); checks++; console.log('  PASS', n); }; const wait = (ms = 350) => new Promise((r) => setTimeout(r, ms));
async function open({ w = 1280, h = 860 } = {}) {
  const page = await browser.newPage(); await page.emulateTimezone('Australia/Hobart'); await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => problems.push('pageerror: ' + e.message)); page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) problems.push('console.error: ' + m.text()); });
  await page.setBypassServiceWorker(true); await page.setRequestInterception(true);
  page.on('request', (r) => {
    const u = r.url();
    if (u.startsWith('http://localhost:')) return r.continue();
    if (u.includes('fonts.googleapis.com')) return r.respond({ status: 200, contentType: 'text/css', body: fontsCss });
    if (u.includes('image.tmdb.org')) return r.respond({ status: 200, contentType: 'image/png', body: PNG });
    const j = (b) => r.respond({ status: 200, headers: CORS, contentType: 'application/json', body: JSON.stringify(b) });
    if (u.includes('api.themoviedb.org')) return j({ results: [], episodes: [], cast: [], crew: [] });
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
const active = (p) => p.evaluate(() => { const a = document.querySelector('nav.tabbar button.active'); return a ? a.textContent.trim() : ''; });
const press = async (p, k) => { await p.keyboard.press(k); await wait(300); };
const searchOpen = (p) => p.evaluate(() => !!document.querySelector('input[placeholder^="Search shows and movies"]'));
const blur = (p) => p.evaluate(() => document.activeElement && document.activeElement.blur());

console.log('A. SWITCHING TABS');
let p = await open();
await ok('starts on Up Next', async () => { assert.equal(await active(p), 'Up Next'); });
const names = ['Up Next', 'Shows', 'Movies', 'Watchlist', 'Stats', 'Settings'];
for (let i = 6; i >= 1; i--) {
  await press(p, String(i));
  await ok(`pressing ${i} opens ${names[i - 1]}`, async () => { assert.equal(await active(p), names[i - 1]); });
}
await ok('7, 0 and letters do nothing', async () => {
  await press(p, '3'); await press(p, '7'); await press(p, '0'); await press(p, 'k');
  assert.equal(await active(p), 'Movies');
});
await ok('Ctrl+2 is left to the browser', async () => {
  await p.keyboard.down('Control'); await p.keyboard.press('2'); await p.keyboard.up('Control'); await wait(300);
  assert.equal(await active(p), 'Movies');
});
await ok('tab buttons show their number when you hover', async () => {
  const t = await p.evaluate(() => [...document.querySelectorAll('nav.tabbar button')].map((b) => b.title));
  assert.deepEqual(t, ['Up Next (1)', 'Shows (2)', 'Movies (3)', 'Watchlist (4)', 'Stats (5)', 'Settings (6)']);
  assert.equal(await p.evaluate(() => document.querySelector('.masthead-search').title), 'Search (/)');
});

console.log('B. SEARCH');
await press(p, '/');
await ok('"/" opens Search with the cursor in the box (and no "/" typed)', async () => {
  assert.ok(await searchOpen(p));
  assert.equal(await p.evaluate(() => document.activeElement && document.activeElement.type), 'search');
  assert.equal(await p.evaluate(() => document.activeElement.value), '');
});
await p.keyboard.type('12/3'); await wait(200);
await ok('typing numbers and "/" in the search box just types them', async () => {
  assert.equal(await p.evaluate(() => document.activeElement.value), '12/3');
  assert.ok(await searchOpen(p));
});
await press(p, 'Escape');
await ok('Esc with text in the box only clears the text', async () => {
  assert.ok(await searchOpen(p));
  assert.equal(await p.evaluate(() => document.querySelector('input[type="search"]').value), '');
});
await press(p, 'Escape');
await ok('Esc again (empty box) goes back to the tab you were on', async () => {
  assert.ok(!(await searchOpen(p)));
  assert.equal(await active(p), 'Movies');
});
await press(p, '/'); await blur(p); await press(p, '/');
await ok('"/" while Search is open puts the cursor back in the box', async () => {
  assert.equal(await p.evaluate(() => document.activeElement && document.activeElement.type), 'search');
});
await blur(p); await press(p, '2');
await ok('a number key from Search goes to that tab', async () => { assert.ok(!(await searchOpen(p))); assert.equal(await active(p), 'Shows'); });

console.log('C. TYPING IN OTHER BOXES');
await ok('typing in a box on a page never switches tabs', async () => {
  const hasBox = await p.evaluate(() => { const i = document.createElement('input'); i.id = '__t'; document.querySelector('main, .app').appendChild(i); i.focus(); return true; });
  assert.ok(hasBox);
  await p.keyboard.type('5/?'); await wait(300);
  assert.equal(await active(p), 'Shows'); assert.ok(!(await searchOpen(p)));
  await p.evaluate(() => document.getElementById('__t').remove());
});

console.log('D. SHOW PAGE AND BACK');
await p.evaluate(() => { const a = document.querySelector('.sd-lstatus [role=tab]'); if (a) a.click(); }); await wait(200);
await p.evaluate(() => [...document.querySelectorAll('button.sd-ltile')].find((b) => b.textContent.includes('Dark')).click()); await wait(600);
await ok('the show page is open', async () => { assert.ok(await p.evaluate(() => /Dark/.test(document.body.innerText) && !!document.querySelector('button.sd-back'))); });
await blur(p); await press(p, 'Escape');
await ok('Esc on a show page goes back to Shows', async () => {
  assert.equal(await active(p), 'Shows');
  assert.ok(await p.evaluate(() => !!document.querySelector('button.sd-ltile')));
});
await press(p, 'Escape');
await ok('Esc on a main tab does nothing', async () => { assert.equal(await active(p), 'Shows'); });

console.log('E. SHORTCUT LIST AND SHEETS');
await press(p, '?');
await ok('"?" opens the Keyboard shortcuts list', async () => {
  const t = await p.evaluate(() => document.querySelector('[aria-modal="true"]').innerText);
  assert.match(t, /Keyboard shortcuts/i);
  for (const s of ['Search', 'Up Next', 'Shows', 'Movies', 'Watchlist', 'Stats', 'Settings', 'Go back']) assert.ok(t.includes(s), s);
});
await wait(500);
await p.screenshot({ path: path.join(OUT, 'list_desktop.png') });
await press(p, '4');
await ok('while the list (a sheet) is open, number keys do nothing', async () => {
  assert.equal(await active(p), 'Shows');
  assert.ok(await p.evaluate(() => !!document.querySelector('[aria-modal="true"]')));
});
await press(p, 'Escape');
await ok('Esc closes the list and stays on the same tab', async () => {
  assert.ok(!(await p.evaluate(() => !!document.querySelector('[aria-modal="true"]'))));
  assert.equal(await active(p), 'Shows');
});
await press(p, '5');
await ok('shortcuts work again after the list closes', async () => { assert.equal(await active(p), 'Stats'); });
await p.close();

console.log('F. PHONE');
p = await open({ w: 390, h: 844 });
await ok('phone: the app looks the same (no new buttons) and no sideways scroll', async () => {
  assert.equal(await p.evaluate(() => document.querySelectorAll('nav.tabbar button').length), 6);
  assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth));
});
await press(p, '?'); await wait(500);
await ok('phone: the list fits with no sideways scroll', async () => {
  assert.ok(await p.evaluate(() => { const s = document.querySelector('.sd-sheet'); return s.scrollWidth <= s.clientWidth; }));
});
await p.screenshot({ path: path.join(OUT, 'list_phone.png') });
await p.close();

console.log(`\n${checks} checks passed`); console.log('PROBLEMS:', problems.length ? '\n' + problems.join('\n') : 'none'); await browser.close(); server.close();
if (problems.length) process.exit(1);
