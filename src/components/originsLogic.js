// Where everything you watched comes from: its countries and original language.
// PURE: no DOM, no store (storage is passed in).
//
// TMDB gives each title `origin_country` (['KR']) and `original_language` ('ko'); older movie
// records only have `production_countries`. The answers are cached on THIS device (like the
// collections cache): not part of the library, not synced, not in backups — rebuilt from
// TMDB when missing. Used by the World map and by Achievements ("Movies in 5 languages").
//
// cache: { v: 1, items: { 'm<tmdbId>' | 't<tmdbId>': { c: ['IN'], l: 'hi', t: ISO } } }

import { movieKey } from './movieGroupsLogic.js';

export const CACHE_KEY = 'watchnext-origins-v1';
export const EMPTY_RECHECK_DAYS = 90; // a title TMDB had no country/language for is re-asked after this
const DAY = 86400000;

export const emptyCache = () => ({ v: 1, items: {} });
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const posInt = (v) => { const n = Number(v); return Number.isInteger(n) && n > 0 ? n : 0; };
const CODE = /^[A-Z]{2}$/;
const LANG = /^[a-z]{2,3}$/;

export const originKey = (kind, tmdbId) => (kind === 'tv' ? 't' : 'm') + tmdbId;

function cleanItem(it) {
  if (!isObj(it)) return null;
  const c = Array.isArray(it.c) ? [...new Set(it.c.filter((x) => typeof x === 'string' && CODE.test(x)))] : [];
  const l = typeof it.l === 'string' && LANG.test(it.l) && it.l !== 'xx' ? it.l : null;
  const t = typeof it.t === 'string' && Number.isFinite(Date.parse(it.t)) ? it.t : new Date(0).toISOString();
  return { c, l, t };
}

export function sanitizeCache(raw) {
  const out = emptyCache();
  if (!isObj(raw) || !isObj(raw.items)) return out;
  for (const [k, v] of Object.entries(raw.items)) {
    if (!/^[mt]\d+$/.test(k)) continue;
    const it = cleanItem(v);
    if (it) out.items[k] = it;
  }
  return out;
}

export function loadCache(storage) {
  try {
    return sanitizeCache(JSON.parse(storage.getItem(CACHE_KEY)));
  } catch (e) {
    return emptyCache();
  }
}
export function saveCache(storage, cache) {
  try { storage.setItem(CACHE_KEY, JSON.stringify(cache)); } catch (e) { /* full or blocked: looked up again next time */ }
}

// The countries + language in one TMDB /movie or /tv response.
export function originOf(details) {
  const d = isObj(details) ? details : {};
  let c = Array.isArray(d.origin_country) ? d.origin_country : [];
  if (!c.length && Array.isArray(d.production_countries)) c = d.production_countries.map((p) => p && p.iso_3166_1);
  return cleanItem({ c, l: d.original_language, t: new Date().toISOString() });
}

// cache + one TMDB response -> new cache (the same object when nothing changed).
export function recordOrigin(cache, kind, details, now = new Date()) {
  const id = posInt(details && details.id);
  if (!id) return cache;
  const it = originOf(details);
  it.t = now.toISOString();
  const key = originKey(kind, id);
  const old = cache.items[key];
  if (old && old.l === it.l && old.c.join() === it.c.join()) return cache;
  return { ...cache, items: { ...cache.items, [key]: it } };
}

// ------------------------------------------------------------------ what you watched
// One entry per watched title:
//   { key, kind: 'tv'|'movie', tmdbId (0 when not linked), name, poster, genres, anime }
// Movies: one per film (rewatches count once). Shows: any show with a watched episode.
export function watchedTitles(state) {
  const out = [];
  const seenFilm = new Set();
  for (const m of (state && state.movies) || []) {
    if (!m || (m.status && m.status !== 'watched')) continue;
    const k = movieKey(m);
    if (seenFilm.has(k)) continue;
    seenFilm.add(k);
    const id = posInt(m.tmdbId);
    out.push({ key: id ? originKey('movie', id) : '', kind: 'movie', tmdbId: id, name: m.name || '', poster: m.poster || null, genres: Array.isArray(m.genres) ? m.genres : [], anime: false });
  }
  for (const s of Object.values((state && state.shows) || {})) {
    if (!s || !isObj(s.watched) || !Object.keys(s.watched).length) continue;
    const id = posInt(s.tmdbId);
    out.push({ key: id ? originKey('tv', id) : '', kind: 'tv', tmdbId: id, name: s.name || '', poster: s.poster || null, genres: Array.isArray(s.genres) ? s.genres : [], anime: !!(s.anime && s.anime.id) });
  }
  return out;
}

