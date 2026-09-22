import React, { useMemo, useState } from 'react';
import { useStore } from '../store/useStore.js';
import { movieStatus } from '../store/db.js';
import Stars from '../components/Stars.jsx';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// A "minute" holding this many watches or more is treated as one bulk/import
// batch (marking a backlog on a single date), not real viewing. Real binges
// carry their own per-episode timestamps and stay untouched. See the Habits
// de-skew below. Chosen from the data: real days top out around a few watches
// per minute, while import batches pack hundreds into one timestamp.
const BATCH_MIN = 15;

function fmtDay(ds) {
  if (!ds) return '';
  const [y, m, d] = ds.split('-').map(Number);
  if (!y || !m || !d) return ds;
  return `${d} ${MONTHS[m - 1]} ${y}`;
}
function weekdayOf(ds) {
  const [y, m, d] = ds.split('-').map(Number);
  return new Date(y, m - 1, d).getDay();
}
// whole-day number, for consecutive-day math (UTC-based so no DST drift)
function dayNum(ds) {
  const [y, m, d] = ds.split('-').map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86400000);
}

// De-skewed timing stats for a scope (all years or one year).
// - By day of week: each bulk batch (a minute with >= BATCH_MIN watches)
//   contributes ONE event instead of its full size, so a 1,000-watch backlog
//   dump doesn't bury the real weekly rhythm.
// - Most in one day: the busiest day measured by DISTINCT timestamps, i.e. the
//   biggest genuine sitting — 200 episodes stamped the same second count as 1.
function computeHabits(events, year) {
  const evs = year === 'all' ? events : events.filter((e) => e.year === year);

  const minuteCount = {};
  for (const e of evs) minuteCount[e.minute] = (minuteCount[e.minute] || 0) + 1;

  const dow = [0, 0, 0, 0, 0, 0, 0]; // Sun..Sat
  const distinctTsPerDay = {}; // day -> Set of timestamps
  const days = new Set();
  const seenBatchMinute = new Set();
  let batchMinutes = 0; // how many batches we collapsed
  let batchWatches = 0; // how many raw watches those batches represented

  for (const e of evs) {
    days.add(e.day);
    (distinctTsPerDay[e.day] || (distinctTsPerDay[e.day] = new Set())).add(e.ts);

    if (minuteCount[e.minute] >= BATCH_MIN) {
      batchWatches++;
      if (!seenBatchMinute.has(e.minute)) {
        seenBatchMinute.add(e.minute);
        batchMinutes++;
        dow[e.wd] += 1; // whole batch = a single event
      }
    } else {
      dow[e.wd] += 1;
    }
  }

  let busiest = null;
  for (const [d, set] of Object.entries(distinctTsPerDay)) {
    if (!busiest || set.size > busiest.count) busiest = { date: d, count: set.size };
  }

  // Display Mon-first; DOW/dow are indexed Sun..Sat.
  const dowRows = [1, 2, 3, 4, 5, 6, 0].map((i) => ({ label: DOW[i], value: dow[i] }));

  return { dowRows, busiest, activeDays: days.size, batchMinutes, batchWatches };
}

function RatedList({ rows }) {
  return (
    <div className="rated-list">
      {rows.map((r) => (
        <div className="rated-row" key={r.name}>
          <span className="rated-name" title={r.name}>{r.name}</span>
          <Stars value={r.rating} size={15} readOnly />
        </div>
      ))}
    </div>
  );
}

