import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: 'Method Not Allowed'
    }
  }

  let gifName
  try {
    gifName = JSON.parse(event.body).gif_name
  } catch {
    return {
      statusCode: 400,
      body: 'Invalid JSON body'
    }
  }

  if (!gifName) {
    return {
      statusCode: 400,
      body: 'gif_name is required'
    }
  }

  // Step 1: Try to fetch the current row
  const { data: existingRow, error: fetchError } = await supabase
    .from('downloads')
    .select('count')
    .eq('gif_name', gifName)
    .single()

  if (fetchError && fetchError.code !== 'PGRST116') { // ignore "No rows found"
    console.error("🔴 Error fetching existing row:", fetchError.message)
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({ error: fetchError.message })
    }
  }

  let updatedCount

  if (existingRow) {
    updatedCount = existingRow.count + 1

    const { error: updateError } = await supabase
      .from('downloads')
      .update({ count: updatedCount })
      .eq('gif_name', gifName)

    if (updateError) {
      console.error("🔴 Error updating count:", updateError.message)
      return {
        statusCode: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({ error: updateError.message })
      }
    }
  } else {
    updatedCount = 1

    const { error: insertError } = await supabase
      .from('downloads')
      .insert({ gif_name: gifName, count: updatedCount })

    if (insertError) {
      console.error("🔴 Error inserting new row:", insertError.message)
      return {
        statusCode: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({ error: insertError.message })
      }
    }
  }

  console.log(`🟢 Final count for "${gifName}":`, updatedCount)

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    },
    body: JSON.stringify({ count: updatedCount })
  }
}