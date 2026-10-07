import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { workPath, browserFile, APP_DIST } from '../../tests/paths.mjs';
import { launchBrowser } from './launch.mjs';

const OUT = workPath('out_wr'); fs.mkdirSync(OUT, { recursive: true });
const fontsCss = fs.readFileSync(browserFile('fonts.css'), 'utf8');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
const serve = (dir, port) => new Promise((res) => { const s = http.createServer((req, rs) => { let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html'; const f = path.join(dir, p); if (!f.startsWith(dir) || !fs.existsSync(f)) { rs.writeHead(404); return rs.end('nf'); } rs.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(rs); }); s.listen(port, () => res(s)); });
const FAKE = await serve(workPath('dist-fake'), 4179), REAL = await serve(APP_DIST, 4180);
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const FIXED_ISO = '2026-10-01T22:00:00.000Z'; // Fri 2 Oct 2026, 08:00 in Hobart
const DROPPED_AT = '2026-09-20T01:00:00.000Z';
const W = (s, from, to, at) => Object.fromEntries(Array.from({ length: to - from + 1 }, (_, i) => [`${s}x${from + i}`, { at, min: 40, n: 1 }]));
const base = { followed: true, poster: null, status: 'Ended', providers: [], lastSynced: '2026-09-01T00:00:00Z', runtimeMin: 40, genres: ['Drama'] };
const mkShow = (n, name, extra = {}) => ({ ...base, name, tmdbId: n, totalEpisodes: 10, seasons: [{ n: 1, count: 10 }], watched: W(1, 1, 3, '2026-09-25T10:00:00.000Z'), ...extra });
const STATE = {
  shows: {
    'tmdb:1': mkShow(1, 'Alpha Airing'),
    'tmdb:2': mkShow(2, 'Bravo Binge', { dropped: true, droppedAt: DROPPED_AT }),
    'tmdb:3': mkShow(3, 'Charlie Done', { totalEpisodes: 3, seasons: [{ n: 1, count: 3 }], watched: W(1, 1, 3, '2026-09-10T10:00:00.000Z') }),
    'tmdb:4': mkShow(4, 'Delta Drop', { dropped: true, droppedAt: DROPPED_AT }),
    'tmdb:5': mkShow(5, 'Echo Fresh', { dropped: true, droppedAt: DROPPED_AT }),
  },
  movies: [{ tmdbId: 90, name: 'Film One', status: 'watched', watchedAt: '2026-05-06T10:00:00.000Z', runtimeMin: 100, poster: null, year: 2026 }],
  settings: { tmdbKey: 'TESTKEY' },
  goals: { 2026: { episodes: 400, hours: 300, at: '2026-09-01T00:00:00.000Z' } },
};
const SEASON = { episodes: Array.from({ length: 10 }, (_, i) => ({ episode_number: i + 1, name: 'Ep ' + (i + 1), runtime: 40, air_date: '2020-01-0' + ((i % 9) + 1) })) };

const browser = await launchBrowser(puppeteer);
const problems = []; let checks = 0;
const ok = async (name, fn) => { await fn(); checks++; console.log('  PASS', name); };
const wait = (ms = 350) => new Promise((r) => setTimeout(r, ms));

async function open(port, { w = 390, h = 844 } = {}) {
  const page = await browser.newPage();
  await page.emulateTimezone('Australia/Hobart');
  await page.setViewport({ width: w, height: h, deviceScaleFactor: 2 });
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR|Delete everywhere failed/.test(m.text())) problems.push(`console.error: ${m.text()}`); });
  await page.setBypassServiceWorker(true);
  await page.setRequestInterception(true);
  page.on('request', (r) => {
    const u = r.url();
    if (u.startsWith('http://localhost:')) return r.continue();
    if (u.includes('fonts.googleapis.com')) return r.respond({ status: 200, contentType: 'text/css', body: fontsCss });
    if (u.includes('image.tmdb.org')) return r.respond({ status: 200, contentType: 'image/png', body: PNG });
    if (u.includes('api.themoviedb.org')) return r.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(u.includes('/season/') ? SEASON : { episodes: [], results: [] }) });
    return r.abort();
  });
  await page.evaluateOnNewDocument((s, fixed) => {
    if (!sessionStorage.getItem('__seeded')) { localStorage.setItem('watchnext-state-v1', JSON.stringify(s)); sessionStorage.setItem('__seeded', '1'); }
    const RealDate = Date; const start = RealDate.now(); const b = RealDate.parse(fixed);
    class FakeDate extends RealDate { constructor(...a) { if (a.length === 0) super(b + (RealDate.now() - start)); else super(...a); } static now() { return b + (RealDate.now() - start); } }
    window.Date = FakeDate;
    window.__events = []; window.__dl = [];
    URL.revokeObjectURL = () => {};
    const realClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {
      if (this.download && this.href.startsWith('blob:')) {
        const name = this.download; window.__events.push('download:' + name);
        fetch(this.href).then((r) => r.arrayBuffer()).then((buf) => window.__dl.push({ name, bytes: Array.from(new Uint8Array(buf)) }));
        return;
      }
      return realClick.call(this);
    };
  }, STATE, FIXED_ISO);
  await page.goto(`http://localhost:${port}/`, { waitUntil: 'networkidle0' });
  await wait(500);
  return page;
}
const tab = async (p, name) => { await p.evaluate((t) => [...document.querySelectorAll('nav.tabbar button')].find((x) => x.textContent.includes(t)).click(), name); await wait(450); };
const text = (p) => p.evaluate(() => document.body.innerText);
const stored = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('watchnext-state-v1')));
const clickText = (p, label, sel = 'button') => p.evaluate((t, s) => { const el = [...document.querySelectorAll(s)].find((e) => (e.getAttribute('aria-label') || e.textContent).trim().includes(t)); if (!el) throw new Error('no element: ' + t); el.click(); }, label, sel);
const has = (p, sel) => p.evaluate((s) => !!document.querySelector(s), sel);
const openShow = async (p, name) => { await tab(p, 'Shows'); await p.evaluate(() => { const a = document.querySelector('.sd-lstatus [role=tab]'); if (a) a.click(); }); await wait(250); await clickText(p, name, 'button.sd-ltile'); await wait(700); };
const back = async (p) => { await p.evaluate(() => [...document.querySelectorAll('button')].find((x) => /back/i.test(x.getAttribute('aria-label') || x.textContent)).click()); await wait(400); };
const toast = (p) => p.evaluate(() => { const t = document.querySelector('.sd-toast'); return t ? t.innerText.replace(/\s+/g, ' ').trim() : null; });
const show = async (p, id) => (await stored(p)).shows[id];

