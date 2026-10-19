// Letterboxd import — PURE logic (no DOM, no store, no network), unit-tested.
//
// A Letterboxd export (Settings → Import & Export → Export your data on
// letterboxd.com) is a zip of CSV files. We use four of them:
//   watched.csv    Date,Name,Year,Letterboxd URI              every film you've logged
//   diary.csv      Date,Name,Year,Letterboxd URI,Rating,Rewatch,Tags,Watched Date
//   ratings.csv    Date,Name,Year,Letterboxd URI,Rating
//   watchlist.csv  Date,Name,Year,Letterboxd URI
// Diary rows have the real "Watched Date" (one row per viewing, rewatches
// included). Films only in watched.csv fall back to the date you logged them.

import { localISODate } from './showLogic.js';
import { normTitle } from './duplicateMoviesLogic.js';
import { searchWithYear } from './movieSearchLogic.js';
import { cleanRating } from './starsLogic.js';

// ---------------------------------------------------------------- CSV
// RFC 4180: quoted cells, "" escapes, commas/newlines inside quotes, CRLF, BOM.
export function parseCsv(text) {
  const s = String(text == null ? '' : text).replace(/^﻿/, '');
  const rows = [];
  let row = [];
  let cell = '';
  let q = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"') {
        if (s[i + 1] === '"') { cell += '"'; i++; } else q = false;
      } else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some((x) => x !== '')) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x !== '')) rows.push(row);
  return rows;
}

// Header row + data rows -> array of {header: value}. Header names are trimmed.
export function csvRecords(text) {
  const rows = parseCsv(text);
  if (!rows.length) return [];
  const head = rows[0].map((h) => h.trim());
  return rows.slice(1).map((r) => {
    const o = {};
    head.forEach((h, i) => { o[h] = (r[i] || '').trim(); });
    return o;
  });
}

// Which Letterboxd file is this? By file name first, then by its columns.
export function csvKind(name, text) {
  const base = String(name || '').split('/').pop().toLowerCase();
  for (const k of ['watchlist', 'watched', 'diary', 'ratings']) if (base.includes(k) && base.endsWith('.csv')) return k;
  const h = (parseCsv(String(text || '').slice(0, 2000))[0] || []).map((x) => x.trim());
  if (h.includes('Name') && h.includes('Letterboxd URI') && h.includes('Watched Date') && !h.includes('Review')) return 'diary';
  if (h.includes('Name') && h.includes('Letterboxd URI') && h.includes('Rating') && !h.includes('Rewatch')) return 'ratings';
  return null; // watched vs watchlist share columns, so they must be told apart by file name
}

// ---------------------------------------------------------------- plan
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const validDate = (d) => DATE.test(d || '');

// Letterboxd rates in halves (0.5–5), and so do WatchNext movies: kept exactly.
export const starsFrom = (raw) => cleanRating(raw);

// What older versions of the import saved: whole stars, halves rounded up (0.5 -> 1, 3.5 -> 4).
// Used to spot those ratings on a re-import and put the half back.
export function oldWholeStars(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(5, Math.max(1, Math.round(n)));
}

// noon local time, so the day never shifts when the timezone does
export function dayToISO(day) {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0).toISOString();
}

const filmKey = (r) => `${normTitle(r.Name)}|${/^\d{4}$/.test(r.Year || '') ? r.Year : ''}`;

// files: { watched?, diary?, ratings?, watchlist? } each an array of csvRecords.
// Returns { films: [{key, name, year, views:[{day, rating, rewatch}], rating}],
//           watchlist: [{key, name, year, day}], counts }
export function buildPlan(files) {
  const films = new Map();
  const get = (r) => {
    const key = filmKey(r);
    if (!films.has(key)) films.set(key, { key, name: r.Name, year: /^\d{4}$/.test(r.Year || '') ? r.Year : null, views: [], rating: 0, diaryDays: new Set() });
    return films.get(key);
  };
  for (const r of files.diary || []) {
    if (!r.Name) continue;
    const f = get(r);
    const day = validDate(r['Watched Date']) ? r['Watched Date'] : validDate(r.Date) ? r.Date : null;
    if (!day || f.diaryDays.has(day)) continue; // same film twice on one day = one viewing
    f.diaryDays.add(day);
    f.views.push({ day, rating: starsFrom(r.Rating), rewatch: /^yes$/i.test(r.Rewatch || '') });
  }
  for (const r of files.ratings || []) {
    if (!r.Name) continue;
    get(r).rating = starsFrom(r.Rating);
  }
  for (const r of files.watched || []) {
    if (!r.Name) continue;
    const f = get(r);
    if (!f.views.length && validDate(r.Date)) f.views.push({ day: r.Date, rating: 0, rewatch: false, approx: true });
    else if (!f.views.length) f.views.push({ day: null, rating: 0, rewatch: false, approx: true });
  }
  // A film that only has a rating (no diary/watched row) still counts as watched.
  for (const f of films.values()) {
    if (!f.views.length) f.views.push({ day: null, rating: 0, rewatch: false, approx: true });
    f.views.sort((a, b) => String(a.day || '').localeCompare(String(b.day || '')));
    // the overall rating goes on the latest viewing unless that viewing has its own
    const last = f.views[f.views.length - 1];
    if (!last.rating) last.rating = f.rating || [...f.views].reverse().find((v) => v.rating)?.rating || 0;
    delete f.diaryDays;
  }
  const list = [...films.values()].sort((a, b) => a.name.localeCompare(b.name));
  const watchedKeys = new Set(list.map((f) => f.key));
  const seenW = new Set();
  const watchlist = [];
  for (const r of files.watchlist || []) {
    if (!r.Name) continue;
    const key = filmKey(r);
    if (watchedKeys.has(key) || seenW.has(key)) continue; // already watched, or listed twice
    seenW.add(key);
    watchlist.push({ key, name: r.Name, year: /^\d{4}$/.test(r.Year || '') ? r.Year : null, day: validDate(r.Date) ? r.Date : null });
  }
  return {
    films: list,
    watchlist,
    counts: {
      films: list.length,
      viewings: list.reduce((n, f) => n + f.views.length, 0),
      rewatches: list.reduce((n, f) => n + Math.max(0, f.views.length - 1), 0),
      rated: list.filter((f) => f.views.some((v) => v.rating)).length,
      watchlist: watchlist.length,
    },
  };
}

