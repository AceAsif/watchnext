// Watchlist total time: "≈ 23 days to finish everything".
// PURE: no DOM, no store.
//
// Total = every episode (that is out) of the shows on your watchlist + every movie on it.
// Runtimes come from TMDB; a title without one uses a typical length and is counted as a guess.
// Days to finish = total ÷ YOUR pace: the minutes you watched a day over the last PACE_DAYS
// (bulk imports left out). With too little recent watching, a plain 2 hours a day is used.

export const EP_GUESS = 40;      // minutes per episode when TMDB has no runtime
export const MOVIE_GUESS = 110;  // minutes per movie when TMDB has no runtime
export const PACE_DAYS = 60;
export const PACE_MIN_DAYS = 3;  // days with watching needed before your pace is trusted
export const DEFAULT_PACE = 120; // minutes a day when your pace isn't known
const BATCH = 15;                // >= this many watches in one minute = an import, not watching
const DAY = 86400000;

const posInt = (v) => (Number.isFinite(v) && v > 0 ? Math.round(v) : 0);

// Episodes of a show that are out now (today: 'YYYY-MM-DD'), and how many are announced.
export function episodesOut(show, today) {
  const seasons = (show.seasons || []).filter((s) => s && s.n >= 1);
  const listed = seasons.reduce((n, s) => n + posInt(s.count), 0);
  const total = listed || posInt(show.totalEpisodes);
  if (!total) return { out: 0, coming: 0 };
  let coming = 0;
  for (const s of seasons) if (s.air && s.air > today) coming += posInt(s.count);
  const na = show.nextAir;
  if (na && na.date && na.date > today) {
    const cur = seasons.find((s) => s.n === na.season);
    if (cur && !(cur.air && cur.air > today)) coming += Math.max(0, posInt(cur.count) - (posInt(na.episode) || 1) + 1);
  }
  coming = Math.min(coming, total);
  return { out: total - coming, coming };
}

// One show on the watchlist: { minutes, eps, coming, guessed }
export function showTime(show, today) {
  const { out, coming } = episodesOut(show, today);
  const seen = Object.keys(show.watched || {}).length;
  const eps = Math.max(0, out - seen);
  const per = posInt(show.runtimeMin);
  return { minutes: eps * (per || EP_GUESS), eps, coming, guessed: !per || !out };
}

export function movieTime(m) {
  const r = posInt(m.runtimeMin);
  return { minutes: r || MOVIE_GUESS, guessed: !r };
}

// shows: [show records]; movies: [movie records]
export function watchlistTotal(shows, movies, today) {
  let showMin = 0;
  let movieMin = 0;
  let eps = 0;
  let coming = 0;
  let guessed = 0;
  for (const s of shows) {
    const t = showTime(s, today);
    showMin += t.minutes; eps += t.eps; coming += t.coming;
    if (t.guessed) guessed++;
  }
  for (const m of movies) {
    const t = movieTime(m);
    movieMin += t.minutes;
    if (t.guessed) guessed++;
  }
  return { minutes: showMin + movieMin, showMin, movieMin, shows: shows.length, movies: movies.length, eps, coming, guessed };
}

