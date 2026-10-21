process.env.TZ = 'Australia/Hobart';
import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { workPath, browserFile, APP_DIST } from '../../tests/paths.mjs';
import { launchBrowser } from './launch.mjs';

// Custom lists: Watchlist → Lists (create from an idea, search + add, statuses, reorder,
// "＋ Watchlist", rename, delete) and the "Lists" row on a show page and a movie sheet. TMDB mocked.
const PORT = 4200;
const DIST = APP_DIST; const OUT = workPath('out_lists'); fs.mkdirSync(OUT, { recursive: true });
const fontsCss = fs.readFileSync(browserFile('fonts.css'), 'utf8');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => { let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html'; const f = path.join(DIST, p); if (!f.startsWith(DIST) || !fs.existsSync(f)) { res.writeHead(404); return res.end('nf'); } res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res); });
await new Promise((r) => server.listen(PORT, r));
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const CORS = { 'access-control-allow-origin': '*' };
const FIXED = Date.parse('2026-10-21T08:00:00.000Z');
const ep = (d) => ({ at: `${d}T10:00:00.000Z`, min: 50 });
const STATE = () => ({ shows: {
  'tmdb:1': { tmdbId: 1, name: 'Dark', followed: true, poster: null, status: 'Ended', providers: [], lastSynced: '2026-10-01T00:00:00Z', runtimeMin: 50, genres: ['Drama'], totalEpisodes: 10, seasons: [{ n: 1, count: 10, air: '2017-12-01' }], watched: { '1x1': ep('2026-10-01'), '1x2': ep('2026-10-02') } },
}, movies: [{ tmdbId: 949, name: 'Heat', status: 'watched', watchedAt: '2026-09-01T10:00:00.000Z', runtimeMin: 170, poster: null, year: '1995', rating: 4.5 }], settings: { tmdbKey: 'TESTKEY' } });
const MOVIE = { 500: { id: 500, title: 'RRR', release_date: '2022-03-24', runtime: 187, poster_path: null, genres: [{ name: 'Action' }], belongs_to_collection: null }, 949: { id: 949, title: 'Heat', release_date: '1995-12-15', runtime: 170, poster_path: null, genres: [], belongs_to_collection: null } };

const browser = await launchBrowser(puppeteer);
const problems = []; let checks = 0; const ok = async (n, f) => { await f(); checks++; console.log('  PASS', n); }; const wait = (ms = 350) => new Promise((r) => setTimeout(r, ms));
const until = async (page, fn, arg, ms = 6000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await page.evaluate(fn, arg)) return true; await wait(100); } throw new Error('timed out waiting for ' + fn.toString().slice(0, 90)); };
async function open({ w = 390, h = 844, keep = false } = {}) {
  const page = await browser.newPage(); await page.emulateTimezone('Australia/Hobart'); await page.setViewport({ width: w, height: h, deviceScaleFactor: 2 });
  page.on('pageerror', (e) => problems.push('pageerror: ' + e.message)); page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) problems.push('console.error: ' + m.text()); });
  page.on('dialog', (d) => d.accept());
  await page.setBypassServiceWorker(true); await page.setRequestInterception(true);
  page.on('request', (r) => {
    const u = r.url();
    if (u.startsWith('http://localhost:')) return r.continue();
    if (u.includes('fonts.googleapis.com')) return r.respond({ status: 200, contentType: 'text/css', body: fontsCss });
    if (u.includes('image.tmdb.org')) return r.respond({ status: 200, contentType: 'image/png', body: PNG });
    const j = (b) => r.respond({ status: 200, headers: CORS, contentType: 'application/json', body: JSON.stringify(b) });
    if (/\/search\/tv\?/.test(u)) return j({ results: [{ id: 1, name: 'Dark', first_air_date: '2017-12-01', poster_path: null }, { id: 2, name: 'Dark Matter', first_air_date: '2024-05-08', poster_path: null }] });
    if (/\/search\/movie\?/.test(u)) return j({ results: [{ id: 500, title: 'RRR', release_date: '2022-03-24', poster_path: null }] });
    const m = /\/movie\/(\d+)\?/.exec(u);
    if (m) return j(MOVIE[m[1]] || { id: +m[1], title: 'X' });
    if (u.includes('api.themoviedb.org')) return j({ episodes: [], results: [], cast: [], crew: [] });
    return r.abort();
  });
  await page.evaluateOnNewDocument((s, fixed, keep) => {
    if (!keep && !sessionStorage.getItem('__s')) { localStorage.setItem('watchnext-state-v1', JSON.stringify(s)); sessionStorage.setItem('__s', '1'); }
    const RealDate = Date; const start = RealDate.now(); const b = fixed;
    class FakeDate extends RealDate { constructor(...a) { if (a.length === 0) super(b + (RealDate.now() - start)); else super(...a); } static now() { return b + (RealDate.now() - start); } }
    window.Date = FakeDate;
  }, STATE(), FIXED, keep);
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle0' }); await wait(400);
  return page;
}
const tab = (p, name) => p.evaluate((t) => [...document.querySelectorAll('nav.tabbar button')].find((x) => x.textContent.includes(t)).click(), name);
const clickBtn = (p, text, scope = 'body') => p.evaluate((t, s) => { const b = [...document.querySelector(s).querySelectorAll('button')].find((x) => x.textContent.trim() === t || x.getAttribute('aria-label') === t); if (!b) throw new Error('no button ' + t); b.click(); }, text, scope);
const lists = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('watchnext-state-v1')).lists || {});
const live = async (p) => Object.values(await lists(p)).filter((l) => !l.deleted);
const items = (p) => p.evaluate(() => [...document.querySelectorAll('[data-testid=list-items] .sd-mrow')].map(((x) => (x.querySelector('.sd-mrow-info').innerText + ' ' + ((x.querySelector('.sd-mrow-actions') || {}).innerText || '')).replace(/\s+/g, ' ').trim())));
const setInput = (p, sel, v) => p.$eval(sel, (el, val) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, val); el.dispatchEvent(new Event('input', { bubbles: true })); }, v);
const noSideways = (p) => p.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);

