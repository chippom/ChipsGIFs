export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  // Example: /static/gifs/peace-sign.gif → "peace-sign.gif"
  const key = url.pathname.replace("/static/gifs/", "");

  const object = await env.R2_BUCKET.get(key);

  if (!object) {
    return new Response("GIF not found", { status: 404 });
  }

  return new Response(object.body, {
    headers: {
      "Content-Type": "image/gif",
      "Cache-Control": "public, max-age=31536000, immutable"
    }
  });
}
