// "This month vs the same month last year". PURE: no DOM, no store.
//
// Fair comparison: for the month you're in, only days 1..today are compared with the SAME
// days last year ("October 1–22, 2026 vs October 1–22, 2025"); the whole of last year's month
// is shown underneath. A past month is compared in full.
//
// Months and days are LOCAL (like Month in review). Each viewing counts on its own day where
// we know it: the first watch on its date, a "+1" on its `last` date and a rewatch tick on its
// rewatch date. Any other extra viewings count on the first date (as in Month in review).

import { localDate } from './csvExport.js';
import { MONTH_NAMES, currentMonthKey } from './monthRecapLogic.js';

const BAD = new Set(['__proto__', 'constructor', 'prototype']);
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const mins = (v, d) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : d);
const cnt = (n) => { const v = Math.floor(Number(n)); return Number.isFinite(v) && v >= 1 ? v : 1; };

// Every viewing as [localDay, kind, minutes, showId|null, showName|null].
export function viewings(shows, movies) {
  const out = [];
  for (const [id, s] of Object.entries(shows || {})) {
    if (BAD.has(id) || !s || typeof s !== 'object') continue;
    const done = s.rewatch && s.rewatch.done && typeof s.rewatch.done === 'object' ? s.rewatch.done : {};
    for (const [k, w] of Object.entries(s.watched || {})) {
      if (!w || typeof w !== 'object' || !w.at) continue;
      const m = mins(w.min, mins(s.runtimeMin, 40));
      const dates = [w.at];
      let extra = cnt(w.n) - 1;
      if (extra > 0 && typeof done[k] === 'string') { dates.push(done[k]); extra--; }
      if (extra > 0 && typeof w.last === 'string') { dates.push(w.last); extra--; }
      for (; extra > 0; extra--) dates.push(w.at);
      for (const at of dates) {
        const day = localDate(at);
        if (DAY_RE.test(day)) out.push([day, 'ep', m, id, String(s.name || 'Untitled')]);
      }
    }
  }
  for (const mv of Array.isArray(movies) ? movies : []) {
    if (!mv || typeof mv !== 'object' || (mv.status || 'watched') !== 'watched' || !mv.watchedAt) continue;
    const day = localDate(mv.watchedAt);
    if (DAY_RE.test(day)) out.push([day, 'movie', mins(mv.runtimeMin, 110), null, null]);
  }
  return out;
}

const pad = (n) => String(n).padStart(2, '0');
const daysIn = (y, m) => new Date(y, m, 0).getDate();
export const sameMonthLastYear = (ym) => `${Number(ym.slice(0, 4)) - 1}${ym.slice(4)}`;

// Totals for month ym, days 1..upTo (inclusive).
export function totals(views, ym, upTo = 31) {
  const t = { episodes: 0, minutes: 0, movies: 0, days: 0, top: null };
  const days = new Set();
  const per = {};
  const last = `${ym}-${pad(upTo)}`;
  for (const [day, kind, m, id, name] of views) {
    if (day.slice(0, 7) !== ym || day > last) continue;
    days.add(day);
    t.minutes += m;
    if (kind === 'movie') t.movies++;
    else {
      t.episodes++;
      const p = per[id] || (per[id] = { name, count: 0 });
      p.count++;
    }
  }
  t.days = days.size;
  t.top = Object.values(per).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))[0] || null;
  return t;
}

// The months you can pick: every month with watching that has the same month a year earlier
// inside your history, newest first, always starting with this month.
export function compareMonths(views, nowYM) {
  const have = new Set(views.map((v) => v[0].slice(0, 7)));
  const first = [...have].sort()[0];
  const list = [...have].filter((ym) => ym !== nowYM && first && sameMonthLastYear(ym) >= first).sort((a, b) => b.localeCompare(a));
  return [nowYM, ...list];
}

// change from b to a: { diff, pct } — pct null when last year was 0
export function delta(a, b) {
  return { diff: a - b, pct: b > 0 ? Math.round(((a - b) / b) * 100) : null };
}

const label = (ym) => `${MONTH_NAMES[Number(ym.slice(5)) - 1]} ${ym.slice(0, 4)}`;
const range = (ym, upTo, full) => (full ? label(ym) : `${MONTH_NAMES[Number(ym.slice(5)) - 1].slice(0, 3)} 1–${upTo}, ${ym.slice(0, 4)}`);

// Everything the card shows for month ym. today: 'YYYY-MM-DD' (local).
export function compare(views, ym, today) {
  const y = Number(ym.slice(0, 4));
  const m = Number(ym.slice(5));
  const partial = today.slice(0, 7) === ym;
  // Last year's month may be shorter (29 Feb): compare up to the same day or its last day.
  const upTo = partial ? Number(today.slice(8)) : daysIn(y, m);
  const lastYM = sameMonthLastYear(ym);
  const lastUpTo = Math.min(upTo, daysIn(y - 1, m));
  const now = totals(views, ym, upTo);
  const then = totals(views, lastYM, lastUpTo);
  const thenFull = totals(views, lastYM, 31);
  const hours = (t) => Math.round(t.minutes / 60);
  const rows = [
    { id: 'hours', label: 'Hours', now: hours(now), then: hours(then) },
    { id: 'episodes', label: 'Episodes', now: now.episodes, then: then.episodes },
    { id: 'movies', label: 'Movies', now: now.movies, then: then.movies },
    { id: 'days', label: 'Days you watched', now: now.days, then: then.days },
  ].map((r) => ({ ...r, ...delta(r.now, r.then) }));
  return {
    ym, lastYM, partial, upTo,
    nowLabel: partial ? range(ym, upTo, false) : label(ym),
    thenLabel: partial ? range(lastYM, lastUpTo, false) : label(lastYM),
    rows,
    now, then,
    thenFull: partial ? { label: label(lastYM), episodes: thenFull.episodes, hours: hours(thenFull), movies: thenFull.movies } : null,
    headline: headline(now.minutes, then.minutes, partial, lastYM),
    empty: now.minutes === 0 && then.minutes === 0,
  };
}

// "34% more than October 2025 so far" / "About the same as …" / "Nothing to compare with …"
export function headline(nowMin, thenMin, partial, lastYM) {
  const when = `${label(lastYM)}${partial ? ' at this point' : ''}`;
  if (thenMin <= 0) return nowMin > 0 ? `You didn’t watch anything in ${when}` : `Nothing watched in either month yet`;
  if (nowMin <= 0) return `Nothing yet this month · ${fmtH(thenMin)} in ${when}`;
  const pct = Math.round(((nowMin - thenMin) / thenMin) * 100);
  if (Math.abs(pct) < 5) return `About the same as ${when}`;
  if (pct >= 100) return `${(nowMin / thenMin).toFixed(1).replace(/\.0$/, '')}× as much as ${when}`;
  return `${Math.abs(pct)}% ${pct > 0 ? 'more' : 'less'} than ${when}`;
}
const fmtH = (m) => (m < 60 ? `${Math.round(m)} min` : `${Math.round(m / 60)} hrs`);

// "+12" / "−3" / "same"
export const diffText = (d) => (d === 0 ? 'same' : `${d > 0 ? '+' : '−'}${Math.abs(d).toLocaleString('en-AU')}`);

export { currentMonthKey, label as monthYearLabel };
