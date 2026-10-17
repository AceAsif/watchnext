process.env.TZ = 'Australia/Hobart';
import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import zlib from 'node:zlib';
import { workPath, browserFile, APP_DIST } from '../../tests/paths.mjs';
import { launchBrowser } from './launch.mjs';

// Settings → Import from Letterboxd: pick the export zip, preview, import with a mocked TMDB.
const DIST = APP_DIST; const OUT = workPath('out_lb'); fs.mkdirSync(OUT, { recursive: true });
const fontsCss = fs.readFileSync(browserFile('fonts.css'), 'utf8');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => { let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html'; const f = path.join(DIST, p); if (!f.startsWith(DIST) || !fs.existsSync(f)) { res.writeHead(404); return res.end('nf'); } res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res); });
await new Promise((r) => server.listen(4195, r));
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

function makeZip(files) {
  const parts = []; const cd = []; let off = 0;
  for (const [name, text] of files) {
    const nb = Buffer.from(name); const raw = Buffer.from(text); const data = zlib.deflateRawSync(raw);
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(8, 8); lh.writeUInt32LE(data.length, 18); lh.writeUInt32LE(raw.length, 22); lh.writeUInt16LE(nb.length, 26);
    parts.push(lh, nb, data);
    const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(8, 10); ch.writeUInt32LE(data.length, 20); ch.writeUInt32LE(raw.length, 24); ch.writeUInt16LE(nb.length, 28); ch.writeUInt32LE(off, 42);
    cd.push(ch, nb); off += 30 + nb.length + data.length;
  }
  const cdb = Buffer.concat(cd); const e = Buffer.alloc(22);
  e.writeUInt32LE(0x06054b50, 0); e.writeUInt16LE(files.length, 8); e.writeUInt16LE(files.length, 10); e.writeUInt32LE(cdb.length, 12); e.writeUInt32LE(off, 16);
  return Buffer.concat([...parts, cdb, e]);
}
const ZIP = path.join(OUT, 'letterboxd-export.zip');
fs.writeFileSync(ZIP, makeZip([
  ['watched.csv', 'Date,Name,Year,Letterboxd URI\n2020-05-01,Ready,2011,x\n2021-02-03,Tár,2022,x\n2019-01-01,Inception,2010,x\n'],
  ['diary.csv', 'Date,Name,Year,Letterboxd URI,Rating,Rewatch,Tags,Watched Date\n2020-03-23,Inception,2010,x,4.5,,,2020-03-22\n2021-06-01,Inception,2010,x,5,Yes,,2021-05-30\n'],
  ['ratings.csv', 'Date,Name,Year,Letterboxd URI,Rating\n2020-05-01,Ready,2011,x,3.5\n'],
  ['watchlist.csv', 'Date,Name,Year,Letterboxd URI\n2022-01-01,Dune,2021,x\n'],
  ['deleted/diary.csv', 'Date,Name,Year,Letterboxd URI\n2020-01-01,Junk,1999,x\n'],
]));

const FILMS = {
  Ready: { 2019: { id: 20, title: 'Ready', release_date: '2019-05-05' }, 2011: { id: 2, title: 'Ready', release_date: '2011-06-03' } },
  Inception: { 2010: { id: 1, title: 'Inception', release_date: '2010-07-16' } },
  Dune: { 2021: { id: 3, title: 'Dune', release_date: '2021-09-15' } },
};
const DETAILS = { 1: { id: 1, title: 'Inception', runtime: 148, poster_path: '/i.jpg', release_date: '2010-07-16', genres: [{ name: 'Sci-Fi' }] }, 2: { id: 2, title: 'Ready', runtime: 150, poster_path: '/r.jpg', release_date: '2011-06-03', genres: [{ name: 'Comedy' }] }, 3: { id: 3, title: 'Dune', runtime: 155, poster_path: '/d.jpg', release_date: '2021-09-15', genres: [] } };
const searched = [];

const browser = await launchBrowser(puppeteer);
const problems = []; let checks = 0; const ok = async (n, f) => { await f(); checks++; console.log('  PASS', n); }; const wait = (ms = 350) => new Promise((r) => setTimeout(r, ms));
async function open(state) {
  const page = await browser.newPage(); await page.emulateTimezone('Australia/Hobart'); await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  page.on('pageerror', (e) => problems.push('pageerror: ' + e.message)); page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) problems.push('console.error: ' + m.text()); });
  await page.setBypassServiceWorker(true); await page.setRequestInterception(true);
  page.on('request', (r) => {
    const u = r.url(); if (u.startsWith('http://localhost:')) return r.continue();
    if (u.includes('fonts.googleapis.com')) return r.respond({ status: 200, contentType: 'text/css', body: fontsCss });
    if (u.includes('image.tmdb.org')) return r.respond({ status: 200, contentType: 'image/png', body: PNG });
    if (u.includes('api.themoviedb.org')) {
      const url = new URL(u); const j = (o) => r.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(o) });
      if (url.pathname === '/3/search/movie') {
        const q = url.searchParams.get('query'); const y = url.searchParams.get('year'); searched.push({ q, y });
        const by = FILMS[q] || {}; const all = Object.values(by);
        return j({ results: y ? all.filter((f) => f.release_date.startsWith(y)) : all });
      }
      const m = url.pathname.match(/^\/3\/movie\/(\d+)$/); if (m) return j(DETAILS[m[1]] || {});
      return j({ episodes: [], results: [] });
    }
    return r.abort();
  });
  await page.evaluateOnNewDocument((s) => { if (!sessionStorage.getItem('__s')) { localStorage.setItem('watchnext-state-v1', JSON.stringify(s)); sessionStorage.setItem('__s', '1'); } }, state);
  await page.goto('http://localhost:4195/', { waitUntil: 'networkidle0' }); await wait(500);
  await page.evaluate(() => [...document.querySelectorAll('nav.tabbar button')].find((x) => x.textContent.includes('Settings')).click()); await wait(500);
  return page;
}
const movies = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('watchnext-state-v1')).movies);
const txt = (p, id) => p.evaluate((i) => (document.querySelector(`[data-testid=${i}]`) || {}).innerText || null, id);
const pick = async (p) => { const input = await p.$('[data-testid=lb-file]'); await input.uploadFile(ZIP); await wait(700); };
const until = async (p, id) => { for (let i = 0; i < 40; i++) { if (await txt(p, id)) return; await wait(250); } throw new Error('timeout waiting for ' + id); };

