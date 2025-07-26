import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function handler(event) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method Not Allowed' })
    };
  }

  let data;
  try {
    data = JSON.parse(event.body);
  } catch (err) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'Invalid JSON' })
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

  let location = 'lookup disabled';
  try {
    const ip = event.headers['x-nf-client-connection-ip'] || 'unknown';
    const geoRes = await fetch(
      `https://ipinfo.io/${ip}/json?token=${process.env.IPINFO_TOKEN}`
    );
    const geo = await geoRes.json();
    if (geo.city && geo.region) {
      location = `${geo.city}, ${geo.region}`;
    }
  } catch (err) {
    console.warn('Geo lookup failed:', err.message);
  }

  try {
    // UPSERT into visitor_logs to respect unique constraint on visitor_id
    await supabase.from('visitor_logs').upsert([{
      visitor_id,
      useragent: userAgent,
      page: page || referrer || 'unknown',
      referrer: referrer || 'none',
      timestamp,
      eastern_time: easternTime,
      gif_name,
      location
    }], { onConflict: ['visitor_id'] });
  } catch (err) {
    console.error('visitor_logs upsert error:', err.message);
  }

  if (gif_name && visitor_id) {
    try {
      // Insert a new row for each download event
      await supabase.from('gif_downloads').insert([{
        gif_name,
        visitor_id,
        timestamp,
        eastern_time: easternTime,
        location,
        page: page || referrer || 'unknown'
      }]);
    } catch (err) {
      console.error('gif_downloads log error:', err.message);
    }
  }

  if (gif_name) {
    try {
      // Insert into summary table for analytics or aggregations
      await supabase.from('gif_download_summary').insert([{
        gif_name,
        timestamp,
        eastern_time: easternTime,
        referrer: referrer || 'none'
      }]);
    } catch (err) {
      console.error('gif_download_summary insert error:', err.message);
    }
  }

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({ message: 'Log recorded' })
  };
}
