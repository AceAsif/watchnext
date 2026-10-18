import React, { useEffect, useRef, useState } from 'react';
import { Bar } from './ui.jsx';
import { Poster } from './LibraryUI.jsx';
import { ProgressCard, LibEmpty, ResBtn, FilmIcon, CheckIcon } from './LibraryBar.jsx';
import { progressLabel, nextLabel, listSummary, COLLECTIONS_PREVIEW } from './collectionsLogic.js';

// "19 Mar 2026" from 'YYYY-MM-DD'. Built by hand (not toLocaleDateString) so it reads the
// same on every phone and browser, and is never shifted by time zone.
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const fmtDay = (d) => {
  const [y, m, day] = (d || '').split('-').map(Number);
  if (!y || !m || !day || m > 12) return d || '';
  return `${day} ${MONTHS[m - 1]} ${y}`;
};

// One film inside an opened collection.
function PartRow({ part, index, onOpen }) {
  const watched = part.state === 'watched';
  const label =
    part.state === 'watched' ? 'Watched' : part.state === 'planned' ? 'On watchlist' : part.state === 'upcoming' ? (part.date ? `Out ${fmtDay(part.date)}` : 'Coming') : '';
  const body = (
    <>
      <span className="sd-coll-num" aria-hidden="true">{watched ? <CheckIcon size={13} sw={2.6} /> : index + 1}</span>
      <span className="sd-coll-pt">
        <span className="t">{part.title}</span>
        {part.year ? <span className="y">{part.year}</span> : null}
      </span>
      {label ? <span className={'sd-coll-st ' + part.state}>{label}</span> : null}
    </>
  );
  return (
    <li data-testid="coll-part" data-state={part.state} className={watched ? 'is-watched' : undefined}>
      {watched && onOpen ? (
        <button type="button" className="sd-coll-prow" onClick={() => onOpen(part.id)} aria-label={`${part.title}, watched. Open`}>{body}</button>
      ) : (
        <div className="sd-coll-prow">{body}</div>
      )}
    </li>
  );
}

export function CollectionCard({ coll, open, onToggle, onOpenMovie, onAddNext, busy }) {
  const pct = coll.released ? (coll.watched / coll.released) * 100 : 0;
  const next = coll.next;
  return (
    <div className="sd-card sd-coll" data-testid="coll-card" data-id={coll.id}>
      <div className="sd-coll-head">
        <Poster path={coll.poster} name={coll.name} width={52} height={78} />
        <div className="sd-coll-info">
          <span className="sd-coll-name">{coll.name}</span>
          <span className="sd-coll-prog">
            <b>{progressLabel(coll)}</b>
            {coll.complete ? <span className="sd-coll-done"><CheckIcon size={12} sw={2.6} /> Finished</span> : null}
          </span>
          <Bar value={pct} color={coll.complete ? 'var(--teal)' : 'var(--amber)'} height={6} />
          <span className="sd-coll-next" data-testid="coll-next">{nextLabel(coll, fmtDay)}</span>
        </div>
      </div>
      <div className="sd-coll-acts">
        {next && next.state === 'todo' ? (
          <ResBtn kind="primary" disabled={busy} onClick={() => onAddNext(next)}>
            {busy ? 'Adding…' : 'Add next to watchlist'}
          </ResBtn>
        ) : next && next.state === 'planned' ? (
          <ResBtn kind="wide" disabled>Next is on your watchlist</ResBtn>
        ) : <span />}
        <button type="button" className="sd-btn sm" aria-expanded={open} onClick={onToggle}>
          {open ? 'Hide films' : `Show ${coll.parts.length} films`}
        </button>
      </div>
      {open ? (
        <ol className="sd-coll-parts">
          {coll.parts.map((p, i) => <PartRow key={p.id} part={p} index={i} onOpen={onOpenMovie} />)}
        </ol>
      ) : null}
    </div>
  );
}

