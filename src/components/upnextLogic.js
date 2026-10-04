// Pure logic behind the redesigned Up Next page. No React and no store
// imports (db.js touches localStorage when loaded), so it can be unit-tested
// with plain node. The two store helpers it needs are passed in.

import { nextToMark } from './showLogic.js';

export const pad2 = (n) => String(n).padStart(2, '0');

const WEEKDAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const MON3 = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const MONTH_NAMES = [
  'JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE',
  'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER',
];

// "S08·E14" — the episode code used across the redesign.
export const codeOf = (s, e) => `S${pad2(s)}·E${pad2(e)}`;

// ---------------------------------------------------------------- dates
function parseISO(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  if (!m) return null;
  const [y, mo, d] = [+m[1], +m[2], +m[3]];
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return { y, mo, d };
}

// Whole calendar days from isoA to isoB (negative if B is earlier). Done in
// UTC on the date parts, so daylight-saving changes can't make a day 23 or 25
// hours long.
export function daysBetween(isoA, isoB) {
  const a = parseISO(isoA);
  const b = parseISO(isoB);
  if (!a || !b) return null;
  return Math.round((Date.UTC(b.y, b.mo - 1, b.d) - Date.UTC(a.y, a.mo - 1, a.d)) / 86400000);
}

// Weekday / day / month for a YYYY-MM-DD string. The weekday of a calendar
// date doesn't depend on timezone, so it's computed in UTC.
export function dateParts(iso) {
  const p = parseISO(iso);
  if (!p) return null;
  const wd = new Date(Date.UTC(p.y, p.mo - 1, p.d)).getUTCDay();
  return { wd: WEEKDAYS[wd], d: p.d, mon: MON3[p.mo - 1], monthIndex: p.mo - 1, year: p.y };
}

// "WED 30 SEP" — the page header's date.
export function headerDate(todayIso) {
  const p = dateParts(todayIso);
  return p ? `${p.wd} ${p.d} ${p.mon}` : '';
}

// "12 Oct" (adds the year only when it isn't this year) — for finish estimates.
export function shortDate(iso, todayIso) {
  const p = dateParts(iso);
  if (!p) return '';
  const mon = p.mon.charAt(0) + p.mon.slice(1).toLowerCase();
  const sameYear = !todayIso || String(p.year) === todayIso.slice(0, 4);
  return `${p.d} ${mon}${sameYear ? '' : ' ' + p.year}`;
}

// "TODAY" / "+2 D" under the day number in the agenda.
export function relLabel(iso, todayIso) {
  const n = daysBetween(todayIso, iso);
  if (n === null) return '';
  if (n === 0) return 'TODAY';
  return n > 0 ? `+${n} D` : `${n} D`;
}

// ---------------------------------------------------------------- the page data
// entries: [[id, show], …]. h: { watchedCount, lastWatchDate } (from db.js).
//
//   cont         shows you can continue now, most-recently-watched first. A
//                show appears only if it has an episode that has aired and is
//                still unwatched (the SAME nextToMark the show page uses) —
//                or has no season data yet, so a not-yet-synced show isn't
//                silently hidden (it just gets no mark button). A mid-season
//                show you're caught up on is NOT here; it shows up under "On
//                the way" with its air date instead.
//   items        every still-to-air episode of followed (not dropped) shows, soonest first
//   syncTargets  shows we can pull the full upcoming list for
export function buildUpNext(entries, today, h) {
  const cont = [];
  const items = [];
  const syncTargets = [];

  for (const [id, show] of entries) {
    if (!show.followed) continue;
    if (show.dropped === true) continue; // dropped: not in Continue, not on the way, not refreshed

    const seen = h.watchedCount(show);
    const total = show.totalEpisodes;
    if (seen > 0 && (!total || seen < total)) {
      const next = nextToMark(show, today);
      const hasSeasons = (show.seasons || []).some((se) => se.n >= 1 && se.count > 0);
      if (next || !hasSeasons) cont.push({ id, show, next });
    }

    if (show.tmdbId && show.nextAir) syncTargets.push([id, show]);

    // Prefer the cached full list for the airing season; fall back to the
    // single nextAir so the agenda works before the first refresh.
    const cached = Array.isArray(show.upcoming)
      ? show.upcoming.filter((ep) => ep.air >= today)
      : [];
    if (cached.length) {
      for (const ep of cached) items.push({ id, show, s: ep.s, e: ep.e, name: ep.name, date: ep.air });
    } else if (show.nextAir && show.nextAir.date >= today) {
      items.push({
        id, show, s: show.nextAir.season, e: show.nextAir.episode,
        name: show.nextAir.name, date: show.nextAir.date,
      });
    }
  }

  cont.sort(
    (a, b) =>
      (h.lastWatchDate(b.show) || '').localeCompare(h.lastWatchDate(a.show) || '') ||
      a.show.name.localeCompare(b.show.name)
  );
  items.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      a.show.name.localeCompare(b.show.name) ||
      a.s - b.s ||
      a.e - b.e
  );
  return { cont, items, syncTargets };
}

// Group the (date-sorted) upcoming items by air date for the agenda. Each group
// carries what the date column needs, plus `monthLabel` when the month changes
// from the previous group (or from today, for the first one) so a long agenda
// that spans months still reads clearly.
export function groupAgenda(items, today) {
  const groups = [];
  let cur = null;
  let prevYM = (today || '').slice(0, 7);
  const todayYear = (today || '').slice(0, 4);
  for (const it of items) {
    if (!cur || cur.date !== it.date) {
      const p = dateParts(it.date);
      if (!p) continue;
      const ym = it.date.slice(0, 7);
      let monthLabel = null;
      if (ym !== prevYM) {
        monthLabel = MONTH_NAMES[p.monthIndex] + (String(p.year) !== todayYear ? ` ${p.year}` : '');
        prevYM = ym;
      }
      cur = {
        date: it.date, wd: p.wd, d: p.d, rel: relLabel(it.date, today),
        isToday: it.date === today, monthLabel, items: [],
      };
      groups.push(cur);
    }
    if (cur && cur.date === it.date) cur.items.push(it);
  }
  return groups;
}

// ---------------------------------------------------------------- mark guard
// After a show's next episode is marked, the same button immediately points at
// the following episode — so a quick double-tap would silently mark two. Taps
// on the same show closer together than this window are ignored.
export const MARK_COOLDOWN_MS = 700;
export function isRepeatTap(lastMs, nowMs, windowMs = MARK_COOLDOWN_MS) {
  return typeof lastMs === 'number' && nowMs - lastMs >= 0 && nowMs - lastMs < windowMs;
}
