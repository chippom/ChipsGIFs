export async function onRequest(context) {
  try {
    const { request, env } = context;

    const url = new URL(request.url);
    const gifName = url.searchParams.get("gif");

    // Keep the existing no-error behavior for a missing GIF name.
    if (!gifName) {
      return new Response(JSON.stringify({ count: 0 }), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store"
        }
      });
    }

    const supabaseUrl = env.SUPABASE_URL;
    const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY;

    // The shared scripts.js file now sends visitor_id with every /api/update request.
    const body = await request.json().catch(() => ({}));
    const visitorId =
      typeof body.visitor_id === "string" ? body.visitor_id : "";

    // OWNER_VISITOR_ID is the encrypted Cloudflare secret you just added.
    const isOwnerTesting =
      Boolean(env.OWNER_VISITOR_ID) &&
      visitorId === env.OWNER_VISITOR_ID;

    // Do not count your own testing activity.
    // This skips both recent_downloads and the downloads count update.
    if (isOwnerTesting) {
      const existing = await fetch(
        `${supabaseUrl}/rest/v1/downloads?gif_name=eq.${encodeURIComponent(gifName)}&select=count`,
        {
          method: "GET",
          headers: {
            apikey: supabaseKey,
            Authorization: `Bearer ${supabaseKey}`,
            "Content-Type": "application/json"
          }
        }
      );

      if (!existing.ok) {
        return new Response(
          JSON.stringify({ error: "Supabase select failed" }),
          {
            status: 500,
            headers: {
              "Content-Type": "application/json",
              "Cache-Control": "no-store"
            }
          }
        );
      }

      const existingData = await existing.json();
      const count =
        existingData.length > 0 &&
        typeof existingData[0].count === "number"
          ? existingData[0].count
          : 0;

      return new Response(JSON.stringify({ count }), {
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store"
        }
      });
    }

    // Get IP address for the existing 10-second duplicate protection.
    const ip = request.headers.get("CF-Connecting-IP") || "unknown";
    const tenSecondsAgo = new Date(Date.now() - 10000).toISOString();

    // 1. Check recent_downloads for a duplicate GIF/IP request within 10 seconds.
    const recentCheck = await fetch(
      `${supabaseUrl}/rest/v1/recent_downloads?gif_name=eq.${encodeURIComponent(gifName)}&ip_address=eq.${encodeURIComponent(ip)}&timestamp=gt.${encodeURIComponent(tenSecondsAgo)}`,
      {
        method: "GET",
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
          "Content-Type": "application/json"
        }
      }
    );

    if (!recentCheck.ok) {
      return new Response(
        JSON.stringify({ error: "Supabase duplicate check failed" }),
        {
          status: 500,
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-store"
          }
        }
      );
    }

    const recentRows = await recentCheck.json();

    if (recentRows.length > 0) {
      // Duplicate request within 10 seconds: return current count without incrementing.
      const existing = await fetch(
        `${supabaseUrl}/rest/v1/downloads?gif_name=eq.${encodeURIComponent(gifName)}&select=count`,
        {
          method: "GET",
          headers: {
            apikey: supabaseKey,
            Authorization: `Bearer ${supabaseKey}`,
            "Content-Type": "application/json"
          }
        }
      );

      if (!existing.ok) {
        return new Response(
          JSON.stringify({ error: "Supabase select failed" }),
          {
            status: 500,
            headers: {
              "Content-Type": "application/json",
              "Cache-Control": "no-store"
            }
          }
        );
      }

      const existingData = await existing.json();
      const count =
        existingData.length > 0 &&
        typeof existingData[0].count === "number"
          ? existingData[0].count
          : 0;

      return new Response(JSON.stringify({ count }), {
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store"
        }
      });
    }

    // 2. Log this real visitor download in recent_downloads.
    const recentInsert = await fetch(
      `${supabaseUrl}/rest/v1/recent_downloads`,
      {
        method: "POST",
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          gif_name: gifName,
          ip_address: ip
        })
      }
    );

    if (!recentInsert.ok) {
      return new Response(
        JSON.stringify({ error: "Supabase recent download insert failed" }),
        {
          status: 500,
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-store"
          }
        }
      );
    }

    // 3. Get the current download count for this GIF.
    const selectResponse = await fetch(
      `${supabaseUrl}/rest/v1/downloads?gif_name=eq.${encodeURIComponent(gifName)}&select=gif_name,count`,
      {
        method: "GET",
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
          "Content-Type": "application/json",
          Prefer: "return=representation"
        }
      }
    );

    if (!selectResponse.ok) {
      return new Response(
        JSON.stringify({ error: "Supabase select failed" }),
        {
          status: 500,
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-store"
          }
        }
      );
    }

    const rows = await selectResponse.json();
    let updateResponse;

    if (rows.length === 0) {
      // First real visitor download for this GIF.
      updateResponse = await fetch(`${supabaseUrl}/rest/v1/downloads`, {
        method: "POST",
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
          "Content-Type": "application/json",
          Prefer: "return=representation"
        },
        body: JSON.stringify({
          gif_name: gifName,
          count: 1
        })
      });
    } else {
      // Existing GIF: increment the current count.
      const currentCount =
        typeof rows[0].count === "number" ? rows[0].count : 0;

      updateResponse = await fetch(
        `${supabaseUrl}/rest/v1/downloads?gif_name=eq.${encodeURIComponent(gifName)}`,
        {
          method: "PATCH",
          headers: {
            apikey: supabaseKey,
            Authorization: `Bearer ${supabaseKey}`,
            "Content-Type": "application/json",
            Prefer: "return=representation"
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
        {
          status: 500,
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-store"
          }
        }
      );
    }

    const updated = await updateResponse.json();

    return new Response(JSON.stringify(updated[0]), {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store"
      }
    });
  } catch (err) {
    return new Response(
      JSON.stringify({
        error: "Server error",
        details: err instanceof Error ? err.message : String(err)
      }),
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