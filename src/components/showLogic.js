// Pure logic behind the redesigned show page. No React, no store imports
// beyond the key format, so it can be unit-tested with plain node.

export const epKey = (s, e) => `${s}x${e}`;

// When TMDB hasn't given a season its own premiere date, the show's nextAir can
// stand in — but ONLY if the next episode to air is that season's episode 1.
// nextAir.date is the next *episode's* date, so for a season that's already
// mid-run (next up is E5) it says nothing about the premiere, and using it
// would mislabel a season you're halfway through as "not released yet".
// A missing episode number (very old synced data) is treated as a premiere,
// which is the conservative legacy behaviour.
export function seasonPremiereDate(show, season) {
  if (season.air) return season.air;
  const na = show.nextAir;
  const isPremiere = na && na.season === season.n && (na.episode == null || na.episode <= 1);
  return isPremiere ? na.date : null;
}

// Progress + release state for one season, from stored data only.
// `today` is an ISO date (YYYY-MM-DD) so tests can pin it.
//
// upcoming: TMDB dates the season in the future, or (when it hasn't dated it)
// the season has no episodes and nothing watched. The show's nextAir covers the
// airing season even on data synced before per-season air dates existed.
export function seasonInfo(show, season, today) {
  const watched = show.watched || {};
  const seen = Object.keys(watched).filter((k) => k.startsWith(season.n + 'x')).length;
  const count = season.count || 0;
  const airDate = seasonPremiereDate(show, season);
  const upcoming = !!((airDate && airDate > today) || (!airDate && count === 0 && seen === 0));
  return {
    seen,
    count,
    // Rewatches/specials can push seen past count (e.g. 14/13) — clamp the bar.
    pct: count ? Math.min(100, Math.round((seen / count) * 100)) : 0,
    done: count > 0 && seen >= count,
    upcoming,
    airDate,
  };
}

// The first episode still to watch that has actually aired — what the big
// "Mark S03·E01 watched" button acts on. Returns { season, episode } or null.
//
// Mirrors the gap-filling scan Up Next uses (earliest unwatched, specials
// skipped) but adds an aired-yet guard, because TMDB's episode_count includes
// announced-but-unaired episodes and we must never offer to mark one watched.
export function nextToMark(show, today) {
  const watched = show.watched || {};
  const seasons = (show.seasons || [])
    .filter((se) => se.n >= 1)
    .sort((a, b) => a.n - b.n);
  const na = show.nextAir;
  for (const se of seasons) {
    for (let e = 1; e <= (se.count || 0); e++) {
      if (watched[epKey(se.n, e)]) continue;
      // First unwatched episode found — is it out yet?
      const seasonAir = seasonPremiereDate(show, se);
      if (seasonAir && seasonAir > today) return null; // whole season upcoming
      if (na && na.date > today && na.season === se.n && e >= na.episode) return null;
      return { season: se.n, episode: e };
    }
  }
  return null;
}

// How many leading, fully-watched seasons to fold into one "Seasons 1–7" row.
// Only worth it for long shows with a remaining tail: at least 3 finished in a
// row AND at least one season left over (a wholly-finished show just lists all).
export function leadingDoneCount(infos) {
  let k = 0;
  while (k < infos.length && infos[k].done) k++;
  return k >= 3 && k < infos.length ? k : 0;
}

// Which season to open by default: the one holding the next episode, else the
// first started-but-unfinished aired season, else none.
export function currentSeasonN(infoBySeason, next) {
  if (next) return next.season;
  const hit = infoBySeason.find((x) => !x.info.done && !x.info.upcoming && x.info.seen > 0);
  return hit ? hit.season : null;
}

// Leading run of already-watched episodes that can fold into one
// "E01–E12 · all watched" row, so a long season doesn't bury the next episode
// under a wall of ticks. The most recent watched episode stays visible for
// context, and short runs aren't worth folding. `episodeNumbers` is the
// season's episode numbers in air order. Returns how many to fold (0 = none).
export function leadingWatchedFold(episodeNumbers, watched, season, minFold = 4) {
  let run = 0;
  while (run < episodeNumbers.length && watched[epKey(season, episodeNumbers[run])]) run++;
  const fold = run - 1;
  return fold >= minFold ? fold : 0;
}
