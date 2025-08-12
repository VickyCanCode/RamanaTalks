import { supabase } from '../lib/supabase';

export type SatsangRoom = { id: string; owner_id?: string; name?: string; title?: string; presenter_name?: string; description?: string | null; is_public: boolean; created_at: string; scheduled_at?: string | null; scheduled_end_at?: string | null; invite_url?: string | null; time_zone?: string | null };
export type SatsangMessage = { id: string; room_id: string; user_id: string; content: string; created_at: string };
export type SatsangMember = { room_id: string; user_id: string; role: 'listener' | 'speaker' | 'moderator' | 'cohost' | 'host'; is_on_stage?: boolean; is_muted?: boolean; hand_raised_at?: string | null; invited_to_stage_at?: string | null; invited_by?: string | null };

export async function createRoom(name: string, description?: string, isPublic = true, scheduledAt?: string | null, inviteUrl?: string | null, timeZone?: string | null): Promise<{ id: string | null; error?: string }> {
  const { data: userRes } = await supabase.auth.getUser();
  const user = userRes?.user ?? null;
  const presenterName = (user?.user_metadata?.full_name as string | undefined)
    || (user?.email as string | undefined)
    || 'Host';
  const { data, error } = await supabase
    .from('satsang_rooms')
    .insert({ name, title: name, presenter_name: presenterName, description: description ?? null, is_public: isPublic, scheduled_at: scheduledAt ?? null, invite_url: inviteUrl ?? null, time_zone: timeZone ?? null })
    .select('id')
    .single();
  if (error) return { id: null, error: error.message };
  return { id: data?.id ?? null };
}

export async function joinRoom(roomId: string): Promise<{ ok: boolean; error?: string }> {
  // Ensure user exists first. If not authed, redirect to sign-in preserving hash
  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes?.user) {
    try {
      const dest = `#satsang/${encodeURIComponent(roomId)}`;
      location.hash = dest;
    } catch {}
    return { ok: false, error: 'Auth required' };
  }
  const { error } = await supabase
    .from('satsang_members')
    .upsert({ room_id: roomId }, { onConflict: 'room_id,user_id', ignoreDuplicates: true });
  return { ok: !error, error: error?.message };
}

export async function listRooms(): Promise<SatsangRoom[]> {
  try {
    const { data, error } = await supabase
      .from('satsang_rooms')
      .select('id, owner_id, name, title, presenter_name, description, is_public, created_at, scheduled_at, scheduled_end_at, invite_url, time_zone')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  } catch {
    try {
      const { data } = await supabase
        .from('satsang_rooms')
        .select('id, owner_id, name, title, presenter_name, description, is_public, created_at, scheduled_at, invite_url, time_zone')
        .order('created_at', { ascending: false });
      return data || [];
    } catch {
      const { data } = await supabase
        .from('satsang_rooms')
        .select('id, name, is_public, created_at')
        .order('created_at', { ascending: false });
      return data || [];
    }
  }
}

export async function listRoomsWithCounts(): Promise<Array<SatsangRoom & { speakers: number; listeners: number; rec_count: number }>> {
  // Fetch rooms + aggregate counts in parallel to limit round trips
  const [rooms, mem, rec] = await Promise.all([
    listRooms(),
    supabase.rpc('room_member_counts'),
    supabase.rpc('room_recording_counts')
  ]);
  const speakersByRoom: Record<string, number> = {};
  const listenersByRoom: Record<string, number> = {};
  for (const row of (mem.data as Array<{ room_id: string; speakers: number; listeners: number }> | undefined) || []) {
    speakersByRoom[row.room_id] = row.speakers;
    listenersByRoom[row.room_id] = row.listeners;
  }
  const recByRoom: Record<string, number> = {};
  for (const row of (rec.data as Array<{ room_id: string; rec_count: number }> | undefined) || []) {
    recByRoom[row.room_id] = row.rec_count;
  }
  return rooms.map((r) => ({
    ...r,
    speakers: speakersByRoom[r.id] || 0,
    listeners: listenersByRoom[r.id] || 0,
    rec_count: recByRoom[r.id] || 0,
  }));
}

export async function setRoomPrivacy(roomId: string, isPublic: boolean): Promise<boolean> {
  const { error } = await supabase
    .from('satsang_rooms')
    .update({ is_public: isPublic })
    .eq('id', roomId);
  return !error;
}

export async function startRoomNow(roomId: string): Promise<boolean> {
  const { error } = await supabase
    .from('satsang_rooms')
    .update({ scheduled_at: new Date().toISOString(), scheduled_end_at: null })
    .eq('id', roomId);
  return !error;
}

