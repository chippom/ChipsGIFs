import { createClient } from 'https://esm.sh/@supabase/supabase-js@2?bundle';

export async function onRequest(context) {
  const { request, env } = context;

  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  };

  if (request.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method Not Allowed' }),
      { status: 405, headers }
    );
  }

  let data;
  try {
    data = await request.json();
  } catch (err) {
    return new Response(
      JSON.stringify({ error: 'Invalid JSON' }),
      { status: 400, headers }
    );
  }

  const { gif_name } = data;
  if (!gif_name) {
    return new Response(
      JSON.stringify({ error: 'Missing gif_name' }),
      { status: 400, headers }
    );
  }

  try {
    const supabase = createClient(
      env.SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY
    );

    const { error } = await supabase.rpc('increment_download_count', {
      gif_name_param: gif_name
    });

    if (error) throw error;

    return new Response(
      JSON.stringify({ message: 'Download count updated' }),
      { status: 200, headers }
    );

  } catch (err) {
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers }
    );
  }
}
