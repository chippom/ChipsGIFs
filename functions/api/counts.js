export async function onRequestPost(context) {
  try {
    const { request, env } = context;
    const body = await request.json();
    const gifs = Array.isArray(body?.gifs) ? body.gifs : [];

    const uniqueGifs = [
      ...new Set(
        gifs
          .filter(gif => typeof gif === "string" && gif.length > 0)
          .slice(0, 250)
      )
    ];

    if (uniqueGifs.length === 0) {
      return new Response(
        JSON.stringify({ error: "Missing gifs array" }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-store"
          }
        }
      );
    }

    const supabaseUrl = env.SUPABASE_URL;
    const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY;

    const inValues = uniqueGifs
      .map(gif => `"${gif.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`)
      .join(",");

    const endpoint = new URL("/rest/v1/downloads", supabaseUrl);
    endpoint.searchParams.set("select", "gif_name,count");
    endpoint.searchParams.set("gif_name", `in.(${inValues})`);

    const response = await fetch(endpoint.toString(), {
      method: "GET",
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`
      }
    });

    if (!response.ok) {
      return new Response(
        JSON.stringify({ counts: {} }),
        {
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-store"
          }
        }
      );
    }

    const rows = await response.json();

    const counts = Object.fromEntries(
      uniqueGifs.map(gif => [gif, 0])
    );

    for (const row of rows) {
      if (row?.gif_name && typeof row.count === "number") {
        counts[row.gif_name] = row.count;
      }
    }

    return new Response(
      JSON.stringify({ counts }),
      {
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store"
        }
      }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "Server error" }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store"
        }
      }
    );
  }
}