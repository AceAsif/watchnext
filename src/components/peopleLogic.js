// Follow a person (an actor, director or writer) and hear when they have a new title.
// PURE: no DOM, no store, no network.
//
//   people = {
//     '<TMDB person id>': {
//       id, name, profile, at,     at: when you last changed this person (ISO), the sync clock
//       on: true|false,            false = unfollowed (kept so another device can't bring them back)
//       dismissed: ['tv:123', 'movie:456', …]   titles you closed in the banner
//     }
//   }
// Synced between devices like your lists: per person the most recent change wins.
//
// "New title": something they act in, direct, write or created, released in the last
// RECENT_DAYS or coming in the next UPCOMING_DAYS. Talk shows, news and self-appearances
// don't count, nor do titles already in your library or ones you dismissed.

export const PEOPLE_MAX = 200;
export const DISMISS_MAX = 300;
export const RECENT_DAYS = 45;
export const UPCOMING_DAYS = 180;
export const CHECK_HOURS = 12; // how long one person's credit list is reused before asking TMDB again
export const CREDITS_KEY = 'watchnext-people-credits-v1'; // device-only cache of credit lists
const DAY = 86400000;

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const isoOk = (s) => typeof s === 'string' && s !== '' && Number.isFinite(Date.parse(s));
const TITLE_KEY = /^(tv|movie):\d{1,9}$/;
const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

function cleanPerson(id, p) {
  if (!/^\d{1,9}$/.test(id) || !isObj(p)) return null;
  const dismissed = [...new Set((Array.isArray(p.dismissed) ? p.dismissed : []).filter((k) => typeof k === 'string' && TITLE_KEY.test(k)))].slice(-DISMISS_MAX);
  return {
    id: Number(id),
    name: str(p.name, 120) || 'Unknown',
    profile: typeof p.profile === 'string' && p.profile.startsWith('/') ? p.profile.slice(0, 100) : null,
    at: isoOk(p.at) ? p.at : '',
    on: p.on === true,
    dismissed,
  };
}

export function sanitizePeople(raw) {
  const out = {};
  if (!isObj(raw)) return out;
  for (const [id, p] of Object.entries(raw)) {
    const c = cleanPerson(id, p);
    if (c) out[id] = c;
  }
  return out;
}

export const followed = (people) => Object.values(sanitizePeople(people)).filter((p) => p.on).sort((a, b) => a.name.localeCompare(b.name));
export const isFollowing = (people, id) => !!sanitizePeople(people)[String(id)] && sanitizePeople(people)[String(id)].on;

// person: { id, name, profile }. Returns NEW people.
export function setFollow(people, person, on, nowIso) {
  const cur = sanitizePeople(people);
  const id = String(person && person.id);
  if (!/^\d{1,9}$/.test(id)) return cur;
  const prev = cur[id];
  if (on && !prev && followed(cur).length >= PEOPLE_MAX) return cur;
  if (prev && prev.on === !!on) return cur;
  return {
    ...cur,
    [id]: cleanPerson(id, {
      ...(prev || {}),
      name: (person && person.name) || (prev && prev.name),
      profile: (person && person.profile) || (prev && prev.profile) || null,
      on: !!on,
      at: nowIso,
    }),
  };
}

// Close one title in the banner for this person.
export function dismiss(people, personId, titleKey, nowIso) {
  const cur = sanitizePeople(people);
  const p = cur[String(personId)];
  if (!p || !TITLE_KEY.test(titleKey) || p.dismissed.includes(titleKey)) return cur;
  return { ...cur, [p.id]: { ...p, dismissed: [...p.dismissed, titleKey].slice(-DISMISS_MAX), at: nowIso } };
}

// Per person the newer change wins (ties: local). People only one side has are kept.
export function mergePeople(remote, local) {
  const r = sanitizePeople(remote);
  const l = sanitizePeople(local);
  const out = {};
  for (const id of new Set([...Object.keys(r), ...Object.keys(l)])) {
    const a = r[id];
    const b = l[id];
    if (!a) out[id] = b;
    else if (!b) out[id] = a;
    else out[id] = Date.parse(a.at || 0) > Date.parse(b.at || 0) ? a : b;
  }
  return out;
}
export const samePeople = (a, b) => JSON.stringify(sanitizePeople(a)) === JSON.stringify(sanitizePeople(b));

