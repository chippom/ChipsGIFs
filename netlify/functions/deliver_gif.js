import { createClient } from '@supabase/supabase-js';
import { Buffer } from 'buffer'; // Ensure Buffer is available in Netlify environment

// Initialize Supabase client with service role key for full DB rights
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Helper to validate gifName parameter to allow only safe characters
function isValidGifName(name) {
  // Allow alphanumeric characters, dashes, underscores, dots (mainly for ".gif")
  return typeof name === 'string' && /^[a-zA-Z0-9_\-\.]+$/.test(name);
}

export async function handler(event) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'no-store',
  };

  try {
    // Accept only GET requests
    if (event.httpMethod !== 'GET') {
      return {
        statusCode: 405,
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Method Not Allowed' }),
      };
    }

    // Validate required query param gif_name; sanitize input
    const gifNameRaw =
      event.queryStringParameters?.gif_name ||
      event.queryStringParameters?.gifname;

    if (!gifNameRaw || !isValidGifName(gifNameRaw)) {
      return {
        statusCode: 400,
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Missing or invalid gif_name parameter' }),
      };
    }
    const gifName = gifNameRaw;

    // Prepare timestamp and page/referrer info
    const timestamp = new Date().toISOString();
    const page = event.headers.referer || 'direct-link';

    // Optional: IP geolocation lookup for visitor enrichment
    let location = 'lookup disabled';
    let country = 'unknown';
    try {
      const ip =
        event.headers['x-nf-client-connection-ip'] ||
        event.headers['x-forwarded-for'] ||
        'unknown';
      if (ip !== 'unknown' && process.env.IPINFOTOKEN) {
        const geoRes = await fetch(`https://ipinfo.io/${ip}/json?token=${process.env.IPINFOTOKEN}`);
        if (geoRes.ok) {
          const geo = await geoRes.json();
          country = geo.country || 'unknown';
          if (geo.city && geo.region) {
            location = `${geo.city}, ${geo.region}, ${country}`;
          } else if (geo.region) {
            location = `${geo.region}, ${country}`;
          } else if (country !== 'unknown') {
            location = country;
          }
        }
      }
    } catch (geoErr) {
      console.warn('Geo lookup failed:', geoErr.message);
    }

    // Log download attempt into 'gif_downloads' table (fallback method)
    try {
      const { data, error } = await supabase
        .from('gif_downloads')
        .insert([
          {
            gif_name: gifName,
            timestamp,
            page,
            method: 'fallback',
          },
        ]);
      if (error) {
        console.error('❌ gif_downloads insert error:', error.message);
      } else {
        console.log('✅ gif_downloads insert success:', data);
      }
    } catch (logError) {
      console.warn('🟠 Uncaught logging error:', logError.message);
    }

    // Upsert visitor logs keyed on a visitorid (using 'anonymous' fallback here)
    try {
      const visitorId = 'anonymous'; // Adjust to real visitor IDs if available
      await supabase
        .from('visitor_logs')
        .upsert(
          {
            visitorid: visitorId,
            useragent: event.headers['user-agent'] || 'unknown',
            page,
            referrer: event.headers.referer || 'none',
            timestamp,
            gif_name: gifName,
            location,
            country,
          },
          { onConflict: 'visitorid' }
        );
    } catch (visitorErr) {
      console.error('❌ visitor_logs upsert error:', visitorErr.message);
    }

    // Insert into gif_download_summary table for analytics
    try {
      await supabase.from('gif_download_summary').insert([
        {
          gif_name: gifName,
          timestamp,
          easternTime: new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }),
          referrer: event.headers.referer || 'none',
          location,
          country,
        },
      ]);
    } catch (summaryErr) {
      console.error('❌ gif_download_summary insert error:', summaryErr.message);
    }

    // Fetch the actual GIF file from your storage (ensure fileName is properly decoded)
    const decodedGifName = decodeURIComponent(gifName);
    const fileUrl = `https://chips-gifs.com/gifs/${decodedGifName}`;
    console.log(`Fetching GIF from URL: ${fileUrl}`); // Debug log to track fetching URL
    const res = await fetch(fileUrl);

    if (res.status === 404) {
      console.warn(`GIF not found: ${decodedGifName}`);
      return {
        statusCode: 404,
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'GIF not found' }),
      };
    }

    if (!res.ok) {
      throw new Error(`Fetch failed: ${res.status} ${res.statusText}`);
    }

    // Convert response to base64 encoded string
    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64Body = buffer.toString('base64');

    const contentType = res.headers.get('Content-Type') || 'application/octet-stream';

    console.log(`Serving GIF: ${decodedGifName} with Content-Type: ${contentType}`);

    return {
      statusCode: 200,
      isBase64Encoded: true,
      headers: {
        ...headers,
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${decodedGifName}"`,
      },
      body: base64Body,
    };
  } catch (err) {
    // Final catch-all for unexpected errors
    console.error('🧨 Uncaught error in deliver_gif.js:', err.message);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      },
      body: JSON.stringify({ error: 'Server error' }),
    };
  }
}