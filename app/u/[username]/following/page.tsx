import { getUserByUsername } from '@/lib/auth/index';
import { getFollowing } from '@/lib/social/store';
import { runMigrations } from '@/lib/db/migrations';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ username: string }> }): Promise<Metadata> {
  const { username } = await params;
  return { title: `Following — @${username} — Lodestone` };
}

export default async function FollowingPage({ params }: { params: Promise<{ username: string }> }) {
  runMigrations();
  const { username } = await params;
  const profile = getUserByUsername(username);
  if (!profile) notFound();

  const following = getFollowing(profile.id);

  const linkStyle: React.CSSProperties = { color: 'inherit', textDecoration: 'none' };
  const mutedStyle: React.CSSProperties = { color: 'var(--text-faint)', fontSize: 13 };

  return (
    <div style={{ padding: '32px 24px', maxWidth: 520, margin: '0 auto' }}>
      <div style={{ marginBottom: 24 }}>
        <Link href={`/u/${username}`} style={{ ...mutedStyle, display: 'inline-flex', alignItems: 'center', gap: 4, marginBottom: 12 }}>
          ← @{username}
        </Link>
        <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>
          Following
          <span style={{ fontSize: 14, fontWeight: 400, color: 'var(--text-faint)', marginLeft: 8 }}>
            {following.length}
          </span>
        </h1>
      </div>

      {following.length === 0 ? (
        <p style={mutedStyle}>Not following anyone yet.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {following.map(f => (
            <Link key={f.id} href={f.username ? `/u/${f.username}` : '#'} style={linkStyle}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 10, transition: 'background 0.12s' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--surface-raised)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 700, color: 'var(--accent)', flexShrink: 0 }}>
                  {f.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{f.name}</div>
                  {f.username && <div style={{ fontSize: 12, color: 'var(--text-faint)', fontFamily: "'IBM Plex Mono', monospace" }}>@{f.username}</div>}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
