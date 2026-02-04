import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

export async function onRequest(context) {
  const { request, env } = context;

  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff"
  };

  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method Not Allowed" }), {
      status: 405,
      headers
    });
  }

  let data;
  try {
    data = await request.json();
  } catch (err) {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers
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
      headers
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
    headers
  });
}
