import React, { useState } from 'react';
import { useStore } from '../store/useStore.js';
import { addShowToWatchlist, addMovieToWatchlist } from '../store/db.js';
import {
  img,
  hasKey,
  showDetails,
  movieDetails,
  tvRecommendations,
  movieRecommendations,
  tvSimilar,
  movieSimilar,
} from '../api/tmdb.js';
import { Empty } from './LibraryUI.jsx';

const MAX_SEEDS = 6; // per type, highest-rated first
const MAX_RESULTS = 18;

// Pick seed titles to build recommendations from: your highest-rated shows
// and movies, most recently rated first as the tiebreak so Discover shifts
// as you rate new things rather than freezing on old 5-star picks.
function pickSeeds(state) {
  const shows = Object.values(state.shows)
    .filter((s) => s.rating > 0 && s.tmdbId)
    .sort((a, b) => b.rating - a.rating || (b.ratedAt || '').localeCompare(a.ratedAt || ''))
    .slice(0, MAX_SEEDS);
  const movies = state.movies
    .filter((m) => m.rating > 0 && m.tmdbId)
    .sort((a, b) => b.rating - a.rating || (b.ratedAt || '').localeCompare(a.ratedAt || ''))
    .slice(0, MAX_SEEDS);
  return { shows, movies };
}

// Everything already in the library (any status) — recommendations should
// never suggest something you're already tracking.
function ownedSets(state) {
  const shows = new Set(Object.values(state.shows).map((s) => s.tmdbId).filter(Boolean));
  const movies = new Set(state.movies.map((m) => m.tmdbId).filter(Boolean));
  return { shows, movies };
}

async function fetchFor(kind, seed, page) {
  const rec = kind === 'show' ? tvRecommendations : movieRecommendations;
  const sim = kind === 'show' ? tvSimilar : movieSimilar;
  let data;
  try {
    data = await rec(seed.tmdbId, page);
  } catch (e) {
    return [];
  }
  let results = data.results || [];
  if (results.length < 5) {
    try {
      const simData = await sim(seed.tmdbId, page);
      results = results.concat(simData.results || []);
    } catch (e) {
      /* similar-titles fallback is best-effort */
    }
  }
  return results.map((r) => ({ raw: r, seed }));
}

