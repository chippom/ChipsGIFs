export async function onRequest(context) {
  try {
    const { request, env } = context;

    // Reject GET and other methods before contacting Supabase.
    if (request.method !== "POST") {
      return new Response(
        JSON.stringify({ error: "Method not allowed" }),
        {
          status: 405,
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-store",
            Allow: "POST"
          }
        }
      );
    }

    const url = new URL(request.url);
    const gifName = url.searchParams.get("gif");

    if (!gifName) {
      return new Response(
        JSON.stringify({ error: "Missing gif parameter" }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-store"
          }
        }
      );
    }

    // Accept a single GIF filename, not a path, URL, or template expression.
    // Spaces and ordinary punctuation are allowed.
    const invalidGifName =
      gifName !== gifName.trim() ||
      !/^.+\.gif$/i.test(gifName) ||
      /[\/\\:{}?#\u0000-\u001F\u007F]/.test(gifName) ||
      gifName.includes("${");

    if (invalidGifName) {
      return new Response(
        JSON.stringify({ error: "Invalid GIF filename" }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-store"
          }
        }
      );
    }

    // Confirm the exact filename exists in R2 before contacting Supabase.
    // Fail closed if the binding is missing, the lookup fails, or it times out.
    let gifObject;
    let r2TimeoutId;

    try {
      if (
        !env.CHIPS_GIFS ||
        typeof env.CHIPS_GIFS.head !== "function"
      ) {
        throw new Error("CHIPS_GIFS R2 binding is unavailable");
      }

      const timeout = new Promise((_, reject) => {
        r2TimeoutId = setTimeout(() => {
          reject(new Error("R2 existence check timed out"));
        }, 5000);
      });

      gifObject = await Promise.race([
        env.CHIPS_GIFS.head(gifName),
        timeout
      ]);
    } catch (err) {
      console.error(
        "R2 existence check failed:",
        err instanceof Error ? err.message : String(err)
      );

      return new Response(
        JSON.stringify({
          error: "GIF storage temporarily unavailable. Please try again."
        }),
        {
          status: 503,
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-store",
            "Retry-After": "5"
          }
        }
      );
    } finally {
      clearTimeout(r2TimeoutId);
    }

    if (gifObject === null) {
      return new Response(
        JSON.stringify({ error: "GIF not found" }),
        {
          status: 404,
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-store"
          }
        }
      );
    }

    const supabaseUrl = env.SUPABASE_URL;
    const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY;

    const body = await request.json().catch(() => ({}));

    const visitorid = body?.visitor_id || "unknown";
    const useragent = body?.userAgent || "unknown";
    const page = body?.page || "unknown";
    const referrer = body?.referrer || "unknown";

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

    const response = await fetch(
      `${supabaseUrl}/rest/v1/visitor_logs`,
      {
        method: "POST",
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
          "Content-Type": "application/json",
          Prefer: "return=representation"
        },
        body: JSON.stringify(logEntry)
      }
    );

    if (!response.ok) {
      const errText = await response.text();

      return new Response(
        JSON.stringify({
          error: "Supabase insert failed",
          details: errText
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

    const data = await response.json();

    return new Response(JSON.stringify(data[0]), {
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