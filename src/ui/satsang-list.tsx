import React, { useEffect, useMemo, useState } from 'react';
import { Calendar, Clock, Users, Lock, Globe, LogIn, PlusCircle, Copy } from 'lucide-react';
import { createRoom, joinRoom, listRoomsWithCounts, setRoomPrivacy, startRoomNow, type SatsangRoom } from '../data/satsang';

export default function SatsangList(): JSX.Element {
  const [rooms, setRooms] = useState<SatsangRoom[]>([]);
  const [upcoming, setUpcoming] = useState<SatsangRoom[]>([]);
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [tz, setTz] = useState<string>(() => {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { return 'UTC'; }
  });
  const now = useMemo(() => Date.now(), []);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const arr = await listRoomsWithCounts();
      setRooms(arr);
      const now = Date.now();
      const up = arr
        .filter((r) => r.scheduled_at && new Date(r.scheduled_at).getTime() > now)
        .sort(
          (a, b) => new Date(a.scheduled_at || 0).getTime() - new Date(b.scheduled_at || 0).getTime()
        );
      setUpcoming(up);
    })();
  }, []);

  async function handleCreate(): Promise<void> {
    const trimmed = name.trim();
    if (!trimmed) return;
    setError(null);
    const iso = (date || time)
      ? new Date(`${date || new Date().toISOString().slice(0, 10)}T${time || '00:00'}`).toISOString()
      : null;
    const invite = `${location.origin}/#satsang/${encodeURIComponent(trimmed)}`;
    const { id, error } = await createRoom(trimmed, desc || undefined, true, iso, invite, tz);
    if (error) {
      setError(error);
      return;
    }
    if (id) {
      try { await joinRoom(id); } catch {}
      // Replace with actual id-based deep link for reliability
      const share = `${location.origin}/#satsang/${encodeURIComponent(id)}`;
      try { await navigator.clipboard.writeText(share); } catch {}
      location.hash = `#satsang/${encodeURIComponent(id)}`;
    }
  }

  function openRoom(id: string): void {
    location.hash = `#satsang/${encodeURIComponent(id)}`;
  }

  async function handleEnter(id: string): Promise<void> {
    try { await joinRoom(id); } catch {}
    openRoom(id);
  }

  async function copyShareLink(room: SatsangRoom): Promise<void> {
    const link = room.invite_url || `${location.origin}/#satsang/${encodeURIComponent(room.id)}`;
    try { await navigator.clipboard.writeText(link); setCopiedId(room.id); setTimeout(() => setCopiedId(null), 1200); } catch {}
  }

  function statusBadge(r: SatsangRoom): JSX.Element | null {
    const startTs = r.scheduled_at ? new Date(r.scheduled_at).getTime() : null;
    const endTs = (r as any).scheduled_end_at ? new Date((r as any).scheduled_end_at).getTime() : null;
    const isEnded = !!endTs && endTs <= Date.now();
    const isUpcoming = !!startTs && startTs > Date.now();
    const chipStyle: React.CSSProperties = {
      display: 'inline-flex', alignItems: 'center', gap: 6, padding: '2px 8px',
      borderRadius: 999, fontSize: 11, fontWeight: 800, letterSpacing: 0.3,
      border: '1px solid #333'
    };
    if (isEnded) return <span style={{ ...chipStyle, background: '#2f0f0f', color: '#ffb4b4', borderColor: '#5a2626' }}>Ended</span>;
    if (isUpcoming) return (
      <span style={{ ...chipStyle, background: '#101d2a', color: '#8bd2f0', borderColor: '#2b6f8a' }}>
        <Clock size={12} /> Upcoming
      </span>
    );
    return (
      <span style={{ ...chipStyle, background: '#0f2416', color: '#9fe0a5', borderColor: '#2e7d32' }}>
        <span aria-hidden style={{ width: 6, height: 6, background: '#7ee2a5', borderRadius: '50%' }} /> Live
      </span>
    );
  }

  return (
    <div style={{ minHeight: 'calc(100vh - 48px)', backgroundImage: 'linear-gradient(rgba(0,0,0,0.45), rgba(0,0,0,0.55)), url(/aesthetic-background-with-gradient-neon-led-light-effect.jpg)', backgroundSize: 'cover', backgroundPosition: 'center', backgroundAttachment: 'fixed' }}>
      <main style={{ padding: 16, background: 'rgba(10,10,10,0.45)', display: 'flex', flexDirection: 'column', minHeight: 'calc(100vh - 48px)' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', width: '100%', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ fontSize: 18, fontWeight: 800 }}>Satsang Rooms</div>
              <span style={{ display:'inline-flex', alignItems:'center', gap:6, fontSize:11, fontWeight:800, padding:'2px 8px', borderRadius:999, border:'1px solid #333', background:'#1a1a1a', color:'#ccc' }}>
                <Users size={12} /> Join a session
              </span>
            </div>
            {error ? <div style={{ color: '#ffb4b4' }}>{error}</div> : null}
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Room title"
              style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid #333', background: '#0e0e0e', color: '#ddd' }}
            />
            <input
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              placeholder="Description (optional)"
              style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid #333', background: '#0e0e0e', color: '#ddd', minWidth: 260 }}
            />
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              onFocus={(e) => (e.currentTarget.showPicker ? e.currentTarget.showPicker() : void 0)}
              onClick={(e) => (e.currentTarget.showPicker ? e.currentTarget.showPicker() : void 0)}
              style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid #333', background: '#0e0e0e', color: '#ddd' }}
            />
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              onFocus={(e) => (e.currentTarget.showPicker ? e.currentTarget.showPicker() : void 0)}
              onClick={(e) => (e.currentTarget.showPicker ? e.currentTarget.showPicker() : void 0)}
              style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid #333', background: '#0e0e0e', color: '#ddd' }}
            />
            <select value={tz} onChange={(e) => setTz(e.target.value)} title="Time zone"
              style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid #333', background: '#0e0e0e', color: '#ddd' }}>
              <option value="UTC">UTC</option>
              <option value="Asia/Kolkata">Asia/Kolkata (IST)</option>
              <option value="America/Los_Angeles">America/Los_Angeles (PT)</option>
              <option value="America/New_York">America/New_York (ET)</option>
              <option value="Europe/London">Europe/London (UK)</option>
              <option value="Europe/Berlin">Europe/Berlin (CET)</option>
              <option value="Asia/Dubai">Asia/Dubai (GST)</option>
              <option value="Asia/Singapore">Asia/Singapore (SGT)</option>
              <option value="Australia/Sydney">Australia/Sydney (AEST)</option>
            </select>
            <button onClick={() => void handleCreate()} className="btn btn-primary" style={{ display:'inline-flex', alignItems:'center', gap:8 }}>
              <PlusCircle size={16} /> Create room
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
            {rooms.map((r: SatsangRoom & { speakers?: number; listeners?: number; rec_count?: number }) => {
              const start = r.scheduled_at ? new Date(r.scheduled_at) : null;
              const end = (r as any).scheduled_end_at ? new Date((r as any).scheduled_end_at) : null;
              const isEnded = !!end && end.getTime() <= now;
              const isUpcoming = !!start && start.getTime() > now;
              return (
                <div key={r.id} style={{ textAlign: 'left', padding: 14, borderRadius: 12, border: '1px solid #333', background: '#0f0f0f', color: '#ddd', display:'flex', flexDirection:'column', gap:8 }}>
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:8 }}>
                    <div style={{ fontWeight: 800, fontSize: 16, minWidth: 0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{r.title || r.name}</div>
                    <div style={{ display:'flex', alignItems:'center', gap:6, flexShrink:0 }}>
                      <span title={r.is_public ? 'Public' : 'Private'} style={{ display:'inline-flex', alignItems:'center', gap:6, padding:'2px 8px', borderRadius:999, fontSize:11, fontWeight:800, border:'1px solid #333', background:'#1a1a1a', color:'#ccc' }}>
                        {r.is_public ? <Globe size={12} /> : <Lock size={12} />} {r.is_public ? 'Public' : 'Private'}
                      </span>
                      {statusBadge(r)}
                    </div>
                  </div>

                  {r.description ? <div style={{ fontSize: 12, opacity: 0.8 }}>{r.description}</div> : <div style={{ fontSize: 12, opacity: 0.6 }}>—</div>}

                  <div style={{ display:'flex', alignItems:'center', gap:12, fontSize:12, opacity:0.8, flexWrap:'wrap' }}>
                    {r.presenter_name ? (
                      <span title="Presenter" style={{ display:'inline-flex', gap:6, alignItems:'center' }}>
                        <Users size={12} /> {r.presenter_name}
                      </span>
                    ) : null}
                    {r.scheduled_at ? (
                      <span title={r.time_zone ? `Starts at (${r.time_zone})` : 'Starts at'} style={{ display:'inline-flex', gap:6, alignItems:'center' }}>
                        <Calendar size={12} /> {new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short', timeZone: r.time_zone || undefined }).format(new Date(r.scheduled_at))}
                        {r.time_zone ? ` (${r.time_zone})` : ''}
                      </span>
                    ) : null}
                    {(r as any).scheduled_end_at ? (
                      <span title={r.time_zone ? `Ends at (${r.time_zone})` : 'Ends at'} style={{ display:'inline-flex', gap:6, alignItems:'center' }}>
                        <Clock size={12} /> {new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short', timeZone: r.time_zone || undefined }).format(new Date((r as any).scheduled_end_at))}
                        {r.time_zone ? ` (${r.time_zone})` : ''}
                      </span>
                    ) : null}
                    {(typeof r.speakers === 'number' || typeof r.listeners === 'number') && (
                      <span title="Members" style={{ display:'inline-flex', gap:6, alignItems:'center' }}>
                        <Users size={12} /> {r.speakers || 0} spk · {r.listeners || 0} lstn
                      </span>
                    )}
                    {(typeof r.rec_count === 'number' && r.rec_count > 0) && (
                      <span title="Recordings" style={{ display:'inline-flex', gap:6, alignItems:'center' }}>
                        🎧 {r.rec_count}
                      </span>
                    )}
                  </div>

                  <div style={{ display:'flex', alignItems:'center', gap:8, marginTop: 4, flexWrap:'wrap' }}>
                    <button onClick={() => void handleEnter(r.id)} disabled={isEnded} style={{ padding:'8px 12px', borderRadius: 10, border: isEnded ? '1px solid #444' : '1px solid #2e7d32', background: isEnded ? '#222' : '#154a28', color: isEnded ? '#777' : '#d7ffd9', fontWeight: 700, display:'inline-flex', alignItems:'center', gap:8 }}>
                      <LogIn size={14} /> {isUpcoming ? 'Enter (preview)' : (isEnded ? 'Ended' : 'Enter room')}
                    </button>
                    <button onClick={() => void copyShareLink(r)} style={{ padding:'8px 12px', borderRadius: 10, border: '1px solid #333', background:'#0e0e0e', color: copiedId===r.id?'#9fe0a5':'#ddd', fontWeight: 600, display:'inline-flex', alignItems:'center', gap:8 }}>
                      <Copy size={14} /> {copiedId===r.id ? 'Copied' : 'Share'}
                    </button>
                    {/* Host/mod quick tools */}
                    <button onClick={() => void startRoomNow(r.id)} style={{ padding:'8px 12px', borderRadius: 10, border: '1px solid #333', background:'#0e0e0e', color:'#ddd', fontWeight:600 }}>Start now</button>
                    <button onClick={async () => { const next = !r.is_public; const ok = await setRoomPrivacy(r.id, next); if (ok) setRooms((prev)=>prev.map(x=>x.id===r.id?{...x,is_public:next}:x)); }} style={{ padding:'8px 12px', borderRadius: 10, border: '1px solid #333', background:'#0e0e0e', color:'#ddd', fontWeight:600 }}>{r.is_public ? 'Lock' : 'Unlock'}</button>
                  </div>
                </div>
              );
            })}
          </div>

          {upcoming.length > 0 && (
            <div>
              <div style={{ fontSize: 13, opacity: 0.85, margin: '8px 0' }}>Upcoming</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10 }}>
                {upcoming.map((r) => {
                  const t = new Date(r.scheduled_at as string).getTime();
                  return (
                    <div key={r.id} style={{ padding: '8px 10px', border: '1px solid #333', borderRadius: 8, background: '#0f0f0f', color: '#ddd', display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontWeight: 600 }}>{r.title || r.name}</span>
                      <span data-ts={t} className="countdown" style={{ fontVariantNumeric: 'tabular-nums', opacity: 0.85 }}></span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}


