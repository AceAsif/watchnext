// Pure logic for the Settings page (Claude Design, Direction A). No React and no
// store imports, so it can be unit-tested with plain node.

// ---------------------------------------------------------------- TMDB key
// 'empty'   – nothing saved and nothing typed
// 'saved'   – what's in the box is exactly what's saved
// 'unsaved' – the box differs from what's saved (typed, edited or cleared)
export function keyStatus(savedKey, typed) {
  const saved = (savedKey || '').trim();
  const now = (typed || '').trim();
  if (!saved && !now) return 'empty';
  return saved && saved === now ? 'saved' : 'unsaved';
}

// ---------------------------------------------------------------- backup
// A backup is the whole app state MINUS the TMDB API key. The key is a personal
// credential; a backup file gets copied around (email, cloud drives, other
// devices), so it must never travel inside it. Everything else is kept, and
// the original state object is not modified.
export function backupState(state) {
  const copy = { ...state };
  if (copy.settings) {
    const { tmdbKey, ...rest } = copy.settings; // eslint-disable-line no-unused-vars
    copy.settings = rest;
  }
  return copy;
}

export function backupFileName(isoDate) {
  return `watchnext-backup-${isoDate}.json`;
}

// ---------------------------------------------------------------- import
const n = (count, one, many) => `${count.toLocaleString()} ${count === 1 ? one : many}`;

// The banner shown after a successful import. `res` is importTvTime's result.
export function importResultText(res) {
  return (
    `Imported ${n(res.shows, 'show', 'shows')} and ${n(res.watches, 'new episode watch', 'new episode watches')}. ` +
    'Now add a TMDB key (if you haven’t) and open Tools on the Shows tab to sync with TMDB.'
  );
}

// The banner after "Restore from backup". `sum` is restoreBackup's summary.
export function restoreResultText(sum) {
  const parts = [];
  if (sum.showsAdded) parts.push(`${n(sum.showsAdded, 'show', 'shows')} added`);
  if (sum.showsUpdated) parts.push(`${n(sum.showsUpdated, 'show', 'shows')} updated`);
  if (sum.watchesAdded) parts.push(`${n(sum.watchesAdded, 'episode watch', 'episode watches')} restored`);
  if (sum.moviesAdded) parts.push(`${n(sum.moviesAdded, 'movie', 'movies')} added`);
  if (!parts.length && !sum.skipped) return 'Nothing to restore — this device already has everything in that file.';
  if (sum.skipped) parts.push(`${n(sum.skipped, 'unreadable entry', 'unreadable entries')} skipped`);
  return `Restored from backup: ${parts.join(', ')}.`;
}

// ---------------------------------------------------------------- clean up
// Shows sitting in the data but in neither the library nor the watchlist —
// leftovers from unfollowing or old imports (unfollow only hides; it never
// deletes). Same rule the page always used, sorted by name.
export function orphanShows(shows) {
  return Object.entries(shows)
    .filter(([, sh]) => !sh.followed && !sh.watchlist)
    .sort((a, b) => (a[1].name || '').localeCompare(b[1].name || ''));
}
export const orphanMeta = (seen) => (seen ? `${seen.toLocaleString()} watched` : 'no history');

export function orphanIntro(count) {
  return (
    `${count === 1 ? 'This show is' : `These ${count} shows are`} in your data but not in your library or ` +
    'watchlist — usually leftovers from unfollowing or old test imports. Deleting one removes it for ' +
    'good, including from the cloud and your other devices.'
  );
}

// What deleting ONE leftover show does, as bullet lines for the confirm dialog.
export function deleteShowEffects(seen) {
  const lines = ['Removed from this device', 'Also removed from the cloud and your other signed-in devices'];
  if (seen) lines.unshift(`Its ${n(seen, 'watched episode', 'watched episodes')} ${seen === 1 ? 'is' : 'are'} deleted too`);
  return lines;
}

// ---------------------------------------------------------------- delete everything
// "Delete all data" clears THIS DEVICE only (resetAll). It does not touch the
// cloud, so when signed in the cloud copy can sync back down. The wording must
// say so plainly — a real "wipe everywhere" is a separate, future feature.
export function deleteAllIntro(signedIn) {
  const base = 'Removes every show, movie, rating and watched episode from this device. Download a backup first.';
  return signedIn
    ? `${base} You’re signed in, so your cloud copy is NOT deleted and may sync back to this device.`
    : base;
}
export function deleteAllEffects(signedIn) {
  const lines = [
    'Every show, movie, rating and watched episode is removed from this browser',
    'Your TMDB key on this device is removed',
  ];
  if (signedIn) lines.push('Your cloud copy is not deleted — it may sync back down');
  return lines;
}
