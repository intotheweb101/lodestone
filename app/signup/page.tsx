'use client';
import { useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { useRouter } from 'next/navigation';

export default function SignupPage() {
  const { refetch } = useAuth();
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const googleEnabled = process.env.NEXT_PUBLIC_GOOGLE_ENABLED === 'true';

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const res = await fetch('/api/auth/signup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, name, password }) });
      const data = await res.json() as { error?: string };
      if (!res.ok) { setError(data.error ?? 'Signup failed'); return; }
      await refetch();
      router.push('/');
    } catch { setError('Network error'); } finally { setLoading(false); }
  }

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'radial-gradient(120% 80% at 50% -10%, #102d2f 0%, #07151a 60%)', padding: '24px' }}>
      <div style={{ width: '100%', maxWidth: '420px' }}>
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <svg width="48" height="48" viewBox="0 0 48 48" fill="none" style={{ margin: '0 auto 16px' }}>
            <polygon points="24,2 44,13 44,35 24,46 4,35 4,13" fill="#0d2a2c" stroke="#e8b14a" strokeWidth="2" />
            <polygon points="24,9 27.5,21 39,24 27.5,27 24,39 20.5,27 9,24 20.5,21" fill="#e8b14a" />
          </svg>
          <div style={{ fontFamily: "'Pirata One', cursive", fontSize: '32px', color: '#f4f0e6', lineHeight: 1 }}>Lodestone</div>
          <div style={{ fontSize: '14px', color: '#8aa39d', marginTop: '8px' }}>Create your account</div>
        </div>

        <div style={{ background: '#0f2a2c', border: '1px solid #1d4441', borderRadius: '16px', padding: '32px' }}>
          {error && (
            <div style={{ background: 'rgba(226,100,92,0.1)', border: '1px solid rgba(226,100,92,0.35)', borderRadius: '8px', padding: '10px 14px', marginBottom: '20px', fontSize: '13px', color: '#e2645c' }}>
              {error}
            </div>
          )}

          <button disabled={!googleEnabled} onClick={() => { if (googleEnabled) window.location.href = '/api/auth/google'; }}
            style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', padding: '11px', borderRadius: '10px', border: '1px solid #214a47', background: 'transparent', cursor: googleEnabled ? 'pointer' : 'not-allowed', color: googleEnabled ? '#eef3f0' : '#5f7a76', fontSize: '13.5px', fontWeight: 600, marginBottom: '20px', fontFamily: "'IBM Plex Sans',sans-serif", opacity: googleEnabled ? 1 : 0.6 }}>
            <svg viewBox="0 0 24 24" width="18" height="18"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
            {googleEnabled ? 'Sign up with Google' : 'Google sign-in coming soon'}
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
            <div style={{ flex: 1, height: '1px', background: '#1d4441' }} />
            <span style={{ fontSize: '11px', color: '#5f7a76', fontFamily: "'IBM Plex Mono',monospace" }}>OR</span>
            <div style={{ flex: 1, height: '1px', background: '#1d4441' }} />
          </div>

          <form onSubmit={handleSignup} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#8aa39d', marginBottom: '6px', fontFamily: "'IBM Plex Mono',monospace", letterSpacing: '1px', textTransform: 'uppercase' }}>Name</label>
              <input type="text" value={name} onChange={e => setName(e.target.value)} required autoComplete="name"
                style={{ width: '100%', background: '#0e292b', border: '1px solid #214a47', borderRadius: '9px', padding: '10px 14px', color: '#eef3f0', fontSize: '14px', outline: 'none', fontFamily: "'IBM Plex Sans',sans-serif" }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#8aa39d', marginBottom: '6px', fontFamily: "'IBM Plex Mono',monospace", letterSpacing: '1px', textTransform: 'uppercase' }}>Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email"
                style={{ width: '100%', background: '#0e292b', border: '1px solid #214a47', borderRadius: '9px', padding: '10px 14px', color: '#eef3f0', fontSize: '14px', outline: 'none', fontFamily: "'IBM Plex Sans',sans-serif" }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#8aa39d', marginBottom: '6px', fontFamily: "'IBM Plex Mono',monospace", letterSpacing: '1px', textTransform: 'uppercase' }}>Password</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={8} autoComplete="new-password"
                style={{ width: '100%', background: '#0e292b', border: '1px solid #214a47', borderRadius: '9px', padding: '10px 14px', color: '#eef3f0', fontSize: '14px', outline: 'none', fontFamily: "'IBM Plex Sans',sans-serif" }} />
              <div style={{ fontSize: '11px', color: '#5f7a76', marginTop: '5px' }}>Minimum 8 characters</div>
            </div>
            <button type="submit" disabled={loading}
              style={{ background: '#e8b14a', color: '#0a1f22', fontWeight: 700, fontSize: '14px', padding: '12px', borderRadius: '10px', border: 'none', cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1, fontFamily: "'IBM Plex Sans',sans-serif" }}>
              {loading ? 'Creating account…' : 'Create account'}
            </button>
          </form>

          <div style={{ textAlign: 'center', marginTop: '20px', fontSize: '13px', color: '#6f8a85' }}>
            Already have an account?{' '}
            <a href="/login" style={{ color: '#e8b14a', textDecoration: 'none', fontWeight: 600 }}>Sign in &rarr;</a>
          </div>
        </div>
      </div>
    </div>
  );
}
