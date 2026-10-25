// Background problems that the app already handles (a TMDB lookup that failed during a bulk
// refresh — the run just carries on with the next title). Shown while developing
// (`npm run dev`), silent on the live site so the browser console stays clean.
export function devWarn(...args) {
  if (import.meta.env && import.meta.env.DEV) console.debug('[WatchNext]', ...args);
}
