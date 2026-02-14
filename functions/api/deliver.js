export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const gif = url.searchParams.get("gif");

  if (!gif) {
    return new Response("Missing gif parameter", { status: 400 });
  }

  // 1) Try R2 bucket first
  try {
    const object = await env.CHIPS_GIFS.get(gif);

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
    console.error("R2 fetch error:", err);
  }

  // 2) Fallback to static/gifs folder
  try {
    const staticUrl = new URL(`/static/gifs/${gif}`, request.url).toString();
    const res = await fetch(staticUrl);

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
