import React, { useState } from 'react';
import { useStore } from '../store/useStore.js';
import { createList, renameList, deleteList, addToList, removeFromList, moveInList, addShowToWatchlist, addMovieToWatchlist } from '../store/db.js';
import { searchShows, searchMovies, showDetails, movieDetails, hasKey, img } from '../api/tmdb.js';
import { visibleLists, itemStatus, listProgress, itemFromResult, cleanName, SUGGESTED_NAMES, LIST_MAX } from './listsLogic.js';
import { MediaRow, SearchField, Empty } from './LibraryUI.jsx';
import { Chevron } from './ui.jsx';

const RESULTS_EACH = 5;
const plural = (n, one, many) => `${n.toLocaleString('en-AU')} ${n === 1 ? one : many || one + 's'}`;

// Watchlist → Lists: all your lists, and one list opened.
export default function ListsView({ openShow }) {
  const state = useStore();
  const [openId, setOpenId] = useState(null);
  const lists = visibleLists(state.lists);
  const open = openId ? lists.find((l) => l.id === openId) : null;
  if (open) return <ListDetail list={open} state={state} openShow={openShow} onBack={() => setOpenId(null)} />;
  return <ListsOverview lists={lists} state={state} onOpen={setOpenId} />;
}

function NewListForm({ lists, onMade }) {
  const [name, setName] = useState('');
  const taken = new Set(lists.map((l) => l.name.toLowerCase()));
  const ideas = SUGGESTED_NAMES.filter((n) => !taken.has(n.toLowerCase()));
  if (lists.length >= LIST_MAX) return <p className="sd-note">You have {LIST_MAX} lists, the most you can have. Delete one to make another.</p>;
  const make = (n) => { const id = createList(n); setName(''); if (id && onMade) onMade(id); };
  return (
    <div className="sd-lnew">
      <form className="sd-lpick-new" onSubmit={(e) => { e.preventDefault(); if (cleanName(name)) make(name); }}>
        <label className="sd-field">
          <input type="text" value={name} maxLength={60} placeholder="New list, e.g. Ramadan watch" aria-label="New list name" onChange={(e) => setName(e.target.value)} />
        </label>
        <button type="submit" className="sd-btn primary sm" disabled={!cleanName(name)}>Create</button>
      </form>
      {ideas.length > 0 && (
        <div className="sd-lpick-ideas">
          <span className="sd-note">Ideas:</span>
          {ideas.map((n) => <button key={n} type="button" className="sd-nchip" onClick={() => make(n)}>{n}</button>)}
        </div>
      )}
    </div>
  );
}

