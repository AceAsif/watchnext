import assert from 'node:assert/strict';
import { signInProblem, codeOf } from '../../src/store/signInLogic.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('ok  -', name); };
const fb = (code) => Object.assign(new Error(`Firebase: Error (${code}).`), { code });

t('closing the Google window: a calm note, not red, says nothing changed', () => {
  const r = signInProblem(fb('auth/popup-closed-by-user'));
  assert.equal(r.kind, 'ok');
  assert.match(r.text, /^Sign-in cancelled\. Nothing changed: your library stays on this device\./);
  assert.doesNotMatch(r.text, /Firebase|auth\//);
  assert.deepEqual(signInProblem(fb('auth/user-cancelled')), r);
});
t('a second tap while the window is open: say nothing', () => {
  assert.equal(signInProblem(fb('auth/cancelled-popup-request')), null);
});
t('blocked window, offline, too many tries, wrong address, private window: clear red messages', () => {
  assert.match(signInProblem(fb('auth/popup-blocked')).text, /blocked the Google sign-in window\. Allow pop-ups/);
  assert.match(signInProblem(fb('auth/network-request-failed')).text, /you seem to be offline/);
  assert.match(signInProblem(fb('auth/too-many-requests')).text, /Wait a minute/);
  assert.match(signInProblem(fb('auth/unauthorized-domain')).text, /Authorized domains/);
  assert.match(signInProblem(fb('auth/web-storage-unsupported')).text, /private window/);
  for (const c of ['auth/popup-blocked', 'auth/network-request-failed']) assert.equal(signInProblem(fb(c)).kind, 'err');
});
t('anything else: short, no "Firebase: Error (…)" wrapper', () => {
  assert.equal(signInProblem(fb('auth/internal-error')).text, 'Sign-in didn’t work (internal error). Please try again. Nothing changed: your library stays on this device.');
  assert.equal(signInProblem(new Error('Boom')).text, 'Sign-in didn’t work (Boom). Please try again. Nothing changed: your library stays on this device.');
  assert.match(signInProblem(null).text, /something went wrong/);
});
t('the code is found on the error or in its message', () => {
  assert.equal(codeOf({ code: 'auth/x' }), 'auth/x');
  assert.equal(codeOf(new Error('Firebase: Error (auth/popup-closed-by-user).')), 'auth/popup-closed-by-user');
  assert.equal(codeOf(null), ''); assert.equal(codeOf(new Error('plain')), '');
});
console.log(`\n${n} sign in tests passed`);
