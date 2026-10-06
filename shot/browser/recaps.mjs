process.env.TZ = 'Australia/Hobart';
import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import zlib from 'node:zlib';
import * as Y from '/home/claude/wl/src/components/yearImageLogic.js';
import * as FC from '/home/claude/wl/src/components/finishCardLogic.js';

const DIST = '/home/claude/wl/dist'; const OUT = '/home/claude/shot/out_rc'; fs.mkdirSync(OUT, { recursive: true });
const fontsCss = fs.readFileSync('/home/claude/shot/fonts.css', 'utf8');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => { let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html'; const f = path.join(DIST, p); if (!f.startsWith(DIST) || !fs.existsSync(f)) { res.writeHead(404); return res.end('nf'); } res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res); });
await new Promise((r) => server.listen(4183, r));
// solid-colour PNG poster per file name, so pixels are predictable
const crcT = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
const crc = (b) => { let c = -1; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
const solid = (w, h, [r, g, b]) => { const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: w }, () => [r, g, b]).flat())]); const raw = Buffer.concat(Array.from({ length: h }, () => row)); const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2; return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]); };
const COLORS = { 'suits.jpg': [220, 40, 40], 'office.jpg': [40, 200, 60], 'done.jpg': [60, 80, 230] };

const iso = (d, h = '10:00:00') => `${d}T${h}.000Z`;
const ep = (at, n = 1, min = 40) => ({ at, min, n });
const mk = (id, name, o = {}) => ({ followed: true, poster: null, status: 'Ended', providers: [], lastSynced: '2026-09-01T00:00:00Z', runtimeMin: 40, genres: ['Drama'], name, tmdbId: id, totalEpisodes: 50, seasons: [{ n: 1, count: o.totalEpisodes || 50 }], watched: {}, ...o });
const W = (list) => Object.fromEntries(list.map((w, i) => [`1x${i + 1}`, w]));
const SHOWS = {
  'tmdb:1': mk(1, 'Suits', { poster: '/suits.jpg', genres: ['Drama', 'Legal'], watched: W([ep(iso('2026-08-10')), ep(iso('2026-08-11')), ep(iso('2026-08-12')), ep(iso('2026-08-13')), ep(iso('2026-09-02', '12:00:00')), ep(iso('2026-09-02', '14:00:00')), ep(iso('2026-09-03', '14:00:00')), ep(iso('2026-09-05', '02:00:00'), 3), ep(iso('2026-09-12')), ep(iso('2026-09-30', '14:30:00'))]) }),
  'tmdb:2': mk(2, 'The Office', { poster: '/office.jpg', genres: ['Comedy'], watched: W([ep(iso('2026-08-20'), 1, 22), ep(iso('2026-08-21'), 1, 22), ep(iso('2026-08-22'), 1, 22), ep(iso('2026-09-10'), 1, 22), ep(iso('2026-09-11'), 1, 22)]) }),
  'tmdb:3': mk(3, 'Done', { poster: '/done.jpg', totalEpisodes: 3, rating: 4, watched: W([ep(iso('2026-09-14')), ep(iso('2026-09-15')), ep(iso('2026-09-16'))]) }),
  'tmdb:4': mk(4, 'Finale', { totalEpisodes: 3, watched: W([ep(iso('2026-09-20')), ep(iso('2026-09-21'))]) }),
  'tmdb:5': mk(5, 'Still Running', { totalEpisodes: 3, status: 'Returning Series', watched: W([ep(iso('2026-09-22')), ep(iso('2026-09-23'))]) }),
  'tmdb:6': mk(6, 'Running Caught Up', { totalEpisodes: 3, status: 'Returning Series', watched: W([ep(iso('2026-09-24')), ep(iso('2026-09-25')), ep(iso('2026-09-26'))]) }),
  'tmdb:7': mk(7, 'DropFin', { totalEpisodes: 2, dropped: true, droppedAt: '2026-09-01T00:00:00.000Z', watched: W([ep(iso('2026-09-27'))]) }),
  'tmdb:8': mk(8, 'Almost', { totalEpisodes: 4, watched: W([ep(iso('2026-09-28')), ep(iso('2026-09-28', '11:00:00'))]) }),
};
const MOVIES = [
  { tmdbId: 90, name: 'Dune', status: 'watched', watchedAt: iso('2026-09-12', '08:00:00'), runtimeMin: 150, poster: null, year: 2021 },
  { tmdbId: 91, name: 'Heat', status: 'watched', watchedAt: iso('2026-09-13', '08:00:00'), runtimeMin: 170, poster: null, year: 1995 },
  { tmdbId: 92, name: 'Up', status: 'watched', watchedAt: iso('2026-10-01', '05:00:00'), runtimeMin: 96, poster: null, year: 2009 },
  { tmdbId: 93, name: 'Planned', status: 'planned' },
];
const STATE = { shows: SHOWS, movies: MOVIES, settings: { tmdbKey: 'TESTKEY' } };
const FIXED_ISO = '2026-10-01T22:00:00.000Z'; // 08:00 on Fri 2 Oct in Hobart

