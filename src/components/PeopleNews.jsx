import React, { useEffect, useMemo, useRef, useState } from 'react';
import { followPerson, dismissPersonTitle, addShowToWatchlist, addMovieToWatchlist } from '../store/db.js';
import { personCombinedCredits, showDetails, movieDetails, hasKey, img } from '../api/tmdb.js';
import { followed, newTitles, peopleToCheck, slimCredits, loadCredits, saveCredits, RECENT_DAYS } from './peopleLogic.js';
import { localISODate } from './showLogic.js';
import { fmtDay } from './statsLogic.js';
import { Avatar, Sheet } from './ui.jsx';

const PREVIEW = 3;
const POOL = 3;
const storage = () => { try { return window.localStorage; } catch (e) { return null; } };
const DAY = 86400000;

// Keeps each followed person's credit list fresh (device-only cache, re-asked every few hours).
function usePeopleCredits(people) {
  const [credits, setCredits] = useState(() => (storage() ? loadCredits(storage()) : {}));
  const running = useRef(false);
  const ids = followed(people).map((p) => p.id).join(',');
  useEffect(() => {
    if (!hasKey() || running.current) return;
    const todo = peopleToCheck(people, credits);
    if (!todo.length) return;
    running.current = true;
    let next = 0;
    const got = {};
    const cutoff = new Date(Date.now() - (RECENT_DAYS + 30) * DAY).toISOString().slice(0, 10);
    const worker = async () => {
      while (next < todo.length) {
        const id = todo[next++];
        try {
          const list = slimCredits(await personCombinedCredits(id)).filter((c) => c.date && c.date >= cutoff); // keep only what can be news
          got[id] = { at: new Date().toISOString(), list };
        } catch (e) { /* offline: try again next time */ }
      }
    };
    Promise.all(Array.from({ length: Math.min(POOL, todo.length) }, worker)).finally(() => {
      running.current = false;
      setCredits((c) => {
        const merged = { ...c, ...got };
        if (storage()) saveCredits(storage(), merged);
        return merged;
      });
    });
  }, [ids]); // eslint-disable-line react-hooks/exhaustive-deps
  return credits;
}

function ManageSheet({ list, onClose }) {
  return (
    <Sheet open title="People you follow" subtitle="You’ll see their new films and shows on Up Next" onClose={onClose}>
      {list.length === 0 ? (
        <p className="sd-note">You don’t follow anyone yet. Open any show or movie, tap someone in its Cast & crew, then tap Follow.</p>
      ) : (
        <div className="sd-card" data-testid="people-manage">
          {list.map((p, i) => (
            <div key={p.id} className={'sd-row' + (i ? ' sd-sep' : '')} style={{ cursor: 'default' }}>
              <Avatar name={p.name} path={p.profile} size={36} tint={i} />
              <span className="sd-ell" style={{ flexGrow: 1 }}>{p.name}</span>
              <button type="button" className="sd-btn sm" onClick={() => followPerson(p, false)}>Unfollow</button>
            </div>
          ))}
        </div>
      )}
    </Sheet>
  );
}

// Up Next: "New from people you follow". Hidden when you follow nobody.
export default function PeopleNews({ state, openShow }) {
  const credits = usePeopleCredits(state.people);
  const [all, setAll] = useState(false);
  const [manage, setManage] = useState(false);
  const [adding, setAdding] = useState(null);
  const today = localISODate();
  const tracked = useMemo(() => new Set([
    ...Object.values(state.shows).filter((s) => s && s.tmdbId).map((s) => `tv:${s.tmdbId}`),
    ...(state.movies || []).filter((m) => m && m.tmdbId).map((m) => `movie:${m.tmdbId}`),
  ]), [state.shows, state.movies]);
  const list = followed(state.people);
  const news = useMemo(() => newTitles(state.people, credits, tracked, today), [state.people, credits, tracked, today]);
  if (!list.length) return null;

  const add = async (n) => {
    setAdding(n.key);
    try {
      if (n.title.kind === 'tv') addShowToWatchlist(await showDetails(n.title.id));
      else addMovieToWatchlist(await movieDetails(n.title.id));
    } catch (e) { alert(e.message); }
    setAdding(null);
  };
  const shown = all ? news : news.slice(0, PREVIEW);
  return (
    <section className="sd-card sd-pnews" data-testid="people-news">
      <div className="sd-pnews-head">
        <span className="sd-lbl">{news.length ? `New from people you follow · ${news.length}` : 'People you follow'}</span>
        <button type="button" className="sd-linkbtn" onClick={() => setManage(true)}>Following {list.length} · Manage</button>
      </div>
      {news.length === 0 && <p className="sd-note sd-pnews-empty">Nothing new from them right now. Their next film or show will appear here.</p>}
      {shown.map((n) => (
        <div key={n.key} className="sd-pnews-row" data-title={n.title.key}>
          {n.title.poster ? <img src={img(n.title.poster, 'w92')} alt="" loading="lazy" /> : <span className="ph" aria-hidden="true">{n.title.name.charAt(0)}</span>}
          <div className="sd-pnews-body">
            <span className="sd-pnews-name">{n.title.name}</span>
            <span className="sd-pnews-who">{n.person.name}{n.title.role ? ` · ${n.title.role}` : ''}</span>
            <span className={'sd-pnews-when' + (n.upcoming ? ' up' : '')}>
              {n.title.kind === 'tv' ? 'Show' : 'Film'} · {n.upcoming ? `Coming ${fmtDay(n.title.date)}` : `Out ${fmtDay(n.title.date)}`}
            </span>
          </div>
          <div className="sd-pnews-acts">
            <button type="button" className="sd-btn sm" disabled={adding === n.key} onClick={() => add(n)}>＋ Watchlist</button>
            <button type="button" className="sd-ib sd-ib--sm" aria-label={`Hide ${n.title.name}`} title="Hide" onClick={() => dismissPersonTitle(n.person.id, n.title.key)}>✕</button>
          </div>
        </div>
      ))}
      {news.length > PREVIEW && (
        <button type="button" className="sd-linkbtn sd-pnews-more" onClick={() => setAll((v) => !v)}>{all ? 'Show fewer' : `Show all ${news.length}`}</button>
      )}
      {manage && <ManageSheet list={list} onClose={() => setManage(false)} />}
    </section>
  );
}
