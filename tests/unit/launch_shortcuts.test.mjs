import assert from 'node:assert/strict';
import fs from 'node:fs';
import { launchTarget, cleanLaunchUrl, LAUNCH_TARGETS } from '../../src/components/launchShortcutsLogic.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('ok  -', name); };

t('the three shortcut targets are read from ?go=', () => {
  assert.equal(launchTarget('?go=next'), 'next');
  assert.equal(launchTarget('?go=search'), 'search');
  assert.equal(launchTarget('?go=tonight'), 'tonight');
});
t('case and spaces do not matter, other query parts are fine', () => {
  assert.equal(launchTarget('?go=Search'), 'search');
  assert.equal(launchTarget('?utm=x&go=%20tonight%20'), 'tonight');
});
t('unknown or missing targets open the app as normal', () => {
  for (const s of ['', '?', '?go=', '?go=settings', '?go=../x', '?foo=search', null, undefined, 5]) assert.equal(launchTarget(s), null);
});
t('the go part is removed from the address and the rest is kept', () => {
  assert.equal(cleanLaunchUrl('https://aceasif.github.io/watchnext/?go=search'), '/watchnext/');
  assert.equal(cleanLaunchUrl('https://aceasif.github.io/watchnext/?a=1&go=next#top'), '/watchnext/?a=1#top');
});
t('nothing to clean: returns null (no history change)', () => {
  assert.equal(cleanLaunchUrl('https://aceasif.github.io/watchnext/'), null);
  assert.equal(cleanLaunchUrl('https://aceasif.github.io/watchnext/?a=1'), null);
  assert.equal(cleanLaunchUrl('not a url'), null);
});
t('the manifest shortcuts match the targets the app understands', () => {
  const m = JSON.parse(fs.readFileSync(new URL('../../public/manifest.webmanifest', import.meta.url), 'utf8'));
  assert.ok(Array.isArray(m.shortcuts) && m.shortcuts.length === 3);
  const targets = m.shortcuts.map((s) => launchTarget(s.url.slice(s.url.indexOf('?'))));
  assert.deepEqual(targets, ['next', 'search', 'tonight']);
  for (const s of m.shortcuts) {
    assert.ok(s.url.startsWith('./?go='), s.url); // inside the app's scope
    assert.ok(s.name && s.short_name && s.short_name.length <= 12, s.name);
    for (const ic of s.icons) assert.ok(fs.existsSync(new URL('../../public/' + ic.src.replace('./', ''), import.meta.url)), ic.src);
  }
  assert.deepEqual([...LAUNCH_TARGETS].sort(), ['next', 'search', 'tonight']);
});
console.log(`\n${n} launch shortcut tests passed`);