console.log('A. IMPORT A ZIP');
let p = await open({ shows: {}, movies: [], settings: { tmdbKey: 'TESTKEY' } });
await ok('the Letterboxd card sits right after the TV Time import card', async () => {
  const order = await p.evaluate(() => [...document.querySelectorAll('.sd-setcard h2')].map((h) => h.textContent));
  assert.equal(order.indexOf('Import from Letterboxd'), order.indexOf('Import TV Time history') + 1, order.join(' | '));
});
await pick(p);
await ok('choosing the zip shows what was found (and ignores the deleted/ folder)', async () => { assert.equal(await txt(p, 'lb-preview'), 'Found 3 films, 1 rewatch, 2 ratings, 1 watchlist film.'); });
await p.evaluate(() => [...document.querySelectorAll('section')].find((x) => /Import from Letterboxd/.test(x.innerText)).scrollIntoView({ block: 'start' })); await wait(250);
await p.screenshot({ path: `${OUT}/letterboxd_preview.png` });
await p.evaluate(() => document.querySelector('[data-testid=lb-start]').click());
await until(p, 'lb-done');
await ok('done message, and the film TMDB could not match is listed', async () => {
  assert.match(await txt(p, 'lb-done'), /^5 entries added\. 1 film couldn’t be matched on TMDB/);
  await p.evaluate(() => document.querySelector('.sd-lbun summary').click()); await wait(200);
  assert.equal(await txt(p, 'lb-unmatched'), 'Tár (2022)');
});
await p.evaluate(() => [...document.querySelectorAll('section')].find((x) => /Import from Letterboxd/.test(x.innerText)).scrollIntoView({ block: 'start' })); await wait(250);
await p.screenshot({ path: `${OUT}/letterboxd_done.png` });
await ok('searches carried the year, so Ready 2011 was found (not Ready 2019)', async () => {
  assert.ok(searched.some((s) => s.q === 'Ready' && s.y === '2011'), JSON.stringify(searched));
  const m = await movies(p); const ready = m.find((x) => x.name === 'Ready'); assert.equal(ready.tmdbId, 2); assert.equal(ready.year, '2011'); assert.equal(ready.runtimeMin, 150); assert.equal(ready.rating, 4);
});
await ok('Inception: two viewings on the real watch dates (22 Mar 2020, 30 May 2021), ratings on the viewings', async () => {
  const inc = (await movies(p)).filter((x) => x.name === 'Inception').sort((a, b) => a.watchedAt.localeCompare(b.watchedAt));
  assert.equal(inc.length, 2); assert.equal(inc[0].tmdbId, 1);
  const day = (iso) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Australia/Hobart' });
  assert.deepEqual(inc.map((x) => day(x.watchedAt)), ['2020-03-22', '2021-05-30']); assert.deepEqual(inc.map((x) => x.rating), [5, 5]);
});
await ok('unmatched film kept by name; watchlist film is planned', async () => {
  const m = await movies(p); const tar = m.find((x) => x.name === 'Tár'); assert.ok(tar && tar.tmdbId === undefined && tar.status === 'watched');
  const dune = m.find((x) => x.name === 'Dune'); assert.equal(dune.status, 'planned'); assert.equal(dune.tmdbId, 3);
  assert.equal(m.length, 5); assert.ok(!m.some((x) => x.name === 'Junk'));
});
await ok('Movies tab shows them (Ready, Inception 2×)', async () => {
  await p.evaluate(() => [...document.querySelectorAll('nav.tabbar button')].find((x) => x.textContent.includes('Movies')).click()); await wait(600);
  const t = await p.evaluate(() => document.body.innerText); assert.match(t, /Ready/); assert.match(t, /Inception/);
  assert.ok(await p.evaluate(() => document.querySelectorAll('[data-testid=times-chip]').length) >= 1);
});
await p.close();

