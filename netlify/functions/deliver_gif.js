import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';
import path from 'path';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Allow only safe characters
function isValidGifName(name) {
  return typeof name === 'string' && /^[a-zA-Z0-9_\-\. ]+$/.test(name);
}

export async function handler(event) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'no-store',
  };

  try {
    if (event.httpMethod !== 'GET') {
      return {
        statusCode: 405,
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Method Not Allowed' }),
      };
    }

    const gifNameRaw =
      event.queryStringParameters?.gif_name ||
      event.queryStringParameters?.gifname;

    const gifName = decodeURIComponent(gifNameRaw || '');

    if (!gifName || !isValidGifName(gifName)) {
      return {
        statusCode: 400,
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Missing or invalid gif_name parameter' }),
      };
    }

    const timestamp = new Date().toISOString();
    const page = event.headers.referer || 'direct-link';

    // --- GEO LOOKUP (unchanged) ---
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

    // --- LOGGING (unchanged) ---
    try {
      await supabase.from('gif_downloads').insert([
        {
          gif_name: gifName,
          timestamp,
          page,
          method: 'direct-file-read',
        },
      ]);
    } catch (err) {
      console.error('gif_downloads insert error:', err.message);
    }

    try {
      await supabase.from('visitor_logs').upsert(
        {
          visitorid: 'anonymous',
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
    } catch (err) {
      console.error('visitor_logs upsert error:', err.message);
    }

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
    } catch (err) {
      console.error('gif_download_summary insert error:', err.message);
    }

    // --- ⭐ CORRECTED FILE PATH ⭐ ---
    const filePath = path.join(process.cwd(), '..', '..', 'chips-gifs', 'gifs', gifName);

    console.log(`Looking for GIF at: ${filePath}`);

    if (!existsSync(filePath)) {
      console.warn(`GIF not found on disk: ${gifName}`);
      return {
        statusCode: 404,
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'GIF not found' }),
      };
    }

    const buffer = readFileSync(filePath);

    console.log(`Serving GIF from disk: ${gifName}`);

    return {
      statusCode: 200,
      isBase64Encoded: true,
      headers: {
        ...headers,
        'Content-Type': 'image/gif',
        'Content-Disposition': `attachment; filename="${gifName}"`,
      },
      body: buffer.toString('base64'),
    };

  } catch (err) {
    console.error('Uncaught error in deliver_gif.js:', err.message);
    return {
      statusCode: 500,
      headers: {
        ...headers,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ error: 'Server error' }),
    };
  }
}
