process.env.TZ = 'Australia/Hobart';
import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { workPath, browserFile, APP_DIST } from '../../tests/paths.mjs';
import { launchBrowser } from './launch.mjs';

// Settings → Region: availability is checked for the chosen country, cached answers are stamped
// with it, and changing it re-checks titles instead of showing another country's list.
const DIST = APP_DIST; const OUT = workPath('out_rg'); fs.mkdirSync(OUT, { recursive: true });
const fontsCss = fs.readFileSync(browserFile('fonts.css'), 'utf8');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => { let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html'; const f = path.join(DIST, p); if (!f.startsWith(DIST) || !fs.existsSync(f)) { res.writeHead(404); return res.end('nf'); } res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res); });
await new Promise((r) => server.listen(4193, r));
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const FIXED = Date.parse('2026-10-01T22:00:00.000Z');
const P = (name) => ({ provider_name: name, logo_path: '/x.png' });

// what the (mock) TMDB says per country
const WORLD = {
  'tv/101': { AU: { flatrate: [P('Netflix')] }, NZ: { flatrate: [P('Disney Plus')] } },
  'tv/102': { AU: { flatrate: [P('Stan')] }, NZ: { flatrate: [P('Netflix')] } },
  'tv/109': { AU: {}, NZ: { flatrate: [P('Netflix')] } },
};
const mk = (id, name, o = {}) => ({ followed: false, watchlist: true, poster: null, status: 'Ended', providers: [], lastSynced: '2026-09-01T00:00:00Z', runtimeMin: 40, genres: ['Drama'], name, tmdbId: id, totalEpisodes: 10, seasons: [{ n: 1, count: 10 }], watched: {}, ...o });
const cached = (subs, synced, region) => ({ providers: subs.map((n) => ({ name: n, logo: null })), providersFree: [], providersSynced: synced, ...(region ? { providersRegion: region } : null) });
const FRESH = new Date(FIXED - 86400000).toISOString();
// 101 and 102 were checked yesterday for Australia (no stamp = old cache); 109 never checked
const STATE = () => ({ shows: { 'tmdb:101': mk(101, 'Netflix Show', cached(['Netflix'], FRESH)), 'tmdb:102': mk(102, 'Stan Show', cached(['Stan'], FRESH)), 'tmdb:109': mk(109, 'Kiwi Show') }, movies: [], settings: { tmdbKey: 'TESTKEY' } });

const browser = await launchBrowser(puppeteer);
const problems = []; let checks = 0; const ok = async (n, f) => { await f(); checks++; console.log('  PASS', n); }; const wait = (ms = 350) => new Promise((r) => setTimeout(r, ms));
const waitFor = async (fn, ms = 9000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await fn()) return true; await wait(150); } return false; };
async function open(state, prefs, { w = 390, h = 844, tab = null, lang = null } = {}) {
  const page = await browser.newPage(); await page.emulateTimezone('Australia/Hobart'); await page.setViewport({ width: w, height: h, deviceScaleFactor: 2 });
  const log = [];
  page.on('pageerror', (e) => problems.push('pageerror: ' + e.message)); page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) problems.push('console.error: ' + m.text()); });
  await page.setBypassServiceWorker(true); await page.setRequestInterception(true);
  page.on('request', async (r) => {
    const u = r.url();
    if (u.startsWith('http://localhost:')) return r.continue();
    if (u.includes('fonts.googleapis.com')) return r.respond({ status: 200, contentType: 'text/css', body: fontsCss });
    if (u.includes('image.tmdb.org')) return r.respond({ status: 200, contentType: 'image/png', body: PNG });
    const m = /api\.themoviedb\.org\/3\/(tv|movie)\/(\d+)\/watch\/providers/.exec(u);
    if (m) { const key = `${m[1]}/${m[2]}`; log.push(key); await wait(120); return r.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: +m[2], results: WORLD[key] || {} }) }); }
    if (u.includes('api.themoviedb.org')) return r.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ episodes: [], results: [] }) });
    return r.abort();
  });
  await page.evaluateOnNewDocument((s, pr, fixed, lg) => {
    if (!sessionStorage.getItem('__s')) { localStorage.setItem('watchnext-state-v1', JSON.stringify(s)); if (pr === null) localStorage.removeItem('watchnext-services-v1'); else localStorage.setItem('watchnext-services-v1', JSON.stringify(pr)); sessionStorage.setItem('__s', '1'); }
    if (lg) Object.defineProperty(navigator, 'language', { get: () => lg });
    const RealDate = Date; const start = RealDate.now(); const b = fixed;
    class FakeDate extends RealDate { constructor(...a) { if (a.length === 0) super(b + (RealDate.now() - start)); else super(...a); } static now() { return b + (RealDate.now() - start); } }
    window.Date = FakeDate;
  }, state, prefs, FIXED, lang);
  await page.goto('http://localhost:4193/', { waitUntil: 'networkidle0' }); await wait(400);
  if (tab) await go(page, tab);
  return { page, log };
}
const go = async (p, name) => { await p.evaluate((t) => [...document.querySelectorAll('nav.tabbar button')].find((x) => x.textContent.includes(t)).click(), name); await wait(500); };
const prefsOf = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('watchnext-services-v1') || 'null'));
const stateOf = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('watchnext-state-v1')));
const regionCard = (p) => p.evaluate(() => { const c = [...document.querySelectorAll('section')].find((s) => /Region/.test((s.querySelector('h2') || {}).textContent || '')); return c ? { text: c.innerText.replace(/\s+/g, ' '), value: c.querySelector('select').value, options: c.querySelectorAll('option').length, selected: c.querySelector('select').selectedOptions[0].textContent } : null; });
const svcChips = (p) => p.evaluate(() => { const c = [...document.querySelectorAll('section')].find((s) => /My services/.test((s.querySelector('h2') || {}).textContent || '')); return [...c.querySelectorAll('.chip')].map((x) => x.textContent.trim()); });
const rows = (p) => p.evaluate(() => [...document.querySelectorAll('.sd-mrow')].map((r) => [(r.querySelector('.sd-mrow-name') || {}).textContent, (r.querySelector('.sd-svc-meta') || {}).textContent || '']));
const settled = (p) => waitFor(async () => !(await p.evaluate(() => /Checking availability/.test(document.body.innerText))));
const setRegion = async (p, code) => { await p.select('[data-testid=region-select]', code); await wait(300); };

