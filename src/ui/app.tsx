import React, { useEffect, useMemo, useState } from 'react';
import { Menu, Send, Volume2, Square, Copy as CopyIcon, Mic, MicOff, PlusCircle, ArrowDown, Loader2 } from 'lucide-react';
import { createConversation, saveMessage, submitFeedback, listMessages, updateConversationTitle, existsConversation } from '../data/conversations';
import { speak, stopSpeak, setTtsLoadingListener } from './tts';
import Sidebar from './sidebar';

type ChatMessage = { role: 'user' | 'assistant'; content: string; id?: string; lang?: string };

export default function App(): JSX.Element {
  const persist = (import.meta as any).env?.VITE_PERSIST === 'true';
  const showFeedback = (import.meta as any).env?.VITE_SHOW_FEEDBACK !== 'false';
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [feedbackDone, setFeedbackDone] = useState<Record<string, boolean>>({});
  const [convIdState, setConvIdState] = useState<string | null>(localStorage.getItem('convId'));
  const [suggested, setSuggested] = useState<string[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(false);
  const [voiceOn, setVoiceOn] = useState<boolean>(() => localStorage.getItem('voiceOn') !== 'false');
  const [lastLang, setLastLang] = useState<string>('en-IN');
  const [selectedLang, setSelectedLang] = useState<string>(() => localStorage.getItem('chat_lang') || 'auto');
  const [showLangNudge, setShowLangNudge] = useState<boolean>(() => !localStorage.getItem('chat_lang'));
  const [listening, setListening] = useState<boolean>(false);
  const recognitionRef = React.useRef<any>(null);
  const recorderRef = React.useRef<any>(null);
  const mediaStreamRef = React.useRef<MediaStream | null>(null);
  const stopTimerRef = React.useRef<number | null>(null);
  const [justCreatedConv, setJustCreatedConv] = useState<boolean>(false);
  const [ttsLoadingIdx, setTtsLoadingIdx] = useState<number | null>(null);
  const [displayName, setDisplayName] = useState<string>('You');
  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  const atBottomRef = React.useRef<boolean>(true);
  const [showJump, setShowJump] = useState<boolean>(false);
  const typingTimerRef = React.useRef<number | null>(null);
  const [isTyping, setIsTyping] = useState<boolean>(false);
  const [isMobile, setIsMobile] = useState<boolean>(false);

  const apiBase = useMemo(() => {
    return '/api/chat-supabase';
  }, []);

  useEffect(() => {
    const onResize = () => { try { setIsMobile(window.innerWidth <= 768); } catch { setIsMobile(false); } };
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const { supabase } = await import('../lib/supabase');
        const { data } = await supabase.auth.getUser();
        const u = data?.user;
        let name = (u?.user_metadata as any)?.full_name as string | undefined;
        if (!name && u?.email) name = String(u.email).split('@')[0];
        setDisplayName(name || 'You');
      } catch {}
    })();
  }, []);

  // Keep scrolled to bottom when new messages arrive if user is near bottom
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (atBottomRef.current) {
      // Scroll smoothly to bottom
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    }
  }, [messages]);

  async function sendMessage(): Promise<void> {
    const content = input.trim();
    if (!content || loading) return;
    setInput('');
    // Prepare history including the new user message
    const historyToSend: ChatMessage[] = [...messages, { role: 'user', content }];
    setMessages(historyToSend);
    setLoading(true);
    try {
      // Create conversation on first send and persist messages if possible
      let convId = convIdState || localStorage.getItem('convId');
      if (persist) {
        // If local cached convId is missing or invalid, create a new one
        if (!convId || !(await existsConversation(convId))) {
          convId = (await createConversation(null, null)) || '';
          if (convId) localStorage.setItem('convId', convId);
          setConvIdState(convId || null);
          setJustCreatedConv(true);
        }
      }
      if (persist && convId) {
        const userMsgId = await saveMessage(convId, 'user', content);
        if (userMsgId) {
          setMessages((prev) => {
            const copy = [...prev];
            // last pushed is the user message
            copy[copy.length - 1] = { ...copy[copy.length - 1], id: userMsgId };
            return copy;
          });
        }
      }

      const res = await fetch(apiBase, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: content, messageHistory: historyToSend, conversationId: convId || undefined, languageCode: selectedLang !== 'auto' ? selectedLang : undefined })
      });
      const data = await res.json();
      const reply = (data?.response as string) ?? 'No response';
      const detected = (data?.detectedLanguage as string) || 'en-IN';
      setLastLang(detected);
      const follow = (data?.followUpQuestions as string[]) || [];
      setSuggested(follow);
      // Typing animation for assistant reply; save to DB after complete
      setIsTyping(true);
      await new Promise<void>((resolve) => {
        setMessages((prev) => [...prev, { role: 'assistant', content: '', lang: (selectedLang !== 'auto' ? selectedLang : detected) }]);
        const step = Math.max(2, Math.floor(reply.length / 240));
        let i = 0;
        const tick = () => {
          i = Math.min(reply.length, i + step);
          setMessages((prev) => {
            const copy = [...prev];
            const lastIdx = copy.length - 1;
            if (lastIdx >= 0) copy[lastIdx] = { ...copy[lastIdx], content: reply.slice(0, i) };
            return copy;
          });
          if (atBottomRef.current && scrollRef.current) {
            scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight });
          }
          if (i < reply.length) {
            typingTimerRef.current = window.setTimeout(tick, 16);
          } else {
            typingTimerRef.current = null;
            setIsTyping(false);
            resolve();
          }
        };
        tick();
      });
      if (persist && convId) {
         const savedId = await saveMessage(convId, 'assistant', reply);
        if (savedId) {
          setMessages((prev) => {
            const copy = [...prev];
            const lastIdx = copy.length - 1;
            if (lastIdx >= 0) copy[lastIdx] = { ...copy[lastIdx], id: savedId } as any;
            return copy;
          });
        }
      }

      // Set a title on first message of a new conversation
      if (persist && convId && justCreatedConv) {
        const title = content.length > 60 ? content.slice(0, 57) + '…' : content;
        await updateConversationTitle(convId, title);
        setJustCreatedConv(false);
      }

      // TTS for assistant reply (optional). Toggle play/pause on repeated press handled in speak().
       if (voiceOn) speak(reply, selectedLang !== 'auto' ? selectedLang : detected);
    } catch (e) {
      setMessages((prev) => [...prev, { role: 'assistant', content: 'Error contacting server.' }]);
    } finally {
      setLoading(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>): void {
    if (e.key === 'Enter') {
      e.preventDefault();
      void sendMessage();
    }
  }

  // Load messages when selecting an existing conversation
  useEffect(() => {
    const convId = convIdState || localStorage.getItem('convId');
    if (!persist || !convId) {
      setMessages([]);
      return;
    }
    (async () => {
      const rows = await listMessages(convId);
      const mapped: ChatMessage[] = rows.map((r) => ({ role: r.role === 'system' ? 'assistant' : (r.role as 'user'|'assistant'), content: r.content, id: r.id }));
      setMessages(mapped);
    })();
  }, [persist, convIdState]);

  function newChat(): void {
    setMessages([]);
    setSuggested([]);
    setJustCreatedConv(false);
    localStorage.removeItem('convId');
    setConvIdState(null);
  }

  // Voice input using server STT (MediaRecorder → Google STT). Falls back to Web Speech API if needed.
  function toggleListening(): void {
    try {
      if (selectedLang === 'auto') { setShowLangNudge(true); return; }
      const useServerStt = typeof (window as any).MediaRecorder !== 'undefined' && navigator.mediaDevices?.getUserMedia;
      if (useServerStt) {
        if (!listening) {
          (async () => {
            try {
              const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
              mediaStreamRef.current = stream;
              const supportsWebm = (window as any).MediaRecorder.isTypeSupported?.('audio/webm;codecs=opus') || false;
              const supportsOgg = (window as any).MediaRecorder.isTypeSupported?.('audio/ogg;codecs=opus') || false;
              if (!supportsWebm && !supportsOgg) {
                // Fallback to Web Speech API if container not supported (e.g., Safari)
                mediaStreamRef.current.getTracks().forEach((t)=>t.stop());
                mediaStreamRef.current = null;
                throw new Error('No supported MediaRecorder mime types');
              }
              const mime = supportsWebm ? 'audio/webm;codecs=opus' : 'audio/ogg;codecs=opus';
              const recorder = new (window as any).MediaRecorder(stream, { mimeType: mime });
              const chunks: Blob[] = [];
              recorder.ondataavailable = (e: any) => { if (e.data?.size) chunks.push(e.data); };
              recorder.onstop = async () => {
                try {
                  const blob = new Blob(chunks, { type: mime });
                  const base64 = await new Promise<string>((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = () => resolve((reader.result as string).split(',')[1] || '');
                    reader.onerror = reject;
                    reader.readAsDataURL(blob);
                  });
                  let res = await fetch('/api/stt-google', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ audio: base64, mime, language: selectedLang !== 'auto' ? selectedLang : undefined })
                  });
                  if (res.status === 404) {
                    // Fallback path in case /api proxy is unavailable
                    res = await fetch('/.netlify/functions/stt-google', {
                      method: 'POST', headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ audio: base64, mime, language: selectedLang !== 'auto' ? selectedLang : undefined })
                    });
                  }
                  const out = await res.json();
                  if (out?.text) setInput(out.text);
                  if (out?.detectedLanguage) setLastLang(out.detectedLanguage);
                } catch {}
                finally {
                  try { mediaStreamRef.current?.getTracks()?.forEach((t) => t.stop()); } catch {}
                  mediaStreamRef.current = null;
                }
              };
              recorderRef.current = recorder;
              recorder.start();
              setListening(true);
              // Auto-stop after 15s
              stopTimerRef.current = window.setTimeout(() => {
                try { recorderRef.current?.stop?.(); } catch {}
                recorderRef.current = null;
                setListening(false);
              }, 15000);
            } catch {
              // Fallback to Web Speech API
              try {
                const SR: any = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
                if (!SR) throw new Error('No SR');
                const rec = new SR();
                rec.continuous = false;
                rec.interimResults = false;
                rec.lang = selectedLang !== 'auto' ? selectedLang : (lastLang || 'en-IN');
                rec.onresult = (e: any) => {
                  const text = e.results?.[0]?.[0]?.transcript || '';
                  setInput(text);
                };
                rec.onend = () => setListening(false);
                recognitionRef.current = rec;
                setListening(true);
                rec.start();
              } catch {
                setListening(false);
              }
            }
          })();
        } else {
          try { if (stopTimerRef.current) { window.clearTimeout(stopTimerRef.current); stopTimerRef.current = null; } } catch {}
          try { recorderRef.current?.stop?.(); } catch {}
          recorderRef.current = null;
          setListening(false);
        }
        return;
      }
      // Fallback: Web Speech API
      if (!('webkitSpeechRecognition' in window) && !(window as any).SpeechRecognition) {
        alert('Speech recognition not supported in this browser');
        return;
      }
      const SR: any = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (!recognitionRef.current) {
        const rec = new SR();
        rec.continuous = false;
        rec.interimResults = false;
        rec.lang = selectedLang !== 'auto' ? selectedLang : (lastLang || 'en-IN');
        rec.onresult = (e: any) => {
          const text = e.results?.[0]?.[0]?.transcript || '';
          setInput(text);
        };
        rec.onend = () => setListening(false);
        recognitionRef.current = rec;
      } else {
        recognitionRef.current.lang = selectedLang !== 'auto' ? selectedLang : (lastLang || 'en-IN');
      }
      if (!listening) {
        setListening(true);
        recognitionRef.current.start();
      } else {
        recognitionRef.current.stop();
        setListening(false);
      }
    } catch {
      setListening(false);
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header style={{ position: 'sticky', top: 'var(--sticky-1)', zIndex: 150, padding: '16px', borderBottom: '1px solid #1b1b1b', background: 'rgba(10,10,10,0.9)', backdropFilter: 'blur(6px)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button className="btn" onClick={() => setSidebarOpen((v) => !v)} aria-label="Toggle list"><Menu size={18} /></button>
          </div>
          <button onClick={newChat} className="btn btn-primary" style={{ fontSize: 12 }} aria-label="New chat"><PlusCircle size={16} style={{ marginRight: 6 }} /> New Chat</button>
        </div>
        {isTyping && (
          <div style={{ marginTop: 8, fontSize: 12, opacity: 0.8 }}>typing…</div>
        )}
      </header>
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        {sidebarOpen && (
          <div style={{ position:'sticky', top: 180, alignSelf:'flex-start', zIndex:140 }}>
            <Sidebar onSelect={(id) => { localStorage.setItem('convId', id); setConvIdState(id); setSidebarOpen(false); }} />
          </div>
        )}
        <main style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', position: 'relative', paddingBottom: isMobile ? 170 : 140, backgroundImage: 'linear-gradient(rgba(0,0,0,0.55), rgba(0,0,0,0.55)), url(/aesthetic-background-with-gradient-neon-led-light-effect.jpg)', backgroundSize: 'cover', backgroundPosition: 'center', backgroundAttachment: 'fixed', WebkitOverflowScrolling: 'touch' }} onScroll={(e) => {
            const el = e.currentTarget as HTMLDivElement;
            const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
            atBottomRef.current = nearBottom;
            setShowJump(!nearBottom);
          }}>
            <div style={{ padding: '16px', maxWidth: 1200, width: '100%', margin: '0 auto' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                 {messages.map((m, idx) => (
                  <div key={idx} style={{
                    alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
                    background: '#151515',
                    color: '#eee',
                    border: '1px solid #2a2a2a', borderRadius: 12, padding: '12px 14px', maxWidth: '90%',
                    boxShadow: '0 6px 16px rgba(0,0,0,0.35)',
                    transition: 'transform 180ms ease, opacity 180ms ease',
                    animation: 'fadeInUp 260ms ease both'
                  }}>
                    <div style={{ opacity: 0.85, fontSize: 12, marginBottom: 6, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <span>{m.role === 'user' ? displayName : 'Ramana'}</span>
                      <span style={{ opacity: 0.7 }}>{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                     <div style={{ whiteSpace: 'pre-wrap' }}>{m.content}</div>
                     {m.role === 'assistant' && Array.isArray((data as any)?.sourceAttribution) ? (
                       <details style={{ marginTop: 6, fontSize: 12, opacity: 0.85 }}>
                         <summary>Sources</summary>
                         <ul style={{ margin: '6px 0 0 16px', padding: 0 }}>
                           {((data as any).sourceAttribution as any[]).slice(0,4).map((s, i) => (
                             <li key={i} style={{ listStyle: 'disc' }}>{String(s.source || 'source')} — {String(s.category || '')}</li>
                           ))}
                         </ul>
                       </details>
                     ) : null}
                    {m.role === 'assistant' && (
                      <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                        <button className="btn" onClick={() => {
                          setTtsLoadingListener((loading) => setTtsLoadingIdx(loading ? idx : null));
                          const useLang = (m.lang || (selectedLang !== 'auto' ? selectedLang : lastLang));
                          speak(m.content, useLang);
                        }} title="Play / Pause">{ttsLoadingIdx === idx ? <Loader2 size={16} className="spin" /> : <Volume2 size={16} />}</button>
                        <button className="btn" onClick={() => stopSpeak()} title="Stop"><Square size={16} /></button>
                        <button className="btn" onClick={() => { navigator.clipboard.writeText(m.content).catch(()=>{}); }} title="Copy"><CopyIcon size={16} /></button>
                      </div>
                    )}
                    {showFeedback && m.role === 'assistant' && (
                      <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                        <button
                          aria-label="Thumbs up"
                          onClick={async () => {
                            if (feedbackDone[m.id || 'pending']) return;
                            if (!persist) { console.log('Feedback disabled (VITE_PERSIST=false)'); return; }
                            const ok = await submitFeedback(m.id, 1, undefined, convIdState || localStorage.getItem('convId'));
                            if (ok && m.id) setFeedbackDone((s) => ({ ...s, [m.id!]: true }));
                          }}
                          style={{ fontSize: 12, padding: '4px 8px', borderRadius: 8, background: '#0f2f17', color: '#b7f5c4', border: '1px solid #265a33' }}
                          disabled={(persist && (!m.id || !!(m.id && feedbackDone[m.id])))}
                        >👍</button>
                        <button
                          aria-label="Thumbs down"
                          onClick={async () => {
                            if (feedbackDone[m.id || 'pending']) return;
                            if (!persist) { console.log('Feedback disabled (VITE_PERSIST=false)'); return; }
                            const ok = await submitFeedback(m.id, -1, undefined, convIdState || localStorage.getItem('convId'));
                            if (ok && m.id) setFeedbackDone((s) => ({ ...s, [m.id!]: true }));
                          }}
                          style={{ fontSize: 12, padding: '4px 8px', borderRadius: 8, background: '#2f0f0f', color: '#f5b7b7', border: '1px solid #5a2626' }}
                          disabled={(persist && (!m.id || !!(m.id && feedbackDone[m.id])))}
                        >👎</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
            {/* auto-stick to bottom on new messages */}
            <div aria-hidden style={{ height: 1 }} />
            {showJump && (
              <button onClick={() => { const el = scrollRef.current; if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' }); setShowJump(false); }}
                className="btn"
                style={{ position: 'fixed', right: 16, bottom: 90, display: 'flex', alignItems: 'center', gap: 6 }}
                aria-label="Jump to bottom">
                  <ArrowDown size={16} /> New messages
              </button>
            )}
          </div>
        </main>
      </div>
      <footer style={{ position: 'sticky', bottom: 0, padding: 12, borderTop: '1px solid #1b1b1b', background: 'rgba(10,10,10,0.9)', backdropFilter: 'blur(6px)', zIndex: 6 }}>
        {suggested.length > 0 && (
          <div style={{ maxWidth: 720, margin: '0 auto 8px', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {suggested.map((q, i) => (
              <button key={i} onClick={() => setInput(q)} style={{
                padding: '6px 10px', borderRadius: 999, border: '1px solid #333', background: '#0e0e0e', color: '#ddd', fontSize: 12
              }}>{q}</button>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, maxWidth: 720, width: '100%', margin: '0 auto', alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={loading ? 'Thinking…' : 'Ask your question…'}
            aria-label="Ask your question"
            disabled={loading}
            inputMode="text"
            style={{ flex: isMobile ? '0 0 100%' : '1 1 auto', padding: isMobile ? '14px 16px' : '12px 14px', background: '#1b1b1b', color: '#eee', border: '1px solid #333', minWidth: 0 }}
          />
          <div style={{ position:'relative', flex: isMobile ? '1 1 auto' : '0 0 auto' }}>
          <select aria-label="Language" value={selectedLang} onChange={(e) => { const v = e.target.value; setSelectedLang(v); setShowLangNudge(false); try { localStorage.setItem('chat_lang', v); } catch {} }} className="btn" style={{ padding: isMobile ? '10px 10px' : '10px 12px', boxShadow: showLangNudge ? '0 0 0 2px #ffd27a, 0 0 18px #ffb84d' : undefined, maxWidth: isMobile ? 180 : undefined }}>
            <option value="auto">Auto</option>
            <option value="en-IN">English</option>
            <option value="hi-IN">Hindi</option>
            <option value="ta-IN">Tamil</option>
            <option value="te-IN">Telugu</option>
            <option value="kn-IN">Kannada</option>
            <option value="ml-IN">Malayalam</option>
            <option value="bn-IN">Bengali</option>
            <option value="gu-IN">Gujarati</option>
            <option value="mr-IN">Marathi</option>
            <option value="pa-IN">Punjabi</option>
            <option value="or-IN">Odia</option>
            <option value="sa-IN">Sanskrit</option>
            <option value="es">Spanish</option>
            <option value="fr">French</option>
            <option value="de">German</option>
            <option value="it">Italian</option>
            <option value="pt">Portuguese</option>
            <option value="ru">Russian</option>
            <option value="ja">Japanese</option>
            <option value="ko">Korean</option>
            <option value="zh">Chinese</option>
            <option value="ar">Arabic</option>
          </select>
          {showLangNudge && (
            <div style={{ position:'absolute', bottom: 'calc(100% + 8px)', right: 0, background:'#1a1a1a', color:'#fff', border:'1px solid #333', borderRadius:8, padding:'8px 10px', fontSize:12, boxShadow:'0 8px 20px rgba(0,0,0,0.4)' }}>
              Please choose a language for best voice accuracy
            </div>
          )}
          </div>
          <button onClick={toggleListening} className="btn" aria-pressed={listening} aria-label="Voice input" title="Voice input" style={listening ? { boxShadow: '0 0 14px #5fd18a' } : undefined}>{listening ? <Mic size={16} /> : <MicOff size={16} />}</button>
          <button onClick={() => void sendMessage()} disabled={loading} className="btn btn-primary" aria-label="Send" style={isMobile ? { flex: '1 1 auto' } : undefined}><Send size={16} /></button>
        </div>
      </footer>
    </div>
  );
}


