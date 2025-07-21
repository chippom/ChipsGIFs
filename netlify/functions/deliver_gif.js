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

    // Log the download attempt
    try {
      const timestamp = new Date().toISOString();
      const page = event.headers.referer || 'direct-link';

      await supabase.from('gif_downloads').insert([{
        gif_name: gifName,
        timestamp,
        page,
        method: 'fallback'
      }]);
    } catch (logError) {
      console.warn('🟠 Logging fallback download failed:', logError.message);
    }

    // Redirect to the public GIF file
    return {
      statusCode: 302,
      headers: {
        ...headers,
        Location: `https://chips-gifs.com/gifs/${gifName}`
      }
    };

  } catch (err) {
    console.error('🧨 Uncaught error in deliver_gif.js:', err.message);
    return {
      statusCode: 500,
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Server error' })
    };
  }
}