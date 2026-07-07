export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  // Example: /static/gifs/peace-sign.gif → "peace-sign.gif"
  const key = url.pathname.replace("/static/gifs/", "");

  const object = await env.R2_BUCKET.get(key);

  if (!object) {
    return new Response("GIF not found", { status: 404 });
  }

  const headers = new Headers();
  headers.set('Content-Type', 'image/gif');
  headers.set('Cache-Control', 'public, max-age=86400, immutable');

  const response = new Response(object.body, { headers });
  context.waitUntil(caches.default.put(request, response.clone()));
  return response;
}