console.log('B. RE-IMPORT, NO KEY, BAD FILE');
p = await open({ shows: {}, movies: [], settings: { tmdbKey: 'TESTKEY' } });
await pick(p); await p.evaluate(() => document.querySelector('[data-testid=lb-start]').click()); await until(p, 'lb-done');
await p.evaluate(() => [...document.querySelectorAll('.sd-setcard button')].find((b) => b.textContent === 'Done').click()); await wait(250);
await pick(p); await p.evaluate(() => document.querySelector('[data-testid=lb-start]').click()); await until(p, 'lb-done');
await ok('importing the same file again adds nothing and creates no duplicates', async () => {
  assert.match(await txt(p, 'lb-done'), /^0 entries added, 5 already there/); assert.equal((await movies(p)).length, 5);
});
await p.close();
p = await open({ shows: {}, movies: [], settings: {} });
await pick(p);
await ok('without a TMDB key: the preview warns, and Import now explains instead of failing silently', async () => {
  const t = await p.evaluate(() => document.body.innerText); assert.match(t, /Add your TMDB key above first/);
  await p.evaluate(() => document.querySelector('[data-testid=lb-start]').click()); await wait(400);
  assert.match(await txt(p, 'lb-error'), /Add your TMDB key/); assert.equal((await movies(p)).length, 0);
});
await p.close();
p = await open({ shows: {}, movies: [], settings: { tmdbKey: 'TESTKEY' } });
const bad = path.join(OUT, 'junk.csv'); fs.writeFileSync(bad, 'a,b\n1,2\n');
await (await p.$('[data-testid=lb-file]')).uploadFile(bad); await wait(600);
await ok('a wrong file gives a clear message, nothing changes', async () => { assert.match(await txt(p, 'lb-error'), /could not find watched\.csv/); assert.equal((await movies(p)).length, 0); });
await p.close();

console.log('C. DESKTOP');
p = await open({ shows: {}, movies: [], settings: { tmdbKey: 'TESTKEY' } });
await p.setViewport({ width: 1280, height: 900 });
await ok('no sideways scroll', async () => { assert.equal(await p.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false); });
await p.close();

console.log(`\n${checks} checks passed`); console.log('PROBLEMS:', problems.length ? '\n' + problems.join('\n') : 'none'); await browser.close(); server.close();
