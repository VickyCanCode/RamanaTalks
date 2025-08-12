let currentAudio: HTMLAudioElement | null = null;
let currentSrc: string | null = null;
let lastVoiceByLang: Record<string, string | undefined> = (() => {
  try {
    const raw = localStorage.getItem('tts_last_voice_map');
    if (!raw) return {};
    const obj = JSON.parse(raw);
    return obj && typeof obj === 'object' ? obj : {};
  } catch { return {}; }
})();
let onLoadingChange: ((loading: boolean) => void) | null = null;

export function setTtsLoadingListener(cb: ((loading: boolean) => void) | null): void {
  onLoadingChange = cb;
}

function mapLangToTts(code?: string): string {
  if (!code) return 'en-US';
  if (code.includes('-')) return code;
  const base = code.toLowerCase();
  const map: Record<string, string> = {
    en: 'en-US',
    hi: 'hi-IN',
    ta: 'ta-IN',
    te: 'te-IN',
    kn: 'kn-IN',
    ml: 'ml-IN',
    bn: 'bn-IN',
    gu: 'gu-IN',
    mr: 'mr-IN',
    pa: 'pa-IN',
    or: 'or-IN',
    sa: 'sa-IN',
    es: 'es-ES',
    fr: 'fr-FR',
    de: 'de-DE',
    it: 'it-IT',
    pt: 'pt-PT',
    ru: 'ru-RU',
    ja: 'ja-JP',
    ko: 'ko-KR',
    zh: 'cmn-CN',
    ar: 'ar-XA',
  };
  return map[base] || 'en-US';
}

export async function speak(text: string, lang?: string, voiceName?: string): Promise<void> {
  try {
    // If the same text is requested while playing, toggle pause/resume
    if (currentAudio && currentSrc === text) {
      if (currentAudio.paused) currentAudio.play().catch(() => {});
      else currentAudio.pause();
      return;
    }
    // Stop existing audio
    if (currentAudio) { try { currentAudio.pause(); currentAudio.currentTime = 0; } catch {} currentAudio = null; }
    currentSrc = text;
    onLoadingChange?.(true);
    const ttsLang = mapLangToTts(lang);
    let res: Response | null = null;
    let out: any = null;
    try {
      res = await fetch('/api/tts-google', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, languageCode: ttsLang, voiceName: voiceName || lastVoiceByLang[ttsLang] || undefined }) });
      if (!res.ok) throw new Error(String(res.status));
      out = await res.json();
    } catch (_e) {
      // Fallback to direct Netlify functions dev server
      try {
        res = await fetch('http://localhost:8888/api/tts-google', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, languageCode: ttsLang, voiceName: voiceName || lastVoiceByLang[ttsLang] || undefined }) });
        if (!res.ok) throw new Error(String(res.status));
        out = await res.json();
      } catch (e2) {
        console.error('TTS HTTP error', (res && res.status) || 'network', e2);
        return;
      }
    }
    
    const { audioContent, voiceName: usedVoice } = out || {};
    if (usedVoice) { lastVoiceByLang[ttsLang] = usedVoice; try { localStorage.setItem('tts_last_voice_map', JSON.stringify(lastVoiceByLang)); } catch {} }
    if (!audioContent) return;
    const audio = new Audio(`data:audio/mp3;base64,${audioContent}`);
    audio.onended = () => { currentAudio = null; currentSrc = null; };
    currentAudio = audio;
    await audio.play().catch(() => {});
  } catch {}
  finally { onLoadingChange?.(false); }
}

export function stopSpeak(): void {
  try { if (currentAudio) { currentAudio.pause(); currentAudio.currentTime = 0; } } catch {}
  currentAudio = null; currentSrc = null;
}


