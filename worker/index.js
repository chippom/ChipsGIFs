import { createClient } from "@supabase/supabase-js";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // -------------------------------
    // ROUTE: /api/deliver
    // -------------------------------
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

        const timestamp = new Date().toISOString();
        const referer = request.headers.get("referer") || "direct-link";

        let location = "lookup disabled";
        let country = "unknown";

        try {
          const ip =
            request.headers.get("cf-connecting-ip") ||
            request.headers.get("x-forwarded-for") ||
            "unknown";

          if (ip !== "unknown" && env.IPINFO_TOKEN) {
            const geoRes = await fetch(
              `https://ipinfo.io/${ip}/json?token=${env.IPINFO_TOKEN}`
            );
            if (geoRes.ok) {
              const geo = await geoRes.json();
              country = geo.country || "unknown";
              if (geo.city && geo.region) {
                location = `${geo.city}, ${geo.region}, ${country}`;
              } else if (geo.region) {
                location = `${geo.region}, ${country}`;
              } else if (country !== "unknown") {
                location = country;
              }
            }
          }
        } catch (_) {}

        try {
          await supabase.from("gif_downloads").insert([
            {
              gif_name: gifName,
              timestamp,
              page: referer,
              method: "r2-read"
            }
          ]);
        } catch (_) {}

        try {
          await supabase.from("visitor_logs").upsert(
            {
              visitorid: "anonymous",
              useragent: request.headers.get("user-agent") || "unknown",
              page: referer,
              referrer: referer,
              timestamp,
              gif_name: gifName,
              location,
              country
            },
            { onConflict: "visitorid" }
          );
        } catch (_) {}

        try {
          await supabase.from("gif_download_summary").insert([
            {
              gif_name: gifName,
              timestamp,
              easternTime: new Date().toLocaleString("en-US", {
                timeZone: "America/New_York"
              }),
              referrer: referer,
              location,
              country
            }
          ]);
        } catch (_) {}

        const object = await env.CHIPS_GIFS.get(gifName);

        if (!object) {
          return new Response(JSON.stringify({ error: "GIF not found" }), {
            status: 404,
            headers: { "Content-Type": "application/json" }
          });
        }

        const body = await object.arrayBuffer();

        return new Response(body, {
          status: 200,
          headers: {
            "Content-Type": "image/gif",
            "Content-Disposition": `attachment; filename="${gifName}"`
          }
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: "Server error" }), {
          status: 500,
          headers: { "Content-Type": "application/json" }
        });
      }
    }

    // -------------------------------
    // ROUTE: /api/count
    // -------------------------------
    if (path === "/api/count") {
      try {
        if (request.method !== "GET") {
          return new Response(
            JSON.stringify({ error: "Method Not Allowed" }),
            { status: 405, headers: { "Content-Type": "application/json" } }
          );
        }

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
          .single();

        if (error && error.code !== "PGRST116") throw error;

        return new Response(
          JSON.stringify({ count: data?.count ?? 0 }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      } catch (_) {
        return new Response(JSON.stringify({ error: "Internal server error" }), {
          status: 500,
          headers: { "Content-Type": "application/json" }
        });
      }
    }

    // -------------------------------
    // ROUTE: /api/log
    // -------------------------------
    if (path === "/api/log") {
      try {
        if (request.method !== "POST") {
          return new Response(
            JSON.stringify({ error: "Method Not Allowed" }),
            { status: 405, headers: { "Content-Type": "application/json" } }
          );
        }

        let data;
        try {
          data = await request.json();
        } catch (_) {
          return new Response(JSON.stringify({ error: "Invalid JSON" }), {
            status: 400,
            headers: { "Content-Type": "application/json" }
          });
        }

        const {
          visitor_id,
          page,
          referrer,
          userAgent,
          gif_name,
          excludeTester
        } = data;

        if (excludeTester) {
          return new Response(JSON.stringify({ message: "Excluded visitor" }), {
            status: 200,
            headers: { "Content-Type": "application/json" }
          });
        }

        const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE);

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

        async function getLocationInfo(ipAddress) {
          try {
            const { data: cached, error } = await supabase
              .from("ip_location_cache")
              .select()
              .eq("ip", ipAddress)
              .single();

            if (!error && cached) {
              const age = new Date() - new Date(cached.timestamp);
              if (age < 7 * 24 * 60 * 60 * 1000) {
                return {
                  city: cached.city,
                  region: cached.region,
                  country: cached.country,
                  locationStr:
                    [cached.city, cached.region, cached.country]
                      .filter(Boolean)
                      .join(", ") || "unknown"
                };
              }
            }
          } catch (_) {}

          try {
            const geoRes = await fetch(
              `https://ipinfo.io/${ipAddress}/json?token=${env.IPINFO_TOKEN}`
            );

            if (!geoRes.ok) throw new Error("Geo API error");

            const geo = await geoRes.json();

            const city = geo.city || null;
            const region = geo.region || null;
            const country = geo.country || null;
            const locationStr =
              [city, region, country].filter(Boolean).join(", ") || "unknown";

            await supabase.from("ip_location_cache").upsert(
              [
                {
                  ip: ipAddress,
                  city,
                  region,
                  country,
                  location: locationStr,
                  timestamp: new Date().toISOString()
                }
              ],
              { onConflict: ["ip"] }
            );

            return { city, region, country, locationStr };
          } catch (_) {
            return {
              city: null,
              region: null,
              country: null,
              locationStr: "lookup disabled"
            };
          }
        }

        const geoInfo = await getLocationInfo(ip);
        const { locationStr: location, country } = geoInfo;

        const ops = [];

        ops.push(
          supabase.from("visitor_logs").upsert(
            [
              {
                gif_name,
                useragent: userAgent,
                page: page || referrer || "unknown",
                referrer: referrer || "none",
                timestamp,
                eastern_time: easternTime,
                location,
                country,
                ip
              }
            ],
            { onConflict: ["gif_name"] }
          )
        );

        if (gif_name && visitor_id) {
          ops.push(
            supabase.from("gif_downloads").upsert(
              [
                {
                  gif_name,
                  visitor_id,
                  timestamp,
                  eastern_time: easternTime,
                  location,
                  country,
                  ip,
                  page: page || referrer || "unknown"
                }
              ],
              { onConflict: ["gif_name", "visitor_id"] }
            )
          );
        }

        if (gif_name) {
          ops.push(
            supabase.from("gif_download_summary").insert([
              {
                gif_name,
                timestamp,
                eastern_time: easternTime,
                referrer: referrer || "none",
                country,
                ip
              }
            ])
          );
        }

        await Promise.allSettled(ops);

        return new Response(JSON.stringify({ message: "Log recorded" }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      } catch (_) {
        return new Response(JSON.stringify({ error: "Internal server error" }), {
          status: 500,
          headers: { "Content-Type": "application/json" }
        });
      }
    }

    // -------------------------------
    // ROUTE: /api/update
    // -------------------------------
    if (path === "/api/update") {
      try {
        if (request.method !== "POST") {
          return new Response(
            JSON.stringify({ error: "Method Not Allowed" }),
            { status: 405, headers: { "Content-Type": "application/json" } }
          );
        }

        let data;
        try {
          data = await request.json();
        } catch (_) {
          return new Response(JSON.stringify({ error: "Invalid JSON" }), {
            status: 400,
            headers: { "Content-Type": "application/json" }
          });
        }

        const { gif_name } = data;
        if (!gif_name) {
          return new Response(
            JSON.stringify({ error: "Missing gif_name" }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }

        const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

        const { error } = await supabase.rpc("increment_download_count", {
          gif_name_param: gif_name
        });

        if (error) throw error;

        return new Response(
          JSON.stringify({ message: "Download count updated" }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      } catch (_) {
        return new Response(JSON.stringify({ error: "Internal server error" }), {
          status: 500,
          headers: { "Content-Type": "application/json" }
        });
      }
    }

    // -------------------------------
    // FALLBACK
    // -------------------------------
    return new Response("Not found", { status: 404 });
  }
};
