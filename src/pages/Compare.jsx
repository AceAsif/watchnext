import React, { useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useStore } from '../store/useStore.js';
import { addShowToWatchlist, addMovieToWatchlist } from '../store/db.js';
import { showDetails, movieDetails, hasKey, img } from '../api/tmdb.js';
import { getCloudUser, subscribeCloudUser } from '../store/cloud.js';
import { Chevron } from '../components/ui.jsx';
import { downloadBlob } from '../components/shareImage.js';
import { fmtDay } from '../components/statsLogic.js';
import { localISODate } from '../components/showLogic.js';
import {
  buildCompareFile, parseCompareFile, compareLibraries, myExtras, fileName,
  loadFriends, saveFriends, addFriend, removeFriend, countLine,
} from '../components/compareLogic.js';

// Compare with a friend (Stats → Friends). See compareLogic.js for the file and the rules.

const storage = () => { try { return window.localStorage; } catch { return null; } };
const PAGE = 40;
const stars = (r) => (r ? `★ ${String(r).replace('.5', '½')}` : '—');

function Row({ it, friend, mode, onOpen, action }) {
  const meta = [it.kind === 'show' ? 'Show' : 'Movie', it.y].filter(Boolean).join(' · ');
  const body = (
    <>
      {it.p ? <img className="art" src={img(it.p, 'w92')} alt="" loading="lazy" /> : <span className="art blank" aria-hidden="true">{(it.n || '?').slice(0, 1)}</span>}
      <span className="body">
        <span className="name">{it.n}</span>
        <span className="meta sd-mono">{meta}</span>
        <span className="rates">
          {mode !== 'you' && <span className={'r' + (it.theirsLoved || mode === 'they' ? ' hot' : '')}>{friend} {it.fav && !it.theirs ? '♥' : stars(it.theirs)}</span>}
          {mode !== 'they' && <span className={'r' + (it.mineLoved || mode === 'you' ? ' hot' : '')}>You {it.fav && !it.mine && mode === 'you' ? '♥' : stars(it.mine)}</span>}
        </span>
      </span>
    </>
  );
  return (
    <li className="sd-cmp-row" data-key={it.key}>
      {onOpen ? <button type="button" className="sd-cmp-main" onClick={onOpen} aria-label={`${it.n}. Open show`}>{body}</button> : <div className="sd-cmp-main">{body}</div>}
      {action}
    </li>
  );
}

