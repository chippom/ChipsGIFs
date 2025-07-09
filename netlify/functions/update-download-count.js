import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' }
  }

  let gifName
  try {
    gifName = JSON.parse(event.body).gif_name
  } catch {
    return { statusCode: 400, body: 'Invalid JSON body' }
  }

  if (!gifName) {
    return { statusCode: 400, body: 'gif_name is required' }
  }

  // Upsert: insert or update the row
  const { error: upsertError } = await supabase
    .from('downloads')
    .upsert(
      { gif_name: gifName, count: 1 },
      { onConflict: ['gif_name'] }
    )

  if (upsertError) {
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({ error: upsertError.message })
    }
  }

  // Fetch the updated count
  const { data, error: fetchError } = await supabase
    .from('downloads')
    .select('count')
    .eq('gif_name', gifName)
    .single()

  console.log("🔍 Supabase fetch result:", data)

  if (fetchError || !data) {
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({ count: "unavailable" })
    }
  }

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    },
    body: JSON.stringify({ count: data.count })
  }
}