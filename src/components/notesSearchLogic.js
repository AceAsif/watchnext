// PURE logic for "Your notes" (search every episode / movie you wrote about or
// reacted to) and the "Most loved shows" ranking. No DOM, no store.
//
// Data (see store/notes.js): episode notes live in show.notes["1x5"] =
// { react, text, at }; a movie's note and reaction sit on the watch entry
// (`react`, `note`), one per viewing.

import { REACTIONS, reactionById, isEpKey, cleanNote, movieNoteOf } from '../store/notes.js';

export const PAGE_SIZE = 50;
export const KINDS = ['All', 'Episodes', 'Movies'];
export const NO_REACTION = 'none'; // pseudo-reaction: a written note with no emoji ("Words only")

// "Most loved shows": a 😍 on an episode counts double, a 😂 once.
export const LOVE_WEIGHT = 2;
export const FUNNY_WEIGHT = 1;

export const newNotesMemo = () => ({ q: '', reacts: [], kind: 'All', shown: PAGE_SIZE, scroll: 0 });

const BAD_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

// ------------------------------------------------------------------ collect
// One entry per episode note and per movie viewing that has a reaction or text.
// Newest first (by when the note was written / the film was watched); entries
// with no date sink to the bottom; ties by name.
export function collectNotes(shows, movies) {
  const out = [];
  for (const [id, s] of Object.entries(shows || {})) {
    if (BAD_KEYS.has(id) || !s || typeof s !== 'object' || !s.notes || typeof s.notes !== 'object') continue;
    for (const [key, n] of Object.entries(s.notes)) {
      if (!isEpKey(key) || !n || typeof n !== 'object') continue;
      const c = cleanNote({ react: n.react, text: n.text });
      if (!c.react && !c.text) continue;
      const [season, episode] = key.split('x').map(Number);
      out.push({
        key: `e|${id}|${key}`, kind: 'episode', id, name: String(s.name || 'Untitled'), poster: s.poster || null,
        season, episode, code: `S${season}E${episode}`, react: c.react, text: c.text,
        at: typeof n.at === 'string' ? n.at : '',
      });
    }
  }
  (Array.isArray(movies) ? movies : []).forEach((m, i) => {
    if (!m || typeof m !== 'object' || (m.status || 'watched') !== 'watched') return;
    const c = movieNoteOf(m);
    if (!c.react && !c.text) return;
    out.push({
      key: `m|${m.tmdbId != null ? m.tmdbId : m.name}|${m.watchedAt || ''}|${i}`, kind: 'movie',
      id: m.tmdbId != null ? m.tmdbId : null, name: String(m.name || 'Untitled'), poster: m.poster || null,
      year: m.year || '', react: c.react, text: c.text, at: typeof m.watchedAt === 'string' ? m.watchedAt : '',
    });
  });
  out.sort((a, b) => (b.at || '').localeCompare(a.at || '') || a.name.localeCompare(b.name) || (a.season || 0) - (b.season || 0) || (a.episode || 0) - (b.episode || 0));
  return out;
}

// ------------------------------------------------------------------ search
// Everything a word may match (as a substring), lower-cased: the title, the note,
// the reaction's label and emoji, and "movie" + year for films.
export function haystack(e) {
  const r = reactionById(e.react);
  const parts = [e.name, e.text, r ? `${r.label} ${r.emoji}` : ''];
  if (e.kind === 'movie') parts.push('movie ' + (e.year || ''));
  return parts.join(' ').toLowerCase();
}

// A word that looks like an episode code (s1e5, S01E05, 1x5) matches that exact
// episode only, in any spelling. It is NOT a substring match, otherwise "s1e5"
// would also find S1E50 to S1E59.
const CODE = /^(?:s0*(\d+)e0*(\d+)|0*(\d+)x0*(\d+))$/;
function codeOf(word) {
  const m = CODE.exec(word);
  return m ? { season: Number(m[1] != null ? m[1] : m[3]), episode: Number(m[2] != null ? m[2] : m[4]) } : null;
}

const tokens = (q) => String(q == null ? '' : q).toLowerCase().split(/\s+/).filter(Boolean);
const kindOk = (e, kind) => kind === 'All' || !kind || (kind === 'Episodes' ? e.kind === 'episode' : e.kind === 'movie');
const reactOk = (e, reacts) => !reacts || reacts.length === 0 || reacts.includes(e.react || NO_REACTION);

// f = { q, reacts: ['love', …, 'none'], kind: 'All' | 'Episodes' | 'Movies' }
export function filterNotes(entries, f = {}) {
  const t = tokens(f.q);
  return entries.filter((e) => {
    if (!kindOk(e, f.kind) || !reactOk(e, f.reacts)) return false;
    if (!t.length) return true;
    const h = haystack(e);
    return t.every((w) => {
      const c = codeOf(w);
      if (c) return e.kind === 'episode' && e.season === c.season && e.episode === c.episode;
      return h.includes(w);
    });
  });
}

// Faceted counts for the filter row: each respects the OTHER filters (like the
// Shows status tabs), so the numbers always add up to what you'd see.
export function kindCounts(entries, f = {}) {
  const base = filterNotes(entries, { ...f, kind: 'All' });
  return { All: base.length, Episodes: base.filter((e) => e.kind === 'episode').length, Movies: base.filter((e) => e.kind === 'movie').length };
}
export function reactionCounts(entries, f = {}) {
  const base = filterNotes(entries, { ...f, reacts: [] });
  const c = { [NO_REACTION]: 0 };
  for (const r of REACTIONS) c[r.id] = 0;
  for (const e of base) c[e.react || NO_REACTION] += 1;
  return c;
}

export const summaryLine = (entries) => {
  const n = entries.length;
  const written = entries.filter((e) => e.text).length;
  return `${n.toLocaleString()} ${n === 1 ? 'entry' : 'entries'} · ${written.toLocaleString()} with a written note`;
};

export const hasFilters = (f) => !!(f && (tokens(f.q).length || (f.reacts && f.reacts.length) || (f.kind && f.kind !== 'All')));

export function toggleReaction(reacts, id) {
  return reacts.includes(id) ? reacts.filter((r) => r !== id) : [...reacts, id];
}

// ------------------------------------------------------------------ Most loved shows
// Counts EPISODE reactions only. rows: [{ label, value: score, love, funny }].
export function lovedShows(shows, limit = 8) {
  const all = [];
  for (const [id, s] of Object.entries(shows || {})) {
    if (BAD_KEYS.has(id) || !s || typeof s !== 'object' || !s.notes || typeof s.notes !== 'object') continue;
    let love = 0, funny = 0;
    for (const [key, n] of Object.entries(s.notes)) {
      if (!isEpKey(key) || !n || typeof n !== 'object') continue;
      const r = cleanNote({ react: n.react, text: n.text }).react;
      if (r === 'love') love += 1;
      else if (r === 'funny') funny += 1;
    }
    const value = love * LOVE_WEIGHT + funny * FUNNY_WEIGHT;
    if (value > 0) all.push({ label: String(s.name || 'Untitled'), value, love, funny });
  }
  all.sort((a, b) => b.value - a.value || b.love - a.love || a.label.localeCompare(b.label));
  const seen = new Map();
  const rows = all.slice(0, limit).map((r) => { const c = (seen.get(r.label) || 0) + 1; seen.set(r.label, c); return c === 1 ? r : { ...r, label: `${r.label} (${c})` }; });
  return { rows, titles: all.length };
}
