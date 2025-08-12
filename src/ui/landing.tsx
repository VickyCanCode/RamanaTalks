import React, { useMemo } from 'react';
import { MessagesSquare, Volume2, Headphones } from 'lucide-react';

type Props = { onGoChat: () => void; onGoSatsang: () => void };

const backgrounds = [
  '/ram/blessing-the-offering-to-the-mothers-temple.jpg',
  '/ram/color-arunachala-for-smaller-sizes.jpg',
  '/ram/img_0050.jpg',
  '/ram/on-couch-in-old-hall-on-tiger-skin_legs-crossed.jpg',
  '/ram/ramana-maharshi-featured-image.jpg',
  '/ram/desktop-wallpaper-sri-ramana-maharshi-guru-is-the-self-ramana-maharshi.jpg',
  '/ram/r-2.jpg',
  '/ram/r-3.jpg',
  '/ram/r4.jpg',
  '/ram/ramanaa.jpg',
  '/ram/group-copy-1024x607.jpg'
];

export default function Landing({ onGoChat, onGoSatsang }: Props): JSX.Element {
  const bg = useMemo(() => backgrounds[Math.floor(Math.random() * backgrounds.length)], []);
  const quotes = [
    'The question “Who am I?” is not meant to get an answer, but to dissolve the questioner.',
    'Happiness is your nature. It is not wrong to desire it. What is wrong is seeking it outside.',
    'Your own Self-Realization is the greatest service you can render the world.',
    'The mind turned inward is the Self; turned outward it becomes the ego and the world.',
    'Find out who suffers; then the suffering will cease of itself.'
  ];
  const quote = useMemo(() => quotes[Math.floor(Math.random() * quotes.length)], []);

  return (
    <div style={{ position: 'relative', minHeight: 'calc(100vh - 48px)', color: '#eee', overflow: 'hidden' }}>
      <div
        aria-hidden
        style={{
          position: 'absolute', inset: 0,
          backgroundImage: `url(${bg})`,
          backgroundSize: 'cover', backgroundPosition: 'center', filter: 'blur(2px) brightness(0.6)'
        }}
      />
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(0,0,0,0.5), rgba(0,0,0,0.75))' }} />
      <div style={{ position: 'relative', zIndex: 1, minHeight: 'calc(100vh - 48px)', padding: 24, display:'flex', flexDirection:'column', justifyContent:'center' }}>
        <div style={{ maxWidth: 760, textAlign: 'center', margin: '0 auto', display: 'flex', flexDirection:'column', alignItems:'center', justifyContent:'center' }}>
          <blockquote style={{ fontSize: 20, lineHeight: 1.6, fontStyle: 'italic', opacity: 0.98, margin: '0 auto 16px', borderLeft: '3px solid rgba(255,255,255,0.2)', padding: '10px 14px', display:'inline-block', background:'rgba(0,0,0,0.35)', borderRadius:10 }}>
            “{quote}”
          </blockquote>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button onClick={onGoChat} style={{ padding: '12px 18px', borderRadius: 999, border: '1px solid #2e7d32', background: '#154a28', color: '#d7ffd9', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}><MessagesSquare size={18} /> Enter Chat</button>
            <button onClick={onGoSatsang} style={{ padding: '12px 18px', borderRadius: 999, border: '1px solid #2d4ea3', background: '#0f1b3a', color: '#c8d6ff', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}><Volume2 size={18} /> Join Satsang</button>
            <button onClick={() => { try { location.hash = '#podcasts'; } catch {} }} style={{ padding: '12px 18px', borderRadius: 999, border: '1px solid #8a5a2b', background: '#2b1a0a', color: '#f0c28b', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}><Headphones size={18} /> Podcasts</button>
          </div>
        </div>
      </div>
    </div>
  );
}


