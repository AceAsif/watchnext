// Achievements: badges with levels, worked out from your library. PURE: no DOM, no store.
//
// Each badge has a ladder of goals ("100 episodes", "500 episodes"…). Your current number
// decides how many levels you have reached and how far you are to the next one. Nothing is
// stored: badges are recomputed from the library every time, so they follow your data
// (remove a duplicate movie and a count can go down again).
//
// computeMetrics(state, { origins, collections }) -> numbers (see below)
// buildBadges(metrics)                           -> [badge], see BADGES
// badge: { id, title, what, value, goals, level (0 = none yet), maxLevel, next,
//          pct (to next, 0–100), done (all levels), label, nextLabel, needs ('origins'|null) }

import { watchedTitles, isAnime } from './originsLogic.js';
import { groupMovies } from './movieGroupsLogic.js';
import { collectNotes } from './notesSearchLogic.js';

export const LEVEL_NAMES = ['Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond', 'Legend'];

const plural = (n, one, many) => `${n.toLocaleString('en-AU')} ${n === 1 ? one : many || one + 's'}`;

// The badges, in display order. unit(n) -> "100 episodes". Their pictures: badgeArt.js (by id).
export const BADGES = [
  { id: 'episodes', title: 'Episode explorer', what: 'Episodes watched', goals: [100, 500, 1000, 2500, 5000, 10000], unit: (n) => plural(n, 'episode') },
  { id: 'movies', title: 'Movie buff', what: 'Different films watched', goals: [10, 50, 100, 250, 500, 1000], unit: (n) => plural(n, 'film') },
  { id: 'hours', title: 'Time traveller', what: 'Hours watched, shows and films', goals: [100, 500, 1000, 2500, 5000, 10000], unit: (n) => plural(n, 'hour') },
  { id: 'finished', title: 'Finisher', what: 'Shows watched to the last episode', goals: [1, 10, 25, 50, 100, 200], unit: (n) => plural(n, 'show') },
  { id: 'anime', title: 'Anime fan', what: 'Anime shows and films', goals: [1, 10, 25, 50, 100], unit: (n) => plural(n, 'anime', 'anime'), needs: 'origins' },
  { id: 'languages', title: 'Polyglot', what: 'Languages of the films you watched', goals: [3, 5, 10, 15, 20, 30], unit: (n) => plural(n, 'language'), needs: 'origins' },
  { id: 'countries', title: 'Globetrotter', what: 'Countries your shows and films come from', goals: [5, 10, 20, 30, 50, 75], unit: (n) => plural(n, 'country', 'countries'), needs: 'origins' },
  { id: 'genres', title: 'Genre hopper', what: 'Different genres watched', goals: [5, 10, 15, 19], unit: (n) => plural(n, 'genre') },
  { id: 'decades', title: 'Time machine', what: 'Decades your films were released in', goals: [3, 5, 7, 9], unit: (n) => plural(n, 'decade') },
  { id: 'streak', title: 'On a roll', what: 'Longest run of days in a row with something watched', goals: [3, 7, 14, 30, 60, 100], unit: (n) => plural(n, 'day') },
  { id: 'rewatch', title: 'Comfort watch', what: 'Films watched more than once', goals: [1, 5, 10, 25, 50], unit: (n) => plural(n, 'film') },
  { id: 'cinema', title: 'Big screen', what: 'Films watched at the cinema', goals: [1, 10, 25, 50, 100], unit: (n) => plural(n, 'film') },
  { id: 'critic', title: 'Critic', what: 'Ratings given', goals: [10, 50, 100, 250, 500], unit: (n) => plural(n, 'rating') },
  { id: 'notes', title: 'Note taker', what: 'Notes and reactions written', goals: [1, 10, 50, 100, 250], unit: (n) => plural(n, 'note') },
  { id: 'collections', title: 'Completionist', what: 'Movie collections fully watched', goals: [1, 5, 10, 25, 50], unit: (n) => plural(n, 'collection') },
];

const isWatchedMovie = (m) => !!m && (!m.status || m.status === 'watched');
const DAY = 86400000;

// The longest run of consecutive days with any watch (same day rule as Stats: the date part
// of the stored time).
export function longestStreak(days) {
  const nums = [...new Set(days)].map((d) => Date.parse(d + 'T00:00:00Z') / DAY).filter(Number.isFinite).sort((a, b) => a - b);
  let best = 0;
  let run = 0;
  for (let i = 0; i < nums.length; i++) {
    run = i > 0 && nums[i] === nums[i - 1] + 1 ? run + 1 : 1;
    if (run > best) best = run;
  }
  return best;
}

