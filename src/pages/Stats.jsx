import React, { useMemo, useState } from 'react';
import { useStore } from '../store/useStore.js';
import { Chevron } from '../components/ui.jsx';
import { movieStatus } from '../store/db.js';
import Stars from '../components/Stars.jsx';
import YearInReview from '../components/YearInReview.jsx';
import MonthInReview from '../components/MonthInReview.jsx';
import MonthVsLastYear from '../components/MonthVsLastYear.jsx';
import GoalsCard from '../components/GoalsCard.jsx';
import { cardGoals } from '../components/goalsLogic.js';
import { platformById } from '../components/PlatformPicker.jsx';
import Heatmap from '../components/Heatmap.jsx';
import YourTaste from '../components/YourTaste.jsx';
import AchievementsView from '../components/AchievementsView.jsx';
import WorldView from '../components/WorldView.jsx';
import SyncingNote, { useLibrarySyncing } from '../components/SyncingNote.jsx';
import { StatTile, TabBar, YearSelect, BarList, Section, Note } from '../components/StatsUI.jsx';
import {
  BATCH_MIN,
  fmtDay,
  weekdayOf,
  dayNum,
  computeHabits,
  busiestMonthOf,
  activeDaysOf,
  realDaySet,
  streakRangeLabel,
  durationParts,
  timeTotals,
} from '../components/statsLogic.js';
import { localISODate } from '../components/showLogic.js';
import { localDate } from '../components/csvExport.js';
import { binges, genreTrends } from '../components/moreStatsLogic.js';
import { viewingDates, doneDates } from '../components/viewingDates.js';
import { rewatchedShows, rewatchedMovies, rewatchSummary } from '../components/rewatchLogic.js';
import { lovedShows, collectNotes, LOVE_WEIGHT, FUNNY_WEIGHT } from '../components/notesSearchLogic.js';

// Stats — the Claude Design layout: a title, a four-way tab bar, and cards. On
// a phone each tab is a single column; on desktop (>= 900px) the tabs lay their
// cards out side by side (see "Stats" in components/ui.css). All the numbers
// come from the `base` computation below, unchanged; the pure de-skew helpers
// (bulk-import smoothing, busiest day, heatmap grid) live in statsLogic.js.

const TABS = ['Overview', 'Habits', 'Rankings', 'Breakdown', 'Badges', 'World'];
const plural = (n, one, many) => (n === 1 ? one : many || one + 's');
// "6 hrs 36 min", "45 min"
const fmtMins = (m) => { const h = Math.floor(m / 60), r = Math.round(m % 60); return h ? `${h} ${h === 1 ? 'hr' : 'hrs'}${r ? ` ${r} min` : ''}` : `${r} min`; };

// Stats → Habits: the most episodes of one show you watched in one day.
function BingeList({ rows, scope }) {
  return (
    <Section title="Biggest binges" className="a-binge">
      {rows.length ? (
        <ol className="sd-card sd-binges" aria-label={`Biggest binges, ${scope}`} data-testid="binges">
          {rows.map((r, i) => (
            <li key={r.id + r.day} className="sd-binge">
              <span className="sd-binge-n sd-mono" aria-hidden="true">{i + 1}</span>
              <span className="sd-binge-main">
                <span className="sd-binge-name">{r.name}</span>
                <span className="sd-binge-meta sd-mono">{fmtDay(r.day)} · {fmtMins(r.minutes)}</span>
              </span>
              <span className="sd-binge-eps"><b>{r.eps}</b> eps</span>
            </li>
          ))}
        </ol>
      ) : (
        <div className="sd-card sd-pad sd-empty">No binges yet ({scope}): watch 2 or more episodes of a show in one day.</div>
      )}
      <Note>One show, one day (your local day). Bulk-marked batches, like imports or “mark season watched”, are left out.</Note>
    </Section>
  );
}

