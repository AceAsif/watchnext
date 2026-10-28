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
import { titleFacts } from './titleInfoLogic.js';
import { useServicesPrefs } from '../store/servicesPrefs.js';
import { useStore } from '../store/useStore.js';
import { movieDetailsWithCredits, tvDetailsForPreview, movieVideos, tvVideos, pickTrailer, hasKey } from '../api/tmdb.js';
import { notify, notifyError, reason } from './appDialogs.js';

// Read about a show or film before you add it or watch it: description, ▶ Trailer, scores,
// where to watch and the cast, from ONE TMDB request. The caller gives the buttons (`actions`).
//   kind: 'movie' | 'tv';  title: { tmdbId, name, poster, year, runtimeMin }
//   note: shown after the year in the subtitle ("On your watchlist", "Following"…)
export default function TitleInfoSheet({ kind, title, note = '', actions = null, onClose, testId = 'title-info' }) {
  const state = useStore();
  const svc = useServicesPrefs();
  const [d, setD] = useState(null); // TMDB details, or { error }
  const [busy, setBusy] = useState(false);
  const id = title && title.tmdbId;

  useEffect(() => {
    setD(null);
    if (!id || !hasKey()) return undefined;
    let alive = true;
    (kind === 'movie' ? movieDetailsWithCredits(id) : tvDetailsForPreview(id))
      .then((x) => alive && setD(x))
      .catch((e) => alive && setD({ error: reason(e) }));
    return () => { alive = false; };
  }, [id, kind]);

  const trackedTv = useMemo(() => new Set(Object.values(state.shows).map((x) => x.tmdbId).filter(Boolean)), [state.shows]);
  const trackedMovie = useMemo(() => new Set((state.movies || []).map((m) => m.tmdbId).filter(Boolean)), [state.movies]);

  if (!title) return null;
  const ok = d && !d.error;
  const watchRec = ok ? (({ providers, free, link, buyRent }) => ({ providers, providersFree: free, providersLink: link, providersBuyRent: buyRent }))(normalizeProviders(regionBlock(d, svc.region))) : null;
  const year = (ok && ((kind === 'movie' ? d.release_date : d.first_air_date) || '').slice(0, 4)) || title.year || '';
  const facts = titleFacts(kind, d, { runtimeMin: title.runtimeMin });
  const credits = ok && (kind === 'movie' ? d.credits : d.aggregate_credits);

  // Open the tab first (before any await) so it isn't blocked as a pop-up, then point it at YouTube.
  async function openTrailer() {
    const win = window.open('', '_blank');
    if (!win) { notifyError('Your browser blocked the new tab. Allow pop-ups for this site, then try again.'); return; }
    setBusy(true);
    try {
      const v = pickTrailer(await (kind === 'movie' ? movieVideos(id) : tvVideos(id)));
      if (v) win.location = `https://www.youtube.com/watch?v=${v.key}`;
      else { win.close(); notify(`No trailer found on TMDB for “${title.name}”.`); }
    } catch (err) {
      win.close();
      notifyError(`Couldn’t load the trailer: ${reason(err)}.`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open title={title.name} subtitle={[year, kind === 'movie' ? 'Movie' : 'Show', note].filter(Boolean).join(' · ')} onClose={onClose}>
      <div className="sd-mdet-head" data-testid={testId}>
        <Poster path={title.poster || (ok ? d.poster_path : null)} name={title.name} width={84} height={126} radius={10} />
        <div className="sd-gap10" style={{ minWidth: 0, flex: 1 }}>
          <div className="sd-mdet-facts">
            {facts.map((f) => <span key={f}>{f}</span>)}
            {ok && d.vote_average && !scoresOn() ? <span>★ {d.vote_average.toFixed(1)} TMDB</span> : null}
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
            <p className="sd-mdet-over" data-testid="title-overview">{(d.overview || '').trim() || 'No description available on TMDB.'}</p>
          </>
        )}
      </div>

      {ok ? <ScoresRow kind={kind} tmdbId={id} name={title.name} known={fromTmdb(d)} label="Scores" className="sd-mdet-sec" /> : null}
      {watchRec ? <WatchLinks rec={watchRec} title={title.name} mine={svc.mine} className="sd-mdet-sec" /> : null}
      {credits ? (
        <div className="sd-mdet-sec">
          <CastCrew key={kind + id} kind={kind} tmdbId={id} details={d} trackedTv={trackedTv} trackedMovie={trackedMovie} />
        </div>
      ) : null}

      {actions ? <div className="sd-mdet-sec sd-minfo-acts">{actions}</div> : null}
    </Sheet>
  );
}
