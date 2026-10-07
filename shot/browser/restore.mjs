import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { workPath, browserFile, APP_DIST } from '../../tests/paths.mjs';
import { launchBrowser } from './launch.mjs';

const OUT = workPath('out8');
fs.mkdirSync(OUT, { recursive: true });
const fontsCss = fs.readFileSync(browserFile('fonts.css'), 'utf8');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
const DIST = APP_DIST;
const server = http.createServer((req, r) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
  const f = path.join(DIST, p);
  if (!f.startsWith(DIST) || !fs.existsSync(f)) { r.writeHead(404); return r.end('nf'); }
  r.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r);
});
await new Promise((r) => server.listen(4191, r));
const BASE = 'http://localhost:4191';
const FIXED_ISO = '2026-10-01T22:00:00.000Z'; // Fri 2 Oct 2026, 09:00 in Hobart
const CMD = 'python tools/convert_tvtime.py gdpr-data.zip -o tvtime_import.json';

const W = (n) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`1x${i + 1}`, { at: '2026-03-01T10:00:00.000Z', min: 40, n: 1 }]));
const mk = (name, extra = {}) => ({ name, tmdbId: null, poster: null, watched: {}, ...extra });
const STATE = () => ({
  shows: {
    'tmdb:1': mk('Suits', { tmdbId: 1, followed: true, totalEpisodes: 10, watched: W(4) }),
    'tmdb:2': mk('Wishlist Show', { tmdbId: 2, watchlist: true }),
    'tmdb:3': mk('Beelzebub', { tmdbId: 3, followed: false, watched: W(60) }),
    'tmdb:4': mk('Black Jack (2004)', { tmdbId: 4, followed: false }),
    'tmdb:5': mk('Baki the Grappler', { tmdbId: 5, followed: false }),
  },
  movies: [{ name: 'Akira', tmdbId: 9, watchedAt: '2026-05-01T10:00:00.000Z', runtimeMin: 124 }],
  settings: { tmdbKey: '' },
});
const SECRET = 'abcDEF1234567890secretkey';

fs.mkdirSync(workPath('tmp'), { recursive: true });
const wf = (name, obj) => { const p = path.join(workPath('tmp'), name); fs.writeFileSync(p, typeof obj === 'string' ? obj : JSON.stringify(obj)); return p; };
const GOOD = wf('good.json', { source: 'tvtime', shows: [
  { tvdbId: 777001, name: 'Imported One', followed: true, watches: [{ season: 1, episode: 1, watchedAt: '2020-01-01T10:00:00Z', runtimeMin: 40, rewatch: false }, { season: 1, episode: 2, watchedAt: '2020-01-02T10:00:00Z', runtimeMin: 40, rewatch: false }, { season: 1, episode: 3, watchedAt: '2020-01-03T10:00:00Z', runtimeMin: 40, rewatch: false }] },
  { tvdbId: 777002, name: 'Imported Two', followed: true, watches: [{ season: 1, episode: 1, watchedAt: '2021-01-01T10:00:00Z', runtimeMin: 40, rewatch: false }, { season: 1, episode: 2, watchedAt: '2021-01-02T10:00:00Z', runtimeMin: 40, rewatch: false }] },
], movies: [] });
const BADJSON = wf('bad.json', '{ this is not json');
const WRONG = wf('wrong.json', { hello: 'world' });