export default function Discover() {
  const state = useStore();
  const [items, setItems] = useState(null); // null = not generated yet
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [adding, setAdding] = useState(null); // id currently being added
  const [added, setAdded] = useState({}); // id -> true, once queued

  const { shows: showSeeds, movies: movieSeeds } = pickSeeds(state);
  const noSeeds = showSeeds.length === 0 && movieSeeds.length === 0;

  async function generate() {
    setLoading(true);
    setError(null);
    try {
      const owned = ownedSets(state);
      const page = 1 + Math.floor(Math.random() * 2); // light variety on refresh

      const batches = await Promise.all([
        ...showSeeds.map((s) => fetchFor('show', s, page)),
        ...movieSeeds.map((s) => fetchFor('movie', s, page)),
      ]);

      const byId = new Map();
      showSeeds.forEach((s, i) => applyBatch(byId, batches[i], 'show', owned.shows));
      movieSeeds.forEach((s, i) =>
        applyBatch(byId, batches[showSeeds.length + i], 'movie', owned.movies)
      );

      const ranked = [...byId.values()]
        .sort((a, b) => b.score - a.score || b.voteAvg - a.voteAvg)
        .slice(0, MAX_RESULTS);

      setItems(ranked);
    } catch (e) {
      console.error('Discover generation failed', e);
      setError('Could not load recommendations from TMDB. Try again in a moment.');
    } finally {
      setLoading(false);
    }
  }

  function applyBatch(byId, batch, type, ownedSet) {
    for (const { raw, seed } of batch) {
      if (!raw.id || !raw.poster_path) continue; // skip posterless junk results
      if (ownedSet.has(raw.id)) continue; // already in your library
      const key = `${type}:${raw.id}`;
      const name = type === 'show' ? raw.name : raw.title;
      const date = type === 'show' ? raw.first_air_date : raw.release_date;
      if (!name) continue;
      const existing = byId.get(key);
      if (existing) {
        existing.score += seed.rating;
        if (!existing.because.includes(seed.name)) existing.because.push(seed.name);
      } else {
        byId.set(key, {
          key,
          type,
          id: raw.id,
          name,
          year: (date || '').slice(0, 4),
          poster: raw.poster_path,
          voteAvg: raw.vote_average || 0,
          score: seed.rating,
          because: [seed.name],
        });
      }
    }
  }

  async function addItem(it) {
    setAdding(it.key);
    try {
      if (it.type === 'show') {
        const details = await showDetails(it.id);
        addShowToWatchlist(details);
      } else {
        const details = await movieDetails(it.id);
        addMovieToWatchlist(details);
      }
      setAdded((a) => ({ ...a, [it.key]: true }));
    } catch (e) {
      console.error('Add to watchlist failed', e);
      alert(`Could not add "${it.name}" — try again.`);
    } finally {
      setAdding(null);
    }
  }

  function dismiss(key) {
    setItems((list) => list.filter((it) => it.key !== key));
  }

  if (!hasKey()) {
    return <Empty>Add a TMDB API key in Settings to get recommendations.</Empty>;
  }

  if (noSeeds) {
    return (
      <Empty>
        Rate a few shows or movies you enjoyed (on their detail page, or on the Movies tab), and
        Discover will use them to find what to watch next.
      </Empty>
    );
  }

  return (
    <div className="sd-gap10">
      {items === null ? (
        <div className="sd-card sd-pad sd-discover-intro">
          <strong>Find something new</strong>
          <p className="sd-sub">
            Built from your top-rated shows and movies — nothing already in your library will show up here.
          </p>
          <button className="sd-btn primary" onClick={generate} disabled={loading}>
            {loading ? 'Finding picks…' : 'Show me picks'}
          </button>
        </div>
      ) : (
        <>
          <div className="sd-sec2-head has-ctl">
            <span className="sd-sub">Based on {[...showSeeds, ...movieSeeds].length} of your top-rated titles.</span>
            <button className="sd-btn sm" onClick={generate} disabled={loading}>
              {loading ? 'Refreshing…' : 'Refresh picks'}
            </button>
          </div>

          {error && <p className="sd-sub">{error}</p>}

          {items.length === 0 && !loading && !error && (
            <Empty>
              No new recommendations turned up — you may already have most of what TMDB suggests for
              your top-rated titles. Try refreshing.
            </Empty>
          )}

          <div className="sd-pgrid">
            {items.map((it) => (
              <div className="sd-pick" key={it.key}>
                <span className="sd-tilebtn-art">
                  <button className="sd-pick-x" onClick={() => dismiss(it.key)} title="Not interested" aria-label={`Dismiss ${it.name}`}>
                    ×
                  </button>
                  {it.poster ? (
                    <img src={img(it.poster, 'w342')} alt="" loading="lazy" />
                  ) : (
                    <span className="sd-poster-ph sd-tilebtn-ph">{it.name}</span>
                  )}
                </span>
                <span className="sd-tilebtn-name" title={it.name}>{it.name}</span>
                <span className="sd-tilebtn-meta">
                  {it.year || ''}{it.year ? ' · ' : ''}{it.type === 'show' ? 'Show' : 'Movie'}
                </span>
                <span className="sd-pick-why" title={`Because you rated ${it.because.join(', ')}`}>
                  Because you liked {it.because[0]}
                </span>
                <button
                  className="sd-btn sm block"
                  onClick={() => addItem(it)}
                  disabled={adding === it.key || added[it.key]}
                >
                  {added[it.key] ? 'Added ✓' : adding === it.key ? 'Adding…' : '+ Watchlist'}
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
