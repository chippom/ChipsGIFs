import { createClient } from '@supabase/supabase-js';

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
    // Only allow GET requests
    if (event.httpMethod !== 'GET') {
      return {
        statusCode: 405,
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Method Not Allowed' }),
      };
    }

    // Required query parameter gif_name
    const gifName = event.queryStringParameters?.gif_name;
    const visitorId = event.queryStringParameters?.visitor_id || null;
    if (!gifName) {
      return {
        statusCode: 400,
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Missing gif_name parameter' }),
      };
    }

    // Basic validation: allow only alphanumeric, dash, underscore, dot (safe filename chars)
    if (!/^[\w\-\.]+$/.test(gifName)) {
      return {
        statusCode: 400,
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Invalid gif_name format' }),
      };
    }

    const timestamp = new Date().toISOString();
    const page = event.headers.referer || 'direct-link';

    // Prepare log data for upsert
    const logData = {
      gif_name: gifName,
      timestamp,
      page,
      method: 'fallback',
    };
    if (visitorId) {
      logData.visitor_id = visitorId;
    }

    // Use UPSERT to avoid duplicates based on gif_name + visitor_id
    try {
      const { data, error } = await supabase
        .from('gif_downloads')
        .upsert([logData], { onConflict: ['gif_name', 'visitor_id'] });

      if (error) {
        console.error('❌ gif_downloads upsert error:', error.message);
      } else {
        console.log('✅ gif_downloads upsert success:', data);
      }
    } catch (logError) {
      console.warn('🟠 Uncaught logging error:', logError.message);
    }

    // Fetch GIF from storage URL, encode as base64 for response
    const fileUrl = `https://chips-gifs.com/gifs/${gifName}`;
    const res = await fetch(fileUrl);
    if (!res.ok) {
      throw new Error(`Fetch failed: ${res.status} ${res.statusText}`);
    }

    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64Body = buffer.toString('base64');

    const contentType = res.headers.get('Content-Type') || 'application/octet-stream';

    return {
      statusCode: 200,
      isBase64Encoded: true,
      headers: {
        ...headers,
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${gifName}"`,
      },
      body: base64Body,
    };

  } catch (err) {
    console.error('🧨 Uncaught error in deliver_gif.js:', err.message);
    return {
      statusCode: 500,
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Server error' }),
    };
  }
}
