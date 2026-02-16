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

    // Get IP address for dedupe
    const ip = request.headers.get("CF-Connecting-IP") || "unknown";

    // 1. Check recent_downloads for duplicate within 10 seconds
    const tenSecondsAgo = new Date(Date.now() - 10000).toISOString();

    const recentCheck = await fetch(
      `${supabaseUrl}/rest/v1/recent_downloads?gif_name=eq.${gifName}&ip_address=eq.${ip}&timestamp=gt.${tenSecondsAgo}`,
      {
        method: "GET",
        headers: {
          "apikey": supabaseKey,
          "Authorization": `Bearer ${supabaseKey}`,
          "Content-Type": "application/json"
        }
      }
    );

    const recentRows = await recentCheck.json();

    if (recentRows.length > 0) {
      // Duplicate request within 10 seconds — return current count without incrementing
      const existing = await fetch(
        `${supabaseUrl}/rest/v1/downloads?gif_name=eq.${gifName}`,
        {
          method: "GET",
          headers: {
            "apikey": supabaseKey,
            "Authorization": `Bearer ${supabaseKey}`,
            "Content-Type": "application/json"
          }
        }
      );

      const existingData = await existing.json();
      const count = existingData.length > 0 ? existingData[0].count : 0;

      return new Response(JSON.stringify({ count }), {
        headers: { "Content-Type": "application/json" }
      });
    }

    // 2. Log this download in recent_downloads
    await fetch(`${supabaseUrl}/rest/v1/recent_downloads`, {
      method: "POST",
      headers: {
        "apikey": supabaseKey,
        "Authorization": `Bearer ${supabaseKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        gif_name: gifName,
        ip_address: ip
      })
    });

    // 3. Continue with your existing logic (increment count)
    const selectResponse = await fetch(
      `${supabaseUrl}/rest/v1/downloads?gif_name=eq.${gifName}`,
      {
        method: "GET",
        headers: {
          "apikey": supabaseKey,
          "Authorization": `Bearer ${supabaseKey}`,
          "Content-Type": "application/json",
          "Prefer": "return=representation"
        }
      }
    );

    if (!selectResponse.ok) {
      return new Response(
        JSON.stringify({ error: "Supabase select failed" }),
        { status: 500 }
      );
    }

    const rows = await selectResponse.json();
    let updateResponse;

    if (rows.length === 0) {
      // Insert new row with count = 1
      updateResponse = await fetch(`${supabaseUrl}/rest/v1/downloads`, {
        method: "POST",
        headers: {
          "apikey": supabaseKey,
          "Authorization": `Bearer ${supabaseKey}`,
          "Content-Type": "application/json",
          "Prefer": "return=representation"
        },
        body: JSON.stringify({
          gif_name: gifName,
          count: 1
        })
      });
    } else {
      // Update existing row: count = count + 1
      const currentCount = rows[0].count;

      updateResponse = await fetch(
        `${supabaseUrl}/rest/v1/downloads?gif_name=eq.${gifName}`,
        {
          method: "PATCH",
          headers: {
            "apikey": supabaseKey,
            "Authorization": `Bearer ${supabaseKey}`,
            "Content-Type": "application/json",
            "Prefer": "return=representation"
          },
          body: JSON.stringify({
            count: currentCount + 1
          })
        }
      );
    }

    if (!updateResponse.ok) {
      return new Response(
        JSON.stringify({ error: "Supabase update failed" }),
        { status: 500 }
      );
    }

    const updated = await updateResponse.json();

    return new Response(JSON.stringify(updated[0]), {
      headers: { "Content-Type": "application/json" }
    });

  } catch (err) {
    return new Response(
      JSON.stringify({ error: "Server error", details: err.message }),
      { status: 500 }
    );
  }
}
