import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import Login from './login';
import App from './app';
import Profile from './profile';
import Landing from './landing';
import Satsang from './satsang';
import Podcasts from './podcasts';
import SatsangList from './SatsangList';

export default function AppShell(): JSX.Element {
  const [loading, setLoading] = useState(true);
  const [signedIn, setSignedIn] = useState(false);
  const [pendingRoomId, setPendingRoomId] = useState<string | null>(null);
  const [routeHash, setRouteHash] = useState<string>(typeof location !== 'undefined' ? (location.hash || '') : '');

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      setSignedIn(!!data.session);
      setLoading(false);
    })();
    try {
      const hash = location.hash || '';
      const m = hash.match(/^#satsang\/(.+)$/);
      if (m) setPendingRoomId(decodeURIComponent(m[1]));
      setRouteHash(hash);
    } catch {}

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setSignedIn(!!session);
    });
    const onHash = () => {
      try {
        const h = location.hash || '';
        setRouteHash(h);
        const mm = h.match(/^#satsang\/(.+)$/);
        if (mm) setPendingRoomId(decodeURIComponent(mm[1]));
      } catch {}
    };
    window.addEventListener('hashchange', onHash);
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
      window.removeEventListener('hashchange', onHash);
    };
  }, []);

  useEffect(() => {
    if (signedIn && pendingRoomId) {
      try { location.hash = `#satsang/${encodeURIComponent(pendingRoomId)}`; } catch {}
      setPendingRoomId(null);
    }
  }, [signedIn, pendingRoomId]);

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0b0b0b', color: '#eaeaea' }}>
        Loading…
      </div>
    );
  }

  if (signedIn) return <AuthedApp />;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: 'radial-gradient(1200px 600px at -10% -10%, rgba(20,60,40,0.35), transparent 60%), radial-gradient(1200px 600px at 110% 10%, rgba(20,30,60,0.35), transparent 60%), #090909' }}>
      <div style={{ position: 'sticky', top: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 12, borderBottom: '1px solid #1b1b1b', background: 'rgba(10,10,10,0.85)', backdropFilter: 'blur(6px)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <img src="/ramana.jpg" alt="Ramana" style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover', border: '1px solid #333' }} />
            <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1 }}>
              <div style={{ fontWeight: 700, color: '#eaeaea' }}>RamanaTalks</div>
              <div style={{ fontSize: 11, opacity: 0.8 }}>OM NAMO BHAGAVATHE RAMANAYA</div>
            </div>
          </div>
        </div>
      </div>
      <div style={{ flex: 1 }}>
        <Login />
      </div>
    </div>
  );
}