const browser = await launchBrowser(puppeteer);
const problems = [];
const wait = (ms = 250) => new Promise((r) => setTimeout(r, ms));
async function open({ w = 390, h = 844, state = STATE(), tab = 'Settings', tombs = null } = {}) {
  const page = await browser.newPage();
  await page.emulateTimezone('Australia/Hobart');
  await page.setViewport({ width: w, height: h, deviceScaleFactor: w < 500 ? 2 : 1 });
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) problems.push(`console.error: ${m.text()}`); });
  await page.setRequestInterception(true);
  page.on('request', (r) => {
    const u = r.url();
    if (u.startsWith(BASE)) return r.continue();
    if (u.includes('fonts.googleapis.com')) return r.respond({ status: 200, contentType: 'text/css', body: fontsCss });
    return r.abort();
  });
  await page.evaluateOnNewDocument((s, fixed, tombs) => {
    if (!sessionStorage.getItem('__seeded')) { localStorage.setItem('watchnext-state-v1', JSON.stringify(s)); if (tombs) localStorage.setItem('watchnext-tombstones-v1', JSON.stringify(tombs)); sessionStorage.setItem('__seeded', '1'); }
    const RD = Date; const start = RD.now(); const b = RD.parse(fixed);
    class FD extends RD { constructor(...a) { if (a.length === 0) super(b + (RD.now() - start)); else super(...a); } static now() { return b + (RD.now() - start); } }
    window.Date = FD;
    // capture downloads instead of performing them
    const orig = URL.createObjectURL; URL.createObjectURL = (blob) => { window.__blob = blob; return orig.call(URL, blob); };
    HTMLAnchorElement.prototype.click = function () { window.__download = this.download; };
  }, state, FIXED_ISO, tombs);
  await page.goto(BASE + '/', { waitUntil: 'networkidle0' });
  await wait(300);
  await page.evaluate((t) => [...document.querySelectorAll('nav.tabbar button')].find((b) => b.textContent.includes(t)).click(), tab);
  await wait(400);
  return page;
}
const stored = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('watchnext-state-v1')));
const text = (p) => p.evaluate(() => document.body.innerText);
const shot = async (p, name, full = true) => { await p.screenshot({ path: `${OUT}/${name}.png`, fullPage: full }); console.log('  shot', name); };
const noOverflow = (p) => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const click = (p, sel, label) => p.evaluate((s, l) => { const el = [...document.querySelectorAll(s)].find((e) => !l || e.textContent.trim().includes(l)); if (!el) throw new Error(`no ${s} "${l}"`); el.click(); }, sel, label);
const banner = (p) => p.evaluate(() => { const b = document.querySelector('.sd-banner'); return b ? { text: b.querySelector('.txt').textContent, role: b.getAttribute('role'), err: b.classList.contains('err') } : null; });
let checks = 0; const ok = (name, fn) => { fn(); checks++; console.log('  PASS', name); };


// ---------------------------------------------------------------- a rich original library
const RICH = () => ({
  shows: {
    'tmdb:1': mk('Suits', { tmdbId: 1, followed: true, totalEpisodes: 134, rating: 4, ratedAt: '2026-05-01T00:00:00.000Z', platform: 'netflix', watched: W(30), genres: ['Drama'], addedAt: '2026-01-01T00:00:00.000Z' }),
    'tmdb:2': mk('Wishlist Show', { tmdbId: 2, watchlist: true }),
    'tmdb:3': mk('Beelzebub', { tmdbId: 3, followed: false, watched: W(60) }),
    'tmdb:4': mk('Black Jack (2004)', { tmdbId: 4, followed: false }),
    'tvdb:77': mk('Old Import', { tvdbId: 77, followed: false, watched: Object.fromEntries(Array.from({ length: 5 }, (_, i) => [`1x${i + 1}`, { at: '2018-08-12T00:00:00.000Z', min: 40, n: 2 }])) }),
    'tmdb:6': mk('Anime Pick', { tmdbId: 6, followed: true, platform: 'crunchyroll', rating: 5, watched: W(12) }),
  },
  movies: [
    { name: 'Akira', tmdbId: 9, watchedAt: '2026-05-01T10:00:00.000Z', runtimeMin: 124, rating: 5, platform: 'cinema' },
    { name: 'Akira', tmdbId: 9, watchedAt: '2026-08-01T10:00:00.000Z', runtimeMin: 124 },
    { name: 'Perfect Blue', tmdbId: 11, watchedAt: '2026-06-01T10:00:00.000Z', runtimeMin: 81, rating: 4 },
    { name: 'Planned One', tmdbId: 10, status: 'planned', runtimeMin: 100 },
  ],
  settings: { tmdbKey: SECRET },
});
const TOTAL_WATCHES = 30 + 60 + 5 + 12;
const readBackup = (p) => p.evaluate(async () => (window.__blob ? await window.__blob.text() : null));

