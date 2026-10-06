import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import zlib from 'node:zlib';
import * as Y from '/home/claude/wl/src/components/yearImageLogic.js';

const DIST = '/home/claude/wl/dist';
const OUT = '/home/claude/shot/out_yir';
fs.mkdirSync(OUT, { recursive: true });
const fontsCss = fs.readFileSync('/home/claude/shot/fonts.css', 'utf8');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
  const f = path.join(DIST, p);
  if (!f.startsWith(DIST) || !fs.existsSync(f)) { res.writeHead(404); return res.end('nf'); }
  res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(4177, r));

// --- tiny solid-colour PNG encoder (so poster pixels are exactly predictable)
const crcT = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
const crc = (b) => { let c = -1; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
const solid = (w, h, [r, g, b]) => {
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: w }, () => [r, g, b]).flat())]);
  const raw = Buffer.concat(Array.from({ length: h }, () => row));
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
};
const POSTER_RGB = { '/p1.jpg': [220, 40, 40], '/p2.jpg': [40, 200, 60], '/p3.jpg': [60, 80, 230] };
const FIXED_ISO = '2026-10-01T22:00:00.000Z';
const mk = (n, name, poster, year, eps, extra = {}) => ({
  followed: true, name, tmdbId: n, poster, status: 'Ended', providers: [], runtimeMin: 24, genres: ['Animation'], lastSynced: '2026-09-01T00:00:00Z',
  totalEpisodes: 400, seasons: [{ n: 1, count: 400 }],
  watched: Object.fromEntries(Array.from({ length: eps }, (_, i) => [`1x${i + 1}`, { at: `${year}-${String(1 + (i % 11)).padStart(2, '0')}-${String(1 + (i % 27)).padStart(2, '0')}T0${i % 8}:${String(10 + (i % 40))}:00.000Z`, min: 24, n: 1 }])), ...extra,
});
const stateWith = (shows, movies = []) => ({ shows: Object.fromEntries(shows.map((s) => [`tmdb:${s.tmdbId}`, s])), movies, settings: { tmdbKey: 'TESTKEY' } });
const mv = (n, name, date) => ({ tmdbId: n, name, status: 'watched', watchedAt: date, runtimeMin: 100, poster: null, year: 2026 });

const browser = await puppeteer.launch({ args: chromium.args, executablePath: await chromium.executablePath(), headless: 'shell' });
const problems = []; let checks = 0;
const ok = (name, fn) => { fn(); checks++; console.log('  PASS', name); };
const wait = (ms = 400) => new Promise((r) => setTimeout(r, ms));

