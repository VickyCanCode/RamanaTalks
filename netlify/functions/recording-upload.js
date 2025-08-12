export const config = { path: '/api/recording-upload' };

function json(status, body) {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  };
  return new Response(JSON.stringify(body), { status, headers });
}

export default async function handler(event) {
  const method = event?.method || event?.httpMethod || 'GET';
  if (method === 'OPTIONS') return json(200, {});
  if (method !== 'POST') return json(405, { error: 'Method Not Allowed' });
  try {
    let body = {};
    try { body = typeof event?.json === 'function' ? await event.json() : JSON.parse(event?.body || '{}'); } catch {}
    const { roomId, fileBase64, fileName } = body || {};
    if (!roomId || !fileBase64) return json(400, { error: 'Missing roomId or fileBase64' });
    const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_BD_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseKey) return json(500, { error: 'Supabase Service Role not configured' });
    const safeName = (fileName || `recording-${Date.now()}.webm`).replace(/[^a-zA-Z0-9_.-]/g,'_');
    const path = `${roomId}/${safeName}`;
    const buffer = Buffer.from(fileBase64, 'base64');
    const isWebm = /\.webm$/i.test(safeName);
    const contentType = isWebm ? 'audio/webm' : 'application/octet-stream';
    const resp = await fetch(`${supabaseUrl}/storage/v1/object/satsang-recordings/${encodeURIComponent(path)}`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${supabaseKey}`, 'Content-Type': contentType },
      body: buffer
    });
    if (!resp.ok) {
      const e = await resp.text().catch(()=> '');
      return json(resp.status, { error: 'Upload failed', details: e });
    }
    return json(200, { ok: true, path });
  } catch (e) {
    return json(500, { error: 'recording-upload error', details: e?.message || String(e) });
  }
}


