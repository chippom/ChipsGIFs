export async function onRequest(context) {
  try {
    const { request, env } = context;

    const url = new URL(request.url);
    const gifName = url.searchParams.get("gif");

    if (!gifName) {
      return new Response(
        JSON.stringify({ error: "Missing gif parameter" }),
        { status: 400 }
      );
    }

    // Cloudflare automatically provides the visitor IP
    const ip =
      request.headers.get("CF-Connecting-IP") ||
      request.headers.get("x-forwarded-for") ||
      "unknown";

    // Cloudflare also provides country automatically
    const country = request.cf?.country || "unknown";

    const supabaseUrl = env.SUPABASE_URL;
    const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY;

    const logEntry = {
      gif_name: gifName,
      ip_address: ip,
      country: country,
      timestamp: new Date().toISOString()
    };

    const response = await fetch(`${supabaseUrl}/rest/v1/visitor_logs`, {
      method: "POST",
      headers: {
        "apikey": supabaseKey,
        "Authorization": `Bearer ${supabaseKey}`,
        "Content-Type": "application/json",
        "Prefer": "return=representation"
      },
      body: JSON.stringify(logEntry)
    });

    if (!response.ok) {
      return new Response(
        JSON.stringify({ error: "Supabase insert failed" }),
        { status: 500 }
      );
    }

    const data = await response.json();

    return new Response(JSON.stringify(data[0]), {
      headers: { "Content-Type": "application/json" }
    });

  } catch (err) {
    return new Response(
      JSON.stringify({ error: "Server error", details: err.message }),
      { status: 500 }
    );
  }
}