// Your pace: minutes watched a day over the last PACE_DAYS (rewatches and +1 included),
// from episode and movie dates.
// -> { perDay, days } (days = days you watched something) or null when there's too little.
export function yourPace(state, nowMs = Date.now()) {
  const from = nowMs - PACE_DAYS * DAY;
  const events = []; // [iso, minutes]
  for (const s of Object.values((state && state.shows) || {})) {
    if (!s) continue;
    for (const w of Object.values(s.watched || {})) {
      if (!w || typeof w.at !== 'string') continue;
      const min = posInt(w.min) || posInt(s.runtimeMin) || EP_GUESS;
      events.push([w.at, min]);
      if (typeof w.last === 'string' && w.last !== w.at) events.push([w.last, min]);
    }
    const done = s.rewatch && s.rewatch.done;
    if (done && typeof done === 'object') for (const at of Object.values(done)) if (typeof at === 'string') events.push([at, posInt(s.runtimeMin) || EP_GUESS]);
  }
  for (const m of (state && state.movies) || []) {
    if (!m || (m.status && m.status !== 'watched') || typeof m.watchedAt !== 'string') continue;
    events.push([m.watchedAt, posInt(m.runtimeMin) || MOVIE_GUESS]);
  }
  const recent = events.filter(([at]) => { const t = Date.parse(at); return Number.isFinite(t) && t >= from && t <= nowMs; });
  const perMinute = new Map();
  for (const [at] of recent) { const k = at.slice(0, 16); perMinute.set(k, (perMinute.get(k) || 0) + 1); }
  let total = 0;
  let first = nowMs;
  const days = new Set();
  for (const [at, min] of recent) {
    if (perMinute.get(at.slice(0, 16)) >= BATCH) continue; // an import, not real watching
    total += min;
    days.add(at.slice(0, 10));
    first = Math.min(first, Date.parse(at));
  }
  if (days.size < PACE_MIN_DAYS || total <= 0) return null;
  // Averaged over the whole window, or since your first watch in it if that's later (new users),
  // but never under a week, so one big weekend doesn't look like your everyday pace.
  const span = Math.max(7, Math.min(PACE_DAYS, (nowMs - first) / DAY));
  return { perDay: total / span, days: days.size };
}

// "2 days 6 hrs", "5 hrs 20 min", "45 min" — viewing time as a length of time.
export function fmtLength(min) {
  const m = Math.max(0, Math.round(min));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h < 24) return r ? `${h} hr${h === 1 ? '' : 's'} ${r} min` : `${h} hr${h === 1 ? '' : 's'}`;
  const d = Math.floor(h / 24);
  const hh = h % 24;
  return `${d} day${d === 1 ? '' : 's'}${hh ? ` ${hh} hr${hh === 1 ? '' : 's'}` : ''}`;
}
// Short form for rows: "7 hrs", "1 hr 45 min", "3 days".
export function fmtShort(min) {
  const m = Math.max(0, Math.round(min));
  if (m < 60) return `${m} min`;
  const h = m / 60;
  if (h < 10) { const hh = Math.floor(h); const r = m - hh * 60; return r ? `${hh} hr ${r} min` : `${hh} hr${hh === 1 ? '' : 's'}`; }
  if (h < 48) return `${Math.round(h)} hrs`;
  return `${Math.round(h / 24)} days`;
}

// Days to finish and the day you'd be done.
// -> { days, date: 'YYYY-MM-DD', perDay, yours: true|false }
export function finishEstimate(minutes, pace, today) {
  const perDay = pace ? pace.perDay : DEFAULT_PACE;
  const days = minutes > 0 ? Math.max(1, Math.ceil(minutes / perDay)) : 0;
  const t = Date.parse(today + 'T00:00:00Z');
  const date = new Date(t + days * DAY).toISOString().slice(0, 10);
  return { days, date, perDay, yours: !!pace };
}

// "≈ 23 days to finish everything"
export function headline(est) {
  if (!est.days) return 'Nothing left to watch';
  if (est.days > 3650) return '10+ years to finish everything';
  if (est.days >= 730) return `≈ ${Math.round(est.days / 365)} years to finish everything`;
  return `≈ ${est.days.toLocaleString('en-AU')} day${est.days === 1 ? '' : 's'} to finish everything`;
}

// "at your pace of 1 hr 50 min a day" / "at 2 hrs a day"
export const paceText = (est) => (est.yours ? `at your pace of ${fmtShort(est.perDay)} a day` : `at ${fmtShort(est.perDay)} a day`);

// Sorting the queue: 'az' (A–Z), 'short' (quickest to finish first) or 'rated' (highest
// IMDb score first, TMDB when IMDb has none; only offered when scores are switched on).
export const SORTS = [['az', 'A–Z'], ['short', 'Quickest first'], ['rated', 'Highest rated']];
