import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function handler(event) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method Not Allowed' })
    };
  }

  const gifName = event.queryStringParameters?.gif_name;
  if (!gifName) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'Missing gif_name parameter' })
    };
  }

  try {
    const { data, error } = await supabase
      .from('downloads')
      .select('count')
      .eq('gif_name', gifName)
      .single();

    let count = 0;

    // Supabase returns an error.code of 'PGRST116' if the row is not found (PostgREST)
    if (error) {
      if (error.code === 'PGRST116' || error.message?.toLowerCase().includes('row not found')) {
        count = 0;
      } else {
        throw error; // Unexpected error, fail with 500
      }
    } else {
      count = (typeof data.count === 'number') ? data.count : 0;
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ count })
    };
  } catch (err) {
    console.error('❌ Error retrieving count:', err.message);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Internal Server Error' })
    };
  }
}
