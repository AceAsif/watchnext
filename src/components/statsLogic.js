// Pure logic for the Stats page. No React, no store imports, so it can be
// unit-tested with plain node.
//
// The first half is the de-skewing logic that used to live inside Stats.jsx,
// moved here VERBATIM (same behaviour) so it can be tested. The second half is
// new: the heatmap grid, label helpers and tab keyboard navigation.

export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// A "minute" holding this many watches or more is treated as one bulk/import
// batch (marking a backlog on a single date), not real viewing. Real binges
// carry their own per-episode timestamps and stay untouched. Chosen from the
// data: real days top out around a few watches per minute, while import
// batches pack hundreds into one timestamp.
// KEEP IN SYNC with PACE_BATCH_MIN in store/db.js (a unit test checks this).
export const BATCH_MIN = 15;

export function fmtDay(ds) {
  if (!ds) return '';
  const [y, m, d] = ds.split('-').map(Number);
  if (!y || !m || !d) return ds;
  return `${d} ${MONTHS[m - 1]} ${y}`;
}
export function weekdayOf(ds) {
  const [y, m, d] = ds.split('-').map(Number);
  return new Date(y, m - 1, d).getDay();
}
// whole-day number, for consecutive-day math (UTC-based so no DST drift)
export function dayNum(ds) {
  const [y, m, d] = ds.split('-').map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86400000);
}

// A "real" day = a day with at least one watch that is NOT part of a bulk batch (a minute with
// BATCH_MIN+ watches). A day that only holds a bulk-marked backlog or import is not a day you
// really watched on, so it must not count as a streak day, an active day or a lit heatmap cell.
// events: [{ day, minute }]. Returns a Set of 'YYYY-MM-DD'.
export function realDaySet(events) {
  const list = Array.isArray(events) ? events : [];
  const minuteCount = {};
  for (const e of list) minuteCount[e.minute] = (minuteCount[e.minute] || 0) + 1;
  const days = new Set();
  for (const e of list) if (minuteCount[e.minute] < BATCH_MIN) days.add(e.day);
  return days;
}

// De-skewed timing stats for a scope (all years or one year).
// - By day of week: each bulk batch (a minute with >= BATCH_MIN watches)
//   contributes ONE event instead of its full size, so a 1,000-watch backlog
//   dump doesn't bury the real weekly rhythm.
// - Most in one day: the busiest REAL day, by distinct timestamps. A bulk batch counts as ONE
//   sitting however its timestamps differ, so a backlog import can't be your "busiest day".
// - Days with a watch: real days only (see realDaySet). bulkOnlyDays says how many were left out.
export function computeHabits(events, year) {
  const evs = year === 'all' ? events : events.filter((e) => e.year === year);

  const minuteCount = {};
  for (const e of evs) minuteCount[e.minute] = (minuteCount[e.minute] || 0) + 1;

  const dow = [0, 0, 0, 0, 0, 0, 0]; // Sun..Sat
  const sittingsPerDay = {}; // day -> Set of real timestamps + one entry per bulk batch
  const realDays = new Set();
  const allDays = new Set();
  const seenBatchMinute = new Set();
  let batchMinutes = 0; // how many batches we collapsed
  let batchWatches = 0; // how many raw watches those batches represented

  for (const e of evs) {
    allDays.add(e.day);
    const set = sittingsPerDay[e.day] || (sittingsPerDay[e.day] = new Set());
    if (minuteCount[e.minute] >= BATCH_MIN) {
      set.add('batch:' + e.minute);
      batchWatches++;
      if (!seenBatchMinute.has(e.minute)) {
        seenBatchMinute.add(e.minute);
        batchMinutes++;
        dow[e.wd] += 1; // whole batch = a single event
      }
    } else {
      realDays.add(e.day);
      set.add(e.ts);
      dow[e.wd] += 1;
    }
  }

  let busiest = null;
  for (const [d, set] of Object.entries(sittingsPerDay)) {
    if (!realDays.has(d)) continue; // an import-only day is never "busiest"
    if (!busiest || set.size > busiest.count) busiest = { date: d, count: set.size };
  }

// Display Mon-first; DOW/dow are indexed Sun..Sat.
  const dowRows = [1, 2, 3, 4, 5, 6, 0].map((i) => ({ label: DOW[i], value: dow[i] }));

  return { dowRows, busiest, activeDays: realDays.size, bulkOnlyDays: allDays.size - realDays.size, batchMinutes, batchWatches };
}

