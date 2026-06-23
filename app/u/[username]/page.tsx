import { getUserByUsername } from '@/lib/auth/index';
import { listDecks } from '@/lib/deck/store';
import { runMigrations } from '@/lib/db/migrations';
import { resolveActingUser } from '@/lib/auth/session';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ProfileOwnerSection } from '@/components/profile-owner-section';
import { FollowButton } from '@/components/follow-button';
import { isFollowing, getFollowerCount, getFollowingCount } from '@/lib/social/store';

export const dynamic = 'force-dynamic';

export default async function UserProfilePage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  runMigrations();

  const profile = getUserByUsername(username);
  if (!profile) notFound();

  const actingUser = await resolveActingUser();
  const isOwner = actingUser.id === profile.id;
  const isRealViewer = actingUser.id !== 'local' && !isOwner;
  const viewerFollows = isRealViewer ? isFollowing(actingUser.id, profile.id) : false;
  const followerCount = getFollowerCount(profile.id);
  const followingCount = getFollowingCount(profile.id);

  // Only show public decks from this user
  const decks = listDecks(profile.id).filter(d => d.visibility === 'public');

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '32px 24px', color: 'var(--text)' }}>
      {/* Profile header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 20, marginBottom: 32 }}>
        {/* Avatar */}
        <div style={{
          width: 64, height: 64, borderRadius: '50%',
          background: 'var(--surface-2)', border: '2px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 28, fontWeight: 700, color: 'var(--accent)',
          flexShrink: 0,
        }}>
          {profile.name.charAt(0).toUpperCase()}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>{profile.name}</h1>
            {isOwner && (
              <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: 'rgba(232,177,74,0.15)', color: 'var(--accent)', fontFamily: "'IBM Plex Mono', monospace", letterSpacing: 1 }}>
                YOU
              </span>
            )}
            {isRealViewer && (
              <FollowButton
                targetUserId={profile.id}
                initialFollowing={viewerFollows}
                followerCount={followerCount}
              />
            )}
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-muted, #8ba)', marginTop: 2 }}>
            @{profile.username ?? username}
            <span style={{ marginLeft: 14, color: 'var(--text-faint)' }}>{followerCount} followers · {followingCount} following</span>
          </div>
          {profile.bio && (
            <p style={{ margin: '8px 0 0', fontSize: 14, lineHeight: 1.5 }}>{profile.bio}</p>
          )}

          {/* Owner edit section (client component) */}
          {isOwner && (
            <ProfileOwnerSection
              initialName={profile.name}
              initialBio={profile.bio ?? ''}
            />
          )}
        </div>
      </div>

      {/* Public decks */}
      <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>
        Public Decks ({decks.length})
      </h2>

      {decks.length === 0 ? (
        <p style={{ color: 'var(--text-muted, #8ba)', fontSize: 14 }}>
          {isOwner
            ? "You haven't shared any decks publicly yet. Head to your decks and set visibility to Public."
            : "This user hasn't shared any decks publicly yet."}
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {decks.map(d => (
            <Link
              key={d.id}
              href={d.public_slug ? `/d/${d.public_slug}` : `/decks/${d.id}`}
              style={{
                display: 'block', padding: '14px 18px',
                background: 'var(--surface-2)', borderRadius: 8,
                border: '1px solid var(--border)',
                textDecoration: 'none', color: 'var(--text)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: 600, marginBottom: 3 }}>{d.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted, #8ba)', display: 'flex', gap: 10 }}>
                    <span style={{ textTransform: 'capitalize' }}>{d.format}</span>
                    {d.commander && <span>⌘ {d.commander}</span>}
                    <span>{d.card_count} cards</span>
                  </div>
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-muted, #8ba)', textAlign: 'right' }}>
                  <div>❤️ {d.like_count}</div>
                  <div style={{ fontSize: 11, marginTop: 2 }}>
                    {new Date(d.updated_at).toLocaleDateString()}
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      <div style={{ marginTop: 32, display: 'flex', gap: 16 }}>
        <Link href="/" style={{ fontSize: 13, color: 'var(--text-muted, #8ba)' }}>← Home</Link>
        {isOwner && <Link href="/decks" style={{ fontSize: 13, color: 'var(--accent)' }}>Manage decks →</Link>}
      </div>
    </div>
  );
}
