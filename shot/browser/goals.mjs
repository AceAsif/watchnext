process.env.TZ = 'Australia/Hobart';
import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import zlib from 'node:zlib';
import * as Y from '/home/claude/wl/src/components/yearImageLogic.js';

const DIST = '/home/claude/wl/dist'; const OUT = '/home/claude/shot/out_gl'; fs.mkdirSync(OUT, { recursive: true });
const fontsCss = fs.readFileSync('/home/claude/shot/fonts.css', 'utf8');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => { let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html'; const f = path.join(DIST, p); if (!f.startsWith(DIST) || !fs.existsSync(f)) { res.writeHead(404); return res.end('nf'); } res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res); });
await new Promise((r) => server.listen(4189, r));
const crcT = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
const crc = (b) => { let c = -1; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
const solid = (w, h, [r, g, b]) => { const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: w }, () => [r, g, b]).flat())]); const raw = Buffer.concat(Array.from({ length: h }, () => row)); const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2; return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]); };
const COLORS = { 'big.jpg': [200, 40, 40], 'streaky.jpg': [40, 200, 60], 'rew.jpg': [60, 80, 230] };
const FIXED = Date.parse('2026-10-01T22:00:00.000Z'); // 08:00 Fri 2 Oct 2026 in Hobart (local day 2026-10-02, day-of-year 275)
const TODAY = '2026-10-02', DOY = 275, DIY = 365;

// ------------------------------------------------------------ the seeded history
const at = (y, m, d, h = 10, min = 0) => new Date(Date.UTC(y, m - 1, d, h, min)).toISOString();
const ep = (iso, n = 1) => ({ at: iso, min: 40, n });
const bigEps = {}; { let k = 0; for (let d = 0; d < 50; d++) for (let j = 0; j < 6; j++) bigEps[`1x${++k}`] = ep(at(2026, 1, 1 + d * 2, 10, j)); }                  // 300 episodes, every 2nd day Jan..Apr
const streakyEps = {}; { let k = 0; for (let d = 1; d <= 7; d++) streakyEps[`1x${++k}`] = ep(at(2026, 8, d)); for (const [m, d] of [[9, 29], [9, 30], [10, 1]]) streakyEps[`1x${++k}`] = ep(at(2026, m, d)); } // Aug 1-7 (best streak 7) + Sep 29..Oct 1 (current 3)
const rewEps = Object.fromEntries(Array.from({ length: 5 }, (_, i) => [`1x${i + 1}`, ep(at(2026, 6, 10, 10, i), 2)]));                                            // 5 episodes watched twice
const oldEps = {}; { let k = 0; for (let d = 0; d < 40; d++) for (let j = 0; j < 3; j++) oldEps[`1x${++k}`] = ep(at(2025, 6, 1 + d * 3 > 28 ? 28 : 1 + d * 3, 10, j + d)); } // 120 episodes in 2025
const show = (id, name, watched, poster) => ({ followed: true, poster, status: 'Ended', providers: [], lastSynced: '2026-09-01T00:00:00Z', runtimeMin: 40, genres: ['Drama'], name, tmdbId: id, totalEpisodes: 500, seasons: [{ n: 1, count: 500 }], watched });
const movie = (id, name, iso) => ({ tmdbId: id, name, status: 'watched', watchedAt: iso, runtimeMin: 100, poster: null, year: 2020 });
const SEED = () => ({
  shows: { 'tmdb:1': show(1, 'Big Show', bigEps, '/big.jpg'), 'tmdb:2': show(2, 'Streaky', streakyEps, '/streaky.jpg'), 'tmdb:3': show(3, 'Rewatched', rewEps, '/rew.jpg'), 'tmdb:4': show(4, 'Old Show', oldEps, null) },
  movies: [movie(10, 'M1', at(2026, 6, 20)), movie(11, 'M2', at(2026, 7, 15)), movie(12, 'M3', at(2026, 7, 25)), { tmdbId: 13, name: 'Planned', status: 'planned' }, movie(14, 'Old M1', at(2025, 3, 3)), movie(15, 'Old M2', at(2025, 11, 11))],
  settings: { tmdbKey: 'TESTKEY' }, goals: {},
});