// Busiest month for a single year, de-skewed the same way (a bulk batch counts
// once). Returns { name, count } or null.
export function busiestMonthOf(events, year) {
  const evs = events.filter((e) => e.year === year);
  if (!evs.length) return null;
  const minuteCount = {};
  for (const e of evs) minuteCount[e.minute] = (minuteCount[e.minute] || 0) + 1;
  const months = new Array(12).fill(0);
  const seen = new Set();
  for (const e of evs) {
    const mi = Number(e.day.slice(5, 7)) - 1;
    if (minuteCount[e.minute] >= BATCH_MIN) {
      if (!seen.has(e.minute)) { seen.add(e.minute); months[mi]++; }
    } else {
      months[mi]++;
    }
  }
  let best = 0;
  for (let i = 1; i < 12; i++) if (months[i] > months[best]) best = i;
  return { name: MONTHS[best], count: months[best] };
}

export function activeDaysOf(events, year) {
  const real = realDaySet(events.filter((e) => e.year === year));
  return real.size;
}

// ===================================================================== new

// "3–17 MAR 2019" / "28 FEB – 14 MAR 2019" / "28 DEC 2018 – 14 JAN 2019" — the
// longest streak's dates in a form short enough for a tile label.
export function streakRangeLabel(from, to) {
  if (!from || !to) return '';
  const [y1, m1, d1] = from.split('-').map(Number);
  const [y2, m2, d2] = to.split('-').map(Number);
  if (!y1 || !y2) return '';
  const M = (m) => MONTHS[m - 1].toUpperCase();
  if (y1 === y2 && m1 === m2) return d1 === d2 ? `${d1} ${M(m1)} ${y1}` : `${d1}–${d2} ${M(m1)} ${y1}`;
  if (y1 === y2) return `${d1} ${M(m1)} – ${d2} ${M(m2)} ${y1}`;
  return `${d1} ${M(m1)} ${y1} – ${d2} ${M(m2)} ${y2}`;
}

// Heat colour bucket for a day's (de-skewed) watch count.
export function heatLevel(c) {
  if (!c) return 0;
  if (c <= 2) return 1;
  if (c <= 4) return 2;
  if (c <= 7) return 3;
  return 4;
}

const ymd = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// The year as a Sunday-first contribution grid: whole weeks of 7 cells covering
// 1 Jan..31 Dec, padded with out-of-year cells at both ends.
//
// IMPORTANT: every cell is built from CALENDAR arithmetic — new Date(y, 0, n)
// is local midnight of that date, whatever the daylight-saving rules. The old
// grid stepped a timestamp forward by 86,400,000 ms, which is wrong on the 25-
// hour day clocks go back: in Hobart that duplicated 5 April and skipped 4
// October, and ~180 days landed in the wrong weekday row.
//
// today (YYYY-MM-DD, optional) marks later days of the current year `future`,
// so they can be drawn dimmer than genuinely empty past days.
export function buildYearGrid(year, countsByDay = {}, today = null) {
  const jan1 = new Date(year, 0, 1);
  const dec31 = new Date(year, 11, 31);
  const lead = jan1.getDay(); // blank cells before 1 Jan (Sunday-first)
  const trail = 6 - dec31.getDay(); // blank cells after 31 Dec
  const daysInYear = Math.round((Date.UTC(year, 11, 31) - Date.UTC(year, 0, 1)) / 86400000) + 1;
  const n = lead + daysInYear + trail;

  const cells = [];
  let total = 0;
  let activeDays = 0;
  for (let i = 0; i < n; i++) {
    const dt = new Date(year, 0, 1 - lead + i);
    const ds = ymd(dt);
    const inYear = dt.getFullYear() === year;
    const count = inYear ? countsByDay[ds] || 0 : 0;
    if (count > 0) { total += count; activeDays++; }
    cells.push({
      ds,
      day: dt.getDate(),
      month: dt.getMonth(),
      inYear,
      count,
      future: !!(inYear && today && ds > today),
    });
  }

  const columns = [];
  for (let i = 0; i < cells.length; i += 7) columns.push(cells.slice(i, i + 7));

  // one label per month, on the week column that contains the 1st
  const months = [];
  columns.forEach((col, ci) => {
    const first = col.find((c) => c.inYear && c.day === 1);
    if (first) months.push({ col: ci, month: first.month });
  });

  return { columns, months, total, activeDays };
}

