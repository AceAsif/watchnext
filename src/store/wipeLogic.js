// PURE logic for "Delete everywhere" (wipe the whole account, not just this
// device). No Firebase, no DOM, no localStorage: the cloud engine and Settings
// call into this, and it is unit-tested in plain node with fakes.
//
// How a wipe reaches your other devices
//   * Shows are separate Firestore docs, so deleting them already reaches other
//     devices live ('removed' events).
//   * Movies are ONE doc that is only merged on sign-in, and that merge ADDS
//     movies from both sides. So an old device could push its movies back and
//     undo the wipe. To stop that, a wipe also writes a small MARKER doc
//     (users/{uid}/library/wipe = { id, at }). A device that last synced BEFORE
//     the marker clears its own copy and does not push anything back. A device
//     that has never synced with the account is left alone (it may hold brand-new
//     data), and a device that synced after the marker has nothing to clear.

export const WIPE_WORD = 'DELETE';
// Firestore allows 500 writes per batch. Up to this many show deletes are
// committed in the FINAL batch together with the movies reset and the marker, so
// a normal library (a few hundred shows) wipes in ONE atomic commit.
export const DELETE_CHUNK = 450;

export const confirmOk = (text) => String(text == null ? '' : text).trim().toUpperCase() === WIPE_WORD;

export function chunk(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

const validTime = (s) => typeof s === 'string' && !isNaN(Date.parse(s));
export const isValidWipe = (w) => !!w && typeof w === 'object' && typeof w.id === 'string' && w.id.length > 0 && validTime(w.at);

// meta = { lastSync?: ISO, seenWipeId?: string } for THIS account on THIS device.
// 'apply'  clear this device now
// 'record' remember the marker, change nothing (never synced before, or already synced after it)
// 'ignore' nothing to do (no/invalid marker, or already handled)
export function wipeDecision(wipe, meta) {
  if (!isValidWipe(wipe)) return 'ignore';
  const m = meta || {};
  if (m.seenWipeId === wipe.id) return 'ignore';
  if (!validTime(m.lastSync)) return 'record';
  return Date.parse(wipe.at) > Date.parse(m.lastSync) ? 'apply' : 'record';
}

// The per-account record kept in localStorage. Different account -> treated as never synced.
export function readMeta(raw, uid) {
  try {
    const m = JSON.parse(raw);
    if (m && typeof m === 'object' && m.uid === uid && uid) {
      return {
        lastSync: validTime(m.lastSync) ? m.lastSync : undefined,
        seenWipeId: typeof m.seenWipeId === 'string' ? m.seenWipeId : undefined,
      };
    }
  } catch (e) { /* no record yet */ }
  return {};
}
export const writeMeta = (prev, uid, patch) => JSON.stringify({ uid, ...prev, ...patch });

// Runs a wipe from this device. `p` supplies every side effect:
//   listRemoteIds()          -> Promise<string[]>   show docs that exist in the cloud
//   localIds()               -> string[]            show ids on this device
//   markSeen(id)             remember the marker id BEFORE any write (so our own
//                            snapshot listener ignores it)
//   commitDeletes(ids)       -> Promise             delete these show docs
//   commitFinal(ids, marker) -> Promise             delete these show docs AND set
//                            movies=[] AND write the marker, atomically
//   clearLocal(ids)          clear this device (only called after the cloud succeeded)
//   now()                    -> ISO string
//   randomId()               -> string
// Throws (leaving this device untouched) if any cloud step fails.
export async function runWipe(p) {
  const ids = [...new Set([...(await p.listRemoteIds()), ...p.localIds()])];
  const markerId = p.randomId();
  p.markSeen(markerId);
  const parts = chunk(ids, DELETE_CHUNK);
  for (let i = 0; i < parts.length - 1; i++) await p.commitDeletes(parts[i]);
  // `at` is taken when the final commit starts, so any device that synced before
  // the wipe finished has lastSync < at and will apply it.
  const marker = { id: markerId, at: p.now() };
  await p.commitFinal(parts.length ? parts[parts.length - 1] : [], marker);
  p.clearLocal(ids);
  return { shows: ids.length, marker };
}

// ------------------------------------------------------------------ wording
const n = (count, one, many) => `${count.toLocaleString()} ${count === 1 ? one : many}`;

export const wipeIntro =
  'Removes every show, movie, rating, note and watched episode from this device, from your cloud account and from ' +
  'every other device that is signed in. A backup file downloads first.';

export function wipeEffects() {
  return [
    'Every show, movie, rating, note and watched episode is deleted from this device',
    'Everything is deleted from your cloud account',
    'Your other signed-in devices clear themselves the next time they open WatchNext',
    'Your TMDB key on this device is removed (other devices keep theirs)',
  ];
}

export const wipeBackupLine = 'A backup file will download first, so you can restore it if you change your mind.';

export function wipeDoneText(shows) {
  return `Everything was deleted: ${n(shows, 'show', 'shows')} and all movies, on this device and in your cloud account. ` +
    'Your other devices will clear the next time they open WatchNext.';
}

export function wipeFailText(err) {
  const why = err && err.message ? ` (${err.message})` : '';
  return 'Deleting did not finish' + why + '. Your backup file was downloaded, so your data is safe. ' +
    'Check your connection and try again.';
}
