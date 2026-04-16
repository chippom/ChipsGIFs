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

  // Build fallback URL (relative path = most bulletproof)
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
      return new Response(object.body, {
        status: 200,
        headers: {
          "Content-Type": "image/gif",
          "Content-Disposition": `attachment; filename="${gif}"`,
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
      return new Response(res.body, {
        status: 200,
        headers: {
          "Content-Type": "image/gif",
          "Content-Disposition": `attachment; filename="${gif}"`,
          "Cache-Control": "public, max-age=31536000"
        }
      });
    }
  } catch (err) {
    console.error("Static fallback error:", err);
  }

  return new Response("GIF not found", { status: 404 });
}
