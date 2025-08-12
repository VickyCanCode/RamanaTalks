import { supabase } from '../lib/supabase';

export type ConversationRow = {
  id: string;
  user_id: string | null;
  title: string | null;
  created_at: string;
  first_message?: string | null;
};

export type MessageRow = {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  created_at: string;
};

export async function createConversation(userId: string | null, title: string | null = null): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from('conversations')
      .insert({ user_id: userId ?? undefined, title })
      .select('id')
      .single();
    if (error) throw error;
    return data?.id ?? null;
  } catch (e) {
    console.warn('Failed to create conversation (maybe table/policies missing):', (e as Error).message);
    return null;
  }
}

export async function saveMessage(conversationId: string, role: 'user' | 'assistant' | 'system', content: string): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from('messages')
      .insert({ conversation_id: conversationId, role, content })
      .select('id')
      .single();
    if (error) throw error;
    return data?.id ?? null;
  } catch (e) {
    console.warn('Failed to save message (maybe table/policies missing):', (e as Error).message);
    return null;
  }
}

export async function submitFeedback(messageId: string | undefined, rating: -1 | 1, note?: string, conversationId?: string | null): Promise<boolean> {
  try {
    let targetMessageId = messageId || null;
    if (!targetMessageId && conversationId) {
      // Fallback: find latest assistant message in this conversation
      const { data, error } = await supabase
        .from('messages')
        .select('id, created_at')
        .eq('conversation_id', conversationId)
        .eq('role', 'assistant')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      targetMessageId = data?.id ?? null;
    }
    if (!targetMessageId) throw new Error('No target message to attach feedback');
    const { error: insError } = await supabase
      .from('message_feedback')
      .insert({ message_id: targetMessageId, rating, note: note ?? null });
    if (insError) throw insError;
    return true;
  } catch (e) {
    console.warn('Failed to submit feedback:', (e as Error).message);
    return false;
  }
}

export async function listConversations(limit = 20): Promise<ConversationRow[]> {
  try {
    const { data, error } = await supabase
      .from('conversations')
      .select('id, user_id, title, created_at')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    const convs: ConversationRow[] = (data || []) as ConversationRow[];
    // For conversations without titles, fetch their first user message to show as fallback title
    const needIds = convs.filter((c) => !c.title).map((c) => c.id);
    if (needIds.length > 0) {
      const { data: msgs } = await supabase
        .from('messages')
        .select('conversation_id, role, content, created_at')
        .in('conversation_id', needIds)
        .eq('role', 'user')
        .order('created_at', { ascending: true });
      const firstByConv = new Map<string, string>();
      for (const m of (msgs || []) as any[]) {
        const cid = m.conversation_id as string;
        if (!firstByConv.has(cid)) firstByConv.set(cid, String(m.content || ''));
      }
      for (const c of convs) {
        if (!c.title) c.first_message = firstByConv.get(c.id) || null;
      }
    }
    return convs;
  } catch (e) {
    console.warn('Failed to list conversations:', (e as Error).message);
    return [];
  }
}

export async function listMessages(conversationId: string): Promise<MessageRow[]> {
  try {
    const { data, error } = await supabase
      .from('messages')
      .select('id, conversation_id, role, content, created_at')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return data || [];
  } catch (e) {
    console.warn('Failed to list messages:', (e as Error).message);
    return [];
  }
}

export async function updateConversationTitle(conversationId: string, title: string): Promise<void> {
  try {
    await supabase.from('conversations').update({ title }).eq('id', conversationId);
  } catch (e) {
    console.warn('Failed to update conversation title:', (e as Error).message);
  }
}

export function subscribeConversations(onChange: () => void): () => void {
  const channel = supabase
    .channel('conversations-realtime')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations' }, () => {
      onChange();
    })
    .subscribe();
  return () => {
    try { channel.unsubscribe(); } catch {}
  };
}

export async function fetchFeedbackSummary(): Promise<{ positive: number; negative: number }> {
  try {
    const { data, error } = await supabase
      .from('message_feedback')
      .select('rating');
    if (error) throw error;
    const ratings = (data || []) as Array<{ rating: number }>;
    return {
      positive: ratings.filter((r) => r.rating === 1).length,
      negative: ratings.filter((r) => r.rating === -1).length,
    };
  } catch (e) {
    console.warn('Failed to fetch feedback summary:', (e as Error).message);
    return { positive: 0, negative: 0 };
  }
}

export async function deleteConversation(conversationId: string): Promise<boolean> {
  try {
    const { error } = await supabase.from('conversations').delete().eq('id', conversationId);
    if (error) throw error;
    return true;
  } catch (e) {
    console.warn('Failed to delete conversation:', (e as Error).message);
    return false;
  }
}

export async function existsConversation(conversationId: string | null | undefined): Promise<boolean> {
  if (!conversationId) return false;
  try {
    const { data } = await supabase
      .from('conversations')
      .select('id')
      .eq('id', conversationId)
      .maybeSingle();
    return !!data?.id;
  } catch {
    return false;
  }
}


