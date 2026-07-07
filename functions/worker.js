export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  // === Bypass worker for internal background calls ===
  if (request.headers.get('x-skip-worker') === '1') {
    return fetch(request);
  }

  // Only handle GET and HEAD for asset serving; forward everything else
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return fetch(request);
  }

  // Forward true API endpoints without gif param
  if (url.pathname.startsWith('/api/') && !url.searchParams.has('gif')) {
    return fetch(request);
  }

  // Determine asset path (from ?gif=... or direct path)
  let assetPath;
  const hasGifParam = url.searchParams.has('gif');
  if (hasGifParam) {
    try {
      const gifUrl = new URL(url.searchParams.get('gif'), request.url);
      assetPath = gifUrl.pathname;
    } catch {
      assetPath = url.searchParams.get('gif') || '';
    }
  } else {
    assetPath = url.pathname;
  }

  // Only handle GIF assets under /static/gifs
  if (!assetPath || !assetPath.startsWith('/static/gifs/')) {
    return fetch(request);
  }

  // Fire the original wrapper to origin in background but avoid re-entering this Worker
  if (hasGifParam) {
    const bgHeaders = new Headers(request.headers);
    bgHeaders.set('x-skip-worker', '1');
    // Preserve Host for origin routing
    bgHeaders.set('Host', url.host);
    const bgReq = new Request(request.url, { method: 'GET', headers: bgHeaders });
    context.waitUntil(fetch(bgReq).catch(() => {}));
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

  // HEAD requests return headers only
  if (request.method === 'HEAD') {
    return new Response(null, { headers });
  }

  const response = new Response(object.body, { headers });

  // Store at edge under normalized key (fire-and-forget)
  context.waitUntil(caches.default.put(cacheKey, response.clone()));

  return response;
}