// ------------------------------------------------------------ independent expectations (own arithmetic)
function actuals(state, year) {
  let eps = 0, min = 0, mov = 0;
  for (const s of Object.values(state.shows)) for (const w of Object.values(s.watched)) if (w.at.slice(0, 4) === String(year)) { eps += w.n; min += w.min * w.n; }
  for (const m of state.movies) if (m.status === 'watched' && m.watchedAt.slice(0, 4) === String(year)) { mov++; min += m.runtimeMin; }
  return { episodes: eps, movies: mov, hours: Math.round(min / 60) };
}
const NOUN = { episodes: ['episode', 'episodes'], movies: ['movie', 'movies'], hours: ['hour', 'hours'] };
function expectRow(metric, target, done) {
  const pct = Math.round((done / target) * 100); const num = `${done.toLocaleString()} / ${target.toLocaleString()} · ${pct}%`;
  const frac = DOY / DIY; const delta = Math.round(done - target * frac); const tol = Math.max(1, Math.round(target * 0.01)); const proj = Math.round(done / frac); const left = DIY - DOY; const rem = Math.max(0, target - done);
  const noun = (n) => NOUN[metric][n === 1 ? 0 : 1]; const rate = (r) => (r >= 10 ? String(Math.round(r)) : String(Math.round(r * 10) / 10));
  let pace;
  if (done >= target) pace = `Goal reached · ${left} days to spare`;
  else if (delta >= tol) pace = `${delta.toLocaleString()} ${noun(delta)} ahead of pace · on track for ${proj.toLocaleString()}`;
  else if (delta <= -tol) pace = `${(-delta).toLocaleString()} ${noun(-delta)} behind pace · ${rate(rem / (left / 7))} a week gets you there`;
  else pace = `On pace for ${proj.toLocaleString()}`;
  return { num, pace, pct };
}

const browser = await puppeteer.launch({ args: chromium.args, executablePath: await chromium.executablePath(), headless: 'shell' });
const problems = []; let checks = 0; const ok = async (n, f) => { await f(); checks++; console.log('  PASS', n); }; const wait = (ms = 350) => new Promise((r) => setTimeout(r, ms));
async function open(state, { w = 390, h = 844, tab = 'Stats' } = {}) {
  const page = await browser.newPage(); await page.emulateTimezone('Australia/Hobart'); await page.setViewport({ width: w, height: h, deviceScaleFactor: 2 });
  page.on('pageerror', (e) => problems.push('pageerror: ' + e.message)); page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) problems.push('console.error: ' + m.text()); });
  await page.setBypassServiceWorker(true); await page.setRequestInterception(true);
  page.on('request', (r) => { const u = r.url(); if (u.startsWith('http://localhost:')) return r.continue(); if (u.includes('fonts.googleapis.com')) return r.respond({ status: 200, contentType: 'text/css', body: fontsCss }); if (u.includes('image.tmdb.org')) { const key = u.split('/').pop().split('?')[0]; return r.respond({ status: 200, contentType: 'image/png', headers: { 'access-control-allow-origin': '*' }, body: solid(40, 60, COLORS[key] || [90, 90, 90]) }); } if (u.includes('api.themoviedb.org')) return r.respond({ status: 200, contentType: 'application/json', body: '{"results":[],"episodes":[]}' }); return r.abort(); });
  await page.evaluateOnNewDocument((s, fixed) => {
    if (!sessionStorage.getItem('__s')) { localStorage.setItem('watchnext-state-v1', JSON.stringify(s)); sessionStorage.setItem('__s', '1'); }
    const RealDate = Date; const start = RealDate.now(); const b = fixed;
    class FakeDate extends RealDate { constructor(...a) { if (a.length === 0) super(b + (RealDate.now() - start)); else super(...a); } static now() { return b + (RealDate.now() - start); } }
    window.Date = FakeDate; window.__dl = [];
    URL.revokeObjectURL = () => {};
    const realClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () { if (this.download && this.href.startsWith('blob:')) { const name = this.download; fetch(this.href).then((r) => r.arrayBuffer()).then((buf) => window.__dl.push({ name, bytes: Array.from(new Uint8Array(buf)) })); return; } return realClick.call(this); };
  }, state, FIXED);
  await page.goto('http://localhost:4189/', { waitUntil: 'networkidle0' }); await wait(500);
  if (tab) await page.evaluate((t) => [...document.querySelectorAll('nav.tabbar button')].find((x) => x.textContent.includes(t)).click(), tab); await wait(450);
  return page;
}
const stored = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('watchnext-state-v1')));
const setVal = (p, sel, v) => p.$eval(sel, (el, val) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, val); el.dispatchEvent(new Event('input', { bubbles: true })); }, v);
const dlg = (p) => p.evaluate(() => { const d = document.querySelector('[role=dialog]'); if (!d) return null; return { title: d.getAttribute('aria-label'), text: d.innerText.replace(/\s+/g, ' '), save: (() => { const b = [...d.querySelectorAll('button')].find((x) => x.textContent.trim() === 'Save goals'); return b ? b.disabled : null; })(), hints: Object.fromEntries([...d.querySelectorAll('.sd-goalhint')].map((h) => [h.id.replace('goal-', '').replace('-hint', ''), h.textContent])), vals: Object.fromEntries([...d.querySelectorAll('.sd-goalfield input')].map((i) => [i.id.replace('goal-', ''), i.value])), years: [...d.querySelectorAll('[aria-label=Year] .sd-nchip')].map((c) => [c.textContent.trim(), c.getAttribute('aria-pressed') === 'true']) }; });
const click = (p, label, scope = 'body') => p.evaluate((l, s) => { const b = [...document.querySelector(s).querySelectorAll('button')].find((x) => x.textContent.trim() === l); if (!b) throw new Error('no button ' + l); b.click(); }, label, scope);
const rows = (p) => p.evaluate(() => [...document.querySelectorAll('.a-goals .sd-goal')].map((g) => ({ id: g.dataset.goal, name: g.querySelector('.sd-goal-name').textContent, num: g.querySelector('.sd-goal-num').textContent, pace: g.querySelector('.sd-goal-pace').textContent, bar: +g.querySelector('[role=progressbar]').getAttribute('aria-valuenow') })));
const streak = (p) => p.evaluate(() => (document.querySelector('[data-testid=goal-streak]') || {}).textContent);
async function decode(p, dl) { const url = 'data:image/png;base64,' + Buffer.from(dl.bytes).toString('base64'); await p.evaluate((u) => new Promise((res) => { const im = new Image(); im.onload = () => { const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const x = c.getContext('2d'); x.drawImage(im, 0, 0); window.__cx = x; window.__dim = [im.width, im.height]; res(); }; im.src = u; }), url); return { dim: await p.evaluate(() => window.__dim), px: (x, y) => p.evaluate((a, b) => Array.from(window.__cx.getImageData(a, b, 1, 1).data), x, y) }; }
const near = (a, b, tol = 22) => a.slice(0, 3).every((v, i) => Math.abs(v - b[i]) <= tol);