// Which cell is under a point inside the grid? fx/fy are fractions (0..1) of
// the grid's width/height. Lets a tap on a tiny phone-sized cell still pick a
// day. Returns the cell, or null for blank/out-of-year cells.
export function cellAtFraction(columns, fx, fy) {
  if (!columns.length) return null;
  const col = Math.min(columns.length - 1, Math.max(0, Math.floor(fx * columns.length)));
  const row = Math.min(6, Math.max(0, Math.floor(fy * 7)));
  const c = columns[col][row];
  return c && c.inYear ? c : null;
}

// Width (px) for a bar chart's label / value column, from the longest text, so
// short labels (Mon) don't waste room and long ones (Prime Video) don't clip.
export function labelWidthFor(labels, min = 30, max = 128) {
  const longest = labels.reduce((m, l) => Math.max(m, String(l).length), 0);
  return Math.min(max, Math.max(min, Math.round(longest * 7.2 + 8)));
}
export function valueWidthFor(values, unit = '', min = 32) {
  const longest = values.reduce((m, v) => Math.max(m, (v.toLocaleString() + unit).length), 0);
  return Math.max(min, Math.round(longest * 7.4 + 4));
}

// Bar widths as % of the largest value, and which row is the top one.
export function barRows(rows) {
  const max = Math.max(...rows.map((r) => r.value), 0);
  const top = max > 0 ? rows.findIndex((r) => r.value === max) : -1;
  return rows.map((r, i) => ({
    ...r,
    pct: max > 0 ? Math.round((r.value / max) * 100) : 0,
    isTop: i === top,
  }));
}

// Left/Right/Home/End move between tabs (wrapping), as a tab list should.
export function nextTab(tabs, current, key) {
  const i = tabs.indexOf(current);
  if (i < 0) return null;
  if (key === 'ArrowRight') return tabs[(i + 1) % tabs.length];
  if (key === 'ArrowLeft') return tabs[(i - 1 + tabs.length) % tabs.length];
  if (key === 'Home') return tabs[0];
  if (key === 'End') return tabs[tabs.length - 1];
  return null;
}

// Total watch time as years + months + days, for the Overview headline. A month here is the average
// calendar month (30.4375 days), because this is a length of time, not a date range; 12 months is a year.
// -> { years, months, days, total } where months is 0-11 and total = whole days (rounded).
export const DAYS_PER_MONTH = 30.4375;
export function durationParts(minutes) {
  const m = Number(minutes);
  const total = Number.isFinite(m) && m > 0 ? Math.round(m / 60 / 24) : 0;
  let allMonths = Math.floor(total / DAYS_PER_MONTH);
  let days = Math.round(total - allMonths * DAYS_PER_MONTH);
  if (days >= 30) { allMonths += 1; days = 0; } // 30 days left is a month (never "11 months 30 days")
  return { years: Math.floor(allMonths / 12), months: allMonths % 12, days, total };
}

// The Overview's time tiles, all from exact minutes (never from already-rounded hours, so the
// combined figure is not off by a rounding error). tv / movies / both each give
// { minutes, hours (rounded), days (1 decimal, as text), span: durationParts(...) }.
export function timeTotals(tvMinutes, movieMinutes) {
  const clean = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : 0);
  const one = (min) => ({ minutes: min, hours: Math.round(min / 60), days: (min / 60 / 24).toFixed(1), span: durationParts(min) });
  const tv = clean(tvMinutes), movies = clean(movieMinutes);
  return { tv: one(tv), movies: one(movies), both: one(tv + movies) };
}
