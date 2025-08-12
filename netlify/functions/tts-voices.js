export const config = { path: '/api/tts-voices' };

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
  try {
    const useServiceAcct = !!(process.env.GOOGLE_CLIENT_EMAIL && process.env.GOOGLE_PRIVATE_KEY && process.env.GOOGLE_PROJECT_ID);
    let languageCode = 'en-US';
    try {
      if (method === 'GET') {
        const url = new URL(event?.url || event?.rawUrl || 'http://local');
        languageCode = url.searchParams.get('languageCode') || languageCode;
      } else {
        const body = typeof event?.json === 'function' ? await event.json() : JSON.parse(event?.body || '{}');
        languageCode = body?.languageCode || languageCode;
      }
    } catch {}

    let voices = [];
    if (useServiceAcct) {
      try {
        const { TextToSpeechClient } = await import('@google-cloud/text-to-speech');
        const client = new TextToSpeechClient({
          credentials: {
            client_email: process.env.GOOGLE_CLIENT_EMAIL,
            private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
          },
          projectId: process.env.GOOGLE_PROJECT_ID,
        });
        const [resp] = await client.listVoices({ languageCode });
        voices = resp?.voices || [];
      } catch {}
    }
    if (!voices.length) {
      const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
      if (!apiKey) return json(500, { error: 'Google API key not configured' });
      const resp = await fetch(`https://texttospeech.googleapis.com/v1/voices?languageCode=${encodeURIComponent(languageCode)}&key=${apiKey}`);
      const data = await resp.json();
      voices = Array.isArray(data?.voices) ? data.voices : [];
    }
    const simplified = voices.map((v) => ({
      name: v.name,
      languageCodes: v.languageCodes,
      ssmlGender: v.ssmlGender,
      naturalSampleRateHertz: v.naturalSampleRateHertz,
    }));
    return json(200, { languageCode, voices: simplified });
  } catch (e) {
    return json(500, { error: 'VOICES error', details: e?.message || String(e) });
  }
}


