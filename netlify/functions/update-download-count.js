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
  try {
    gifName = JSON.parse(event.body).gif_name;
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

  let updatedCount = 1;

  try {
    // Check if the row already exists
    const { data: existingRow, error: selectError } = await supabase
      .from('downloads')
      .select('count')
      .eq('gif_name', gifName)
      .single();

    if (selectError && selectError.code !== 'PGRST116') {
      console.error('Select error:', selectError.message);
      throw selectError;
    }

    if (existingRow?.count !== undefined) {
      updatedCount = existingRow.count + 1;
    }

    // Upsert count
    const { error: upsertError } = await supabase
      .from('downloads')
      .upsert(
        [{
          gif_name: gifName,
          count: updatedCount,
          timestamp: new Date().toISOString()
        }],
        { onConflict: ['gif_name'] }
      );

    if (upsertError) {
      console.error('Upsert error:', upsertError.message);
      throw upsertError;
    }

    console.log(`✅ Updated count for "${gifName}" to ${updatedCount}`);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ count: updatedCount }),
    };

  } catch (err) {
    console.error('❌ update-download-count.js error:', err.message);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Failed to update download count', count: 1 }),
    };
  }
}
