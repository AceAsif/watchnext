// PURE: what to do when someone signs in on a device whose library belongs to a
// DIFFERENT Google account. No DOM, no Firebase, no store.
//
// Before this existed, signing in simply merged whatever was on the device into the
// account that just signed in. That is right for "my own library, first sign-in", but
// wrong when the device holds someone else's library: e.g. a phone used with
// asif@… signs in as a second account, and asif's whole library is copied into it.
//
// The device remembers which account its library belongs to (the "owner"). On sign-in:
//   same account, or nothing on the device to copy  -> carry on as before
//   no owner recorded yet                           -> carry on (a first sign-in uploads the library)
//   a different account AND something to copy       -> ask: Start fresh / Add this device's library / Cancel

export const OWNER_KEY = 'watchnext-owner-v1';

const str = (v) => (typeof v === 'string' ? v.trim() : '');

// The account this device's library belongs to: { uid, email } or null.
// rawOwner is the OWNER_KEY record. rawSyncMeta is the sync record ('watchnext-sync-v1'),
// which already holds the uid of the last account that synced here; it is the fallback for
// devices that were set up before OWNER_KEY existed (no email is known for those).
export function readOwner(rawOwner, rawSyncMeta) {
  for (const raw of [rawOwner, rawSyncMeta]) {
    try {
      const o = JSON.parse(raw);
      if (o && typeof o === 'object' && str(o.uid)) return { uid: str(o.uid), email: str(o.email) };
    } catch (e) { /* missing or not JSON: try the next one */ }
  }
  return null;
}

export function ownerRecord(user) {
  return JSON.stringify({ uid: str(user && user.uid), email: str(user && user.email) });
}

// How much is on this device that a sign-in would copy into the account.
export function libraryCounts(state) {
  const s = state || {};
  const shows = s.shows && typeof s.shows === 'object' ? Object.keys(s.shows).length : 0;
  const movies = Array.isArray(s.movies) ? s.movies.length : 0;
  const goals = s.goals && typeof s.goals === 'object' ? Object.keys(s.goals).length : 0;
  const hidden = s.hidden && typeof s.hidden === 'object' ? Object.keys(s.hidden).length : 0;
  return { shows, movies, goals, hidden };
}

const hasLibrary = (c) => !!c && (c.shows > 0 || c.movies > 0 || c.goals > 0 || c.hidden > 0);

// 'same'   the library already belongs to this account
// 'adopt'  no owner yet, or a different owner but nothing to copy: sync as normal
// 'ask'    a different account's library is on this device: ask first
export function switchDecision(owner, user, counts) {
  const uid = str(user && user.uid);
  if (!uid) return 'same';
  if (!owner || !owner.uid) return 'adopt';
  if (owner.uid === uid) return 'same';
  return hasLibrary(counts) ? 'ask' : 'adopt';
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

export function librarySizeText(c) {
  const parts = [];
  if (c.shows) parts.push(plural(c.shows, 'show', 'shows'));
  if (c.movies) parts.push(plural(c.movies, 'movie', 'movies'));
  if (!parts.length) parts.push('goals and settings'); // only goals / Not interested
  return parts.join(' and ');
}

// Wording for the prompt. p = { fromEmail, toEmail, shows, movies, goals, hidden }
export function switchCopy(p) {
  const from = str(p && p.fromEmail) || 'another Google account';
  const to = str(p && p.toEmail) || 'this account';
  const size = librarySizeText(p || {});
  return {
    title: 'Switching accounts?',
    intro: `This device holds the library of ${from} (${size}). You’re signing in as ${to}.`,
    fresh: {
      label: 'Start fresh',
      line: `Clears this device and loads ${to}’s own library. A backup of this device’s library downloads first, and ${from}’s cloud copy is not touched.`,
    },
    merge: {
      label: 'Add this device’s library',
      line: `Copies these ${size} into ${to}. Choose this only if this library is yours.`,
    },
    cancel: {
      label: 'Cancel',
      line: 'Signs out again. Nothing changes on this device or in either account.',
    },
  };
}
