export const config = { path: '/api/tts-google' };

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
    try { if (typeof event?.json === 'function') body = await event.json(); else body = JSON.parse(event?.body || '{}'); } catch {}
    const { text } = body || {};
    // accept both languageCode and language; voiceName and voice
    const language = body?.languageCode || body?.language || 'en-US';
    const requestedVoiceName = body?.voiceName || body?.voice || null;
    if (!text) return json(400, { error: 'Missing text' });
    const useServiceAcct = !!(process.env.GOOGLE_CLIENT_EMAIL && process.env.GOOGLE_PRIVATE_KEY && process.env.GOOGLE_PROJECT_ID);
    
    // cache best voice per language during dev process lifetime
    if (!globalThis.__voiceCache) globalThis.__voiceCache = new Map();
    const voiceCache = globalThis.__voiceCache;
    // Normalize language for TTS (map e.g., 'zh' -> 'cmn-CN', 'ar' -> 'ar-XA')
    const ttsLangMap = { zh: 'cmn-CN', ar: 'ar-XA' };
    const effLanguage = language?.includes('-') ? language : (ttsLangMap[language] || language || 'en-US');
    let selectedVoiceName = requestedVoiceName || voiceCache.get(effLanguage) || null;
    if (!selectedVoiceName) {
      // fetch voices via service account if available, else API key fallback
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
          const [vResp] = await client.listVoices({ languageCode: effLanguage });
          voices = vResp?.voices || [];
        } catch {}
      }
      if (!voices.length) {
        const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
        if (!apiKey) return json(500, { error: 'Google API key not configured' });
        const vResp = await fetch(`https://texttospeech.googleapis.com/v1/voices?languageCode=${encodeURIComponent(effLanguage)}&key=${apiKey}`);
        const vData = await vResp.json();
        voices = Array.isArray(vData?.voices) ? vData.voices : [];
      }
      const byPreference = (nameFrag) => voices.filter((v) => (v?.name || '').includes(nameFrag));
      const male = (arr) => arr.filter((v) => (v?.ssmlGender || v?.ssmlGender === 'MALE' || (v?.ssmlGender || '').includes?.('MALE')));
      let candidates = male(byPreference('Neural2'));
      if (!candidates.length) candidates = male(byPreference('Wavenet'));
      if (!candidates.length) candidates = male(voices);
      if (!candidates.length) candidates = voices;
      selectedVoiceName = candidates?.[0]?.name || null;
      if (selectedVoiceName) voiceCache.set(effLanguage, selectedVoiceName);
    }

    const payload = {
      input: { text },
      voice: selectedVoiceName ? { name: selectedVoiceName } : { languageCode: effLanguage, ssmlGender: 'MALE' },
      audioConfig: { audioEncoding: 'MP3', speakingRate: 0.9, pitch: -4.0 },
    };
    // Try service-account synthesize first if available
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
        const [respSa] = await client.synthesizeSpeech(payload);
        const ac = respSa?.audioContent?.toString('base64');
        if (ac) return json(200, { audioContent: ac, mimeType: 'audio/mpeg', voiceName: selectedVoiceName || undefined });
      } catch (e) {
        // continue to API key fallback
      }
    }
    // Fallback to API key REST
    const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
    if (!apiKey) return json(500, { error: 'Google API key not configured' });
    const resp = await fetch(`https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
    });
    const data = await resp.json();
    const audioContent = data?.audioContent;
    if (!audioContent) {
      // Retry removing specific voice name (use only languageCode)
      const payloadLangOnly = {
        input: { text },
        voice: { languageCode: effLanguage, ssmlGender: 'MALE' },
        audioConfig: { audioEncoding: 'MP3', speakingRate: 0.9, pitch: -4.0 },
      };
      const resp2 = await fetch(`https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payloadLangOnly)
      });
      const data2 = await resp2.json();
      const ac2 = data2?.audioContent;
      if (ac2) return json(200, { audioContent: ac2, mimeType: 'audio/mpeg', voiceName: undefined });
      // Final fallback to English if target locale unsupported
      const fallbackLocales = ['en-IN', 'en-US'];
      for (const loc of fallbackLocales) {
        const payloadFallback = {
          input: { text },
          voice: { languageCode: loc, ssmlGender: 'MALE' },
          audioConfig: { audioEncoding: 'MP3', speakingRate: 0.9, pitch: -4.0 },
        };
        const rf = await fetch(`https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payloadFallback)
        });
        const df = await rf.json();
        if (df?.audioContent) return json(200, { audioContent: df.audioContent, mimeType: 'audio/mpeg', voiceName: undefined });
      }
      return json(500, { error: 'No audio content', details: data, request: payload });
    }
    return json(200, { audioContent, mimeType: 'audio/mpeg', voiceName: selectedVoiceName || undefined });
  } catch (e) {
    return json(500, { error: 'TTS error', details: e?.message || String(e) });
  }
}


