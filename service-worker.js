const CACHE_NAME = "chips-gifs-cache-v4";
const MAX_ITEMS = 200;

async function trimCache(cacheName, maxItems) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();

  if (keys.length > maxItems) {
    await cache.delete(keys[0]);
    return trimCache(cacheName, maxItems);
  }
}

// Simple timeout wrapper to avoid hanging fetches
function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms);
    promise.then(
      res => {
        clearTimeout(timer);
        resolve(res);
      },
      err => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      )
    )
  );
});

self.addEventListener("fetch", event => {
  const request = event.request;

  if (
    request.method === "GET" &&
    request.destination === "image" &&
    request.url.endsWith(".gif") &&
    request.url.startsWith(self.location.origin)
  ) {
    event.respondWith(handleGifRequest(request));
  }
});

async function handleGifRequest(request) {
  const cache = await caches.open(CACHE_NAME);

  // Serve from cache if present
  const cached = await cache.match(request);
  if (cached) return cached;

  // Try network with timeout; if it fails, fall back to direct fetch
  try {
    const response = await withTimeout(
      fetch(request, { cache: "no-store" }),
      7000
    );

    // If we got a bad response, just return it without caching
    if (!response || !response.ok) {
      return response;
    }

    // Cache successful responses only
    cache.put(request, response.clone());
    trimCache(CACHE_NAME, MAX_ITEMS);
    return response;
  } catch (err) {
    // If the SW path fails (timeout, network error, etc.), bypass cache logic
    return fetch(request, { cache: "no-store" });
  }
}
