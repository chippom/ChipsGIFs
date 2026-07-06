export async function onRequest() {
  return new Response(
    "User-agent: *\nAllow: /\nSitemap: https://chips-gifs.com/sitemap.xml\n\nUser-agent: Yandex\nDisallow: /*.gif$\n",
    { headers: { "Content-Type": "text/plain" } }
  );
}
