const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

exports.handler = async (event) => {
  try {
    const { gif_name } = JSON.parse(event.body);

    // Try to increment the count for the existing GIF
    let { data, error } = await supabase
      .from('download_counters')
      .update({ count: supabase.raw('count + 1') })
      .eq('gif_name', gif_name)
      .select();

    // If no row was updated (GIF not found), insert a new row
    if (!data || data.length === 0) {
      ({ data, error } = await supabase
        .from('download_counters')
        .insert([{ gif_name, count: 1 }])
        .select());
    }

    if (error) {
      throw error;
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ count: data[0].count }),
    };

  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
};