console.log('1. ROUND TRIP: download -> Delete all data -> restore');
let p = await open({ state: RICH() });
const orig = await stored(p);
await click(p, '.sd-setbtn', 'Download backup'); await wait(400);
const backupText = await readBackup(p);
ok('the downloaded backup has all data and NO key', () => { assert.ok(!backupText.includes(SECRET)); const j = JSON.parse(backupText); assert.equal(Object.keys(j.shows).length, 6); assert.equal(j.movies.length, 4); });
const backupPath = wf('backup.json', backupText);
await p.click('.sd-setcard.danger .sd-setbtn'); await wait(300); await click(p, '.sd-confirm-acts button', 'Delete all data'); await wait(400);
let st = await stored(p);
ok('Delete all data really emptied this device (shows, movies, key)', () => { assert.deepEqual(Object.keys(st.shows), []); assert.deepEqual(st.movies, []); assert.equal(st.settings.tmdbKey, ''); });
let ri = await p.$('input[aria-label="Backup file to restore"]'); await ri.uploadFile(backupPath); await wait(700);
st = await stored(p); let bn = await banner(p);
ok('RESTORED EXACTLY: every show (ratings, platforms, watchlist, rewatch counts, watched episodes) is identical to the original', () => assert.deepEqual(st.shows, orig.shows));
ok('RESTORED EXACTLY: every movie, including the rewatch, the planned film and the Cinema platform', () => assert.deepEqual(st.movies, orig.movies));
ok('the TMDB key is NOT restored (backups never carry it)', () => assert.equal(st.settings.tmdbKey, ''));
ok(`banner reports the real numbers: 6 shows, ${TOTAL_WATCHES} episode watches, 4 movies`, () => { assert.equal(bn.text, `Restored from backup: 6 shows added, ${TOTAL_WATCHES} episode watches restored, 4 movies added.`); assert.equal(bn.err, false); });
const ui = await p.evaluate(() => ({ leftovers: document.querySelectorAll('.sd-orphs li').length, pill: (document.querySelector('#cleanup .sd-pill') || {}).textContent }));
ok('the page reflects the restore immediately (the Clean up card is back with its 3 leftovers)', () => assert.deepEqual(ui, { leftovers: 3, pill: '3 left over' }));
await shot(p, '01_restore_result', false);
await ri.uploadFile(backupPath); await wait(600); bn = await banner(p);
ok('IDEMPOTENT in the browser: restoring the same file again says nothing was needed', () => assert.equal(bn.text, 'Nothing to restore — this device already has everything in that file.'));
assert.deepEqual((await stored(p)).shows, orig.shows); checks++; console.log('  PASS …and changed nothing');
await p.close();

console.log('2. MERGE keeps what you have');
const W2 = (k, at) => Object.fromEntries(Array.from({ length: k }, (_, i) => [`1x${i + 1}`, { at, min: 40, n: 1 }]));
const LOCAL = { shows: { 'tmdb:1': mk('Suits', { tmdbId: 1, followed: true, rating: 2, platform: 'prime', watched: W2(10, '2026-09-01T10:00:00.000Z') }) }, movies: [{ name: 'Akira', tmdbId: 9, watchedAt: '2026-05-01T10:00:00.000Z', runtimeMin: 124 }], settings: { tmdbKey: 'LOCALKEY' } };
p = await open({ state: LOCAL });
ri = await p.$('input[aria-label="Backup file to restore"]'); await ri.uploadFile(backupPath); await wait(700);
st = await stored(p); bn = await banner(p);
ok('your rating (2) and platform (prime) win over the backup\'s (4, netflix); the 20 missing episodes are added', () => { const s = st.shows['tmdb:1']; assert.equal(s.rating, 2); assert.equal(s.platform, 'prime'); assert.equal(Object.keys(s.watched).length, 30); assert.equal(s.watched['1x1'].at, '2026-09-01T10:00:00.000Z'); });
ok('your own TMDB key is untouched by a restore', () => assert.equal(st.settings.tmdbKey, 'LOCALKEY'));
ok('the other 5 shows were added; the banner counts 1 updated', () => { assert.equal(Object.keys(st.shows).length, 6); assert.match(bn.text, /5 shows added, 1 show updated, \d+ episode watches restored, 3 movies added\./); });
await p.close();

console.log('3. WRONG FILE in the wrong box');
p = await open({ state: STATE() });
ri = await p.$('input[aria-label="Backup file to restore"]'); const ii = await p.$('input[aria-label="Import file"]');
await ri.uploadFile(GOOD); await wait(500); bn = await banner(p);
ok('a TV Time export in the Restore box: a clear red message pointing to the Import card', () => { assert.match(bn.text, /^Restore failed: That looks like a TV Time export\. Use “Import TV Time history” above instead\./); assert.equal(bn.err, true); });
await ii.uploadFile(backupPath); await wait(500); bn = await banner(p);
ok('a backup in the Import box: a clear red message pointing to Restore (instead of a cryptic "not iterable")', () => { assert.match(bn.text, /^Import failed: That is a WatchNext backup, not a TV Time export\. Use “Restore from backup” in the Backup card instead\./); assert.equal(bn.err, true); assert.doesNotMatch(bn.text, /iterable/); });
await ri.uploadFile(WRONG); await wait(500); bn = await banner(p);
ok('some other JSON: "Restore failed: That file does not look like a WatchNext backup."', () => assert.equal(bn.text, 'Restore failed: That file does not look like a WatchNext backup.'));
await ri.uploadFile(BADJSON); await wait(500); bn = await banner(p);
ok('a broken file: "Restore failed: …" in red', () => { assert.match(bn.text, /^Restore failed: /); assert.equal(bn.err, true); });
const before2 = JSON.stringify(await stored(p));
ok('none of the failed attempts changed any data', () => assert.equal(before2, JSON.stringify(STATE())));
await p.close();

