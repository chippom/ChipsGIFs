export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  if (url.pathname === "/robots.txt") {
    return new Response(
      "User-agent: *\nAllow: /\nSitemap: https://chips-gifs.com/sitemap.xml\n",
      {
        headers: {
          "Content-Type": "text/plain"
        }
      }
    );
  }

  const gif =
    url.searchParams.get("file") ||
    url.searchParams.get("gif") ||
    url.searchParams.get("gif_name");

  if (!gif) {
    return new Response("Missing gif parameter", {
      status: 400,
      headers: {
        "Content-Type": "text/plain; charset=utf-8"
      }
    });
  }

  const fallbackUrl = new URL(
    `/static/gifs/${gif}`,
    request.url
  ).toString();

  // Only cache ordinary GET requests.
  const canCache =
    request.method === "GET" &&
    !request.headers.has("Range") &&
    !request.headers.has("Authorization");

  let cache = null;
  let cacheKey = null;

  if (canCache) {
    try {
      cache = caches.default;

      // Use one cache entry per GIF, regardless of parameter alias.
      const cacheUrl = new URL(request.url);
      cacheUrl.search = "";
      cacheUrl.searchParams.set("file", gif);

      cacheKey = new Request(cacheUrl.toString(), {
        method: "GET"
      });

      const cachedResponse = await cache.match(cacheKey);

      if (cachedResponse) {
        const response = new Response(
          cachedResponse.body,
          cachedResponse
        );

        response.headers.set("X-GIF-Cache", "HIT");
        return response;
      }
    } catch (err) {
      console.error("GIF cache lookup error:", err);
      cache = null;
      cacheKey = null;
    }
  }

  function returnGif(body, contentType) {
    const response = new Response(body, {
      status: 200,
      headers: {
        "Content-Type": contentType || "image/gif",
        "Content-Disposition": `inline; filename="${gif}"`,
        "Cache-Control": "public, max-age=31536000, immutable"
      }
    });

    if (cache && cacheKey) {
      try {
        context.waitUntil(
          cache.put(cacheKey, response.clone()).catch((err) => {
            console.error("GIF cache storage error:", err);
          })
        );

        response.headers.set("X-GIF-Cache", "MISS");
      } catch (err) {
        console.error("GIF cache storage setup error:", err);
        response.headers.set("X-GIF-Cache", "ERROR");
      }
    } else {
      response.headers.set(
        "X-GIF-Cache",
        canCache ? "ERROR" : "BYPASS"
      );
    }

    return response;
  }

  let timeoutId;

  try {
    const r2Promise = env.CHIPS_GIFS.get(gif);

    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error("R2 timeout"));
      }, 15000);
    });

    const object = await Promise.race([
      r2Promise,
      timeoutPromise
    ]);

    if (object && object.body) {
      return returnGif(
        object.body,
        object.httpMetadata?.contentType || "image/gif"
      );
    }
  } catch (err) {
    console.error("R2 fetch or timeout error:", err);
  } finally {
    clearTimeout(timeoutId);
  }

  try {
    const res = await fetch(fallbackUrl);

    if (res.ok) {
      return returnGif(
        res.body,
        res.headers.get("Content-Type") || "image/gif"
      );
    }
  } catch (err) {
    console.error("Static fallback error:", err);
  }

  return new Response("GIF not found", {
    status: 404,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}