function Bars({ rows, unit }) {
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <div>
      {rows.map((r) => (
        <div className="bar-row" key={r.label}>
          <div className="bar-label" title={r.label}>{r.label}</div>
          <div className="bar-track">
            <div className="bar-fill" style={{ width: (r.value / max) * 100 + '%' }} />
          </div>
          <div className="bar-val">
            {r.value.toLocaleString()}{unit || ''}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function Stats() {
  const state = useStore();
  const [year, setYear] = useState('all');

  const base = useMemo(() => {
    let episodes = 0;
    let minutes = 0;
    const perShow = [];
    const perYear = {};
    const moviesPerYear = {};
    const perGenre = {};
    let finished = 0;
    let inProgress = 0;
    let notStarted = 0;
    let genreDataMissing = 0;
    const ratedShows = [];
    const events = []; // one per dated watch: { year, day, wd, minute, ts }

    for (const show of Object.values(state.shows)) {
      const entries = Object.values(show.watched || {});
      if (show.rating) ratedShows.push({ name: show.name, rating: show.rating });
      let count = 0;
      for (const w of entries) {
        const n = w.n || 1;
        count += n;
        episodes += n;
        minutes += (w.min || 40) * n;
        if (w.at) {
          const y = w.at.slice(0, 4);
          perYear[y] = (perYear[y] || 0) + n;
          const day = w.at.slice(0, 10);
          events.push({ year: y, day, wd: weekdayOf(day), minute: w.at.slice(0, 16), ts: w.at });
        }
      }
      if (entries.length) perShow.push({ label: show.name, value: count });

      // Completion buckets (followed shows only, so the numbers match Library)
      if (show.followed) {
        const seen = entries.length;
        const total = show.totalEpisodes;
        if (total && seen >= total) finished++;
        else if (seen > 0) inProgress++;
        else notStarted++;
      }

      // Genre tally, weighted by episodes watched of that show
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
      if (m.rating) ratedMovies.push({ name: m.name, rating: m.rating });
      movieMinutes += m.runtimeMin || 110;
      if (m.watchedAt) {
        const y = m.watchedAt.slice(0, 4);
        moviesPerYear[y] = (moviesPerYear[y] || 0) + 1;
        const day = m.watchedAt.slice(0, 10);
        events.push({ year: y, day, wd: weekdayOf(day), minute: m.watchedAt.slice(0, 16), ts: m.watchedAt });
      }
    }

    const watchlistShows = Object.values(state.shows).filter(
      (sh) => sh.watchlist && !sh.followed
    ).length;
    const watchlistMovies = state.movies.filter(
      (m) => movieStatus(m) === 'planned'
    ).length;

    perShow.sort((a, b) => b.value - a.value);
    const byRating = (a, b) => b.rating - a.rating || a.name.localeCompare(b.name);
    ratedShows.sort(byRating);
    ratedMovies.sort(byRating);

    // --- streaks (all-time; unaffected by the batch skew since they're day-based) ---
    const dayKeys = [...new Set(events.map((e) => e.day))].sort(); // ISO dates sort chronologically
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
    const todayNum = dayNum(new Date().toISOString().slice(0, 10));
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
    const yearList = Object.entries(perYear)
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
      showCount: perShow.length,
      movieCount: watchedMovieCount,
      movieHours: Math.round(movieMinutes / 60),
      topShows: perShow.slice(0, 12),
      years,          // list of year strings for the selector (newest first)
      yearBars: yearList,
      movieYears,
      genres,
      genreDataMissing,
      watchlistShows,
      watchlistMovies,
      topRatedShows: ratedShows.slice(0, 10),
      topRatedMovies: ratedMovies.slice(0, 10),
      currentStreak: current,
      longestStreak: longest,
      longestRange,
      events,
      hasHabits: events.length > 0,
      completion: [
        { label: 'Finished', value: finished },
        { label: 'Watching', value: inProgress },
        { label: 'Not started', value: notStarted },
      ],
    };
  }, [state.shows, state.movies]);

  const habits = useMemo(() => computeHabits(base.events, year), [base.events, year]);

  if (base.episodes === 0 && base.movieCount === 0) {
    return (
      <div className="notice">
        No watch history yet. Import your TV Time data in Settings, or start
        marking episodes watched.
      </div>
    );
  }

  const scopeLabel = year === 'all' ? 'all years' : year;

  return (
    <div>
      <h2 className="section">All time</h2>
      <div className="stat-cards">
        <div className="stat-card">
          <div className="big">{base.episodes.toLocaleString()}</div>
          <div className="label">Episodes watched</div>
        </div>
        <div className="stat-card">
          <div className="big">{base.hours.toLocaleString()}</div>
          <div className="label">Hours of TV</div>
        </div>
        <div className="stat-card">
          <div className="big">{base.days}</div>
          <div className="label">Days of TV</div>
        </div>
        <div className="stat-card">
          <div className="big">{base.showCount}</div>
          <div className="label">Shows started</div>
        </div>
        <div className="stat-card">
          <div className="big">{base.movieCount}</div>
          <div className="label">Movies watched</div>
        </div>
        <div className="stat-card">
          <div className="big">{base.movieHours.toLocaleString()}</div>
          <div className="label">Movie hours</div>
        </div>
      </div>

      {(base.watchlistShows > 0 || base.watchlistMovies > 0) && (
        <p className="muted" style={{ fontSize: 13, marginTop: -6 }}>
          On your watchlist: {base.watchlistShows} show{base.watchlistShows === 1 ? '' : 's'},{' '}
          {base.watchlistMovies} movie{base.watchlistMovies === 1 ? '' : 's'}.
        </p>
      )}

      {base.hasHabits && (
        <>
          <h2 className="section">Habits</h2>
          <div className="stat-cards">
            <div className="stat-card">
              <div className="big">{base.currentStreak}</div>
              <div className="label">Current streak (days)</div>
            </div>
            <div className="stat-card">
              <div className="big">{base.longestStreak}</div>
              <div className="label">Longest streak (days)</div>
            </div>
          </div>
          {base.longestRange && (
            <p className="muted" style={{ fontSize: 13, marginTop: -6 }}>
              Longest streak ran {fmtDay(base.longestRange.from)} – {fmtDay(base.longestRange.to)}.
            </p>
          )}

          <div className="lib-controls" style={{ marginTop: 18 }}>
            <h3 className="subsection" style={{ margin: 0 }}>Viewing pattern</h3>
            <div className="sort-field">
              <label htmlFor="habit-year" className="muted" style={{ fontSize: 13 }}>Year</label>
              <select
                id="habit-year"
                className="select"
                value={year}
                onChange={(e) => setYear(e.target.value)}
              >
                <option value="all">All years</option>
                {base.years.map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="stat-cards">
            <div className="stat-card">
              <div className="big">{habits.busiest ? habits.busiest.count : 0}</div>
              <div className="label">Most in one day</div>
            </div>
            <div className="stat-card">
              <div className="big">{habits.activeDays.toLocaleString()}</div>
              <div className="label">Days with a watch</div>
            </div>
          </div>
          {habits.busiest && (
            <p className="muted" style={{ fontSize: 13, marginTop: -6 }}>
              Busiest day: {habits.busiest.count} watched on {fmtDay(habits.busiest.date)}{' '}
              (counting only separately-timed watches, {scopeLabel}).
            </p>
          )}

          <h3 className="subsection">By day of week</h3>
          <Bars rows={habits.dowRows} />
          {habits.batchMinutes > 0 && (
            <p className="muted" style={{ fontSize: 12.5, marginTop: 6 }}>
              Smoothed {habits.batchMinutes} bulk-marked batch{habits.batchMinutes === 1 ? '' : 'es'}{' '}
              ({habits.batchWatches.toLocaleString()} watches marked together on a single date) out of
              this view, so a one-off backlog import doesn't drown out your real day-to-day pattern.
            </p>
          )}
        </>
      )}

      {(base.topRatedShows.length > 0 || base.topRatedMovies.length > 0) && (
        <>
          <h2 className="section">Top rated</h2>
          {base.topRatedShows.length > 0 && (
            <>
              <h3 className="subsection">Shows</h3>
              <RatedList rows={base.topRatedShows} />
            </>
          )}
          {base.topRatedMovies.length > 0 && (
            <>
              <h3 className="subsection">Movies</h3>
              <RatedList rows={base.topRatedMovies} />
            </>
          )}
        </>
      )}

      {base.topShows.length > 0 && (
        <>
          <h2 className="section">Most watched shows</h2>
          <Bars rows={base.topShows} />
        </>
      )}

      {base.yearBars.length > 0 && (
        <>
          <h2 className="section">Episodes per year</h2>
          <Bars rows={base.yearBars} />
        </>
      )}

      {base.movieYears.length > 0 && (
        <>
          <h2 className="section">Movies per year</h2>
          <Bars rows={base.movieYears} />
        </>
      )}

      <h2 className="section">Library completion</h2>
      <Bars rows={base.completion} />

      <h2 className="section">Genres</h2>
      {base.genres.length > 0 ? (
        <>
          <Bars rows={base.genres} unit=" eps" />
          {base.genreDataMissing > 0 && (
            <p className="muted" style={{ fontSize: 13 }}>
              {base.genreDataMissing} shows have no genre data yet — run "Refresh
              all from TMDB" on the Shows tab to fill them in.
            </p>
          )}
        </>
      ) : (
        <p className="muted" style={{ fontSize: 13.5 }}>
          No genre data yet. Run "Refresh all from TMDB" on the Shows tab
          once, and genres will appear here.
        </p>
      )}
    </div>
  );
}
