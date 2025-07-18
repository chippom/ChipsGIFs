import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function handler(event) {
  try {
    const headers = {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'no-store'
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
      console.error('❌ JSON parse error:', err.message);
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Invalid JSON' })
      };
    }

    const {
      visitor_id,
      page,         // direct page input, but we’ll default from referrer below
      referrer,     // direct referrer input
      userAgent,
      gif_name,
      excludeTester
    } = data;

    // Use HTTP referer if not set
    const requestReferrer = event.headers.referer || 'direct-link';
    // Standardize page/referrer values for all tables:
    const pageValue = page || requestReferrer;
    const referrerValue = referrer || requestReferrer;

    // IP detection
    const ip = event.headers['x-nf-client-connection-ip'] || 'unknown';

    if (excludeTester) {
      console.log('🚫 Visitor excluded from tracking.');
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ message: 'Visitor excluded from tracking.' })
      };
    }

    let location = 'lookup disabled';
    try {
      const geoRes = await fetch(
        `https://ipinfo.io/${ip}/json?token=${process.env.IPINFO_TOKEN}`
      );
      const geo = await geoRes.json();
      if (geo.city && geo.region) {
        location = `${geo.city}, ${geo.region}`;
      }
    } catch (err) {
      console.warn('🌐 Location lookup failed:', err.message);
    }

    const timestamp = new Date().toISOString();

    // --- VISITOR LOGS (has both page and referrer) ---
    const visitorPayload = {
      visitor_id,
      ip,
      location,
      useragent: userAgent,
      page: pageValue,
      referrer: referrerValue,
      timestamp
    };
    console.log('Inserting into visitor_logs:', visitorPayload);
    await supabase.from('visitor_logs').insert([visitorPayload]);

    // --- GIF DOWNLOADS (uses page, not referrer) ---
    if (gif_name && visitor_id) {
      const gifDownloadPayload = {
        gif_name,
        visitor_id,
        timestamp,
        ip,
        location,
        page: pageValue
      };
      console.log('Inserting into gif_downloads:', gifDownloadPayload);
      await supabase.from('gif_downloads').insert([gifDownloadPayload]);
    }

    // --- GIF DOWNLOAD SUMMARY (uses referrer, not page) ---
    if (gif_name) {
      const summaryPayload = {
        gif_name,
        timestamp,
        ip,
        location,
        referrer: referrerValue
      };
      console.log('Inserting into gif_download_summary:', summaryPayload);
      await supabase.from('gif_download_summary').insert([summaryPayload]);
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ message: 'Visit logged successfully.' })
    };
  } catch (err) {
    console.error('🧨 Uncaught top-level error:', err);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'no-store'
      },
      body: JSON.stringify({ error: 'Unhandled exception in function.' })
    };
  }
}