// ---- independent expectation (own code, local-date arithmetic with the same TZ)
const pad = (n) => String(n).padStart(2, '0');
const lym = (isoStr) => { const d = new Date(isoStr); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; };
const lday = (isoStr) => { const d = new Date(isoStr); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
function expectMonth(ym) {
  let eps = 0, min = 0, mov = 0; const days = new Set(); const per = {};
  for (const s of Object.values(SHOWS)) for (const w of Object.values(s.watched)) if (lym(w.at) === ym) { eps += w.n; min += w.min * w.n; days.add(lday(w.at)); per[s.name] = (per[s.name] || 0) + w.n; }
  for (const m of MOVIES) if (m.status === 'watched' && lym(m.watchedAt) === ym) { mov++; min += m.runtimeMin; days.add(lday(m.watchedAt)); }
  return { eps, hours: Math.round(min / 60), mov, days: days.size, per };
}

const browser = await puppeteer.launch({ args: chromium.args, executablePath: await chromium.executablePath(), headless: 'shell' });
const problems = []; let checks = 0; const ok = async (n, f) => { await f(); checks++; console.log('  PASS', n); }; const wait = (ms = 350) => new Promise((r) => setTimeout(r, ms));
async function open({ w = 390, h = 844 } = {}) {
  const page = await browser.newPage(); await page.emulateTimezone('Australia/Hobart'); await page.setViewport({ width: w, height: h, deviceScaleFactor: 2 });
  page.on('pageerror', (e) => problems.push('pageerror: ' + e.message)); page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) problems.push('console.error: ' + m.text()); });
  await page.setBypassServiceWorker(true); await page.setRequestInterception(true);
  page.on('request', (r) => { const u = r.url(); if (u.startsWith('http://localhost:')) return r.continue(); if (u.includes('fonts.googleapis.com')) return r.respond({ status: 200, contentType: 'text/css', body: fontsCss }); if (u.includes('image.tmdb.org')) { const key = u.split('/').pop().split('?')[0]; return r.respond({ status: 200, contentType: 'image/png', headers: { 'access-control-allow-origin': '*' }, body: solid(40, 60, COLORS[key] || [90, 90, 90]) }); } if (u.includes('api.themoviedb.org')) return r.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ episodes: [], results: [] }) }); return r.abort(); });
  await page.evaluateOnNewDocument((s, fixed) => {
    if (!sessionStorage.getItem('__s')) { localStorage.setItem('watchnext-state-v1', JSON.stringify(s)); sessionStorage.setItem('__s', '1'); }
    const RealDate = Date; const start = RealDate.now(); const b = RealDate.parse(fixed);
    class FakeDate extends RealDate { constructor(...a) { if (a.length === 0) super(b + (RealDate.now() - start)); else super(...a); } static now() { return b + (RealDate.now() - start); } }
    window.Date = FakeDate; window.__dl = [];
    URL.revokeObjectURL = () => {};
    const realClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () { if (this.download && this.href.startsWith('blob:')) { const name = this.download; fetch(this.href).then((r) => r.arrayBuffer()).then((buf) => window.__dl.push({ name, bytes: Array.from(new Uint8Array(buf)) })); return; } return realClick.call(this); };
    navigator.canShare = (d) => !!(d && d.files); navigator.share = async (d) => { window.__shared = { title: d.title, text: d.text, url: d.url, files: (d.files || []).map((f) => ({ name: f.name, type: f.type, size: f.size })) }; };
  }, STATE, FIXED_ISO);
  await page.goto('http://localhost:4183/', { waitUntil: 'networkidle0' }); await wait(500);
  return page;
}
const tab = async (p, name) => { await p.evaluate((t) => [...document.querySelectorAll('nav.tabbar button')].find((x) => x.textContent.includes(t)).click(), name); await wait(450); };
const text = (p) => p.evaluate(() => document.body.innerText);
const clickText = (p, label, sel = 'button') => p.evaluate((t, s) => { const el = [...document.querySelectorAll(s)].find((e) => (e.getAttribute('aria-label') || e.textContent).trim().includes(t)); if (!el) throw new Error('no element: ' + t); el.click(); }, label, sel);
const has = (p, sel) => p.evaluate((s) => !!document.querySelector(s), sel);
const openShow = async (p, name) => { await tab(p, 'Shows'); await p.evaluate(() => { const a = document.querySelector('.sd-lstatus [role=tab]'); if (a) a.click(); }); await wait(250); await clickText(p, name, 'button.sd-ltile'); await wait(700); };
const back = async (p) => { await p.evaluate(() => [...document.querySelectorAll('button')].find((x) => /back/i.test(x.getAttribute('aria-label') || x.textContent)).click()); await wait(400); };
const toast = (p) => p.evaluate(() => { const t = document.querySelector('.sd-toast'); return t ? t.innerText.replace(/\s+/g, ' ').trim() : null; });
async function decode(p, dl) { const url = 'data:image/png;base64,' + Buffer.from(dl.bytes).toString('base64'); await p.evaluate((u) => new Promise((res) => { const im = new Image(); im.onload = () => { const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const x = c.getContext('2d'); x.drawImage(im, 0, 0); window.__cx = x; window.__dim = [im.width, im.height]; res(); }; im.src = u; }), url); return { dim: await p.evaluate(() => window.__dim), px: (x, y) => p.evaluate((a, b) => Array.from(window.__cx.getImageData(a, b, 1, 1).data), x, y) }; }
const near = (a, b, tol = 14) => a.slice(0, 3).every((v, i) => Math.abs(v - b[i]) <= tol);
const statVals = (p) => p.evaluate((cls) => Object.fromEntries([...document.querySelector(cls).querySelectorAll('[data-stat]')].map((d) => [d.dataset.stat.replace('yir-', ''), d.querySelector('.sd-yir-v').textContent.replace(/,/g, '')])), '.a-mir');

