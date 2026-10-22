// Activity log with Undo: the last changes you made, each with its own Undo.
// PURE: no DOM, no store.
//
// An entry remembers only WHAT CHANGED, not a copy of your library:
//   { id, at, what: 'Watched S1E2', title: 'Stranger Things', kind: 'show'|'movie'|'list'|'hidden', changes: [...] }
// A change is one of
//   { area: 'show',   id, path: [] | [key] | [key, subKey], b?, a? }   b = before, a = after;
//   { area: 'list',   id, b?, a? }                                      a missing key = "wasn't there"
//   { area: 'hidden', id, b?, a? }
//   { area: 'movies', removed: [{ i, m }], added: [m] }                 viewings are matched by content
// Shows are compared two levels deep, so ticking one episode stores just that episode,
// never the whole show.
//
// Undo puts the "before" values back. Lists and "Not interested" picks sync by "newest change
// wins", so an undo stamps them with a fresh time (or marks them deleted / not hidden) — that
// way the undo reaches your other devices instead of losing to the older copy.
//
// status(entry, state):
//   'ok'      everything is still as this change left it → Undo is safe
//   'undone'  it's already back to how it was (undone here, or with the Undo message)
//   'changed' you changed the same thing again later → Undo asks first

import { deleteList as listDelete } from './listsLogic.js';

export const LOG_MAX = 50;
export const LOG_KEY = 'watchnext-activity-v1';
export const SIZE_MAX = 1000000; // characters kept on the device; the oldest entries go first

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

// JSON with sorted keys, so { a, b } and { b, a } compare equal.
export function stable(v) {
  if (v === undefined) return 'undefined';
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  if (isObj(v)) return `{${Object.keys(v).filter((k) => v[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}`;
  return JSON.stringify(v);
}
const same = (x, y) => x === y || stable(x) === stable(y);

// A change object for a value that went from b to a (either may be "absent" = undefined).
const ch = (base, b, a) => {
  const c = { ...base };
  if (b !== undefined) c.b = b;
  if (a !== undefined) c.a = a;
  return c;
};

// ------------------------------------------------------------------ diff
function diffShows(before = {}, after = {}) {
  const out = [];
  for (const id of new Set([...Object.keys(before), ...Object.keys(after)])) {
    const b = before[id];
    const a = after[id];
    if (b === a) continue;
    if (!b || !a) { out.push(ch({ area: 'show', id, path: [] }, b, a)); continue; }
    for (const k of new Set([...Object.keys(b), ...Object.keys(a)])) {
      const bv = b[k];
      const av = a[k];
      if (bv === av || same(bv, av)) continue;
      if (isObj(bv) && isObj(av)) {
        for (const s of new Set([...Object.keys(bv), ...Object.keys(av)])) {
          if (!same(bv[s], av[s])) out.push(ch({ area: 'show', id, path: [k, s] }, bv[s], av[s]));
        }
      } else {
        out.push(ch({ area: 'show', id, path: [k] }, bv, av));
      }
    }
  }
  return out;
}

function diffKeyed(area, before, after) {
  const b0 = isObj(before) ? before : {};
  const a0 = isObj(after) ? after : {};
  if (b0 === a0) return [];
  const out = [];
  for (const id of new Set([...Object.keys(b0), ...Object.keys(a0)])) {
    if (b0[id] !== a0[id] && !same(b0[id], a0[id])) out.push(ch({ area, id }, b0[id], a0[id]));
  }
  return out;
}

function diffMovies(before = [], after = []) {
  if (before === after) return [];
  const inAfter = new Set(after);
  const inBefore = new Set(before);
  const removed = [];
  before.forEach((m, i) => { if (!inAfter.has(m)) removed.push({ i, m }); });
  const added = after.filter((m) => !inBefore.has(m));
  // A movie object replaced by an identical copy is not a change.
  const addedKeys = added.map(stable);
  const keep = removed.filter((r) => {
    const j = addedKeys.indexOf(stable(r.m));
    if (j === -1) return true;
    addedKeys.splice(j, 1);
    added.splice(j, 1);
    return false;
  });
  return keep.length || added.length ? [{ area: 'movies', removed: keep, added }] : [];
}