console.log('4. RESTORE lifts the delete tombstone (so the cloud lets the show back in)');
p = await open({ state: { shows: {}, movies: [], settings: { tmdbKey: '' } }, tombs: ['tmdb:3', 'tmdb:999'] });
ri = await p.$('input[aria-label="Backup file to restore"]'); await ri.uploadFile(backupPath); await wait(600);
const tombs = await p.evaluate(() => JSON.parse(localStorage.getItem('watchnext-tombstones-v1') || '[]'));
ok('tmdb:3 is restored so its tombstone is gone; an unrelated tombstone (tmdb:999) is kept', () => assert.deepEqual(tombs, ['tmdb:999']));
await p.close();

console.log('5. BACKUP CARD layout');
p = await open({ state: RICH() });
const bc = await p.evaluate(() => { const c = [...document.querySelectorAll('.sd-setcard')].find((x) => x.querySelector('h2').textContent === 'Backup'); const btns = [...c.querySelectorAll('.sd-setbtn')].map((b) => [b.textContent.trim(), Math.round(b.getBoundingClientRect().height), Math.round(b.getBoundingClientRect().width)]); return { text: c.textContent, btns }; });
ok('copy now tells the truth ("can be restored here") and offers both buttons at 44px', () => { assert.match(bc.text, /A backup file can be restored here, on any device\./); assert.match(bc.text, /never deletes or overwrites what you already have/); assert.deepEqual(bc.btns.map((b) => b[0]), ['Download backup', 'Restore from backup']); assert.ok(bc.btns.every((b) => b[1] >= 44)); });
assert.ok(await noOverflow(p)); checks++; console.log('  PASS no horizontal overflow');
const fields = await p.evaluate(() => [...document.querySelectorAll('.sd-keyfield')].map((f) => Math.round(f.getBoundingClientRect().height)));
ok('REGRESSION: the TMDB key box is a full 44px tall on a phone (it had collapsed to a sliver)', () => assert.deepEqual(fields, [44]));
await p.evaluate(() => [...document.querySelectorAll('.sd-setcard')].find((x) => x.querySelector('h2').textContent === 'TMDB API key').scrollIntoView({ block: 'start' })); await wait(200);
await shot(p, '02_key_card', false);
await p.evaluate(() => [...document.querySelectorAll('.sd-setcard')].find((x) => x.querySelector('h2').textContent === 'Backup').scrollIntoView({ block: 'center' })); await wait(200);
await shot(p, '02_backup_card', false); await p.close();

console.log('6. CINEMA platform');
p = await open({ state: RICH(), tab: 'Movies' });
await p.evaluate(() => [...document.querySelectorAll('.sd-ltile')].find((t) => t.textContent.includes('Perfect Blue')).click()); await wait(500);
const chips = await p.evaluate(() => [...document.querySelectorAll('.sd-sheet button')].map((b) => b.textContent.trim()).filter((t) => ['Netflix', 'YouTube', 'Cinema', 'Other / unofficial'].includes(t)));
ok('the movie sheet offers Cinema, between YouTube and Other', () => assert.deepEqual(chips, ['Netflix', 'YouTube', 'Cinema', 'Other / unofficial']));
await click(p, '.sd-sheet button', 'Cinema'); await wait(300);
st = await stored(p);
ok('choosing Cinema saves platform "cinema" on that film (and only that film)', () => { assert.equal(st.movies.find((m) => m.name === 'Perfect Blue').platform, 'cinema'); assert.equal(st.movies.filter((m) => m.platform === 'cinema').length, 2); });
await p.keyboard.press('Escape'); await wait(200);
await p.evaluate(() => [...document.querySelectorAll('nav.tabbar button')].find((b) => b.textContent.includes('Stats')).click()); await wait(500);
await click(p, '[role=tab]', 'Breakdown'); await wait(400);
const wy = await p.evaluate(() => { const sec = [...document.querySelectorAll('section.sd-sec2')].find((s) => s.querySelector('.sd-lbl').textContent === 'Where you watch'); return sec ? [...sec.querySelectorAll('[data-bar]')].map((r) => [r.dataset.bar, r.querySelector('.sd-bar-val').textContent, getComputedStyle(r.querySelector('.sd-bar-fill')).backgroundColor]) : null; });
ok('Stats > Breakdown > Where you watch now has a Cinema bar in its own yellow', () => { const c = wy && wy.find((r) => r[0] === 'Cinema'); assert.ok(c, JSON.stringify(wy)); assert.match(c[1], /^\d+ hrs$/); assert.equal(c[2], 'rgb(245, 197, 24)'); });
await p.close();

await browser.close(); server.close();
console.log(`\n${checks} checks passed`);
console.log('PROBLEMS:', problems.length ? '\n' + [...new Set(problems)].join('\n') : 'none');
