import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function handler(event) {
  // Log every trigger
  console.log('🔍 Function triggered: method =', event.httpMethod);

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method Not Allowed' })
    };
  }

  let data;
  try {
    data = JSON.parse(event.body);
  } catch (err) {
    console.error('❌ JSON parse error:', err.message);
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Invalid JSON' })
    };
  }

  const {
    visitor_id,
    page,
    referrer,
    userAgent,
    gif_name,
    excludeTester
  } = data;

  const ip = event.headers['x-nf-client-connection-ip'] || 'unknown';

  if (excludeTester) {
    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Visitor excluded from tracking.' })
    };
  }

  let location = 'unknown';
  try {
    const geoRes = await fetch(`https://ipinfo.io/${ip}/json?token=YOUR_TOKEN_HERE`);
    const geo = await geoRes.json();
    if (geo.city && geo.region) {
      location = `${geo.city}, ${geo.region}`;
    }
  } catch (err) {
    console.warn('🌐 Location lookup failed:', err.message);
  }

  // 📝 Log the full payload
  const payload = {
    visitor_id,
    page,
    referrer,
    userAgent,
    location,
    ip,
    gif_name,
    timestamp: new Date().toISOString()
  };
  console.log('📦 Inserting payload into Supabase:', payload);

  const { error } = await supabase.from('visitor_logs').insert([payload]);

  if (error) {
    console.error('🚨 Supabase insert error:', error); // log full error object
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to log visit.' })
    };
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ message: 'Visit logged successfully.' })
  };
}