// =========================================================== 1. auto-resume
console.log('1. auto-resume (fake-cloud build)');
let p = await open(4179);
await openShow(p, 'Bravo Binge');
await ok('starts dropped (pill) with no toast', async () => { assert.equal(await has(p, '[data-testid=dropped-pill]'), true); assert.equal(await toast(p), null); });
const bigMark = (pg) => clickText(pg, 'Mark S01', 'button');
await bigMark(p); await wait(400);
await ok('marking the next episode on a dropped show resumes it: pill gone, store has dropped:false + null date', async () => {
  assert.equal(await has(p, '[data-testid=dropped-pill]'), false);
  const s2 = await show(p, 'tmdb:2'); assert.strictEqual(s2.dropped, false); assert.strictEqual(s2.droppedAt, null); assert.equal(Object.keys(s2.watched).length, 4);
});
await ok('an Undo toast says "Resumed · Bravo Binge"', async () => { assert.match(await toast(p), /^Resumed · Bravo Binge\s*Undo$/); });
await p.screenshot({ path: `${OUT}/resumed_toast_phone.png` });
await clickText(p, 'Undo', '.sd-toast button'); await wait(350);
await ok('Undo puts the show back to Dropped with its ORIGINAL date, keeps the episode, and removes the toast', async () => {
  const s2 = await show(p, 'tmdb:2'); assert.equal(s2.dropped, true); assert.equal(s2.droppedAt, DROPPED_AT); assert.equal(Object.keys(s2.watched).length, 4);
  assert.equal(await has(p, '[data-testid=dropped-pill]'), true); assert.equal(await toast(p), null);
});
await bigMark(p); await wait(300);
await ok('toast is there, then disappears by itself after ~6 s; the show stays resumed', async () => {
  assert.ok(await toast(p)); await wait(6400); assert.equal(await toast(p), null);
  assert.strictEqual((await show(p, 'tmdb:2')).dropped, false);
});
// ---- season rows (mocked TMDB season list)
await back(p);
await openShow(p, 'Delta Drop'); await wait(500);
await ok('episode rows load for a dropped show', async () => assert.ok(await has(p, 'button.sd-check')));
await clickText(p, 'Mark S1E1 unwatched', 'button.sd-check'); await wait(350);
await ok('UN-marking an episode does NOT resume (still dropped, no toast)', async () => {
  const s4 = await show(p, 'tmdb:4'); assert.equal(s4.dropped, true); assert.equal(s4.droppedAt, DROPPED_AT); assert.equal(Object.keys(s4.watched).length, 2); assert.equal(await toast(p), null);
});
await clickText(p, 'Mark S1E8 watched', 'button.sd-check'); await wait(350);
await ok('ticking an episode row resumes + toast', async () => { assert.strictEqual((await show(p, 'tmdb:4')).dropped, false); assert.match(await toast(p), /Resumed · Delta Drop/); });
await clickText(p, 'Undo', '.sd-toast button'); await wait(300);
await ok('Undo from an episode tick restores the date too', async () => { const s4 = await show(p, 'tmdb:4'); assert.equal(s4.dropped, true); assert.equal(s4.droppedAt, DROPPED_AT); });
await clickText(p, 'Log another watch of S1E2', 'button'); await wait(350);
await ok('"Log another watch" (a rewatch) resumes + toast, and counts the rewatch', async () => {
  const s4 = await show(p, 'tmdb:4'); assert.strictEqual(s4.dropped, false); assert.equal(s4.watched['1x2'].n, 2); assert.match(await toast(p), /Resumed · Delta Drop/);
});
await clickText(p, 'Undo', '.sd-toast button'); await wait(300);
await ok('Undo after a rewatch re-drops with the original date (the rewatch stays logged)', async () => { const s4 = await show(p, 'tmdb:4'); assert.equal(s4.dropped, true); assert.equal(s4.droppedAt, DROPPED_AT); assert.equal(s4.watched['1x2'].n, 2); });
await clickText(p, 'Mark season watched'); await wait(350); await clickText(p, 'Just now', '[role=dialog] button'); await wait(350);
await ok('"Mark season watched" resumes + toast', async () => { assert.strictEqual((await show(p, 'tmdb:4')).dropped, false); assert.ok(await toast(p)); });
await clickText(p, 'Unmark season'); await wait(350);
await ok('"Unmark season" never resumes a dropped show (re-drop it first to prove it)', async () => {
  await p.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === 'More actions').click()); await wait(300);
  await clickText(p, 'Drop this show'); await wait(350);
  assert.strictEqual((await show(p, 'tmdb:4')).dropped, true);
  await clickText(p, 'Mark season watched'); await wait(350); await clickText(p, 'Just now', '[role=dialog] button'); await wait(300); // resumes again…
  await p.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === 'More actions').click()); await wait(300);
  await clickText(p, 'Drop this show'); await wait(350);
  await clickText(p, 'Unmark season'); await wait(350);
  assert.strictEqual((await show(p, 'tmdb:4')).dropped, true, 'still dropped after Unmark season');
});
await p.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === 'More actions').click()); await wait(300);
await ok('the menu says "Resume watching" for a dropped show; using it resumes WITHOUT a toast', async () => {
  await clickText(p, 'Resume watching'); await wait(350);
  // (an earlier "Mark season watched" finished this ended show, so the separate "You finished" prompt may still be showing)
  assert.strictEqual((await show(p, 'tmdb:4')).dropped, false); const tt = await toast(p); assert.ok(!tt || !/Resumed/.test(tt), 'no Resumed toast: ' + tt);
});
await p.close();

