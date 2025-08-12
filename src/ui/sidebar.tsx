import React, { useEffect, useState } from 'react';
import { listConversations, ConversationRow, subscribeConversations, deleteConversation } from '../data/conversations';

type Props = {
  onSelect: (id: string) => void;
};

export default function Sidebar({ onSelect }: Props): JSX.Element {
  const [items, setItems] = useState<ConversationRow[]>([]);
  useEffect(() => {
    listConversations(20).then(setItems);
    const unsub = subscribeConversations(() => listConversations(20).then(setItems));
    return () => { unsub(); };
  }, []);

  return (
    <aside style={{ width: 300, borderRight: '1px solid #222', padding: 12, display: 'flex', flexDirection: 'column', gap: 8, background: 'rgba(10,10,10,0.6)', backdropFilter: 'blur(6px)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ opacity: 0.7, fontSize: 13 }}>Conversations</div>
        <button aria-label="Refresh" className="btn" onClick={async () => setItems(await listConversations(20))}>⟳</button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {items.length === 0 && (
          <div style={{ opacity: 0.6, fontSize: 12 }}>No conversations yet. Start a new chat.</div>
        )}
        {items.map((c) => (
          <div key={c.id} role="button" tabIndex={0} onClick={() => onSelect(c.id)} className="card" style={{ textAlign: 'left', padding: '10px 12px', outline: 'none' }}>
            <div style={{ fontWeight: 700, color: '#eaeaea', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.title || (c.first_message || 'Untitled')}</div>
            <div style={{ opacity: 0.75, fontSize: 12, color: '#cfcfcf' }}>{new Date(c.created_at).toLocaleString()}</div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button aria-label="Delete conversation" onClick={async (e) => { e.stopPropagation(); await deleteConversation(c.id); setItems(await listConversations(20)); }} className="btn" style={{ padding: '4px 8px', fontSize: 12, marginTop: 6 }}>🗑️</button>
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
}


