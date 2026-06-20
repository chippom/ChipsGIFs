export async function onRequest(context) {
  const url = new URL(context.request.url);
  let pathname = url.pathname;
  const originalPathname = pathname;

  pathname = pathname.replace(/%0D%0A/gi, "");
  pathname = pathname.replace(/(\/gifs)+\//g, "/gifs/");

  if (pathname === "/index" || pathname === "/index/") {
    pathname = "/";
  }

  pathname = pathname.replace(/ /g, "%20");

  if (pathname !== originalPathname) {
    url.pathname = pathname;
    return context.next(new Request(url, context.request));
  }

  return context.next();
}