import { AccessToken } from 'livekit-server-sdk';

export const config = { path: '/api/livekit-token' };

function json(statusCode, body) {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
  };
  return new Response(JSON.stringify(body), { status: statusCode, headers });
}

export default async function handler(event) {
  const method = event?.method || event?.httpMethod || 'GET';
  if (method === 'OPTIONS') return json(200, {});
  if (method !== 'POST') return json(405, { error: 'Method Not Allowed' });
  try {
    let body = {};
    try {
      if (typeof event?.json === 'function') {
        body = await event.json();
      } else {
        body = JSON.parse(event?.body || '{}');
      }
    } catch {
      body = {};
    }
    const { roomId: rid, room, identity, name, role } = body;
    const roomId = rid || room;
    if (!roomId || !identity) return json(400, { error: 'roomId and identity are required' });

    const url = process.env.LIVEKIT_URL || process.env.VITE_LIVEKIT_URL;
    const apiKey = process.env.LIVEKIT_API_KEY || process.env.VITE_LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET || process.env.VITE_LIVEKIT_API_SECRET;
    if (!url || !apiKey || !apiSecret) return json(500, { error: 'LiveKit env not configured' });

    const canPublish = ['speaker', 'moderator', 'cohost', 'host'].includes(role);
    const at = new AccessToken(apiKey, apiSecret, { identity, name: name || identity });
    at.addGrant({ room: roomId, roomJoin: true, canPublish, canSubscribe: true });
    const token = await at.toJwt();
    return json(200, { token, url });
  } catch (e) {
    return json(500, { error: 'Internal error', details: e?.message || String(e) });
  }
}


