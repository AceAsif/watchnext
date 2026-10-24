// Home-screen / taskbar shortcuts (pure logic, unit-tested in plain node).
// The web manifest lists shortcuts that open the app at "./?go=<target>".
// Long-press the icon on Android, right-click it on Windows/Mac (installed app).
// iPhone/iPad don't support manifest shortcuts (Apple), so nothing shows there.

export const LAUNCH_TARGETS = ['next', 'search', 'tonight'];

// "?go=search&x=1" → 'search'. Anything unknown → null (open the app as normal).
export function launchTarget(search) {
  if (typeof search !== 'string' || !search) return null;
  let go;
  try { go = new URLSearchParams(search).get('go'); } catch { return null; }
  if (!go) return null;
  go = go.trim().toLowerCase();
  return LAUNCH_TARGETS.includes(go) ? go : null;
}

// The same URL without "go", so a reload or a bookmark doesn't re-open the shortcut.
// Keeps any other query parts and the #hash. Returns null when nothing needs changing.
export function cleanLaunchUrl(href) {
  let u;
  try { u = new URL(href); } catch { return null; }
  if (!u.searchParams.has('go')) return null;
  u.searchParams.delete('go');
  const q = u.searchParams.toString();
  return u.pathname + (q ? '?' + q : '') + u.hash;
}
