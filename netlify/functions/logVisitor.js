import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function handler(event) {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'no-store'
  };

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
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
      headers,
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

  const requestReferrer = event.headers.referer || 'direct-link';
  const pageValue = page || requestReferrer;
  const referrerValue = referrer || requestReferrer;
  const ip = event.headers['x-nf-client-connection-ip'] || 'unknown';

  if (excludeTester) {
    console.log('🚫 Visitor excluded from tracking.');
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ message: 'Visitor excluded from tracking.' })
    };
  }

  let location = 'lookup disabled';
  try {
    const geoRes = await fetch(
      `https://ipinfo.io/${ip}/json?token=${process.env.IPINFO_TOKEN}`
    );
    const geo = await geoRes.json();
    if (geo.city && geo.region) {
      location = `${geo.city}, ${geo.region}`;
    }
  } catch (err) {
    console.warn('🌐 Location lookup failed:', err.message);
  }

  const timestamp = new Date().toISOString();

  // --- VISITOR LOGS (has gif_name, page, and referrer) ---
  const visitorPayload = {
    visitor_id,
    ip,
    location,
    useragent: userAgent,
    page: pageValue,
    referrer: referrerValue,
    timestamp,
    gif_name // ensures gif_name is recorded!
  };
  const { error: visitorLogsError } = await supabase.from('visitor_logs').insert([visitorPayload]);
  if (visitorLogsError) console.error('visitor_logs insert error:', visitorLogsError);

  // --- GIF DOWNLOADS (event-level log) ---
  if (gif_name && visitor_id) {
    const gifDownloadPayload = {
      gif_name,
      visitor_id,
      timestamp,
      ip,
      location,
      page: pageValue
    };
    const { error: gifDownloadsError } = await supabase.from('gif_downloads').insert([gifDownloadPayload]);
    if (gifDownloadsError) console.error('gif_downloads insert error:', gifDownloadsError);
  }

  // --- GIF DOWNLOAD SUMMARY (uses referrer, not page) ---
  if (gif_name) {
    const summaryPayload = {
      gif_name,
      timestamp,
      ip,
      location,
      referrer: referrerValue
    };
    const { error: summaryError } = await supabase.from('gif_download_summary').insert([summaryPayload]);
    if (summaryError) console.error('gif_download_summary insert error:', summaryError);
  }

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({ message: 'Visit logged successfully.' })
  };
}
