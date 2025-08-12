import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export default function Profile({ onClose }: { onClose: () => void }): JSX.Element {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { data: userRes } = await supabase.auth.getUser();
        const u = userRes?.user;
        setEmail(u?.email || '');
        if (!u?.id) return;
        const { data } = await supabase
          .from('profiles')
          .select('full_name, avatar_url, email')
          .eq('id', u.id)
          .single();
        if (data) {
          setFullName((data.full_name as string) || '');
          setAvatarUrl((data.avatar_url as string) || '');
          if (!email && (data.email as string)) setEmail(String(data.email));
        }
      } catch {}
    })();
  }, []);

  async function save(): Promise<void> {
    try {
      setSaving(true); setError(null); setInfo(null);
      const { data: userRes } = await supabase.auth.getUser();
      const u = userRes?.user;
      if (!u?.id) { setError('Not signed in'); return; }
      const { error } = await supabase
        .from('profiles')
        .upsert({ id: u.id, full_name: fullName.trim() || null, email, avatar_url: avatarUrl.trim() || null }, { onConflict: 'id' });
      if (error) { setError(error.message); return; }
      setInfo('Saved');
      setTimeout(onClose, 600);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div style={{ width: '100%', maxWidth: 420, background: '#0e0e0e', border: '1px solid #222', borderRadius: 12, padding: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <div style={{ fontWeight: 600 }}>Edit Profile</div>
          <button onClick={onClose} style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #333', background: '#0e0e0e', color: '#ddd' }}>Close</button>
        </div>
        {error && <div style={{ color: '#ffb4b4', background: '#2f0f0f', border: '1px solid #5a2626', padding: '8px 10px', borderRadius: 8, marginBottom: 12 }}>{error}</div>}
        {info && <div style={{ color: '#b7f5c4', background: '#0f2f17', border: '1px solid #265a33', padding: '8px 10px', borderRadius: 8, marginBottom: 12 }}>{info}</div>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <label style={{ fontSize: 12, opacity: 0.8 }}>Display name</label>
          <input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Your name" style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid #333', background: '#0e0e0e', color: '#fff' }} />
          <label style={{ fontSize: 12, opacity: 0.8 }}>Email (read-only)</label>
          <input value={email} readOnly style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid #333', background: '#151515', color: '#bbb' }} />
          <label style={{ fontSize: 12, opacity: 0.8 }}>Avatar URL (optional)</label>
          <input value={avatarUrl} onChange={(e) => setAvatarUrl(e.target.value)} placeholder="https://..." style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid #333', background: '#0e0e0e', color: '#fff' }} />
          <button disabled={saving} onClick={() => void save()} style={{ marginTop: 6, padding: '10px 12px', borderRadius: 10, border: '1px solid #2e7d32', background: '#154a28', color: '#d7ffd9' }}>{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
    </div>
  );
}


