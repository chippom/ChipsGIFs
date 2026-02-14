export async function onRequest(context) {
  try {
    const { request, env } = context;

    const url = new URL(request.url);
    const gifName = url.searchParams.get("gif");

    if (!gifName) {
      return new Response(JSON.stringify({ error: "Missing gif parameter" }), {
        status: 400
      });
    }

    const supabaseUrl = env.SUPABASE_URL;
    const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY;

    const body = await request.json().catch(() => ({}));

    const visitorid = body.visitor_id || "unknown";
    const useragent = body.userAgent || "unknown";
    const page = body.page || "unknown";
    const referrer = body.referrer || "unknown";

    const city = request.cf?.city || "unknown";
    const region = request.cf?.region || "unknown";
    const country = request.cf?.country || "unknown";

    const location = `${city}, ${region}`;

    const logEntry = {
      visitorid,
      useragent,
      page,
      referrer,
      timestamp: new Date().toISOString(),
      gif_name: gifName,
      location,
      country
    };

    const response = await fetch(`${supabaseUrl}/rest/v1/visitor_logs`, {
      method: "POST",
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        "Content-Type": "application/json",
        Prefer: "return=representation"
      },
      body: JSON.stringify(logEntry)
    });

    if (!response.ok) {
      const errText = await response.text();
      return new Response(
        JSON.stringify({ error: "Supabase insert failed", details: errText }),
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
