import { createClient } from '@supabase/supabase-js';
import path from 'path';
import fs from 'fs/promises';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function handler(event) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'no-store'
  };

  try {
    if (event.httpMethod !== 'GET') {
      return {
        statusCode: 405,
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Method Not Allowed' })
      };
    }

    const gifName = event.queryStringParameters?.gif_name;
    if (!gifName) {
      return {
        statusCode: 400,
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Missing gif_name parameter' })
      };
    }

    // Optional Logging: fallback route, no count update
    try {
      const timestamp = new Date().toISOString();
      const page = event.headers.referer || 'direct-link';

      await supabase.from('gif_downloads').insert([{
        gif_name: gifName,
        timestamp,
        page,
        method: 'fallback'
      }]);
    } catch (logError) {
      console.warn('🟠 Logging fallback download failed:', logError.message);
    }

    // Serve GIF file
    try {
      const filePath = path.resolve(__dirname, '../../gifs', gifName);
      const fileBuffer = await fs.readFile(filePath);
      return {
        statusCode: 200,
        headers: {
          ...headers,
          'Content-Type': 'image/gif',
          'Content-Disposition': `attachment; filename="${gifName}"`
        },
        body: fileBuffer.toString('base64'),
        isBase64Encoded: true
      };
    } catch (fileError) {
      console.error('❌ Could not read GIF file:', fileError.message);
      return {
        statusCode: 404,
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'GIF not found' })
      };
    }

  } catch (err) {
    console.error('🧨 Uncaught error in deliver_gif.js:', err.message);
    return {
      statusCode: 500,
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Server error' })
    };
  }
}
