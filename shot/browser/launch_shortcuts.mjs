process.env.TZ = 'Australia/Hobart';
import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { workPath, browserFile, APP_DIST } from '../../tests/paths.mjs';
import { launchBrowser } from './launch.mjs';

// Home-screen / taskbar shortcuts: the manifest lists Up Next, Search and Tonight; opening
// "./?go=<target>" lands on that page, the "?go" is removed from the address, a reload opens
// the app as normal, and (with the real service worker) the shortcuts still open offline.
const PORT = 4241;
const DIST = APP_DIST; const OUT = workPath('out_launch_shortcuts');
const fontsCss = fs.readFileSync(browserFile('fonts.css'), 'utf8');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
let DOWN = false; // true = the site can't be reached (connection dropped), like being offline
const server = http.createServer((req, res) => { if (DOWN) return req.socket.destroy(); let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html'; const f = path.join(DIST, p); if (!f.startsWith(DIST) || !fs.existsSync(f)) { res.writeHead(404); return res.end('nf'); } res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res); });
await new Promise((r) => server.listen(PORT, r));
const BASE = `http://localhost:${PORT}/`;
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const CORS = { 'access-control-allow-origin': '*' };
const FIXED = Date.parse('2026-10-21T22:00:00.000Z');

const STATE = () => ({ shows: {
  'tmdb:1': { tmdbId: 1, name: 'Dark', followed: true, runtimeMin: 50, totalEpisodes: 3, seasons: [{ n: 1, count: 3 }], lastSynced: '2026-10-21T00:00:00Z', watched: { '1x1': { at: '2026-10-01T10:00:00.000Z', min: 50 } } },
}, movies: [], settings: { tmdbKey: 'TESTKEY' } });

const browser = await launchBrowser(puppeteer);
const problems = []; let checks = 0; const ok = async (n, f) => { await f(); checks++; console.log('  PASS', n); }; const wait = (ms = 350) => new Promise((r) => setTimeout(r, ms));
async function open(query = '', { w = 390, h = 844, sw = false } = {}) {
  const page = await browser.newPage(); await page.emulateTimezone('Australia/Hobart'); await page.setViewport({ width: w, height: h, deviceScaleFactor: 2 });
  page.on('pageerror', (e) => problems.push('pageerror: ' + e.message)); page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) problems.push('console.error: ' + m.text()); });
  if (!sw) await page.setBypassServiceWorker(true);
  await page.setRequestInterception(true);
  page.on('request', (r) => {
    const u = r.url();
    if (u.startsWith('http://localhost:')) return r.continue();
    if (u.includes('fonts.googleapis.com')) return r.respond({ status: 200, contentType: 'text/css', body: fontsCss });
    if (u.includes('image.tmdb.org')) return r.respond({ status: 200, contentType: 'image/png', body: PNG });
    if (u.includes('api.themoviedb.org')) return r.respond({ status: 200, headers: CORS, contentType: 'application/json', body: JSON.stringify({ results: [], episodes: [], cast: [], crew: [] }) });
    return r.abort();
  });
  await page.evaluateOnNewDocument((s, fixed) => {
    if (!localStorage.getItem('watchnext-state-v1')) { localStorage.setItem('watchnext-state-v1', JSON.stringify(s)); localStorage.setItem('watchnext-badges-seen-v1', JSON.stringify({ v: 1, levels: {} })); }
    const RealDate = Date; const start = RealDate.now(); const b = fixed;
    class FakeDate extends RealDate { constructor(...a) { if (a.length === 0) super(b + (RealDate.now() - start)); else super(...a); } static now() { return b + (RealDate.now() - start); } }
    window.Date = FakeDate;
  }, STATE(), FIXED);
  await page.goto(BASE + query, { waitUntil: 'networkidle0' }); await wait(500);
  return page;
}
const active = (p) => p.evaluate(() => { const a = document.querySelector('nav.tabbar button.active'); return a ? a.textContent.trim() : ''; });
const searchOpen = (p) => p.evaluate(() => !!document.querySelector('input[placeholder^="Search shows and movies"]'));
const tonightOpen = (p) => p.evaluate(() => { const d = document.querySelector('[aria-modal="true"]'); return !!d && /What should I watch tonight/i.test(d.innerText); });
const addr = (p) => p.evaluate(() => location.pathname + location.search + location.hash);
const tab = async (p, name) => { await p.evaluate((t) => [...document.querySelectorAll('nav.tabbar button')].find((x) => x.textContent.includes(t)).click(), name); await wait(400); };

