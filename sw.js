// BUILD is replaced with the commit SHA by the deploy workflow (see
// .github/workflows/deploy.yml). Because the value changes on every deploy,
// this file's bytes change too, so the browser installs a fresh service
// worker each release — which skips waiting, claims clients and purges the
// old app cache. Result: new code loads on the next visit with no manual
// cache clearing. Left as the literal placeholder for local `npm run deploy`.
const BUILD = 'ae68f74d8378b3e3020b31ac75adf10d8b08cdaa';
const APP_CACHE = 'watchnext-app-' + BUILD;
const IMG_CACHE = 'watchnext-img'; // stable across deploys — posters never change

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (e) => {
  e.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k !== APP_CACHE && k !== IMG_CACHE)
          .map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET') return;
  if (url.hostname === 'api.themoviedb.org') return; // API responses always fresh

  const isImage = url.hostname === 'image.tmdb.org';
  const isOwnOrigin = url.origin === self.location.origin;
  if (!isImage && !isOwnOrigin) return;

  if (isImage) {
    // Cache-first: posters are immutable once fetched, kept in a cache that
    // survives deploys so they aren't re-downloaded on every release.
    e.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            const copy = res.clone();
            caches.open(IMG_CACHE).then((c) => c.put(req, copy));
            return res;
          })
      )
    );
    return;
  }

  // App shell (HTML/JS/CSS): network-first with cache:'no-store' so the
  // browser's HTTP cache can never mask a fresh deploy. Falls back to the
  // cached copy only when offline.
  e.respondWith(
    fetch(req, { cache: 'no-store' })
      .then((res) => {
        const copy = res.clone();
        caches.open(APP_CACHE).then((c) => c.put(req, copy));
        return res;
      })
      .catch(() => caches.match(req))
  );
});
