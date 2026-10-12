import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { getCloudSyncing, subscribeCloudSyncing } from '../store/cloud.js';

// True while this device is still downloading your library from the cloud (first sign-in, or a
// fresh start), but only once that has taken a moment, so a quick routine sync never flashes a
// notice. Until the download finishes, movies, goals and notes can be missing, which would
// otherwise look like lost data.
export function useLibrarySyncing(delayMs = 800) {
  const raw = useSyncExternalStore(subscribeCloudSyncing, getCloudSyncing, () => false);
  const [late, setLate] = useState(false);
  useEffect(() => {
    if (!raw) { setLate(false); return undefined; }
    const t = setTimeout(() => setLate(true), delayMs);
    return () => clearTimeout(t);
  }, [raw, delayMs]);
  return raw && late;
}

export default function SyncingNote() {
  if (!useLibrarySyncing()) return null;
  return (
    <div className="sd-syncnote" role="status" data-testid="syncing-note">
      <span className="sd-syncnote-dot" aria-hidden="true" />
      <span>Syncing your library… movies, goals and totals may be incomplete for a moment.</span>
    </div>
  );
}