console.log('A. THE MANIFEST');
let p = await open();
await ok('Chrome reads 3 shortcuts (Up Next, Search, Tonight) with icons, inside the app', async () => {
  const cdp = await p.target().createCDPSession();
  const { errors, url } = await cdp.send('Page.getAppManifest');
  assert.ok(url.endsWith('manifest.webmanifest'), url);
  assert.deepEqual(errors, []);
  const m = await p.evaluate(async () => (await fetch('./manifest.webmanifest')).json());
  assert.deepEqual(m.shortcuts.map((s) => s.short_name), ['Up Next', 'Search', 'Tonight']);
  for (const s of m.shortcuts) {
    const abs = new URL(s.url, BASE + 'manifest.webmanifest').href;
    assert.ok(abs.startsWith('http://localhost:' + 4241 + '/?go='), abs);
    const ic = await p.evaluate(async (src) => { const r = await fetch(src); return r.ok && r.headers.get('content-type'); }, s.icons[0].src);
    assert.equal(ic, 'image/png', s.icons[0].src);
  }
});
await ok('opened normally: Up Next, no sheet, address unchanged', async () => {
  assert.equal(await active(p), 'Up Next'); assert.ok(!(await tonightOpen(p))); assert.equal(await addr(p), '/');
});
await p.close();

console.log('B. SEARCH SHORTCUT');
p = await open('?go=search');
await ok('opens Search with the cursor in the box', async () => {
  assert.ok(await searchOpen(p));
  assert.equal(await p.evaluate(() => document.activeElement && document.activeElement.type), 'search');
});
await ok('the "?go=search" is taken out of the address', async () => { assert.equal(await addr(p), '/'); });
await p.screenshot({ path: path.join(OUT, 'search_phone.png') });
await p.evaluate(() => document.querySelector('button.back').click()); await wait(300);
await ok('Back goes to Up Next', async () => { assert.ok(!(await searchOpen(p))); assert.equal(await active(p), 'Up Next'); });
await p.reload({ waitUntil: 'networkidle0' }); await wait(400);
await ok('a reload opens the app as normal (not Search again)', async () => { assert.ok(!(await searchOpen(p))); assert.equal(await active(p), 'Up Next'); });
await p.close();

console.log('C. TONIGHT SHORTCUT');
p = await open('?go=tonight');
await ok('opens Up Next with "What should I watch tonight?"', async () => {
  assert.equal(await active(p), 'Up Next'); assert.ok(await tonightOpen(p));
  assert.equal(await addr(p), '/');
});
await wait(400);
await p.screenshot({ path: path.join(OUT, 'tonight_phone.png') });
await p.keyboard.press('Escape'); await wait(400);
await ok('closing it leaves you on Up Next', async () => { assert.ok(!(await tonightOpen(p))); assert.equal(await active(p), 'Up Next'); });
await tab(p, 'Shows'); await tab(p, 'Up Next');
await ok('going back to Up Next later does not re-open it', async () => { assert.ok(!(await tonightOpen(p))); });
await p.reload({ waitUntil: 'networkidle0' }); await wait(400);
await ok('a reload does not re-open it', async () => { assert.ok(!(await tonightOpen(p))); });
await p.close();

console.log('D. UP NEXT AND UNKNOWN');
p = await open('?go=next');
await ok('"?go=next" opens Up Next, no sheet, clean address', async () => { assert.equal(await active(p), 'Up Next'); assert.ok(!(await tonightOpen(p))); assert.equal(await addr(p), '/'); });
await p.close();
p = await open('?go=settings#x');
await ok('an unknown target opens the app as normal (and is tidied away)', async () => {
  assert.equal(await active(p), 'Up Next'); assert.ok(!(await searchOpen(p))); assert.equal(await addr(p), '/#x');
});
await ok('phone: no sideways scroll', async () => { assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)); });
await p.close();

console.log('E. OFFLINE (REAL SERVICE WORKER)');
p = await open('', { sw: true });
await p.evaluate(async () => { await navigator.serviceWorker.ready; });
await p.reload({ waitUntil: 'networkidle0' }); await wait(800); // now controlled: the app page gets cached
await ok('the service worker is in control', async () => { assert.ok(await p.evaluate(() => !!navigator.serviceWorker.controller)); });
DOWN = true;
await p.goto(BASE + '?go=search', { waitUntil: 'networkidle0' }).catch(() => {}); await wait(800);
await ok('offline: the Search shortcut still opens the app on Search', async () => {
  assert.ok(await searchOpen(p), await p.evaluate(() => document.body.innerText.slice(0, 200)));
});
await p.goto(BASE + '?go=tonight', { waitUntil: 'networkidle0' }).catch(() => {}); await wait(800);
await ok('offline: the Tonight shortcut opens Tonight', async () => { assert.ok(await tonightOpen(p)); });
await ok('(check) the site really was unreachable', async () => {
  assert.equal(await p.evaluate(() => fetch('./manifest.webmanifest?x=' + Math.random(), { cache: 'no-store' }).then(() => 'reached', () => 'failed')), 'failed');
});
DOWN = false;
await p.close();

console.log(`\n${checks} checks passed`); console.log('PROBLEMS:', problems.length ? '\n' + problems.join('\n') : 'none'); await browser.close(); server.close();
if (problems.length) process.exit(1);
