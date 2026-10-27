import React, { useEffect, useMemo, useState } from 'react';
import { Sheet } from './ui.jsx';
import { Poster } from './LibraryUI.jsx';
import ScoresRow from './ScoresRow.jsx';
import WatchLinks from './WatchLinks.jsx';
import CastCrew from './CastCrew.jsx';
import { fromTmdb } from './scoresLogic.js';
import { scoresOn } from './useScores.js';
import { regionBlock } from './watchLinksLogic.js';
import { normalizeProviders } from './servicesLogic.js';
import { useServicesPrefs } from '../store/servicesPrefs.js';
import { useStore } from '../store/useStore.js';
import { movieDetailsWithCredits, movieVideos, pickTrailer, hasKey } from '../api/tmdb.js';
import { notify, notifyError, reason, askConfirm } from './appDialogs.js';

// A film on your Watchlist that you haven't watched yet: read about it before you decide.
// Description, ▶ Trailer, critic scores, where to watch and the cast, from ONE TMDB request
// (details + credits + watch providers); then "I watched it" or "Remove".
// movie: the planned entry ({ index, tmdbId, name, poster, year, runtimeMin }).
export default function MovieInfoSheet({ movie, onClose, onWatched, onRemove }) {
  const state = useStore();
  const svc = useServicesPrefs();
  const [d, setD] = useState(null); // TMDB details, or { error }
  const [busy, setBusy] = useState(false);
  const id = movie && movie.tmdbId;

  useEffect(() => {
    setD(null);
    if (!id || !hasKey()) return undefined;
    let alive = true;
    movieDetailsWithCredits(id)
      .then((x) => alive && setD(x))
      .catch((e) => alive && setD({ error: reason(e) }));
    return () => { alive = false; };
  }, [id]);

  const trackedTv = useMemo(() => new Set(Object.values(state.shows).map((x) => x.tmdbId).filter(Boolean)), [state.shows]);
  const trackedMovie = useMemo(() => new Set((state.movies || []).map((m) => m.tmdbId).filter(Boolean)), [state.movies]);

  if (!movie) return null;
  const ok = d && !d.error;
  const watchRec = ok ? (({ providers, free, link, buyRent }) => ({ providers, providersFree: free, providersLink: link, providersBuyRent: buyRent }))(normalizeProviders(regionBlock(d, svc.region))) : null;
  const year = (ok && (d.release_date || '').slice(0, 4)) || movie.year || '';
  const runtime = (ok && d.runtime) || movie.runtimeMin || null;

  // Open the tab first (before any await) so it isn't blocked as a pop-up, then point it at YouTube.
  async function openTrailer() {
    const win = window.open('', '_blank');
    if (!win) { notifyError('Your browser blocked the new tab. Allow pop-ups for this site, then try again.'); return; }
    setBusy(true);
    try {
      const v = pickTrailer(await movieVideos(id));
      if (v) win.location = `https://www.youtube.com/watch?v=${v.key}`;
      else { win.close(); notify(`No trailer found on TMDB for “${movie.name}”.`); }
    } catch (err) {
      win.close();
      notifyError(`Couldn’t load the trailer: ${reason(err)}.`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open title={movie.name} subtitle={[year, 'On your watchlist'].filter(Boolean).join(' · ')} onClose={onClose}>
      <div className="sd-mdet-head" data-testid="movie-info">
        <Poster path={movie.poster || (ok ? d.poster_path : null)} name={movie.name} width={84} height={126} radius={10} />
        <div className="sd-gap10" style={{ minWidth: 0, flex: 1 }}>
          <div className="sd-mdet-facts">
            {runtime ? <span>{runtime} min</span> : null}
            {ok && d.vote_average && !scoresOn() ? <span>★ {d.vote_average.toFixed(1)} TMDB</span> : null}
            {ok && (d.genres || []).length ? <span>{d.genres.map((g) => g.name).join(', ')}</span> : null}
          </div>
          {id && hasKey() ? (
            <div><button type="button" className="sd-btn" onClick={openTrailer} disabled={busy}>{busy ? 'Loading…' : '▶ Trailer'}</button></div>
          ) : null}
        </div>
      </div>

      <div className="sd-mdet-sec">
        <span className="sd-lbl">About</span>
        {!id ? (
          <p className="sd-mdet-over">Not linked to TMDB, so there are no details to show.</p>
        ) : !hasKey() ? (
          <p className="sd-mdet-over">Add a TMDB API key in Settings to see the description, trailer and scores.</p>
        ) : !d ? (
          <p className="sd-mdet-over">Loading details…</p>
        ) : d.error ? (
          <p className="sd-mdet-over">Couldn’t load details: {d.error}</p>
        ) : (
          <>
            {d.tagline ? <p className="sd-mdet-over" style={{ fontStyle: 'italic' }}>{d.tagline}</p> : null}
            <p className="sd-mdet-over" data-testid="movie-overview">{d.overview || 'No description available on TMDB.'}</p>
          </>
        )}
      </div>

      {ok ? <ScoresRow kind="movie" tmdbId={id} name={movie.name} known={fromTmdb(d)} label="Scores" className="sd-mdet-sec" /> : null}
      {watchRec ? <WatchLinks rec={watchRec} title={movie.name} mine={svc.mine} className="sd-mdet-sec" /> : null}
      {ok && d.credits ? (
        <div className="sd-mdet-sec">
          <CastCrew key={id} kind="movie" tmdbId={id} details={d} trackedTv={trackedTv} trackedMovie={trackedMovie} />
        </div>
      ) : null}

      <div className="sd-mdet-sec sd-minfo-acts">
        <button type="button" className="sd-btn primary" onClick={() => { onWatched(movie); onClose(); }}>✓ I watched it</button>
        <button
          type="button"
          className="sd-btn"
          onClick={async () => {
            if (await askConfirm({ title: 'Remove from your watchlist?', body: `“${movie.name}” will be taken off your watchlist.`, confirmLabel: 'Remove' })) { onRemove(movie); onClose(); }
          }}
        >
          Remove from watchlist
        </button>
      </div>
    </Sheet>
  );
}
