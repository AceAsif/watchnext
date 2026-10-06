import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../store/useStore.js';
import { watchedCount, lastWatchDate, markPlannedMovieWatched, setMovieGenres } from '../store/db.js';
import { movieDetails, hasKey } from '../api/tmdb.js';
import { Sheet } from './ui.jsx';
import { Poster } from './LibraryUI.jsx';
import { localISODate } from './showLogic.js';
import {
  TIME_CHOICES, MOODS, buildCandidates, fitFor, suggest, whyLines, moodNote, emptyText, formatMinutes, loadPrefs, savePrefs, moodById,
} from './tonightLogic.js';
import { statusLine } from './servicesLogic.js';
import { ServicesToggle, ServicesStatus } from './ServicesUI.jsx';
import { useServicesPrefs } from '../store/servicesPrefs.js';
import useAvailability from './useAvailability.js';

const H = { watchedCount, lastWatchDate };

// Planned movies queued before genres were stored have none, so a mood can't judge them.
// When a mood is chosen, fetch the missing genres quietly (two at a time) and save them.
function useMovieGenres(cands, active) {
  const tried = useRef(new Set());
  const inflight = useRef(0);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!active || !hasKey()) return;
    for (const c of cands) {
      if (c.kind !== 'movie' || c.genres !== null || !c.tmdbId || tried.current.has(c.tmdbId) || inflight.current >= 2) continue;
      tried.current.add(c.tmdbId);
      inflight.current += 1;
      movieDetails(c.tmdbId)
        .then((d) => setMovieGenres(c.tmdbId, ((d && d.genres) || []).map((g) => g.name)))
        .catch(() => { /* offline / unknown id: leave it "genres not known yet" */ })
        .finally(() => { inflight.current -= 1; setTick((n) => n + 1); });
    }
  }, [cands, active, tick]);
}

const KIND_LABEL = { continue: 'Continue watching', start: 'New to you', movie: 'Movie' };