// Everything that differs between two states (only the parts the log covers).
export function diffState(before, after) {
  return [
    ...diffShows(before.shows, after.shows),
    ...diffMovies(before.movies, after.movies),
    ...diffKeyed('list', before.lists, after.lists),
    ...diffKeyed('hidden', before.hidden, after.hidden),
  ];
}

// ------------------------------------------------------------------ describing an entry
const movieName = (m) => (m && (m.name || m.title)) || 'A movie';
export function kindOf(changes) {
  const c = changes[0];
  if (!c) return 'show';
  return c.area === 'movies' ? 'movie' : c.area;
}
export function titleOf(changes, before, after) {
  const c = changes[0];
  if (!c) return '';
  if (c.area === 'show') {
    const s = (after.shows || {})[c.id] || (before.shows || {})[c.id];
    const ids = new Set(changes.filter((x) => x.area === 'show').map((x) => x.id));
    return ((s && s.name) || 'A show') + (ids.size > 1 ? ` +${ids.size - 1} more` : '');
  }
  if (c.area === 'movies') {
    const names = [...new Set([...c.added, ...c.removed.map((r) => r.m)].map(movieName))];
    return names[0] + (names.length > 1 ? ` +${names.length - 1} more` : '');
  }
  const v = c.a || c.b;
  return (v && v.name) || (c.area === 'list' ? 'A list' : 'A title');
}

export function makeEntry(what, before, after, nowIso, rand = Math.random) {
  const changes = diffState(before, after);
  if (!changes.length) return null;
  return {
    id: 'a' + Date.parse(nowIso).toString(36) + Math.floor(rand() * 36 ** 4).toString(36),
    at: nowIso,
    what: String(what || 'Changed').slice(0, 120),
    title: titleOf(changes, before, after).slice(0, 160),
    kind: kindOf(changes),
    changes,
  };
}

// ------------------------------------------------------------------ the log itself
export function cleanLog(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.filter((e) => isObj(e) && typeof e.id === 'string' && typeof e.at === 'string' && Array.isArray(e.changes) && e.changes.length).slice(0, LOG_MAX);
}

// Newest first; at most LOG_MAX entries and SIZE_MAX characters.
export function addEntry(log, entry) {
  if (!entry) return log;
  let next = [entry, ...cleanLog(log)].slice(0, LOG_MAX);
  while (next.length > 1 && JSON.stringify(next).length > SIZE_MAX) next = next.slice(0, -1);
  return next;
}

// ------------------------------------------------------------------ status
// The comparable form of a value: lists and hidden picks ignore their sync time, and a
// deleted list / a "shown again" pick counts as not there.
function norm(area, v) {
  if (v === undefined || v === null) return undefined;
  if (area === 'list') { if (v.deleted) return undefined; const { at: _a, ...r } = v; return r; } // eslint-disable-line no-unused-vars
  if (area === 'hidden') { if (!v.on) return undefined; const { at: _a, ...r } = v; return r; } // eslint-disable-line no-unused-vars
  return v;
}
function current(state, c) {
  if (c.area === 'list') return (state.lists || {})[c.id];
  if (c.area === 'hidden') return (state.hidden || {})[c.id];
  const rec = (state.shows || {})[c.id];
  if (!c.path.length) return rec;
  if (!rec) return undefined;
  const v = rec[c.path[0]];
  if (c.path.length === 1) return v;
  return isObj(v) ? v[c.path[1]] : undefined;
}

