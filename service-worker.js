/* ---------------------------------------------------------
   GIF-ONLY SERVICE WORKER (CLEAN + STABLE)
   - Caches ONLY GIF files
   - NEVER caches HTML, JS, CSS
   - No forced activation
   - No forced client takeover
--------------------------------------------------------- */

const CACHE_NAME = "chips-gifs-cache-v1";

self.addEventListener("install", event => {
  // No skipWaiting — allow clean updates
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
  // No clients.claim — allow clean unregister
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
