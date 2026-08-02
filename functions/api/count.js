export async function onRequest(context) {
  try {
    const { request, env } = context;
    const url = new URL(request.url);
    const gifName = url.searchParams.get("gif");

    if (!gifName) {
      return new Response(JSON.stringify({ error: "Missing gif parameter" }), {
        status: 400,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "public, max-age=60"
        }
      });
    }

    const supabaseUrl = env.SUPABASE_URL;
    const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY;

    const response = await fetch(
      `${supabaseUrl}/rest/v1/downloads?gif_name=eq.${encodeURIComponent(gifName)}&select=id`,
      {
        method: "GET",
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
          Prefer: "count=exact"
        }
      }
    );

    if (!response.ok) {
      return new Response(JSON.stringify({ count: 0 }), {
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "public, max-age=60"
        }
      });
    }

    const contentRange = response.headers.get("content-range");
    const count = contentRange ? parseInt(contentRange.split("/")[1], 10) : 0;

    return new Response(JSON.stringify({ count: Number.isNaN(count) ? 0 : count }), {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=60"
      }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "Server error", details: err.message }), {
      status: 500,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=60"
      }
    });
  }
}