process.env.TZ = 'Australia/Hobart';
import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { workPath, browserFile, APP_DIST } from '../../tests/paths.mjs';
import { launchBrowser } from './launch.mjs';

// Help & FAQ: a card at the top of Settings opens the Help page; sections, tap-to-open
// answers, search (matches open), the shared keyboard list, the "More help" link from the
// "?" list, Back / Esc / tab bar, and phone + desktop layout. TMDB mocked.
const PORT = 4242;
const DIST = APP_DIST; const OUT = workPath('out_help');
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

console.log('A. SETTINGS CARD');
let p = await open();
await tab(p, 'Settings');
await ok('Settings starts with a "Help & FAQ" card', async () => {
  const first = await p.evaluate(() => document.querySelector('.sd-setcard h2').textContent);
  assert.equal(first, 'Help & FAQ');
});
await p.evaluate(() => document.querySelector('[data-testid=open-help]').click()); await wait(400);
await ok('"Open Help & FAQ" opens the Help page (Settings stays lit in the tab bar)', async () => {
  assert.ok(await onHelp(p)); assert.equal(await active(p), 'Settings');
  assert.match(await p.evaluate(() => document.querySelector('.sd-helppage h1').textContent), /Help & FAQ/);
});

console.log('B. SECTIONS AND ANSWERS');
await ok('all 8 sections, in order, with the jump buttons', async () => {
  const want = ['Getting started', 'Shows & episodes', 'Movies', 'Finding what to watch', 'Stats & badges', 'Shortcuts', 'Sync, backup & your data', 'Problems & FAQ'];
  assert.deepEqual((await sections(p)).map((s) => s.toLowerCase()), want.map((s) => s.toLowerCase()));
  assert.deepEqual(await p.evaluate(() => [...document.querySelectorAll('.sd-help-jump button')].map((b) => b.textContent)), want);
});
await ok('answers start closed', async () => { assert.deepEqual(await openQs(p), []); });
await clickQ(p, 'rewatch a whole show'); await wait(200);
await ok('tapping a question opens its answer', async () => {
  assert.deepEqual(await openQs(p), ['How do I rewatch a whole show?']);
  assert.match(await p.evaluate(() => document.querySelector('.sd-help-a').innerText), /Start a rewatch/);
});
await p.screenshot({ path: path.join(OUT, 'help_phone.png') });
await clickQ(p, 'rewatch a whole show'); await wait(200);
await ok('tapping it again closes it', async () => { assert.deepEqual(await openQs(p), []); });
await p.evaluate(() => [...document.querySelectorAll('.sd-help-jump button')].find((b) => b.textContent === 'Problems & FAQ').click()); await wait(2000);
await ok('a jump button scrolls to its section', async () => {
  // at the top of the screen, or as far as the page can scroll (the last section is near the end)
  const r = await p.evaluate(() => ({ top: [...document.querySelectorAll('.sd-help-sec')].find((s) => s.getAttribute('aria-label') === 'Problems & FAQ').getBoundingClientRect().top, atEnd: Math.ceil(scrollY + innerHeight) >= document.documentElement.scrollHeight - 2, y: scrollY }));
  assert.ok(r.y > 0 && r.top >= -2 && (r.top < 120 || r.atEnd), JSON.stringify(r));
});
await clickQ(p, 'Clear site data'); await wait(200);
await ok('the "Clear site data" warning is there', async () => {
  assert.match(await p.evaluate(() => document.querySelector('.sd-help-item.open .sd-help-a').innerText), /erases it on that device/);
});
await ok('phone: no sideways scroll', async () => { assert.ok(await noSideways(p)); });

