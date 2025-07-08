const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

exports.handler = async (event) => {
  try {
    const gif_name = event.queryStringParameters.gif_name;
    const { data, error } = await supabase
      .from('download_counters')
      .select('count')
      .eq('gif_name', gif_name)
      .single();

    if (error && error.code !== 'PGRST116') throw error; // PGRST116 = no rows found

    return {
      statusCode: 200,
      body: JSON.stringify({ count: data ? data.count : 0 }),
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
};
