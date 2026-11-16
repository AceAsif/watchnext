// PURE: what to do when the cloud sends this device a show while the live listener is running.
// No DOM, no Firestore, no store.
//
// THE BUG THIS FIXES (handover section 12). The listener used to do
//     local = { ...local, ...cloudCopy }
// so the cloud copy REPLACED the episodes. A tick is only on the device until the next upload
// (up to 2.5 s later). If a cloud copy of that show arrived in the gap (the other device opened
// the app, or the app just started), the tick vanished. The row went back to the old episode,
// the owner tapped again, and the activity log said "Watched S9E8" twice.
//
// THE RULE: a three-way merge. `base` is the copy of the show the cloud was last known to hold
// (what this device last downloaded or last uploaded). Comparing local with base tells us exactly
// what was changed HERE and not uploaded yet. Those changes win. Everything else comes from the cloud.
//   - episode ticked here, not uploaded      -> kept
//   - episode un-ticked here, not uploaded   -> stays un-ticked (the cloud still has it)
//   - episode un-ticked on the other device  -> removed here too, because it was not touched here
//   - episode ticked on the other device     -> added here
//   - any other field changed here (rating, followed ...) -> kept; fields changed only in the cloud come down
// With nothing changed here the result is the cloud copy, exactly as before.
// No `base` (unknown) means "keep everything this device has, add what the cloud has": it can't
// tell an un-tick from a missing tick, and losing a tick is the worse mistake.
//
// The Firestore data is unchanged: no tombstones, no new fields.

import { mergeWatched } from './watchedMerge.js';
import { mergeNotes } from './notes.js';
import { mergeEpRatings } from './epRatings.js';

const BAD_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

// JSON text with sorted keys, so two equal values compare equal whatever order their keys were written in.
function stable(v) {
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  if (isObj(v)) return `{${Object.keys(v).sort().filter((k) => v[k] !== undefined).map((k) => `${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}`;
  return v === undefined ? 'undefined' : JSON.stringify(v);
}
export const sameValue = (a, b) => a === b || stable(a) === stable(b);

// A frozen copy of a show record, safe to keep as `base` (later edits to the live record can't reach it).
export function cloneShow(show) {
  return isObj(show) ? JSON.parse(JSON.stringify(show)) : null;
}

// local:  this device's record (or undefined: a show we don't have)
// remote: the cloud's record
// base:   the cloud copy this device last saw (or undefined if unknown)
export function applyRemoteShow(local, remote, base) {
  if (!isObj(remote)) return local;
  if (!isObj(local)) return remote;
  const known = isObj(base);
  const out = { ...local, ...remote };

  // 1. Ordinary fields (and notes / episode ratings).
  const fields = new Set([...Object.keys(local), ...(known ? Object.keys(base) : [])]);
  for (const key of fields) {
    if (key === 'watched' || BAD_KEYS.has(key)) continue;
    const mine = local[key];
    if (known && sameValue(mine, base[key])) continue; // not touched here: the cloud copy stands
    if (mine === undefined) { delete out[key]; continue; } // removed here, not uploaded yet
    if (key === 'notes' || key === 'epRatings') {
      const merged = key === 'notes' ? mergeNotes(mine, remote[key]) : mergeEpRatings(mine, remote[key]);
      if (merged) out[key] = merged; else delete out[key];
    } else {
      out[key] = mine;
    }
  }

  // 2. Watched episodes, one by one. (A cloud copy with no `watched` at all is not news about episodes.)
  if ('watched' in remote) {
    const lw = isObj(local.watched) ? local.watched : {};
    const rw = isObj(remote.watched) ? remote.watched : {};
    const bw = known ? (isObj(base.watched) ? base.watched : {}) : null;
    const watched = {};
    for (const k of new Set([...Object.keys(lw), ...Object.keys(rw)])) {
      if (BAD_KEYS.has(k)) continue;
      const l = isObj(lw[k]) ? lw[k] : null;
      const r = isObj(rw[k]) ? rw[k] : null;
      const b = bw && isObj(bw[k]) ? bw[k] : null;
      if (l && (!bw || !sameValue(l, b))) {
        // ticked or changed here, not uploaded yet: ours stays (a later hand-set date in the cloud still wins, as in the sign-in merge)
        watched[k] = r ? mergeWatched({ [k]: r }, { [k]: l })[k] : l;
      } else if (l) {
        if (r) watched[k] = r; // untouched here: the cloud's version; if the cloud dropped it, it was un-ticked there
      } else if (r && !b) {
        watched[k] = r; // new from the cloud (if base had it and we don't, it was un-ticked here: leave it out)
      }
    }
    out.watched = watched;
  }
  return out;
}

// Remembers, per show, the cloud copy this device last saw. It lives in memory only: after a
// restart the sign-in pull rebuilds it (cloudEngine.js).
export function createBaseTracker() {
  const bases = new Map();
  return {
    snap: cloneShow,                                  // copy a record now (before an upload starts)
    remember(id, snapshot) { if (isObj(snapshot)) bases.set(id, snapshot); else bases.delete(id); },
    forget(id) { bases.delete(id); },
    clear() { bases.clear(); },
    has: (id) => bases.has(id),
    // The cloud sent `remote` for show `id`: merge it into `local`, then remember it as the new base.
    apply(id, local, remote) {
      const out = applyRemoteShow(local, remote, bases.get(id));
      bases.set(id, cloneShow(remote));
      return out;
    },
  };
}
