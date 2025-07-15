import { createClient } from '@supabase/supabase-js';
import path from 'path';
import fs from 'fs/promises';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function handler(event) {
  try {
    const headers = {
      'Access-Control-Allow-Origin': '*',
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'no-store'
    };

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

    const ip = event.headers['x-nf-client-connection-ip'] || 'unknown';
    let location = 'lookup disabled';

    try {
      const geoRes = await fetch(`https://ipinfo.io/${ip}/json?token=YOUR_TOKEN_HERE`);
      const geo = await geoRes.json();
      if (geo.city && geo.region) {
        location = `${geo.city}, ${geo.region}`;
      }
    } catch (err) {
      console.warn('🌐 Location lookup failed:', err.message);
    }

    await supabase.from('gif_downloads').insert([{
      gif_name: gifName,
      visitor_id: 'anonymous_user',
      timestamp: new Date().toISOString(),
      ip,
      location,
      referrer: event.headers.referer || 'direct-link'
    }]);

    // 🔧 Corrected file path for main folder
    const filePath = path.resolve('.', gifName);
    try {
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
      console.error('❌ GIF read error:', err.message);
      return {
        statusCode: 404,
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'GIF not found' })
      };
    }
  } catch (err) {
    console.error('🧨 Uncaught error:', err);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ error: 'Unhandled server error' })
    };
  }
}