function changeStatus(state, c) {
  if (c.area === 'movies') {
    const movies = state.movies || [];
    const keys = movies.map(stable);
    const present = (m) => keys.includes(stable(m));
    const addedIn = c.added.every(present);
    const addedOut = c.added.every((m) => !present(m));
    const removedIn = c.removed.every((r) => present(r.m));
    const removedOut = c.removed.every((r) => !present(r.m));
    if (addedIn && removedOut) return 'ok';
    if (addedOut && removedIn) return 'undone';
    return 'changed';
  }
  const cur = norm(c.area, current(state, c));
  if (same(cur, norm(c.area, c.a))) return 'ok';
  if (same(cur, norm(c.area, c.b))) return 'undone';
  return 'changed';
}

export function status(entry, state) {
  const all = entry.changes.map((c) => changeStatus(state, c));
  if (all.every((s) => s === 'ok')) return 'ok';
  if (all.every((s) => s === 'undone')) return 'undone';
  return 'changed';
}

// ------------------------------------------------------------------ undo
// -> { shows, movies, lists, hidden, touched: { shows: Set, revived: Set, deleted: Set, movies, lists, hidden } }
// Only the slices that change are new objects. Changes are put back newest-first.
export function undo(state, entry, nowIso) {
  const shows = { ...(state.shows || {}) };
  let movies = state.movies || [];
  let lists = state.lists || {};
  let hidden = state.hidden || {};
  const touched = { shows: new Set(), revived: new Set(), deleted: new Set(), movies: false, lists: false, hidden: false };

  for (const c of [...entry.changes].reverse()) {
    if (c.area === 'show') {
      const rec = shows[c.id];
      if (!c.path.length) {
        if (has(c, 'b')) { shows[c.id] = c.b; touched.shows.add(c.id); if (!rec) touched.revived.add(c.id); }
        else if (rec) { delete shows[c.id]; touched.deleted.add(c.id); }
        continue;
      }
      if (!rec) continue; // the show is gone: nothing to put back into
      const next = { ...rec };
      const [k, s] = c.path;
      if (c.path.length === 1) {
        if (has(c, 'b')) next[k] = c.b; else delete next[k];
      } else {
        const obj = isObj(next[k]) ? { ...next[k] } : {};
        if (has(c, 'b')) obj[s] = c.b; else delete obj[s];
        next[k] = obj;
      }
      shows[c.id] = next;
      touched.shows.add(c.id);
    } else if (c.area === 'movies') {
      let list = [...movies];
      for (const m of c.added) {
        const k = stable(m);
        const j = list.findIndex((x) => stable(x) === k);
        if (j !== -1) list.splice(j, 1);
      }
      for (const r of [...c.removed].sort((x, y) => x.i - y.i)) list.splice(Math.min(r.i, list.length), 0, r.m);
      movies = list;
      touched.movies = true;
    } else if (c.area === 'list') {
      const cur = lists[c.id];
      if (c.b && !c.b.deleted) lists = { ...lists, [c.id]: { ...c.b, at: nowIso } };
      else if (cur && !cur.deleted) lists = listDelete(lists, c.id, nowIso);
      else continue;
      touched.lists = true;
    } else if (c.area === 'hidden') {
      const cur = hidden[c.id];
      if (c.b && c.b.on) hidden = { ...hidden, [c.id]: { ...c.b, at: nowIso } };
      else if (cur && cur.on) hidden = { ...hidden, [c.id]: { ...cur, on: false, at: nowIso } };
      else continue;
      touched.hidden = true;
    }
  }
  return { shows, movies, lists, hidden, touched };
}

// ------------------------------------------------------------------ display
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
// "22 Oct, 9:54 pm" (local time); the year is added when it isn't this year.
export function whenText(iso, now = new Date()) {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '';
  const h = d.getHours();
  const time = `${h % 12 || 12}:${String(d.getMinutes()).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
  const day = `${d.getDate()} ${MONTHS[d.getMonth()]}${d.getFullYear() !== now.getFullYear() ? ` ${d.getFullYear()}` : ''}`;
  return `${day}, ${time}`;
}

// "S1E2" from 1, 2 or from '1x2'
export const epCode = (s, e) => `S${s}E${e}`;
export const epCodeOfKey = (k) => { const [s, e] = String(k).split('x'); return epCode(s, e); };
