import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Cache TTL for IP geolocation results (7 days)
const GEO_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export async function handler(event) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  };

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method Not Allowed' }),
    };
  }

  let data;
  try {
    data = JSON.parse(event.body);
  } catch (err) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'Invalid JSON' }),
    };
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
    console.log('Visitor excluded.');
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ message: 'Excluded visitor' })
    };
  }

  const now = new Date();
  const timestamp = now.toISOString();
  const easternTime = now.toLocaleString("en-US", {
    timeZone: "America/New_York",
    hour12: true
  });

  // Get client IP from Netlify header (x-nf-client-connection-ip) or fallback to 'unknown'
  const ip = event.headers['x-nf-client-connection-ip'] || 'unknown';

  // Helper: get cached location or call IP geolocation API
  async function getLocationInfo(ipAddress) {
    // 1) Try cache in Supabase table ip_location_cache
    try {
      const { data: cached, error } = await supabase
        .from('ip_location_cache')
        .select()
        .eq('ip', ipAddress)
        .single();

      if (!error && cached) {
        const age = new Date() - new Date(cached.timestamp);
        if (age < GEO_CACHE_TTL_MS) {
          // Use cached data if fresh
          return {
            city: cached.city,
            region: cached.region,
            country: cached.country,
            locationStr: [cached.city, cached.region, cached.country].filter(Boolean).join(', ') || 'unknown'
          };
        }
      }
    } catch (cacheErr) {
      console.warn('Geo cache read error:', cacheErr.message);
    }

    // 2) Cache miss or stale: call ipinfo.io API
    try {
      const geoRes = await fetch(
        `https://ipinfo.io/${ipAddress}/json?token=${process.env.IPINFO_TOKEN}`
      );
      if (!geoRes.ok) {
        throw new Error(`ipinfo.io API error status ${geoRes.status}`);
      }
      const geo = await geoRes.json();

      const city = geo.city || null;
      const region = geo.region || null;
      const country = geo.country || null;
      const locationStr = [city, region, country].filter(Boolean).join(', ') || 'unknown';

      // Upsert cache
      try {
        await supabase.from('ip_location_cache').upsert([{
          ip: ipAddress,
          city,
          region,
          country,
          location: locationStr,
          timestamp: new Date().toISOString()
        }], { onConflict: ['ip'] });
      } catch (cacheWriteErr) {
        console.warn('Geo cache write error:', cacheWriteErr.message);
      }

      return { city, region, country, locationStr };
    } catch (apiErr) {
      console.warn('Geo lookup failed:', apiErr.message);
      return { city: null, region: null, country: null, locationStr: 'lookup disabled' };
    }
  }

  // Get location info (city, region, country) + location string
  const geoInfo = await getLocationInfo(ip);
  const { locationStr: location, country } = geoInfo;

  // Upsert visitor_logs table keyed by visitor_id
  try {
    await supabase.from('visitor_logs').upsert([{
      visitor_id,
      useragent: userAgent,
      page: page || referrer || 'unknown',
      referrer: referrer || 'none',
      timestamp,
      eastern_time: easternTime,
      gif_name,
      location,
      country,
      ip
    }], { onConflict: ['visitor_id'] });
  } catch (err) {
    console.error('visitor_logs upsert error:', err.message);
  }

  // Upsert GIF download logs keyed by (gif_name, visitor_id) to avoid duplicates
  if (gif_name && visitor_id) {
    try {
      await supabase.from('gif_downloads').upsert([{
        gif_name,
        visitor_id,
        timestamp,
        eastern_time: easternTime,
        location,
        country,
        ip,
        page: page || referrer || 'unknown'
      }], { onConflict: ['gif_name', 'visitor_id'] });
    } catch (err) {
      console.error('gif_downloads upsert error:', err.message);
    }
  }

  // Insert summary analytics log if gif_name present (kept as insert per previous)
  if (gif_name) {
    try {
      await supabase.from('gif_download_summary').insert([{
        gif_name,
        timestamp,
        eastern_time: easternTime,
        referrer: referrer || 'none',
        country,
        ip
      }]);
    } catch (err) {
      console.error('gif_download_summary insert error:', err.message);
    }
  }

  // Return success response
  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({ message: 'Log recorded' })
  };
}