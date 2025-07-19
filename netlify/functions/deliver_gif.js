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

    // Get location for gif_downloads only
    let location = 'lookup disabled';
    try {
      const ip = event.headers['client-ip'] ||
        event.headers['x-nf-client-connection-ip'] ||
        'unknown';
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
    const timestampNy = new Date().toLocaleString('en-US', {
      timeZone: 'America/New_York'
    });
    const referrer = event.headers.referer || 'direct-link';
    const page = referrer;

    // --- LOG TO gif_downloads (with location) ---
    try {
      await supabase.from('gif_downloads').insert([{
        gif_name: gifName,
        page,
        timestamp,
        timestamp_ny: timestampNy,
        location
      }]);
    } catch (gifDownloadsError) {
      console.error('gif_downloads insert error:', gifDownloadsError);
    }

    // --- LOG TO visitor_logs (NO location, NO ip) ---
    try {
      await supabase.from('visitor_logs').insert([{
        gif_name: gifName,
        page,
        referrer,
        timestamp,
        timestamp_ny: timestampNy
      }]);
    } catch (visitorLogsError) {
      console.error('visitor_logs insert error:', visitorLogsError);
    }

    // --- LOG TO gif_download_summary (NO location, NO ip) ---
    try {
      await supabase.from('gif_download_summary').insert([{
        gif_name: gifName,
        timestamp: timestampNy,
        referrer
      }]);
    } catch (summaryError) {
      console.error('gif_download_summary insert error:', summaryError);
    }

    // --- UPDATE downloads COUNTER TABLE ---
    let updatedCount = 1;
    try {
      const { data: existingRow } = await supabase
        .from('downloads')
        .select('count')
        .eq('gif_name', gifName)
        .single();

      if (existingRow?.count !== undefined) {
        updatedCount = existingRow.count + 1;
      }

      await supabase
        .from('downloads')
        .upsert([
          {
            gif_name: gifName,
            count: updatedCount,
            timestamp: new Date().toISOString()
          }
        ], { onConflict: ['gif_name'] });
    } catch (downloadsError) {
      console.error('downloads upsert error:', downloadsError);
    }

    // --- SERVE THE GIF FILE ---
    try {
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
    } catch (fileError) {
      console.error('GIF file read error:', fileError);
      return {
        statusCode: 404,
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Could not find or read GIF file.' })
      };
    }

  } catch (err) {
    console.error('🧨 Uncaught error:', err);
    return {
      statusCode: 500,
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Unhandled server error' })
    };
  }
}