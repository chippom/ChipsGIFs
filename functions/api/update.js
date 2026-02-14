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

    // First, check if the row exists
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
