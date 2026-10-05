// PURE: how two copies of a show's watched-episode map are combined when this
// device meets the cloud copy at sign-in. No DOM, no store.
//
// Before date correction existed this was "keep every episode from both sides, and
// this device's copy wins". That would quietly UNDO a corrected date: fix a date on
// the computer, open the phone later, and the phone's old date would win and be
// pushed back up. So an entry whose date was set by hand carries `fixedAt` (when it
// was corrected), and the more recently corrected copy wins. If neither side was
// corrected, this device still wins, as before. A rewatch count is never lost
// (the higher `n` is kept), same as the backup restore.

const BAD_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const fixedMs = (w) => { const t = Date.parse(w && w.fixedAt); return Number.isFinite(t) ? t : 0; };
const count = (n) => { const v = Math.floor(Number(n)); return Number.isFinite(v) && v >= 1 ? v : 1; };

export function mergeWatched(remote, local) {
  const r = isObj(remote) ? remote : {};
  const l = isObj(local) ? local : {};
  const out = {};
  for (const key of new Set([...Object.keys(r), ...Object.keys(l)])) {
    if (BAD_KEYS.has(key)) continue;
    const a = isObj(r[key]) ? r[key] : null;
    const b = isObj(l[key]) ? l[key] : null;
    if (!a && !b) continue;
    if (!a) { out[key] = b; continue; }
    if (!b) { out[key] = a; continue; }
    const pick = fixedMs(a) > fixedMs(b) ? a : b; // this device wins unless the cloud copy was corrected more recently
    const merged = { ...pick };
    if (a.n != null || b.n != null) merged.n = Math.max(count(a.n), count(b.n));
    out[key] = merged;
  }
  return out;
}