export async function listRecordings(roomId: string): Promise<Array<{ name: string; url: string }>> {
  try {
    // List files in bucket path `${roomId}/`
    const { data: items, error } = await supabase.storage
      .from('satsang-recordings')
      .list(roomId, { sortBy: { column: 'name', order: 'desc' } });
    if (error) throw error;
    const results: Array<{ name: string; url: string }> = [];
    for (const it of items || []) {
      const path = `${roomId}/${it.name}`;
      const { data: signed, error: sErr } = await supabase.storage
        .from('satsang-recordings')
        .createSignedUrl(path, 3600);
      if (!sErr && signed?.signedUrl) results.push({ name: it.name, url: signed.signedUrl });
    }
    return results;
  } catch {
    return [];
  }
}

export async function listRoomMessages(roomId: string, limit = 100): Promise<SatsangMessage[]> {
  const { data } = await supabase
    .from('satsang_messages')
    .select('id, room_id, user_id, content, created_at')
    .eq('room_id', roomId)
    .order('created_at', { ascending: true })
    .limit(limit);
  return data || [];
}

export async function sendRoomMessage(roomId: string, content: string): Promise<{ ok: boolean; error?: string; msg?: SatsangMessage }> {
  const { data, error } = await supabase
    .from('satsang_messages')
    .insert({ room_id: roomId, content })
    .select('id, room_id, user_id, content, created_at')
    .single();
  return { ok: !error, error: error?.message, msg: (data as SatsangMessage | undefined) };
}

export function subscribeRoomMessages(roomId: string, onInsert: (msg: SatsangMessage) => void) {
  const channel = supabase
    .channel(`satsang-messages-${roomId}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'satsang_messages', filter: `room_id=eq.${roomId}` }, (payload) => {
      onInsert(payload.new as SatsangMessage);
    })
    .subscribe();
  return () => {
    try { channel.unsubscribe(); } catch {}
  };
}

export async function listMembers(roomId: string): Promise<SatsangMember[]> {
  const { data } = await supabase
    .from('satsang_members')
    .select('room_id, user_id, role, is_on_stage, is_muted, hand_raised_at, invited_to_stage_at, invited_by')
    .eq('room_id', roomId);
  return (data as SatsangMember[]) || [];
}

export async function raiseHand(roomId: string): Promise<boolean> {
  const { data: userRes } = await supabase.auth.getUser();
  const uid = userRes?.user?.id;
  if (!uid) return false;
  const { error } = await supabase
    .from('satsang_members')
    .update({ hand_raised_at: new Date().toISOString() })
    .eq('room_id', roomId)
    .eq('user_id', uid);
  return !error;
}

export async function inviteToStage(roomId: string, userId: string): Promise<boolean> {
  const { data: userRes } = await supabase.auth.getUser();
  const inviter = userRes?.user?.id;
  const { error } = await supabase
    .from('satsang_members')
    .update({ invited_to_stage_at: new Date().toISOString(), invited_by: inviter })
    .eq('room_id', roomId)
    .eq('user_id', userId);
  return !error;
}

export async function setRole(roomId: string, userId: string, role: SatsangMember['role']): Promise<boolean> {
  const { error } = await supabase
    .from('satsang_members')
    .update({ role })
    .eq('room_id', roomId)
    .eq('user_id', userId);
  return !error;
}

export async function acceptStageInvite(roomId: string): Promise<boolean> {
  const { data: userRes } = await supabase.auth.getUser();
  const uid = userRes?.user?.id;
  if (!uid) return false;
  const { error } = await supabase
    .from('satsang_members')
    .update({ role: 'speaker', is_on_stage: true, invited_to_stage_at: null, hand_raised_at: null })
    .eq('room_id', roomId)
    .eq('user_id', uid);
  return !error;
}

export async function toggleMute(roomId: string, userId: string, mute: boolean): Promise<boolean> {
  const { error } = await supabase
    .from('satsang_members')
    .update({ is_muted: mute })
    .eq('room_id', roomId)
    .eq('user_id', userId);
  return !error;
}

export function subscribeMembers(roomId: string, onChange: () => void) {
  const channel = supabase
    .channel(`satsang-members-${roomId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'satsang_members', filter: `room_id=eq.${roomId}` }, () => {
      onChange();
    })
    .subscribe();
  return () => {
    try { channel.unsubscribe(); } catch {}
  };
}

export async function clearHand(roomId: string, userId: string): Promise<boolean> {
  const { error } = await supabase
    .from('satsang_members')
    .update({ hand_raised_at: null })
    .eq('room_id', roomId)
    .eq('user_id', userId);
  return !error;
}


