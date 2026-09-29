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
    return (
      <p className="muted" style={{ fontSize: 13.5, marginTop: 10 }}>
        Add a TMDB API key in Settings to get recommendations.
      </p>
    );
  }

  if (noSeeds) {
    return (
      <p className="muted" style={{ fontSize: 13.5, marginTop: 10 }}>
        Rate a few shows or movies you enjoyed (on their detail page, or on the
        Movies tab), and Discover will use them to find what to watch next.
      </p>
    );
  }

  return (
    <div style={{ marginTop: 8 }}>
      {items === null ? (
        <div className="notice accent">
          <strong>Find something new.</strong>
          <br />
          Built from your top-rated shows and movies — nothing already in your
          library will show up here.
          <div style={{ marginTop: 10 }}>
            <button className="btn primary" onClick={generate} disabled={loading}>
              {loading ? 'Finding picks…' : 'Show me picks'}
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="row" style={{ marginBottom: 12 }}>
            <p className="muted" style={{ fontSize: 13, margin: 0 }}>
              Based on {[...showSeeds, ...movieSeeds].length} of your top-rated titles.
            </p>
            <div className="spacer" />
            <button className="btn" onClick={generate} disabled={loading}>
              {loading ? 'Refreshing…' : 'Refresh picks'}
            </button>
          </div>

          {error && <p className="muted" style={{ fontSize: 13 }}>{error}</p>}

          {items.length === 0 && !loading && !error && (
            <p className="muted" style={{ fontSize: 13.5 }}>
              No new recommendations turned up — you may already have most of
              what TMDB suggests for your top-rated titles. Try refreshing.
            </p>
          )}

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
              gap: 14,
            }}
          >
            {items.map((it) => (
              <div
                key={it.key}
                style={{
                  background: 'var(--bg-card)',
                  border: '1px solid var(--line)',
                  borderRadius: 'var(--radius)',
                  overflow: 'hidden',
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                <div style={{ position: 'relative' }}>
                  <button
                    onClick={() => dismiss(it.key)}
                    title="Not interested"
                    aria-label="Dismiss"
                    style={{
                      position: 'absolute', top: 6, right: 6, zIndex: 1,
                      width: 24, height: 24, borderRadius: 999,
                      background: 'rgba(13,16,21,0.75)', border: '1px solid var(--line)',
                      color: '#fff', cursor: 'pointer', fontSize: 13, lineHeight: 1,
                    }}
                  >
                    ×
                  </button>
                  {it.poster ? (
                    <img
                      src={img(it.poster)}
                      alt=""
                      loading="lazy"
                      style={{
                        display: 'block',
                        width: '100%',
                        aspectRatio: '2 / 3',
                        objectFit: 'cover',
                        background: 'var(--bg-raise)',
                      }}
                    />
                  ) : (
                    <div
                      style={{
                        aspectRatio: '2 / 3',
                        background: 'var(--bg-raise)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: 10,
                        textAlign: 'center',
                        fontFamily: 'var(--font-display)',
                        fontWeight: 600,
                        fontSize: 13,
                        color: 'var(--text-dim)',
                      }}
                    >
                      {it.name}
                    </div>
                  )}
                </div>

                <div style={{ padding: '9px 10px 10px', display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
                  <div
                    style={{
                      fontSize: 12.5, fontWeight: 600, lineHeight: 1.3,
                      overflow: 'hidden', textOverflow: 'ellipsis',
                      display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                    }}
                    title={it.name}
                  >
                    {it.name}
                  </div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--text-dim)' }}>
                    {it.year || ''}{it.year ? ' · ' : ''}{it.type === 'show' ? 'Show' : 'Movie'}
                  </div>
                  <div
                    style={{
                      fontSize: 10.5, color: 'var(--amber)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}
                    title={`Because you rated ${it.because.join(', ')}`}
                  >
                    Because you liked {it.because[0]}
                  </div>
                  <button
                    className="btn"
                    style={{ width: '100%', marginTop: 'auto', padding: '6px 0', fontSize: 12 }}
                    onClick={() => addItem(it)}
                    disabled={adding === it.key || added[it.key]}
                  >
                    {added[it.key] ? 'Added ✓' : adding === it.key ? 'Adding…' : '+ Watchlist'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