// ---------------------------------------------------------------- matching
// Pick the right TMDB result for a Letterboxd (name, year). Same title and same
// year wins; then same year (±1 — release dates differ by region); then same
// title if the year is unknown. Otherwise null (never guess a wrong film).
export function pickMatch(results, name, year) {
  const list = (results || []).filter((r) => r && r.id != null);
  const want = normTitle(name);
  const yr = (r) => (r.release_date || '').slice(0, 4);
  const sameTitle = (r) => normTitle(r.title) === want || normTitle(r.original_title) === want;
  if (year) {
    const y = Number(year);
    const exact = list.find((r) => sameTitle(r) && yr(r) === year);
    if (exact) return exact;
    const near = list.find((r) => sameTitle(r) && Math.abs(Number(yr(r)) - y) === 1);
    if (near) return near;
    const onlyYear = list.filter((r) => yr(r) === year);
    if (onlyYear.length === 1) return onlyYear[0]; // title spelled differently, but one film that year
    return null;
  }
  const t = list.filter(sameTitle);
  return t.length === 1 ? t[0] : null;
}

// ---------------------------------------------------------------- entries
// One WatchNext movie entry per viewing. `info` is the matched TMDB details
// (or null when unmatched — the film is still kept, by name, so history isn't lost).
export function entriesFor(film, info) {
  const base = info
    ? {
        tmdbId: info.id,
        name: info.title || film.name,
        runtimeMin: info.runtime || null,
        poster: info.poster_path || null,
        year: (info.release_date || '').slice(0, 4) || film.year || null,
        genres: (info.genres || []).map((g) => g.name),
      }
    : { name: film.name, year: film.year || null };
  return film.views.map((v) => {
    const e = { ...base, status: 'watched', watchedAt: v.day ? dayToISO(v.day) : new Date().toISOString() };
    if (v.rating) { e.rating = v.rating; e.ratedAt = e.watchedAt; }
    e.source = 'letterboxd';
    return e;
  });
}

export function plannedEntry(item, info) {
  const base = info
    ? {
        tmdbId: info.id,
        name: info.title || item.name,
        runtimeMin: info.runtime || null,
        poster: info.poster_path || null,
        year: (info.release_date || '').slice(0, 4) || item.year || null,
        genres: (info.genres || []).map((g) => g.name),
      }
    : { name: item.name, year: item.year || null };
  return { ...base, status: 'planned', addedAt: item.day ? dayToISO(item.day) : new Date().toISOString(), source: 'letterboxd' };
}

// ---------------------------------------------------------------- merge
const dayOf = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : localISODate(d);
};
const nameKey = (m) => normTitle(m.name);

