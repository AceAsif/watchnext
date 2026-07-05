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

    for (const show of Object.values(state.shows)) {
      const entries = Object.values(show.watched || {});
      if (!entries.length) continue;
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
      perShow.push({ label: show.name, value: count });
    }

    let movieMinutes = 0;
    for (const m of state.movies) movieMinutes += m.runtimeMin || 110;

    perShow.sort((a, b) => b.value - a.value);
    const years = Object.entries(perYear)
      .sort((a, b) => a[0].localeCompare(b[0]))
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
    </div>
  );
}
