export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  // Serve IndexNow key
  if (url.pathname === "/indexnow-key.txt") {
    return new Response(env.INDEXNOW_KEY, {
      headers: { "Content-Type": "text/plain" }
    });
  }

  // Manual ping trigger
  if (url.pathname === "/ping-indexnow") {
    const body = {
      host: "chips-gifs.com",
      key: env.INDEXNOW_KEY,
      keyLocation: "https://chips-gifs.com/indexnow-key.txt",
      urlList: [
        "https://chips-gifs.com/",
        "https://chips-gifs.com/page_2",
        "https://chips-gifs.com/page_3",
        "https://chips-gifs.com/page_4",
        "https://chips-gifs.com/bible_verses"
      ]
    };

    await fetch("https://api.indexnow.org/indexnow", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });

    return new Response("IndexNow ping sent.");
  }

  return new Response("OK");
}