// =========================================================== 1. Month in review (on screen)
console.log('1. Month in review');
let p = await open(); await tab(p, 'Stats');
await ok('Month in review sits directly under Year in review, with a month picker', async () => {
  const order = await p.evaluate(() => [...document.querySelectorAll('.sd-sec2')].map((s) => s.querySelector('.sd-lbl').textContent.trim().toLowerCase()));
  const i = order.indexOf('year in review'); assert.ok(i >= 0 && order[i + 1] === 'month in review', order.join(' | '));
  const opts = await p.evaluate(() => [...document.querySelectorAll('#mir-month option')].map((o) => o.textContent)); assert.deepEqual(opts, ['October 2026', 'September 2026', 'August 2026']);
});
await ok('defaults to the newest month (October, labelled "so far"); the 00:30-on-1-Oct watch counts as OCTOBER', async () => {
  const t = await p.evaluate(() => document.querySelector('.a-mir .sd-yir').innerText.replace(/\s+/g, ' '));
  assert.match(t, /^October 2026 · SO FAR/i);
  const e = expectMonth('2026-10'); const v = await statVals(p);
  assert.deepEqual([+v.episodes, +v.hours, +v.movies, +v.days], [e.eps, e.hours, e.mov, e.days]); assert.ok(e.eps >= 1 && e.mov === 1, JSON.stringify(e));
});
await p.evaluate(() => { const s = document.querySelector('#mir-month'); const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set; set.call(s, '2026-09'); s.dispatchEvent(new Event('change', { bubbles: true })); }); await wait(400);
await ok('September: numbers match an independent local-date count; top shows, busiest day and delta vs August', async () => {
  const e = expectMonth('2026-09'), a = expectMonth('2026-08'); const v = await statVals(p);
  assert.deepEqual([+v.episodes, +v.hours, +v.movies, +v.days], [e.eps, e.hours, e.mov, e.days]);
  const card = await p.evaluate(() => document.querySelector('.a-mir .sd-yir').innerText.replace(/\s+/g, ' ')); assert.match(card, /^September/i); assert.doesNotMatch(card, /so far/i);
  const pct = Math.round(((e.eps - a.eps) / a.eps) * 100); assert.match(card, new RegExp(`${pct >= 0 ? '▲' : '▼'} ${Math.abs(pct)}% ${pct >= 0 ? 'more' : 'fewer'} episodes than August`));
  const tops = await p.evaluate(() => [...document.querySelectorAll('.a-mir .sd-yir-show')].map((s) => [s.querySelector('.sd-yir-name').textContent, s.querySelector('.sd-yir-eps').textContent]));
  const exp = Object.entries(e.per).sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0])).slice(0, 3).map(([n, c]) => [n, `${c} eps`]); assert.deepEqual(tops, exp);
  assert.match(card, /Busiest day/i);
});
await ok('Year in review is untouched and still shows its own numbers', async () => { const y = await p.evaluate(() => document.querySelector('.a-yir .sd-yir').innerText.replace(/\s+/g, ' ')); assert.match(y, /^2026/); assert.match(y, /Busiest month/i); });
await p.evaluate(() => document.querySelector('.a-mir').scrollIntoView({ block: 'start' })); await wait(250);
await p.screenshot({ path: `${OUT}/month_card_phone.png` });