// =========================================================== 2. Delete everywhere — UI
console.log('2. Delete everywhere (fake-cloud build, signed in)');
p = await open(4179);
await tab(p, 'Settings');
await ok('Danger zone offers BOTH "Delete all data" and "Delete everywhere" when signed in', async () => {
  const t = await text(p); assert.match(t, /Delete all data/); assert.match(t, /Delete everywhere/); assert.match(t, /every other device that is signed in/);
});
await p.evaluate(() => { const el = [...document.querySelectorAll('.sd-danger-everywhere')][0]; el.scrollIntoView(); });
await p.screenshot({ path: `${OUT}/danger_card_phone.png` });
await clickText(p, 'Delete everywhere', '.sd-danger-everywhere button'); await wait(500);
const dlg = (pg) => pg.evaluate(() => {
  const d = document.querySelector('[role=alertdialog]'); if (!d) return null;
  const btns = [...d.querySelectorAll('button')]; const del = btns.find((b) => /Delete everywhere|Deleting/.test(b.textContent)); const cancel = btns.find((b) => b.textContent.trim() === 'Cancel');
  const input = d.querySelector('input');
  return { delDisabled: del.disabled, delLabel: del.textContent.trim(), cancelDisabled: cancel.disabled, inputDisabled: input.disabled, focus: document.activeElement.textContent.trim(), text: d.innerText };
});
await ok('dialog explains what happens; Delete is DISABLED; Cancel has focus first', async () => {
  const d = await dlg(p); assert.ok(d); assert.equal(d.delDisabled, true); assert.equal(d.focus, 'Cancel');
  assert.match(d.text, /deleted from your cloud account/i); assert.match(d.text, /clear themselves the next time they open/); assert.match(d.text, /backup file will download first/); assert.match(d.text, /can’t be undone/);
});
await p.screenshot({ path: `${OUT}/wipe_dialog_phone.png` });
const typeIn = async (v) => { await p.evaluate(() => { const i = document.querySelector('[role=alertdialog] input'); i.focus(); }); await p.keyboard.down('Control'); await p.keyboard.press('KeyA'); await p.keyboard.up('Control'); await p.keyboard.press('Backspace'); if (v) await p.keyboard.type(v); await wait(150); };
for (const bad of ['DEL', 'DELETE ALL', 'delet', ' ']) {
  await typeIn(bad); await ok(`typing "${bad}" keeps Delete disabled`, async () => assert.equal((await dlg(p)).delDisabled, true));
}
await typeIn('delete'); await ok('typing lowercase "delete" enables it (iPhone autocapitalise either way)', async () => assert.equal((await dlg(p)).delDisabled, false));
await typeIn('DELETEX'); await ok('adding a character disables it again', async () => assert.equal((await dlg(p)).delDisabled, true));
await clickText(p, 'Cancel', '[role=alertdialog] button'); await wait(400);
await ok('Cancel closes the dialog and changes NOTHING (data intact, no downloads, no wipe call)', async () => {
  assert.equal(await has(p, '[role=alertdialog]'), false); assert.equal(Object.keys((await stored(p)).shows).length, 5);
  assert.deepEqual(await p.evaluate(() => window.__events), []);
});
// reopen: field must start empty (no leftover text)
await clickText(p, 'Delete everywhere', '.sd-danger-everywhere button'); await wait(400);
await ok('reopening starts with an empty field and a disabled button', async () => { const d = await dlg(p); assert.equal(d.delDisabled, true); assert.equal(await p.evaluate(() => document.querySelector('[role=alertdialog] input').value), ''); });
await clickText(p, 'Cancel', '[role=alertdialog] button'); await wait(300);

