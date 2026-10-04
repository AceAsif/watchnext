// PURE: the numbers for "Month in review". No DOM, no store.
//
// Months are the person's LOCAL calendar months (the device's timezone), so an 8am
// watch on 1 October counts as October. The rest of Stats groups by the stored UTC
// date; for a whole year that rarely matters, but for months it would push every
// early-morning watch on the 1st into the previous month. (This is the same local
// date the CSV export gives.)
//
// Counting follows the Year card: an episode record counts every viewing (`n`) on
// the date of its latest watch; hours = TV minutes + movie minutes; Days = distinct
// days with any watch.

import { localDate } from './csvExport.js';

export const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const BAD_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const YM = /^(\d{4})-(\d{2})$/;

export const monthKeyOf = (iso) => {
  const d = localDate(iso);
  return d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d.slice(0, 7) : '';
};
const parts = (ym) => { const m = YM.exec(ym); return m ? { y: Number(m[1]), m: Number(m[2]) } : null; };
export function monthName(ym) { const p = parts(ym); return p ? MONTH_NAMES[p.m - 1] : ''; }
export function monthLabel(ym) { const p = parts(ym); return p ? `${MONTH_NAMES[p.m - 1]} ${p.y}` : ''; }
export function prevMonth(ym) {
  const p = parts(ym);
  if (!p) return '';
  return p.m === 1 ? `${p.y - 1}-12` : `${p.y}-${String(p.m - 1).padStart(2, '0')}`;
}
export const currentMonthKey = (now = new Date()) => `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

const num = (v, dflt) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : dflt);
const count = (n) => { const v = Math.floor(Number(n)); return Number.isFinite(v) && v >= 1 ? v : 1; };

// One pass over everything -> { 'YYYY-MM': { episodes, minutes, movies, days:Set, perDay, perShow, genre } }
export function collectMonths(shows, movies) {
  const out = {};
  const get = (ym) => out[ym] || (out[ym] = { episodes: 0, minutes: 0, movies: 0, days: new Set(), perDay: {}, perShow: {}, genre: {} });
  for (const [id, s] of Object.entries(shows || {})) {
    if (BAD_KEYS.has(id) || !s || typeof s !== 'object') continue;
    for (const w of Object.values(s.watched || {})) {
      if (!w || typeof w !== 'object' || !w.at) continue;
      const day = localDate(w.at);
      const ym = /^\d{4}-\d{2}-\d{2}$/.test(day) ? day.slice(0, 7) : '';
      if (!ym) continue;
      const n = count(w.n);
      const m = get(ym);
      m.episodes += n;
      m.minutes += num(w.min, 40) * n;
      m.days.add(day);
      m.perDay[day] = (m.perDay[day] || 0) + n;
      const ps = m.perShow[id] || (m.perShow[id] = { name: String(s.name || 'Untitled'), poster: s.poster || null, count: 0 });
      ps.count += n;
      for (const g of Array.isArray(s.genres) ? s.genres : []) if (typeof g === 'string' && g) m.genre[g] = (m.genre[g] || 0) + n;
    }
  }
  for (const mv of Array.isArray(movies) ? movies : []) {
    if (!mv || typeof mv !== 'object' || (mv.status || 'watched') !== 'watched' || !mv.watchedAt) continue;
    const day = localDate(mv.watchedAt);
    const ym = /^\d{4}-\d{2}-\d{2}$/.test(day) ? day.slice(0, 7) : '';
    if (!ym) continue;
    const m = get(ym);
    m.movies += 1;
    m.minutes += num(mv.runtimeMin, 110);
    m.days.add(day);
  }
  return out;
}

// Months that have any activity, newest first.
export const monthList = (months) =>
  Object.keys(months).filter((k) => months[k].episodes > 0 || months[k].movies > 0).sort((a, b) => b.localeCompare(a));
export const monthOptions = (list) => list.map((ym) => ({ value: ym, label: monthLabel(ym) }));

const dayLabel = (day) => {
  const [y, m, d] = day.split('-').map(Number);
  return `${WEEKDAY_SHORT[new Date(y, m - 1, d).getDay()]} ${d} ${MONTH_SHORT[m - 1]}`;
};

// The card data for one month (same shape as the Year card, plus `facts`), or null.
export function monthReview(months, ym, nowYM) {
  const p = parts(ym);
  const m = months[ym];
  if (!p || !m || (m.episodes === 0 && m.movies === 0)) return null;

  const topShows = Object.values(m.perShow).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)).slice(0, 3);
  const topGenre = Object.entries(m.genre).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
  let busiest = null;
  for (const [day, n] of Object.entries(m.perDay)) if (!busiest || n > busiest.n || (n === busiest.n && day < busiest.day)) busiest = { day, n };

  const prev = prevMonth(ym);
  const prevEps = months[prev] ? months[prev].episodes : 0;
  const prevLabel = prev && parts(prev).y !== p.y ? monthLabel(prev) : monthName(prev);
  const facts = [];
  if (busiest) facts.push(['BUSIEST DAY', `${dayLabel(busiest.day)} · ${busiest.n} ${busiest.n === 1 ? 'ep' : 'eps'}`]);
  if (topGenre) facts.push(['TOP GENRE', topGenre[0]]);

  return {
    ym,
    name: MONTH_NAMES[p.m - 1],
    yearNum: p.y,
    partial: ym === nowYM,
    episodes: m.episodes,
    hours: Math.round(m.minutes / 60),
    movies: m.movies,
    activeDays: m.days.size,
    topShows,
    topGenre: topGenre ? topGenre[0] : null,
    busiestDay: busiest ? { date: busiest.day, label: dayLabel(busiest.day), episodes: busiest.n } : null,
    facts,
    prevYear: prevEps ? prevLabel : null, // wording slot after "than": the previous month
    epDelta: prevEps ? Math.round(((m.episodes - prevEps) / prevEps) * 100) : null,
  };
}

export const monthCaption = (r) => `MONTH IN REVIEW · ${r.yearNum}${r.partial ? ' · SO FAR' : ''}`;
export const monthSub = (r) => `${r.yearNum}${r.partial ? ' · so far' : ''}`;

export function monthShareLine(r) {
  return [
    `My ${r.name} ${r.yearNum}${r.partial ? ' so far' : ''} on WatchNext:`,
    `${r.episodes.toLocaleString()} episodes (${r.hours.toLocaleString()} hrs) + ${r.movies} movie${r.movies === 1 ? '' : 's'}.`,
    r.topShows[0] ? `Top show: ${r.topShows[0].name}.` : '',
    r.busiestDay ? `Busiest day: ${r.busiestDay.label}.` : '',
  ].filter(Boolean).join(' ');
}
