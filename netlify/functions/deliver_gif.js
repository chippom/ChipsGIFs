import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client with service role key for full DB rights
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Helper to validate gifName parameter to allow only safe characters    
function isValidGifName(name) {
  // Allow alphanumeric, dash, underscore, dot (mainly for ".gif" extension)
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
        headers: {
          ...headers,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ error: 'Method Not Allowed' }),
      };
    }

    // Validate required query param gif_name; sanitize input
    const gifNameRaw = event.queryStringParameters?.gif_name || event.queryStringParameters?.gifname;
    if (!gifNameRaw || !isValidGifName(gifNameRaw)) {
      return {
        statusCode: 400,
        headers: {
          ...headers,
          'Content-Type': 'application/json',
        },
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
      const ip = event.headers['x-nf-client-connection-ip'] || event.headers['x-forwarded-for'] || 'unknown';
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

    // --- Additional Inserts to Other Tables to Fix Missing Logging Issues ---

    // Upsert visitor logs keyed on e.g., visitorid (if available) or use dummy for now
    // Assuming you have visitor identification logic elsewhere,
    // Here just inserting anonymous visitor log with page info and gifName
    try {
      // Dummy visitorId until you add visitor logic; can be removed or integrated as needed
      const visitorId = 'anonymous'; 
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

    // Insert into gif_download_summary table for analytics/summary
    try {
      await supabase.from('gif_download_summary').insert([
        {
          gif_name: gifName,
          timestamp,
          easterntime: new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }),
          referrer: event.headers.referer || 'none',
          location,
          country,
        },
      ]);
    } catch (summaryErr) {
      console.error('❌ gif_download_summary insert error:', summaryErr.message);
    }

    // Fetch the actual GIF file from your storage and return as base64 encoded for download
    const fileUrl = `https://chips-gifs.com/gifs/${gifName}`;
    const res = await fetch(fileUrl);
    if (!res.ok) {
      throw new Error(`Fetch failed: ${res.status} ${res.statusText}`);
    }

    // Convert response to base64 encoded string
    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64Body = buffer.toString('base64');

    // Determine content type from fetched file headers or default
    const contentType = res.headers.get('Content-Type') || 'application/octet-stream';

    return {
      statusCode: 200,
      isBase64Encoded: true,
      headers: {
        ...headers,
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${gifName}"`,
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