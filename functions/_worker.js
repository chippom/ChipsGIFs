// ===== START OF FILE =====
import { createClient } from "@supabase/supabase-js";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    async function ensureAndIncrement(supabase, gifName, visitorId) {
      const now = new Date();
      const timestamp = now.toISOString();
      const easternTime = now.toLocaleString("en-US", {
        timeZone: "America/New_York",
        hour12: true
      });

      const { data: existing, error: selectErr } = await supabase
        .from("downloads")
        .select("*")
        .eq("gif_name", gifName)
        .maybeSingle();   // safer than .single()

      if (selectErr) throw selectErr;

      if (!existing) {
        const { error: insertErr } = await supabase.from("downloads").insert({
          gif_name: gifName,
          count: 1,
          timestamp,
          eastern_time: easternTime,
          visitor_id: visitorId || "unknown"
        });
        if (insertErr) throw insertErr;
        return;
      }

      const { error: updateErr } = await supabase
        .from("downloads")
        .update({
          count: existing.count + 1,
          timestamp,
          eastern_time: easternTime,
          visitor_id: visitorId || existing.visitor_id
        })
        .eq("gif_name", gifName);

      if (updateErr) throw updateErr;
    }

    // Serve GIFs directly from R2 if path is not an API route
    if (!path.startsWith("/api/") && path !== "/") {
      const key = path.slice(1);
      const object = await env["CHIPS-GIFS"].get(key);
      if (object) {
        return new Response(object.body, {
          headers: { "Content-Type": "image/gif" }
        });
      }
    }

    // ===== /api/deliver =====
    if (path === "/api/deliver") {
      try {
        const gifNameRaw =
          url.searchParams.get("gif_name") ||
          url.searchParams.get("gifname") ||
          "";
        const gifName = decodeURIComponent(gifNameRaw);

        if (!gifName || !/^[a-zA-Z0-9_\-\. ]+$/.test(gifName)) {
          return new Response(
            JSON.stringify({ error: "Missing or invalid gif_name parameter" }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }

        const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
        await ensureAndIncrement(supabase, gifName, "anonymous");

        const object = await env["CHIPS-GIFS"].get(gifName);
        if (!object) {
          return new Response(JSON.stringify({ error: "GIF not found" }), {
            status: 404,
            headers: { "Content-Type": "application/json" }
          });
        }

        const body = await object.body.arrayBuffer();
        return new Response(body, {
          status: 200,
          headers: {
            "Content-Type": "image/gif",
            "Content-Disposition": `attachment; filename="${gifName}"`
          }
        });
      } catch (err) {
        console.error(err);
        return new Response(JSON.stringify({ error: "Server error" }), {
          status: 500,
          headers: { "Content-Type": "application/json" }
        });
      }
    }

    // ===== /api/count =====
    if (path === "/api/count") {
      try {
        const gif_name = url.searchParams.get("gif_name");
        if (!gif_name) {
          return new Response(
            JSON.stringify({ error: "Missing gif_name parameter" }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }

        const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
        const { data, error } = await supabase
          .from("downloads")
          .select("count")
          .eq("gif_name", gif_name)
          .maybeSingle();

        if (error) throw error;

        return new Response(JSON.stringify({ count: data?.count ?? 0 }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      } catch (err) {
        console.error(err);
        // Safe fallback so frontend scripts (dark mode) don’t hang
        return new Response(JSON.stringify({ count: 0 }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }
    }

    // ===== /api/log =====
    if (path === "/api/log") {
      try {
        let data;
        try {
          data = await request.json();
        } catch {
          return new Response(JSON.stringify({ error: "Invalid JSON" }), {
            status: 400,
            headers: { "Content-Type": "application/json" }
          });
        }

        const { visitor_id, page, referrer, userAgent, gif_name, excludeTester } = data;
        if (excludeTester) {
          return new Response(JSON.stringify({ message: "Excluded visitor" }), {
            status: 200,
            headers: { "Content-Type": "application/json" }
          });
        }

        const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
        const now = new Date();
        const timestamp = now.toISOString();
        const easternTime = now.toLocaleString("en-US", {
          timeZone: "America/New_York",
          hour12: true
        });

        const ip =
          request.headers.get("CF-Connecting-IP") ||
          request.headers.get("x-forwarded-for") ||
          "unknown";

        const ops = [];
        ops.push(
          supabase.from("visitor_logs").insert({
            gif_name,
            useragent: userAgent,
            page: page || referrer || "unknown",
            referrer: referrer || "none",
            timestamp,
            eastern_time: easternTime,
            ip
          })
        );
        if (gif_name) {
          ops.push(ensureAndIncrement(supabase, gif_name, visitor_id));
        }
        await Promise.allSettled(ops);

        return new Response(JSON.stringify({ message: "Log recorded" }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      } catch (err) {
        console.error(err);
        return new Response(JSON.stringify({ error: "Internal server error" }), {
          status: 500,
          headers: { "Content-Type": "application/json" }
        });
      }
    }

    // ===== /api/update =====
    if (path === "/api/update") {
      try {
        let data;
        try {
          data = await request.json();
        } catch {
          return new Response(JSON.stringify({ error: "Invalid JSON" }), {
            status: 400,
            headers: { "Content-Type": "application/json" }
          });
        }

        const { gif_name, visitor_id } = data;
        if (!gif_name) {
          return new Response(JSON.stringify({ error: "Missing gif_name" }), {
            status: 400,
            headers: { "Content-Type": "application/json" }
          });
        }

        const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
        await ensureAndIncrement(supabase, gif_name, visitor_id);

        return new Response(JSON.stringify({ message: "Download count updated" }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      } catch (err) {
        console.error(err);
        return new Response(JSON.stringify({ error: "Internal server error" }), {
          status: 500,
          headers: { "Content-Type": "application/json" }
        });
      }
    }

    // ===== FALLBACK =====
    return new Response("Not found", { status: 404 });
  }
};
// ===== END OF FILE =====
