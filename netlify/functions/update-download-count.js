import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: 'Method Not Allowed',
    };
  }

  let gifName;
  let page;
  let location;

  try {
    const body = JSON.parse(event.body);
    gifName = body.gif_name;
    page = body.page || 'unspecified';
    location = body.location || 'unknown';
  } catch {
    return {
      statusCode: 400,
      body: 'Invalid JSON body',
    };
  }

  if (!gifName) {
    return {
      statusCode: 400,
      body: 'gif_name is required',
    };
  }

  try {
    // Check for existing row
    const { data: existingRow, error: selectError } = await supabase
      .from('downloads')
      .select('id, count')
      .eq('gif_name', gifName)
      .single();

    if (selectError && selectError.code !== 'PGRST116') {
      console.error('Select error:', selectError.message);
      throw selectError;
    }

    if (!existingRow) {
      // No existing entry — insert new row
      const { error: insertError } = await supabase
        .from('downloads')
        .insert([{
          gif_name: gifName,
          count: 1,
          page,
          location,
          timestamp: new Date().toISOString()
        }]);

      if (insertError) throw insertError;

      console.log(`🆕 Inserted new row for "${gifName}" with count 1`);
      return {
        statusCode: 200,
        body: JSON.stringify({ count: 1 }),
      };
    }

    // Row exists — update count
    const newCount = existingRow.count + 1;

    const { error: updateError } = await supabase
      .from('downloads')
      .update({
        count: newCount,
        timestamp: new Date().toISOString()
      })
      .eq('id', existingRow.id);

    if (updateError) throw updateError;

    console.log(`🔁 Updated "${gifName}" count to ${newCount}`);
    return {
      statusCode: 200,
      body: JSON.stringify({ count: newCount }),
    };

  } catch (err) {
    console.error('❌ Error updating download count:', err.message);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to update download count' }),
    };
  }
}