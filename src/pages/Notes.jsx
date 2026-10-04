import React, { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { useStore } from '../store/useStore.js';
import { img } from '../api/tmdb.js';
import { Chevron } from '../components/ui.jsx';
import { FilterField, StatusTabs } from '../components/LibraryBar.jsx';
import { REACTIONS, reactionById } from '../store/notes.js';
import {
  KINDS,
  NO_REACTION,
  PAGE_SIZE,
  collectNotes,
  filterNotes,
  kindCounts,
  reactionCounts,
  summaryLine,
  hasFilters,
  toggleReaction,
} from '../components/notesSearchLogic.js';
import { fmtDay } from '../components/statsLogic.js';
import { localDate } from '../components/csvExport.js';
import { initialOf } from '../components/libraryLogic.js';

// "Your notes": every episode and movie you wrote about or reacted to, newest
// first, with a search box, a type switch and reaction chips. Opened from the
// Stats page. `memo` is owned by App so that going into a show and pressing Back
// brings you back to the same search, filters and scroll position.

function Art({ entry }) {
  return entry.poster ? (
    <img className="art" src={img(entry.poster, 'w92')} alt="" loading="lazy" />
  ) : (
    <span className="art blank" aria-hidden="true">{initialOf(entry.name)}</span>
  );
}

function Item({ entry, onOpen }) {
  const r = reactionById(entry.react);
  const when = entry.at ? fmtDay(localDate(entry.at)) : '';
  const meta = entry.kind === 'episode' ? [entry.code, when] : ['Movie' + (entry.year ? ` · ${entry.year}` : ''), when && `watched ${when}`];
  const body = (
    <>
      <Art entry={entry} />
      <span className="body">
        <span className="name">{entry.name}</span>
        <span className="meta sd-mono">{meta.filter(Boolean).join(' · ')}</span>
        {entry.text ? <span className="txt">{entry.text}</span> : null}
      </span>
      {r ? <span className="emo" role="img" aria-label={r.label}>{r.emoji}</span> : null}
    </>
  );
  return entry.kind === 'episode' ? (
    <button type="button" className="sd-nitem" onClick={onOpen} aria-label={`${entry.name} ${entry.code}${r ? ', ' + r.label : ''}. Open show`}>
      {body}
    </button>
  ) : (
    <div className="sd-nitem static">{body}</div>
  );
}

export default function Notes({ onBack, openShow, memo }) {
  const state = useStore();
  const all = useMemo(() => collectNotes(state.shows, state.movies), [state.shows, state.movies]);
  const [q, setQ] = useState(memo.q);
  const [reacts, setReacts] = useState(memo.reacts);
  const [kind, setKind] = useState(memo.kind);
  const [shown, setShown] = useState(memo.shown);

  // Remember everything so Back from a show restores it.
  useEffect(() => { Object.assign(memo, { q, reacts, kind, shown }); }, [memo, q, reacts, kind, shown]);
  useLayoutEffect(() => { if (memo.scroll) window.scrollTo(0, memo.scroll); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const f = { q, reacts, kind };
  const rows = useMemo(() => filterNotes(all, f), [all, q, reacts, kind]); // eslint-disable-line react-hooks/exhaustive-deps
  const kinds = useMemo(() => kindCounts(all, f), [all, q, reacts]); // eslint-disable-line react-hooks/exhaustive-deps
  const rc = useMemo(() => reactionCounts(all, f), [all, q, kind]); // eslint-disable-line react-hooks/exhaustive-deps

  const change = (fn) => (v) => { fn(v); setShown(PAGE_SIZE); };
  const open = (id) => { memo.scroll = window.scrollY; openShow(id); };
  const clear = () => { setQ(''); setReacts([]); setKind('All'); setShown(PAGE_SIZE); };
  const visible = rows.slice(0, shown);

  return (
    <div className="sd-page sd-notespage">
      <button className="sd-back" onClick={onBack}><Chevron dir="left" />Back</button>
      <h1 className="sd-title">Your notes</h1>
      <p className="sd-nsub">{summaryLine(all)}</p>

      {all.length === 0 ? (
        <div className="sd-card sd-pad sd-empty">
          Nothing here yet. On a watched episode tap the speech bubble to add a reaction or a few words, or open a movie and use “Your thoughts”. They will all be searchable here.
        </div>
      ) : (
        <>
          <FilterField value={q} onChange={change(setQ)} placeholder="Search notes, shows, S1E5…" label="Search your notes" />
          <StatusTabs options={KINDS} value={kind} onChange={change(setKind)} counts={kinds} />
          <div className="sd-nchips" role="group" aria-label="Filter by reaction">
            {REACTIONS.map((r) => {
              const on = reacts.includes(r.id);
              return (
                <button
                  key={r.id}
                  type="button"
                  className={'sd-nchip' + (on ? ' on' : '') + (rc[r.id] === 0 && !on ? ' z' : '')}
                  aria-pressed={on}
                  aria-label={`${r.label}, ${rc[r.id]}`}
                  onClick={() => change(setReacts)(toggleReaction(reacts, r.id))}
                >
                  <span aria-hidden="true">{r.emoji}</span><span className="n">{rc[r.id]}</span>
                </button>
              );
            })}
            <button
              type="button"
              className={'sd-nchip words' + (reacts.includes(NO_REACTION) ? ' on' : '') + (rc[NO_REACTION] === 0 && !reacts.includes(NO_REACTION) ? ' z' : '')}
              aria-pressed={reacts.includes(NO_REACTION)}
              aria-label={`Words only, no reaction, ${rc[NO_REACTION]}`}
              onClick={() => change(setReacts)(toggleReaction(reacts, NO_REACTION))}
            >
              <span>Words only</span><span className="n">{rc[NO_REACTION]}</span>
            </button>
          </div>

          <div className="sd-ncount">
            <span className="sd-mono">{rows.length.toLocaleString()} of {all.length.toLocaleString()}</span>
            {hasFilters(f) ? <button type="button" className="sd-linkbtn" onClick={clear}>Clear filters</button> : null}
          </div>

          {rows.length === 0 ? (
            <div className="sd-card sd-pad sd-empty">No notes match. Try fewer words or clear the filters.</div>
          ) : (
            <ul className="sd-nlist">
              {visible.map((e) => (
                <li key={e.key}><Item entry={e} onOpen={() => open(e.id)} /></li>
              ))}
            </ul>
          )}
          {rows.length > visible.length ? (
            <button type="button" className="sd-btn" onClick={() => setShown(shown + PAGE_SIZE)}>
              Show {Math.min(PAGE_SIZE, rows.length - visible.length)} more
            </button>
          ) : null}
        </>
      )}
    </div>
  );
}
