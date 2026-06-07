// ---- SIMPLE IN-MEMORY PER-PAGE CACHE ----
const PAGE_CACHES = {};
const MAX_CACHE_PER_PAGE = 200;

function getPageId(gifName) {
  const match = gifName.match(/(page\d+)_/i);
  return match ? match[1].toLowerCase() : "default";
}

function getPageCache(pageId) {
  if (!PAGE_CACHES[pageId]) {
    PAGE_CACHES[pageId] = new Map();
  }
  return PAGE_CACHES[pageId];
}

function cacheSet(pageId, key, value) {
  const bucket = getPageCache(pageId);

  if (bucket.has(key)) bucket.delete(key);

  if (bucket.size >= MAX_CACHE_PER_PAGE) {
    const oldestKey = bucket.keys().next().value;
    bucket.delete(oldestKey);
  }

  bucket.set(key, value);
}

function cacheGet(pageId, key) {
  const bucket = getPageCache(pageId);
  if (!bucket.has(key)) return null;

  const value = bucket.get(key);
  bucket.delete(key);
  bucket.set(key, value);

  return value;
}

// ------------------------------------------------------------
// MAIN WORKER HANDLER
// ------------------------------------------------------------
export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  if (url.pathname === "/robots.txt") {
    return new Response(
      "User-agent: *\nAllow: /\nSitemap: https://chips-gifs.com/sitemap.xml\n",
      { headers: { "Content-Type": "text/plain" } }
    );
  }

  const gif = url.searchParams.get("file") 
           || url.searchParams.get("gif") 
           || url.searchParams.get("gif_name");

  if (!gif) {
    return new Response("Missing gif parameter", { status: 400 });
  }

  const pageId = getPageId(gif);

  // ---- CACHE HIT ----
  const cached = cacheGet(pageId, gif);
  if (cached) {
    return new Response(cached, {
      status: 200,
      headers: {
        "Content-Type": "image/gif",
        "Cache-Control": "public, max-age=31536000"
      },
      cf: { cacheEverything: true, cacheTtl: 31536000 }
    });
  }

  const fallbackUrl = new URL(`/static/gifs/${gif}`, request.url).toString();

  const timeout = (ms) =>
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("R2 timeout")), ms)
    );

  // ---- TRY R2 ----
  try {
    const r2Promise = env.CHIPS_GIFS.get(gif);
    const object = await Promise.race([r2Promise, timeout(5000)]);

    if (object) {
      const body = await object.arrayBuffer();
      cacheSet(pageId, gif, body);

      return new Response(body, {
        status: 200,
        headers: {
          "Content-Type": "image/gif",
          "Cache-Control": "public, max-age=31536000"
        },
        cf: { cacheEverything: true, cacheTtl: 31536000 }
      });
    }
  } catch (err) {
    console.error("R2 fetch or timeout error:", err);
  }

  // ---- STATIC FALLBACK ----
  try {
    const res = await fetch(fallbackUrl);

    if (res.ok) {
      const body = await res.arrayBuffer();
      cacheSet(pageId, gif, body);

      return new Response(body, {
        status: 200,
        headers: {
          "Content-Type": "image/gif",
          "Cache-Control": "public, max-age=31536000"
        },
        cf: { cacheEverything: true, cacheTtl: 31536000 }
      });
    }
  } catch (err) {
    console.error("Static fallback error:", err);
  }

  return new Response("GIF not found", { status: 404 });
}
