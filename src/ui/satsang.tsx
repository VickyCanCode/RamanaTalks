import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Volume2, LogOut, Mic, MicOff, Hand, MessageSquare, Library, Download, PlayCircle, Globe, Lock, Calendar, Clock } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { createRoom, joinRoom, listRooms, listRoomMessages, sendRoomMessage, subscribeRoomMessages, listMembers, raiseHand, inviteToStage, setRole, subscribeMembers, acceptStageInvite, toggleMute, listRecordings, type SatsangMessage, type SatsangRoom, type SatsangMember } from '../data/satsang';

export default function Satsang(): JSX.Element {
  const [rooms, setRooms] = useState<SatsangRoom[]>([]);
  const [activeRoom, setActiveRoom] = useState<string | null>(null);
  const [messages, setMessages] = useState<SatsangMessage[]>([]);
  const [members, setMembers] = useState<SatsangMember[]>([]);
  const [nameMap, setNameMap] = useState<Record<string, string>>({});
  const [avatarMap, setAvatarMap] = useState<Record<string, string>>({});
  const [input, setInput] = useState('');
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [date, setDate] = useState<string>('');
  const [time, setTime] = useState<string>('');
  const [inviteUrl, setInviteUrl] = useState<string>('');
  const [upcoming, setUpcoming] = useState<SatsangRoom[]>([]);
  const [error, setError] = useState<string | null>(null);
  const localAudioRef = useRef<HTMLAudioElement | null>(null);
  const [audioReady, setAudioReady] = useState(false);
  const [activeSpeakers, setActiveSpeakers] = useState<Set<string>>(new Set());
  const [onlineIds, setOnlineIds] = useState<Set<string>>(new Set());
  const lkRoomRef = useRef<any>(null);
  const [uid, setUid] = useState<string | null>(null);
  const [myEmailLocal, setMyEmailLocal] = useState<string | null>(null);
  const [chatOpen, setChatOpen] = useState<boolean>(() => {
    try { return localStorage.getItem('satsang_chat_open') === '1'; } catch { return false; }
  });
  const [micEnabled, setMicEnabled] = useState<boolean>(false);
  const [recordings, setRecordings] = useState<Array<{ name: string; url: string }>>([]);
  const [paneMode, setPaneMode] = useState<'chat' | 'recordings'>(() => {
    try { return (localStorage.getItem('satsang_pane') as 'chat'|'recordings') || 'chat'; } catch { return 'chat'; }
  });
  const [isMobile, setIsMobile] = useState<boolean>(false);
  // Recording refs/state
  const mixStreamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordingChunksRef = useRef<Blob[]>([]);
  const [recordingUrl, setRecordingUrl] = useState<string | null>(null);
  useEffect(() => {
    // Track mobile viewport
    const handleResize = () => {
      try { setIsMobile(window.innerWidth <= 768); } catch { setIsMobile(false); }
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    // Prevent background scroll when mobile chat overlay is open
    if (isMobile && chatOpen) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = prev; };
    }
  }, [isMobile, chatOpen]);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      const me = data.user ?? null;
      setUid(me?.id ?? null);
      try {
        const emailLocal = me?.email ? String(me.email).split('@')[0] : null;
        setMyEmailLocal(emailLocal);
        if (me?.id) {
          // Ensure my profile exists so others can resolve my name
          await supabase
            .from('profiles')
            .upsert({ id: me.id, email: me.email ?? null, full_name: (me.user_metadata as any)?.full_name ?? null, avatar_url: (me.user_metadata as any)?.avatar_url ?? null }, { onConflict: 'id' });
        }
      } catch {}
    }).catch(() => { setUid(null); setMyEmailLocal(null); });
  }, []);
  const myRole = useMemo(() => {
    const me = members.find(m => m.user_id === uid);
    return me?.role || 'listener';
  }, [members, uid]);
  const canSpeak = useMemo(() => ['speaker','moderator','cohost','host'].includes(myRole as any), [myRole]);
  const isManager = useMemo(() => ['moderator','cohost','host'].includes(myRole as any), [myRole]);
  const speakerCount = useMemo(() => members.filter(m => m.role !== 'listener').length, [members]);
  const audienceCount = useMemo(() => members.filter(m => m.role === 'listener').length, [members]);

  useEffect(() => {
    (async () => {
      const arr = await listRooms();
      setRooms(arr);
      const now = Date.now();
      const up = arr.filter(r => r.scheduled_at && new Date(r.scheduled_at).getTime() > now).sort((a,b)=>new Date(a.scheduled_at||0).getTime()-new Date(b.scheduled_at||0).getTime());
      setUpcoming(up);
      const applyHash = () => {
        try {
          const hash = location.hash || '';
          const m = hash.match(/^#satsang\/(.+)$/);
          if (m) {
            const rid = decodeURIComponent(m[1]);
            const found = arr.find(r => r.id === rid || r.title === rid || r.name === rid);
            if (found) setActiveRoom(found.id);
          } else if (hash === '#satsang') {
            setActiveRoom(null);
          }
        } catch {}
      };
      applyHash();
      window.addEventListener('hashchange', applyHash);
      return () => { window.removeEventListener('hashchange', applyHash); };
    })();
  }, []);

  useEffect(() => {
    if (!activeRoom) { setMessages([]); setMembers([]); return; }
    let unsubMsgs: (() => void) | null = null;
    let unsubMembers: (() => void) | null = null;
    (async () => {
      const msgs = await listRoomMessages(activeRoom);
      setMessages(msgs);
      const mems = await listMembers(activeRoom);
      setMembers(mems);
      unsubMsgs = subscribeRoomMessages(activeRoom, (msg) => setMessages((prev) => [...prev, msg]));
      unsubMembers = subscribeMembers(activeRoom, async () => setMembers(await listMembers(activeRoom)));
      try { setRecordings(await listRecordings(activeRoom)); } catch {}
    })();
    return () => { if (unsubMsgs) unsubMsgs(); if (unsubMembers) unsubMembers(); };
  }, [activeRoom]);

  // Load display names for current members and message authors (including historical messages)
  useEffect(() => {
    (async () => {
      try {
        const ids = Array.from(new Set([
          ...members.map((m) => m.user_id),
          ...messages.map((m) => m.user_id)
        ].filter(Boolean)));
        if (ids.length === 0) return;
        const { data } = await supabase
          .from('profiles')
          .select('id, full_name, email, avatar_url')
          .in('id', ids);
        const map: Record<string, string> = {};
        const aMap: Record<string, string> = {};
        if (data) {
          for (const p of data as any[]) {
            const full = (p.full_name || '').toString().trim();
            map[p.id] = full.length > 0 ? full : (p.email ? String(p.email).split('@')[0] : String(p.id).slice(0, 8));
            if (p.avatar_url) aMap[p.id] = String(p.avatar_url);
          }
        }
        // For any IDs not returned (missing profile), fallback to id slice or my email local if self
        for (const id of ids) {
          if (!map[id]) {
            map[id] = (id === uid && myEmailLocal) ? myEmailLocal : String(id).slice(0, 8);
          }
        }
        setNameMap((prev) => ({ ...prev, ...map }));
        if (Object.keys(aMap).length) setAvatarMap((prev) => ({ ...prev, ...aMap }));
      } catch {}
    })();
  }, [members, messages, uid, myEmailLocal]);

  async function handleCreateRoom(): Promise<void> {
    const trimmed = name.trim();
    if (!trimmed) return;
    setError(null);
    const iso = (date || time) ? new Date(`${date || new Date().toISOString().slice(0,10)}T${time || '00:00'}`).toISOString() : null;
    const pendingInvite = `${location.origin}/#satsang/${encodeURIComponent(trimmed)}`;
    const { id, error } = await createRoom(trimmed, desc || undefined, true, iso, pendingInvite);
    if (error) { setError(error); return; }
    if (id) {
      setRooms((prev) => [{ id, owner_id: uid || 'me', name: trimmed, description: null, is_public: true, created_at: new Date().toISOString() }, ...prev]);
      setName('');
      setDesc('');
      setInviteUrl(`${location.origin}/#satsang:${id}`);
      const { ok, error: joinErr } = await joinRoom(id);
      if (!ok) { setError(joinErr || 'Failed to join'); return; }
      setActiveRoom(id);
      const msgs = await listRoomMessages(id);
      setMessages(msgs);
    }
  }

  async function handleJoin(roomId: string): Promise<void> {
    setError(null);
    const { ok, error } = await joinRoom(roomId);
    if (!ok) { setError(error || 'Failed to join'); return; }
    setActiveRoom(roomId);
    try { setRecordings(await listRecordings(roomId)); } catch {}
  }

  async function handleSend(): Promise<void> {
    const text = input.trim();
    if (!text || !activeRoom) return;
    setInput('');
    const { ok, error, msg } = await sendRoomMessage(activeRoom, text);
    if (!ok) { setError(error || 'Failed to send'); return; }
    if (msg) setMessages((prev) => [...prev, msg]);
  }

  // LiveKit join for audio
  async function joinAudio(): Promise<void> {
    try {
      if (!activeRoom) return;
      // Minimal dynamic import to keep bundle slim if unused
      const { Room, createLocalAudioTrack, RoomEvent, Track } = await import('livekit-client');
      const identity = uid || crypto.randomUUID();
      // Request a token from server
      const res = await fetch('/api/livekit-token', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ roomId: activeRoom, identity, role: canSpeak ? 'speaker' : 'listener' }) });
      const { token, url } = await res.json();
      if (!token || !url) throw new Error('No token/url');
      const room = new Room();
      room.on(RoomEvent.TrackSubscribed, (track) => {
        if (track.kind === Track.Kind.Audio) {
          const el = track.attach() as HTMLAudioElement;
          el.autoplay = true;
          el.play().catch(() => {});
        }
      });
      room.on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
        setActiveSpeakers(new Set(speakers.map((p) => p.identity)));
      });
      const computeOnline = () => {
        const ids = new Set<string>();
        try {
          room.remoteParticipants.forEach((p:any) => ids.add(p.identity));
          if (room.localParticipant?.identity) ids.add(room.localParticipant.identity);
        } catch {}
        setOnlineIds(ids);
      };
      room.on(RoomEvent.ParticipantConnected, computeOnline);
      room.on(RoomEvent.ParticipantDisconnected, computeOnline);
      await room.connect(url, token);
      lkRoomRef.current = room;
      computeOnline();
      if (canSpeak) {
        const mic = await createLocalAudioTrack();
        await room.localParticipant.publishTrack(mic);
        setMicEnabled(true);
      }
      // Build a mixed stream from all tracks (local + remote) for recording
      try {
        const dest = new MediaStream();
        const lp: any = room.localParticipant as any;
        if (lp?.trackPublications && typeof lp.trackPublications.forEach === 'function') {
          lp.trackPublications.forEach((pub: any) => {
            const t = pub?.track as any;
            if (t?.mediaStreamTrack) dest.addTrack(t.mediaStreamTrack);
          });
        }
        room.remoteParticipants.forEach((p: any) => {
          const rp: any = p;
          if (rp?.trackPublications && typeof rp.trackPublications.forEach === 'function') {
            rp.trackPublications.forEach((pub: any) => {
              const t = pub?.track as any;
              if (t?.mediaStreamTrack) dest.addTrack(t.mediaStreamTrack);
            });
          }
        });
        mixStreamRef.current = dest.getTracks().length > 0 ? dest : null;
      } catch {
        mixStreamRef.current = null;
      }
      setAudioReady(true);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function leaveAudio(): Promise<void> {
    try {
      const room = lkRoomRef.current;
      if (room) {
        try { await room.disconnect(); } catch {}
      }
    } finally {
      lkRoomRef.current = null;
      setOnlineIds(new Set());
      setActiveSpeakers(new Set());
      setAudioReady(false);
      setMicEnabled(false);
    }
  }

  async function toggleMic(): Promise<void> {
    try {
      const room = lkRoomRef.current;
      if (!room) return;
      const next = !micEnabled;
      await room.localParticipant.setMicrophoneEnabled(next);
      setMicEnabled(next);
    } catch {}
  }

  // Recording (host/cohost only) with upload to Supabase Storage via API
  async function startRecording(): Promise<void> {
    try {
      if (!isManager) return;
      if (!mixStreamRef.current) return;
      const recorder = new MediaRecorder(mixStreamRef.current, { mimeType: 'audio/webm' });
      recordingChunksRef.current = [];
      recorder.ondataavailable = (e) => { if (e.data?.size) recordingChunksRef.current.push(e.data); };
      recorder.onstop = async () => {
        const blob = new Blob(recordingChunksRef.current, { type: 'audio/webm' });
        const url = URL.createObjectURL(blob);
        setRecordingUrl(url);
        try {
          const base64 = await new Promise<string>((resolve, reject) => {
            const fr = new FileReader();
            fr.onload = () => resolve(String(fr.result).split(',')[1] || '');
            fr.onerror = reject;
            fr.readAsDataURL(blob);
          });
          if (activeRoom) {
            await fetch('/api/recording-upload', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ roomId: activeRoom, fileBase64: base64, fileName: `recording-${Date.now()}.webm` })
            });
          }
        } catch {}
      };
      recorderRef.current = recorder;
      recorder.start();
    } catch {}
  }

  function stopRecording(): void {
    try { recorderRef.current?.stop(); } catch {}
    recorderRef.current = null;
  }

  // Cleanup LiveKit room on unmount or room change
  useEffect(() => {
    return () => {
      try { lkRoomRef.current?.disconnect?.(); } catch {}
      lkRoomRef.current = null;
      setOnlineIds(new Set());
      setActiveSpeakers(new Set());
      setAudioReady(false);
    };
  }, [activeRoom]);

  // Countdown updater for Upcoming
  useEffect(() => {
    const id = window.setInterval(() => {
      try {
        document.querySelectorAll('.countdown').forEach((el) => {
          const node = el as HTMLElement;
          const ts = Number(node.getAttribute('data-ts') || 0);
          const diff = Math.max(0, ts - Date.now());
          const h = Math.floor(diff / 3600000);
          const m = Math.floor((diff % 3600000) / 60000);
          const s = Math.floor((diff % 60000) / 1000);
          node.textContent = `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`;
        });
      } catch {}
    }, 1000);
    return () => { try { window.clearInterval(id); } catch {} };
  }, [upcoming]);

  // Compute prod-safe share link for active room
  const active = rooms.find(r => r.id === activeRoom);
  const siteBase = (import.meta as any).env?.VITE_SITE_URL || (typeof location !== 'undefined' ? location.origin : '');
  const shareUrl = active ? `${siteBase}/#satsang/${active.id}` : null;

  // Determine if room has ended (scheduled_end_at passed)
  const ended = useMemo(() => {
    if (!active) return false;
    const endAt = (active as any).scheduled_end_at;
    if (!endAt) return false;
    try {
      return new Date(endAt as string).getTime() <= Date.now();
    } catch {
      return false;
    }
  }, [active]);

  function statusBadge(): JSX.Element | null {
    if (!active) return null;
    const startTs = active.scheduled_at ? new Date(active.scheduled_at).getTime() : null;
    const endTs = (active as any).scheduled_end_at ? new Date((active as any).scheduled_end_at).getTime() : null;
    const isEnded = !!endTs && endTs <= Date.now();
    const isUpcoming = !!startTs && startTs > Date.now();
    const base: React.CSSProperties = {
      display: 'inline-flex', alignItems: 'center', gap: 6, padding: '2px 8px',
      borderRadius: 999, fontSize: 11, fontWeight: 800, letterSpacing: 0.3,
      border: '1px solid #333'
    };
    if (isEnded) return <span style={{ ...base, background: '#2f0f0f', color: '#ffb4b4', borderColor: '#5a2626' }}>Ended</span>;
    if (isUpcoming) return <span style={{ ...base, background: '#101d2a', color: '#8bd2f0', borderColor: '#2b6f8a' }}><Clock size={12} /> Upcoming</span>;
    return <span style={{ ...base, background: '#0f2416', color: '#9fe0a5', borderColor: '#2e7d32' }}><span aria-hidden style={{ width: 6, height: 6, background: '#7ee2a5', borderRadius: '50%' }} /> Live</span>;
  }

  // Enforce mute based on own membership flag
  useEffect(() => {
    const me = members.find((m) => m.user_id === uid);
    const wantMuted = !!me?.is_muted;
    const room = lkRoomRef.current;
    if (!room) return;
    (async () => {
      try {
        // Enable/disable mic; if disabled, this stops publishing
        if (wantMuted) {
          await room.localParticipant.setMicrophoneEnabled(false);
        } else if (canSpeak) {
          await room.localParticipant.setMicrophoneEnabled(true);
        }
      } catch {}
    })();
  }, [members, uid, canSpeak]);

  // Auto-leave audio if the room has ended
  useEffect(() => {
    if (ended && audioReady) {
      void leaveAudio();
    }
  }, [ended, audioReady]);

  // Helpers: role badge + grids
  function roleBadge(role: string): JSX.Element {
    const colors: Record<string, { bg: string; border: string; text: string; label: string }> = {
      host: { bg: '#2b1a0a', border: '#8a5a2b', text: '#f0c28b', label: 'Host' },
      cohost: { bg: '#101d2a', border: '#2b6f8a', text: '#8bd2f0', label: 'Co-host' },
      moderator: { bg: '#1b102a', border: '#6f2b8a', text: '#d28bf0', label: 'Mod' },
      speaker: { bg: '#0f2416', border: '#2e7d32', text: '#9fe0a5', label: 'Speaker' },
      listener: { bg: '#1a1a1a', border: '#333', text: '#bbb', label: 'Listener' },
    };
    const c = colors[role] || colors.listener;
    return (
      <span
        style={{
          display: 'inline-block',
          padding: '2px 8px',
          borderRadius: 999,
          border: `1px solid ${c.border}`,
          background: c.bg,
          color: c.text,
          fontSize: 10,
          fontWeight: 800,
          letterSpacing: 0.4,
          textTransform: 'uppercase',
        }}
      >
        {c.label}
      </span>
    );
  }

  const stageMembers = useMemo(() => members.filter((m) => m.role !== 'listener'), [members]);
  const audienceMembers = useMemo(() => members.filter((m) => m.role === 'listener'), [members]);

  // Optimistic member updates for snappy UI
  async function onToggleMuteOptimistic(roomId: string, userId: string, nextMuted: boolean): Promise<void> {
    const prev = members;
    setMembers((curr) => curr.map((m) => (m.user_id === userId ? { ...m, is_muted: nextMuted } : m)));
    try {
      await toggleMute(roomId, userId, nextMuted);
    } catch {
      setMembers(prev);
    }
  }

  async function onSetRoleOptimistic(roomId: string, userId: string, role: 'listener' | 'speaker' | 'moderator' | 'cohost' | 'host'): Promise<void> {
    const prev = members;
    setMembers((curr) => curr.map((m) => (m.user_id === userId ? { ...m, role } : m)));
    try {
      await setRole(roomId, userId, role);
    } catch {
      setMembers(prev);
    }
  }

  return (
    <div style={{ minHeight: 'calc(100vh - 48px)', backgroundImage: 'linear-gradient(rgba(0,0,0,0.45), rgba(0,0,0,0.55)), url(/aesthetic-background-with-gradient-neon-led-light-effect.jpg)', backgroundSize: 'cover', backgroundPosition: 'center', backgroundAttachment: 'fixed' }}>
      {!activeRoom ? (
        <main style={{ padding: 16, background: 'rgba(10,10,10,0.45)', display:'flex', flexDirection:'column', minHeight: 'calc(100vh - 48px)' }}>
          <div style={{ maxWidth: 1100, margin: '0 auto', width: '100%', display:'flex', flexDirection:'column', gap: 16 }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap: 12 }}>
              <div style={{ fontSize: 18, fontWeight: 800 }}>Satsang Rooms</div>
              {error ? <div style={{ color: '#ffb4b4' }}>{error}</div> : null}
            </div>
            <div style={{ display:'flex', gap: 8, flexWrap:'wrap', alignItems:'center' }}>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Room title" style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid #333', background: '#0e0e0e', color: '#ddd' }} />
              <input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Description (optional)" style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid #333', background: '#0e0e0e', color: '#ddd', minWidth: 260 }} />
              <input type="date" value={date} onChange={(e)=>setDate(e.target.value)} style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid #333', background: '#0e0e0e', color: '#ddd' }} />
              <input type="time" value={time} onChange={(e)=>setTime(e.target.value)} style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid #333', background: '#0e0e0e', color: '#ddd' }} />
              <button onClick={() => void handleCreateRoom()} className="btn btn-primary">Create room</button>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(280px, 1fr))', gap:12 }}>
              {rooms.map((r) => (
                <button key={r.id} onClick={() => { setActiveRoom(r.id); try{ location.hash = `#satsang/${encodeURIComponent(r.id)}`;}catch{} }} style={{ textAlign:'left', padding:12, borderRadius:10, border:'1px solid #333', background:'#0f0f0f', color:'#ddd' }}>
                  <div style={{ fontWeight:700 }}>{r.title || r.name}</div>
                  <div style={{ fontSize:12, opacity:0.75 }}>{r.description || '—'}</div>
                  {r.scheduled_at ? <div style={{ fontSize:12, opacity:0.65, marginTop:4 }}>Starts: {new Date(r.scheduled_at).toLocaleString()}</div> : null}
                </button>
              ))}
            </div>
            {upcoming.length>0 && (
              <div>
                <div style={{ fontSize: 13, opacity: 0.85, margin: '8px 0' }}>Upcoming</div>
                <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(260px, 1fr))', gap:10 }}>
                  {upcoming.map((r)=>{
                    const t = new Date(r.scheduled_at as string).getTime();
                    return (
                      <div key={r.id} style={{ padding:'8px 10px', border:'1px solid #333', borderRadius:8, background:'#0f0f0f', color:'#ddd', display:'flex', justifyContent:'space-between' }}>
                        <span style={{ fontWeight:600 }}>{r.title || r.name}</span>
                        <span data-ts={t} className="countdown" style={{ fontVariantNumeric:'tabular-nums', opacity:0.85 }}></span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </main>
      ) : (
        <div style={{ display: 'flex', minHeight: 'calc(100vh - 48px)' }}>
          <main style={{ flex: 1, padding: 16, background: 'rgba(10,10,10,0.45)', display:'flex', flexDirection:'column', minHeight:0 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, height: '100%' }}>
            {/* Ended banner */}
            {ended && (
              <div style={{
                background: 'linear-gradient(90deg, #3a0f0f, #2f0f0f)',
                border: '1px solid #5a2626',
                color: '#ffb4b4',
                padding: '8px 12px',
                borderRadius: 10,
                textAlign: 'center',
                position: 'sticky',
                top: 'var(--sticky-banner)',
                zIndex: 6,
              }}>
                This Satsang has ended. Joining and chat are disabled.
              </div>
            )}

            {/* Primary audio controls + back to list */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', position:'sticky', top: 'var(--sticky-1)', zIndex: 5 }}>
              <button onClick={() => { try { location.hash = '#satsang'; } catch {} setActiveRoom(null); }} style={{ padding: '10px 14px', borderRadius: 10, border: '1px solid #333', background: '#0e0e0e', color: '#ddd', fontWeight: 600 }}>← Back</button>
              {!audioReady ? (
                <button onClick={() => void (!ended && joinAudio())} disabled={ended} style={{ padding: '10px 14px', borderRadius: 10, border: ended ? '1px solid #444' : '1px solid #2e7d32', background: ended ? '#222' : '#154a28', color: ended ? '#777' : '#d7ffd9', fontWeight: 600 }}>
                  <Volume2 size={16} style={{ marginRight: 6 }} /> {ended ? 'Ended' : 'Join Audio'}
                </button>
              ) : (
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => void leaveAudio()} style={{ padding: '10px 14px', borderRadius: 10, border: '1px solid #5a2626', background: '#2f0f0f', color: '#ffb4b4', fontWeight: 600 }}><LogOut size={16} style={{ marginRight: 6 }} /> Leave</button>
                  <button onClick={() => void toggleMic()} disabled={!canSpeak} style={{ padding: '10px 14px', borderRadius: 10, border: '1px solid #333', background: micEnabled ? '#13271b' : '#0e0e0e', color: '#ddd', boxShadow: micEnabled ? '0 0 14px #5fd18a' : undefined }}>{micEnabled ? <Mic size={16} /> : <MicOff size={16} />}</button>
                </div>
              )}
              <button onClick={() => void (!ended && raiseHand(activeRoom))} disabled={ended} style={{ padding: '10px 14px', borderRadius: 10, border: '1px solid #333', background: ended ? '#222' : '#0e0e0e', color: ended ? '#777' : '#ddd' }}><Hand size={16} style={{ marginRight: 6 }} /> Raise Hand</button>
              {myRole === 'listener' && members.find(m => m.user_id === uid && m.invited_to_stage_at) && (
                <button onClick={() => void (!ended && acceptStageInvite(activeRoom))} disabled={ended} style={{ padding: '10px 14px', borderRadius: 10, border: '1px solid #333', background: ended ? '#222' : '#0e0e0e', color: ended ? '#777' : '#ddd' }}>✅ Accept Invite</button>
              )}
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 12, fontSize: 12, opacity: 0.8, alignItems: 'center' }}>
                <span>Speakers: {speakerCount}</span>
                <span>Audience: {audienceCount}</span>
                <button onClick={() => setChatOpen((v) => { try { localStorage.setItem('satsang_chat_open', v ? '0' : '1'); } catch {} return !v; })} style={{ padding: isMobile ? '10px 14px' : '6px 10px', borderRadius: 8, border: '1px solid #333', background: chatOpen ? '#1a1a1a' : '#0e0e0e', color: '#ddd', fontWeight: 600 }}>{chatOpen ? (isMobile ? 'Close' : 'Hide Chat') : 'Chat'}</button>
              </div>
            </div>
            {/* Room header */}
            <div style={{ textAlign:'center', marginTop: 8, position:'sticky', top: 'var(--sticky-2)', zIndex: 4, background:'rgba(10,10,10,0.45)', backdropFilter:'blur(4px)', padding:'6px 0' }}>
              <div style={{ display:'flex', justifyContent:'center', alignItems:'center', gap:8, flexWrap:'wrap' }}>
                <div style={{ fontSize: 18, fontWeight: 800 }}>
                  {rooms.find(r=>r.id===activeRoom)?.title || rooms.find(r=>r.id===activeRoom)?.name}
                </div>
                <div style={{ display:'inline-flex', gap:6, alignItems:'center' }}>
                  <span title={active?.is_public ? 'Public' : 'Private'} style={{ display:'inline-flex', alignItems:'center', gap:6, padding:'2px 8px', borderRadius:999, fontSize:11, fontWeight:800, border:'1px solid #333', background:'#1a1a1a', color:'#ccc' }}>
                    {active?.is_public ? <Globe size={12} /> : <Lock size={12} />} {active?.is_public ? 'Public' : 'Private'}
                  </span>
                  {statusBadge()}
                </div>
              </div>
              {shareUrl && (
                <div style={{ marginTop: 4, fontSize: 12, display:'flex', gap:8, justifyContent:'center', alignItems:'center' }}>
                  <span>Share:</span>
                  <a href={shareUrl} style={{ color:'#9fd6ff' }}>{shareUrl}</a>
                  <button onClick={() => { try{ navigator.clipboard.writeText(shareUrl); }catch{} }} className="btn" style={{ padding:'4px 8px', fontSize:12 }}>Copy</button>
                </div>
              )}
              <div style={{ fontSize: 13, opacity: 0.8 }}>{rooms.find(r=>r.id===activeRoom)?.description || ''}</div>
              <div style={{ display:'flex', gap:12, justifyContent:'center', marginTop: 2, fontSize:12, opacity:0.75, flexWrap:'wrap' }}>
                {!!rooms.find(r=>r.id===activeRoom)?.scheduled_at && (
                  (() => {
                    const r = rooms.find(rr=>rr.id===activeRoom)!;
                    const tz = r.time_zone || undefined;
                    const start = new Date(r.scheduled_at as string);
                    const label = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short', timeZone: tz }).format(start);
                    return (
                      <span style={{ display:'inline-flex', alignItems:'center', gap:6 }}>
                        <Calendar size={12} /> Starts: {label}{r.time_zone ? ` (${r.time_zone})` : ''}
                      </span>
                    );
                  })()
                )}
                {!!rooms.find(r=>r.id===activeRoom)?.scheduled_end_at && (
                  (() => {
                    const r = rooms.find(rr=>rr.id===activeRoom)!;
                    const tz = r.time_zone || undefined;
                    const end = new Date((r as any).scheduled_end_at as string);
                    const label = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short', timeZone: tz }).format(end);
                    return (
                      <span style={{ display:'inline-flex', alignItems:'center', gap:6 }}>
                        <Clock size={12} /> Ends: {label}{r.time_zone ? ` (${r.time_zone})` : ''}
                      </span>
                    );
                  })()
                )}
              </div>
            </div>
            {/* Two-column layout: Stage/Audience left (primary), Chat right (secondary) */}
            <div style={{ display: 'flex', gap: 16, flex: 1, minHeight: 0 }}>
              <div style={{ flex: 1, minWidth: 0, display: 'flex', gap: 16 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 6 }}>Stage</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10 }}>
                    {stageMembers.map((m) => {
                      const isActive = activeSpeakers.has(m.user_id);
                      const isSelf = m.user_id === uid;
                      return (
                        <div key={m.user_id} style={{ padding: '10px 12px', borderRadius: 12, border: '1px solid #333', background: isActive ? '#151d14' : 'rgba(20,20,20,0.45)', color: '#eee', display: 'flex', flexDirection: 'column', gap: 8 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <img src={avatarMap[m.user_id] || '/ramana.jpg'} alt="avatar" style={{ width: 42, height: 42, borderRadius: '50%', objectFit: 'cover', border: '1px solid #333' }} />
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0, flex: 1 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                <span style={{ fontWeight: 700, minWidth: 0, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'inline-block' }}>
                                  {nameMap[m.user_id] || m.user_id.slice(0, 8)}
                                </span>
                                <span style={{ flexShrink: 0 }}>{roleBadge(m.role)}</span>
                                {onlineIds.has(m.user_id) ? <span style={{ fontSize: 10, opacity: 0.8, flexShrink: 0 }}>(online)</span> : null}
                                {isSelf && micEnabled ? <span aria-hidden style={{ flexShrink: 0 }}>🎤</span> : null}
                                {isActive ? <span aria-hidden style={{ color: '#7ee2a5', flexShrink: 0 }}>●</span> : null}
                              </div>
                            </div>
                          </div>
                          {isManager && (
                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                              <button onClick={() => void onToggleMuteOptimistic(activeRoom!, m.user_id, !m.is_muted)} style={{ fontSize: 12, padding: '4px 8px', borderRadius: 6, border: '1px solid #333', background: '#0e0e0e', color: '#ddd' }}>{m.is_muted ? 'Unmute' : 'Mute'}</button>
                              <button onClick={() => void onSetRoleOptimistic(activeRoom!, m.user_id, 'listener')} style={{ fontSize: 12, padding: '4px 8px', borderRadius: 6, border: '1px solid #333', background: '#0e0e0e', color: '#ddd' }}>Move to audience</button>
                              {m.role !== 'moderator' && (
                                <button onClick={() => void onSetRoleOptimistic(activeRoom!, m.user_id, 'moderator')} style={{ fontSize: 12, padding: '4px 8px', borderRadius: 6, border: '1px solid #333', background: '#0e0e0e', color: '#ddd' }}>Make mod</button>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  <div style={{ fontSize: 12, opacity: 0.7, margin: '12px 0 6px' }}>Audience</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
                    {audienceMembers.map((m) => (
                      <div key={m.user_id} style={{ padding: '8px 10px', borderRadius: 10, border: '1px solid #333', background: 'rgba(20,20,20,0.35)', color: '#eee', display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                           <img src={avatarMap[m.user_id] || '/ramana.jpg'} alt="avatar" style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover', border: '1px solid #333' }} />
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 12, fontWeight: 600 }}>{nameMap[m.user_id] || m.user_id.slice(0, 8)}</span>
                            {roleBadge(m.role)}
                            {onlineIds.has(m.user_id) ? <span style={{ fontSize: 10, opacity: 0.8 }}>(online)</span> : null}
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          {isManager && (
                            <>
                              <button onClick={() => void inviteToStage(activeRoom, m.user_id)} style={{ fontSize: 12, padding: '4px 8px', borderRadius: 6, border: '1px solid #333', background: '#0e0e0e', color: '#ddd' }}>Invite to stage</button>
                              <button onClick={() => void setRole(activeRoom, m.user_id, 'speaker')} style={{ fontSize: 12, padding: '4px 8px', borderRadius: 6, border: '1px solid #333', background: '#0e0e0e', color: '#ddd' }}>Make speaker</button>
                            </>
                          )}
                          {m.user_id === uid ? (
                            <button onClick={() => void raiseHand(activeRoom)} disabled={ended} style={{ fontSize: 12, padding: '4px 8px', borderRadius: 6, border: '1px solid #333', background: ended ? '#222' : '#0e0e0e', color: ended ? '#777' : '#ddd', marginLeft: isManager ? undefined : 'auto' }}>Request to speak</button>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              {chatOpen && (
                <div style={isMobile ? { position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', flexDirection: 'column', background: 'rgba(10,10,10,0.94)', backdropFilter:'blur(6px)' } : { width: 420, minWidth: 300, display: 'flex', flexDirection: 'column', borderLeft: '1px solid #222', background: 'rgba(15,15,15,0.6)', backdropFilter:'blur(3px)' }}>
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:8, padding: isMobile ? '10px 12px' : '8px 12px', borderBottom:'1px solid #222' }}>
                    <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                      <button onClick={() => { setPaneMode('chat'); try { localStorage.setItem('satsang_pane', 'chat'); } catch {} }} style={{ display:'flex', alignItems:'center', gap:6, padding: isMobile ? '8px 12px' : '6px 10px', borderRadius:8, border:'1px solid #333', background: paneMode==='chat'?'#1a1a1a':'#0e0e0e', color:'#ddd', fontWeight: 700 }}>
                        <MessageSquare size={14} /> Chat
                      </button>
                      <button onClick={async () => { setPaneMode('recordings'); try { localStorage.setItem('satsang_pane', 'recordings'); if (activeRoom) setRecordings(await listRecordings(activeRoom)); } catch {} }} style={{ display:'flex', alignItems:'center', gap:6, padding: isMobile ? '8px 12px' : '6px 10px', borderRadius:8, border:'1px solid #333', background: paneMode==='recordings'?'#1a1a1a':'#0e0e0e', color:'#ddd', fontWeight: 700 }}>
                        <Library size={14} /> Recordings
                      </button>
                    </div>
                    {isMobile && (
                      <button onClick={() => setChatOpen(false)} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #333', background: '#0e0e0e', color: '#ddd', fontWeight: 700 }}>Close ✕</button>
                    )}
                  </div>

                  {paneMode === 'chat' ? (
                    <>
                      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, padding:'8px 12px' }}>
                        {messages.map((m) => (
                          <div key={m.id} style={{ alignSelf: m.user_id===uid?'flex-end':'flex-start', background: '#1a1a1a', color:'#eee', border: '1px solid #2a2a2a', borderRadius: 12, padding: isMobile ? '10px 12px' : '8px 10px', maxWidth: isMobile ? '90%' : '85%', display: 'flex', gap: 8, boxShadow: '0 6px 16px rgba(0,0,0,0.35)' }}>
                            <img src={avatarMap[m.user_id] || '/ramana.jpg'} alt="avatar" style={{ width: isMobile ? 24 : 20, height: isMobile ? 24 : 20, borderRadius: '50%', objectFit: 'cover', border: '1px solid #333', marginTop: 2 }} />
                            <div>
                              <div style={{ fontSize: 12, opacity: 0.7 }}>{nameMap[m.user_id] || (m.user_id === uid ? (myEmailLocal || 'You') : m.user_id.slice(0, 8))} {m.user_id === uid && micEnabled ? '🎤' : ''}</div>
                              <div>{m.content}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                      <div style={{ display: 'flex', gap: 8, padding: isMobile ? '10px 12px' : '8px 12px', borderTop: '1px solid #222', position: 'sticky', bottom: 0, background: 'rgba(15,15,15,0.92)', backdropFilter:'blur(6px)' }}>
                        <input
                          value={input}
                          onChange={(e) => setInput(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') void handleSend(); }}
                          placeholder={ended ? 'Chat is closed for this session' : 'Share with Satsang…'}
                          aria-label="Satsang message"
                          disabled={!canSpeak || ended}
                          inputMode="text"
                          style={{ flex: 1, padding: isMobile ? '14px 16px' : '12px 14px', borderRadius: 10, border: '1px solid #333', background: '#1b1b1b', color: '#eee' }}
                        />
                        <button
                          onClick={() => void handleSend()}
                          disabled={!canSpeak || ended}
                          style={{ padding: isMobile ? '14px 16px' : '12px 16px', borderRadius: 10, border: '1px solid #2e7d32', background: '#154a28', color: '#d7ffd9', fontWeight: 800 }}
                        >Send</button>
                      </div>
                    </>
                  ) : (
                    <div style={{ flex: 1, overflowY: 'auto', display:'flex', flexDirection:'column', gap:8, padding:'8px 12px' }}>
                      {recordings.length === 0 ? (
                        <div style={{ opacity: 0.8, fontSize: 12 }}>No recordings found for this room.</div>
                      ) : recordings.map((r) => (
                        <div key={r.name} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:8, border:'1px solid #333', background:'#101010', color:'#ddd', borderRadius:10, padding:'8px 10px' }}>
                          <div style={{ display:'flex', alignItems:'center', gap:8, minWidth:0 }}>
                            <PlayCircle size={16} />
                            <span title={r.name} style={{ whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', maxWidth: isMobile ? 180 : 220 }}>{r.name}</span>
                          </div>
                          <div style={{ display:'flex', gap:8 }}>
                            <audio controls src={r.url} style={{ height: 28 }} />
                            <a href={r.url} download style={{ display:'inline-flex', alignItems:'center', gap:6, padding:'6px 10px', borderRadius:8, border:'1px solid #333', background:'#0e0e0e', color:'#ddd' }}>
                              <Download size={14} /> Download
                            </a>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
          </main>
        </div>
      )}
    </div>
  );
}


