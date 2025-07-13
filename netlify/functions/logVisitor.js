import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function handler(event) {
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
    console.warn('Location lookup failed:', err.message);
  }

  const { error } = await supabase
    .from('visitor_logs')
    .insert([{
      visitor_id,
      page,
      referrer,
      userAgent,
      location,
      ip,
      gif_name,
      timestamp: new Date().toISOString()
    }]);

  if (error) {
    console.error('Supabase insert error:', error.message);
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