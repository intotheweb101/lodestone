'use client';
import { useAuth } from '@/components/auth-provider';

export function AuthCorner() {
  const { user, loading, logout } = useAuth();
  if (loading) return null;

  if (!user) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <a href="/login" style={{
          display: 'flex', alignItems: 'center', gap: '8px',
          padding: '7px 10px', borderRadius: '7px',
          textDecoration: 'none', fontSize: '12.5px', fontWeight: 500,
          color: 'var(--text-muted)', border: '1px solid var(--border)',
          background: 'var(--surface)',
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="12" cy="8" r="4" />
            <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
          </svg>
          Sign in
        </a>
        <a href="/signup" style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '6px 10px', borderRadius: '7px',
          textDecoration: 'none', fontSize: '11px',
          color: 'var(--text-faint)',
        }}>
          Create account
        </a>
      </div>
    );
  }

  const initials = user.name.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase();
  const profileHref = `/u/${user.username}`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      {/* User identity row — links to their profile */}
      <a href={profileHref} style={{
        display: 'flex', alignItems: 'center', gap: '9px',
        padding: '7px 8px', borderRadius: '7px',
        textDecoration: 'none',
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        overflow: 'hidden',
      }}>
        {/* Avatar */}
        <div style={{
          width: '28px', height: '28px', borderRadius: '50%',
          background: 'linear-gradient(135deg, #2a6d63, #1f3f4d)',
          flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '11px', fontWeight: 700, color: '#dfeae6',
          fontFamily: "'IBM Plex Sans', sans-serif", overflow: 'hidden', position: 'relative',
        }}>
          {user.avatar_url ? (
            <img src={user.avatar_url} alt={user.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : initials}
          {user.role === 'admin' && (
            <span style={{
              position: 'absolute', bottom: '-1px', right: '-1px',
              background: '#e8b14a', color: '#0a1f22',
              fontSize: '6px', fontWeight: 800, padding: '1px 2px',
              borderRadius: '2px', lineHeight: 1,
            }}>A</span>
          )}
        </div>
        {/* Name */}
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {user.name}
          </div>
          <div style={{ fontSize: '10px', color: 'var(--text-faint)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: "'IBM Plex Mono', monospace" }}>
            @{user.username}
          </div>
        </div>
      </a>
      {/* Account settings + admin links */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
        <a href="/account" style={{
          display: 'block', padding: '5px 10px', borderRadius: '6px',
          fontSize: '11px', color: 'var(--text-faint)',
          fontFamily: "'IBM Plex Sans', sans-serif",
          textDecoration: 'none',
        }}>
          Account settings
        </a>
        {user.role === 'admin' && (
          <a href="/admin" style={{
            display: 'block', padding: '5px 10px', borderRadius: '6px',
            fontSize: '11px', color: 'var(--accent)',
            fontFamily: "'IBM Plex Sans', sans-serif",
            textDecoration: 'none',
          }}>
            Admin panel
          </a>
        )}
        <button
          onClick={logout}
          style={{
            width: '100%', padding: '5px 10px', borderRadius: '6px',
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: '11px', color: 'var(--text-faint)',
            fontFamily: "'IBM Plex Sans', sans-serif",
            textAlign: 'left',
          }}
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
