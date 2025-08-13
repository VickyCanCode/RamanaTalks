import React, { useMemo, useRef, useState } from 'react';
import { Headphones, Play, Pause, Languages } from 'lucide-react';

type Track = {
  id: string;
  title: string;
  description?: string;
  fileName: string; // located in public/
  cover?: string;
  lang?: string; // e.g., 'EN', 'TE'
};

const TRACKS: Track[] = [
  {
    id: 'who-am-i-en',
    title: 'Who am I? Self-enquiry and liberation',
    description: 'A guided reflection on Sri Ramana Maharshi’s core teaching.',
    fileName: 'who am i_ self-enquiry and liberation by ramana maharshi.wav',
    cover: '/ramana-portrait.jpg',
    lang: 'EN',
  },
  {
    id: 'nenu-evaru-te',
    title: 'నేను ఎవరు? రమణ మహర్షి బోధనలు',
    description: 'స్వాన్వేషణపై శ్రీ రమణ మహర్షి బోధనలు.',
    fileName: 'నేను ఎవరు_ రమణ మహర్షి బోధనలు.wav',
    cover: '/ramana.jpg',
    lang: 'TE',
  },
];

export default function Podcasts(): JSX.Element {
  const [currentId, setCurrentId] = useState<string | null>(null);
  const audioRefs = useRef<Record<string, HTMLAudioElement | null>>({});
  const [durations, setDurations] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, boolean>>({});

  const bg = useMemo(() => '/aesthetic-background-with-gradient-neon-led-light-effect.jpg', []);

  function formatTime(seconds: number): string {
    if (!Number.isFinite(seconds)) return '';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  function onToggle(track: Track): void {
    const id = track.id;
    const node = audioRefs.current[id];
    if (!node) return;
    if (currentId === id && !node.paused) {
      try { node.pause(); } catch {}
      setCurrentId(null);
    } else {
      // pause others
      Object.entries(audioRefs.current).forEach(([tid, el]) => {
        try { if (tid !== id) el?.pause(); } catch {}
      });
      try { node.play(); setCurrentId(id); } catch {}
    }
  }

  function buildSources(fileName: string): string[] {
    // Prefer ASCII-safe alias when present for CDN/device compatibility
    if (fileName === 'నేను ఎవరు_ రమణ మహర్షి బోధనలు.wav') {
      return ['/podcast-te.wav', '/%70%6f%64%63%61%73%74%2d%74%65%2e%77%61%76'];
    }

    const raw = '/' + fileName;
    const candidates = new Set<string>();
    try { candidates.add(encodeURI(raw)); } catch {}
    try { candidates.add(encodeURI(('/' + fileName).normalize('NFC'))); } catch {}
    try { candidates.add(encodeURI(('/' + fileName).normalize('NFD'))); } catch {}
    try { candidates.add('/' + encodeURIComponent(fileName)); } catch {}
    return Array.from(candidates);
  }

  return (
    <div style={{ position: 'relative', minHeight: 'calc(100vh - 48px)', color: '#eee' }}>
      <div aria-hidden style={{ position: 'absolute', inset: 0, backgroundImage: `linear-gradient(rgba(0,0,0,0.45), rgba(0,0,0,0.55)), url(${bg})`, backgroundSize: 'cover', backgroundPosition: 'center', backgroundAttachment: 'fixed' }} />
      <main style={{ position: 'relative', zIndex: 1, padding: 16, minHeight: 'calc(100vh - 48px)' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', width: '100%', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ fontSize: 18, fontWeight: 800 }}>Podcasts</div>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 800, padding: '2px 8px', borderRadius: 999, border: '1px solid #333', background: '#1a1a1a', color: '#ccc' }}>
                <Headphones size={12} /> Listen and reflect
              </span>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 12 }}>
            {TRACKS.map((t) => {
              const sources = buildSources(t.fileName);
              const isActive = currentId === t.id;
              return (
                <div key={t.id} style={{ padding: 14, borderRadius: 12, border: '1px solid #333', background: '#0f0f0f', color: '#ddd', display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <img src={t.cover || '/ramana.jpg'} alt="cover" style={{ width: 64, height: 64, borderRadius: 8, objectFit: 'cover', border: '1px solid #333', flexShrink: 0 }} />
                    <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <div style={{ fontWeight: 800, fontSize: 16, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</div>
                      <div style={{ fontSize: 12, opacity: 0.8 }}>{t.description || '—'}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, opacity: 0.8 }}>
                        {t.lang ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Languages size={12} /> {t.lang}</span> : null}
                        {durations[t.id] ? <span>{durations[t.id]}</span> : null}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <button onClick={() => onToggle(t)} style={{ padding: '10px 14px', borderRadius: 10, border: '1px solid #2e7d32', background: '#154a28', color: '#d7ffd9', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                      {isActive ? <Pause size={16} /> : <Play size={16} />} {isActive ? 'Pause' : 'Play'}
                    </button>
                  </div>
                  <audio
                    ref={(el) => { audioRefs.current[t.id] = el; }}
                    preload="metadata"
                    onLoadedMetadata={(e) => {
                      const d = (e.currentTarget as HTMLAudioElement).duration;
                      setDurations((prev) => ({ ...prev, [t.id]: formatTime(d) }));
                    }}
                    onEnded={() => setCurrentId(null)}
                    onError={() => setErrors((prev) => ({ ...prev, [t.id]: true }))}
                    style={{ width: '100%' }}
                    controls
                    controlsList="nodownload noplaybackrate"
                  >
                    {sources.map((s) => (
                      <source key={s} src={s} type="audio/wav" />
                    ))}
                  </audio>
                  {errors[t.id] ? (
                    <div style={{ color: '#f88', fontSize: 12 }}>Audio failed to load. If this persists, try reloading the page.</div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      </main>
    </div>
  );
}


