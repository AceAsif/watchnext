import assert from 'node:assert/strict';
import { isShielded, epTitle } from '../../src/components/spoilerShield.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('ok  -', name); };
const show = { watched: { '1x1': { at: '2026-01-01T10:00:00Z' }, '2x3': { at: '2026-02-01T10:00:00Z' } } };

t('shield off: nothing is hidden', () => { assert.equal(isShielded(false, show, 1, 2), false); });
t('shield on: episodes you have watched stay visible', () => { assert.equal(isShielded(true, show, 1, 1), false); assert.equal(isShielded(true, show, 2, 3), false); });
t('shield on: episodes you have not watched are hidden', () => { assert.equal(isShielded(true, show, 1, 2), true); assert.equal(isShielded(true, show, 5, 1), true); });
t('a show not in your library (no record) counts as not watched', () => { assert.equal(isShielded(true, null, 1, 1), true); assert.equal(isShielded(true, {}, 1, 1), true); });
t('epTitle: the real name, or "Episode N" when hidden or missing', () => {
  assert.equal(epTitle('Chapter Eight: Papa', 8, false), 'Chapter Eight: Papa');
  assert.equal(epTitle('Chapter Eight: Papa', 8, true), 'Episode 8');
  assert.equal(epTitle('', 3, false), 'Episode 3');
});
console.log(`\n${n} spoiler shield tests passed`);
