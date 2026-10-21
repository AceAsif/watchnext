// Episode ratings. PURE: no store, no React, so the UI, cloud-sync merge and backup restore
// share it and it can be tested in plain node.
//
// DATA MODEL
//   show.epRatings = { "1x5": { r: 4.5, at: ISO, t: "Episode title" }, … }
//   - r: 0.5–5 in half steps (like movies). 0 removes the rating.
//   - t: the episode's title when it was rated, so "Best episode" can name it without
//     loading the season from TMDB again. Optional.
//   A separate map, NOT inside show.watched, so un-marking an episode keeps its rating
//   (same rule as episode notes). Never stored as `undefined` (Firestore rejects it): the
//   last rating removed removes the whole property.

import { isEpKey } from './notes.js';
import { cleanRating } from '../components/starsLogic.js';

const TITLE_MAX = 120;
const cleanTitle = (t) => (typeof t === 'string' ? t.trim().slice(0, TITLE_MAX) : '');
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

// One stored entry, cleaned. null when it isn't a real rating.
export function cleanEntry(v) {
  if (!isObj(v)) return null;
  const r = cleanRating(v.r);
  if (!r) return null;
  const out = { r };
  if (typeof v.at === 'string' && Number.isFinite(Date.parse(v.at))) out.at = v.at;
  const t = cleanTitle(v.t);
  if (t) out.t = t;
  return out;
}

// The NEW map after rating episode `key` (0 removes it), or undefined when none are left.
// Never mutates its input.
export function setRatingIn(map, key, rating, title, nowIso) {
  const next = { ...(isObj(map) ? map : {}) };
  if (!isEpKey(key)) return Object.keys(next).length ? next : undefined;
  const r = cleanRating(rating);
  if (!r) delete next[key];
  else {
    const t = cleanTitle(title) || (next[key] && next[key].t) || '';
    next[key] = { r, at: nowIso, ...(t ? { t } : null) };
  }
  return Object.keys(next).length ? next : undefined;
}

// Apply ratings to a show record without ever writing `epRatings: undefined`.
export function withEpRatings(show, map) {
  const { epRatings: _old, ...rest } = show; // eslint-disable-line no-unused-vars
  return map && Object.keys(map).length ? { ...rest, epRatings: map } : rest;
}

// Union of two ratings maps (cloud sync at sign-in, backup restore). For an episode both
// sides rated, the more recent rating wins (ties: yours). Everything from `theirs` is
// cleaned first, since a backup file isn't trusted. Returns undefined when empty.
export function mergeEpRatings(mine, theirs) {
  const out = {};
  for (const [k, v] of Object.entries(isObj(mine) ? mine : {})) {
    const c = isEpKey(k) && cleanEntry(v);
    if (c) out[k] = c;
  }
  for (const [k, v] of Object.entries(isObj(theirs) ? theirs : {})) {
    if (!isEpKey(k)) continue;
    const c = cleanEntry(v);
    if (!c) continue;
    const have = out[k];
    if (!have || (c.at && (!have.at || Date.parse(c.at) > Date.parse(have.at)))) out[k] = { ...c, ...(!c.t && have && have.t ? { t: have.t } : null) };
  }
  return Object.keys(out).length ? out : undefined;
}

export const ratingOf = (show, key) => {
  const e = show && isObj(show.epRatings) ? cleanEntry(show.epRatings[key]) : null;
  return e ? e.r : 0;
};