// Add imported entries to the library without ever duplicating or deleting.
// Skips a watched entry when the library already has that film on that same
// day (matched by TMDB id, or by title for older name-only entries), and a
// planned entry when the film is already in the library in any form.
// One exception: an entry an EARLIER Letterboxd import saved with its half star rounded
// up (3.5 -> 4) gets the exact half back (`updated`). A rating changed in WatchNext since
// (anything other than the rounded value) is left alone.
export function mergeLetterboxd(movies, entries) {
  const have = new Set();
  const lbAt = new Map(); // "t<id>|day" / "n<name>|day" -> index of an earlier Letterboxd-imported viewing
  const linkedIds = new Set();
  const names = new Set();
  for (const m of movies) {
    const status = m.status || 'watched';
    if (m.tmdbId != null) linkedIds.add(m.tmdbId);
    names.add(nameKey(m));
    if (status === 'watched' && m.watchedAt) {
      const d = dayOf(m.watchedAt);
      if (m.tmdbId != null) have.add(`t${m.tmdbId}|${d}`);
      have.add(`n${nameKey(m)}|${d}`);
    }
  }
  movies.forEach((m, i) => {
    if (m.source !== 'letterboxd' || (m.status || 'watched') !== 'watched' || !m.watchedAt) return;
    const d = dayOf(m.watchedAt);
    if (m.tmdbId != null) lbAt.set(`t${m.tmdbId}|${d}`, i);
    lbAt.set(`n${nameKey(m)}|${d}`, i);
  });
  const out = [...movies];
  let added = 0;
  let skipped = 0;
  let updated = 0;
  for (const e of entries) {
    if (e.status === 'planned') {
      if ((e.tmdbId != null && linkedIds.has(e.tmdbId)) || names.has(nameKey(e))) { skipped++; continue; }
      out.push(e); added++;
      if (e.tmdbId != null) linkedIds.add(e.tmdbId);
      names.add(nameKey(e));
      continue;
    }
    const d = dayOf(e.watchedAt);
    const k1 = e.tmdbId != null ? `t${e.tmdbId}|${d}` : null;
    const k2 = `n${nameKey(e)}|${d}`;
    if ((k1 && have.has(k1)) || have.has(k2)) {
      skipped++;
      const i = k1 && lbAt.has(k1) ? lbAt.get(k1) : lbAt.get(k2);
      const old = i != null ? out[i] : null;
      if (old && e.rating && old.rating !== e.rating && Number(old.rating) === oldWholeStars(e.rating)) {
        out[i] = { ...old, rating: e.rating };
        updated++;
      }
      continue;
    }
    out.push(e); added++;
    if (k1) have.add(k1);
    have.add(k2);
    if (e.tmdbId != null) linkedIds.add(e.tmdbId);
    names.add(nameKey(e));
  }
  return { movies: out, added, skipped, updated };
}

// ---------------------------------------------------------------- runner
// Matches every film against TMDB (a few at a time), and hands finished
// entries to `save(entries)` in small batches so a closed tab loses little.
// deps: { search(query) -> {results}, details(id) -> tmdb movie, save(entries),
//         onProgress({done,total,matched,unmatched}), cancelled() }
export async function runImport(plan, deps, { concurrency = 4, batch = 25 } = {}) {
  const jobs = [
    ...plan.films.map((film) => ({ kind: 'film', film, label: film.name, year: film.year })),
    ...plan.watchlist.map((item) => ({ kind: 'planned', item, label: item.name, year: item.year })),
  ];
  const total = jobs.length;
  const unmatched = [];
  let done = 0;
  let matched = 0;
  let next = 0;
  let pending = [];
  const result = { added: 0, skipped: 0, updated: 0, matched: 0, unmatched, total, stopped: false };
  const flush = () => {
    if (!pending.length) return;
    const r = deps.save(pending);
    result.added += r.added;
    result.skipped += r.skipped;
    result.updated += r.updated || 0;
    pending = [];
  };
  async function work() {
    while (next < jobs.length) {
      if (deps.cancelled && deps.cancelled()) { result.stopped = true; return; }
      const job = jobs[next++];
      let info = null;
      try {
        const q = job.year ? `${job.label} ${job.year}` : job.label;
        const data = await searchWithYear((p) => deps.search(p), q);
        const hit = pickMatch(data && data.results, job.label, job.year);
        if (hit) {
          try { info = await deps.details(hit.id); } catch { info = hit; } // search row still has title/poster/year
        }
      } catch (e) {
        if (/API key|No TMDB/i.test(String(e && e.message))) throw e; // fatal: tell the user
      }
      if (info) matched++;
      else unmatched.push({ name: job.label, year: job.year || null });
      const made = job.kind === 'film' ? entriesFor(job.film, info) : [plannedEntry(job.item, info)];
      pending.push(...made);
      done++;
      if (pending.length >= batch) flush();
      if (deps.onProgress) deps.onProgress({ done, total, matched, unmatched: unmatched.length });
    }
  }
  try {
    await Promise.all(Array.from({ length: Math.max(1, concurrency) }, work));
  } finally {
    flush();
  }
  result.matched = matched;
  return result;
}

// ---------------------------------------------------------------- copy
const n = (c, one, many) => `${c.toLocaleString()} ${c === 1 ? one : many}`;

export function previewText(c) {
  const parts = [n(c.films, 'film', 'films')];
  if (c.rewatches) parts.push(`${n(c.rewatches, 'rewatch', 'rewatches')}`);
  if (c.rated) parts.push(`${n(c.rated, 'rating', 'ratings')}`);
  if (c.watchlist) parts.push(`${n(c.watchlist, 'watchlist film', 'watchlist films')}`);
  return `Found ${parts.join(', ')}.`;
}

export function resultText(r) {
  const head = r.stopped ? 'Stopped early. ' : '';
  const bits = [`${n(r.added, 'entry', 'entries')} added`];
  if (r.skipped) bits.push(`${r.skipped.toLocaleString()} already there`);
  if (r.updated) bits.push(`${n(r.updated, 'rating', 'ratings')} changed to the exact half star`);
  const un = r.unmatched.length;
  let tail = '';
  if (un) tail = ` ${n(un, 'film', 'films')} couldn’t be matched on TMDB — they were kept by name. Open them in Movies → Fix match (try adding the year).`;
  return `${head}${bits.join(', ')}.${tail}`;
}
