import assert from 'node:assert/strict';
import { HELP_SECTIONS } from '../../src/components/helpContent.js';
import { searchHelp, countItems, norm, itemKey } from '../../src/components/helpLogic.js';
import { SHORTCUT_LIST } from '../../src/components/keyboardShortcutsLogic.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('ok  -', name); };
const total = HELP_SECTIONS.reduce((s, x) => s + x.items.length, 0);
const keysExtra = (item) => (item.keys ? SHORTCUT_LIST.map((s) => `${s.label} ${s.keys.join(' ')}`).join(' ') : '');

t('every section and entry has an id, a title/question and some text', () => {
  for (const s of HELP_SECTIONS) {
    assert.ok(s.id && s.title && s.items.length, s.id);
    for (const it of s.items) {
      assert.ok(it.id && it.q, `${s.id}/${it.id}`);
      assert.ok((it.a && it.a.length) || (it.steps && it.steps.length), `${s.id}/${it.id} has no text`);
      for (const line of [...(it.a || []), ...(it.steps || [])]) assert.equal(typeof line, 'string');
    }
  }
});
t('ids are unique (they are used to open answers)', () => {
  const ids = HELP_SECTIONS.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length);
  const keys = HELP_SECTIONS.flatMap((s) => s.items.map((i) => itemKey(s, i)));
  assert.equal(new Set(keys).size, keys.length);
});
t('the agreed sections are all there, in order', () => {
  assert.deepEqual(HELP_SECTIONS.map((s) => s.title), [
    'Getting started', 'Shows & episodes', 'Movies', 'Finding what to watch', 'Stats & badges', 'Shortcuts', 'Sync, backup & your data', 'Problems & FAQ',
  ]);
});
t('answers stay short (plain and readable on a phone)', () => {
  for (const s of HELP_SECTIONS) for (const it of s.items) {
    for (const p of it.a || []) assert.ok(p.length <= 320, `${it.id}: ${p.length} chars`);
    assert.ok((it.a || []).length <= 3, it.id);
  }
});
t('the shortcuts entry shows the shared keyboard list', () => {
  const keys = HELP_SECTIONS.find((s) => s.id === 'shortcuts').items.find((i) => i.keys);
  assert.ok(keys, 'an entry with keys: true');
});
t('the warning about "Clear site data" is in the FAQ', () => {
  const faq = HELP_SECTIONS.find((s) => s.id === 'faq');
  assert.ok(faq.items.some((i) => /clear site data/i.test(i.q) && /erases/i.test(i.a.join(' '))));
});
t('friends are told they do not need a TMDB key', () => {
  const r = searchHelp(HELP_SECTIONS, 'tmdb key');
  assert.ok(r.some((g) => g.items.some((i) => /^No\./.test(i.a[0]))));
});
t('empty search shows everything', () => {
  assert.equal(countItems(searchHelp(HELP_SECTIONS, '')), total);
  assert.equal(countItems(searchHelp(HELP_SECTIONS, '   ')), total);
});
t('search finds by question, answer and steps, any case', () => {
  const r = searchHelp(HELP_SECTIONS, 'REWATCH');
  const ids = r.flatMap((g) => g.items.map((i) => i.id));
  assert.ok(ids.includes('rewatch-one') && ids.includes('rewatch-mode'), ids.join());
  assert.ok(countItems(searchHelp(HELP_SECTIONS, 'taskbar')) >= 1); // only in steps
});
t('every word must match', () => {
  const r = searchHelp(HELP_SECTIONS, 'letterboxd zip');
  assert.deepEqual(r.flatMap((g) => g.items.map((i) => i.id)), ['import']);
  assert.equal(countItems(searchHelp(HELP_SECTIONS, 'letterboxd banana')), 0);
});
t('curly apostrophes do not matter: "dont" and "don\'t" find "don’t"', () => {
  assert.ok(countItems(searchHelp(HELP_SECTIONS, 'dont')) > 0);
  assert.equal(countItems(searchHelp(HELP_SECTIONS, "don't")), countItems(searchHelp(HELP_SECTIONS, 'dont')));
  assert.equal(norm('Café “Don’t”'), 'cafe "dont"');
});
t('keyboard shortcut words are searchable through the shared list', () => {
  const r = searchHelp(HELP_SECTIONS, 'esc go back', keysExtra);
  assert.ok(r.some((g) => g.items.some((i) => i.id === 'keys')));
});
t('sections with no match are left out; nothing found gives an empty list', () => {
  const r = searchHelp(HELP_SECTIONS, 'badges');
  assert.ok(r.every((g) => g.items.length > 0));
  assert.deepEqual(searchHelp(HELP_SECTIONS, 'zzzzqq'), []);
});
t('searching "notification", "notifications", "reminder" or "alert" finds the notifications answer, which points to the calendar', () => {
  for (const w of ['notification', 'notifications', 'reminder', 'alert']) {
    const hit = searchHelp(HELP_SECTIONS, w).flatMap((g) => g.items).find((i) => i.id === 'notifications');
    assert.ok(hit, w);
  }
  const it = HELP_SECTIONS.flatMap((s) => s.items).find((i) => i.id === 'notifications');
  assert.match(it.a.join(' '), /working on/);
  assert.match(it.a.join(' '), /Add to calendar/);
});
console.log(`\n${n} help and faq tests passed`);
