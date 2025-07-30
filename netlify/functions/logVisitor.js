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

  // Only allow POST requests
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

  // Get client IP from Netlify header or fallback
  const ip = event.headers['x-nf-client-connection-ip'] || 'unknown';

  // Helper function: Get cached location or call IP geolocation API
  async function getLocationInfo(ipAddress) {
    // 1) Check cache in Supabase table ip_location_cache
    try {
      const { data: cached, error } = await supabase
        .from('ip_location_cache')
        .select()
        .eq('ip', ipAddress)
        .single();

      if (!error && cached) {
        const age = new Date() - new Date(cached.timestamp);
        if (age < GEO_CACHE_TTL_MS) {
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

    // 2) Cache miss or stale, call ipinfo.io API
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

      // Upsert cache for future use
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

  // Get location info from cache or ipinfo.io
  const geoInfo = await getLocationInfo(ip);
  const { locationStr: location, country } = geoInfo;

  // Prepare concurrent DB operation promises
  const promises = [
    // Upsert visitor logs keyed by visitor_id to update existing or insert new
    supabase.from('visitor_logs').upsert([{
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
    }], { onConflict: ['visitor_id'] })
  ];

  if (gif_name && visitor_id) {
    // IMPORTANT FIX: Change .insert() to .upsert() on gif_downloads with composite unique keys
    promises.push(
      supabase.from('gif_downloads').upsert([{
        gif_name,
        visitor_id,
        timestamp,
        eastern_time: easternTime,
        location,
        country,
        ip,
        page: page || referrer || 'unknown'
      }], { onConflict: ['gif_name', 'visitor_id'] })
    );
  } else {
    promises.push(Promise.resolve());
  }

  if (gif_name) {
    // Insert into gif_download_summary analytics table (per-event insert)
    promises.push(
      supabase.from('gif_download_summary').insert([{
        gif_name,
        timestamp,
        eastern_time: easternTime,
        referrer: referrer || 'none',
        country,
        ip
      }])
    );
  } else {
    promises.push(Promise.resolve());
  }

  // Run all DB operations concurrently and log any failures
  const results = await Promise.allSettled(promises);

  results.forEach((result, idx) => {
    if (result.status === 'rejected') {
      switch (idx) {
        case 0:
          console.error('visitor_logs upsert error:', result.reason);
          break;
        case 1:
          console.error('gif_downloads upsert error:', result.reason);
          break;
        case 2:
          console.error('gif_download_summary insert error:', result.reason);
          break;
        default:
          console.error('Unknown DB operation error:', result.reason);
      }
    }
  });

  // Return success response
  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({ message: 'Log recorded' })
  };
}