// ============================================================ 1. the card, empty
console.log('1. Goals card with no goals');
const S0 = SEED(); const A26 = actuals(S0, 2026), A25 = actuals(S0, 2025);
let p = await open(S0);
await ok('sanity: the seeded year is what the test thinks it is (300 + 10 + 5 rewatched twice = 320 episodes, 3 movies)', async () => { assert.deepEqual(A26, { episodes: 300 + 10 + 5 * 2, movies: 3, hours: Math.round(((300 + 10 + 5 * 2) * 40 + 3 * 100) / 60) }); /* Big 300 + Streaky 10 + Rewatched 5 episodes x2 */ assert.deepEqual([A25.episodes, A25.movies], [120, 2]); });
await ok('Stats → Overview has a "Goals · 2026" section (above Year in review) with a "Set goals" button, an invitation, and the streak', async () => {
  const order = await p.evaluate(() => [...document.querySelectorAll('.sd-sec2')].map((s) => s.querySelector('.sd-lbl').textContent.trim().toLowerCase())); const i = order.indexOf('goals · 2026'); assert.ok(i >= 0 && order[i + 1] === 'year in review', order.join(' | '));
  const t = await p.evaluate(() => document.querySelector('.a-goals').innerText.replace(/\s+/g, ' ')); assert.match(t, /Set goals/); assert.match(t, /Set a yearly target for episodes, movies or hours and see your progress and pace here\./);
  assert.equal(await streak(p), '3 days in a row · best 7 days');
});
await ok('the Year in Review card has no goal bars yet', async () => assert.equal(await p.evaluate(() => document.querySelectorAll('[data-goal-stat]').length), 0));
await p.screenshot({ path: `${OUT}/goals_empty_phone.png` });

