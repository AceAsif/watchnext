import assert from 'node:assert/strict';
import { notify, notifyError, dismissNotice, askConfirm, answerConfirm, getDialogs, subscribeDialogs, resetDialogs, reason, MAX_NOTICES, ERROR_MS, NOTICE_MS } from '../../src/components/appDialogs.js';

let n = 0; const t = async (name, fn) => { resetDialogs(); await fn(); n++; console.log('ok  -', name); };

await t('a message shows, with a kind and how long it stays', () => {
  const id = notify('Added to your watchlist.');
  assert.deepEqual(getDialogs().notices, [{ id, text: 'Added to your watchlist.', kind: 'ok', ms: NOTICE_MS }]);
  const e = notifyError('Couldn’t load the trailer: you seem to be offline.');
  assert.equal(getDialogs().notices.find((x) => x.id === e).kind, 'err');
  assert.equal(getDialogs().notices.find((x) => x.id === e).ms, ERROR_MS);
});
await t('empty messages are ignored; the same message twice shows once', () => {
  assert.equal(notify('  '), null); assert.equal(notify(null), null);
  notify('Same'); notify('Same');
  assert.equal(getDialogs().notices.length, 1);
});
await t('at most a few messages at once (oldest go first); × removes one', () => {
  for (let i = 0; i < MAX_NOTICES + 2; i++) notify(`m${i}`);
  const ns = getDialogs().notices; assert.equal(ns.length, MAX_NOTICES); assert.equal(ns[0].text, `m2`);
  dismissNotice(ns[0].id); assert.equal(getDialogs().notices.length, MAX_NOTICES - 1);
  dismissNotice(99999); // unknown: nothing happens
});
await t('a question resolves true when confirmed', async () => {
  const p = askConfirm({ title: 'Delete this list?', body: 'x', confirmLabel: 'Delete list' });
  const a = getDialogs().ask; assert.equal(a.title, 'Delete this list?'); assert.equal(a.confirmLabel, 'Delete list'); assert.equal(a.danger, true);
  answerConfirm(a.id, true);
  assert.equal(await p, true); assert.equal(getDialogs().ask, null);
});
await t('Cancel / Esc / tapping outside resolve false', async () => {
  const p = askConfirm({ title: 'End this rewatch?', danger: false });
  assert.equal(getDialogs().ask.danger, false); assert.equal(getDialogs().ask.cancelLabel, 'Cancel');
  answerConfirm(getDialogs().ask.id, false);
  assert.equal(await p, false);
});
await t('one question at a time: the second waits its turn', async () => {
  const p1 = askConfirm({ title: 'One' }); const p2 = askConfirm({ title: 'Two' });
  assert.equal(getDialogs().ask.title, 'One');
  answerConfirm(getDialogs().ask.id, true); assert.equal(getDialogs().ask.title, 'Two');
  answerConfirm(getDialogs().ask.id, false);
  assert.deepEqual([await p1, await p2], [true, false]);
  answerConfirm(12345, true); // answering a question that's gone does nothing
});
await t('listeners hear every change', () => {
  let calls = 0; const off = subscribeDialogs(() => { calls++; });
  notify('a'); askConfirm({ title: 'q' }); answerConfirm(getDialogs().ask.id, false); off(); notify('b');
  assert.equal(calls, 3);
});
await t('plain reasons from errors', () => {
  assert.equal(reason(new TypeError('Failed to fetch')), 'you seem to be offline');
  assert.equal(reason(new Error('Load failed')), 'you seem to be offline');
  assert.equal(reason(new Error('TMDB 404')), 'TMDB 404');
  assert.equal(reason(null), 'something went wrong');
  assert.equal(reason(new Error('x'.repeat(200))).length, 138);
});
await t('no alert() or confirm() is left in the app', async () => {
  const fs = await import('node:fs'); const path = await import('node:path');
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
  const files = walk(new URL('../../src', import.meta.url).pathname).filter((f) => /\.(js|jsx)$/.test(f));
  const bad = files.filter((f) => /(^|[^\w.])(window\.)?(alert|confirm)\(/m.test(fs.readFileSync(f, 'utf8').replace(/\/\/.*$/gm, '')));
  assert.deepEqual(bad, []);
});
console.log(`\n${n} app dialog tests passed`);
