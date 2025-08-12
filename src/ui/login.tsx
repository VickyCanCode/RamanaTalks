import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Eye, EyeOff, User, Lock, Mail } from 'lucide-react';

export default function Login(): JSX.Element {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');
  const siteUrl = (import.meta as any).env?.VITE_SITE_URL || window.location.origin;

  useEffect(() => {
    // If redirected back from OAuth, exchange code for session (PKCE) and surface any error
    (async () => {
      try {
        const url = new URL(window.location.href);
        const errorParam = url.searchParams.get('error_description') || url.searchParams.get('error');
        if (errorParam) setError(decodeURIComponent(errorParam));

        const code = url.searchParams.get('code');
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) setError(error.message);
          // Clean up URL params after handling
          window.history.replaceState({}, document.title, url.origin + url.pathname);
        }
      } catch {}
      // Ensure session is loaded
      void supabase.auth.getSession();
    })();
  }, []);

  async function signInWithGoogle(): Promise<void> {
    setError(null);
    try {
      const { error: err } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: siteUrl }
      });
      if (err) throw err;
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function handlePasswordAuth(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);
    try {
      if (!email || !password) {
        setError('Email and password are required');
        return;
      }
      if (authMode === 'signup') {
        if (password.length < 8) {
          setError('Please choose a password with at least 8 characters');
          return;
        }
        if (password !== confirmPassword) {
          setError('Passwords do not match');
          return;
        }
        const { data, error: err } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: siteUrl }
        });
        if (err) throw err;
        if (data.session) {
          // Signed in immediately (autoconfirm ON)
          setInfo('Account created and signed in.');
        } else {
          // Email confirmation required
          setInfo('Account created. Check your email to confirm and sign in.');
        }
      } else {
        const { error: err } = await supabase.auth.signInWithPassword({ email, password });
        if (err) throw err;
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function sendReset(): Promise<void> {
    try {
      setError(null);
      setInfo(null);
      if (!email) { setError('Enter your email to reset password'); return; }
      const { error: err } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: siteUrl });
      if (err) throw err;
      setInfo('Password reset email sent. Check your inbox.');
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0b0b0b', color: '#eaeaea', fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial' }}>
      <div style={{ width: '100%', maxWidth: 420, padding: 24, border: '1px solid #222', borderRadius: 12, background: '#0e0e0e' }}>
        <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 6, textAlign: 'center' }}>Welcome to RamanaTalks</div>
        <p style={{ opacity: 0.8, fontSize: 13, marginBottom: 16, textAlign: 'center' }}>Sign in with email & password or continue with Google.</p>
        {error && (
          <div role="alert" style={{ color: '#ffb4b4', background: '#2f0f0f', border: '1px solid #5a2626', padding: '8px 10px', borderRadius: 8, marginBottom: 12 }}>{error}</div>
        )}
        {info && (
          <div style={{ color: '#b7f5c4', background: '#0f2f17', border: '1px solid #265a33', padding: '8px 10px', borderRadius: 8, marginBottom: 12 }}>{info}</div>
        )}
        <form onSubmit={handlePasswordAuth} style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 14 }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 2, justifyContent:'center' }}>
            <button type="button" onClick={() => setAuthMode('signin')} style={{ padding: '8px 14px', borderRadius: 999, border: '1px solid #333', background: authMode==='signin' ? '#1a1a1a' : '#0e0e0e', color: '#ddd' }}>Sign in</button>
            <button type="button" onClick={() => setAuthMode('signup')} style={{ padding: '8px 14px', borderRadius: 999, border: '1px solid #333', background: authMode==='signup' ? '#1a1a1a' : '#0e0e0e', color: '#ddd' }}>Create account</button>
          </div>
          <label style={{ display:'flex', flexDirection:'column', gap:6 }}>
            <span style={{ fontSize: 12, opacity: 0.8, display:'flex', alignItems:'center', gap:6 }}><Mail size={14}/> Email</span>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              style={{ padding: '12px 14px', borderRadius: 10, border: '1px solid #333', background: '#0e0e0e', color: '#fff' }}
            />
          </label>
          <label style={{ display:'flex', flexDirection:'column', gap:6 }}>
            <span style={{ fontSize: 12, opacity: 0.8, display:'flex', alignItems:'center', gap:6 }}><Lock size={14}/> {authMode==='signup' ? 'Password (min 8 chars)' : 'Password'}</span>
            <div style={{ position:'relative' }}>
              <input
                type={showPassword ? 'text' : 'password'}
                required
                autoComplete={authMode==='signup' ? 'new-password' : 'current-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={authMode==='signup' ? 'Choose a password' : 'Your password'}
                style={{ width:'100%', padding: '12px 44px 12px 14px', borderRadius: 10, border: '1px solid #333', background: '#0e0e0e', color: '#fff' }}
              />
              <button type="button" onClick={() => setShowPassword((s)=>!s)} aria-label={showPassword ? 'Hide password' : 'Show password'} style={{ position:'absolute', right: 8, top: '50%', transform:'translateY(-50%)', background:'transparent', border:'none', color:'#ddd' }}>
                {showPassword ? <EyeOff size={16}/> : <Eye size={16}/>}
              </button>
            </div>
          </label>
          {authMode==='signup' && (
            <label style={{ display:'flex', flexDirection:'column', gap:6 }}>
              <span style={{ fontSize: 12, opacity: 0.8, display:'flex', alignItems:'center', gap:6 }}><Lock size={14}/> Confirm password</span>
              <input
                type={showPassword ? 'text' : 'password'}
                required
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter password"
                style={{ padding: '12px 14px', borderRadius: 10, border: '1px solid #333', background: '#0e0e0e', color: '#fff' }}
              />
            </label>
          )}
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <button type="button" onClick={() => void sendReset()} style={{ background:'transparent', border:'none', color:'#9fd6ff', fontSize: 12, padding: 0 }}>Forgot password?</button>
            <button type="submit" disabled={loading} style={{ padding: '12px 16px', borderRadius: 10, border: '1px solid #2e7d32', background: '#154a28', color: '#d7ffd9', minWidth: 120 }}>{loading ? 'Please wait…' : (authMode==='signup' ? 'Create account' : 'Sign in')}</button>
          </div>
        </form>
        <div style={{ height: 8 }} />
        <button onClick={() => void signInWithGoogle()} style={{ width: '100%', padding: '12px 14px', borderRadius: 10, border: '1px solid #2d4ea3', background: '#0f1b3a', color: '#c8d6ff' }}>Continue with Google</button>
      </div>
    </div>
  );
}