// ============================================================ 2. the editor
console.log('2. the editor');
await click(p, 'Set goals', '.a-goals'); await wait(400);
await ok('opens on this year (2026) with next year (2027) available, empty fields, "Last year (2025)" hints, and Save disabled', async () => {
  const d = await dlg(p); assert.equal(d.title, 'Yearly goals'); assert.deepEqual(d.years, [['2026', true], ['2027', false]]); assert.deepEqual(d.vals, { episodes: '', movies: '', hours: '' }); assert.equal(d.save, true);
  assert.equal(d.hints.episodes, `Last year (2025): ${A25.episodes}`); assert.equal(d.hints.movies, `Last year (2025): ${A25.movies}`); assert.equal(d.hints.hours, `Last year (2025): ${A25.hours}`);
});
await ok('bad input is refused with a clear message and Save stays disabled: letters, decimals, zero, too big', async () => {
  for (const [v, msg] of [['abc', 'Use a whole number.'], ['4.5', 'Use a whole number.'], ['0', 'Use a number above zero (or clear it).'], ['100000', 'Use 99,999 or less.'], ['-3', 'Use a whole number.']]) { await setVal(p, '#goal-episodes', v); const d = await dlg(p); assert.equal(d.hints.episodes, msg, v); assert.equal(d.save, true, v); assert.equal(await p.$eval('#goal-episodes', (e) => e.getAttribute('aria-invalid')), 'true'); }
});
await p.evaluate(() => [...document.querySelectorAll('[role=dialog] [aria-label="Episodes presets"] .sd-nchip')].find((c) => c.textContent.trim() === '400').click()); await wait(200);
await ok('a preset fills the field, the error goes away, and Save is enabled', async () => { const d = await dlg(p); assert.equal(d.vals.episodes, '400'); assert.equal(d.save, false); assert.match(d.hints.episodes, /^Last year/); });
await setVal(p, '#goal-movies', '2');
await p.evaluate(() => [...document.querySelectorAll('[role=dialog] [aria-label="Hours presets"] .sd-nchip')].find((c) => c.textContent.trim() === '500').click()); await wait(200);
await p.screenshot({ path: `${OUT}/goals_sheet_phone.png` });
await click(p, 'Save goals', '[role=dialog]'); await wait(500);
await ok('Save closes the sheet and stores the goals for 2026 with a time stamp', async () => {
  assert.equal(await p.evaluate(() => !!document.querySelector('[role=dialog]')), false); const g = (await stored(p)).goals['2026']; assert.deepEqual([g.episodes, g.movies, g.hours], [400, 2, 500]); assert.ok(Math.abs(Date.parse(g.at) - FIXED) < 20000);
});

// ============================================================ 3. progress and pace
console.log('3. progress and pace');
const eE = expectRow('episodes', 400, A26.episodes), eM = expectRow('movies', 2, A26.movies), eH = expectRow('hours', 500, A26.hours);
await ok('the card shows each goal with done / target · %, a progress bar, and the pace line: every number derived independently from the seeded history', async () => {
  const r = await rows(p); assert.deepEqual(r.map((x) => x.id), ['episodes', 'movies', 'hours']); assert.deepEqual(r.map((x) => x.name), ['Episodes', 'Movies', 'Hours']);
  assert.deepEqual(r.map((x) => x.num), [eE.num, eM.num, eH.num]); assert.deepEqual(r.map((x) => x.pace), [eE.pace, eM.pace, eH.pace]); assert.deepEqual(r.map((x) => x.bar), [Math.min(100, eE.pct), 100, Math.min(100, eH.pct)]);
  assert.match(r[1].pace, /^Goal reached · 90 days to spare$/);
});
await ok('the streak is still shown (3 now, best 7) and the button now says "Edit goals"', async () => { assert.equal(await streak(p), '3 days in a row · best 7 days'); assert.ok(await p.evaluate(() => [...document.querySelectorAll('.a-goals button')].some((b) => b.textContent.trim() === 'Edit goals'))); });
await p.screenshot({ path: `${OUT}/goals_card_phone.png` });
await p.evaluate(() => document.querySelector('.a-yir').scrollIntoView({ block: 'start' })); await wait(250);
await ok('Year in review shows a bar and "N% of target" under Episodes, Hours and Movies — and nothing under Days', async () => {
  const g = await p.evaluate(() => Object.fromEntries([...document.querySelectorAll('.a-yir [data-goal-stat]')].map((e) => [e.dataset.goalStat, e.innerText.replace(/\s+/g, ' ')]))); assert.deepEqual(Object.keys(g).sort(), ['episodes', 'hours', 'movies']);
  assert.equal(g.episodes, `${eE.pct}% of 400`); assert.equal(g.movies, `${eM.pct}% of 2`); assert.equal(g.hours, `${eH.pct}% of 500`); assert.equal(await p.evaluate(() => !!document.querySelector('.a-yir [data-stat=yir-days] [data-goal-stat]')), false);
});
await p.screenshot({ path: `${OUT}/year_card_goals_phone.png` });

