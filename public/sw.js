const CACHE = 'watchnext-v2';

self.addEventListener('install', (e) => {
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Network-first for the app shell (HTML/JS/CSS) so a new deploy is always
// picked up on next load. Cache-first only for images (posters etc.), which
// never change once fetched, so serving stale ones has no downside.
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (url.hostname === 'api.themoviedb.org') return; // always fresh

  const isImage = url.hostname === 'image.tmdb.org';
  const isOwnOrigin = url.origin === self.location.origin;
  if (!isImage && !isOwnOrigin) return;

  if (isImage) {
    // Cache-first: images are immutable once fetched.
    e.respondWith(
      caches.match(e.request).then(
        (hit) =>
          hit ||
          fetch(e.request).then((res) => {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(e.request, copy));
            return res;
          })
      )
    );
  } else {
    // Network-first: always try to get the latest app code. Fall back to
    // cache only if the network is unavailable (offline use).
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
          return res;
        })
        .catch(() => caches.match(e.request))
    );
  }
});