// ---- saved image + share for September
await p.evaluate(() => { window.__dl = []; [...document.querySelectorAll('.a-mir button')].find((b) => b.textContent.trim() === 'Save image').click(); }); await wait(1500);
const dlM = (await p.evaluate(() => window.__dl))[0];
await ok('Save image: file is watchnext-2026-09.png, a real 1080x1350 PNG', async () => { assert.equal(dlM.name, 'watchnext-2026-09.png'); const im = await decode(p, dlM); assert.deepEqual(im.dim, [1080, 1350]); });
fs.writeFileSync(`${OUT}/month_2026-09.png`, Buffer.from(dlM.bytes));
await ok('saved image: warm top-left, teal bottom-right, the 3 poster slots hold the right posters, headline text is drawn', async () => {
  const im = await decode(p, dlM); const E = expectMonth('2026-09');
  const tl = await im.px(6, 6), br = await im.px(1073, 1343); assert.ok(tl[0] > tl[2], JSON.stringify(tl)); assert.ok(br[1] > 29 + 8, JSON.stringify(br));
  const plan = Y.planYearImage({ year: 'x', epDelta: 1, prevYear: 'a', topShows: [{}, {}, {}], facts: [['A', 'b'], ['C', 'd']] });
  const order = Object.entries(E.per).sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0])).map(([n]) => n);
  const colorOf = { Suits: COLORS['suits.jpg'], 'The Office': COLORS['office.jpg'], Done: COLORS['done.jpg'] };
  for (let i = 0; i < 3; i++) { const bx = Y.posterBox(plan, i); const px = await im.px(Math.round(bx.x + bx.w / 2), Math.round(bx.y + bx.h / 2)); const want = colorOf[order[i]] || [23, 29, 40]; if (colorOf[order[i]]) assert.ok(near(px, want, 25), `slot ${i} (${order[i]}): ${JSON.stringify(px)}`); }
  const bright = await p.evaluate(() => { const d = window.__cx.getImageData(64, 118, 700, 140).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] > 200 && d[i + 1] > 200) n++; return n; }); assert.ok(bright > 2500, 'headline pixels: ' + bright);
});
await p.evaluate(() => { window.__shared = null; [...document.querySelectorAll('.a-mir button')].find((b) => b.textContent.trim() === 'Share').click(); }); await wait(500);
await ok('Share sends the month wording and the app link', async () => {
  const s = await p.evaluate(() => window.__shared); const e = expectMonth('2026-09');
  assert.equal(s.title, 'WatchNext — Month in Review'); assert.match(s.text, new RegExp(`^My September 2026 on WatchNext: ${e.eps} episodes \\(${e.hours} hrs\\) \\+ ${e.mov} movies\\.`)); assert.match(s.text, /Busiest day: \w{3} \d+ Sep\./); assert.equal(s.url, 'https://aceasif.github.io/watchnext/');
});
// October (partial) image caption must say so — check the saved file for the "SO FAR" caption pixels differ from September's
await p.evaluate(() => { const s = document.querySelector('#mir-month'); const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set; set.call(s, '2026-10'); s.dispatchEvent(new Event('change', { bubbles: true })); }); await wait(400);
await p.evaluate(() => { window.__dl = []; [...document.querySelectorAll('.a-mir button')].find((b) => b.textContent.trim() === 'Save image').click(); }); await wait(1500);
const dlO = (await p.evaluate(() => window.__dl))[0]; fs.writeFileSync(`${OUT}/month_2026-10.png`, Buffer.from(dlO.bytes));
await ok('October (a movie + a few episodes, no previous-month delta text issues) exports too, named watchnext-2026-10.png', async () => { assert.equal(dlO.name, 'watchnext-2026-10.png'); assert.deepEqual((await decode(p, dlO)).dim, [1080, 1350]); });
await p.close();