export default function Compare({ onBack, openShow }) {
  const state = useStore();
  const user = useSyncExternalStore(subscribeCloudUser, getCloudUser);
  const [data, setData] = useState(() => { const st = storage(); return st ? loadFriends(st) : { me: '', friends: [] }; });
  const [me, setMe] = useState(() => data.me || (user && user.displayName ? user.displayName.split(' ')[0] : ''));
  const [sel, setSel] = useState(() => (data.friends[0] ? data.friends[0].id : null));
  const [tab, setTab] = useState('they');
  const [shown, setShown] = useState(PAGE);
  const [msg, setMsg] = useState(null); // { text, err }
  const [acting, setActing] = useState(null);
  const [askRemove, setAskRemove] = useState(null);
  const [editName, setEditName] = useState(false); // compact view: "Shares as Asif · Change"
  const fileRef = useRef();
  const removeTimer = useRef();

  const save = (next) => { setData(next); const st = storage(); if (st) saveFriends(st, next); };
  const mine = useMemo(() => buildCompareFile(state, me || 'Me'), [state, me]);
  const extras = useMemo(() => myExtras(state), [state]);
  const friend = data.friends.find((f) => f.id === sel) || null;
  const res = useMemo(() => (friend ? compareLibraries(mine, friend, extras) : null), [mine, friend, extras]);
  const showIdByTmdb = useMemo(() => {
    const m = new Map();
    for (const [id, s] of Object.entries(state.shows)) if (s && s.tmdbId) m.set(s.tmdbId, id);
    return m;
  }, [state.shows]);

  async function shareMine() {
    const name = me.trim() || 'A friend';
    save({ ...data, me: me.trim() });
    setEditName(false);
    const file = buildCompareFile(state, name);
    const fname = fileName(name);
    const blob = new Blob([JSON.stringify(file)], { type: 'application/json' });
    try {
      const f = new File([blob], fname, { type: 'application/json' });
      if (navigator.canShare && navigator.canShare({ files: [f] })) {
        await navigator.share({ files: [f], title: 'My WatchNext', text: `${name}'s WatchNext, to compare in Stats → Friends` });
        setMsg({ text: 'Shared. Your friend opens it in WatchNext: Stats → Friends → Open a friend’s file.' });
        return;
      }
    } catch (e) {
      if (e && e.name === 'AbortError') return;
    }
    downloadBlob(blob, fname);
    setMsg({ text: `Saved ${fname}. Send it to your friend (WhatsApp, email…); they open it in Stats → Friends.` });
  }

  function onFile(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = parseCompareFile(String(reader.result || ''));
        const r = addFriend(data, parsed);
        save(r.data);
        setSel(r.id); setTab('they'); setShown(PAGE);
        setMsg({ text: `${r.replaced ? 'Updated' : 'Added'} ${parsed.name}’s file (${countLine(parsed)}).` });
      } catch (err) {
        setMsg({ text: err.message, err: true });
      }
    };
    reader.onerror = () => setMsg({ text: 'Couldn’t read that file.', err: true });
    reader.readAsText(file);
  }

  function remove(f) {
    if (askRemove !== f.id) {
      setAskRemove(f.id);
      clearTimeout(removeTimer.current);
      removeTimer.current = setTimeout(() => setAskRemove(null), 4000);
      return;
    }
    clearTimeout(removeTimer.current);
    setAskRemove(null);
    const next = removeFriend(data, f.id);
    save(next);
    if (sel === f.id) setSel(next.friends[0] ? next.friends[0].id : null);
    setMsg({ text: `Removed ${f.name}’s file from this device.` });
  }

  async function addToWatchlist(it) {
    if (!it.id || acting) return;
    setActing(it.key);
    try {
      if (it.kind === 'show') addShowToWatchlist(await showDetails(it.id));
      else addMovieToWatchlist(await movieDetails(it.id));
      setMsg({ text: `Added “${it.n}” to your watchlist.` });
    } catch (err) {
      setMsg({ text: 'Couldn’t add it: ' + err.message, err: true });
    } finally {
      setActing(null);
    }
  }

  const openFor = (it) => (it.kind === 'show' && it.id && showIdByTmdb.has(it.id) ? () => openShow(showIdByTmdb.get(it.id)) : null);
  const actionFor = (it) => {
    if (it.onWatchlist) return <span className="sd-cmp-tag">On your watchlist</span>;
    if (it.inLibrary && openFor(it)) return <button type="button" className="sd-btn sm" onClick={openFor(it)}>Open</button>;
    if (!it.id || !hasKey()) return null;
    return (
      <button type="button" className="sd-btn sm primary" disabled={!!acting} onClick={() => addToWatchlist(it)} aria-label={`Add ${it.n} to your watchlist`}>
        {acting === it.key ? 'Adding…' : '＋ Watchlist'}
      </button>
    );
  };

  const lists = res ? { they: res.theyLoved, both: res.both, you: res.youLoved } : null;
  const fname = friend ? friend.name : '';
  const TABS = res ? [['they', `${fname} loved`, res.theyLoved.length], ['both', 'Both watched', res.both.length], ['you', 'You loved', res.youLoved.length]] : [];
  const rows = lists ? lists[tab] : [];
  const empty = {
    they: `Nothing new: you've seen everything ${fname} loved. Nice.`,
    both: `You haven't watched any of the same titles yet.`,
    you: `${fname} has seen everything you loved.`,
  };

  return (
    <div className="sd-page sd-cmppage">
      <button className="sd-back" onClick={onBack}><Chevron dir="left" />Back</button>
      <h1 className="sd-title">Compare with a friend</h1>
      <p className="sd-nsub">See what you've both watched, and what they loved that you haven't seen.</p>

      {msg && <p className={'sd-cmp-msg' + (msg.err ? ' err' : '')} role="status" data-testid="cmp-msg">{msg.text}</p>}

      {data.friends.length > 0 && !editName ? (
        <section className="sd-card sd-pad sd-cmp-share compact" aria-label="Share and open files">
          <div className="sd-cmp-shareRow">
            <button type="button" className="sd-btn primary" onClick={shareMine} data-testid="share-mine">Share mine</button>
            <button type="button" className="sd-btn" onClick={() => fileRef.current.click()} data-testid="open-friend">Open a friend's file</button>
          </div>
          <p className="sd-cmp-p" style={{ margin: '10px 0 0' }}>
            Shares as <b>{me.trim() || 'A friend'}</b> ({countLine(mine)}) ·{' '}
            <button type="button" className="sd-linkbtn sd-cmp-change" onClick={() => setEditName(true)}>Change name</button>
          </p>
          <input ref={fileRef} type="file" accept=".json,application/json" onChange={onFile} hidden aria-label="Friend's compare file" />
        </section>
      ) : (
      <section className="sd-card sd-pad sd-cmp-share" aria-label="Share and open files">
        <div className="sd-lbl">1 · Share yours</div>
        <p className="sd-cmp-p">Makes a small file with your titles, ratings, ♥ and what you finished ({countLine(mine)}). No notes, dates or email.</p>
        <div className="sd-cmp-shareRow">
          <label className="sd-cmp-name">
            <span className="sd-lbl">Your name</span>
            <input type="text" value={me} maxLength={40} onChange={(e) => setMe(e.target.value)} placeholder="So your friend knows it's you" aria-label="Your name" />
          </label>
          <button type="button" className="sd-btn primary" onClick={shareMine} data-testid="share-mine">Share mine</button>
        </div>
        <div className="sd-lbl" style={{ marginTop: 16 }}>2 · Open a friend's file</div>
        <p className="sd-cmp-p">Ask a friend to tap “Share mine” on their WatchNext and send you the file. Their file stays on this device only.</p>
        <button type="button" className="sd-btn" onClick={() => fileRef.current.click()} data-testid="open-friend">Open a friend's file</button>
        <input ref={fileRef} type="file" accept=".json,application/json" onChange={onFile} hidden aria-label="Friend's compare file" />
      </section>
      )}

      {data.friends.length > 0 && (
        <div className="sd-cmp-friends" role="group" aria-label="Friends">
          {data.friends.map((f) => (
            <button key={f.id} type="button" className={'sd-nchip words' + (f.id === sel ? ' on' : '')} aria-pressed={f.id === sel} onClick={() => { setSel(f.id); setShown(PAGE); }}>
              {f.name}
            </button>
          ))}
        </div>
      )}

      {friend && res && (
        <>
          <section className="sd-card sd-pad sd-cmp-head" aria-label={`You and ${fname}`}>
            <div className="sd-cmp-match">
              {res.match.pct != null ? (
                <><span className="big" data-testid="match">{res.match.pct}%</span><span className="lab">taste match</span></>
              ) : (
                <span className="lab">Taste match shows once you've both rated {3 - res.match.n > 1 ? `${3 - res.match.n} more` : 'one more'} of the same titles.</span>
              )}
            </div>
            <p className="sd-cmp-p" style={{ margin: 0 }}>
              {res.match.pct != null ? `From ${res.match.n} titles you've both rated. ` : ''}
              {fname}: {countLine(friend)}{friend.at ? ` · file from ${fmtDay(localISODate(new Date(friend.at)))}` : ''}.
            </p>
            <button type="button" className={'sd-linkbtn sd-cmp-remove' + (askRemove === friend.id ? ' danger' : '')} onClick={() => remove(friend)}>
              {askRemove === friend.id ? `Tap again to remove ${fname}` : `Remove ${fname}`}
            </button>
          </section>

          <div className="sd-lstatus sd-cmp-tabs" role="tablist" aria-label="Compare sections">
            {TABS.map(([id, label, n]) => (
              <button key={id} role="tab" aria-selected={tab === id} onClick={() => { setTab(id); setShown(PAGE); }}>
                {label}<span className={'n' + (n === 0 ? ' z' : '')}>{n}</span>
              </button>
            ))}
          </div>

          {rows.length === 0 ? (
            <div className="sd-card sd-pad sd-empty">{empty[tab]}</div>
          ) : (
            <ul className="sd-card sd-cmp-list" data-testid="cmp-list">
              {rows.slice(0, shown).map((it) => (
                <Row key={it.key} it={it} friend={fname} mode={tab} onOpen={tab !== 'they' ? openFor(it) : null} action={tab === 'they' ? actionFor(it) : null} />
              ))}
            </ul>
          )}
          {rows.length > shown && (
            <button type="button" className="sd-btn" onClick={() => setShown((s) => s + PAGE)}>Show more ({rows.length - shown} left)</button>
          )}
        </>
      )}
    </div>
  );
}
