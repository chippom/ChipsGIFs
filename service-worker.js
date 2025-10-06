// service-worker.js

const CACHE_NAME = 'chips-gifs-cache-v6'; // Increment version for cache updates

// Files to always cache and network-first serve (app shell)
const ESSENTIAL_FILES = [
  '/',
  '/index.html',
  '/manifest.json',
  '/styles.css',
  '/scripts.js',
  // Add any other critical assets like icons, fonts here:
  '/icons/apple-touch-icon.png',
];

// On install, cache essential files
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ESSENTIAL_FILES))
  );
  self.skipWaiting();
});

// On activate, clean up old caches if any
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// Fetch handler: cache-first for GIFs, network-first for essential files, cache-first fallback otherwise
self.addEventListener('fetch', event => {
  const requestUrl = new URL(event.request.url);

  // Cache-first for GIF files (serve from cache, else fetch and cache)
  if (requestUrl.pathname.endsWith('.gif')) {
    event.respondWith(
      caches.open(CACHE_NAME).then(cache =>
        cache.match(event.request).then(cachedResponse => {
          if (cachedResponse) {
            return cachedResponse;
          } 
          return fetch(event.request).then(networkResponse => {
            const responseClone = networkResponse.clone();
            cache.put(event.request, responseClone);
            return networkResponse;
          });
        })
      )
    );
    return;
  }

  // Network-first for essential app shell files (HTML, CSS, JS, manifest)
  if (
    ESSENTIAL_FILES.includes(requestUrl.pathname) ||
    requestUrl.pathname === '/' ||
    requestUrl.pathname.endsWith('.html') ||
    requestUrl.pathname.endsWith('.css') ||
    requestUrl.pathname.endsWith('.js') ||
    requestUrl.pathname.endsWith('.json')
  ) {
    event.respondWith(
      fetch(event.request)
        .then(networkResponse => {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseClone);
          });
          return networkResponse;
        })
        .catch(() =>
          caches.match(event.request).then(cachedResponse => {
            if (cachedResponse) return cachedResponse;
            // You can serve a custom offline fallback page here if desired
            return caches.match('/index.html');
          })
        )
    );
    return;
  }

  // Default: try cache first, then network fallback
  event.respondWith(
    caches.match(event.request).then(cachedResponse => {
      return cachedResponse || fetch(event.request);
    })
  );
});