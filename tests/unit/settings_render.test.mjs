import assert from 'node:assert/strict';
import { build } from 'esbuild';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { repoPath, workPath } from '../paths.mjs';
// esbuild accepts forward slashes on every OS, and the generated entry file lives in the scratch folder
const fwd = (p) => p.replace(/\\/g, '/');
const ENTRY = workPath('tmp', 'entry.jsx'), OUTFILE = workPath('tmp', 'out.cjs');
fs.writeFileSync(ENTRY, `
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
export { React, renderToStaticMarkup };
export * from '${fwd(repoPath('src/components/SettingsCards.jsx'))}';
export { PLATFORMS, platformById, providerToPlatform } from '${fwd(repoPath('src/components/PlatformPicker.jsx'))}';
`);
await build({ entryPoints: [ENTRY], bundle: true, platform: 'node', format: 'cjs', outfile: OUTFILE,
  loader: { '.css': 'empty', '.jsx': 'jsx' }, nodePaths: [repoPath('node_modules')], logLevel: 'error' });
const M = createRequire(import.meta.url)(OUTFILE);
const h = (el) => M.renderToStaticMarkup(el);
const R = M.React.createElement;
let n = 0; const t = (name, fn) => { fn(); n++; console.log('ok  -', name); };
const noop = () => {};