// "What should I watch tonight?" — pick the time you have and a mood; it suggests from your
// Up Next, your Watchlist shows and your planned movies (see tonightLogic.js for the rules).
export default function TonightSheet({ openShow, onClose }) {
  const state = useStore();
  const today = localISODate();
  const [prefs, setPrefs] = useState(() => loadPrefs(localStorage));
  const [seed, setSeed] = useState(0);
  const [shown, setShown] = useState(() => new Set()); // already-suggested keys, so "Another" gives different ones
  const svc = useServicesPrefs();
  const mine = useMemo(() => new Set(svc.mine), [svc.mine]);

  const cands = useMemo(() => buildCandidates(state, today, H), [state.shows, state.movies, today]); // eslint-disable-line react-hooks/exhaustive-deps
  useMovieGenres(cands, prefs.mood !== 'any');

  // Only what fits the time needs an availability check (and only when the services switch is on).
  const fitting = useMemo(() => cands.filter((c) => fitFor(c, prefs.minutes).fits), [cands, prefs.minutes]);
  const checkItems = useMemo(
    () => fitting.map((c) => ({ key: c.key, kind: c.kind === 'movie' ? 'movie' : 'tv', id: c.id, tmdbId: c.tmdbId, rec: c.rec })),
    [fitting]
  );
  const av = useAvailability(checkItems, prefs.onlyMine);

  const result = useMemo(
    () => suggest(cands, { minutes: prefs.minutes, mood: prefs.mood, seed, exclude: shown, mine, onlyMine: prefs.onlyMine, today }),
    [cands, prefs, seed, shown, mine, today]
  );

  const choose = (patch) => {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    savePrefs(localStorage, next);
    setShown(new Set()); // a new question: start the suggestions afresh
    setSeed(0);
  };
  const another = () => {
    setShown((s) => new Set([...s, ...result.picks.map((p) => p.key)]));
    setSeed((n) => n + 1);
  };
  const svcStatus = prefs.onlyMine ? statusLine({ remaining: av.remaining, failed: av.failed, noKey: av.noKey, noServices: svc.mine.length === 0, unknownIds: av.noId }) : null;
  const M = moodById(prefs.mood);

  return (
    <Sheet open title="What should I watch tonight?" onClose={onClose}>
      <div className="sd-tn-q">
        <span className="sd-tn-l">How much time?</span>
        <div className="sd-nchips" role="group" aria-label="Time you have">
          {TIME_CHOICES.map((m) => (
            <button key={m} type="button" className={'sd-nchip' + (prefs.minutes === m ? ' on' : '')} aria-pressed={prefs.minutes === m} onClick={() => choose({ minutes: m })}>
              {formatMinutes(m)}
            </button>
          ))}
        </div>
        <span className="sd-tn-l">What mood?</span>
        <div className="sd-nchips" role="group" aria-label="Mood">
          {MOODS.map((m) => (
            <button key={m.id} type="button" className={'sd-nchip' + (prefs.mood === m.id ? ' on' : '')} aria-pressed={prefs.mood === m.id} onClick={() => choose({ mood: m.id })}>
              {m.label}
            </button>
          ))}
        </div>
        <div className="sd-svcbar" style={{ marginTop: 4 }}>
          <ServicesToggle on={prefs.onlyMine} onToggle={() => choose({ onlyMine: !prefs.onlyMine })} label="Only on my services" />
          <ServicesStatus text={svcStatus} canRetry={av.failed > 0} onRetry={av.retry} />
        </div>
      </div>

      <p className="sd-tn-count sd-mono" role="status" data-testid="tonight-count">
        {result.fitting === 0 ? 'Nothing fits yet' : `${result.fitting} ${result.fitting === 1 ? 'thing fits' : 'things fit'}${M.id !== 'any' ? ` · ${result.matching} match your mood` : ''}`}
      </p>

      {result.picks.length === 0 ? (
        <p className="sd-tn-empty" data-testid="tonight-empty">{emptyText(prefs.minutes, prefs.mood, prefs.onlyMine)}</p>
      ) : (
        <ul className="sd-nlist sd-tn-list">
          {result.picks.map((p) => (
            <li key={p.key}>
              <div className="sd-nitem static sd-tn-card" data-testid="tonight-pick">
                <Poster path={p.poster} name={p.name} width={56} height={84} />
                <span className="body">
                  <span className="sd-tn-kind sd-mono">{KIND_LABEL[p.kind]}</span>
                  <span className="name" title={p.name}>{p.name}</span>
                  {whyLines(p, prefs.minutes).map((l) => <span key={l} className="meta sd-mono">{l}</span>)}
                  {moodNote(p, prefs.mood) ? <span className={'sd-tn-mood' + (p.moodState === 'match' ? ' ok' : '')}>{moodNote(p, prefs.mood)}</span> : null}
                  {p.genres && p.genres.length ? <span className="meta sd-mono">{p.genres.slice(0, 3).join(' · ')}</span> : null}
                  {p.where ? <span className="meta sd-mono sd-svc-meta">{p.where}</span> : null}
                  <span className="sd-tn-acts">
                    {p.kind === 'movie' ? (
                      <button type="button" className="sd-btn sm" onClick={() => markPlannedMovieWatched(p.index)}>Mark watched</button>
                    ) : (
                      <button type="button" className="sd-btn sm primary" onClick={() => { onClose(); openShow && openShow(p.id); }}>Open show</button>
                    )}
                  </span>
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}

      {result.wrapped && result.picks.length > 0 ? <p className="sd-tn-count sd-mono">That’s everything that fits: starting over.</p> : null}
      <button type="button" className="sd-btn" style={{ width: '100%', marginTop: 12 }} disabled={result.picks.length === 0 || result.fitting <= result.picks.length} onClick={another}>
        Show me different ones
      </button>
    </Sheet>
  );
}