console.log('A. WATCHLIST → LISTS');
let p = await open();
await tab(p, 'Watchlist'); await wait(300);
await ok('Watchlist has a Lists tab between Queue and Discover', async () => {
  assert.deepEqual(await p.evaluate(() => [...document.querySelectorAll('.sd-tabs2 [role=tab]')].map((b) => b.textContent)), ['Queue', 'Lists', 'Discover']);
});
await p.evaluate(() => [...document.querySelectorAll('.sd-tabs2 [role=tab]')].find((b) => b.textContent === 'Lists').click()); await wait(250);
await ok('no lists yet: a friendly empty message and idea chips (Ramadan watch, Watch with friends…)', async () => {
  const t = await p.evaluate(() => document.querySelector('[data-testid=lists]').innerText);
  assert.match(t, /No lists yet/); assert.match(t, /Ramadan watch/); assert.match(t, /Watch with friends/);
});
await clickBtn(p, 'Ramadan watch'); await until(p, () => !!document.querySelector('[data-testid=list-detail]'));
await ok('tapping an idea makes the list and opens it (empty)', async () => {
  const l = await live(p); assert.equal(l.length, 1); assert.equal(l[0].name, 'Ramadan watch');
  assert.match(await p.evaluate(() => document.querySelector('[data-testid=list-detail]').innerText), /Ramadan watch[\s\S]*This list is empty/);
  assert.match(await p.evaluate(() => [...document.querySelectorAll('.sd-tabs2 [role=tab]')].map((b) => b.textContent).join('|')), /Lists · 1/);
});
await setInput(p, '[data-testid=list-add] input[type=search]', 'dark'); await p.evaluate(() => document.querySelector('[data-testid=list-add] form').requestSubmit());
await until(p, () => document.querySelectorAll('[data-testid=list-add] .sd-mrow').length === 3);
await ok('searching finds shows AND movies, each with an Add button', async () => {
  const r = await p.evaluate(() => [...document.querySelectorAll('[data-testid=list-add] .sd-mrow')].map(((x) => (x.querySelector('.sd-mrow-info').innerText + ' ' + ((x.querySelector('.sd-mrow-actions') || {}).innerText || '')).replace(/\s+/g, ' ').trim())));
  assert.deepEqual(r, ['Dark Show · 2017 Add', 'Dark Matter Show · 2024 Add', 'RRR Movie · 2022 Add']);
});
await p.evaluate(() => { const rows = [...document.querySelectorAll('[data-testid=list-add] .sd-mrow')]; rows[0].querySelector('button').click(); }); await wait(150);
await p.evaluate(() => { const rows = [...document.querySelectorAll('[data-testid=list-add] .sd-mrow')]; rows[2].querySelector('button').click(); }); await wait(250);
await ok('added titles appear in the list with where they stand in your library', async () => {
  assert.deepEqual(await items(p), ['Dark Show · 2017 Watching · 2 of 10 ↑ ↓ ✕', 'RRR Movie · 2022 Not in your library ＋ Watchlist ↑ ↓ ✕']);
  assert.match(await p.evaluate(() => document.querySelector('[data-testid=list-progress]').textContent), /2 titles · 0 of 2 watched/);
  assert.match(await p.evaluate(() => document.querySelector('[data-testid=list-add]').innerText), /Added ✓/);
});
await clickBtn(p, 'Move RRR up'); await wait(200);
await ok('↑ moves RRR to the top (the order is saved)', async () => {
  assert.deepEqual((await live(p))[0].items.map((x) => x.name), ['RRR', 'Dark']);
});
await clickBtn(p, '＋ Watchlist'); await until(p, () => /On your watchlist/.test(document.querySelector('[data-testid=list-items]').innerText));
await ok('"＋ Watchlist" adds RRR to your watchlist (and the list shows it)', async () => {
  assert.ok(await p.evaluate(() => JSON.parse(localStorage.getItem('watchnext-state-v1')).movies.some((m) => m.tmdbId === 500 && m.status === 'planned')));
});
await ok('phone: no sideways scroll in a list', async () => { assert.equal(await noSideways(p), false); });
await p.screenshot({ path: `${OUT}/list_phone.png`, fullPage: true });
await p.evaluate(() => { const rows = [...document.querySelectorAll('[data-testid=list-items] .sd-mrow')]; rows[1].querySelector('.sd-open').click(); }); await wait(600);
await ok('tapping a show in the list opens its show page', async () => { assert.match(await p.evaluate(() => document.body.innerText), /Seasons/); });

