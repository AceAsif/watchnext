import React, { useMemo } from 'react';
import { useStore } from '../store/useStore.js';
import { movieStatus } from '../store/db.js';
import Stars from '../components/Stars.jsx';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

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

  const s = useMemo(() => {
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
    const perDate = {}; // "YYYY-MM-DD" -> number of watch events that day
    const dowCount = [0, 0, 0, 0, 0, 0, 0]; // Sun..Sat

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
          perDate[day] = (perDate[day] || 0) + 1;
          dowCount[weekdayOf(day)]++;
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
        perDate[day] = (perDate[day] || 0) + 1;
        dowCount[weekdayOf(day)]++;
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

    // --- habits: streaks, busiest day, day-of-week ---
    const dayKeys = Object.keys(perDate).sort(); // ISO dates sort chronologically
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

    let busiest = null;
    for (const [d, c] of Object.entries(perDate)) {
      if (!busiest || c > busiest.count) busiest = { date: d, count: c };
    }

    // Display Mon-first; DOW/dowCount are indexed Sun..Sat.
    const dowRows = [1, 2, 3, 4, 5, 6, 0].map((i) => ({ label: DOW[i], value: dowCount[i] }));
    const years = Object.entries(perYear)
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
      years,
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
      busiest,
      dowRows,
      activeDays: dayKeys.length,
      completion: [
        { label: 'Finished', value: finished },
        { label: 'Watching', value: inProgress },
        { label: 'Not started', value: notStarted },
      ],
    };
  }, [state.shows, state.movies]);

  if (s.episodes === 0 && s.movieCount === 0) {
    return (
      <div className="notice">
        No watch history yet. Import your TV Time data in Settings, or start
        marking episodes watched.
      </div>
    );
  }

  return (
    <div>
      <h2 className="section">All time</h2>
      <div className="stat-cards">
        <div className="stat-card">
          <div className="big">{s.episodes.toLocaleString()}</div>
          <div className="label">Episodes watched</div>
        </div>
        <div className="stat-card">
          <div className="big">{s.hours.toLocaleString()}</div>
          <div className="label">Hours of TV</div>
        </div>
        <div className="stat-card">
          <div className="big">{s.days}</div>
          <div className="label">Days of TV</div>
        </div>
        <div className="stat-card">
          <div className="big">{s.showCount}</div>
          <div className="label">Shows started</div>
        </div>
        <div className="stat-card">
          <div className="big">{s.movieCount}</div>
          <div className="label">Movies watched</div>
        </div>
        <div className="stat-card">
          <div className="big">{s.movieHours.toLocaleString()}</div>
          <div className="label">Movie hours</div>
        </div>
      </div>

      {(s.watchlistShows > 0 || s.watchlistMovies > 0) && (
        <p className="muted" style={{ fontSize: 13, marginTop: -6 }}>
          On your watchlist: {s.watchlistShows} show{s.watchlistShows === 1 ? '' : 's'},{' '}
          {s.watchlistMovies} movie{s.watchlistMovies === 1 ? '' : 's'}.
        </p>
      )}

      {s.activeDays > 0 && (
        <>
          <h2 className="section">Habits</h2>
          <div className="stat-cards">
            <div className="stat-card">
              <div className="big">{s.currentStreak}</div>
              <div className="label">Current streak (days)</div>
            </div>
            <div className="stat-card">
              <div className="big">{s.longestStreak}</div>
              <div className="label">Longest streak (days)</div>
            </div>
            <div className="stat-card">
              <div className="big">{s.busiest ? s.busiest.count : 0}</div>
              <div className="label">Most in one day</div>
            </div>
            <div className="stat-card">
              <div className="big">{s.activeDays.toLocaleString()}</div>
              <div className="label">Days with a watch</div>
            </div>
          </div>
          {(s.busiest || s.longestRange) && (
            <p className="muted" style={{ fontSize: 13, marginTop: -6 }}>
              {s.busiest
                ? `Busiest day: ${s.busiest.count} watched on ${fmtDay(s.busiest.date)}. `
                : ''}
              {s.longestRange
                ? `Longest streak ran ${fmtDay(s.longestRange.from)} – ${fmtDay(
                    s.longestRange.to
                  )}.`
                : ''}
            </p>
          )}
          <h3 className="subsection">By day of week</h3>
          <Bars rows={s.dowRows} />
          {s.busiest && s.busiest.count > 50 && (
            <p className="muted" style={{ fontSize: 12.5, marginTop: 6 }}>
              Heads up: a very high "most in one day" is almost always a batch of
              history that was imported or bulk-marked on a single date, not a
              real one-day binge — the same skew affects the day-of-week totals.
            </p>
          )}
        </>
      )}

      {(s.topRatedShows.length > 0 || s.topRatedMovies.length > 0) && (
        <>
          <h2 className="section">Top rated</h2>
          {s.topRatedShows.length > 0 && (
            <>
              <h3 className="subsection">Shows</h3>
              <RatedList rows={s.topRatedShows} />
            </>
          )}
          {s.topRatedMovies.length > 0 && (
            <>
              <h3 className="subsection">Movies</h3>
              <RatedList rows={s.topRatedMovies} />
            </>
          )}
        </>
      )}

      {s.topShows.length > 0 && (
        <>
          <h2 className="section">Most watched shows</h2>
          <Bars rows={s.topShows} />
        </>
      )}

      {s.years.length > 0 && (
        <>
          <h2 className="section">Episodes per year</h2>
          <Bars rows={s.years} />
        </>
      )}

      {s.movieYears.length > 0 && (
        <>
          <h2 className="section">Movies per year</h2>
          <Bars rows={s.movieYears} />
        </>
      )}

      <h2 className="section">Library completion</h2>
      <Bars rows={s.completion} />

      <h2 className="section">Genres</h2>
      {s.genres.length > 0 ? (
        <>
          <Bars rows={s.genres} unit=" eps" />
          {s.genreDataMissing > 0 && (
            <p className="muted" style={{ fontSize: 13 }}>
              {s.genreDataMissing} shows have no genre data yet — run "Refresh
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
