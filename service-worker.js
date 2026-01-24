/* ---------------------------------------------------------
   GIF-ONLY SERVICE WORKER
   - Caches ONLY GIF files
   - NEVER caches HTML, JS, CSS
   - Prevents layout/nav bar from getting stuck
   - Boosts performance by caching heavy GIF assets
--------------------------------------------------------- */

const CACHE_NAME = "chips-gifs-cache-v1";

self.addEventListener("install", event => {
  // Activate immediately
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  // Clean old caches if names change
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", event => {
  const request = event.request;

  // Only cache GIFs
  if (request.destination === "image" && request.url.endsWith(".gif")) {
    event.respondWith(
      caches.open(CACHE_NAME).then(cache =>
        cache.match(request).then(cached => {
          if (cached) return cached;

          return fetch(request).then(response => {
            cache.put(request, response.clone());
            return response;
          });
        })
      )
    );
    return;
  }

  // Everything else: network only
  return;
});