// =========================================================== 2. finish card
console.log('2. "You finished" card');
p = await open();
await openShow(p, 'Done');
await ok('a finished show offers the card button; the button is absent for unfinished, running and caught-up shows', async () => {
  assert.equal(await has(p, '[data-testid=finish-card-btn]'), true); await back(p);
  for (const name of ['Finale', 'Still Running', 'Running Caught Up', 'Almost']) { await openShow(p, name); assert.equal(await has(p, '[data-testid=finish-card-btn]'), false, name); await back(p); }
});
await openShow(p, 'Done'); await p.evaluate(() => document.querySelector('[data-testid=finish-card-btn]').click());
await p.waitForSelector('.sd-fc-preview', { timeout: 8000 }); await wait(300);
await ok('sheet "You finished Done" shows the rendered card (1080x1350 image), Share and Save image enabled', async () => {
  const info = await p.evaluate(() => { const i = document.querySelector('.sd-fc-preview'); const b = [...document.querySelectorAll('[role=dialog] .sd-btn')].map((x) => [x.textContent.trim(), x.disabled]); return { w: i.naturalWidth, h: i.naturalHeight, b, title: document.querySelector('[role=dialog]').getAttribute('aria-label') }; });
  assert.deepEqual([info.w, info.h], [1080, 1350]); assert.equal(info.title, 'You finished Done'); assert.deepEqual(info.b, [['Share', false], ['Save image', false]]);
});
await p.screenshot({ path: `${OUT}/finish_sheet_phone.png` });
await p.evaluate(() => { window.__dl = []; [...document.querySelectorAll('[role=dialog] .sd-btn')].find((b) => b.textContent.trim() === 'Save image').click(); }); await wait(800);
const dlF = (await p.evaluate(() => window.__dl))[0]; fs.writeFileSync(`${OUT}/finish_done.png`, Buffer.from(dlF.bytes));
await ok('Save image: watchnext-finished-done.png, 1080x1350; poster in its slot; amber stars match the rating (4 of 5)', async () => {
  assert.equal(dlF.name, 'watchnext-finished-done.png'); const im = await decode(p, dlF); assert.deepEqual(im.dim, [1080, 1350]);
  const facts = FC.finishFacts(SHOWS['tmdb:3'], new Set()); const plan = FC.planFinishImage(facts, { size: 150, lines: ['Done'] });
  const c = await im.px(Math.round(plan.poster.x + plan.poster.w / 2), Math.round(plan.poster.y + plan.poster.h / 2)); assert.ok(near(c, COLORS['done.jpg'], 25), JSON.stringify(c));
  const stars = await p.evaluate((sx, sy) => { const out = []; for (let i = 0; i < 5; i++) { const d = window.__cx.getImageData(sx + i * 56, sy - 34, 40, 36).data; let amber = 0; for (let k = 0; k < d.length; k += 4) if (d[k] > 200 && d[k + 1] > 130 && d[k + 1] < 200 && d[k + 2] < 90) amber++; out.push(amber > 120); } return out; }, plan.col.x, plan.starsY);
  assert.deepEqual(stars, [true, true, true, true, false]);
  const tl = await im.px(6, 6); assert.ok(tl[0] > tl[2], 'same warm wash: ' + JSON.stringify(tl));
});
await p.evaluate(() => { window.__shared = null; [...document.querySelectorAll('[role=dialog] .sd-btn')].find((b) => b.textContent.trim() === 'Share').click(); }); await wait(600);
await ok('Share sends the PICTURE (a PNG file) plus the wording', async () => {
  const s = await p.evaluate(() => window.__shared); assert.equal(s.files.length, 1); assert.deepEqual([s.files[0].name, s.files[0].type], ['watchnext-finished-done.png', 'image/png']); assert.ok(s.files[0].size > 5000);
  assert.match(s.text, /^I just finished Done on WatchNext: 3 episodes, 2 hours\./); assert.match(s.text, /★★★★☆/);
});
await p.evaluate(() => [...document.querySelectorAll('[role=dialog] button')].find((b) => b.textContent.trim() === 'Done').click()); await wait(300);
await ok('Done closes the sheet', async () => assert.equal(await has(p, '[role=dialog]'), false));
await back(p);