// The Movies page's "Collections" view.
//   info:        the result of useCollections()
//   focus:       { id } a collection to open and scroll to (from a movie sheet's "See all films");
//                a new object each time, so asking for the same collection twice still scrolls
//   onOpenMovie: (tmdbId) => open that watched film's sheet
//   onAddNext:   async (part) => add that film to the watchlist
export default function CollectionsView({ info, focus, onOpenMovie, onAddNext }) {
  const focusId = focus ? focus.id : null;
  const { collections, checking, done, total, failed, noKey, unlinked, retry } = info;
  const [openIds, setOpenIds] = useState(() => new Set(focusId ? [focusId] : []));
  const [all, setAll] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [msg, setMsg] = useState(null);
  const listRef = useRef(null);

  useEffect(() => {
    if (!focusId) return;
    setOpenIds((s) => new Set(s).add(focusId));
    const i = collections.findIndex((c) => c.id === focusId);
    if (i >= COLLECTIONS_PREVIEW) setAll(true);
    const t = setTimeout(() => {
      const el = listRef.current && listRef.current.querySelector(`[data-id="${focusId}"]`);
      if (el && el.scrollIntoView) el.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }, 60);
    return () => clearTimeout(t);
  }, [focus]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (id) => setOpenIds((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const addNext = async (coll, part) => {
    setBusyId(coll.id);
    setMsg(null);
    try {
      await onAddNext(part);
      setMsg({ ok: true, text: `Added “${part.title}” to your watchlist` });
    } catch (e) {
      setMsg({ ok: false, text: `Couldn't add “${part.title}”: ${e.message}` });
    } finally {
      setBusyId(null);
    }
  };

  const shown = all ? collections : collections.slice(0, COLLECTIONS_PREVIEW);
  return (
    <div className="sd-colls" ref={listRef}>
      {checking ? <ProgressCard text="Finding your collections" tag={`${done}/${total}`} done={done} total={total} /> : null}
      {noKey ? (
        <p className="sd-sub sd-coll-note">Collections need a TMDB key. Add one in Settings.</p>
      ) : null}
      {!checking && failed > 0 ? (
        <p className="sd-sub sd-coll-note" role="status">
          {failed} lookup{failed === 1 ? '' : 's'} failed (offline or TMDB busy).{' '}
          <button type="button" className="sd-lclear" onClick={retry}>Retry</button>
        </p>
      ) : null}
      {msg ? <p className={'sd-sub sd-coll-note' + (msg.ok ? ' ok' : ' err')} role="status">{msg.text}</p> : null}

      {collections.length > 0 ? (
        <>
          <p className="sd-sub sd-coll-sum" data-testid="coll-summary">{listSummary(collections)}</p>
          {shown.map((c) => (
            <CollectionCard
              key={c.id}
              coll={c}
              open={openIds.has(c.id)}
              onToggle={() => toggle(c.id)}
              onOpenMovie={onOpenMovie}
              onAddNext={(p) => addNext(c, p)}
              busy={busyId === c.id}
            />
          ))}
          {collections.length > COLLECTIONS_PREVIEW ? (
            <button type="button" className="sd-btn sd-coll-more" onClick={() => setAll((x) => !x)}>
              {all ? 'Show fewer' : `Show all ${collections.length}`}
            </button>
          ) : null}
        </>
      ) : !checking && !noKey ? (
        <LibEmpty icon={<FilmIcon size={28} />} title="No collections yet">
          When you watch a film from a series (like Harry Potter or John Wick), it shows here with how many you've seen and what comes next.
        </LibEmpty>
      ) : null}

      {unlinked > 0 ? (
        <p className="sd-sub sd-coll-note" data-testid="coll-unlinked">
          {unlinked} watched movie{unlinked === 1 ? " isn't" : "s aren't"} linked to TMDB, so {unlinked === 1 ? 'it' : 'they'} can't be placed in a collection. Open {unlinked === 1 ? 'it' : 'one'} and use Fix match to link it.
        </p>
      ) : null}
    </div>
  );
}
