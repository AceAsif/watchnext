// What to tell the person when Google sign-in doesn't finish (pure, unit-tested in plain node).
// Firebase errors look like  { code: 'auth/popup-closed-by-user', message: 'Firebase: Error (auth/popup-closed-by-user).' }
// Closing the Google window is not an error: it gets a calm, non-red note. Returns
//   null                       → say nothing (e.g. a second tap while the window is already open)
//   { text, kind: 'ok'|'err' } → the Settings banner

export const codeOf = (err) => {
  if (!err) return '';
  if (typeof err.code === 'string') return err.code;
  const m = /\((auth\/[a-z0-9-]+)\)/i.exec(String(err.message || err));
  return m ? m[1] : '';
};

const KEEP = 'Nothing changed: your library stays on this device.';

export function signInProblem(err) {
  const code = codeOf(err);
  switch (code) {
    case 'auth/popup-closed-by-user':
    case 'auth/user-cancelled':
      return { kind: 'ok', text: `Sign-in cancelled. ${KEEP} Tap “Sign in with Google” whenever you’re ready.` };
    case 'auth/cancelled-popup-request':
      return null; // another sign-in window was already open (a double tap): the first one carries on
    case 'auth/popup-blocked':
      return { kind: 'err', text: `Your browser blocked the Google sign-in window. Allow pop-ups for this site, then tap “Sign in with Google” again. ${KEEP}` };
    case 'auth/network-request-failed':
      return { kind: 'err', text: `Couldn’t reach Google: you seem to be offline. Try again when you’re back online. ${KEEP}` };
    case 'auth/too-many-requests':
      return { kind: 'err', text: `Too many sign-in tries. Wait a minute, then try again. ${KEEP}` };
    case 'auth/unauthorized-domain':
      return { kind: 'err', text: 'Google sign-in isn’t allowed on this web address yet. (Owner: add it in Firebase → Authentication → Settings → Authorized domains.)' };
    case 'auth/web-storage-unsupported':
    case 'auth/operation-not-supported-in-this-environment':
      return { kind: 'err', text: 'This browser blocks the storage Google sign-in needs (often a private window). Try a normal window, or open WatchNext in Safari or Chrome.' };
    default: {
      // Unknown: keep it short and drop Firebase's "Firebase: Error (…)." wrapper.
      const raw = String((err && err.message) || err || '').replace(/^Firebase:\s*/i, '').replace(/\s*\(auth\/[^)]*\)\.?\s*$/, '').replace(/^Error\s*$/i, '').trim();
      const why = code ? code.replace('auth/', '').replace(/-/g, ' ') : raw || 'something went wrong';
      return { kind: 'err', text: `Sign-in didn’t work (${why}). Please try again. ${KEEP}` };
    }
  }
}
