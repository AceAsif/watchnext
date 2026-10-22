// "Bring back first watch dates" from a backup. PURE: no DOM, no store.
//
// Before the fix in October 2026, the episode "+1" button replaced an episode's first watch
// date with the day you pressed it. A backup made earlier still has the real first dates.
// This finds every episode that is in both your library and the backup where the backup's
// date is EARLIER, and puts that date back. Nothing else changes:
//   - the watch count (n) stays as it is now;
//   - the date it replaced becomes the "last watched" date (if there isn't one already),
//     because that's what it really was: the day of the extra watch;
//   - `fixedAt` is stamped so the corrected date wins when your devices sync.
// Dates you set by hand with "Fix watch dates" (they carry fixedAt) are never touched.
// Shows are matched by their id, or by TMDB id / name when the id differs.

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const t = (s) => (typeof s === 'string' && s ? Date.parse(s) : NaN);
const MIN_GAP = 60000; // ignore differences under a minute (the same watch, re-saved)

function findInBackup(id, show, backupShows) {
  if (backupShows[id]) return backupShows[id];
  const byTmdb = show.tmdbId && Object.values(backupShows).find((b) => isObj(b) && b.tmdbId && Number(b.tmdbId) === Number(show.tmdbId));
  if (byTmdb) return byTmdb;
  const name = String(show.name || '').trim().toLowerCase();
  return (name && Object.values(backupShows).find((b) => isObj(b) && String(b.name || '').trim().toLowerCase() === name)) || null;
}

// -> [{ id, name, eps: [{ key, from, to }] }] — shows with something to bring back, A–Z
export function planFirstDates(shows, backup) {
  const bShows = isObj(backup) && isObj(backup.shows) ? backup.shows : {};
  const out = [];
  for (const [id, show] of Object.entries(isObj(shows) ? shows : {})) {
    if (!isObj(show) || !isObj(show.watched)) continue;
    const b = findInBackup(id, show, bShows);
    if (!b || !isObj(b.watched)) continue;
    const eps = [];
    for (const [key, w] of Object.entries(show.watched)) {
      const bw = b.watched[key];
      if (!isObj(w) || !isObj(bw)) continue;
      if (w.fixedAt) continue; // you set this date by hand (Fix watch dates): it stays
      const now = t(w.at);
      const then = t(bw.at);
      if (Number.isFinite(then) && Number.isFinite(now) && then < now - MIN_GAP) eps.push({ key, from: w.at, to: bw.at });
    }
    if (eps.length) {
      eps.sort((x, y) => { const [a, b2] = x.key.split('x').map(Number); const [c, d] = y.key.split('x').map(Number); return a - c || b2 - d; });
      out.push({ id, name: String(show.name || 'Untitled'), eps });
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

export const planCount = (plan) => plan.reduce((n, p) => n + p.eps.length, 0);

// The new watched map for one show.
export function applyToShow(show, eps, nowIso) {
  const watched = { ...(show.watched || {}) };
  for (const e of eps) {
    const w = watched[e.key];
    if (!isObj(w) || w.at !== e.from) continue; // changed since the plan was made: leave it
    const next = { ...w, at: e.to, fixedAt: nowIso };
    if (!next.last) next.last = e.from;
    watched[e.key] = next;
  }
  return { ...show, watched };
}

// "S4E1–E4 · 4 Jun 2022" style lines are made by the view; this groups episodes by season.
export const epCode = (key) => { const [s, e] = key.split('x'); return `S${s}E${e}`; };