t('Sync: NOT SET UP — explains the README/backup route, offers no sign-in button', () => {
  const s = h(R(M.SyncCard, { available: false, user: null }));
  assert.match(s, /isn’t configured for this deployment/); assert.match(s, /backup file below/); assert.doesNotMatch(s, /<button/);
});
t('Sync: SIGNED OUT — "Sign in with Google" (amber primary)', () => {
  const s = h(R(M.SyncCard, { available: true, user: null, busy: false, onSignIn: noop }));
  assert.match(s, /Sign in with Google/); assert.match(s, /sd-setbtn primary/); assert.doesNotMatch(s, /disabled/);
});
t('Sync: OPENING SIGN-IN — "Opening sign-in…" and the button is disabled (no double clicks)', () => {
  const s = h(R(M.SyncCard, { available: true, user: null, busy: true, onSignIn: noop }));
  assert.match(s, /Opening sign-in…/); assert.match(s, /disabled/);
});
t('Sync: SIGNED IN — email + initial avatar + Sign out; the invented "Syncing"/"Local only" labels are NOT there', () => {
  const s = h(R(M.SyncCard, { available: true, user: { email: 'asif@example.com' }, onSignOut: noop }));
  assert.match(s, /Signed in as/); assert.match(s, /asif@example\.com/); assert.match(s, /class="av"[^>]*>A</); assert.match(s, /Sign out/);
  assert.doesNotMatch(s, /Syncing|Local only/); assert.match(s, /within a few seconds/);
});
t('Sync: available=false wins even if a user object exists (cloud not built in)', () => {
  const s = h(R(M.SyncCard, { available: false, user: { email: 'x@y.z' } })); assert.doesNotMatch(s, /Signed in as/);
});
t('TMDB key: EMPTY — no pill, Save disabled; UNSAVED — Save enabled; SAVED — "Key saved" pill, teal field, Save disabled', () => {
  const e = h(R(M.KeyCard, { status: 'empty', value: '', onChange: noop, onSave: noop }));
  assert.doesNotMatch(e, /Key saved/); assert.match(e, /<button type="submit" class="sd-setbtn" disabled/);
  const u = h(R(M.KeyCard, { status: 'unsaved', value: 'abc', onChange: noop, onSave: noop }));
  assert.doesNotMatch(u, /Key saved/); assert.doesNotMatch(u, /type="submit"[^>]*disabled/);
  const s = h(R(M.KeyCard, { status: 'saved', value: 'abc', onChange: noop, onSave: noop }));
  assert.match(s, /Key saved/); assert.match(s, /sd-keyfield saved/); assert.match(s, /type="submit"[^>]*disabled/);
});
t('TMDB key: field is a masked password input, links to where to get a key, says it is stored only in this browser AND left out of backups', () => {
  const s = h(R(M.KeyCard, { status: 'empty', value: '', onChange: noop, onSave: noop }));
  assert.match(s, /type="password"/); assert.match(s, /autoComplete="off"|autocomplete="off"/i); assert.match(s, /href="https:\/\/www\.themoviedb\.org\/settings\/api"/); assert.match(s, /rel="noreferrer"/);
  assert.match(s, /Stored only in this browser, and left out of backup files/);
});
t('Import: two steps, a copyable command (python highlighted), and the "never deletes" note', () => {
  const s = h(R(M.ImportCard, { command: 'python tools/convert_tvtime.py gdpr-data.zip -o tvtime_import.json', copied: false, onCopy: noop, onChoose: noop, fileRef: { current: null }, onFile: noop }));
  assert.match(s, />1</); assert.match(s, />2</); assert.match(s, /class="py">python</); assert.match(s, /tools\/convert_tvtime\.py gdpr-data\.zip -o tvtime_import\.json/);
  assert.match(s, /Importing merges with what you already track\. It never deletes anything\./); assert.match(s, /Copy</);
  assert.match(h(R(M.ImportCard, { command: 'python x', copied: true, onCopy: noop, onChoose: noop, fileRef: { current: null }, onFile: noop })), /Copied</);
});
t('Clean up: renders NOTHING when there are no leftovers', () => assert.equal(h(R(M.CleanupCard, { rows: [], onAskDelete: noop })), ''));
t('Clean up: count pill, names, "N watched" / italic "no history", a Delete button per row labelled with the show', () => {
  const rows = [['a', { name: 'Beelzebub' }, 60], ['b', { name: 'Black Jack (2004)' }, 0], ['c', { name: 'Baki the Grappler' }, 0], ['d', { name: 'X' }, 1]];
  const s = h(R(M.CleanupCard, { rows, onAskDelete: noop }));
  assert.match(s, /4 left over/); assert.match(s, /60 watched/); assert.match(s, /mt none">no history</); assert.match(s, /aria-label="Delete Beelzebub"/); assert.equal((s.match(/aria-label="Delete /g) || []).length, 4);
  assert.match(s, /These 4 shows are in your data/); assert.match(s, /including from the cloud and your other devices/);
});
t('Backup: says the key is not in the file, offers Download AND Restore, and the copy is true ("restored here")', () => {
  const s = h(R(M.BackupCard, { onDownload: noop, onRestore: noop, restoreRef: { current: null }, onRestoreFile: noop }));
  assert.match(s, /Your TMDB key is not included in the file/); assert.match(s, /Download backup/); assert.match(s, /Restore from backup/);
  assert.match(s, /A backup file can be restored here, on any device\./); assert.doesNotMatch(s, /re-imported/); assert.match(s, /never deletes or overwrites what you already have/);
  assert.match(s, /accept="application\/json"/);
});
t('PLATFORMS: Cinema exists once, sits between YouTube and Other, is yellow with dark text, and is never auto-detected from a streaming provider', () => {
  const ids = M.PLATFORMS.map((p) => p.id); assert.equal(new Set(ids).size, ids.length); assert.equal(ids.filter((i) => i === 'cinema').length, 1);
  assert.equal(ids[ids.indexOf('cinema') - 1], 'youtube'); assert.equal(ids[ids.indexOf('cinema') + 1], 'other');
  const c = M.platformById('cinema'); assert.deepEqual([c.label, c.color, c.dark], ['Cinema', '#F5C518', true]);
  assert.equal(new Set(M.PLATFORMS.map((p) => p.color.toLowerCase())).size, M.PLATFORMS.length, 'every platform has its own colour');
  for (const name of ['Netflix', 'Disney Plus', 'Amazon Prime Video', 'Apple TV Plus', 'Crunchyroll', 'Stan', 'Binge', 'ABC iview', 'Hulu', 'YouTube', 'Max', 'Paramount+', 'Cinema', 'Theatre']) assert.notEqual(M.providerToPlatform(name), 'cinema', name);
  assert.equal(M.platformById('nope'), null);
});
t('Danger zone: signed OUT mentions no cloud; signed IN says the cloud copy is NOT deleted and may sync back', () => {
  const out = h(R(M.DangerCard, { signedIn: false, onAsk: noop })), inn = h(R(M.DangerCard, { signedIn: true, onAsk: noop }));
  assert.doesNotMatch(out, /cloud/i); assert.match(out, /from this device/); assert.match(inn, /cloud copy is NOT deleted and may sync back/);
  assert.doesNotMatch(out + inn, /cleared too|other devices are cleared/i);
});
t('Banner: success = role=status, error = role=alert; nothing when there is no message', () => {
  assert.equal(h(R(M.Banner, { msg: null })), '');
  assert.match(h(R(M.Banner, { msg: { text: 'Saved', kind: 'ok' }, onClose: noop })), /role="status"/);
  const e = h(R(M.Banner, { msg: { text: 'Import failed: x', kind: 'err' }, onClose: noop })); assert.match(e, /role="alert"/); assert.match(e, /sd-banner err/); assert.match(e, /aria-label="Dismiss message"/);
});
console.log(`\n${n} settings render tests passed`);
