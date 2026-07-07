export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  if (request.method !== 'GET') return fetch(request);

  // Forward true API endpoints without gif param
  if (url.pathname.startsWith('/api/') && !url.searchParams.has('gif')) {
    return fetch(request);
  }

  // Extract asset path from ?gif=... or use pathname
  let assetPath;
  const hasGifParam = url.searchParams.has('gif');
  if (hasGifParam) {
    try {
      const gifUrl = new URL(url.searchParams.get('gif'), request.url);
      assetPath = gifUrl.pathname;
    } catch {
      assetPath = url.searchParams.get('gif');
    }
  } else {
    assetPath = url.pathname;
  }

  // Only handle GIF assets under /static/gifs
  if (!assetPath || !assetPath.startsWith('/static/gifs/')) {
    return fetch(request);
  }

  // If wrapper used, fire the original /count request to origin in background
  if (hasGifParam) {
    context.waitUntil(fetch(request.clone()).catch(() => {}));
  }

  const key = assetPath.replace(/^\/+/, '');

  // Normalize cache key to asset path with no query string
  const cacheUrl = new URL(request.url);
  cacheUrl.pathname = assetPath;
  cacheUrl.search = '';
  const cacheKey = new Request(cacheUrl.toString(), { method: 'GET' });

  // Serve from edge cache if present
  const cached = await caches.default.match(cacheKey);
  if (cached) return cached;

  // Read from R2 and return with cache headers
  const object = await env.R2_BUCKET.get(key);
  if (!object) return new Response('GIF not found', { status: 404 });

  const headers = new Headers();
  headers.set('Content-Type', 'image/gif');
  headers.set('Cache-Control', 'public, max-age=86400, immutable');
  // Optional debug header while verifying: remove after success
  // headers.set('X-Served-From', 'edge-cache');

  const response = new Response(object.body, { headers });

  // Store at edge under normalized key
  context.waitUntil(caches.default.put(cacheKey, response.clone()));

  return response;
}