// ============================================================ A. the card
console.log('A. SETTINGS → REGION');
let { page: p, log } = await open(STATE(), { mine: ['netflix'], showsOnly: false, watchlistOnly: true }, { tab: 'Settings' });
await ok('a Region card sits before My services and shows Australia by default (nothing saved yet = Australia)', async () => {
  const c = await regionCard(p); assert.ok(c); assert.equal(c.value, 'AU'); assert.equal(c.selected, 'Australia'); assert.ok(c.options >= 40);
  assert.match(c.text, /Kept on this device only/); assert.match(c.text, /Change it when you travel/);
  const order = await p.evaluate(() => [...document.querySelectorAll('.sd-setcard h2')].map((h) => h.textContent)); assert.ok(order.indexOf('Region') > -1 && order.indexOf('Region') < order.indexOf('My services'));
});
await ok('in Australia the services list offers Stan and Binge', async () => { const chips = await svcChips(p); assert.ok(chips.includes('Stan') && chips.includes('Binge')); });
await p.evaluate(() => document.querySelector('[data-testid=region-select]').scrollIntoView({ block: 'center' })); await wait(200);
await p.screenshot({ path: `${OUT}/settings_region_phone.png` });
await setRegion(p, 'NZ');
await ok('choosing New Zealand is remembered on this device, in the services key and not in the library', async () => {
  const pr = await prefsOf(p); assert.equal(pr.region, 'NZ'); assert.deepEqual(pr.mine, ['netflix']);
  const st = await stateOf(p); assert.ok(!JSON.stringify(st).includes('"region"'));
});
await ok('outside Australia the services list no longer offers Stan and Binge, but keeps Netflix and Disney+', async () => { const chips = await svcChips(p); assert.ok(!chips.includes('Stan') && !chips.includes('Binge')); assert.ok(chips.includes('Netflix') && chips.includes('Disney+')); });
await p.close();

