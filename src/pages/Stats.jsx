import React, { useMemo } from 'react';
import { useStore } from '../store/useStore.js';

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

    for (const show of Object.values(state.shows)) {
      const entries = Object.values(show.watched || {});
      let count = 0;
      for (const w of entries) {
        const n = w.n || 1;
        count += n;
        episodes += n;
        minutes += (w.min || 40) * n;
        if (w.at) {
          const y = w.at.slice(0, 4);
          perYear[y] = (perYear[y] || 0) + n;
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
    for (const m of state.movies) {
      movieMinutes += m.runtimeMin || 110;
      if (m.watchedAt) {
        const y = m.watchedAt.slice(0, 4);
        moviesPerYear[y] = (moviesPerYear[y] || 0) + 1;
      }
    }

    perShow.sort((a, b) => b.value - a.value);
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
      movieCount: state.movies.length,
      movieHours: Math.round(movieMinutes / 60),
      topShows: perShow.slice(0, 12),
      years,
      movieYears,
      genres,
      genreDataMissing,
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