// Every number the badges need.
//   origins:     the origins cache ({ items }) — countries / languages / anime
//   collections: buildCollections() result, or null when not known on this device
export function computeMetrics(state, { origins = { items: {} }, collections = null } = {}) {
  const shows = Object.values((state && state.shows) || {}).filter((s) => s && typeof s === 'object');
  const movies = ((state && state.movies) || []).filter(isWatchedMovie);
  let episodes = 0;
  let minutes = 0;
  let finished = 0;
  let ratings = 0;
  const days = [];
  const genres = new Set();
  for (const s of shows) {
    const ws = Object.values(s.watched && typeof s.watched === 'object' ? s.watched : {});
    for (const w of ws) {
      const n = Number.isInteger(w && w.n) && w.n > 0 ? w.n : 1;
      episodes += n;
      minutes += ((w && w.min) || 40) * n;
      if (w && typeof w.at === 'string' && w.at.length >= 10) days.push(w.at.slice(0, 10));
    }
    if (ws.length) for (const g of s.genres || []) genres.add(g);
    if (s.followed && s.dropped !== true && s.totalEpisodes && ws.length >= s.totalEpisodes) finished++;
    if (Number(s.rating) > 0) ratings++;
  }
  const decades = new Set();
  let cinema = 0;
  for (const m of movies) {
    minutes += m.runtimeMin || 110;
    if (typeof m.watchedAt === 'string' && m.watchedAt.length >= 10) days.push(m.watchedAt.slice(0, 10));
    for (const g of m.genres || []) genres.add(g);
    if (Number(m.rating) > 0) ratings++;
    if (m.platform === 'cinema') cinema++;
    const y = Number(m.year);
    if (Number.isInteger(y) && y > 1880) decades.add(Math.floor(y / 10));
  }
  const groups = groupMovies(movies.map((m, index) => ({ ...m, index })));

  // Origins: countries, film languages, anime.
  const items = (origins && origins.items) || {};
  const countries = new Set();
  const languages = new Set();
  let anime = 0;
  let originsKnown = 0;
  let originsLinked = 0;
  for (const t of watchedTitles(state)) {
    const o = t.key ? items[t.key] : null;
    if (t.key) originsLinked++;
    if (o) {
      originsKnown++;
      o.c.forEach((c) => countries.add(c));
      if (t.kind === 'movie' && o.l) languages.add(o.l);
    }
    if (isAnime(t, o)) anime++;
  }

  return {
    episodes,
    movies: groups.length,
    hours: Math.floor(minutes / 60),
    finished,
    anime,
    languages: languages.size,
    countries: countries.size,
    genres: genres.size,
    decades: decades.size,
    streak: longestStreak(days),
    rewatch: groups.filter((g) => g.times > 1).length,
    cinema,
    critic: ratings,
    notes: collectNotes(state && state.shows, state && state.movies).length,
    collections: Array.isArray(collections) ? collections.filter((c) => c.complete).length : 0,
    originsKnown,
    originsLinked,
  };
}

export function badgeFor(def, value) {
  const v = Number.isFinite(value) ? value : 0;
  const level = def.goals.filter((g) => v >= g).length;
  const maxLevel = def.goals.length;
  const done = level === maxLevel;
  const next = done ? null : def.goals[level];
  const prev = level ? def.goals[level - 1] : 0;
  const pct = done ? 100 : Math.max(0, Math.min(99, Math.floor(((v - prev) / (next - prev)) * 100)));
  return {
    id: def.id,
    title: def.title,
    what: def.what,
    value: v,
    goals: def.goals,
    level,
    maxLevel,
    next,
    pct,
    done,
    needs: def.needs || null,
    levelName: level ? LEVEL_NAMES[level - 1] : '',
    label: level ? `${LEVEL_NAMES[level - 1]} · ${def.unit(def.goals[level - 1])}` : 'Not yet',
    nextLabel: done ? 'Every level reached' : `${def.unit(v)} of ${def.goals[level].toLocaleString('en-AU')} for ${LEVEL_NAMES[level]}`,
  };
}

export const buildBadges = (metrics) => BADGES.map((def) => badgeFor(def, metrics[def.id]));

// "23 of 82 levels" and how many badges have at least one level.
export function badgeSummary(badges) {
  return {
    levels: badges.reduce((n, b) => n + b.level, 0),
    maxLevels: badges.reduce((n, b) => n + b.maxLevel, 0),
    earned: badges.filter((b) => b.level > 0).length,
    total: badges.length,
  };
}

// Earned badges first (highest level share first), then the closest to their first level.
export function sortBadges(badges) {
  return badges.slice().sort((a, b) => {
    if (!!a.level !== !!b.level) return a.level ? -1 : 1;
    if (a.level) return b.level / b.maxLevel - a.level / a.maxLevel || b.pct - a.pct;
    return b.pct - a.pct;
  });
}