function ListsOverview({ lists, state, onOpen }) {
  return (
    <div className="sd-stackv" data-testid="lists">
      <NewListForm lists={lists} onMade={onOpen} />
      {lists.length === 0 ? (
        <Empty title="No lists yet.">
          Make a list for anything: “Ramadan watch”, “Watch with friends”, a film series to share. Add titles here, or from any show page or movie with “Lists ＋”.
        </Empty>
      ) : (
        <div className="sd-lgrid2">
          {lists.map((l) => {
            const p = listProgress(l, state);
            return (
              <button key={l.id} type="button" className="sd-card sd-lcard" onClick={() => onOpen(l.id)} data-list={l.name}>
                <span className="sd-lcard-posters" aria-hidden="true">
                  {l.items.slice(0, 4).map((it) => (
                    it.poster ? <img key={it.key} src={img(it.poster, 'w154')} alt="" loading="lazy" /> : <span key={it.key} className="ph">{it.name.charAt(0)}</span>
                  ))}
                  {l.items.length === 0 && <span className="ph empty">Empty</span>}
                </span>
                <span className="sd-lcard-body">
                  <span className="sd-lcard-name">{l.name}</span>
                  <span className="sd-mono sd-lcard-meta">{plural(l.items.length, 'title')}{l.items.length ? ` · ${p.done} watched` : ''}</span>
                </span>
                <Chevron />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function AddTitles({ list }) {
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState(null);
  const [err, setErr] = useState('');
  const have = new Set(list.items.map((x) => x.key));
  const run = async (e) => {
    e.preventDefault();
    if (!q.trim()) return;
    setBusy(true); setErr('');
    try {
      const [tv, mv] = await Promise.all([searchShows(q.trim()), searchMovies(q.trim())]);
      setRes([
        ...((tv && tv.results) || []).slice(0, RESULTS_EACH).map((r) => itemFromResult(r, 'tv')),
        ...((mv && mv.results) || []).slice(0, RESULTS_EACH).map((r) => itemFromResult(r, 'movie')),
      ].filter(Boolean));
    } catch (x) {
      setErr(x.message || 'Search failed.');
    }
    setBusy(false);
  };
  if (!hasKey()) return <p className="sd-note">Add a TMDB key in Settings to search for titles. You can still add titles from show pages and movies.</p>;
  return (
    <section className="sd-sec2" data-testid="list-add">
      <span className="sd-lbl">Add titles</span>
      <SearchField value={q} onChange={setQ} placeholder="Search shows and movies" onSubmit={run} busy={busy} />
      {err && <p className="sd-note">{err}</p>}
      {res && res.length === 0 && <p className="sd-note">No results. Try another spelling, or add a year (Ready 2011).</p>}
      {res && res.length > 0 && (
        <div className="sd-card">
          {res.map((it, i) => {
            const key = `${it.kind}:${it.tmdbId}`;
            const inList = have.has(key);
            return (
              <MediaRow
                key={key}
                sep={i > 0}
                path={it.poster}
                name={it.name}
                actions={inList
                  ? <button type="button" className="sd-btn sm" onClick={() => removeFromList(list.id, key)}>Added ✓</button>
                  : <button type="button" className="sd-btn sm primary" onClick={() => addToList(list.id, it)}>Add</button>}
              >
                <span className="sd-mrow-name">{it.name}</span>
                <span className="sd-mrow-meta">{it.kind === 'tv' ? 'Show' : 'Movie'}{it.year ? ` · ${it.year}` : ''}</span>
              </MediaRow>
            );
          })}
        </div>
      )}
    </section>
  );
}

function ListDetail({ list, state, openShow, onBack }) {
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(list.name);
  const [adding, setAdding] = useState(null); // key being added to the watchlist
  const p = listProgress(list, state);
  const toWatchlist = async (it) => {
    setAdding(it.key);
    try {
      if (it.kind === 'tv') addShowToWatchlist(await showDetails(it.tmdbId));
      else addMovieToWatchlist(await movieDetails(it.tmdbId));
    } catch (e) { alert(e.message); }
    setAdding(null);
  };
  return (
    <div className="sd-stackv" data-testid="list-detail">
      <button type="button" className="sd-linkbtn sd-lback" onClick={onBack}><Chevron dir="left" size={16} /> All lists</button>
      {renaming ? (
        <form className="sd-lpick-new" onSubmit={(e) => { e.preventDefault(); if (cleanName(name)) { renameList(list.id, name); setRenaming(false); } }}>
          <label className="sd-field"><input type="text" value={name} maxLength={60} aria-label="List name" onChange={(e) => setName(e.target.value)} autoFocus /></label>
          <button type="submit" className="sd-btn primary sm" disabled={!cleanName(name)}>Save</button>
          <button type="button" className="sd-btn sm" onClick={() => { setName(list.name); setRenaming(false); }}>Cancel</button>
        </form>
      ) : (
        <div className="sd-lhead">
          <h2 className="sd-lhead-name">{list.name}</h2>
          <button type="button" className="sd-btn sm" onClick={() => { setName(list.name); setRenaming(true); }}>Rename</button>
        </div>
      )}
      <p className="sd-mono sd-lcard-meta" data-testid="list-progress">{plural(list.items.length, 'title')}{list.items.length ? ` · ${p.done} of ${p.total} watched` : ''}</p>

      {list.items.length === 0 ? (
        <Empty title="This list is empty.">Search below, or open any show or movie and use “Lists ＋”.</Empty>
      ) : (
        <div className="sd-card" data-testid="list-items">
          {list.items.map((it, i) => {
            const st = itemStatus(it, state);
            const canOpen = it.kind === 'tv' && st.showId && openShow;
            return (
              <MediaRow
                key={it.key}
                sep={i > 0}
                path={it.poster}
                name={it.name}
                onClick={canOpen ? () => openShow(st.showId) : undefined}
                actions={(
                  <>
                    {st.tone === 'none' && (
                      <button type="button" className="sd-btn sm" disabled={adding === it.key} onClick={() => toWatchlist(it)}>＋ Watchlist</button>
                    )}
                    <span className="sd-lmove">
                      <button type="button" className="sd-ib sd-ib--sm" disabled={i === 0} aria-label={`Move ${it.name} up`} onClick={() => moveInList(list.id, it.key, -1)}>↑</button>
                      <button type="button" className="sd-ib sd-ib--sm" disabled={i === list.items.length - 1} aria-label={`Move ${it.name} down`} onClick={() => moveInList(list.id, it.key, 1)}>↓</button>
                    </span>
                    <button type="button" className="sd-ib sd-ib--sm" aria-label={`Remove ${it.name} from ${list.name}`} title="Remove from list" onClick={() => removeFromList(list.id, it.key)}>✕</button>
                  </>
                )}
              >
                <span className="sd-mrow-name">{it.name}</span>
                <span className="sd-mrow-meta">{it.kind === 'tv' ? 'Show' : 'Movie'}{it.year ? ` · ${it.year}` : ''}</span>
                <span className={`sd-mrow-meta sd-lstat t-${st.tone}`}>{st.label}</span>
              </MediaRow>
            );
          })}
        </div>
      )}

      <AddTitles list={list} />

      <button
        type="button"
        className="sd-btn sd-ldelete"
        onClick={() => { if (confirm(`Delete the list “${list.name}”? The shows and movies in it stay in your library.`)) { deleteList(list.id); onBack(); } }}
      >
        Delete this list
      </button>
    </div>
  );
}
