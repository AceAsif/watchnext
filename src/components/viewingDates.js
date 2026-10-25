// PURE: when each viewing of an episode happened. One rule for every Stats card
// (Year in review, Goals, Month in review, This month vs last year), so they always agree.
//
// An episode record is { at, n, last?, … }: `at` = the FIRST watch, `n` = times watched,
// `last` = the latest "+1". Rewatch mode keeps its own date per episode in
// show.rewatch.done["1x1"]. Each viewing counts on its own date where we know it:
//   the first watch on `at`, a rewatch-mode tick on its done date, a "+1" on `last`.
// Extra viewings with no date of their own (old imports) count on the first date.
// So "Bring back first watch dates" moves only the FIRST viewing back in time; a rewatch
// you did this month stays in this month.

const count = (n) => { const v = Math.floor(Number(n)); return Number.isFinite(v) && v >= 1 ? v : 1; };
const isIso = (v) => typeof v === 'string' && v.length >= 10 && Number.isFinite(Date.parse(v));

/**
 * w: the episode record; doneAt: show.rewatch.done[key] (or undefined).
 * Returns [{ at, own }] — one entry per viewing (length = n). own=false marks an extra
 * viewing that had no date of its own and was put on the first date.
 */
export function viewingDates(w, doneAt) {
  if (!w || typeof w !== 'object' || !isIso(w.at)) return [];
  const out = [{ at: w.at, own: true }];
  let extra = count(w.n) - 1;
  if (extra > 0 && isIso(doneAt)) { out.push({ at: doneAt, own: true }); extra--; }
  if (extra > 0 && isIso(w.last)) { out.push({ at: w.last, own: true }); extra--; }
  for (; extra > 0; extra--) out.push({ at: w.at, own: false });
  return out;
}

// The rewatch-mode dates of a show, safely.
export const doneDates = (show) =>
  (show && show.rewatch && show.rewatch.done && typeof show.rewatch.done === 'object' && !Array.isArray(show.rewatch.done) ? show.rewatch.done : {});
