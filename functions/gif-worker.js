export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  // Never cache API or counter endpoints; forward them to origin
  if (url.pathname.startsWith('/api/') || url.pathname.includes('/count')) {
    return fetch(request);
  }

  // Only cache GET requests
  if (request.method !== 'GET') {
    return fetch(request);
  }

  // Example: /static/gifs/peace-sign.gif?count=123 -> "peace-sign.gif"
  const key = url.pathname.replace('/static/gifs/', '');

  // Build a cache key that strips query string so different ?count values map to same cache entry
  const cacheUrl = new URL(request.url);
  cacheUrl.search = '';
  const cacheKey = new Request(cacheUrl.toString(), { method: 'GET' });

  // Try edge cache first
  const cached = await caches.default.match(cacheKey);
  if (cached) return cached;

  // Not cached: fetch from R2
  const object = await env.R2_BUCKET.get(key);
  if (!object) {
    return new Response('GIF not found', { status: 404 });
  }

  const headers = new Headers();
  headers.set('Content-Type', 'image/gif');
  headers.set('Cache-Control', 'public, max-age=86400, immutable');

  const response = new Response(object.body, { headers });

  // Store under the query-less cache key so future requests with different ?count still hit edge
  context.waitUntil(caches.default.put(cacheKey, response.clone()));

  return response;
}