function AuthedApp(): JSX.Element {
  async function signOut(): Promise<void> {
    await supabase.auth.signOut();
    localStorage.removeItem('convId');
  }
  const [view, setView] = React.useState<'landing' | 'chat' | 'satsang' | 'podcasts'>('landing');
  const [showProfile, setShowProfile] = React.useState(false);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [avatarUrl, setAvatarUrl] = React.useState<string | null>(null);
  React.useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase.auth.getUser();
        const uid = data?.user?.id;
        const metaUrl = (data?.user?.user_metadata as any)?.avatar_url as string | undefined;
        if (uid) {
          const { data: p } = await supabase.from('profiles').select('avatar_url').eq('id', uid).single();
          setAvatarUrl((p?.avatar_url as string) || metaUrl || null);
        } else {
          setAvatarUrl(metaUrl || null);
        }
      } catch { setAvatarUrl(null); }
    })();
  }, []);

  React.useEffect(() => {
    function applyHash(): void {
      try {
        const hash = location.hash || '';
        if (/^#satsang(\/.*)?$/.test(hash)) setView('satsang');
        else if (hash === '#chat') setView('chat');
        else if (hash === '#podcasts') setView('podcasts');
        else setView('landing');
      } catch {
        setView('landing');
      }
    }
    applyHash();
    window.addEventListener('hashchange', applyHash);
    return () => window.removeEventListener('hashchange', applyHash);
  }, []);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: 'radial-gradient(1200px 600px at -10% -10%, rgba(20,60,40,0.35), transparent 60%), radial-gradient(1200px 600px at 110% 10%, rgba(20,30,60,0.35), transparent 60%), #090909' }}>
      <div style={{ position: 'sticky', top: 0, zIndex: 100, display: 'flex', flexDirection: 'column', gap: 8, padding: 12, borderBottom: '1px solid #1b1b1b', background: 'rgba(10,10,10,0.85)', backdropFilter: 'blur(6px)' }}>
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <img src="/ramana.jpg" alt="Ramana" style={{ width: 56, height: 56, borderRadius: '50%', objectFit: 'cover', border: '1px solid #333' }} />
            <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1 }}>
              <div style={{ fontWeight: 900, color: '#eaeaea', fontSize: 24, textAlign: 'center', letterSpacing: 0.3 }}>RamanaTalks</div>
              <div style={{ fontSize: 12, opacity: 0.8, textAlign: 'center' }}>OM NAMO BHAGAVATHE RAMANAYA</div>
            </div>
          </div>
          <div style={{ position: 'absolute', right: 0, display: 'flex', alignItems: 'center' }}>
            <button onClick={() => setMenuOpen((v) => !v)} aria-haspopup="menu" aria-expanded={menuOpen} style={{ borderRadius: '50%', padding: 0, width: 36, height: 36, overflow: 'hidden', border: '1px solid #2a2a2a', background: '#0e0e0e' }}>
              <img src={avatarUrl || '/ramana.jpg'} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </button>
            {menuOpen && (
              <div role="menu" style={{ position: 'absolute', top: 44, right: 0, background: '#0f0f0f', border: '1px solid #2a2a2a', borderRadius: 10, boxShadow: '0 10px 28px rgba(0,0,0,0.45)', minWidth: 160 }}>
                <button role="menuitem" onClick={() => { setShowProfile(true); setMenuOpen(false); }} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 12px', background: 'transparent', color: '#ddd', border: 'none' }}>Edit profile</button>
                <button role="menuitem" onClick={() => { void signOut(); setMenuOpen(false); }} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 12px', background: 'transparent', color: '#ddd', border: 'none' }}>Sign out</button>
              </div>
            )}
          </div>
        </div>
        {view !== 'landing' && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: 10 }}>
            <button onClick={() => { try { location.hash = '#home'; } catch {} setView('landing'); }} style={{ padding: '8px 14px', borderRadius: 999, border: '1px solid #2a2a2a', background: '#0e0e0e', color: '#eaeaea', boxShadow: '0 4px 12px rgba(0,0,0,0.25)' }}>Home</button>
            <button onClick={() => { try { location.hash = '#chat'; } catch {} setView('chat'); }} style={{ padding: '8px 14px', borderRadius: 999, border: '1px solid #2a2a2a', background: view==='chat' ? 'linear-gradient(180deg,#1e1e1e,#141414)' : '#0e0e0e', color: '#eaeaea', boxShadow: view==='chat' ? '0 0 0 1px #3ea95c inset, 0 8px 24px rgba(0,0,0,0.35)' : '0 4px 12px rgba(0,0,0,0.25)' }}>Chat</button>
            <button onClick={() => { try { location.hash = '#satsang'; } catch {} setView('satsang'); }} style={{ padding: '8px 14px', borderRadius: 999, border: '1px solid #2a2a2a', background: view==='satsang' ? 'linear-gradient(180deg,#1e1e1e,#141414)' : '#0e0e0e', color: '#eaeaea', boxShadow: view==='satsang' ? '0 0 0 1px #5a7be8 inset, 0 8px 24px rgba(0,0,0,0.35)' : '0 4px 12px rgba(0,0,0,0.25)' }}>Satsang</button>
            <button onClick={() => { try { location.hash = '#podcasts'; } catch {} setView('podcasts'); }} style={{ padding: '8px 14px', borderRadius: 999, border: '1px solid #2a2a2a', background: view==='podcasts' ? 'linear-gradient(180deg,#1e1e1e,#141414)' : '#0e0e0e', color: '#eaeaea', boxShadow: view==='podcasts' ? '0 0 0 1px #b67a2b inset, 0 8px 24px rgba(0,0,0,0.35)' : '0 4px 12px rgba(0,0,0,0.25)' }}>Podcasts</button>
          </div>
        )}
      </div>
      <div style={{ flex: 1 }}>
        {view === 'landing' ? (
          <Landing onGoChat={() => { try { location.hash = '#chat'; } catch {} setView('chat'); }} onGoSatsang={() => { try { location.hash = '#satsang'; } catch {} setView('satsang'); }} />
        ) : view === 'chat' ? (
          <App />
        ) : view === 'podcasts' ? (
          <Podcasts />
        ) : (
          ((typeof location !== 'undefined') && /^#satsang\//.test(location.hash || '')) ? <Satsang /> : <SatsangList />
        )}
      </div>
      {showProfile && <Profile onClose={() => setShowProfile(false)} />}
    </div>
  );
}


