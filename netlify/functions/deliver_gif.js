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

    // Gather IP using multiple fallbacks
    const ip = event.headers['client-ip'] ||
      event.headers['x-nf-client-connection-ip'] ||
      'unknown';
    console.log('📡 IP detected:', ip);

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

    console.log('📍 Location resolved as:', location);

    const timestamp = new Date().toISOString();
    const timestampNy = new Date().toLocaleString('en-US', {
      timeZone: 'America/New_York'
    });
    const referrer = event.headers.referer || 'direct-link';
    const page = referrer;

    // --- LOG TO gif_downloads (event-level analytics) ---
    const { error: gifDownloadsError } = await supabase.from('gif_downloads').insert([{
      gif_name: gifName,
      page,
      timestamp,
      timestamp_ny: timestampNy,
      ip,
      location
    }]);
    if (gifDownloadsError) console.error('gif_downloads insert error:', gifDownloadsError);

    // --- LOG TO visitor_logs ---
    const { error: visitorLogsError } = await supabase.from('visitor_logs').insert([{
      gif_name: gifName,
      ip,
      location,
      page,
      referrer,
      timestamp,
      timestamp_ny: timestampNy
    }]);
    if (visitorLogsError) console.error('visitor_logs insert error:', visitorLogsError);

    // --- LOG TO gif_download_summary ---
    const { error: summaryError } = await supabase.from('gif_download_summary').insert([{
      gif_name: gifName,
      timestamp: timestampNy,
      referrer,
      ip,
      location
    }]);
    if (summaryError) console.error('gif_download_summary insert error:', summaryError);

    // --- UPDATE downloads COUNTER TABLE (summary, 1 row per GIF) ---
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

      const { error: downloadsError } = await supabase
        .from('downloads')
        .upsert([
          {
            gif_name: gifName,
            count: updatedCount,
            timestamp: new Date().toISOString()
          }
        ], { onConflict: ['gif_name'] });
      if (downloadsError) console.error('downloads upsert error:', downloadsError);
    } catch (err) {
      console.error('downloads upsert general error:', err);
    }

    // --- SERVE THE GIF FILE ---
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
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Unhandled server error' })
    };
  }
}
