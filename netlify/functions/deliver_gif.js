// deliver_gif.js
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
    // Only allow GET
    if (event.httpMethod !== 'GET') {
      return {
        statusCode: 405,
        headers: { 
          ...headers, 
          'Content-Type': 'application/json' 
        },
        body: JSON.stringify({ error: 'Method Not Allowed' })
      };
    }

    // Required query param
    const gifName = event.queryStringParameters?.gif_name;
    if (!gifName) {
      return {
        statusCode: 400,
        headers: { 
          ...headers, 
          'Content-Type': 'application/json' 
        },
        body: JSON.stringify({ error: 'Missing gif_name parameter' })
      };
    }

    // Log download attempt (best‐effort)
    try {
      const timestamp = new Date().toISOString();
      const page = event.headers.referer || 'direct-link';

      const { data, error } = await supabase
        .from('gif_downloads')
        .insert([{
          gif_name: gifName,
          timestamp,
          page,
          method: 'fallback'
        }]);

      if (error) {
        console.error('❌ gif_downloads insert error:', error.message);
      } else {
        console.log('✅ gif_downloads insert success:', data);
      }

    } catch (logError) {
      console.warn('🟠 Uncaught logging error:', logError.message);
    }

    // Fetch the GIF as binary and return it base64‐encoded
    const fileUrl = `https://chips-gifs.com/gifs/${gifName}`;
    const res = await fetch(fileUrl);
    if (!res.ok) {
      throw new Error(`Fetch failed: ${res.status} ${res.statusText}`);
    }

    // Convert to ArrayBuffer → Buffer → Base64
    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64Body = buffer.toString('base64');

    // Determine content type
    const contentType = res.headers.get('Content-Type') || 'application/octet-stream';

    return {
      statusCode: 200,
      isBase64Encoded: true,
      headers: {
        ...headers,
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${gifName}"`
      },
      body: base64Body
    };

  } catch (err) {
    console.error('🧨 Uncaught error in deliver_gif.js:', err.message);
    return {
      statusCode: 500,
      headers: {
        ...headers,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ error: 'Server error' })
    };
  }
}