console.log('B. SHOW PAGE "LISTS" ROW');
await ok('the show page says which lists hold Dark', async () => { assert.match(await p.evaluate(() => document.querySelector('[data-testid=lists-row]').innerText.replace(/\s+/g, ' ')), /Lists Ramadan watch/); });
await p.evaluate(() => document.querySelector('[data-testid=lists-row]').click()); await until(p, () => !!document.querySelector('[data-testid=list-picker]'));
await ok('the picker shows your list ticked, plus idea chips for new ones', async () => {
  const r = await p.evaluate(() => ({ rows: [...document.querySelectorAll('.sd-lpick-row')].map((l) => `${l.querySelector('.sd-lpick-name').textContent}:${l.querySelector('input').checked}`), text: document.querySelector('[data-testid=list-picker]').innerText }));
  assert.deepEqual(r.rows, ['Ramadan watch:true']); assert.match(r.text, /Watch with friends/); assert.doesNotMatch(r.text.split('Ideas:')[1] || '', /Ramadan watch/);
});
await setInput(p, '[data-testid=list-picker] input[type=text]', 'Watch with Mum'); await p.evaluate(() => document.querySelector('[data-testid=list-picker] form').requestSubmit()); await wait(250);
await p.evaluate(() => [...document.querySelectorAll('.sd-lpick-row')].find((l) => l.textContent.includes('Ramadan')).querySelector('input').click()); await wait(250);
await ok('a new list from the picker gets Dark straight away; unticking takes it out of Ramadan watch', async () => {
  const l = await live(p);
  assert.deepEqual(l.find((x) => x.name === 'Watch with Mum').items.map((x) => x.name), ['Dark']);
  assert.deepEqual(l.find((x) => x.name === 'Ramadan watch').items.map((x) => x.name), ['RRR']);
});
await p.evaluate(() => document.querySelector('[role=dialog] .sd-xbtn').click()); await wait(250);
await ok('the row now reads "Watch with Mum"', async () => { assert.match(await p.evaluate(() => document.querySelector('[data-testid=lists-row]').innerText), /Watch with Mum/); });

