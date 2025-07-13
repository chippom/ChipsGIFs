import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function handler(event) {
  try {
    console.log('🔍 Function triggered: method =', event.httpMethod);

    if (event.httpMethod !== 'POST') {
      return {
        statusCode: 405,
        body: JSON.stringify({ error: 'Method Not Allowed' })
      };
    }

    let data;
    try {
      data = JSON.parse(event.body);
    } catch (err) {
      console.error('❌ JSON parse error:', err.message);
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Invalid JSON' })
      };
    }

    const {
      visitor_id,
      page,
      referrer,
      userAgent, // still read this from the frontend...
      gif_name,
      excludeTester
    } = data;

    const ip = event.headers['x-nf-client-connection-ip'] || 'unknown';

    if (excludeTester) {
      console.log('🚫 Visitor excluded from tracking.');
      return {
        statusCode: 200,
        body: JSON.stringify({ message: 'Visitor excluded from tracking.' })
      };
    }

    let location = 'lookup disabled'; // Fallback in case IPInfo fails
    try {
      const geoRes = await fetch(`https://ipinfo.io/${ip}/json?token=YOUR_TOKEN_HERE`);
      const geo = await geoRes.json();
      if (geo.city && geo.region) {
        location = `${geo.city}, ${geo.region}`;
      }
    } catch (err) {
      console.warn('🌐 Location lookup failed:', err.message);
    }

    const payload = {
      visitor_id,
      page,
      referrer,
      useragent: userAgent, // 👈 renamed key for Supabase
      location,
      ip,
      gif_name,
      timestamp: new Date().toISOString()
    };

    console.log('📦 Inserting payload into Supabase:', payload);

    const { error } = await supabase.from('visitor_logs').insert([payload]);

    if (error) {
      console.error('🚨 Supabase insert error:', error);
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Failed to log visit.' })
      };
    }

    // 👉 NEW INSERT: Log confirmed downloads into gif_downloads
    if (gif_name && visitor_id) {
      try {
        await supabase.from('gif_downloads').insert([{
          gif_name,
          visitor_id,
          timestamp: new Date().toISOString(),
          ip,
          location,
          referrer
        }]);
        console.log('🎯 Download event logged in gif_downloads');
      } catch (insertErr) {
        console.warn('⚠️ Failed to insert into gif_downloads:', insertErr.message);
      }
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Visit logged successfully.' })
    };
  } catch (err) {
    console.error('🧨 Uncaught top-level error:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Unhandled exception in function.' })
    };
  }
}