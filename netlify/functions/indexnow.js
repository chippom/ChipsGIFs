// netlify/functions/indexnow.js

export default async (req, context) => {
  const urlsToSubmit = [
    "https://chips-gifs.com/",
    "https://chips-gifs.com/page_2",
    "https://chips-gifs.com/page_3",
    "https://chips-gifs.com/page_4"
  ];

  const INDEXNOW_KEY = "c17865d32a424741b06fd08418c88bcb";
  const INDEXNOW_ENDPOINT = "https://www.bing.com/indexnow";

  const results = [];

  for (const url of urlsToSubmit) {
    const submitUrl = `${INDEXNOW_ENDPOINT}?url=${encodeURIComponent(url)}&key=${INDEXNOW_KEY}`;
    try {
      const response = await fetch(submitUrl);
      results.push({
        url,
        status: response.status,
        ok: response.ok
      });
    } catch (error) {
      results.push({
        url,
        error: error.message
      });
    }
  }

  return new Response(JSON.stringify(results, null, 2), {
    headers: { "content-type": "application/json" },
    status: 200
  });
};
