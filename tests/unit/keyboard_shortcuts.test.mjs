import assert from 'node:assert/strict';
import { shortcutFor, isTypingTarget, TAB_KEYS, SHORTCUT_LIST } from '../../src/components/keyboardShortcutsLogic.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('ok  -', name); };
const body = { tagName: 'BODY' };
const key = (k, extra = {}) => ({ key: k, target: body, ...extra });

t('slash opens search', () => { assert.deepEqual(shortcutFor(key('/')), { type: 'search' }); });
t('1 to 6 switch to the six tabs in order', () => {
  ['1', '2', '3', '4', '5', '6'].forEach((k, i) => assert.deepEqual(shortcutFor(key(k)), { type: 'tab', id: TAB_KEYS[i] }));
  assert.deepEqual(TAB_KEYS, ['next', 'shows', 'movies', 'watchlist', 'stats', 'settings']);
});
t('0, 7, 9 and letters do nothing', () => {
  for (const k of ['0', '7', '9', 'a', 's', 'Enter', ' ']) assert.equal(shortcutFor(key(k)), null);
});
t('question mark opens the shortcut list', () => { assert.deepEqual(shortcutFor(key('?')), { type: 'help' }); });
t('Ctrl, Cmd or Alt held: leave it to the browser', () => {
  assert.equal(shortcutFor(key('1', { ctrlKey: true })), null);
  assert.equal(shortcutFor(key('/', { metaKey: true })), null);
  assert.equal(shortcutFor(key('2', { altKey: true })), null);
});
t('Shift alone is fine (Shift plus slash gives ?)', () => {
  assert.deepEqual(shortcutFor(key('?', { shiftKey: true })), { type: 'help' });
});
t('typing in a text box never triggers a shortcut', () => {
  const inputs = [
    { tagName: 'INPUT', type: 'text' }, { tagName: 'INPUT', type: 'search' }, { tagName: 'INPUT', type: 'number' },
    { tagName: 'INPUT', type: 'date' }, { tagName: 'input' }, { tagName: 'TEXTAREA' }, { tagName: 'SELECT' },
    { tagName: 'DIV', isContentEditable: true },
  ];
  for (const target of inputs) for (const k of ['/', '1', '6', '?']) assert.equal(shortcutFor(key(k, { target })), null);
});
t('a focused button, checkbox or range slider still allows shortcuts', () => {
  for (const target of [{ tagName: 'BUTTON' }, { tagName: 'INPUT', type: 'checkbox' }, { tagName: 'INPUT', type: 'range' }])
    assert.deepEqual(shortcutFor(key('3', { target })), { type: 'tab', id: 'movies' });
});
t('nothing happens while a sheet or dialog is open', () => {
  for (const k of ['/', '1', '?', 'Escape']) assert.equal(shortcutFor(key(k), { modalOpen: true, back: true }), null);
});
t('holding a key down does not repeat it', () => { assert.equal(shortcutFor(key('2', { repeat: true })), null); });
t('typing with an input method (e.g. Bengali keyboard) is ignored', () => {
  assert.equal(shortcutFor(key('1', { isComposing: true })), null);
  assert.equal(shortcutFor(key('Process')), null);
});
t('Esc goes back only when there is somewhere to go back from', () => {
  assert.deepEqual(shortcutFor(key('Escape'), { back: true }), { type: 'back' });
  assert.equal(shortcutFor(key('Escape'), { back: false }), null);
});
t('Esc in a search box with text clears it first; empty box goes back', () => {
  assert.equal(shortcutFor(key('Escape', { target: { tagName: 'INPUT', type: 'search', value: 'dune' } }), { back: true }), null);
  assert.deepEqual(shortcutFor(key('Escape', { target: { tagName: 'INPUT', type: 'search', value: '' } }), { back: true }), { type: 'back' });
});
t('bad input is safe', () => {
  assert.equal(shortcutFor(null), null);
  assert.equal(shortcutFor({}), null);
  assert.equal(isTypingTarget(null), false);
});
t('the help list covers every shortcut', () => {
  const keys = SHORTCUT_LIST.flatMap((s) => s.keys);
  for (const k of ['/', '1', '2', '3', '4', '5', '6', 'Esc', '?']) assert.ok(keys.includes(k), k);
});
console.log(`\n${n} keyboard shortcut tests passed`);
