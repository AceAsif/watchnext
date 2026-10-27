// More stats: "Biggest binges" (Stats → Habits) and "Genres over time" (Stats → Breakdown).
// PURE: no DOM, no store. Days and years are YOUR local ones (localDate), like every Stats card.

import { localDate } from './csvExport.js';
import { viewingDates, doneDates } from './viewingDates.js';
import { BATCH_MIN } from './statsLogic.js';

const BAD_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const num = (v, dflt) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : dflt);
const minuteKey = (at) => String(at).slice(0, 16); // same-minute ticks = a bulk import or "mark season"

// ------------------------------------------------------------------ binges
// A binge = most episodes of ONE show on ONE day (your local day). Only viewings with their own
// date count, and a bulk-marked batch (BATCH_MIN+ ticks in the same minute, e.g. an import or
// "mark season watched") is left out, so backlog dumps don't look like a 40-episode day.
// year: 'all' or 'YYYY'. Returns the top `limit`, most episodes first:
//   [{ id, name, poster, day, eps, minutes }]   (2 episodes or more)
export function binges(shows, { year = 'all', limit = 5 } = {}) {
  const views = [];
  const perMinute = new Map();
  for (const [id, s] of Object.entries(isObj(shows) ? shows : {})) {
    if (BAD_KEYS.has(id) || !isObj(s)) continue;
    const done = doneDates(s);
    for (const [k, w] of Object.entries(isObj(s.watched) ? s.watched : {})) {
      if (!isObj(w)) continue;
      for (const v of viewingDates(w, done[k])) {
        if (!v.own) continue;
        const day = localDate(v.at);
        if (!day) continue;
        const mk = minuteKey(v.at);
        perMinute.set(mk, (perMinute.get(mk) || 0) + 1);
        views.push({ id, day, mk, min: num(w.min, num(s.runtimeMin, 40)) });
      }
    }
  }
  const groups = new Map();
  for (const v of views) {
    if (perMinute.get(v.mk) >= BATCH_MIN) continue;
    if (year !== 'all' && v.day.slice(0, 4) !== String(year)) continue;
    const key = v.id + '|' + v.day;
    const g = groups.get(key) || { id: v.id, day: v.day, eps: 0, minutes: 0 };
    g.eps += 1; g.minutes += v.min;
    groups.set(key, g);
  }
  return [...groups.values()]
    .filter((g) => g.eps >= 2)
    .sort((a, b) => b.eps - a.eps || b.minutes - a.minutes || b.day.localeCompare(a.day))
    .slice(0, limit)
    .map((g) => ({ ...g, name: String(shows[g.id].name || 'Untitled'), poster: shows[g.id].poster || null }));
}

// ------------------------------------------------------------------ genres over time
// Each viewing counts once per genre of its title (a "Comedy, Drama" episode counts for both),
// so a genre's share = viewings of titles in that genre ÷ that year's viewings with genre data.
// Shares can add up to more than 100%.
// Returns null with under 2 years of data, else
//   { years: ['2023', …] (oldest first, at most maxYears), rows: [{ genre, shares: [%…], counts: […] }]
//     (the top genres over those years), rising: { genre, from, to } | null, falling: … | null }
export const TREND_MIN_CHANGE = 5; // percentage points before a genre is called rising / falling

export function genreTrends(shows, movies, { maxYears = 5, top = 5 } = {}) {
  const perYear = {}; // year -> { total, g: { genre: n } }
  const add = (at, genres) => {
    const gs = (Array.isArray(genres) ? genres : []).filter((g) => typeof g === 'string' && g);
    if (!gs.length) return;
    const day = localDate(at);
    if (!day) return;
    const y = day.slice(0, 4);
    const t = perYear[y] || (perYear[y] = { total: 0, g: {} });
    t.total += 1;
    for (const g of new Set(gs)) t.g[g] = (t.g[g] || 0) + 1;
  };
  for (const [id, s] of Object.entries(isObj(shows) ? shows : {})) {
    if (BAD_KEYS.has(id) || !isObj(s)) continue;
    const done = doneDates(s);
    for (const [k, w] of Object.entries(isObj(s.watched) ? s.watched : {})) {
      if (!isObj(w)) continue;
      for (const v of viewingDates(w, done[k])) add(v.at, s.genres);
    }
  }
  for (const m of Array.isArray(movies) ? movies : []) {
    if (!isObj(m) || (m.status && m.status !== 'watched') || !m.watchedAt) continue;
    add(m.watchedAt, m.genres);
  }
  const years = Object.keys(perYear).filter((y) => /^\d{4}$/.test(y)).sort().slice(-maxYears);
  if (years.length < 2) return null;
  const sum = {};
  for (const y of years) for (const [g, n] of Object.entries(perYear[y].g)) sum[g] = (sum[g] || 0) + n;
  const genres = Object.keys(sum).sort((a, b) => sum[b] - sum[a] || a.localeCompare(b)).slice(0, top);
  const share = (g, y) => Math.round(((perYear[y].g[g] || 0) / perYear[y].total) * 100);
  const rows = genres.map((g) => ({ genre: g, shares: years.map((y) => share(g, y)), counts: years.map((y) => perYear[y].g[g] || 0) }));
  // Rising / falling: the biggest change between the last two years shown.
  const [a, b] = years.slice(-2);
  let rising = null, falling = null;
  for (const r of rows) {
    const from = share(r.genre, a), to = share(r.genre, b), d = to - from;
    if (d >= TREND_MIN_CHANGE && (!rising || d > rising.to - rising.from)) rising = { genre: r.genre, from, to, fromYear: a, toYear: b };
    if (-d >= TREND_MIN_CHANGE && (!falling || -d > falling.from - falling.to)) falling = { genre: r.genre, from, to, fromYear: a, toYear: b };
  }
  return { years, rows, rising, falling };
}
