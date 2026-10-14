// PURE (timers are passed in): decides when a Discover card has really been SEEN.
// A card counts once it has stayed on screen (at least SEEN_RATIO visible) for SEEN_MS, so a
// row loaded off-screen, or a card flicked past in a fast scroll, is not counted as suggested.
// Seen keys are handed over in small batches (BATCH_MS) so a scroll writes the log once, not
// once per card. Discover.jsx drives it from an IntersectionObserver.

export const SEEN_RATIO = 0.6;
export const SEEN_MS = 1000;
export const BATCH_MS = 1200;

// onSeen(keys[]) is called with each batch. isPageVisible() lets a hidden tab hold off: a card
// "on screen" in a background tab isn't being looked at, so its timer waits for the tab to return.
export function createSeenTracker({ onSeen, setTimer = setTimeout, clearTimer = clearTimeout, isPageVisible = () => true, seenMs = SEEN_MS, batchMs = BATCH_MS } = {}) {
  const timers = new Map(); // key -> pending dwell timer
  const done = new Set(); // already reported this session
  let batch = [];
  let batchTimer = null;

  function flush() {
    batchTimer = null;
    if (!batch.length) return;
    const keys = batch;
    batch = [];
    try { onSeen(keys); } catch (e) { /* the log is best effort */ }
  }
  function arm(key) {
    timers.set(key, setTimer(() => {
      timers.delete(key);
      if (done.has(key)) return;
      if (!isPageVisible()) { arm(key); return; } // wait until the tab is in front again
      done.add(key);
      batch.push(key);
      if (!batchTimer) batchTimer = setTimer(flush, batchMs);
    }, seenMs));
  }

  return {
    // An observer report: the card is (or is no longer) at least SEEN_RATIO on screen.
    visible(key, isVisible) {
      if (!key || done.has(key)) return;
      if (isVisible) { if (!timers.has(key)) arm(key); return; }
      if (timers.has(key)) { clearTimer(timers.get(key)); timers.delete(key); }
    },
    // Seen for certain (opened its details, or added it): counts straight away.
    seenNow(key) {
      if (!key || done.has(key)) return;
      if (timers.has(key)) { clearTimer(timers.get(key)); timers.delete(key); }
      done.add(key);
      batch.push(key);
      flush();
    },
    // Unmount: report what's already counted, drop the rest.
    stop() {
      timers.forEach((t) => clearTimer(t));
      timers.clear();
      if (batchTimer) { clearTimer(batchTimer); }
      flush();
    },
    hasSeen: (key) => done.has(key),
  };
}
