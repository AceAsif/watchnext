// PURE: helpers for correcting when episodes were watched ("Fix watch dates") and
// for the "When did you watch this?" question. No DOM, no store.
//
// Marking an episode stamps "right now", so logging a show you watched years ago
// puts it in the current month and year. These helpers let the person pick the real
// date. A date is always required (there is no "unknown"): the stamp is local noon
// on the chosen day, so it lands on that day in every timezone.

import { localDate } from './csvExport.js';
import { fmtDay } from './statsLogic.js';

export const EARLIEST_DAY = '1980-01-01';
const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;
const MIN_CLUSTER = 3; // a "marked on <day>" choice is offered for days with at least this many episodes
const MAX_CLUSTERS = 4;

export function isValidDay(ymd) {
  const m = DAY.exec(String(ymd || ''));
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(y, mo - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === mo - 1 && dt.getDate() === d;
}
// A real calendar day, not before 1980, not after today.
export const isAllowedDay = (ymd, todayYmd) => isValidDay(ymd) && ymd >= EARLIEST_DAY && ymd <= todayYmd;

// The timestamp to store for a chosen day: local noon that day, but never in the
// future (picking today at 8am must not stamp 12:00 today).
export function stampForDay(ymd, now = new Date()) {
  const [y, m, d] = ymd.split('-').map(Number);
  const noon = new Date(y, m - 1, d, 12, 0, 0);
  return (noon > now ? now : noon).toISOString();
}

// Watched episodes of a show: [{ key, season, episode, at, day }], oldest first.
export function watchedList(show) {
  const out = [];
  for (const [key, w] of Object.entries((show && show.watched) || {})) {
    const m = /^(\d+)x(\d+)$/.exec(key);
    if (!m || !w || typeof w !== 'object') continue;
    const at = typeof w.at === 'string' ? w.at : '';
    const day = at ? localDate(at) : '';
    out.push({ key, season: Number(m[1]), episode: Number(m[2]), at, day: DAY.test(day) ? day : '' });
  }
  return out.sort((a, b) => a.season - b.season || a.episode - b.episode);
}

const plural = (n, one, many) => `${n.toLocaleString()} ${n === 1 ? one : many}`;

// The choices for "which episodes?": everything; each season (when there are several);
// and days on which several were marked together (that is how a bulk-marked show shows up).
export function dateScopes(show) {
  const list = watchedList(show);
  if (!list.length) return [];
  const all = { id: 'all', label: `All watched episodes (${list.length})`, keys: list.map((e) => e.key) };
  const scopes = [all];

  const bySeason = new Map();
  for (const e of list) bySeason.set(e.season, [...(bySeason.get(e.season) || []), e.key]);
  if (bySeason.size > 1) for (const [s, keys] of bySeason) scopes.push({ id: `s${s}`, label: `Season ${s} (${keys.length})`, keys });

  const byDay = new Map();
  for (const e of list) if (e.day) byDay.set(e.day, [...(byDay.get(e.day) || []), e.key]);
  [...byDay.entries()]
    .filter(([, keys]) => keys.length >= MIN_CLUSTER && keys.length < list.length)
    .sort((a, b) => b[1].length - a[1].length || b[0].localeCompare(a[0]))
    .slice(0, MAX_CLUSTERS)
    .forEach(([day, keys]) => scopes.push({ id: `d:${day}`, label: `Marked on ${fmtDay(day)} (${keys.length})`, keys }));
  return scopes;
}

export function describeRange(show) {
  const days = watchedList(show).map((e) => e.day).filter(Boolean).sort();
  if (!days.length) return '';
  const a = days[0], b = days[days.length - 1];
  return a === b ? `Currently dated ${fmtDay(a)}.` : `Currently dated between ${fmtDay(a)} and ${fmtDay(b)}.`;
}

export const fixPreview = (count, ymd) => `${plural(count, 'episode', 'episodes')} will be dated ${fmtDay(ymd)}.`;
export const fixedToast = (count, ymd) => `Updated ${plural(count, 'episode', 'episodes')} to ${fmtDay(ymd)}`;