// Restore from backup: add the people this device has no record of. Never overwrites.
export function fillPeople(local, backup) {
  const l = sanitizePeople(local);
  const b = sanitizePeople(backup);
  const out = { ...l };
  let added = 0;
  for (const [id, p] of Object.entries(b)) {
    if (out[id] || !p.on) continue;
    out[id] = p;
    added++;
  }
  return { people: out, added };
}

// ------------------------------------------------------------------ credits → news
const SKIP_GENRES = new Set([10767, 10763]); // Talk, News
const SELF = /^(self|himself|herself|themselves|narrator \(voice\)|host)\b/i;
const CREW_JOBS = new Set(['Director', 'Writer', 'Screenplay', 'Creator', 'Novel', 'Story']);

// TMDB /person/{id}/combined_credits -> the small list we keep: [{ key, kind, id, name, poster, date, role }]
export function slimCredits(combined) {
  const by = new Map();
  const add = (c, role) => {
    if (!c || !c.id || (c.media_type !== 'tv' && c.media_type !== 'movie')) return;
    if (Array.isArray(c.genre_ids) && c.genre_ids.some((g) => SKIP_GENRES.has(g))) return;
    const key = `${c.media_type}:${c.id}`;
    const date = (c.media_type === 'tv' ? c.first_air_date : c.release_date) || '';
    const cur = by.get(key);
    if (cur) { if (role && !cur.role.includes(role)) cur.role = `${cur.role}, ${role}`; return; }
    by.set(key, { key, kind: c.media_type, id: c.id, name: c.title || c.name || 'Untitled', poster: c.poster_path || null, date: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : '', role: role || '' });
  };
  for (const c of (combined && combined.cast) || []) {
    if (c && SELF.test(String(c.character || ''))) continue;
    add(c, c && c.character ? `as ${c.character}` : 'Cast');
  }
  for (const c of (combined && combined.crew) || []) if (c && CREW_JOBS.has(c.job)) add(c, c.job);
  return [...by.values()];
}

const dayNum = (d) => Math.floor(Date.parse(d + 'T00:00:00Z') / DAY);

// The banner's news: for every person you follow, their titles in the window.
//   people:  your follows; credits: { [personId]: { at, list: slimCredits() } }
//   tracked: Set of 'tv:<id>' / 'movie:<id>' already in your library
// -> [{ key, person: { id, name }, title: {…slim credit}, upcoming }] most relevant first:
//    out now (newest first), then coming soon (soonest first)
export function newTitles(people, credits, tracked, today) {
  const t = dayNum(today);
  const out = [];
  const seen = new Set();
  for (const p of followed(people)) {
    const c = credits && credits[p.id];
    for (const cr of (c && Array.isArray(c.list) ? c.list : [])) {
      if (!cr.date || tracked.has(cr.key) || p.dismissed.includes(cr.key)) continue;
      const d = dayNum(cr.date);
      if (d < t - RECENT_DAYS || d > t + UPCOMING_DAYS) continue;
      const k = `${p.id}|${cr.key}`;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push({ key: k, person: { id: p.id, name: p.name }, title: cr, upcoming: d > t });
    }
  }
  return out.sort((a, b) => {
    if (a.upcoming !== b.upcoming) return a.upcoming ? 1 : -1;
    return a.upcoming ? a.title.date.localeCompare(b.title.date) : b.title.date.localeCompare(a.title.date);
  });
}

// Which followed people need their credits (re)loaded.
export function peopleToCheck(people, credits, now = Date.now()) {
  return followed(people).filter((p) => {
    const c = credits && credits[p.id];
    return !c || !isoOk(c.at) || now - Date.parse(c.at) > CHECK_HOURS * 3600000;
  }).map((p) => p.id);
}

export function loadCredits(storage) {
  try {
    const raw = JSON.parse(storage.getItem(CREDITS_KEY));
    if (!isObj(raw)) return {};
    const out = {};
    for (const [id, c] of Object.entries(raw)) if (/^\d+$/.test(id) && isObj(c) && Array.isArray(c.list) && isoOk(c.at)) out[id] = { at: c.at, list: c.list.filter((x) => isObj(x) && TITLE_KEY.test(x.key)) };
    return out;
  } catch (e) {
    return {};
  }
}
export function saveCredits(storage, credits) {
  try { storage.setItem(CREDITS_KEY, JSON.stringify(credits)); } catch (e) { /* full: fetched again later */ }
}
