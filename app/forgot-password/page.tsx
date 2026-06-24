'use client';
import { useState } from 'react';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      // Always show success to prevent enumeration
      setSubmitted(true);
    } catch { setError('Network error — please try again.'); }
    finally { setLoading(false); }
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
          <div style={{ fontSize: '14px', color: '#8aa39d', marginTop: '8px' }}>Reset your password</div>
        </div>

        <div style={{ background: '#0f2a2c', border: '1px solid #1d4441', borderRadius: '16px', padding: '32px' }}>
          {submitted ? (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '36px', marginBottom: '12px' }}>📧</div>
              <p style={{ color: '#8aa39d', lineHeight: 1.6, marginBottom: '16px' }}>
                If that email has an account, a reset link is on its way. Check your inbox (and spam folder).
              </p>
              <a href="/login" style={{ color: '#e8b14a', textDecoration: 'none', fontWeight: 600, fontSize: '14px' }}>
                Back to sign in &rarr;
              </a>
            </div>
          ) : (
            <>
              {error && (
                <div style={{ background: 'rgba(226,100,92,0.1)', border: '1px solid rgba(226,100,92,0.35)', borderRadius: '8px', padding: '10px 14px', marginBottom: '20px', fontSize: '13px', color: '#e2645c' }}>
                  {error}
                </div>
              )}
              <p style={{ color: '#6f8a85', fontSize: '13.5px', lineHeight: 1.6, marginBottom: '24px' }}>
                Enter the email address on your account and we'll send you a reset link.
              </p>
              <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#8aa39d', marginBottom: '6px', fontFamily: "'IBM Plex Mono',monospace", letterSpacing: '1px', textTransform: 'uppercase' }}>Email</label>
                  <input
                    type="email" value={email} onChange={e => setEmail(e.target.value)} required autoFocus
                    style={{ width: '100%', background: '#0e292b', border: '1px solid #214a47', borderRadius: '9px', padding: '10px 14px', color: '#eef3f0', fontSize: '14px', outline: 'none', fontFamily: "'IBM Plex Sans',sans-serif" }}
                  />
                </div>
                <button type="submit" disabled={loading}
                  style={{ background: '#e8b14a', color: '#0a1f22', fontWeight: 700, fontSize: '14px', padding: '12px', borderRadius: '10px', border: 'none', cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1, fontFamily: "'IBM Plex Sans',sans-serif" }}>
                  {loading ? 'Sending…' : 'Send reset link'}
                </button>
              </form>
              <div style={{ textAlign: 'center', marginTop: '20px', fontSize: '13px', color: '#6f8a85' }}>
                Remembered it?{' '}
                <a href="/login" style={{ color: '#e8b14a', textDecoration: 'none', fontWeight: 600 }}>Sign in &rarr;</a>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
