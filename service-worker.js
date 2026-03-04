const CACHE_NAME = "chips-gifs-cache-v3";
const MAX_ITEMS = 200;

async function trimCache(cacheName, maxItems) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();

  if (keys.length > maxItems) {
    await cache.delete(keys[0]);
    return trimCache(cacheName, maxItems);
  }
}

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      )
    )
  );
});

self.addEventListener("fetch", event => {
  const request = event.request;

  if (
    request.destination === "image" &&
    request.url.endsWith(".gif") &&
    request.url.startsWith(self.location.origin)
  ) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async cache => {
        const cached = await cache.match(request);
        if (cached) return cached;

        const response = await fetch(request);
        cache.put(request, response.clone());
        trimCache(CACHE_NAME, MAX_ITEMS);
        return response;
      })
    );
  }
});
