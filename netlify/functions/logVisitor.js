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

  // Get location for gif_downloads only
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

  // Log to visitor_logs (no location required)
  try {
    await supabase.from('visitor_logs').insert([{
      visitor_id,
      useragent: userAgent,
      page: page || referrer || 'unknown',
      referrer: referrer || 'none',
      timestamp,
      gif_name
    }]);
  } catch (err) {
    console.error('visitor_logs insert error:', err.message);
  }

  // Optionally log gif_downloads if there is a gif_name and visitor_id
  if (gif_name && visitor_id) {
    try {
      await supabase.from('gif_downloads').insert([{
        gif_name,
        visitor_id,
        timestamp,
        location,
        page: page || referrer || 'unknown'
      }]);
    } catch (err) {
      console.error('gif_downloads log error:', err.message);
    }
  }

  // Optionally log gif_download_summary if there is a gif_name
  if (gif_name) {
    try {
      await supabase.from('gif_download_summary').insert([{
        gif_name,
        timestamp,
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
