import React, { useSyncExternalStore } from 'react';

// "No internet connection" notice. WatchNext keeps working offline (everything is saved on this
// device and syncs later), so the notice says exactly that instead of just alarming. It is driven
// by the browser's online/offline events; browsers report "offline" reliably, so a false alarm is
// rare, and it disappears by itself the moment the connection returns.
function subscribe(cb) {
  window.addEventListener('online', cb);
  window.addEventListener('offline', cb);
  return () => { window.removeEventListener('online', cb); window.removeEventListener('offline', cb); };
}
const snapshot = () => (typeof navigator === 'undefined' || navigator.onLine !== false);

export default function OfflineBanner() {
  const online = useSyncExternalStore(subscribe, snapshot, () => true);
  if (online) return null;
  return (
    <div className="sd-offline" role="status" data-testid="offline-banner">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M2 8.8a15 15 0 0 1 4-2.5M22 8.8a15 15 0 0 0-8.5-3.7M5 12.9a10 10 0 0 1 3-1.8M19 12.9a10 10 0 0 0-4.3-2.4M8.5 16.4a5 5 0 0 1 7 0M12 20h.01M2 2l20 20" />
      </svg>
      <span>No internet connection. Your changes are saved on this device and will sync when you’re back online.</span>
    </div>
  );
}
