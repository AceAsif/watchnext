process.env.TZ = 'Australia/Hobart';
import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

const DIST = '/home/claude/wl/dist'; const OUT = '/home/claude/shot/out_bn'; fs.mkdirSync(OUT, { recursive: true });
const fontsCss = fs.readFileSync('/home/claude/shot/fonts.css', 'utf8');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => { let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html'; const f = path.join(DIST, p); if (!f.startsWith(DIST) || !fs.existsSync(f)) { res.writeHead(404); return res.end('nf'); } res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res); });
await new Promise((r) => server.listen(4185, r));
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const FIXED_ISO = '2026-10-01T22:00:00.000Z'; const FIXED = Date.parse(FIXED_ISO);
const DAY = 86400000; const ago = (d) => new Date(FIXED - d * DAY).toISOString();

const W = (n) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`1x${i + 1}`, { at: '2026-09-01T10:00:00.000Z', min: 40, n: 1 }]));
const mk = (id, name, n) => ({ followed: true, poster: null, status: 'Ended', providers: [], lastSynced: '2026-09-01T00:00:00Z', runtimeMin: 40, genres: ['Drama'], name, tmdbId: id, totalEpisodes: 20, seasons: [{ n: 1, count: 20 }], watched: W(n) });
const LIB = { shows: { 'tmdb:1': mk(1, 'Alpha', 5), 'tmdb:2': mk(2, 'Bravo', 3), 'tmdb:3': mk(3, 'Charlie', 0) }, movies: [{ tmdbId: 9, name: 'Dune', status: 'watched', watchedAt: '2026-09-02T10:00:00.000Z', runtimeMin: 100, poster: null, year: 2021 }], settings: { tmdbKey: 'TESTKEY' } };
const EMPTY = { shows: {}, movies: [], settings: { tmdbKey: 'TESTKEY' } };
const COUNT = Object.values(LIB.shows).reduce((a, s) => a + 1 + Object.keys(s.watched).length, 0) + LIB.movies.length; // independent count: 3 shows + 8 episodes + 1 movie = 12
assert.equal(COUNT, 12);

const browser = await puppeteer.launch({ args: chromium.args, executablePath: await chromium.executablePath(), headless: 'shell' });
const problems = []; let checks = 0; const ok = async (n, f) => { await f(); checks++; console.log('  PASS', n); }; const wait = (ms = 350) => new Promise((r) => setTimeout(r, ms));
async function open(state, meta, { w = 390, h = 844, nowMs = FIXED } = {}) {
  const page = await browser.newPage(); await page.emulateTimezone('Australia/Hobart'); await page.setViewport({ width: w, height: h, deviceScaleFactor: 2 });
  page.on('pageerror', (e) => problems.push('pageerror: ' + e.message)); page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) problems.push('console.error: ' + m.text()); });
  await page.setBypassServiceWorker(true); await page.setRequestInterception(true);
  page.on('request', (r) => { const u = r.url(); if (u.startsWith('http://localhost:')) return r.continue(); if (u.includes('fonts.googleapis.com')) return r.respond({ status: 200, contentType: 'text/css', body: fontsCss }); if (u.includes('image.tmdb.org')) return r.respond({ status: 200, contentType: 'image/png', body: PNG }); if (u.includes('api.themoviedb.org')) return r.respond({ status: 200, contentType: 'application/json', body: '{"episodes":[],"results":[]}' }); return r.abort(); });
  await page.evaluateOnNewDocument((s, m, fixed) => {
    if (!sessionStorage.getItem('__s')) { localStorage.setItem('watchnext-state-v1', JSON.stringify(s)); if (m === null) localStorage.removeItem('watchnext-backup-v1'); else localStorage.setItem('watchnext-backup-v1', typeof m === 'string' ? m : JSON.stringify(m)); sessionStorage.setItem('__s', '1'); }
    const RealDate = Date; const start = RealDate.now(); const b = fixed;
    class FakeDate extends RealDate { constructor(...a) { if (a.length === 0) super(b + (RealDate.now() - start)); else super(...a); } static now() { return b + (RealDate.now() - start); } }
    window.Date = FakeDate; window.__dl = [];
    URL.revokeObjectURL = () => {};
    const realClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () { if (this.download && this.href.startsWith('blob:')) { const name = this.download; fetch(this.href).then((r) => r.arrayBuffer()).then((buf) => window.__dl.push({ name, size: buf.byteLength })); return; } return realClick.call(this); };
  }, state, meta, nowMs);
  await page.goto('http://localhost:4185/', { waitUntil: 'networkidle0' }); await wait(400);
  await page.evaluate(() => [...document.querySelectorAll('nav.tabbar button')].find((x) => x.textContent.includes('Settings')).click()); await wait(450);
  return page;
}
const nudge = (p) => p.evaluate(() => { const n = document.querySelector('[aria-label="Backup reminder"]'); return n ? { title: n.querySelector('h2').textContent, text: n.innerText.replace(/\s+/g, ' '), btns: [...n.querySelectorAll('button')].map((b) => b.textContent.trim()) } : null; });
const lastLine = (p) => p.evaluate(() => (document.querySelector('[data-testid=last-backup]') || {}).textContent || null);
const meta = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('watchnext-backup-v1') || 'null'));
const click = (p, label, scope = 'body') => p.evaluate((l, s) => { const b = [...document.querySelector(s).querySelectorAll('button')].find((x) => x.textContent.trim() === l); if (!b) throw new Error('no button ' + l); b.click(); }, label, scope);
const reload = async (p) => { await p.reload({ waitUntil: 'networkidle0' }); await wait(400); await p.evaluate(() => [...document.querySelectorAll('nav.tabbar button')].find((x) => x.textContent.includes('Settings')).click()); await wait(450); };