// ---- the prompt right after marking the final episode
const bigMark = (pg) => clickText(pg, 'Mark S01', 'button');
await openShow(p, 'Almost'); await bigMark(p); await wait(400);
await ok('marking a NON-final episode: no finish toast', async () => assert.equal(await toast(p), null)); await back(p);
await openShow(p, 'Still Running'); await bigMark(p); await wait(400);
await ok('final episode of a RUNNING show: no finish prompt (caught up, not finished)', async () => assert.equal(await toast(p), null)); await back(p);
await openShow(p, 'Finale'); await bigMark(p); await wait(400);
await ok('final episode of an ENDED show: toast "You finished Finale!" with "Make card"', async () => { assert.match(await toast(p), /^You finished Finale!\s*Make card$/); assert.equal(await has(p, '[data-testid=finish-card-btn]'), true, 'the button appears on the page too'); });
await p.screenshot({ path: `${OUT}/finish_toast_phone.png` });
await clickText(p, 'Make card', '.sd-toast button'); await p.waitForSelector('.sd-fc-preview', { timeout: 8000 });
await ok('"Make card" closes the toast and opens the card preview for that show', async () => { assert.equal(await toast(p), null); assert.equal(await p.evaluate(() => document.querySelector('[role=dialog]').getAttribute('aria-label')), 'You finished Finale'); });
await p.evaluate(() => [...document.querySelectorAll('[role=dialog] button')].find((b) => b.textContent.trim() === 'Done').click()); await wait(300); await back(p);
await openShow(p, 'DropFin'); await bigMark(p); await wait(400);
await ok('finishing a DROPPED show: one toast only (finish), and the show is resumed', async () => {
  const t = await toast(p); assert.match(t, /You finished DropFin!/); assert.doesNotMatch(t, /Resumed/);
  const st = await p.evaluate(() => JSON.parse(localStorage.getItem('watchnext-state-v1')).shows['tmdb:7']); assert.strictEqual(st.dropped, false);
});
await wait(9500);
await ok('the finish toast goes away by itself after ~9 seconds', async () => assert.equal(await toast(p), null));
await p.close();

// ---- desktop views
p = await open({ w: 1280, h: 900 }); await tab(p, 'Stats');
await p.evaluate(() => document.querySelector('.a-mir').scrollIntoView({ block: 'start' })); await wait(250);
await ok('desktop: Month in review renders next to Year in review without sideways scroll', async () => assert.equal(await p.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false));
await p.screenshot({ path: `${OUT}/month_card_desktop.png` });
await openShow(p, 'Done'); await p.evaluate(() => document.querySelector('[data-testid=finish-card-btn]').click()); await p.waitForSelector('.sd-fc-preview', { timeout: 8000 }); await wait(300);
await p.screenshot({ path: `${OUT}/finish_sheet_desktop.png` });
await p.close();
console.log(`\n${checks} checks passed`); console.log('PROBLEMS:', problems.length ? '\n' + problems.join('\n') : 'none'); await browser.close(); server.close();
