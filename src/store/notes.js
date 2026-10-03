// Pure logic for episode and movie notes/reactions. No store, no localStorage and
// no React, so the UI, the cloud-sync merge and backup restore can all share it
// and it can be unit-tested with plain node.
//
// DATA MODEL
//   Episodes: show.notes = { "1x5": { react: "funny", text: "Great twist", at: ISO }, … }
//             A separate map, NOT inside show.watched, so un-marking an episode
//             never deletes what you wrote about it.
//   Movies:   the watch entry itself carries `react` and `note` (a rewatch is a
//             separate entry, so each viewing can have its own thoughts).
//   Neither is ever stored as `undefined` (Firestore rejects it): an empty note
//   removes the key, and when the last episode note goes the whole `notes`
//   property is removed.

export const REACTIONS = [
  { id: 'love', emoji: '😍', label: 'Loved it' },
  { id: 'funny', emoji: '😂', label: 'Funny' },
  { id: 'shocked', emoji: '😱', label: 'Shocked' },
  { id: 'sad', emoji: '😢', label: 'Sad' },
  { id: 'angry', emoji: '😡', label: 'Angry' },
  { id: 'bored', emoji: '😴', label: 'Bored' },
];
export const NOTE_MAX = 280;

const REACTION_IDS = new Set(REACTIONS.map((r) => r.id));
const BAD_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const EP_KEY = /^\d{1,4}x\d{1,5}$/; // "1x5" — season x episode, like epKey()

export const reactionById = (id) => REACTIONS.find((r) => r.id === id) || null;
export const isEpKey = (k) => typeof k === 'string' && !BAD_KEYS.has(k) && EP_KEY.test(k);

// Normalise what the user entered: trim the text, cap it at NOTE_MAX, drop an
// unknown reaction. Returns { react, text } (strings, '' when empty) — callers
// decide what to do with an empty result.
export function cleanNote(input) {
  const react = input && REACTION_IDS.has(input.react) ? input.react : '';
  const raw = input && typeof input.text === 'string' ? input.text : '';
  const text = raw.trim().slice(0, NOTE_MAX).trim();
  return { react, text };
}
export const isEmptyNote = (n) => !n || (!n.react && !n.text);

// Episode notes. `notes` is show.notes (may be undefined). Returns the NEW notes
// object, or undefined when there are none left. Never mutates its input.
export function setNoteIn(notes, key, input, nowIso) {
  if (!isEpKey(key)) return notes && Object.keys(notes).length ? notes : undefined;
  const next = { ...(notes || {}) };
  const c = cleanNote(input);
  if (isEmptyNote(c)) delete next[key];
  else next[key] = { ...(c.react ? { react: c.react } : null), ...(c.text ? { text: c.text } : null), at: nowIso };
  return Object.keys(next).length ? next : undefined;
}

// Apply episode notes to a show record without ever writing `notes: undefined`.
export function withNotes(show, notes) {
  const { notes: _old, ...rest } = show; // eslint-disable-line no-unused-vars
  return notes && Object.keys(notes).length ? { ...rest, notes } : rest;
}

// Movie notes live on the watch entry. Same rule: no undefined, no empty strings.
export function withMovieNote(movie, input) {
  const { react: _r, note: _n, ...rest } = movie; // eslint-disable-line no-unused-vars
  const c = cleanNote(input);
  return { ...rest, ...(c.react ? { react: c.react } : null), ...(c.text ? { note: c.text } : null) };
}
export const movieNoteOf = (movie) => cleanNote({ react: movie && movie.react, text: movie && movie.note });

// Union of two notes maps (cloud sync, backup restore). YOURS (`mine`) win for a
// key both have; the other side only adds keys you don't have. Everything from
// `theirs` is sanitised, since a backup file is not trusted. Returns undefined
// when the result is empty. Never mutates.
export function mergeNotes(mine, theirs) {
  const out = { ...(mine || {}) };
  if (theirs && typeof theirs === 'object' && !Array.isArray(theirs)) {
    for (const [k, v] of Object.entries(theirs)) {
      if (!isEpKey(k) || out[k] || !v || typeof v !== 'object') continue;
      const c = cleanNote({ react: v.react, text: v.text });
      if (isEmptyNote(c)) continue;
      out[k] = { ...(c.react ? { react: c.react } : null), ...(c.text ? { text: c.text } : null), at: typeof v.at === 'string' ? v.at : '' };
      if (!out[k].at) delete out[k].at;
    }
  }
  return Object.keys(out).length ? out : undefined;
}

export const countNotes = (show) => (show && show.notes ? Object.keys(show.notes).length : 0);
