// ---- SIMPLE IN-MEMORY PER-PAGE CACHE ----
// Structure:
// {
//   "page1": Map(gifName -> ResponseBody),
//   "page2": Map(...),
//   "page3": Map(...),
//   "page4": Map(...)
// }
const PAGE_CACHES = {};
const MAX_CACHE_PER_PAGE = 200;

// Extract page ID from the GIF name.
// Example: "page3_001.gif" → "page3"
function getPageId(gifName) {
  const match = gifName.match(/(page\d+)_/i);
  return match ? match[1].toLowerCase() : "default";
}

// Ensure a cache bucket exists for this page
function getPageCache(pageId) {
  if (!PAGE_CACHES[pageId]) {
    PAGE_CACHES[pageId] = new Map();
  }
  return PAGE_CACHES[pageId];
}

// Insert into per-page LRU cache
function cacheSet(pageId, key, value) {
  const bucket = getPageCache(pageId);

  // If exists, delete so we can reinsert as newest
  if (bucket.has(key)) {
    bucket.delete(key);
  }

  // Evict oldest if full
  if (bucket.size >= MAX_CACHE_PER_PAGE) {
    const oldestKey = bucket.keys().next().value;
    bucket.delete(oldestKey);
  }

  bucket.set(key, value);
}

// Retrieve from per-page cache
function cacheGet(pageId, key) {
  const bucket = getPageCache(pageId);
  if (!bucket.has(key)) return null;

  // LRU bump: move to newest
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

  ///// ROBOTS.TXT HANDLER — START /////
  if (url.pathname === "/robots.txt") {
    return new Response(
      "User-agent: *\nAllow: /\nSitemap: https://chips-gifs.com/sitemap.xml\n",
      { headers: { "Content-Type": "text/plain" } }
    );
  }
  ///// ROBOTS.TXT HANDLER — END /////

  // Accept file= OR gif= OR gif_name=
  const gif = url.searchParams.get("file") 
           || url.searchParams.get("gif") 
           || url.searchParams.get("gif_name");

  if (!gif) {
    return new Response("Missing gif parameter", { status: 400 });
  }

  // Determine page bucket
  const pageId = getPageId(gif);

  // Try per-page cache first
  const cached = cacheGet(pageId, gif);
  if (cached) {
    return new Response(cached, {
      status: 200,
      headers: {
        "Content-Type": "image/gif",
        "Cache-Control": "public, max-age=31536000"
      }
    });
  }

  // Build fallback URL
  const fallbackUrl = new URL(`/static/gifs/${gif}`, request.url).toString();

  // --- 5 SECOND TIMEOUT WRAPPER ---
  const timeout = (ms) =>
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("R2 timeout")), ms)
    );

  // --- Try R2 with 5-second race timeout ---
  try {
    const r2Promise = env.CHIPS_GIFS.get(gif);
    const object = await Promise.race([r2Promise, timeout(5000)]);

    if (object) {
      const body = await object.arrayBuffer();

      // Store in per-page cache
      cacheSet(pageId, gif, body);

      return new Response(body, {
        status: 200,
        headers: {
          "Content-Type": "image/gif",
          "Cache-Control": "public, max-age=31536000"
        }
      });
    }
  } catch (err) {
    console.error("R2 fetch or timeout error:", err);
  }

  // --- Fallback to static/gifs ---
  try {
    const res = await fetch(fallbackUrl);

    if (res.ok) {
      const body = await res.arrayBuffer();

      // Store fallback in per-page cache too
      cacheSet(pageId, gif, body);

      return new Response(body, {
        status: 200,
        headers: {
          "Content-Type": "image/gif",
          "Cache-Control": "public, max-age=31536000"
        }
      });
    }
  } catch (err) {
    console.error("Static fallback error:", err);
  }

  return new Response("GIF not found", { status: 404 });
}
