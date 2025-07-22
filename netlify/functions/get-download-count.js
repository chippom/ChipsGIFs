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
    'X-Content-Type-Options': 'nosniff'
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
    if (error) {
      if (error.code === 'PGRST116') {
        count = 0; // Row not found
      } else {
        throw error;
      }
    } else {
      count = typeof data.count === 'number' ? data.count : 0;
    }

    // 🕒 Add human-readable timestamp in Eastern Time
    const easternTime = new Date().toLocaleString("en-US", {
      timeZone: "America/New_York",
      hour12: true
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        count,
        gif_name: gifName,
        eastern_time: easternTime
      })
    };

  } catch (err) {
    console.error('❌ get-download-count error:', err.message);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Internal server error' })
    };
  }
}