// Stats → Breakdown: your top genres year by year, as a share of that year's watching.
function GenreTrends({ data }) {
  const max = Math.max(1, ...data.rows.flatMap((r) => r.shares));
  return (
    <Section title="Genres over time" className="a-gtrend">
      <div className="sd-card sd-gtrend-wrap">
        <table className="sd-gtrend" data-testid="genre-trends">
          <thead>
            <tr><th scope="col"><span className="sd-vh">Genre</span></th>{data.years.map((y) => <th scope="col" key={y}>{y}</th>)}</tr>
          </thead>
          <tbody>
            {data.rows.map((r) => (
              <tr key={r.genre}>
                <th scope="row">{r.genre}</th>
                {r.shares.map((v, i) => (
                  <td key={data.years[i]} style={{ '--a': (0.08 + 0.62 * (v / max)).toFixed(2) }} title={`${r.genre}, ${data.years[i]}: ${v}% of your watching (${r.counts[i].toLocaleString()} watches)`}>{v}%</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {(data.rising || data.falling) && (
        <p className="sd-gtrend-move" data-testid="genre-moves">
          {data.rising && <span className="up">▲ {data.rising.genre} up from {data.rising.from}% to {data.rising.to}% ({data.rising.fromYear} → {data.rising.toYear})</span>}
          {data.falling && <span className="down">▼ {data.falling.genre} down from {data.falling.from}% to {data.falling.to}%</span>}
        </p>
      )}
      <Note>Share of each year’s episodes and films. A title in two genres counts for both, so a year can add up to more than 100%.</Note>
    </Section>
  );
}

// The Overview headline: "1 year 2 months 5 days" (big numbers, small units); zero parts are left out,
// and under a month it is just days.
function HeroSpan({ span, size = 'hero' }) {
  const { years, months, days } = span;
  const parts = [];
  if (years > 0) parts.push([years, plural(years, 'year')]);
  if (months > 0) parts.push([months, plural(months, 'month')]);
  if (days > 0 || parts.length === 0) parts.push([days, plural(days, 'day')]);
  return (
    <>
      {parts.map(([n, word], i) => (
        <React.Fragment key={word}>
          {n}<span className={`sd-tile-u u-${size}`}>{` ${word}${i < parts.length - 1 ? ' ' : ''}`}</span>
        </React.Fragment>
      ))}
    </>
  );
}

export default function Stats({ onOpenNotes, onOpenCompare, startTab = 'Overview' }) {
  const state = useStore();
  const librarySyncing = useLibrarySyncing();
  const [year, setYear] = useState('all');       // Habits day-of-week scope
  const [reviewYear, setReviewYear] = useState(null); // Year in review scope
  const [tab, setTab] = useState(startTab); // Stats sub-tab
  const noteCount = useMemo(() => collectNotes(state.shows, state.movies).length, [state.shows, state.movies]);

  const base = useMemo(() => {
    let episodes = 0;
    let minutes = 0;
    const perShow = [];
    const perYear = {};       // year -> episodes watched
    const perYearMin = {};    // year -> minutes watched (TV + movies)
    const perYearShows = {};  // year -> [{ name, poster, count }]
    const perYearGenre = {};  // year -> { genre: episodes }
    const moviesPerYear = {};
    const perGenre = {};
    const perPlatform = {}; // platform id -> { min, eps, titles }
    let untaggedMin = 0;    // watched minutes on shows/movies with no platform
    let untaggedTitles = 0;
    let finished = 0;
    let inProgress = 0;
    let notStarted = 0;
    let dropped = 0;
    let genreDataMissing = 0;
    const ratedShows = [];
    const events = []; // one per dated watch: { year, day, wd, minute, ts }

    for (const show of Object.values(state.shows)) {
      const entries = Object.values(show.watched || {});
      if (show.rating) ratedShows.push({ name: show.name, rating: show.rating, ratedAt: show.ratedAt || '' });
      let count = 0;
      let showMin = 0;
      const showYear = {}; // this show's episodes per year
      const done = doneDates(show);
      for (const [k, w] of Object.entries(show.watched || {})) {
        const n = w.n || 1;
        count += n;
        episodes += n;
        showMin += (w.min || 40) * n;
        minutes += (w.min || 40) * n;
        // Each viewing on its own date (first watch, rewatch, "+1"), so a rewatch this year counts
        // this year even when the first watch was long ago. Same rule as Month in review.
        for (const v of viewingDates(w, done[k])) {
          // Days, months and years are YOUR local ones (a 1am watch in Hobart is that day, not
          // yesterday in UTC), the same as Month in review and This month vs last year.
          const day = localDate(v.at);
          const y = day.slice(0, 4);
          perYear[y] = (perYear[y] || 0) + 1;
          perYearMin[y] = (perYearMin[y] || 0) + (w.min || 40);
          showYear[y] = (showYear[y] || 0) + 1;
          if (v.own) {
            events.push({ year: y, day, wd: weekdayOf(day), minute: v.at.slice(0, 16), ts: v.at });
          }
        }
      }
      if (entries.length) perShow.push({ label: show.name, value: count });

      // Per-year "top shows" + genre tallies (for the Year in review card)
      for (const [y, c] of Object.entries(showYear)) {
        (perYearShows[y] || (perYearShows[y] = [])).push({ name: show.name, poster: show.poster || null, count: c });
        if (show.genres && show.genres.length) {
          const gm = perYearGenre[y] || (perYearGenre[y] = {});
          for (const g of show.genres) gm[g] = (gm[g] || 0) + c;
        }
      }

      // Per-platform tally (where you watch). A show's platform applies to all
      // its watched episodes; shows with no platform go to the untagged bucket.
      if (count > 0) {
        const pid = show.platform;
        if (pid) {
          const p = perPlatform[pid] || (perPlatform[pid] = { min: 0, eps: 0, titles: 0 });
          p.min += showMin;
          p.eps += count;
          p.titles += 1;
        } else {
          untaggedMin += showMin;
          untaggedTitles += 1;
        }
      }

      // Completion buckets (followed shows only, so the numbers match Library)
      if (show.followed) {
        const seen = entries.length;
        const total = show.totalEpisodes;
        if (show.dropped === true) dropped++; // kept out of the completion buckets
        else if (total && seen >= total) finished++;
        else if (seen > 0) inProgress++;
        else notStarted++;
      }

      // Genre tally (all-time), weighted by episodes watched of that show
      if (count > 0) {
        if (show.genres && show.genres.length) {
          for (const g of show.genres) {
            perGenre[g] = (perGenre[g] || 0) + count;
          }
        } else {
          genreDataMissing++;
        }
      }
    }

    let movieMinutes = 0;
    let watchedMovieCount = 0;
    const ratedMovies = [];
    for (const m of state.movies) {
      if (movieStatus(m) !== 'watched') continue; // still on the watchlist
      watchedMovieCount++;
      if (m.rating) ratedMovies.push({ name: m.name, rating: m.rating, ratedAt: m.ratedAt || '' });
      movieMinutes += m.runtimeMin || 110;
      // Per-platform tally (movies count as one title each)
      if (m.platform) {
        const p = perPlatform[m.platform] || (perPlatform[m.platform] = { min: 0, eps: 0, titles: 0 });
        p.min += m.runtimeMin || 110;
        p.titles += 1;
      } else {
        untaggedMin += m.runtimeMin || 110;
        untaggedTitles += 1;
      }
      const mDay = m.watchedAt ? localDate(m.watchedAt) : '';
      if (mDay) {
        const day = mDay;
        const y = day.slice(0, 4);
        moviesPerYear[y] = (moviesPerYear[y] || 0) + 1;
        perYearMin[y] = (perYearMin[y] || 0) + (m.runtimeMin || 110);
        events.push({ year: y, day, wd: weekdayOf(day), minute: m.watchedAt.slice(0, 16), ts: m.watchedAt });
      }
    }

    // Sort per-year top shows, and pick each year's top genre
    for (const y of Object.keys(perYearShows)) {
      perYearShows[y].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
    }
    const perYearTopGenre = {};
    for (const [y, gm] of Object.entries(perYearGenre)) {
      let best = null;
      for (const [g, c] of Object.entries(gm)) if (!best || c > best.c) best = { g, c };
      if (best) perYearTopGenre[y] = best.g;
    }

    // Where you watch: hours per platform, brand-coloured, most-watched first.
    const platformRows = Object.entries(perPlatform)
      .map(([id, v]) => {
        const p = platformById(id);
        return { label: p ? p.label : id, value: Math.round(v.min / 60), color: p ? p.color : undefined };
      })
      .filter((r) => r.value > 0)
      .sort((a, b) => b.value - a.value);

    // De-skewed watches per day for the activity heatmap: a bulk-import batch
    // (a minute with >= BATCH_MIN watches) counts once, so a backlog dump on
    // one date doesn't saturate the whole grid.
    const dailyMinuteCount = {};
    for (const e of events) dailyMinuteCount[e.minute] = (dailyMinuteCount[e.minute] || 0) + 1;
    const dailyCounts = {};
    const dailySeenBatch = new Set();
    // Days that only hold a bulk-marked batch are not real viewing days: not lit, not in streaks.
    const realDays = realDaySet(events);
    for (const e of events) {
      if (!realDays.has(e.day)) continue;
      if (dailyMinuteCount[e.minute] >= BATCH_MIN) {
        if (!dailySeenBatch.has(e.minute)) {
          dailySeenBatch.add(e.minute);
          dailyCounts[e.day] = (dailyCounts[e.day] || 0) + 1;
        }
      } else {
        dailyCounts[e.day] = (dailyCounts[e.day] || 0) + 1;
      }
    }

    const watchlistShows = Object.values(state.shows).filter(
      (sh) => sh.watchlist && !sh.followed
    ).length;
    const watchlistMovies = state.movies.filter(
      (m) => movieStatus(m) === 'planned'
    ).length;

    perShow.sort((a, b) => b.value - a.value);
    // Recently rated first; fall back to rating then name for items with no
    // ratedAt yet (existing ratings from before this was tracked).
    const byRecent = (a, b) =>
      (b.ratedAt || '').localeCompare(a.ratedAt || '') ||
      b.rating - a.rating ||
      a.name.localeCompare(b.name);
    ratedShows.sort(byRecent);
    ratedMovies.sort(byRecent);

    // --- streaks (all-time; real days only, so a bulk-marked import day is not a streak day) ---
    const dayKeys = [...realDays].sort(); // ISO dates sort chronologically
    const nums = dayKeys.map(dayNum);
    let longest = 0;
    let longestEndNum = null;
    let run = 0;
    for (let i = 0; i < nums.length; i++) {
      run = i > 0 && nums[i] === nums[i - 1] + 1 ? run + 1 : 1;
      if (run > longest) {
        longest = run;
        longestEndNum = nums[i];
      }
    }
    const numToDate = (n) => new Date(n * 86400000).toISOString().slice(0, 10);
    const longestRange =
      longest > 0
        ? { len: longest, from: numToDate(longestEndNum - longest + 1), to: numToDate(longestEndNum) }
        : null;

    // Current streak: consecutive active days ending today or yesterday (so it
    // doesn't read as broken just because you haven't watched yet today).
    const todayNum = dayNum(localISODate()); // today on this device, not in UTC
    let current = 0;
    if (nums.length) {
      const last = nums[nums.length - 1];
      if (last === todayNum || last === todayNum - 1) {
        current = 1;
        for (let i = nums.length - 2; i >= 0; i--) {
          if (nums[i] === nums[i + 1] - 1) current++;
          else break;
        }
      }
    }

    const years = [...new Set(events.map((e) => e.year))].sort((a, b) => b.localeCompare(a));
    const yearBars = Object.entries(perYear)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([label, value]) => ({ label, value }));
    const movieYears = Object.entries(moviesPerYear)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([label, value]) => ({ label, value }));
    const genres = Object.entries(perGenre)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([label, value]) => ({ label, value }));

    return {
      episodes,
      hours: Math.round(minutes / 60),
      days: (minutes / 60 / 24).toFixed(1),
      span: durationParts(minutes),
      showCount: perShow.length,
      movieCount: watchedMovieCount,
      movieHours: Math.round(movieMinutes / 60),
      movieSpan: durationParts(movieMinutes),
      both: timeTotals(minutes, movieMinutes).both, // TV and movies together (exact minutes)
      topShows: perShow.slice(0, 12),
      lovedShows: lovedShows(state.shows),
      rewatchShows: rewatchedShows(state.shows),
      rewatchMovies: rewatchedMovies(state.movies),
      years,          // year strings for the selectors (newest first)
      yearBars,
      movieYears,
      genres,
      genreDataMissing,
      watchlistShows,
      watchlistMovies,
      topRatedShows: ratedShows.slice(0, 8),
      topRatedMovies: ratedMovies.slice(0, 8),
      currentStreak: current,
      longestStreak: longest,
      longestRange,
      events,
      hasHabits: events.length > 0,
      // per-year data for the Year in review card
      perYearEpisodes: perYear,
      perYearMin,
      moviesPerYear,
      perYearShows,
      perYearTopGenre,
      platformRows,
      untaggedHours: Math.round(untaggedMin / 60),
      untaggedTitles,
      dailyCounts,
      completion: [
        { label: 'Finished', value: finished },
        { label: 'Watching', value: inProgress },
        { label: 'Not started', value: notStarted },
        ...(dropped > 0 ? [{ label: 'Dropped', value: dropped }] : []),
      ],
    };
  }, [state.shows, state.movies]);

  const habits = useMemo(() => computeHabits(base.events, year), [base.events, year]);
  const bingeRows = useMemo(() => binges(state.shows, { year }), [state.shows, year]);
  const trends = useMemo(() => genreTrends(state.shows, state.movies), [state.shows, state.movies]);

  const activeReviewYear = reviewYear ?? base.years[0] ?? null;
  // What you watched in a year, counted exactly as the Year in review card counts it.
  const actualsOf = (y) => ({ episodes: base.perYearEpisodes[y] || 0, movies: base.moviesPerYear[y] || 0, hours: Math.round((base.perYearMin[y] || 0) / 60) });
  const todayIso = localISODate();
  const goalYear = todayIso.slice(0, 4);

  const review = useMemo(() => {
    const y = activeReviewYear;
    if (!y) return null;
    const prev = String(Number(y) - 1);
    const ep = base.perYearEpisodes[y] || 0;
    const epPrev = base.perYearEpisodes[prev] || 0;
    return {
      year: y,
      episodes: ep,
      hours: Math.round((base.perYearMin[y] || 0) / 60),
      movies: base.moviesPerYear[y] || 0,
      activeDays: activeDaysOf(base.events, y),
      topShows: (base.perYearShows[y] || []).slice(0, 3),
      topGenre: base.perYearTopGenre[y] || null,
      busiestMonth: busiestMonthOf(base.events, y),
      prevYear: epPrev ? prev : null,
      epDelta: epPrev ? Math.round(((ep - epPrev) / epPrev) * 100) : null,
      goals: cardGoals(state.goals, y, { episodes: ep, movies: base.moviesPerYear[y] || 0, hours: Math.round((base.perYearMin[y] || 0) / 60) }, localISODate()),
    };
  }, [base, activeReviewYear, state.goals]);

  if (base.episodes === 0 && base.movieCount === 0) {
    return (
      <div className="sd-page">
        <h1 className="sd-title">Stats</h1>
        <SyncingNote />
        {!librarySyncing && (
          <div className="sd-card sd-pad sd-empty">
            No watch history yet. Import your TV Time data in Settings, or start marking episodes watched.
          </div>
        )}
      </div>
    );
  }

  const scopeLabel = year === 'all' ? 'all years' : year;
  const today = localISODate();
  const yearOptions = [{ value: 'all', label: 'All years' }, ...base.years.map((y) => ({ value: y, label: y }))];

  // ------------------------------------------------------------- Overview
  const overview = (
    <div className="sd-cols-stats">
      <div className="sd-stack">
        <Section title="All time">
          <StatTile
            size="hero"
            statKey="days"
            value={<HeroSpan span={base.span} />}
            plain
            label={`of TV — ${base.hours.toLocaleString()} hours (${base.days} days) across ${base.showCount.toLocaleString()} ${plural(base.showCount, 'show')}`}
          />
          <div className="sd-tiles">
            <StatTile statKey="episodes" value={base.episodes.toLocaleString()} label="Episodes" />
            <StatTile statKey="shows" value={base.showCount.toLocaleString()} label="Shows started" />
            <StatTile statKey="movies" value={base.movieCount.toLocaleString()} label="Movies" />
            <StatTile statKey="movie-hours" value={<HeroSpan span={base.movieSpan} size="md" />} label={`Of movies · ${base.movieHours.toLocaleString()} h`} />
          </div>
          <StatTile
            size="lg"
            statKey="all-time-both"
            value={<HeroSpan span={base.both.span} size="lg" />}
            plain
            label={`of TV and movies together — ${base.both.hours.toLocaleString()} hours (${base.both.days} days)`}
          />
          {(base.watchlistShows > 0 || base.watchlistMovies > 0) && (
            <Note>
              On your watchlist: {base.watchlistShows} {plural(base.watchlistShows, 'show')},{' '}
              {base.watchlistMovies} {plural(base.watchlistMovies, 'movie')}.
            </Note>
          )}
        </Section>
      </div>
      <div className="sd-stack">
        <GoalsCard year={goalYear} goals={state.goals} actualsOf={actualsOf} today={todayIso} streak={{ current: base.currentStreak, longest: base.longestStreak }} />
        {review && <YearInReview data={review} years={base.years} onYear={setReviewYear} />}
        <MonthInReview shows={state.shows} movies={state.movies} />
        <MonthVsLastYear shows={state.shows} movies={state.movies} />
      </div>
    </div>
  );

  // --------------------------------------------------------------- Habits
  const longestLabel = base.longestRange
    ? `Longest · ${streakRangeLabel(base.longestRange.from, base.longestRange.to)}`
    : 'Longest streak';
  const busiestLabel = habits.busiest ? `Most in a day · ${fmtDay(habits.busiest.date).toUpperCase()}` : 'Most in a day';
  const habitsTab = base.hasHabits ? (
    <div className="sd-habits">
      <div className="sd-tiles a-streak">
        <StatTile size="lg" accent statKey="streak-current" value={base.currentStreak} unit={plural(base.currentStreak, ' day', ' days')} label="Current streak" />
        <StatTile size="lg" statKey="streak-longest" value={base.longestStreak} unit={plural(base.longestStreak, ' day', ' days')} label={longestLabel} />
      </div>

      <Heatmap countsByDay={base.dailyCounts} years={base.years} today={today} />

      <Section
        title="By day of week"
        className="a-dow"
        right={<YearSelect id="habit-year" label="Year" value={year} onChange={setYear} options={yearOptions} />}
      >
        <BarList rows={habits.dowRows} ariaLabel={`Watches by day of week, ${scopeLabel}`} />
        {habits.batchMinutes > 0 && (
          <Note>
            {habits.batchMinutes} bulk-marked {plural(habits.batchMinutes, 'batch', 'batches')} (
            {habits.batchWatches.toLocaleString()} watches) {habits.batchMinutes === 1 ? 'is' : 'are'} smoothed out so a
            backlog import doesn’t skew the pattern.
          </Note>
        )}
      </Section>

      <div className="a-tiles">
        <div className="sd-tiles">
          <StatTile statKey="busiest" value={(habits.busiest ? habits.busiest.count : 0).toLocaleString()} label={busiestLabel} />
          <StatTile statKey="active-days" value={habits.activeDays.toLocaleString()} label="Days with a watch" />
        </div>
        <Note>
          Most in a day counts separately-timed watches only ({scopeLabel}).
          {habits.bulkOnlyDays > 0 && ` ${habits.bulkOnlyDays.toLocaleString()} ${plural(habits.bulkOnlyDays, 'day')} with only bulk-marked watches ${habits.bulkOnlyDays === 1 ? 'is' : 'are'} not counted as ${habits.bulkOnlyDays === 1 ? 'a day' : 'days'} you watched, and ${habits.bulkOnlyDays === 1 ? 'is' : 'are'} left out of streaks and the heatmap.`}
        </Note>
      </div>

      <BingeList rows={bingeRows} scope={scopeLabel} />
    </div>
  ) : (
    <div className="sd-card sd-pad sd-empty">No dated watches yet — your viewing habits will appear here once you have some.</div>
  );

  // ------------------------------------------------------------- Rankings
  const hasRated = base.topRatedShows.length > 0 || base.topRatedMovies.length > 0;
  const hasRewatches = base.rewatchShows.rows.length > 0 || base.rewatchMovies.rows.length > 0;
  const hasLoved = base.lovedShows.rows.length > 0;
  const RatedCard = ({ rows, label }) => (
    <div className="sd-card" role="group" aria-label={label}>
      {rows.map((r, i) => (
        <div className={'sd-rated' + (i > 0 ? ' sd-sep' : '')} key={r.name}>
          <span className="sd-rated-name" title={r.name}>{r.name}</span>
          <Stars value={r.rating} size={15} readOnly />
        </div>
      ))}
    </div>
  );
  const rankings =
    hasRated || hasRewatches || hasLoved || base.topShows.length > 0 ? (
      <div className="sd-cols-even">
        <div className="sd-stack">
          {base.topRatedShows.length > 0 && (
            <Section title="Recently rated · Shows"><RatedCard rows={base.topRatedShows} label="Recently rated shows" /></Section>
          )}
          {base.topRatedMovies.length > 0 && (
            <Section title="Recently rated · Movies"><RatedCard rows={base.topRatedMovies} label="Recently rated movies" /></Section>
          )}
          {hasLoved && (
            <Section title="Most loved shows">
              <div className="sd-card" role="group" aria-label="Most loved shows">
                {base.lovedShows.rows.map((r, i) => (
                  <div className={'sd-rated' + (i > 0 ? ' sd-sep' : '')} key={r.label}>
                    <span className="sd-rated-name" title={r.label}>{r.label}</span>
                    <span
                      className="sd-loved sd-mono"
                      role="img"
                      aria-label={[r.love > 0 && `${r.love} loved it`, r.funny > 0 && `${r.funny} funny`].filter(Boolean).join(', ')}
                    >
                      {r.love > 0 ? <span>😍 {r.love}</span> : null}
                      {r.funny > 0 ? <span>😂 {r.funny}</span> : null}
                    </span>
                  </div>
                ))}
              </div>
              <Note>Ranked by episode reactions: each 😍 counts {LOVE_WEIGHT}, each 😂 counts {FUNNY_WEIGHT}.</Note>
            </Section>
          )}
        </div>
        <div className="sd-stack">
          {base.topShows.length > 0 && (
            <Section title="Most watched shows">
              <BarList rows={base.topShows} unit=" eps" ariaLabel="Most watched shows" />
            </Section>
          )}
          {base.rewatchShows.rows.length > 0 && (
            <Section title="Most rewatched shows">
              <BarList rows={base.rewatchShows.rows} unit="×" ariaLabel="Most rewatched shows" />
              <Note>{rewatchSummary(base.rewatchShows.total, base.rewatchShows.titles, 'show')} Each × is a viewing after the first.</Note>
            </Section>
          )}
          {base.rewatchMovies.rows.length > 0 && (
            <Section title="Most rewatched movies">
              <BarList rows={base.rewatchMovies.rows} unit="×" ariaLabel="Most rewatched movies" />
              <Note>{rewatchSummary(base.rewatchMovies.total, base.rewatchMovies.titles, 'movie')} Each × is a viewing after the first.</Note>
            </Section>
          )}
        </div>
      </div>
    ) : (
      <div className="sd-card sd-pad sd-empty">Rate a show or movie, or watch something, and your rankings will appear here.</div>
    );

  // ------------------------------------------------------------ Breakdown
  const completion = base.completion.map((r) => ({
    ...r,
    color: r.label === 'Finished' ? 'var(--teal)' : r.label === 'Watching' ? 'var(--amber)' : '#4a5365',
  }));
  const breakdown = (
    <div className="sd-cols-even">
      <div className="sd-stack">
        {base.yearBars.length > 0 && (
          <Section title="Episodes per year"><BarList rows={base.yearBars} ariaLabel="Episodes per year" /></Section>
        )}
        {base.movieYears.length > 0 && (
          <Section title="Movies per year"><BarList rows={base.movieYears} ariaLabel="Movies per year" /></Section>
        )}
        <Section title="Library completion">
          <BarList rows={completion} highlightTop={false} ariaLabel="Library completion" />
        </Section>
      </div>
      <div className="sd-stack">
        <YourTaste state={state} />
        {(base.platformRows.length > 0 || base.untaggedTitles > 0) && (
          <Section title="Where you watch">
            {base.platformRows.length > 0 ? (
              <>
                <BarList rows={base.platformRows} unit=" hrs" highlightTop={false} ariaLabel="Hours by platform" />
                {base.untaggedHours > 0 && (
                  <Note>
                    {base.untaggedHours.toLocaleString()} hrs across {base.untaggedTitles}{' '}
                    {plural(base.untaggedTitles, 'title')} have no platform set — run “Detect platforms” on the
                    Shows tab to fill them in.
                  </Note>
                )}
              </>
            ) : (
              <div className="sd-card sd-pad sd-empty">
                No platforms tagged yet. Run “Detect platforms” on the Shows tab (or set one on a show’s page),
                and your viewing-by-platform breakdown will appear here.
              </div>
            )}
          </Section>
        )}
        <Section title="Genres">
          {base.genres.length > 0 ? (
            <>
              <BarList rows={base.genres} unit=" eps" ariaLabel="Episodes by genre" />
              {base.genreDataMissing > 0 && (
                <Note>
                  {base.genreDataMissing} {plural(base.genreDataMissing, 'show')} {base.genreDataMissing === 1 ? 'has' : 'have'} no
                  genre data yet — run “Refresh all from TMDB” on the Shows tab to fill them in.
                </Note>
              )}
            </>
          ) : (
            <div className="sd-card sd-pad sd-empty">
              No genre data yet. Run “Refresh all from TMDB” on the Shows tab once, and genres will appear here.
            </div>
          )}
        </Section>
        {trends && <GenreTrends data={trends} />}
      </div>
    </div>
  );

  // Badges and World only mount while their tab is open (they look titles up on TMDB).
  const panels = {
    Overview: overview,
    Habits: habitsTab,
    Rankings: rankings,
    Breakdown: breakdown,
    Badges: tab === 'Badges' ? <AchievementsView state={state} /> : null,
    World: tab === 'World' ? <WorldView state={state} /> : null,
  };

  return (
    <div className="sd-page">
      <div className="sd-stats-head">
        <div className="sd-stats-titlerow">
          <h1 className="sd-title">Stats</h1>
          <span className="sd-stats-btns">
            {onOpenCompare ? (
              <button type="button" className="sd-notesbtn" onClick={onOpenCompare} aria-label="Compare with a friend" data-testid="open-compare">
                Friends
                <Chevron />
              </button>
            ) : null}
            {onOpenNotes ? (
              <button type="button" className="sd-notesbtn" onClick={onOpenNotes} aria-label={`Your notes, ${noteCount} entries`}>
                Notes{noteCount > 0 ? <span className="n">{noteCount.toLocaleString()}</span> : null}
                <Chevron />
              </button>
            ) : null}
          </span>
        </div>
        <TabBar tabs={TABS} value={tab} onChange={setTab} label="Stats sections" />
        <SyncingNote />
      </div>
      <div className="sd-stats-body" role="tabpanel" id="stats-panel" aria-labelledby={`stats-tab-${tab}`}>
        {panels[tab]}
      </div>
    </div>
  );
}
