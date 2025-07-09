const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

exports.handler = async function (event) {
  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({ error: 'Method Not Allowed' })
    };
  }

  const gifName = event.queryStringParameters?.gif_name;
  if (!gifName) {
    return {
      statusCode: 400,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({ error: 'gif_name is required' })
    };
  }

  try {
    const { data, error } = await supabase
      .from('downloads')
      .select('count')
      .eq('gif_name', gifName)
      .single();

    if (error) {
      console.error("🔴 Supabase error:", error.message);
    }

    const count = data?.count ?? 0;
    console.log(`🟢 Count for ${gifName}:`, count);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({ count })
    };
  } catch (err) {
    console.error("🚨 Unexpected error in GET handler:", err);

    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({ error: err.message || 'Unexpected error' })
    };
  }
};