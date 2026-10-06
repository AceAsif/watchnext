import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

const OUT = '/home/claude/shot/out7';
fs.mkdirSync(OUT, { recursive: true });
const fontsCss = fs.readFileSync('/home/claude/shot/fonts.css', 'utf8');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
const DIST = '/home/claude/wl/dist';
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

fs.mkdirSync('/home/claude/shot/tmp', { recursive: true });
const wf = (name, obj) => { const p = `/home/claude/shot/tmp/${name}`; fs.writeFileSync(p, typeof obj === 'string' ? obj : JSON.stringify(obj)); return p; };
const GOOD = wf('good.json', { source: 'tvtime', shows: [
  { tvdbId: 777001, name: 'Imported One', followed: true, watches: [{ season: 1, episode: 1, watchedAt: '2020-01-01T10:00:00Z', runtimeMin: 40, rewatch: false }, { season: 1, episode: 2, watchedAt: '2020-01-02T10:00:00Z', runtimeMin: 40, rewatch: false }, { season: 1, episode: 3, watchedAt: '2020-01-03T10:00:00Z', runtimeMin: 40, rewatch: false }] },
  { tvdbId: 777002, name: 'Imported Two', followed: true, watches: [{ season: 1, episode: 1, watchedAt: '2021-01-01T10:00:00Z', runtimeMin: 40, rewatch: false }, { season: 1, episode: 2, watchedAt: '2021-01-02T10:00:00Z', runtimeMin: 40, rewatch: false }] },
], movies: [] });
const BADJSON = wf('bad.json', '{ this is not json');
const WRONG = wf('wrong.json', { hello: 'world' });

