// Rewatch mode for a show: watch it again from the start WITHOUT losing your first watch dates.
// PURE: no DOM, no store.
//
// While a rewatch is on, show.rewatch = { round: 2, started: ISO, done: { '1x1': ISO, … } }.
//   - Ticking an episode in the round records the day in `done` and adds one to that episode's
//     watch count (watched[k].n), so Stats count the extra time. watched[k].at — the date you
//     FIRST watched it — is never touched.
//   - When every episode is ticked the round ends by itself; you can also end it early.
// Finished rounds go to show.rewatchLog = [{ round, started, finished, eps }] (newest last).
// All of it rides the show's own sync doc and backups (it is part of the show record).

import { epKey } from './showLogic.js';

export const LOG_MAX = 20;
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const isoOk = (s) => typeof s === 'string' && s !== '' && Number.isFinite(Date.parse(s));

export const isRewatching = (show) => !!(show && isObj(show.rewatch) && Number.isInteger(show.rewatch.round) && show.rewatch.round >= 2);
export const roundOf = (show) => (isRewatching(show) ? show.rewatch.round : 0);
export const doneMap = (show) => (isRewatching(show) && isObj(show.rewatch.done) ? show.rewatch.done : {});
export const rewatchLog = (show) => (show && Array.isArray(show.rewatchLog) ? show.rewatchLog.filter((r) => isObj(r) && Number.isInteger(r.round)) : []);

// Episodes of the show in order, as far as its season list knows: [{ s, e }]
function episodesInOrder(show) {
  const out = [];
  for (const se of ((show && show.seasons) || []).filter((x) => x && x.n >= 1).sort((a, b) => a.n - b.n)) {
    for (let e = 1; e <= (se.count || 0); e++) out.push({ s: se.n, e, air: se.air || null });
  }
  return out;
}

// Has this episode come out? Watched before = yes. Otherwise the season's premiere and the
// show's next-to-air episode decide (the same rules as the normal "next episode").
function aired(show, ep, today) {
  if ((show.watched || {})[epKey(ep.s, ep.e)]) return true;
  if (ep.air && ep.air > today) return false;
  const na = show.nextAir;
  if (na && na.date > today && na.season === ep.s && ep.e >= na.episode) return false;
  if (na && na.date > today && na.season < ep.s) return false;
  return true;
}

// The next episode to watch in this round (or null when the round is complete / nothing aired).
export function rewatchNext(show, today) {
  if (!isRewatching(show)) return null;
  const done = doneMap(show);
  for (const ep of episodesInOrder(show)) {
    if (done[epKey(ep.s, ep.e)]) continue;
    if (!aired(show, ep, today)) return null;
    return { season: ep.s, episode: ep.e };
  }
  return null;
}

// How far through the round: done / every aired episode.
export function rewatchProgress(show, today) {
  const done = doneMap(show);
  const eps = episodesInOrder(show).filter((ep) => aired(show, ep, today));
  const total = eps.length || Object.keys(show.watched || {}).length;
  const n = eps.length ? eps.filter((ep) => done[epKey(ep.s, ep.e)]).length : Object.keys(done).length;
  return { done: n, total, left: Math.max(0, total - n) };
}

// Start a new round. Only for a show you have watched something of; never twice at once.
export function startRewatch(show, nowIso) {
  if (!show || isRewatching(show) || !Object.keys(show.watched || {}).length) return show;
  const round = rewatchLog(show).reduce((m, r) => Math.max(m, r.round), 1) + 1;
  return { ...show, rewatch: { round, started: nowIso, done: {} } };
}

// Tick (on) or untick (off) one episode in the round. Keeps watched[k].at as it was.
export function markInRound(show, season, episode, on, nowIso, runtimeMin) {
  if (!isRewatching(show)) return show;
  const k = epKey(season, episode);
  const done = { ...doneMap(show) };
  const watched = { ...(show.watched || {}) };
  const w = watched[k];
  if (on) {
    if (done[k]) return show;
    done[k] = nowIso;
    // Seen before: one more time. Never seen (it came out after your first watch): this IS the first time.
    watched[k] = w ? { ...w, n: (Number.isInteger(w.n) && w.n > 0 ? w.n : 1) + 1 } : { at: nowIso, min: runtimeMin || show.runtimeMin || null, n: 1, firstInRewatch: true };
  } else {
    if (!done[k]) return show;
    delete done[k];
    if (w && w.firstInRewatch) delete watched[k];
    else if (w) watched[k] = { ...w, n: Math.max(1, (w.n || 1) - 1) };
  }
  return { ...show, watched, rewatch: { ...show.rewatch, done } };
}

// End the round (finished, or stopped early). It is kept in the log when anything was watched.
export function endRewatch(show, nowIso) {
  if (!isRewatching(show)) return show;
  const { rewatch, ...rest } = show;
  const eps = Object.keys(isObj(rewatch.done) ? rewatch.done : {}).length;
  const log = rewatchLog(show);
  const next = eps ? [...log, { round: rewatch.round, started: isoOk(rewatch.started) ? rewatch.started : nowIso, finished: nowIso, eps }].slice(-LOG_MAX) : log;
  return next.length ? { ...rest, rewatchLog: next } : (() => { const { rewatchLog: _l, ...r } = rest; return r; })(); // eslint-disable-line no-unused-vars
}

// After a tick: is the round complete (every aired episode done)?
export const roundComplete = (show, today) => isRewatching(show) && rewatchProgress(show, today).left === 0 && rewatchProgress(show, today).total > 0;

// The latest day you watched anything of the show, rewatch ticks included.
export function latestWatch(show) {
  let latest = null;
  for (const w of Object.values((show && show.watched) || {})) if (w && w.at && (!latest || w.at > latest)) latest = w.at;
  for (const at of Object.values(doneMap(show))) if (typeof at === 'string' && (!latest || at > latest)) latest = at;
  return latest;
}

// "Rewatching · round 2 · 5 of 26"
export const roundLabel = (show, today) => {
  const p = rewatchProgress(show, today);
  return `Rewatch #${roundOf(show) - 1} · ${p.done} of ${p.total}`;
};
