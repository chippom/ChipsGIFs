export async function onRequest() {
  return new Response(
    "User-agent: *\nAllow: /\nSitemap: https://chips-gifs.com/sitemap.xml\n",
    { headers: { "Content-Type": "text/plain" } }
  );
}