async function open(state, { posters = 'ok', w = 390, h = 844 } = {}) {
  const page = await browser.newPage();
  await page.emulateTimezone('Australia/Hobart');
  await page.setViewport({ width: w, height: h, deviceScaleFactor: 2 });
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR|Year in review export failed/.test(m.text())) problems.push(`console.error: ${m.text()}`); });
  await page.setBypassServiceWorker(true);
  await page.setRequestInterception(true);
  page.on('request', (r) => {
    const u = r.url();
    if (u.startsWith('http://localhost:4177')) return r.continue();
    if (u.includes('fonts.googleapis.com')) return r.respond({ status: 200, contentType: 'text/css', body: fontsCss });
    if (u.includes('image.tmdb.org')) {
      if (posters === 'fail') return r.abort();
      const key = '/' + u.split('/').pop().split('?')[0];
      return r.respond({ status: 200, contentType: 'image/png', headers: { 'access-control-allow-origin': '*' }, body: solid(40, 60, POSTER_RGB[key] || [90, 90, 90]) });
    }
    if (u.includes('api.themoviedb.org')) return r.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ episodes: [], results: [] }) });
    return r.abort();
  });
  await page.evaluateOnNewDocument((s, fixed) => {
    if (!sessionStorage.getItem('__seeded')) { localStorage.setItem('watchnext-state-v1', JSON.stringify(s)); sessionStorage.setItem('__seeded', '1'); }
    const RealDate = Date; const start = RealDate.now(); const base = RealDate.parse(fixed);
    class FakeDate extends RealDate { constructor(...a) { if (a.length === 0) super(base + (RealDate.now() - start)); else super(...a); } static now() { return base + (RealDate.now() - start); } }
    window.Date = FakeDate;
    // capture the downloaded PNG instead of saving it
    const realClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {
      if (this.download && this.href.startsWith('blob:')) {
        window.__dl = { name: this.download, p: fetch(this.href).then((r) => r.blob()).then((b) => new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(b); })) };
        window.__dl.p.then((d) => { window.__png = d; });
        return;
      }
      return realClick.call(this);
    };
    window.alert = (m) => { window.__alert = m; };
  }, state, FIXED_ISO);
  await page.goto('http://localhost:4177/', { waitUntil: 'networkidle0' });
  await wait(500);
  await page.evaluate(() => [...document.querySelectorAll('nav.tabbar button')].find((x) => x.textContent.includes('Stats')).click());
  await wait(600);
  return page;
}
async function exportPng(page, name) {
  await page.evaluate(() => { delete window.__png; delete window.__alert; [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Save image').click(); });
  for (let i = 0; i < 60 && !(await page.evaluate(() => window.__png || window.__alert)); i++) await wait(150);
  const err = await page.evaluate(() => window.__alert);
  assert.ok(!err, 'export alert: ' + err);
  const url = await page.evaluate(() => window.__png);
  fs.writeFileSync(`${OUT}/${name}.png`, Buffer.from(url.split(',')[1], 'base64'));
  // analyse inside the browser: dimensions + pixel sampler
  await page.evaluate((u) => new Promise((res) => { const im = new Image(); im.onload = () => { const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const x = c.getContext('2d'); x.drawImage(im, 0, 0); window.__cx = x; window.__dim = [im.width, im.height]; res(); }; im.src = u; }), url);
  const dim = await page.evaluate(() => window.__dim);
  const px = (x, y) => page.evaluate((a, b) => Array.from(window.__cx.getImageData(a, b, 1, 1).data), x, y);
  const distinct = await page.evaluate(() => { const d = window.__cx.getImageData(0, 0, 1080, 1350).data; const s = new Set(); for (let i = 0; i < d.length; i += 4 * 97) s.add(d[i] + ',' + d[i + 1] + ',' + d[i + 2]); return s.size; });
  return { dim, px, distinct };
}
const near = (a, b, tol = 12) => a.slice(0, 3).every((v, i) => Math.abs(v - b[i]) <= tol);
const card = [23, 29, 40];

// ===================================================== A. full data, posters load
console.log('A. full year with 3 posters, previous year present');
const shows = [mk(1, 'Naruto', '/p1.jpg', 2026, 90), mk(2, 'Bleach', '/p2.jpg', 2026, 70), mk(3, 'One Piece', '/p3.jpg', 2026, 50), mk(4, 'Old', '/p1.jpg', 2025, 60)];
let p = await open(stateWith(shows, [mv(10, 'Movie A', '2026-05-05T10:00:00.000Z'), mv(11, 'Movie B', '2026-06-05T10:00:00.000Z')]));
const onscreen = await p.evaluate(() => { const el = document.querySelector('.sd-yir'); return el ? { bg: getComputedStyle(el).backgroundImage, txt: el.innerText } : null; });
ok('on-screen card exists and has the warm->teal radial gradient', () => { assert.ok(onscreen); assert.match(onscreen.bg, /radial-gradient/); assert.match(onscreen.bg, /242, 163, 60/); assert.match(onscreen.bg, /86, 200, 181/); });
await p.screenshot({ path: `${OUT}/A_screen.png`, fullPage: true });
const geo = await p.evaluate(() => {
  const card = document.querySelector('.sd-yir'); const cr = card.getBoundingClientRect();
  const arts = [...card.querySelectorAll('.sd-yir-art')].map((a) => { const r = a.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height, right: r.right }; });
  const names = [...card.querySelectorAll('.sd-yir-name')].map((n) => ({ t: n.textContent, top: n.getBoundingClientRect().top }));
  return { card: { l: cr.left, r: cr.right }, arts, names, overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth };
});
ok('on-screen: three posters side by side, same size, 2:3, inside the card', () => {
  assert.equal(geo.arts.length, 3);
  assert.ok(geo.arts.every((a) => Math.abs(a.w - geo.arts[0].w) < 1 && Math.abs(a.y - geo.arts[0].y) < 1));
  assert.ok(geo.arts.every((a) => Math.abs(a.h / a.w - 1.5) < 0.02), JSON.stringify(geo.arts));
  assert.ok(geo.arts[0].x >= geo.card.l && geo.arts[2].right <= geo.card.r);
  assert.ok(geo.arts[0].w >= 90, 'posters are big on a 390px phone: ' + geo.arts[0].w);
  assert.ok(geo.names.every((n) => n.top > geo.arts[0].y + geo.arts[0].h - 2), 'names sit under the posters');
  assert.equal(geo.overflowX, false);
});
{ const el = await p.$('.sd-yir'); await el.scrollIntoView(); await wait(200); await el.screenshot({ path: `${OUT}/A_screen_phone.png` }); }
const small = await p.evaluate(() => { const c = document.querySelector('.sd-yir'); c.scrollIntoView(); return true; });
await p.setViewport({ width: 320, height: 800, deviceScaleFactor: 2 }); await wait(300);
const g320 = await p.evaluate(() => ({ ox: document.documentElement.scrollWidth > document.documentElement.clientWidth, w: document.querySelector('.sd-yir-art').getBoundingClientRect().width }));
ok('on-screen at 320px: no sideways scroll, posters still >= 70px', () => { assert.equal(g320.ox, false); assert.ok(g320.w >= 70, String(g320.w)); });
await p.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 }); await wait(400);
{ const el = await p.$('.sd-yir'); await el.scrollIntoView(); await wait(200); await el.screenshot({ path: `${OUT}/A_screen_desktop.png` }); }
const gd = await p.evaluate(() => { const a = [...document.querySelectorAll('.sd-yir-art')].map((x) => x.getBoundingClientRect()); return { w: a[0].width, h: a[0].height, ox: document.documentElement.scrollWidth > document.documentElement.clientWidth }; });
ok('on-screen desktop: no sideways scroll; poster height is reasonable (< 420px)', () => { assert.equal(gd.ox, false); assert.ok(gd.h < 420, JSON.stringify(gd)); });
await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 }); await wait(300);
let a = await exportPng(p, 'A_full');
const dataA = Y.planYearImage({ year: 2026, prevYear: 2025, epDelta: 1, topShows: [{}, {}, {}], busiestMonth: { name: 'x' }, topGenre: 'g' });
ok('PNG is exactly 1080x1350', () => assert.deepEqual(a.dim, [1080, 1350]));
ok('image is not blank/uniform', () => assert.ok(a.distinct > 12, 'distinct colours: ' + a.distinct));
const tl = await a.px(6, 6), br = await a.px(1073, 1343), mid = await a.px(540, 700);
ok('top-left is WARM (amber glow): red > blue and brighter than plain card', () => { assert.ok(tl[0] > tl[2], JSON.stringify(tl)); assert.ok(tl[0] > card[0] + 8, JSON.stringify(tl)); });
ok('bottom-right is TEAL: green+blue lifted above plain card', () => { assert.ok(br[1] > card[1] + 8 && br[2] >= card[2], JSON.stringify(br)); });
ok('gradient is faint: corners stay close to the card colour (no loud wash)', () => { assert.ok(Math.max(...tl.slice(0, 3).map((v, i) => Math.abs(v - card[i]))) < 45, JSON.stringify(tl)); });
ok('the on-screen card text lists top shows in order', () => { const t = onscreen.txt; assert.ok(t.indexOf('Naruto') < t.indexOf('Bleach') && t.indexOf('Bleach') < t.indexOf('One Piece')); });
const pl = Y.planYearImage({ year: 2026, prevYear: 2025, epDelta: 1, topShows: [{}, {}, {}], busiestMonth: { name: 'x' }, topGenre: 'g' });
for (const [i, key] of ['/p1.jpg', '/p2.jpg', '/p3.jpg'].entries()) {
  const bx = Y.posterBox(pl, i);
  const c = await a.px(Math.round(bx.x + bx.w / 2), Math.round(bx.y + bx.h / 2));
  ok(`poster ${i + 1} is drawn in its slot with the right pixels ${JSON.stringify(POSTER_RGB[key])}`, () => assert.ok(near(c, POSTER_RGB[key], 25), JSON.stringify(c)));
}
const foot = await p.evaluate(() => { const d = window.__cx.getImageData(64, 1226, 400, 60).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] > 150) n++; return n; });
ok('footer brand ("WatchNext") is drawn bottom-left', () => assert.ok(foot > 200, 'bright px: ' + foot));
const urlpx = await p.evaluate(() => { const d = window.__cx.getImageData(600, 1255, 420, 35).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] > 100) n++; return n; });
ok('footer URL is drawn bottom-right', () => assert.ok(urlpx > 100, 'px: ' + urlpx));
await p.close();

