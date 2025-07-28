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

  // Only allow GET requests on this endpoint
  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method Not Allowed' })
    };
  }

  // Read gif_name query parameter
  const gif_name = event.queryStringParameters?.gif_name;
  if (!gif_name) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'Missing gif_name parameter' })
    };
  }

  try {
    // Fetch the download count for the gif_name from the downloads table
    const { data, error } = await supabase
      .from('downloads')
      .select('count')
      .eq('gif_name', gif_name)
      .maybeSingle(); // returns null if no row found (cleaner than .single())

    if (error) {
      throw error;
    }

    // If no row yet, count is zero
    const count = data?.count ?? 0;

    // Generate a human-readable current Eastern Time for display only
    const easternTime = new Date().toLocaleString("en-US", {
      timeZone: "America/New_York",
      hour12: true
    });

    // Respond with count and gif_name; note easternTime reflects current time, not last count update
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        gif_name,
        count,
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