// ---- the saved image
await p.evaluate(() => { window.__dl = []; [...document.querySelectorAll('.a-yir button')].find((b) => b.textContent.trim() === 'Save image').click(); }); await wait(1800);
const dl = (await p.evaluate(() => window.__dl))[0]; fs.writeFileSync(`${OUT}/year_2026_goals.png`, Buffer.from(dl.bytes));
await ok('the saved Year image is still 1080x1350 and now carries the goal bars: teal fill up to the percentage, the track after it, and amber when the goal is met', async () => {
  assert.equal(dl.name, 'watchnext-2026.png'); const im = await decode(p, dl); assert.deepEqual(im.dim, [1080, 1350]);
  const plan = Y.planYearImage({ year: 2026, prevYear: '2025', epDelta: 1, topShows: [{}, {}, {}], facts: [['A', 'b'], ['C', 'd']], goals: { episodes: {}, hours: {}, movies: {} } });
  const cw = (Y.IMG_W - 2 * Y.IMG_PAD) / 4, bw = cw - 32, y = plan.goalBarY + 4; const cellX = (i) => Y.IMG_PAD + i * cw;
  const TEAL = [86, 200, 181], AMBER = [242, 163, 60];
  const e0 = await im.px(Math.round(cellX(0) + 6), y); assert.ok(near(e0, TEAL), 'episodes fill start ' + JSON.stringify(e0));
  const fillEnd = bw * Math.min(1, eE.pct / 100); const afterFill = await im.px(Math.round(cellX(0) + fillEnd + (bw - fillEnd) / 2), y); assert.ok(!near(afterFill, TEAL, 40) && !near(afterFill, AMBER, 40), 'the track after the fill: ' + JSON.stringify(afterFill));
  const mEnd = await im.px(Math.round(cellX(2) + bw - 6), y); assert.ok(near(mEnd, AMBER), 'movies (met) is a full amber bar: ' + JSON.stringify(mEnd));
  const none = await im.px(Math.round(cellX(3) + 6), y); assert.ok(!near(none, TEAL, 40) && !near(none, AMBER, 40), 'Days has no bar: ' + JSON.stringify(none));
  const poster = await im.px(Math.round(Y.posterBox(plan, 0).x + Y.posterBox(plan, 0).w / 2), Math.round(Y.posterBox(plan, 0).y + Y.posterBox(plan, 0).h / 2)); assert.ok(near(poster, COLORS['big.jpg'], 30), 'the first poster is where the (smaller) goal layout puts it: ' + JSON.stringify(poster));
  const bright = await p.evaluate((x, y) => { const d = window.__cx.getImageData(x, y, 240, 44).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] > 200 && d[i + 1] > 200 && d[i + 2] > 200) n++; return n; }, Y.IMG_PAD, Y.IMG_H - Y.IMG_PAD - 40); assert.ok(bright > 150, 'the WatchNext footer text is still drawn below the goal rows: ' + bright);
});
await ok('the share text mentions the goals', async () => {
  await p.evaluate(() => { window.__shared = null; navigator.share = async (d) => { window.__shared = d; }; [...document.querySelectorAll('.a-yir button')].find((b) => b.textContent.trim() === 'Share').click(); }); await wait(400);
  const s = await p.evaluate(() => window.__shared); assert.match(s.text, new RegExp(`Goals: ${A26.episodes}/400 episodes, ${A26.movies}/2 movies, ${A26.hours}/500 hours\\.`));
});

