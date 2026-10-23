import React, { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useStore } from '../store/useStore.js';
import { getCloudSyncing, subscribeCloudSyncing } from '../store/cloud.js';
import { useOriginsCache } from '../store/originsCache.js';
import { useCollectionsCache } from '../store/collectionsCache.js';
import { buildCollections } from './collectionsLogic.js';
import { computeMetrics, buildBadges } from './achievementsLogic.js';
import { loadSeen, saveSeen, libraryEmpty, checkBadges, mergeUps, noteText } from './badgeNoteLogic.js';
import { localISODate } from './showLogic.js';
import BadgeIcon from './BadgeIcon.jsx';

// "New badge!" — a note at the top of the screen when a badge reaches a new level.
// Works out the badges from what's already on this device (no TMDB lookups of its own), a
// moment after the library stops changing, and never while the library is still syncing.
const WAIT_MS = 1500;   // let a burst of changes (Mark season, an import) settle first
const SHOW_MS = 12000;  // the note goes away by itself after this

const storage = () => { try { return window.localStorage; } catch (e) { return null; } };

export default function BadgeNote({ onOpen }) {
  const state = useStore();
  const syncing = useSyncExternalStore(subscribeCloudSyncing, getCloudSyncing, () => false);
  const origins = useOriginsCache();
  const collCache = useCollectionsCache();
  const [ups, setUps] = useState([]);
  const hideTimer = useRef(null);

  const badges = useMemo(() => {
    const collections = buildCollections(state.movies, collCache, localISODate());
    return buildBadges(computeMetrics(state, { origins, collections }));
  }, [state, origins, collCache]);

  useEffect(() => {
    if (syncing) return undefined;
    const t = setTimeout(() => {
      const store = storage();
      if (!store) return;
      const r = checkBadges(loadSeen(store), badges, libraryEmpty(state));
      if (r.seen) saveSeen(store, r.seen);
      if (r.ups.length) {
        setUps((cur) => mergeUps(cur, r.ups));
        clearTimeout(hideTimer.current);
        hideTimer.current = setTimeout(() => setUps([]), SHOW_MS);
      }
    }, WAIT_MS);
    return () => clearTimeout(t);
  }, [badges, syncing]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => clearTimeout(hideTimer.current), []);

  const text = noteText(ups);
  if (!text) return null;
  const top = ups[0];
  const close = () => { clearTimeout(hideTimer.current); setUps([]); };
  return (
    <div className={`bn ach-l${top.level}`} role="status" data-testid="badge-note">
      <span className="bn-icon"><BadgeIcon id={top.id} level={top.level} size={44} /></span>
      <span className="bn-text">
        <b className="bn-head">{text.head}</b>
        <span className="bn-line">{text.line.split(', ').map((x, i) => <React.Fragment key={x}>{i ? ', ' : ''}<span className="bn-name">{x}</span></React.Fragment>)}</span>
        {text.sub ? <span className="bn-sub">{text.sub}</span> : null}
        <button className="bn-see" onClick={() => { close(); onOpen(); }}>See badges ›</button>
      </span>
      <button className="sd-ib bn-x" onClick={close} aria-label="Close">✕</button>
    </div>
  );
}
