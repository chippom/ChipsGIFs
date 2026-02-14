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

    const supabaseUrl = env.SUPABASE_URL;
    const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY;

    const response = await fetch(`${supabaseUrl}/rest/v1/downloads?gif_name=eq.${gifName}`, {
      method: "GET",
      headers: {
        "apikey": supabaseKey,
        "Authorization": `Bearer ${supabaseKey}`,
        "Content-Type": "application/json",
        "Prefer": "return=representation"
      }
    });

    if (!response.ok) {
      return new Response(
        JSON.stringify({ error: "Supabase query failed" }),
        { status: 500 }
      );
    }

    const data = await response.json();

    const count = data.length > 0 ? data[0].count : 0;

    return new Response(JSON.stringify({ count }), {
      headers: { "Content-Type": "application/json" }
    });

  } catch (err) {
    return new Response(
      JSON.stringify({ error: "Server error", details: err.message }),
      { status: 500 }
    );
  }
}