// ============================================================ 4. edit / clear / next year
console.log('4. edit, clear, next year');
await p.evaluate(() => document.querySelector('.a-goals').scrollIntoView({ block: 'start' })); await wait(200);
await click(p, 'Edit goals', '.a-goals'); await wait(400);
await ok('editing starts from the saved values and Save is disabled until something changes', async () => { const d = await dlg(p); assert.deepEqual(d.vals, { episodes: '400', movies: '2', hours: '500' }); assert.equal(d.save, true); });
await setVal(p, '#goal-episodes', '350');
await p.evaluate(() => [...document.querySelectorAll('[role=dialog] [aria-label="Hours presets"] .sd-nchip')].find((c) => c.textContent.trim() === 'Clear').click()); await wait(200);
await click(p, 'Save goals', '[role=dialog]'); await wait(500);
await ok('a changed target updates the card; a cleared goal (hours) disappears from the card and from the Year card', async () => {
  const r = await rows(p); assert.deepEqual(r.map((x) => x.id), ['episodes', 'movies']); assert.equal(r[0].num, expectRow('episodes', 350, A26.episodes).num); const g = (await stored(p)).goals['2026']; assert.deepEqual([g.episodes, g.movies, g.hours], [350, 2, undefined]);
  assert.deepEqual(await p.evaluate(() => [...document.querySelectorAll('.a-yir [data-goal-stat]')].map((e) => e.dataset.goalStat).sort()), ['episodes', 'movies']);
});
await click(p, 'Edit goals', '.a-goals'); await wait(400);
await p.evaluate(() => [...document.querySelectorAll('[role=dialog] .sd-nchip')].find((c) => c.textContent.trim() === '2027').click()); await wait(250);
await ok('switching to next year shows empty fields (this year\'s values are not copied), with this year\'s total as the hint', async () => { const d = await dlg(p); assert.deepEqual(d.years, [['2026', false], ['2027', true]]); assert.deepEqual(d.vals, { episodes: '', movies: '', hours: '' }); assert.equal(d.hints.episodes, `Last year (2026): ${A26.episodes}`); });
await setVal(p, '#goal-episodes', '500'); await click(p, 'Save goals', '[role=dialog]'); await wait(500);
await ok('next year\'s goal is stored separately; the card still shows THIS year (2026)', async () => {
  const g = (await stored(p)).goals; assert.equal(g['2027'].episodes, 500); assert.equal(g['2026'].episodes, 350); assert.match(await p.evaluate(() => document.querySelector('.a-goals .sd-lbl').textContent), /Goals · 2026/); assert.equal((await rows(p)).length, 2);
});
await click(p, 'Edit goals', '.a-goals'); await wait(400);
await p.evaluate(() => { for (const id of ['episodes', 'movies']) { const g = document.querySelector(`[role=dialog] [aria-label="${id === 'episodes' ? 'Episodes' : 'Movies'} presets"]`); [...g.querySelectorAll('.sd-nchip')].find((c) => c.textContent.trim() === 'Clear').click(); } }); await wait(200);
await click(p, 'Save goals', '[role=dialog]'); await wait(500);
await ok('clearing every target of the year returns the card to the invitation, removes the Year-card bars, and keeps a stamped empty entry (so the clearing syncs)', async () => {
  assert.equal((await rows(p)).length, 0); assert.match(await p.evaluate(() => document.querySelector('.a-goals').innerText), /Set a yearly target/); assert.equal(await p.evaluate(() => document.querySelectorAll('[data-goal-stat]').length), 0);
  const e = (await stored(p)).goals['2026']; assert.deepEqual(Object.keys(e), ['at']); assert.equal((await stored(p)).goals['2027'].episodes, 500);
});
await p.close();

// ============================================================ 5. past years
console.log('5. past years on the Year card');
const S5 = SEED(); S5.goals = { 2025: { episodes: 100, hours: 400, at: at(2026, 1, 1) }, 2026: { movies: 5, at: at(2026, 1, 1) } };
p = await open(S5);
await p.evaluate(() => { const s = document.querySelector('#yir-year'); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(s, '2025'); s.dispatchEvent(new Event('change', { bubbles: true })); }); await wait(400);
await ok('choosing 2025 shows how that year\'s goals ended: 120% of 100 (met, amber) and a missed hours goal', async () => {
  const g = await p.evaluate(() => Object.fromEntries([...document.querySelectorAll('.a-yir [data-goal-stat]')].map((e) => [e.dataset.goalStat, { t: e.innerText.replace(/\s+/g, ' '), met: !!e.querySelector('.met') }]))); assert.deepEqual(g.episodes, { t: '120% of 100', met: true }); assert.equal(g.hours.met, false); assert.equal(g.hours.t, `${expectRow('hours', 400, A25.hours).pct}% of 400`); assert.equal(g.movies, undefined);
});
await ok('the Goals card (this year) shows only 2026\'s own movie goal, with no leak from 2025', async () => { const r = await rows(p); assert.deepEqual(r.map((x) => x.id), ['movies']); assert.equal(r[0].num, expectRow('movies', 5, A26.movies).num); });
await p.close();

