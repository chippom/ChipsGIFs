export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  if (url.pathname === "/robots.txt") {
    return new Response(
      "User-agent: *\nAllow: /\nSitemap: https://chips-gifs.com/sitemap.xml\n",
      { headers: { "Content-Type": "text/plain" } }
    );
  }

  const gif =
    url.searchParams.get("file") ||
    url.searchParams.get("gif") ||
    url.searchParams.get("gif_name");

  if (!gif) {
    return new Response("Missing gif parameter", {
      status: 400,
      headers: { "Content-Type": "text/plain; charset=utf-8" }
    });
  }

  const fallbackUrl = new URL(`/static/gifs/${gif}`, request.url).toString();

  const timeout = (ms) =>
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("R2 timeout")), ms)
    );

  try {
    const r2Promise = env.CHIPS_GIFS.get(gif);
    const object = await Promise.race([r2Promise, timeout(15000)]);

    if (object && object.body) {
      return new Response(object.body, {
        status: 200,
        headers: {
          "Content-Type": object.httpMetadata?.contentType || "image/gif",
          "Content-Disposition": `inline; filename="${gif}"`,
          "Cache-Control": "public, max-age=31536000, immutable"
        }
      });
    }
  } catch (err) {
    console.error("R2 fetch or timeout error:", err);
  }

  try {
    const res = await fetch(fallbackUrl);
    if (res.ok) {
      return new Response(res.body, {
        status: 200,
        headers: {
          "Content-Type": res.headers.get("Content-Type") || "image/gif",
          "Content-Disposition": `inline; filename="${gif}"`,
          "Cache-Control": "public, max-age=31536000, immutable"
        }
      });
    }
  } catch (err) {
    console.error("Static fallback error:", err);
  }

  return new Response("GIF not found", {
    status: 404,
    headers: { "Content-Type": "text/plain; charset=utf-8" }
  });
}