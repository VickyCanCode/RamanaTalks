export const config = { path: '/api/stt-google' };

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
    try {
      if (typeof event?.json === 'function') body = await event.json();
      else body = JSON.parse(event?.body || '{}');
    } catch {}
    const { audio, mime, language } = body || {};
    if (!audio) return json(400, { error: 'Missing audio (base64)' });
    const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
    if (!apiKey) return json(500, { error: 'Google API key not configured' });

    // Determine encoding from mime
    let encoding = 'ENCODING_UNSPECIFIED';
    if ((mime || '').includes('webm')) encoding = 'WEBM_OPUS';
    if ((mime || '').includes('ogg')) encoding = 'OGG_OPUS';
    if ((mime || '').includes('wav')) encoding = 'LINEAR16';

    // Build language preference and alternatives
    let lang = language && language !== 'auto' ? language : 'en-IN';
    const altPool = ['en-IN','hi-IN','ta-IN','te-IN','kn-IN','ml-IN','bn-IN','gu-IN','mr-IN','pa-IN','or-IN','en-US'];
    const alternativeLanguageCodes = altPool.filter((code) => code !== lang);
    try {
      const hintText = (body?.hint || '').toString();
      const isLatin = /^[\p{L}\p{N}\p{P}\p{Zs}]*$/u.test(hintText);
      const looksIndian = /(ga|ra|la|ch|aa|ee|oo|amma|anna|santosham|bagunnara|ela|vundali)/i.test(hintText);
      if (!language && isLatin && looksIndian) lang = 'en-IN';
    } catch {}
    const payload = {
      config: {
        languageCode: lang,
        alternativeLanguageCodes,
        enableAutomaticPunctuation: true,
        encoding,
      },
      audio: { content: audio },
    };
    const resp = await fetch(`https://speech.googleapis.com/v1/speech:recognize?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await resp.json();
    const text = data?.results?.[0]?.alternatives?.[0]?.transcript || '';
    // Try to determine detected language
    let detectedLanguage = data?.results?.[0]?.languageCode || null;
    if (!detectedLanguage) {
      // Heuristic based on Unicode blocks
      const s = (text || '').toString();
      const ranges = [
        { re: /[\u0C00-\u0C7F]/, code: 'te-IN' }, // Telugu
        { re: /[\u0B80-\u0BFF]/, code: 'ta-IN' }, // Tamil
        { re: /[\u0900-\u097F]/, code: 'hi-IN' }, // Devanagari (Hindi/Sanskrit)
        { re: /[\u0C80-\u0CFF]/, code: 'kn-IN' }, // Kannada
        { re: /[\u0D00-\u0D7F]/, code: 'ml-IN' }, // Malayalam
        { re: /[\u0980-\u09FF]/, code: 'bn-IN' }, // Bengali
        { re: /[\u0A80-\u0AFF]/, code: 'gu-IN' }, // Gujarati
        { re: /[\u0A00-\u0A7F]/, code: 'pa-IN' }, // Gurmukhi (Punjabi)
        { re: /[\u0B00-\u0B7F]/, code: 'or-IN' }, // Odia
      ];
      for (const r of ranges) {
        if (r.re.test(s)) { detectedLanguage = r.code; break; }
      }
      if (!detectedLanguage) detectedLanguage = lang;
    }
    return json(200, { text, detectedLanguage, raw: data });
  } catch (e) {
    return json(500, { error: 'STT error', details: e?.message || String(e) });
  }
}