// ============================================================ 6. backup, restore, delete
console.log('6. backup, restore, delete all data');
const S6 = SEED(); S6.goals = { 2026: { episodes: 400, hours: 500, at: at(2026, 9, 1) }, 2025: { episodes: 100, at: at(2025, 12, 1) } };
p = await open(S6, { tab: 'Settings' });
await p.evaluate(() => [...document.querySelectorAll('button.sd-setbtn')].find((b) => b.textContent.includes('Download backup')).click()); await wait(900);
const bk = (await p.evaluate(() => window.__dl)).find((d) => d.name.startsWith('watchnext-backup')); const bkJson = JSON.parse(Buffer.from(bk.bytes).toString('utf8'));
await ok('the backup file contains the goals (and still no TMDB key)', async () => { assert.deepEqual(bkJson.goals['2026'], { episodes: 400, hours: 500, at: at(2026, 9, 1) }); assert.equal(bkJson.goals['2025'].episodes, 100); assert.equal(bkJson.settings.tmdbKey, undefined); });
fs.writeFileSync('/home/claude/shot/tmp/goals_backup.json', JSON.stringify(bkJson));
await p.close();
const S6b = SEED(); S6b.goals = { 2026: { episodes: 111, at: at(2026, 9, 2) } };
p = await open(S6b, { tab: 'Settings' });
const fileInput = await p.evaluateHandle(() => { const sec = [...document.querySelectorAll('section')].find((s) => /^\s*BACKUP|Backup/.test(s.querySelector('h2') ? s.querySelector('h2').textContent : '') && s.querySelector('input[type=file]')); return sec.querySelector('input[type=file]'); });
await fileInput.uploadFile('/home/claude/shot/tmp/goals_backup.json'); await wait(900);
await ok('restoring adds the 2025 goal you did not have, keeps your own 2026 goal, and says so', async () => {
  const g = (await stored(p)).goals; assert.equal(g['2025'].episodes, 100); assert.equal(g['2026'].episodes, 111, 'your goal is never overwritten'); assert.equal(g['2026'].hours, undefined); assert.match(await p.evaluate(() => document.body.innerText), /1 yearly goal restored/);
});
await p.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Delete all data' && b.classList.contains('danger')).click()); await wait(500);
await p.evaluate(() => [...document.querySelectorAll('[role=alertdialog] button, [role=dialog] button')].find((b) => b.textContent.trim() === 'Delete all data').click()); await wait(600);
await ok('"Delete all data" clears the goals too', async () => { assert.deepEqual((await stored(p)).goals, {}); });
await p.close();

// ============================================================ 7. layout
console.log('7. layout');
const S7 = SEED(); S7.goals = { 2026: { episodes: 400, movies: 2, hours: 500, at: at(2026, 9, 1) } };
p = await open(S7, { w: 320, h: 700 });
await ok('320px wide: no sideways scroll with goals on the card and the Year card', async () => assert.equal(await p.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false));
await click(p, 'Edit goals', '.a-goals'); await wait(400);
await ok('320px: the editor fits and keeps its buttons reachable', async () => { assert.equal(await p.evaluate(() => { const d = document.querySelector('[role=dialog]'); return d.scrollWidth <= d.clientWidth + 1; }), true); });
await p.close();
p = await open(S7, { w: 1280, h: 900 }); await p.screenshot({ path: `${OUT}/goals_desktop.png` });
await ok('desktop: no sideways scroll', async () => assert.equal(await p.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false)); await p.close();
console.log(`\n${checks} checks passed`); console.log('PROBLEMS:', problems.length ? '\n' + problems.join('\n') : 'none'); await browser.close(); server.close();
