import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

export async function onRequest(context) {
  const { request, env } = context;

  const headers = {
    'Access-Control-Allow-Origin': '*',
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'no-store',
  };

  try {
    const url = new URL(request.url);
    const gifNameRaw =
      url.searchParams.get('gif_name') ||
      url.searchParams.get('gifname') ||
      '';

    const gifName = decodeURIComponent(gifNameRaw);

    if (!gifName || !/^[a-zA-Z0-9_\-\. ]+$/.test(gifName)) {
      return new Response(
        JSON.stringify({ error: 'Missing or invalid gif_name parameter' }),
        { status: 400, headers: { ...headers, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(
      env.SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY
    );

    const timestamp = new Date().toISOString();
    const referer = request.headers.get('referer') || 'direct-link';

    let location = 'lookup disabled';
    let country = 'unknown';

    try {
      const ip =
        request.headers.get('cf-connecting-ip') ||
        request.headers.get('x-forwarded-for') ||
        'unknown';

      if (ip !== 'unknown' && env.IPINFOTOKEN) {
        const geoRes = await fetch(`https://ipinfo.io/${ip}/json?token=${env.IPINFOTOKEN}`);
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
    } catch (e) {}

    try {
      await supabase.from('gif_downloads').insert([
        {
          gif_name: gifName,
          timestamp,
          page: referer,
          method: 'r2-read',
        },
      ]);
    } catch (e) {}

    try {
      await supabase.from('visitor_logs').upsert(
        {
          visitorid: 'anonymous',
          useragent: request.headers.get('user-agent') || 'unknown',
          page: referer,
          referrer: referer,
          timestamp,
          gif_name: gifName,
          location,
          country,
        },
        { onConflict: 'visitorid' }
      );
    } catch (e) {}

    try {
      await supabase.from('gif_download_summary').insert([
        {
          gif_name: gifName,
          timestamp,
          easternTime: new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }),
          referrer: referer,
          location,
          country,
        },
      ]);
    } catch (e) {}

    const object = await env.CHIPS_GIFS.get(gifName);

    if (!object) {
      return new Response(
        JSON.stringify({ error: 'GIF not found' }),
        { status: 404, headers: { ...headers, 'Content-Type': 'application/json' } }
      );
    }

    const body = await object.arrayBuffer();

    return new Response(body, {
      status: 200,
      headers: {
        ...headers,
        'Content-Type': 'image/gif',
        'Content-Disposition': `attachment; filename="${gifName}"`,
      },
    });

  } catch (err) {
    return new Response(
      JSON.stringify({ error: 'Server error' }),
      { status: 500, headers: { ...headers, 'Content-Type': 'application/json' } }
    );
  }
}