console.log('C. SEARCH');
await p.evaluate(() => window.scrollTo(0, 0)); await wait(200);
await typeSearch(p, 'backup');
await ok('searching shows only matches, already open, with a count', async () => {
  const qs = await openQs(p);
  const all = await p.evaluate(() => document.querySelectorAll('.sd-help-q').length);
  assert.ok(qs.length >= 2 && qs.length === all, `${qs.length}/${all}`);
  assert.ok(qs.some((q) => /make a backup/.test(q)));
  assert.match(await p.evaluate(() => document.querySelector('.sd-help-count').textContent), /^\d+ answers found$/);
  assert.ok(!(await p.evaluate(() => !!document.querySelector('.sd-help-jump'))), 'jump buttons hidden while searching');
});
await ok('typing numbers or "/" in the help search does not trigger shortcuts', async () => {
  await p.keyboard.type(' 2/'); await wait(300);
  assert.ok(await onHelp(p)); assert.equal(await active(p), 'Settings');
  await p.evaluate(() => document.querySelector('.sd-lfilter-x').click()); await wait(200);
});
await typeSearch(p, 'zzqqx');
await ok('nothing found says so', async () => { assert.match(await p.evaluate(() => document.querySelector('.sd-help-count').textContent), /Nothing found/); });
await p.evaluate(() => document.querySelector('.sd-lfilter-x').click()); await wait(200);
await typeSearch(p, 'need tmdb key');
await ok('friends asking about a TMDB key find the answer', async () => {
  const qs = await openQs(p); assert.ok(qs.includes('Do I need a TMDB API key?'), qs.join(' | '));
});
await p.evaluate(() => document.querySelector('.sd-lfilter-x').click()); await wait(300);
await ok('clearing the search shows everything again (only the answer you opened before is open)', async () => {
  assert.equal((await sections(p)).length, 8); assert.deepEqual(await openQs(p), ['Should I “Clear site data” or clear the browser’s storage?']);
});

console.log('D. BACK, ESC AND TABS');
await p.evaluate(() => document.querySelector('.sd-helppage .sd-back').click()); await wait(300);
await ok('Back returns to Settings', async () => {
  assert.ok(!(await onHelp(p))); assert.equal(await p.evaluate(() => document.querySelector('.sd-setcard h2').textContent), 'Help & FAQ');
});
await p.evaluate(() => document.querySelector('[data-testid=open-help]').click()); await wait(300);
await p.evaluate(() => document.activeElement && document.activeElement.blur());
await p.keyboard.press('Escape'); await wait(300);
await ok('Esc on the Help page goes back to Settings', async () => { assert.ok(!(await onHelp(p))); assert.equal(await active(p), 'Settings'); });
await p.evaluate(() => document.querySelector('[data-testid=open-help]').click()); await wait(300);
await tab(p, 'Shows');
await ok('a tab in the tab bar leaves Help', async () => { assert.ok(!(await onHelp(p))); assert.equal(await active(p), 'Shows'); });
await tab(p, 'Settings');
await ok('coming back to Settings shows Settings, not Help', async () => { assert.ok(!(await onHelp(p))); });
await p.close();

console.log('E. FROM THE KEYBOARD LIST (DESKTOP)');
p = await open({ w: 1280, h: 860 });
await p.keyboard.press('?'); await wait(500);
await ok('the "?" list has a "More help" link', async () => {
  assert.match(await p.evaluate(() => document.querySelector('[data-testid=keys-help]').textContent), /Help & FAQ/);
});
await p.evaluate(() => document.querySelector('[data-testid=keys-help]').click()); await wait(700);
await ok('it opens Help at Shortcuts, with the keyboard list open and the sheet closed', async () => {
  assert.ok(await onHelp(p));
  assert.ok(!(await p.evaluate(() => !!document.querySelector('[aria-modal="true"]'))));
  assert.deepEqual(await openQs(p), ['Keyboard shortcuts (computer)']);
  const keys = await p.evaluate(() => [...document.querySelectorAll('[data-testid=help-keys] kbd')].map((k) => k.textContent));
  assert.deepEqual(keys, ['/', '1', '2', '3', '4', '5', '6', 'Esc', '?']);
  const top = await p.evaluate(() => [...document.querySelectorAll('.sd-help-sec')].find((s) => s.getAttribute('aria-label') === 'Shortcuts').getBoundingClientRect().top);
  assert.ok(top >= -2 && top < 140, String(top));
});
await clickQ(p, 'App icon shortcuts'); await wait(300);
await p.screenshot({ path: path.join(OUT, 'help_desktop.png') });
await ok('desktop: one readable column, no sideways scroll', async () => {
  const w = await p.evaluate(() => document.querySelector('.sd-helppage').getBoundingClientRect().width);
  assert.ok(w <= 760, String(w)); assert.ok(await noSideways(p));
});
await p.keyboard.press('3'); await wait(300);
await ok('number keys still switch tabs from Help', async () => { assert.ok(!(await onHelp(p))); assert.equal(await active(p), 'Movies'); });
await p.close();

console.log(`\n${checks} checks passed`); console.log('PROBLEMS:', problems.length ? '\n' + problems.join('\n') : 'none'); await browser.close(); server.close();
if (problems.length) process.exit(1);
