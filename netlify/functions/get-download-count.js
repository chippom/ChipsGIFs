import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function handler(event) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  };

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method Not Allowed' }),
    };
  }

  let data;
  try {
    data = JSON.parse(event.body);
  } catch (err) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'Invalid JSON' }),
    };
  }

  const { gif_name } = data;
  if (!gif_name) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'Missing gif_name' }),
    };
  }

  try {
    // Call your Postgres RPC to increment or insert count atomically
    const { error } = await supabase.rpc('increment_download_count', { gif_name_param: gif_name });

    if (error) {
      console.error('❌ increment_download_count RPC error:', error.message);
      throw error;
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ message: 'Download count updated' }),
    };

  } catch (err) {
    console.error('❌ update-download-count error:', err.message);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
}
