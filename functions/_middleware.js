export async function onRequest(context) {
  const url = new URL(context.request.url);
  let pathname = url.pathname;
  const originalPathname = pathname;

  // Remove encoded CR/LF junk from malformed URLs.
  pathname = pathname.replace(/%25?0D%25?0A/gi, "");

  // Collapse repeated /gifs/ path sections.
  pathname = pathname.replace(/(\/gifs)+\//g, "/gifs/");

  // Normalize the old index URL to the canonical homepage.
  if (pathname === "/index" || pathname === "/index/") {
    pathname = "/";
  }

  // Encode literal spaces in URL paths.
  pathname = pathname.replace(/ /g, "%20");

  // Redirect old or guessed root-level GIF URLs to the current delivery route.
  // Examples:
  // /washington_trump_dollar_1.gif → /api/deliver?file=washington_trump_dollar_1.gif
  // /fuck_ice_globe.gif → /api/deliver?file=fuck_ice_globe.gif
  const rootGifMatch = pathname.match(/^\/([^/]+\.gif)$/i);

  if (rootGifMatch) {
    const gifName = rootGifMatch[1];

    const redirectUrl = new URL("/api/deliver", url.origin);
    redirectUrl.searchParams.set("file", gifName);

    return Response.redirect(redirectUrl.toString(), 301);
  }

  // Continue routing using any normalized pathname.
  if (pathname !== originalPathname) {
    url.pathname = pathname;
    return context.next(new Request(url, context.request));
  }

  return context.next();
}