// ---- failure path
await p.evaluate(() => { window.__wipeFail = 'network down'; });
await clickText(p, 'Delete everywhere', '.sd-danger-everywhere button'); await wait(400); await typeIn('DELETE');
await clickText(p, 'Delete everywhere', '[role=alertdialog] button'); await wait(2200);
await ok('FAILURE: backup downloaded first, wipe attempted, error banner (with the reason), dialog closed, data untouched', async () => {
  const ev = await p.evaluate(() => window.__events);
  assert.deepEqual(ev, ['download:watchnext-backup-2026-10-02.json', 'wipe-start', 'wipe-failed']);
  const t = await text(p); assert.match(t, /Deleting did not finish \(network down\)/); assert.match(t, /backup file was downloaded/);
  assert.equal(await has(p, '[role=alertdialog]'), false); assert.equal(Object.keys((await stored(p)).shows).length, 5); assert.equal((await stored(p)).movies.length, 1);
  assert.equal(await p.evaluate(() => !!document.querySelector('.sd-banner.err')), true);
});

// ---- success path (slow, so the busy state can be observed)
await p.evaluate(() => { window.__wipeFail = null; window.__wipeDelay = 1800; window.__events = []; });
await clickText(p, 'Delete everywhere', '.sd-danger-everywhere button'); await wait(400); await typeIn('DELETE');
await clickText(p, 'Delete everywhere', '[role=alertdialog] button'); await wait(300);
await ok('BUSY: button says "Deleting…" and is disabled; Cancel + the field are disabled; Escape does not close it', async () => {
  const d = await dlg(p); assert.equal(d.delLabel, 'Deleting…'); assert.equal(d.delDisabled, true); assert.equal(d.cancelDisabled, true); assert.equal(d.inputDisabled, true);
  await p.keyboard.press('Escape'); await wait(200); assert.ok(await dlg(p), 'still open');
});
await wait(2600);
await ok('SUCCESS: backup is downloaded BEFORE the wipe starts, in that order', async () => {
  const ev = await p.evaluate(() => window.__events); assert.deepEqual(ev, ['download:watchnext-backup-2026-10-02.json', 'wipe-start', 'wipe-done']);
});
await ok('the automatic backup before Delete everywhere counts as a backup (the reminder record is stamped)', async () => {
  const m = await p.evaluate(() => JSON.parse(localStorage.getItem('watchnext-backup-v1') || 'null')); assert.ok(m && m.lastAt && Math.abs(Date.parse(m.lastAt) - Date.parse('2026-10-01T22:00:00.000Z')) < 60000, JSON.stringify(m)); const dl = (await p.evaluate(() => window.__dl)).find((x) => x.name.endsWith('.json')); const j = JSON.parse(Buffer.from(dl.bytes).toString('utf8'));
  const inFile = Object.keys(j.shows).length + Object.values(j.shows).reduce((a, s) => a + Object.keys(s.watched || {}).length, 0) + j.movies.length; assert.equal(m.lastCount, inFile, 'library size recorded = what the backup file actually holds');
});
await ok('the downloaded backup really contains the data (5 shows, the movie) and no TMDB key', async () => {
  const d = (await p.evaluate(() => window.__dl)).find((x) => x.name.endsWith('.json')); const j = JSON.parse(Buffer.from(d.bytes).toString('utf8'));
  assert.equal(Object.keys(j.shows).length, 5); assert.equal(j.movies.length, 1); assert.ok(j.shows['tmdb:2'].dropped === true || j.shows['tmdb:2'].dropped === false); assert.equal(j.settings.tmdbKey, undefined);
});
await ok('device is empty afterwards: no shows, no movies, TMDB key removed, tombstones remembered, dialog closed', async () => {
  const st = await stored(p); assert.deepEqual(st.shows, {}); assert.deepEqual(st.movies, []); assert.deepEqual(st.goals, {}, 'yearly goals are wiped too'); assert.equal(st.settings.tmdbKey, '');
  const tomb = await p.evaluate(() => JSON.parse(localStorage.getItem('watchnext-tombstones-v1') || '[]')); for (const id of ['tmdb:1', 'tmdb:2', 'tmdb:3', 'tmdb:4', 'tmdb:5']) assert.ok(tomb.includes(id), id);
  assert.equal(await has(p, '[role=alertdialog]'), false);
});
await ok('success banner states what happened; the TMDB key box is cleared', async () => {
  const t = await text(p); assert.match(t, /Everything was deleted: 5 shows and all movies/); assert.match(t, /other devices will clear the next time they open/i);
  assert.equal(await p.evaluate(() => (document.querySelector('input[aria-label="TMDB v3 API key"]') || {}).value), '');
});
await p.screenshot({ path: `${OUT}/after_wipe_phone.png`, fullPage: true });
await tab(p, 'Shows');
await ok('Shows tab is the brand-new-library empty state', async () => { const t = await text(p); assert.doesNotMatch(t, /Alpha Airing|Bravo Binge/); });
await p.close();

// desktop look of the dialog
p = await open(4179, { w: 1280, h: 900 });
await tab(p, 'Settings'); await clickText(p, 'Delete everywhere', '.sd-danger-everywhere button'); await wait(500); await typeIn('DELETE');
await p.screenshot({ path: `${OUT}/wipe_dialog_desktop.png` });
await p.close();

// =========================================================== 3. signed OUT (real build): the new button must not appear
console.log('3. signed out (real build)');
p = await open(4180);
await tab(p, 'Settings');
await ok('signed out: Delete all data is there, "Delete everywhere" is NOT', async () => { const t = await text(p); assert.match(t, /Delete all data/); assert.doesNotMatch(t, /Delete everywhere/); });
await p.close();

console.log(`\n${checks} checks passed`);
console.log('PROBLEMS:', problems.length ? '\n' + problems.join('\n') : 'none');
await browser.close(); FAKE.close(); REAL.close();
