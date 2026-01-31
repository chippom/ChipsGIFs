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

  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method Not Allowed' }),
    };
  }

  const gif_name = event.queryStringParameters?.gif_name;
  if (!gif_name) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'Missing gif_name parameter' }),
    };
  }

  try {
    const { data, error } = await supabase
      .from('downloads')
      .select('count')
      .eq('gif_name', gif_name)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 means no rows found
      throw error;
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ count: data?.count ?? 0 }),
    };
  } catch (err) {
    console.error('❌ get-download-count error:', err.message);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
}