// PURE: Discover's "Not interested" list. No DOM, no store.
//
//   hidden = { 'tv:1399': { on: true, at: '<ISO>', name, kind, id, poster, year, g: ['drama'] }, … }
//
// Keys are 'tv:<tmdb id>', 'movie:<tmdb id>' or 'anime:<AniList id>' (Discover's anime row; those
// carry an AniList cover `image` instead of a TMDB `poster`). It syncs between devices like yearly
// goals: per title the most recently changed copy wins. Undoing ("Show again") keeps the entry with
// on:false and a fresh time, so the undo syncs too instead of being brought back by another
// device's older copy.

import { GENRE_LABEL } from './tasteLogic.js';

const KEY = /^(tv|movie|anime):\d{1,9}$/;
const isoOk = (s) => typeof s === 'string' && s !== '' && Number.isFinite(Date.parse(s));
const str = (v, max = 200) => (typeof v === 'string' ? v.slice(0, max) : '');

export function sanitizeHidden(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [key, e] of Object.entries(raw)) {
    if (!KEY.test(key) || !e || typeof e !== 'object') continue;
    const [kind, id] = key.split(':');
    out[key] = {
      on: e.on === true,
      at: isoOk(e.at) ? e.at : '',
      name: str(e.name),
      kind,
      id: Number(id),
      poster: typeof e.poster === 'string' && e.poster.startsWith('/') ? e.poster.slice(0, 100) : null,
      image: typeof e.image === 'string' && /^https:\/\/s\d*\.anilist\.co\//.test(e.image) ? e.image.slice(0, 300) : null,
      year: Number.isInteger(e.year) ? e.year : null,
      g: Array.isArray(e.g) ? e.g.filter((x) => GENRE_LABEL[x]).slice(0, 6) : [],
    };
  }
  return out;
}

// Per title the newer change wins (ties go to `local`). Titles only one side has are kept.
export function mergeHidden(remote, local) {
  const r = sanitizeHidden(remote), l = sanitizeHidden(local);
  const out = {};
  for (const key of new Set([...Object.keys(r), ...Object.keys(l)])) {
    const a = r[key], b = l[key];
    if (!a) out[key] = b; else if (!b) out[key] = a;
    else out[key] = Date.parse(a.at || 0) > Date.parse(b.at || 0) ? a : b;
  }
  return out;
}
export const sameHidden = (a, b) => JSON.stringify(sanitizeHidden(a)) === JSON.stringify(sanitizeHidden(b));

// Hide (on=true) or show again (on=false). item: a Discover candidate { kind, id, name, poster, year, g }.
// Returns NEW hidden (the input is not modified).
export function setHidden(hidden, item, on, nowIso) {
  const cur = sanitizeHidden(hidden);
  if (!item || !['tv', 'movie', 'anime'].includes(item.kind) || !Number.isInteger(Number(item.id))) return cur;
  const key = `${item.kind}:${Number(item.id)}`;
  const prev = cur[key] || {};
  return sanitizeHidden({
    ...cur,
    [key]: { on: !!on, at: nowIso, name: item.name || prev.name, poster: item.poster || prev.poster, image: item.image || prev.image, year: item.year ?? prev.year, g: item.g || prev.g },
  });
}

// The titles currently hidden, newest first.
export function hiddenList(hidden) {
  return Object.entries(sanitizeHidden(hidden))
    .filter(([, e]) => e.on)
    .map(([key, e]) => ({ key, ...e }))
    .sort((a, b) => (b.at || '').localeCompare(a.at || ''));
}
export const hiddenKeySet = (hidden) => new Set(hiddenList(hidden).map((e) => e.key));

// Restore from backup: add titles this device has no entry for. Never overwrites.
export function fillHidden(local, backup) {
  const l = sanitizeHidden(local), b = sanitizeHidden(backup);
  const out = { ...l }; let added = 0;
  for (const [key, e] of Object.entries(b)) if (!out[key] && e.on) { out[key] = e; added++; }
  return { hidden: out, added };
}
