import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../store/useStore.js';
import { useServicesPrefs } from '../store/servicesPrefs.js';
import { addShowToWatchlist, addMovieToWatchlist } from '../store/db.js';
import { discoverTitles, movieProviderList, tvProviderList, showDetails, movieDetails, hasKey, img } from '../api/tmdb.js';
import { hiddenKeySet } from './hiddenLogic.js';
import { localISODate } from './showLogic.js';
import { fmtDay } from './statsLogic.js';
import { ServicesSheet } from './ServicesUI.jsx';
import { Empty } from './LibraryUI.jsx';
import { SECTIONS, myServices, buildQueries, collect, servicesText, cacheId, loadCache, saveCache } from './newOnLogic.js';

const PREVIEW = 12;
const storage = () => { try { return window.localStorage; } catch (e) { return null; } };

// Watchlist → New: what's new this week on the services you pay for.
export default function NewOnView({ openShow }) {
  const state = useStore();
  const svc = useServicesPrefs();
  const [pick, setPick] = useState(false);
  const [answers, setAnswers] = useState(null);
  const [err, setErr] = useState('');
  const [services, setServices] = useState(null);
  const [tick, setTick] = useState(0);
  const [more, setMore] = useState({});
  const [adding, setAdding] = useState(null);
  const today = localISODate();
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  useEffect(() => {
    if (!hasKey() || !svc.mine.length) return;
    let live = true;
    setErr('');
    (async () => {
      try {
        const [m, t] = await Promise.all([movieProviderList(svc.region), tvProviderList(svc.region)]);
        const list = [...((m && m.results) || []), ...((t && t.results) || [])];
        const mine = myServices(list, svc.mine);
        if (!live) return;
        setServices(mine);
        if (!mine.length) { setAnswers([]); return; }
        const id = cacheId(mine, svc.region, today);
        const cached = storage() && loadCache(storage(), id);
        if (cached && !tick) { setAnswers(cached); return; }
        setAnswers(null);
        const qs = buildQueries(mine, svc.region, today);
        const got = await Promise.all(qs.map(async (q) => {
          const d = await discoverTitles(q.kind, q.params);
          return { ...q, results: (d && d.results) || [] };
        }));
        if (!live) return;
        if (storage()) saveCache(storage(), id, got);
        setAnswers(got);
      } catch (e) {
        if (live) { setErr('Couldn’t reach TMDB. Check your connection and try again.'); setAnswers([]); }
      }
    })();
    return () => { live = false; };
  }, [svc.mine.join(','), svc.region, today, tick]); // eslint-disable-line react-hooks/exhaustive-deps

  const hidden = useMemo(() => hiddenKeySet(state.hidden), [state.hidden]);
  const groups = useMemo(() => (answers ? collect(answers, state, hidden) : null), [answers, state, hidden]);

  const toWatchlist = async (it) => {
    setAdding(it.key);
    try {
      if (it.kind === 'tv') addShowToWatchlist(await showDetails(it.tmdbId));
      else addMovieToWatchlist(await movieDetails(it.tmdbId));
    } catch (e) { alert(e.message); }
    if (alive.current) setAdding(null);
  };

  if (!hasKey()) return <Empty title="Needs a TMDB key.">Add your TMDB key in Settings to see what’s new on your services.</Empty>;
  if (!svc.mine.length) {
    return (
      <div className="sd-stackv" data-testid="newon">
        <Empty title="Which services do you pay for?">Choose your streaming services, and this page shows what’s new on them this week.</Empty>
        <button type="button" className="sd-btn primary" style={{ alignSelf: 'flex-start' }} onClick={() => setPick(true)}>Choose my services</button>
        {pick && <ServicesSheet onClose={() => setPick(false)} />}
      </div>
    );
  }

  const total = groups ? SECTIONS.reduce((n, s) => n + groups[s.id].length, 0) : 0;
  return (
    <div className="sd-stackv" data-testid="newon">
      <div className="sd-newon-head">
        <span className="sd-note">On {services ? servicesText(services.map((s) => s.platform)) || 'your services' : 'your services'} · {svc.region}</span>
        <button type="button" className="sd-linkbtn" onClick={() => setPick(true)}>Change services</button>
        <button type="button" className="sd-linkbtn" disabled={!answers} onClick={() => setTick((n) => n + 1)}>Refresh</button>
      </div>
      {pick && <ServicesSheet onClose={() => setPick(false)} />}
      {err && <p className="sd-note">{err}</p>}
      {!answers && <p className="sd-note" role="status">Looking for what’s new…</p>}
      {groups && total === 0 && !err && (
        <Empty title="Nothing new found this week.">TMDB lists nothing new on your services right now. Check back in a few days.</Empty>
      )}
      {groups && SECTIONS.map((s) => {
        const list = groups[s.id];
        if (!list.length) return null;
        const shown = more[s.id] ? list : list.slice(0, PREVIEW);
        return (
          <section key={s.id} className="sd-sec2" data-section={s.id}>
            <div className="sd-sec2-head"><span className="sd-lbl">{s.title} · {list.length}</span></div>
            <p className="sd-note" style={{ marginTop: -4 }}>{s.blurb}</p>
            <div className="sd-newon-grid">
              {shown.map((it) => {
                const canOpen = it.kind === 'tv' && it.library.showId && openShow;
                return (
                  <article key={it.key} className="sd-card sd-newon-card" data-key={it.key}>
                    <button type="button" className="sd-newon-open" disabled={!canOpen} onClick={canOpen ? () => openShow(it.library.showId) : undefined} aria-label={canOpen ? `Open ${it.name}` : it.name}>
                      {it.poster ? <img src={img(it.poster, 'w185')} alt="" loading="lazy" /> : <span className="ph" aria-hidden="true">{it.name.charAt(0)}</span>}
                    </button>
                    <div className="sd-newon-body">
                      <span className="sd-newon-name">{it.name}</span>
                      <span className="sd-newon-svc">{servicesText(it.services)}</span>
                      <span className="sd-newon-meta">
                        {it.kind === 'tv' ? 'Show' : 'Film'}
                        {it.date ? ` · ${s.id === 'episodes' ? it.date.slice(0, 4) : fmtDay(it.date)}` : ''}
                      </span>
                      {it.library.label ? <span className={`sd-newon-lib t-${it.library.tone}`}>{it.library.label}</span> : null}
                      {it.library.tone === 'none' && (
                        <button type="button" className="sd-btn sm" disabled={adding === it.key} onClick={() => toWatchlist(it)}>＋ Watchlist</button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
            {list.length > PREVIEW && (
              <button type="button" className="sd-btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => setMore((m) => ({ ...m, [s.id]: !m[s.id] }))}>
                {more[s.id] ? 'Show fewer' : `Show all ${list.length}`}
              </button>
            )}
          </section>
        );
      })}
      <p className="sd-note">TMDB doesn’t say the exact day a title arrived on a service, so “new” means new episodes and recent releases that you can stream now. Titles you marked “Not interested” are left out.</p>
    </div>
  );
}