const browser = await puppeteer.launch({ args: chromium.args, executablePath: await chromium.executablePath(), headless: 'shell' });
const problems = [];
const wait = (ms = 250) => new Promise((r) => setTimeout(r, ms));
async function open({ w = 390, h = 844, state = STATE() } = {}) {
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
  await page.evaluateOnNewDocument((s, fixed) => {
    if (!sessionStorage.getItem('__seeded')) { localStorage.setItem('watchnext-state-v1', JSON.stringify(s)); sessionStorage.setItem('__seeded', '1'); }
    const RD = Date; const start = RD.now(); const b = RD.parse(fixed);
    class FD extends RD { constructor(...a) { if (a.length === 0) super(b + (RD.now() - start)); else super(...a); } static now() { return b + (RD.now() - start); } }
    window.Date = FD;
    // capture downloads instead of performing them
    const orig = URL.createObjectURL; URL.createObjectURL = (blob) => { window.__blob = blob; return orig.call(URL, blob); };
    HTMLAnchorElement.prototype.click = function () { window.__download = this.download; };
  }, state, FIXED_ISO);
  await page.goto(BASE + '/', { waitUntil: 'networkidle0' });
  await wait(300);
  await page.evaluate(() => [...document.querySelectorAll('nav.tabbar button')].find((b) => b.textContent.includes('Settings')).click());
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

// ============================================================ 1. structure
console.log('1. STRUCTURE (phone 390px)');
let p = await open();
const heads = await p.evaluate(() => [...document.querySelectorAll('.sd-setcard h2')].map((h) => h.textContent));
ok('cards in the designed order: Sync, TMDB key, Import, Clean up, Backup, then the Danger zone', () => assert.deepEqual(heads, ['Sync across devices', 'TMDB API key', 'My services', 'Import TV Time history', 'Clean up shows', 'Backup', 'Export for Power BI', 'Delete all data']));
assert.equal(await p.evaluate(() => { const c = [...document.querySelectorAll('.sd-setcard')]; return c[c.length - 1].classList.contains('danger') && c.filter((x) => x.classList.contains('danger')).length; }), 1); checks++; console.log('  PASS exactly one danger card, and it is last');
const sync = await p.evaluate(() => document.querySelector('.sd-setcard').textContent);
ok('Sync (signed out, cloud configured in this build): offers "Sign in with Google" and shows no invented "Syncing"/"Local only" label', () => { assert.match(sync, /Sign in with Google/); assert.doesNotMatch(sync, /Syncing|Local only/); });
assert.ok(await noOverflow(p)); checks++; console.log('  PASS no horizontal overflow');
const small = await p.evaluate(() => [...document.querySelectorAll('.sd-setbtn, .sd-setlink, .cp')].filter((e) => e.getBoundingClientRect().height < 43.5).map((e) => e.textContent.trim()));
ok('every button and link is at least 44px tall (touch targets)', () => assert.deepEqual(small, []));
const src = fs.readFileSync('/home/claude/wl/src/pages/Settings.jsx', 'utf8') + fs.readFileSync('/home/claude/wl/src/components/SettingsCards.jsx', 'utf8');
ok('the Settings code no longer calls the browser popups confirm() or alert()', () => assert.doesNotMatch(src, /(^|[^.\w])(confirm|alert)\(/m));
await shot(p, '01_settings_phone');
await p.close();

// ============================================================ 2. TMDB key
console.log('2. TMDB KEY');
p = await open();
let k = await p.evaluate(() => ({ pill: !!document.querySelector('.sd-pill.teal'), saved: document.querySelector('.sd-keyfield').classList.contains('saved'), btn: document.querySelector('.sd-keyrow button').disabled, type: document.querySelector('.sd-keyfield input').type }));
ok('empty: masked password field, no pill, Save disabled', () => assert.deepEqual(k, { pill: false, saved: false, btn: true, type: 'password' }));
await p.click('.sd-keyfield input'); await p.keyboard.type(`  ${SECRET}  `, { delay: 2 });
k = await p.evaluate(() => ({ btn: document.querySelector('.sd-keyrow button').disabled }));
ok('typing enables Save', () => assert.equal(k.btn, false));
await p.keyboard.press('Enter'); await wait(300);
let st = await stored(p); const b1 = await banner(p);
ok('Enter submits: key saved TRIMMED, banner "TMDB key saved…" (role=status, not an error)', () => { assert.equal(st.settings.tmdbKey, SECRET); assert.equal(b1.text, 'TMDB key saved. It stays in this browser only.'); assert.equal(b1.role, 'status'); assert.equal(b1.err, false); });
k = await p.evaluate(() => ({ pill: (document.querySelector('.sd-pill.teal') || {}).textContent, saved: document.querySelector('.sd-keyfield').classList.contains('saved'), btn: document.querySelector('.sd-keyrow button').disabled, val: document.querySelector('.sd-keyfield input').value }));
ok('now "Key saved" pill, teal-outlined field, Save disabled, and the box shows the trimmed key (masked)', () => { assert.equal(k.pill, 'Key saved'); assert.equal(k.saved, true); assert.equal(k.btn, true); assert.equal(k.val, SECRET); });
await shot(p, '02_key_saved');
await p.evaluate(() => document.querySelector('.sd-keyfield input').select()); await p.keyboard.press('Backspace'); await wait(150);
assert.equal(await p.evaluate(() => document.querySelector('.sd-keyrow button').disabled), false); checks++; console.log('  PASS clearing enables Save');
await p.keyboard.press('Enter'); await wait(250);
assert.equal((await stored(p)).settings.tmdbKey, ''); assert.equal((await banner(p)).text, 'TMDB key removed.'); checks++; console.log('  PASS key removed + banner');
await p.close();

// ============================================================ 3. import
console.log('3. IMPORT');
p = await open();
await p.evaluate(() => { window.__copied = null; Object.defineProperty(navigator, 'clipboard', { value: { writeText: async (t) => { window.__copied = t; } }, configurable: true }); });
await click(p, '.cp', 'Copy'); await wait(200);
let cp = await p.evaluate(() => ({ copied: window.__copied, label: document.querySelector('.cp').textContent.trim() }));
ok('Copy puts the exact convert command on the clipboard and the button says "Copied"', () => { assert.equal(cp.copied, CMD); assert.equal(cp.label, 'Copied'); });
await wait(2200);
assert.equal(await p.evaluate(() => document.querySelector('.cp').textContent.trim()), 'Copy'); checks++; console.log('  PASS "Copied" resets to "Copy" after 2 seconds');
await p.evaluate(() => { Object.defineProperty(navigator, 'clipboard', { value: { writeText: async () => { throw new Error('denied'); } }, configurable: true }); });
await click(p, '.cp', 'Copy'); await wait(250);
let bn = await banner(p);
ok('if copying is blocked: a clear error banner, not a silent failure', () => { assert.match(bn.text, /Couldn’t copy automatically/); assert.equal(bn.err, true); assert.equal(bn.role, 'alert'); });
const before = await stored(p); const watchBefore = Object.values(before.shows).reduce((s, x) => s + Object.keys(x.watched || {}).length, 0);
const fi = await p.$('input[type=file]'); await fi.uploadFile(GOOD); await wait(600);
const after = await stored(p); const watchAfter = Object.values(after.shows).reduce((s, x) => s + Object.keys(x.watched || {}).length, 0);
bn = await banner(p);
ok('a good file: banner shows the REAL counts (2 shows, 5 new watches) and points at Tools on the Shows tab', () => { assert.match(bn.text, /^Imported 2 shows and 5 new episode watches\./); assert.match(bn.text, /Tools on the Shows tab/); assert.equal(bn.err, false); assert.doesNotMatch(bn.text, /Sync with TMDB"/); });
ok(`…and the data really changed to match (watches ${watchBefore} -> ${watchAfter}, +5)`, () => assert.equal(watchAfter - watchBefore, 5));
await shot(p, '03_import_success', false);
await fi.uploadFile(BADJSON); await wait(500); bn = await banner(p);
ok('an unreadable file: red "Import failed: …" banner (role=alert)', () => { assert.match(bn.text, /^Import failed: /); assert.equal(bn.err, true); assert.equal(bn.role, 'alert'); });
await fi.uploadFile(WRONG); await wait(500); bn = await banner(p);
ok('valid JSON that is not a WatchNext file: "That file does not look like a WatchNext import."', () => assert.match(bn.text, /does not look like a WatchNext import/));
assert.deepEqual((await stored(p)).shows && Object.keys((await stored(p)).shows).length, Object.keys(after.shows).length); checks++; console.log('  PASS the failed imports changed nothing');
await p.click('.sd-banner .x'); await wait(150);
assert.equal(await banner(p), null); checks++; console.log('  PASS the banner can be dismissed');
await p.close();

// ============================================================ 4. clean up + confirm
console.log('4. CLEAN UP and the confirm dialog');
p = await open();
const rows = await p.evaluate(() => ({ pill: document.querySelector('#cleanup .sd-pill').textContent, items: [...document.querySelectorAll('.sd-orphs li')].map((li) => [li.querySelector('.nm').textContent, li.querySelector('.mt').textContent]) }));
ok('three leftovers, sorted by name, with "60 watched" / "no history" and a "3 left over" pill', () => { assert.equal(rows.pill, '3 left over'); assert.deepEqual(rows.items, [['Baki the Grappler', 'no history'], ['Beelzebub', '60 watched'], ['Black Jack (2004)', 'no history']]); });
ok('shows that are followed or on the watchlist are NOT offered for deletion', () => assert.ok(!rows.items.some((r) => r[0] === 'Suits' || r[0] === 'Wishlist Show')));
await p.click('button[aria-label="Delete Beelzebub"]'); await wait(350);
let dlg = await p.evaluate(() => { const d = document.querySelector('[role=alertdialog]'); return d && { label: d.getAttribute('aria-label'), name: d.querySelector('.sd-confirm-show .nm').textContent, effects: [...d.querySelectorAll('.sd-effects li')].map((x) => x.textContent), undo: d.querySelector('.sd-undo').textContent, focus: document.activeElement.textContent, bottom: Math.round(d.getBoundingClientRect().bottom), vh: innerHeight, btns: [...d.querySelectorAll('.sd-confirm-acts button')].map((b) => b.textContent) }; });
ok('a real alert dialog opens (not a browser popup): "Delete this show?", the show, and what will happen', () => { assert.equal(dlg.label, 'Delete this show?'); assert.equal(dlg.name, 'Beelzebub'); assert.deepEqual(dlg.effects, ['Its 60 watched episodes are deleted too', 'Removed from this device', 'Also removed from the cloud and your other signed-in devices']); assert.equal(dlg.undo, 'This can’t be undone.'); });
ok('SAFE DEFAULT: focus starts on "Cancel", so a stray Enter cannot delete anything', () => assert.equal(dlg.focus, 'Cancel'));
ok('phone: it is a bottom sheet touching the bottom edge, with Delete above Cancel', () => { assert.ok(Math.abs(dlg.bottom - dlg.vh) <= 2); assert.deepEqual(dlg.btns, ['Delete show', 'Cancel']); });
await shot(p, '04_confirm_show_phone', false);
await p.keyboard.press('Escape'); await wait(250);
assert.equal(await p.evaluate(() => !document.querySelector('[role=alertdialog]')), true); assert.ok((await stored(p)).shows['tmdb:3']); checks++; console.log('  PASS Escape cancels and nothing is deleted');
assert.match(await p.evaluate(() => document.activeElement.getAttribute('aria-label') || ''), /Delete Beelzebub/); checks++; console.log('  PASS focus returns to the Delete button that opened it');
await p.click('button[aria-label="Delete Beelzebub"]'); await wait(300); await click(p, '.sd-confirm-acts button', 'Cancel'); await wait(250);
assert.ok((await stored(p)).shows['tmdb:3']); checks++; console.log('  PASS the Cancel button cancels');
await p.click('button[aria-label="Delete Beelzebub"]'); await wait(300); await click(p, '.sd-confirm-acts button', 'Delete show'); await wait(400);
st = await stored(p); bn = await banner(p);
ok('confirming deletes exactly that show (others untouched) and says "Deleted “Beelzebub”."', () => { assert.equal(st.shows['tmdb:3'], undefined); assert.ok(st.shows['tmdb:4'] && st.shows['tmdb:5'] && st.shows['tmdb:1']); assert.equal(bn.text, 'Deleted “Beelzebub”.'); });
assert.equal(await p.evaluate(() => document.querySelectorAll('.sd-orphs li').length), 2); checks++; console.log('  PASS the list now has 2 leftovers');
for (const id of ['Black Jack (2004)', 'Baki the Grappler']) { await p.click(`button[aria-label="Delete ${id}"]`); await wait(250); await click(p, '.sd-confirm-acts button', 'Delete show'); await wait(300); }
assert.equal(await p.evaluate(() => !document.querySelector('#cleanup')), true); checks++; console.log('  PASS when the last leftover is gone the whole Clean up card disappears');
await p.close();

// ============================================================ 5. backup
console.log('5. BACKUP');
p = await open({ state: { ...STATE(), settings: { tmdbKey: SECRET } } });
await click(p, '.sd-setbtn', 'Download backup'); await wait(400);
const dl = await p.evaluate(async () => ({ name: window.__download, body: window.__blob ? await window.__blob.text() : null, type: window.__blob && window.__blob.type }));
ok('downloads "watchnext-backup-2026-10-02.json" (the LOCAL date) as JSON', () => { assert.equal(dl.name, 'watchnext-backup-2026-10-02.json'); assert.equal(dl.type, 'application/json'); });
const parsed = JSON.parse(dl.body);
ok('THE FIX: the backup file does NOT contain the TMDB key — not as a field and not anywhere in the text', () => { assert.ok(!dl.body.includes(SECRET)); assert.ok(!('tmdbKey' in (parsed.settings || {}))); });
ok('…while keeping all your data (5 shows, 1 movie)', () => { assert.equal(Object.keys(parsed.shows).length, 5); assert.equal(parsed.movies.length, 1); assert.equal(Object.keys(parsed.shows['tmdb:3'] ? parsed.shows['tmdb:3'].watched : {}).length, 60); });
assert.equal((await stored(p)).settings.tmdbKey, SECRET); checks++; console.log('  PASS live key still saved');
assert.match((await banner(p)).text, /Backup downloaded\. Your TMDB key is not included/); checks++; console.log('  PASS confirmation banner mentions the key is left out');
await p.close();

// ============================================================ 6. delete all
console.log('6. DELETE ALL DATA');
p = await open({ state: { ...STATE(), settings: { tmdbKey: SECRET } } });
const dz = await p.evaluate(() => document.querySelector('.sd-setcard.danger').textContent);
ok('Danger zone copy is honest: "from this device" and NO claim that the cloud is cleared', () => { assert.match(dz, /from this device/); assert.doesNotMatch(dz, /cloud copy and your other devices are cleared/i); });
await p.click('.sd-setcard.danger .sd-setbtn'); await wait(350);
dlg = await p.evaluate(() => { const d = document.querySelector('[role=alertdialog]'); return { label: d.getAttribute('aria-label'), effects: [...d.querySelectorAll('.sd-effects li')].map((x) => x.textContent), focus: document.activeElement.textContent, confirm: d.querySelector('.solid-danger').textContent }; });
ok('dialog says it is THIS DEVICE and lists the consequences (data + TMDB key), nothing about the cloud when signed out', () => { assert.equal(dlg.label, 'Delete all data on this device?'); assert.equal(dlg.effects.length, 2); assert.match(dlg.effects[0], /removed from this browser/); assert.match(dlg.effects[1], /TMDB key on this device is removed/); assert.equal(dlg.confirm, 'Delete all data'); assert.equal(dlg.focus, 'Cancel'); });
await shot(p, '05_confirm_all_phone', false);
await click(p, '.sd-confirm-acts button', 'Cancel'); await wait(250);
assert.equal(Object.keys((await stored(p)).shows).length, 5); checks++; console.log('  PASS Cancel keeps everything');
await p.click('.sd-setcard.danger .sd-setbtn'); await wait(300); await click(p, '.sd-confirm-acts button', 'Delete all data'); await wait(400);
st = await stored(p);
ok('confirming clears shows, movies AND the key on this device', () => { assert.deepEqual(Object.keys(st.shows), []); assert.deepEqual(st.movies, []); assert.equal(st.settings.tmdbKey, ''); });
assert.equal(await p.evaluate(() => document.querySelector('.sd-keyfield input').value), ''); assert.equal((await banner(p)).text, 'All data on this device was deleted.'); checks++; console.log('  PASS box emptied + banner');
assert.equal(await p.evaluate(() => !document.querySelector('#cleanup')), true); checks++; console.log('  PASS the Clean up card is gone too');
await p.close();

// ============================================================ 7. desktop
console.log('7. DESKTOP (1280px)');
p = await open({ w: 1280, h: 800 });
const dsk = await p.evaluate(() => { const pg = document.querySelector('.sd-setpage').getBoundingClientRect(); const kr = document.querySelector('.sd-keyrow'); const f = kr.querySelector('.sd-keyfield').getBoundingClientRect(), b = kr.querySelector('button').getBoundingClientRect(); const d = document.querySelector('.sd-danger-body'); const dt = d.querySelector('.txt').getBoundingClientRect(), db = d.querySelector('button').getBoundingClientRect(); return { w: Math.round(pg.width), centred: Math.abs((pg.left + pg.width / 2) - innerWidth / 2) < 2, keyRow: Math.abs((f.top + f.height / 2) - (b.top + b.height / 2)) < 4, dangerRow: db.left > dt.right && Math.abs((dt.top + dt.height / 2) - (db.top + db.height / 2)) < 30, logoLeft: Math.round(document.querySelector('.masthead h1').getBoundingClientRect().left) }; });
ok('Direction A: one centred 640px column', () => { assert.equal(dsk.w, 640); assert.ok(dsk.centred); });
ok('desktop: the key field and Save sit on ONE row; the danger text and its button sit side by side', () => { assert.ok(dsk.keyRow); assert.ok(dsk.dangerRow); });
assert.ok(await noOverflow(p)); checks++; console.log('  PASS no horizontal overflow');
await shot(p, '06_settings_desktop');
await p.click('button[aria-label="Delete Beelzebub"]'); await wait(350);
const dd = await p.evaluate(() => { const d = document.querySelector('[role=alertdialog]').getBoundingClientRect(); const bs = [...document.querySelectorAll('.sd-confirm-acts button')].map((b) => ({ t: b.textContent, x: b.getBoundingClientRect().left })); return { w: Math.round(d.width), centred: Math.abs((d.left + d.width / 2) - innerWidth / 2) < 3, mid: d.top > 40 && d.bottom < innerHeight - 40, order: bs.sort((a, b) => a.x - b.x).map((b) => b.t) }; });
ok('desktop confirm: a centred 480px dialog (not a bottom sheet), Cancel on the left and the red Delete on the right', () => { assert.equal(dd.w, 480); assert.ok(dd.centred && dd.mid); assert.deepEqual(dd.order, ['Cancel', 'Delete show']); });
await shot(p, '07_confirm_show_desktop', false);
await p.keyboard.press('Escape'); await p.close();

await browser.close(); server.close();
console.log(`\n${checks} checks passed`);
console.log('PROBLEMS:', problems.length ? '\n' + [...new Set(problems)].join('\n') : 'none');