// ============================================================ when it shows
console.log('1. when the reminder shows');
let p = await open(LIB, { lastAt: ago(34), lastCount: 5, since: ago(200), snoozedUntil: '' });
await ok('34 days old + the library has changed: banner says "It’s been 34 days since your last backup", with the reason and two buttons', async () => {
  const n = await nudge(p); assert.equal(n.title, 'It’s been 34 days since your last backup'); assert.match(n.text, /in case you ever delete something or a sync goes wrong/); assert.deepEqual(n.btns, ['Download backup', 'Remind me later']);
});
await ok('the Backup card also shows the dated "Last backup" line', async () => { const want = new Date(FIXED - 34 * DAY); const d = `${want.getDate()} ${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][want.getMonth()]} ${want.getFullYear()}`; assert.equal(await lastLine(p), `Last backup: ${d} (34 days ago)`); });
await p.screenshot({ path: `${OUT}/nudge_phone.png` });
await p.close();
for (const [days, show] of [[29, false], [30, true], [31, true]]) {
  p = await open(LIB, { lastAt: ago(days), lastCount: 5, since: ago(300), snoozedUntil: '' });
  await ok(`${days} days since the last backup (library changed): ${show ? 'shown' : 'hidden'}`, async () => { const n = await nudge(p); assert.equal(!!n, show); if (show) assert.equal(n.title, `It’s been ${days} days since your last backup`); });
  await p.close();
}
p = await open(LIB, { lastAt: ago(90), lastCount: COUNT, since: ago(300), snoozedUntil: '' });
await ok('90 days old but the library has NOT changed since: no reminder (nothing new to lose)', async () => assert.equal(await nudge(p), null)); await p.close();
p = await open(LIB, { lastAt: '', lastCount: null, since: ago(8), snoozedUntil: '' });
await ok('never backed up + the library is 8 days old on this device: "You haven’t made a backup yet"; the card says none downloaded', async () => { assert.equal((await nudge(p)).title, 'You haven’t made a backup yet'); assert.equal(await lastLine(p), 'No backup downloaded from this device yet.'); }); await p.close();
p = await open(LIB, { lastAt: '', lastCount: null, since: ago(3), snoozedUntil: '' });
await ok('never backed up but only 3 days old: not nagged yet', async () => assert.equal(await nudge(p), null)); await p.close();
p = await open(LIB, null);
await ok('a brand-new setup (no record at all): no reminder, and the app remembers today as the starting point', async () => { assert.equal(await nudge(p), null); const m = await meta(p); assert.ok(m && Math.abs(Date.parse(m.since) - FIXED) < 15000, JSON.stringify(m)); assert.equal(m.lastAt, ''); }); await p.close();
p = await open(EMPTY, { lastAt: ago(99), lastCount: 5, since: ago(300), snoozedUntil: '' });
await ok('an EMPTY library is never nagged', async () => assert.equal(await nudge(p), null)); await p.close();
p = await open(LIB, '{this is not json');
await ok('a corrupt record is ignored: the page works, no banner, no errors', async () => { assert.equal(await nudge(p), null); assert.match(await p.evaluate(() => document.body.innerText), /Backup/); }); await p.close();
p = await open(LIB, { lastAt: ago(-5), lastCount: 5, since: ago(300), snoozedUntil: '' });
await ok('a backup stamped in the future (clock skew) never triggers it, and reads "today", not "-5 days"', async () => { assert.equal(await nudge(p), null); assert.equal(await lastLine(p), 'Last backup: today'); }); await p.close();

