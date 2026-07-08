// functions/worker.js
// Cloudflare Pages Function for ChipsGIFs
// - Serves GIFs from R2 (tolerant binding lookup)
// - Normalizes wrapper routes (count?gif=..., deliver?File=..., File/file params)
// - Writes responses into the edge cache (caches.default) under a normalized key
// - Prevents recursion with x-skip-worker
// - Fires a background origin counter: tries GET to original wrapper/origin, falls back to POST with credentials
// - Handles GET and HEAD only for asset serving; forwards everything else to origin

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  // tolerant R2 binding: try several common binding names so we don't need to redeploy for a rename
  const R2 = env.R2_BUCKET || env.GIFS_BUCKET || env.MY_BUCKET || env.CHIPS_GIFS_BUCKET || env.GIFS;

  // === Bypass worker for internal background calls ===
  if (request.headers.get('x-skip-worker') === '1') {
    return fetch(request);
  }

  // Only handle GET and HEAD for asset serving; forward everything else
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return fetch(request);
  }

  // Forward true API endpoints without gif/File param
  if (url.pathname.startsWith('/api/') && !url.searchParams.has('gif') && !url.searchParams.has('File') && !url.searchParams.has('file')) {
    return fetch(request);
  }

  // --- Determine asset path (handles ?gif=..., ?File=..., ?file=..., /deliver and /count wrappers) ---
  let assetPath = '';
  const hasGifParam =
    url.searchParams.has('gif') ||
    url.searchParams.has('File') ||
    url.searchParams.has('file');

  if (hasGifParam) {
    const param = url.searchParams.get('gif') || url.searchParams.get('File') || url.searchParams.get('file') || '';
    try {
      // Resolve relative or absolute param to a pathname
      const gifUrl = new URL(param, request.url);
      assetPath = gifUrl.pathname;
    } catch {
      // Fallback: strip fragment if present
      assetPath = (param || '').split('#')[0];
    }
  } else {
    // Try to extract /static/gifs/... from the path if wrapped (e.g., /deliver?File=..., or /count/static/gifs/name.gif)
    const possible = url.pathname.match(/(\/static\/gifs\/.*?\.gif)(?:$|[?#])/i);
    assetPath = possible ? possible[1] : url.pathname;
  }

  // Only handle GIF assets under /static/gifs
  if (!assetPath || !/^\/static\/gifs\/.*?\.gif$/i.test(assetPath)) {
    return fetch(request);
  }

  // Normalize key for R2 (no leading slash)
  const key = assetPath.replace(/^\/+/, '');

  // Normalize cache key to asset path with no query string
  const cacheUrl = new URL(request.url);
  cacheUrl.pathname = assetPath;
  cacheUrl.search = '';
  const cacheKey = new Request(cacheUrl.toString(), { method: 'GET' });

  // Serve from edge cache if present
  try {
    const cached = await caches.default.match(cacheKey);
    if (cached) return cached;
  } catch (e) {
    // If cache lookup fails for any reason, continue to R2/origin fallback
  }

  // Read from R2 and return with cache headers (tolerant binding)
  let object;
  try {
    object = await (R2 && R2.get ? R2.get(key) : null);
  } catch (err) {
    // If R2 binding isn't configured or fails, fall back to origin
    return fetch(request);
  }

  if (!object) {
    // Not found in R2; fall back to origin so wrappers still work
    return fetch(request);
  }

  // Prepare response headers
  const headers = new Headers();
  headers.set('Content-Type', 'image/gif');
  headers.set('Cache-Control', 'public, max-age=86400, immutable');

  // HEAD requests return headers only
  if (request.method === 'HEAD') {
    return new Response(null, { headers });
  }

  // Build response from R2 object (streaming body)
  const response = new Response(object.body, { status: 200, headers });

  // Store at edge under normalized key (fire-and-forget)
  try {
    context.waitUntil(caches.default.put(cacheKey, response.clone()).catch(() => {}));
  } catch (e) {
    // ignore cache put errors
  }

  // Fire background origin counter/tracker.
  context.waitUntil((async () => {
    try {
      const originalWrapperUrl = request.url;

      const getHeaders = new Headers();
      getHeaders.set('x-skip-worker', '1');
      getHeaders.set('Accept', 'text/plain, */*');
      getHeaders.set('Host', url.host);

      const getReq = new Request(originalWrapperUrl, { method: 'GET', headers: getHeaders, redirect: 'follow' });
      const getRes = await fetch(getReq).catch(() => null);

      if (getRes && getRes.status >= 200 && getRes.status < 400) {
        return;
      }

      const postUrl = `https://${url.host}/count`;
      const body = JSON.stringify({ gif: assetPath });
      const postHeaders = new Headers({
        'Content-Type': 'application/json',
        'x-skip-worker': '1',
      });
      postHeaders.set('Host', url.host);

      const postReq = new Request(postUrl, {
        method: 'POST',
        headers: postHeaders,
        body,
        credentials: 'include',
        redirect: 'follow',
      });

      await fetch(postReq).catch(() => null);
    } catch (e) {
      // Swallow any errors from background counting; do not affect the main response
    }
  })());

  return response;
}

// ⭐⭐⭐ FINAL FIX — FALLBACK ROUTING ⭐⭐⭐
// This is the missing line that stops your 4xx errors and activates caching.
export async function onRequestFallback(context) {
  return context.env.ASSETS.fetch(context.request);
}