// The titles still to look up: linked, and not cached yet (or cached empty long ago).
export function titlesToCheck(titles, cache, now = new Date()) {
  const out = [];
  const seen = new Set();
  for (const t of titles) {
    if (!t.key || seen.has(t.key)) continue;
    seen.add(t.key);
    const it = cache.items[t.key];
    if (!it) { out.push(t); continue; }
    if (!it.c.length && !it.l && now - Date.parse(it.t) > EMPTY_RECHECK_DAYS * DAY) out.push(t);
  }
  return out;
}

// ------------------------------------------------------------------ names
const SPECIAL_LANG = { cn: 'Cantonese', zh: 'Mandarin', sh: 'Serbo-Croatian', xx: 'No language' };
let regionNames = null;
let languageNames = null;
try { regionNames = new Intl.DisplayNames(['en'], { type: 'region' }); } catch (e) { /* old browser */ }
try { languageNames = new Intl.DisplayNames(['en'], { type: 'language' }); } catch (e) { /* old browser */ }

export function countryName(code) {
  if (code === 'XK') return 'Kosovo';
  try { const n = regionNames && regionNames.of(code); if (n && n !== code) return n; } catch (e) { /* bad code */ }
  return code;
}
export function languageLabel(code) {
  if (SPECIAL_LANG[code]) return SPECIAL_LANG[code];
  try { const n = languageNames && languageNames.of(code); if (n && n !== code) return n; } catch (e) { /* bad code */ }
  return String(code || '').toUpperCase();
}

// Anime: linked to AniList on its show page, or animation from Japan / in Japanese.
export function isAnime(t, origin) {
  if (t.anime) return true;
  if (!t.genres.includes('Animation') || !origin) return false;
  return origin.c.includes('JP') || origin.l === 'ja';
}

// ------------------------------------------------------------------ the world
// filter: 'all' | 'tv' | 'movie'
// -> {
//   countries: [{ code, name, count, titles: [{ name, kind, poster }] }]  most titles first
//   languages: [{ code, label, count }]                                 most titles first
//   known      titles with origin data, pending: linked titles not looked up yet,
//   unlinked   titles with no TMDB link (can't be placed), total
// }
export function buildWorld(titles, cache, filter = 'all') {
  const countries = new Map();
  const languages = new Map();
  let known = 0;
  let pending = 0;
  let unlinked = 0;
  let total = 0;
  for (const t of titles) {
    if (filter !== 'all' && t.kind !== filter) continue;
    total++;
    if (!t.key) { unlinked++; continue; }
    const o = cache.items[t.key];
    if (!o) { pending++; continue; }
    known++;
    for (const code of o.c) {
      if (!countries.has(code)) countries.set(code, { code, name: countryName(code), count: 0, titles: [] });
      const c = countries.get(code);
      c.count++;
      c.titles.push({ name: t.name, kind: t.kind, poster: t.poster });
    }
    if (o.l) {
      if (!languages.has(o.l)) languages.set(o.l, { code: o.l, label: languageLabel(o.l), count: 0 });
      languages.get(o.l).count++;
    }
  }
  const byCount = (a, b) => b.count - a.count || (a.name || a.label).localeCompare(b.name || b.label);
  const cs = [...countries.values()].sort(byCount);
  for (const c of cs) c.titles.sort((a, b) => a.name.localeCompare(b.name));
  return { countries: cs, languages: [...languages.values()].sort(byCount), known, pending, unlinked, total };
}

// Map shade 0 (none) – 4 for a country's title count. Fixed steps, because one country (often
// the US) usually has far more titles than the rest.
export function shadeLevel(count) {
  if (!count) return 0;
  if (count === 1) return 1;
  if (count < 10) return 2;
  if (count < 50) return 3;
  return 4;
}
export const SHADE_STEPS = ['1', '2–9', '10–49', '50+'];