// ============================================================ the buttons
console.log('2. the buttons');
p = await open(LIB, { lastAt: ago(40), lastCount: 5, since: ago(300), snoozedUntil: '' });
await click(p, 'Download backup', '[aria-label="Backup reminder"]'); await wait(900);
await ok('"Download backup" downloads the file, hides the banner, records time + library size, and the card says "today"', async () => {
  const dl = await p.evaluate(() => window.__dl); assert.equal(dl.length, 1); assert.equal(dl[0].name, 'watchnext-backup-2026-10-02.json'); assert.ok(dl[0].size > 200);
  assert.equal(await nudge(p), null); const m = await meta(p); assert.ok(Math.abs(Date.parse(m.lastAt) - FIXED) < 15000); assert.equal(m.lastCount, COUNT); assert.equal(m.snoozedUntil, '');
  assert.equal(await lastLine(p), 'Last backup: today'); assert.match(await p.evaluate(() => document.body.innerText), /Backup downloaded/);
});
await reload(p);
await ok('after a reload it stays hidden and still says "today"', async () => { assert.equal(await nudge(p), null); assert.equal(await lastLine(p), 'Last backup: today'); });
await p.close();

p = await open(LIB, { lastAt: ago(40), lastCount: 5, since: ago(300), snoozedUntil: '' });
await click(p, 'Remind me later', '[aria-label="Backup reminder"]'); await wait(400);
await ok('"Remind me later" hides it and snoozes for 7 days (no download happened, last-backup unchanged)', async () => {
  assert.equal(await nudge(p), null); const m = await meta(p); assert.ok(Math.abs(Date.parse(m.snoozedUntil) - (FIXED + 7 * DAY)) < 15000); assert.equal(m.lastAt, ago(40)); assert.equal((await p.evaluate(() => window.__dl)).length, 0);
});
await reload(p);
await ok('the snooze survives a reload', async () => assert.equal(await nudge(p), null)); await p.close();
p = await open(LIB, { lastAt: ago(40), lastCount: 5, since: ago(300), snoozedUntil: ago(1) });
await ok('once the snooze has run out, the reminder comes back', async () => assert.equal((await nudge(p)).title, 'It’s been 40 days since your last backup')); await p.close();

p = await open(LIB, { lastAt: ago(40), lastCount: 5, since: ago(300), snoozedUntil: '' });
await p.evaluate(() => { [...document.querySelectorAll('button.sd-setbtn')].find((b) => b.textContent.includes('Shows')).click(); }); await wait(600);
await ok('a CSV export is NOT a backup: the reminder stays', async () => { assert.ok(await nudge(p)); assert.equal((await meta(p)).lastAt, ago(40)); });
await p.evaluate(() => [...document.querySelectorAll('button.sd-setbtn')].find((b) => b.textContent.includes('Download backup')).click()); await wait(800);
await ok('the Backup card\'s own "Download backup" button counts too (not just the banner)', async () => { assert.equal(await nudge(p), null); assert.equal(await lastLine(p), 'Last backup: today'); });
await p.close();

// ============================================================ layout
console.log('3. layout');
p = await open(LIB, { lastAt: ago(34), lastCount: 5, since: ago(200), snoozedUntil: '' }, { w: 320, h: 700 });
await ok('320px wide: no sideways scroll, both buttons usable', async () => { assert.equal(await p.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false); const r = await p.evaluate(() => [...document.querySelectorAll('[aria-label="Backup reminder"] button')].map((b) => { const x = b.getBoundingClientRect(); return [Math.round(x.width), Math.round(x.height)]; })); assert.ok(r.every(([w, h]) => w >= 120 && h >= 40), JSON.stringify(r)); }); await p.close();
p = await open(LIB, { lastAt: ago(34), lastCount: 5, since: ago(200), snoozedUntil: '' }, { w: 1280, h: 900 });
await ok('desktop: banner sits at the top of Settings, above the cards', async () => { const y = await p.evaluate(() => { const n = document.querySelector('[aria-label="Backup reminder"]').getBoundingClientRect().top; const c = document.querySelector('.sd-set').getBoundingClientRect().top; return [n, c]; }); assert.ok(y[0] < y[1]); });
await p.screenshot({ path: `${OUT}/nudge_desktop.png` }); await p.close();
console.log(`\n${checks} checks passed`); console.log('PROBLEMS:', problems.length ? '\n' + problems.join('\n') : 'none'); await browser.close(); server.close();
