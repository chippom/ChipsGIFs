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

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method Not Allowed' })
    };
  }

  let data;
  try {
    data = JSON.parse(event.body);
  } catch (err) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'Invalid JSON' })
    };
  }

  const { gif_name } = data;
  if (!gif_name) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'Missing gif_name' })
    };
  }

  console.log(`update-download-count called for gif_name: ${gif_name}`);

  const now = new Date();
  const timestamp = now.toISOString();
  const easternTime = now.toLocaleString("en-US", {
    timeZone: "America/New_York",
    hour12: true
  });

  try {
    // Attempt to insert a new row only if it does not exist.
    // Use insert with ignoreDuplicates: true to avoid overwriting existing count.
    const { error: insertError } = await supabase
      .from('downloads')
      .insert([
        {
          gif_name,
          count: 0, // Insert with count 0 if new GIF
          timestamp,
          eastern_time: easternTime,
        }
      ], { ignoreDuplicates: true }); // Do not update existing rows here

    if (insertError) throw insertError;

    // Now atomically increment the count for the gif_name via RPC
    const { error: rpcError } = await supabase.rpc('increment_download_count', { gif_name_param: gif_name });
    if (rpcError) throw rpcError;

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ message: 'Download count updated' })
    };
  } catch (err) {
    console.error('❌ update-download-count error:', err.message);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Internal server error' })
    };
  }
}