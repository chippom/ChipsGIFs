export async function onRequest(context) {
  const url = new URL(context.request.url);
  let pathname = url.pathname;

  // 1. Remove CRLF garbage (%0D%0A)
  pathname = pathname.replace(/%0D%0A/gi, "");

  // 2. Normalize repeated /gifs/gifs/gifs/... → /gifs/
  if (pathname.includes("/gifs/")) {
    pathname = pathname.replace(/(\/gifs)+\//g, "/gifs/");
  }

  // 3. Normalize /index → /
  if (pathname === "/index" || pathname === "/index/") {
    pathname = "/";
  }

  // 4. Return 410 for dead GIFs (Yandex loves this)
  if (pathname.endsWith(".gif")) {
    // Build the real asset path
    const assetPath = `./public${pathname}`;

    try {
      // Try to fetch the asset from Cloudflare Pages
      const asset = await context.env.ASSETS.fetch(
        new Request(new URL(pathname, context.request.url))
      );

      // If asset exists, serve it normally
      if (asset.status !== 404) {
        return asset;
      }

      // If asset does NOT exist → return 410 Gone
      return new Response("Gone", { status: 410 });
    } catch (err) {
      // If something weird happens, still return 410
      return new Response("Gone", { status: 410 });
    }
  }

  // 5. If we modified the pathname, rewrite the request
  if (pathname !== url.pathname) {
    url.pathname = pathname;
    return fetch(url.toString(), context.request);
  }

  // 6. Default: continue normally
  return context.next();
}
