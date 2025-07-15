import { createClient } from '@supabase/supabase-js';
import path from 'path';
import fs from 'fs/promises';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function handler(event) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'no-store'
  };

  try {
    if (event.httpMethod !== 'GET') {
      return {
        statusCode: 405,
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Method Not Allowed' })
      };
    }

    const gifName = event.queryStringParameters?.gif_name;
    if (!gifName) {
      return {
        statusCode: 400,
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Missing gif_name parameter' })
      };
    }

    // Grab IP using multiple fallbacks
    const ip =
      event.headers['client-ip'] ||
      event.headers['x-nf-client-connection-ip'] ||
      'unknown';

    console.log('📡 IP detected:', ip); // Diagnostic log

    let location = 'lookup disabled';

    try {
      const geoRes = await fetch(
        `https://api.ipinfo.io/lite/${ip}?token=${process.env.IPINFO_TOKEN}`
      );
      const geo = await geoRes.json();
      if (geo.city && geo.region) {
        location = `${geo.city}, ${geo.region}`;
      }
    } catch (err) {
      console.warn('🌐 Location lookup failed:', err.message);
    }

    console.log('📍 Location resolved as:', location); // Diagnostic log

    const timestampUtc = new Date().toISOString();
    const timestampNy = new Date().toLocaleString('en-US', {
      timeZone: 'America/New_York'
    });
    const referrer = event.headers.referer || 'direct-link';

    // Log the GIF download
    await supabase.from('gif_downloads').insert([{
      gif_name: gifName,
      page: referrer,
      timestamp: timestampUtc,
      timestamp_ny: timestampNy,
      ip,
      location
    }]);

    // Log the visitor snapshot
    await supabase.from('visitors_logs').insert([{
      ip,
      location,
      page: referrer,
      timestamp: timestampUtc,
      timestamp_ny: timestampNy
    }]);

    // Log into gif_download_summary for quick analytics
    await supabase.from('gif_download_summary').insert([{
      gif_name: gifName,
      timestamp: timestampNy,
      referrer,
      ip,
      location
    }]);

    const filePath = path.resolve('.', gifName);
    const fileBuffer = await fs.readFile(filePath);

    return {
      statusCode: 200,
      headers: {
        ...headers,
        'Content-Type': 'image/gif',
        'Content-Disposition': `attachment; filename="${gifName}"`
      },
      body: fileBuffer.toString('base64'),
      isBase64Encoded: true
    };

  } catch (err) {
    console.error('🧨 Uncaught error:', err);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ error: 'Unhandled server error' })
    };
  }
}