// ===================================================== B. poster requests blocked
console.log('B. TMDB blocks the poster requests (placeholder path)');
p = await open(stateWith(shows, [mv(10, 'Movie A', '2026-05-05T10:00:00.000Z')]), { posters: 'fail' });
let b = await exportPng(p, 'B_poster_fail');
ok('export still succeeds at 1080x1350', () => assert.deepEqual(b.dim, [1080, 1350]));
for (let i = 0; i < 3; i++) {
  const bx = Y.posterBox(pl, i);
  const c = await b.px(Math.round(bx.x + 12), Math.round(bx.y + 12));
  ok(`slot ${i + 1} shows the neutral placeholder, not a poster colour`, () => assert.ok(near(c, [20, 25, 34], 14), JSON.stringify(c)));
}
await p.close();

// ===================================================== C. edge cases (must export, never throw)
const cases = {
  C_no_prev_year: [stateWith(shows.slice(0, 3)), 'no previous year -> no delta line'],
  C_two_shows: [stateWith(shows.slice(0, 2).concat(shows[3])), 'only 2 shows this year'],
  C_one_show_no_movies: [stateWith([shows[0]]), 'one show, no movies'],
  C_down_year: [stateWith([mk(1, 'Naruto', '/p1.jpg', 2026, 20), mk(2, 'Old', '/p1.jpg', 2025, 100)]), 'fewer episodes than last year -> ▼ in dim colour'],
  C_long_japanese: [stateWith([mk(1, '鋼の錬金術師 FULLMETAL ALCHEMIST: BROTHERHOOD — The Complete Extended Director’s Cut Edition', '/p1.jpg', 2026, 90), mk(2, '😀 Emoji Show', '/p2.jpg', 2026, 60), mk(3, 'x', null, 2026, 40), mk(4, 'Old', '/p1.jpg', 2025, 100)]), 'very long + non-Latin + emoji + missing poster'],
};
for (const [k, [st, what]] of Object.entries(cases)) {
  console.log(`${k}: ${what}`);
  p = await open(st);
  const r = await exportPng(p, k);
  ok('exports 1080x1350 without error and not blank', () => { assert.deepEqual(r.dim, [1080, 1350]); assert.ok(r.distinct > 8); });
  if (k === 'C_down_year') {
    const pl2 = Y.planYearImage({ year: 2026, prevYear: 2025, epDelta: -80, topShows: [{}], busiestMonth: { name: 'x' }, topGenre: 'g' });
    const hues = await p.evaluate((y) => { const d = window.__cx.getImageData(60, y - 28, 420, 34).data; let teal = 0, red = 0, dim = 0; for (let i = 0; i < d.length; i += 4) { const [R, G, B] = [d[i], d[i + 1], d[i + 2]]; if (G > 170 && B > 150 && R < 120) teal++; else if (R > 180 && G < 110 && B < 110) red++; else if (R > 110 && G > 120 && B > 130 && Math.abs(R - G) < 30) dim++; } return { teal, red, dim }; }, pl2.deltaY);
    ok('down arrow line is dim: no teal, no red', () => { assert.equal(hues.teal, 0, JSON.stringify(hues)); assert.equal(hues.red, 0, JSON.stringify(hues)); assert.ok(hues.dim > 150, JSON.stringify(hues)); });
  }
  await p.close();
}
console.log(`\n${checks} checks passed`);
console.log('PROBLEMS:', problems.length ? '\n' + problems.join('\n') : 'none');
await browser.close(); server.close();