// ============================================================ B. the data follows the setting
console.log('B. AVAILABILITY FOLLOWS THE REGION');
({ page: p, log } = await open(STATE(), { mine: ['netflix'], showsOnly: false, watchlistOnly: true }, { tab: 'Watchlist' }));
await settled(p);
await ok('Australia (default): cached AU answers are used as they are; only the never-checked show is looked up; list = Netflix Show', async () => {
  assert.deepEqual([...log].sort(), ['tv/109']); const r = await rows(p); assert.deepEqual(r.map((x) => x[0]).sort(), ['Netflix Show']);
  const st = await stateOf(p); assert.equal(st.shows['tmdb:109'].providersRegion, 'AU');
});
await go(p, 'Settings'); log.length = 0; await setRegion(p, 'NZ'); await go(p, 'Watchlist'); await settled(p);
await ok('after switching to New Zealand every title is checked again for New Zealand', async () => { assert.deepEqual([...new Set(log)].sort(), ['tv/101', 'tv/102', 'tv/109']); });
await ok('the list now reflects New Zealand: Stan Show and Kiwi Show are on Netflix there; Netflix Show (Disney+ in NZ) drops out; labels say Netflix', async () => {
  const r = await rows(p); assert.deepEqual(r.map((x) => x[0]).sort(), ['Kiwi Show', 'Stan Show']); for (const x of r) assert.match(x[1], /Netflix/);
});
await ok('the new answers are stamped NZ and carry New Zealand\'s lists, not Australia\'s', async () => {
  const st = await stateOf(p); for (const id of ['101', '102', '109']) assert.equal(st.shows['tmdb:' + id].providersRegion, 'NZ', id);
  assert.deepEqual(st.shows['tmdb:101'].providers.map((x) => x.name), ['Disney Plus']);
});
await p.screenshot({ path: `${OUT}/watchlist_nz_phone.png` });
await go(p, 'Settings'); log.length = 0; await setRegion(p, 'AU'); await go(p, 'Watchlist'); await settled(p);
await ok('switching back to Australia checks again (the NZ answers are not reused) and restores the Australian list', async () => {
  assert.deepEqual([...new Set(log)].sort(), ['tv/101', 'tv/102', 'tv/109']); const r = await rows(p); assert.deepEqual(r.map((x) => x[0]).sort(), ['Netflix Show']);
});
await ok('no sideways scroll', async () => { assert.equal(await p.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false); });
await p.close();

// ============================================================ C. the show page wording
console.log('C. SHOW PAGE');
const STATE_C = STATE(); STATE_C.shows['tmdb:101'] = { ...STATE_C.shows['tmdb:101'], followed: true, watchlist: false };
({ page: p, log } = await open(STATE_C, { mine: ['netflix'], showsOnly: false, watchlistOnly: false, region: 'NZ' }, { tab: 'Shows' }));
await ok('the show page says where it is streaming in the chosen country and ignores an answer cached for another one', async () => {
  await p.evaluate(() => [...document.querySelectorAll('.sd-ltile')].find((r) => /Netflix Show/.test(r.textContent)).click()); await wait(800);
  const t = await p.evaluate(() => document.body.innerText);
  assert.match(t, /Streaming in New Zealand/); assert.doesNotMatch(t, /Australia/);
  assert.match(t, /Tap to check availability/); // the cached Australian Netflix answer is not shown as New Zealand's
  assert.doesNotMatch(t, /Netflix\s*$/m);
});
await p.close();

// ============================================================ D. junk, suggestion, persistence
console.log('D. JUNK, PERSISTENCE');
({ page: p } = await open(STATE(), { mine: [], region: 'zz' }, { tab: 'Settings' }));
await ok('a saved region that is not a real code falls back to Australia', async () => { assert.equal((await regionCard(p)).value, 'AU'); });
await p.close();
({ page: p } = await open(STATE(), null, { tab: 'Settings', lang: 'en-NZ' }));
await ok('the browser language never changes the region by itself, and no suggestion is shown', async () => {
  assert.equal((await regionCard(p)).value, 'AU'); assert.equal(await prefsOf(p), null); assert.doesNotMatch((await regionCard(p)).text, /browser looks set/);
});
await setRegion(p, 'NZ');
await p.reload({ waitUntil: 'networkidle0' }); await wait(500); await go(p, 'Settings');
await ok('the choice survives a reload', async () => { assert.equal((await regionCard(p)).value, 'NZ'); });
await p.close();
({ page: p } = await open(STATE(), null, { w: 1280, h: 900, tab: 'Settings' }));
await ok('desktop: no sideways scroll, the select is keyboard reachable and labelled', async () => {
  assert.equal(await p.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false);
  assert.equal(await p.evaluate(() => { const s = document.querySelector('[data-testid=region-select]'); return s.closest('label').innerText.trim().startsWith('Region'); }), true);
});
await p.screenshot({ path: `${OUT}/settings_region_desktop.png` });
await p.close();

console.log(`\n${checks} checks passed`); console.log('PROBLEMS:', problems.length ? '\n' + problems.join('\n') : 'none'); await browser.close(); server.close();
