// Keyboard shortcuts for computers (pure logic, unit-tested in plain node).
//   /      open Search (or jump back into the search box)
//   1–6    switch tabs: Up Next, Shows, Movies, Watchlist, Stats, Settings
//   Esc    go back from Search, a show page or Notes
//   ?      show the list of shortcuts
// Phones have no hardware keyboard, so nothing here changes on an iPhone.

export const TAB_KEYS = ['next', 'shows', 'movies', 'watchlist', 'stats', 'settings'];

export const SHORTCUT_LIST = [
  { keys: ['/'], label: 'Search' },
  { keys: ['1'], label: 'Up Next' },
  { keys: ['2'], label: 'Shows' },
  { keys: ['3'], label: 'Movies' },
  { keys: ['4'], label: 'Watchlist' },
  { keys: ['5'], label: 'Stats' },
  { keys: ['6'], label: 'Settings' },
  { keys: ['Esc'], label: 'Go back' },
  { keys: ['?'], label: 'Show this list' },
];

const TEXT_INPUT_TYPES = new Set([
  '', 'text', 'search', 'email', 'url', 'tel', 'password', 'number',
  'date', 'datetime-local', 'month', 'week', 'time',
]);

// True when the key press is going into something you type in.
export function isTypingTarget(t) {
  if (!t) return false;
  if (t.isContentEditable) return true;
  const tag = String(t.tagName || '').toUpperCase();
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag === 'INPUT') return TEXT_INPUT_TYPES.has(String(t.type || '').toLowerCase());
  return false;
}

/**
 * Decide what a key press should do.
 * e:   { key, ctrlKey, metaKey, altKey, repeat, isComposing, target }
 * ctx: { modalOpen, back }  modalOpen = a sheet/dialog is up; back = Search, show page or Notes is open
 * Returns null (do nothing) or one of:
 *   { type: 'search' } · { type: 'tab', id } · { type: 'back' } · { type: 'help' }
 */
export function shortcutFor(e, ctx = {}) {
  if (!e || typeof e.key !== 'string') return null;
  if (e.ctrlKey || e.metaKey || e.altKey) return null;
  if (e.isComposing || e.key === 'Process' || e.key === 'Unidentified') return null;
  if (ctx.modalOpen) return null; // the sheet handles its own keys (Esc closes it)

  const typing = isTypingTarget(e.target);

  if (e.key === 'Escape') {
    if (!ctx.back) return null;
    // In a text box with something typed, Esc should just clear it (browser default).
    if (typing && e.target.value) return null;
    return { type: 'back' };
  }

  if (typing || e.repeat) return null;

  if (e.key === '/') return { type: 'search' };
  if (e.key === '?') return { type: 'help' };
  if (/^[1-6]$/.test(e.key)) return { type: 'tab', id: TAB_KEYS[Number(e.key) - 1] };
  return null;
}