console.log('C. MOVIE SHEET "LISTS" ROW');
await tab(p, 'Movies'); await wait(500);
await p.evaluate(() => [...document.querySelectorAll('.sd-lgrid .sd-ltile')].find((t) => /Heat/.test(t.getAttribute('aria-label'))).click());
await until(p, () => !!document.querySelector('[data-testid=lists-row]'));
await p.evaluate(() => document.querySelector('[data-testid=lists-row]').click()); await until(p, () => !!document.querySelector('[data-testid=list-picker]'));
await p.evaluate(() => [...document.querySelectorAll('.sd-lpick-row')].find((l) => l.textContent.includes('Ramadan')).querySelector('input').click()); await wait(250);
await ok('a film can be added from its sheet', async () => { assert.deepEqual((await live(p)).find((x) => x.name === 'Ramadan watch').items.map((x) => x.name), ['RRR', 'Heat']); });
await p.evaluate(() => document.querySelector('[data-testid=list-picker]').closest('[role=dialog]').querySelector('.sd-xbtn').click()); await wait(250);

console.log('D. RENAME, DELETE, KEEP');
await p.keyboard.press('Escape'); await wait(200);
await tab(p, 'Watchlist'); await wait(300);
await p.evaluate(() => [...document.querySelectorAll('.sd-tabs2 [role=tab]')].find((b) => b.textContent.startsWith('Lists')).click()); await wait(250);
await ok('the Lists page shows a card per list with its count and how many are watched', async () => {
  const c = await p.evaluate(() => [...document.querySelectorAll('.sd-lcard')].map((x) => x.innerText.replace(/\s+/g, ' ').trim()));
  assert.equal(c.length, 2);
  assert.ok(c.some((x) => /Ramadan watch 2 titles · 1 watched/.test(x)), JSON.stringify(c));
});
await p.evaluate(() => document.querySelector('.sd-lcard[data-list="Ramadan watch"]').click()); await wait(250);
await clickBtn(p, 'Rename'); await setInput(p, '[data-testid=list-detail] input[type=text]', 'Ramadan 2027'); await clickBtn(p, 'Save'); await wait(200);
await ok('rename', async () => { assert.ok((await live(p)).some((x) => x.name === 'Ramadan 2027')); });
await clickBtn(p, 'Delete this list'); await wait(300);
await ok('delete (after a confirm): the list is gone, the titles stay in your library', async () => {
  const l = await live(p); assert.deepEqual(l.map((x) => x.name), ['Watch with Mum']);
  assert.ok(await p.evaluate(() => JSON.parse(localStorage.getItem('watchnext-state-v1')).movies.some((m) => m.tmdbId === 949)));
  assert.ok(await p.evaluate(() => !document.querySelector('[data-testid=list-detail]')));
});
await p.reload({ waitUntil: 'networkidle0' }); await wait(300);
await tab(p, 'Watchlist'); await wait(250);
await ok('after a reload the lists are still there', async () => {
  assert.match(await p.evaluate(() => [...document.querySelectorAll('.sd-tabs2 [role=tab]')].map((b) => b.textContent).join('|')), /Lists · 1/);
});
await p.evaluate(() => [...document.querySelectorAll('.sd-tabs2 [role=tab]')].find((b) => b.textContent.startsWith('Lists')).click()); await wait(250);
await p.screenshot({ path: `${OUT}/lists_phone.png`, fullPage: true });
await p.close();

console.log('E. DESKTOP');
p = await open({ w: 1280, h: 900 });
await tab(p, 'Watchlist'); await wait(250);
await p.evaluate(() => [...document.querySelectorAll('.sd-tabs2 [role=tab]')].find((b) => b.textContent.startsWith('Lists')).click()); await wait(250);
await clickBtn(p, 'Watch with friends'); await wait(250);
await ok('desktop: no sideways scroll', async () => { assert.equal(await noSideways(p), false); });
await p.screenshot({ path: `${OUT}/list_desktop.png`, fullPage: true });
await p.close();

console.log(`\n${checks} checks passed`); console.log('PROBLEMS:', problems.length ? '\n' + problems.join('\n') : 'none'); await browser.close(); server.close();
