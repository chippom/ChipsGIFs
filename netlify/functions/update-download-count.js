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

  let updatedCount = 1

  try {
    const { data: existingRow, error: fetchError } = await supabase
      .from('downloads')
      .select('count')
      .eq('gif_name', gifName)
      .single()

    console.log("🔍 Existing row:", existingRow)

    if (existingRow?.count !== undefined) {
      updatedCount = existingRow.count + 1
    }

    // 🌆 New York time
    const nyTimeString = new Date().toLocaleString("en-US", {
      timeZone: "America/New_York"
    })
    const timestamp_ny = new Date(nyTimeString).toISOString()

    const { error: upsertError } = await supabase
      .from('downloads')
      .upsert(
        {
          gif_name: gifName,
          count: updatedCount,
          timestamp: new Date().toISOString(), // ⏱️ UTC
          timestamp_ny                      // 🗽 New York time
        },
        { onConflict: ['gif_name'] }
      )

    if (upsertError) {
      console.error("❌ Upsert error:", upsertError.message)
    }

    console.log(`✅ Final count for "${gifName}":`, updatedCount)

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({ count: updatedCount ?? 1 })
    }
  } catch (err) {
    console.error("🚨 Unexpected error:", err.message)
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({ count: 1 }) // fallback
    }
  }
}