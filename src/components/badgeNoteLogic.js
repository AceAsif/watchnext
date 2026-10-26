// "New badge!" note: notices when a badge reaches a new level. PURE: no DOM, no store.
//
// The highest level ever seen for each badge is saved on THIS device ({ v: 1, levels: { id: n } }).
// - First time (nothing saved yet): today's levels are saved quietly, so an existing library
//   doesn't get 15 notes at once. An empty library is never saved as the starting point, so a
//   new device first gets your library (sync, import or restore) and only then starts counting.
// - A level above the saved one = a note. The saved level then goes up.
// - Levels only go up: if a count drops (Undo, a removed duplicate) and comes back, there is
//   no second note for the same level.

export const SEEN_KEY = 'watchnext-badges-seen-v1';

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const lvl = (n) => (Number.isInteger(n) && n > 0 ? n : 0);

export function loadSeen(storage) {
  try {
    const raw = JSON.parse(storage.getItem(SEEN_KEY));
    if (!isObj(raw) || !isObj(raw.levels)) return null;
    const levels = {};
    for (const [k, v] of Object.entries(raw.levels)) if (/^[a-z]+$/.test(k)) levels[k] = lvl(v);
    return { v: 1, levels };
  } catch (e) {
    return null;
  }
}
export function saveSeen(storage, seen) {
  try { storage.setItem(SEEN_KEY, JSON.stringify(seen)); } catch (e) { /* full or blocked: try next time */ }
}

export const libraryEmpty = (state) =>
  !Object.keys((state && state.shows) || {}).length && !((state && state.movies) || []).length;

// seen: saved record or null; badges: buildBadges() result; empty: libraryEmpty(state)
// -> { ups: [badge, highest level first], seen: record to save, or null when nothing changed }
export function checkBadges(seen, badges, empty) {
  if (!seen) {
    if (empty) return { ups: [], seen: null };
    return { ups: [], seen: { v: 1, levels: Object.fromEntries(badges.map((b) => [b.id, b.level])) } };
  }
  const ups = [];
  const levels = { ...seen.levels };
  let changed = false;
  for (const b of badges) {
    const had = lvl(levels[b.id]);
    if (!(b.id in levels)) { levels[b.id] = b.level; changed = true; continue; } // a badge added in a later version: start quietly
    if (b.level > had) { ups.push(b); levels[b.id] = b.level; changed = true; }
  }
  ups.sort((a, b) => (b.tier ?? b.level) - (a.tier ?? a.level) || a.title.localeCompare(b.title));
  return { ups, seen: changed ? { v: 1, levels } : null };
}

// Adds new ups to a note already on screen (one badge listed once, at its highest level).
export function mergeUps(current, more) {
  const by = new Map((current || []).map((b) => [b.id, b]));
  for (const b of more) if (!by.has(b.id) || by.get(b.id).level < b.level) by.set(b.id, b);
  return [...by.values()].sort((a, b) => (b.tier ?? b.level) - (a.tier ?? a.level) || a.title.localeCompare(b.title));
}

// The words on the note.
// one badge:  { head: 'New badge!', line: 'Episode explorer · Gold', sub: '1,000 episodes' }
// several:    { head: '3 new badge levels!', line: 'Episode explorer · Gold, Critic · Silver', sub: '+1 more' }
export function noteText(ups) {
  if (!ups.length) return null;
  const name = (b) => `${b.title} · ${b.levelName}`;
  if (ups.length === 1) {
    const b = ups[0];
    return { head: b.rare ? 'Rare badge!' : b.done ? 'Legend badge!' : 'New badge!', line: name(b), sub: b.label.split(' · ').slice(1).join(' · ') };
  }
  const shown = ups.slice(0, 2);
  const rest = ups.length - shown.length;
  return { head: `${ups.length} new badge levels!`, line: shown.map(name).join(', '), sub: rest ? `+${rest} more` : '' };
}
