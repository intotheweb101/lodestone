import { getUserByUsername } from '@/lib/auth/index';
import { listDecks, getDeck } from '@/lib/deck/store';
import { runMigrations } from '@/lib/db/migrations';
import { resolveActingUser } from '@/lib/auth/session';
import { getDb } from '@/lib/db/connection';
import { getCollectionValueUsd } from '@/lib/collection/store';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ProfileOwnerSection } from '@/components/profile-owner-section';
import { FollowButton } from '@/components/follow-button';
import { isFollowing, getFollowerCount, getFollowingCount } from '@/lib/social/store';
import { actionPinDeck } from '@/app/actions';
import { deckSize } from '@/lib/deck/model';
import type { DeckListRow } from '@/lib/deck/store';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ username: string }> }): Promise<Metadata> {
  const { username } = await params;
  const profile = getUserByUsername(username);
  if (!profile) return { title: 'User not found — Lodestone' };
  return { title: `${profile.name} (@${username}) — Lodestone` };
}

// ── Profile stats ─────────────────────────────────────────────────────────────

interface ProfileStats {
  totalDecks: number;
  publicDecks: number;
  totalGames: number;
  wins: number;
  favoriteFormat: string | null;
  topCommander: string | null;
}

function getProfileStats(userId: string): ProfileStats {
  const db = getDb();

  const deckRow = db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN visibility = 'public' THEN 1 ELSE 0 END) as public
    FROM decks WHERE user_id = ?
  `).get(userId) as { total: number; public: number };

  const gameRow = db.prepare(`
    SELECT COUNT(*) as total,
           SUM(CASE WHEN result = 'win' THEN 1 ELSE 0 END) as wins
    FROM deck_games WHERE user_id = ?
  `).get(userId) as { total: number; wins: number };

  const fmtRow = db.prepare(`
    SELECT format FROM decks WHERE user_id = ? AND format IS NOT NULL
    GROUP BY format ORDER BY COUNT(*) DESC LIMIT 1
  `).get(userId) as { format: string } | undefined;

  const cmdRow = db.prepare(`
    SELECT commander FROM decks
    WHERE user_id = ? AND commander IS NOT NULL AND commander != ''
    GROUP BY commander ORDER BY COUNT(*) DESC LIMIT 1
  `).get(userId) as { commander: string } | undefined;

  return {
    totalDecks: deckRow.total ?? 0,
    publicDecks: deckRow.public ?? 0,
    totalGames: gameRow.total ?? 0,
    wins: gameRow.wins ?? 0,
    favoriteFormat: fmtRow?.format ?? null,
    topCommander: cmdRow?.commander ?? null,
  };
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function UserProfilePage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
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

  const db = getDb();

  // Pinned deck
  const pinnedRow = db.prepare('SELECT pinned_deck_id FROM users WHERE id = ?').get(profile.id) as { pinned_deck_id: string | null } | undefined;
  const pinnedDeck = pinnedRow?.pinned_deck_id ? getDeck(pinnedRow.pinned_deck_id) : null;

  // Public decks (for the deck list)
  const allDecks = listDecks(profile.id).filter(d => d.visibility === 'public');

  // Stats
  const stats = getProfileStats(profile.id);
  const winPct = stats.totalGames > 0 ? Math.round((stats.wins / stats.totalGames) * 100) : null;

  // Collection value — owner only (privacy)
  const collectionValue = isOwner ? getCollectionValueUsd(profile.id) : null;

  // Recent activity: last 3 updated (any visibility for owner; public-only for others)
  const recentDecks = isOwner
    ? listDecks(profile.id).slice(0, 3)
    : allDecks.slice(0, 3);

  return (
    <div style={{ maxWidth: 820, margin: '0 auto', padding: '2rem 1.5rem', color: 'var(--text)' }}>

      {/* ── Profile header ──────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 20, marginBottom: 28 }}>
        <div style={{
          width: 64, height: 64, borderRadius: '50%',
          background: 'var(--surface-2)', border: '2px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 26, fontWeight: 700, color: 'var(--accent)', flexShrink: 0,
        }}>
          {profile.name.charAt(0).toUpperCase()}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>{profile.name}</h1>
            {isOwner && (
              <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 4, background: 'var(--accent-glow)', color: 'var(--accent)', fontFamily: "'IBM Plex Mono', monospace", letterSpacing: 1 }}>
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

          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 3 }}>
            @{profile.username ?? username}
            <span style={{ marginLeft: 14, color: 'var(--text-faint)' }}>
              <Link href={`/u/${profile.username ?? username}/followers`} style={{ color: 'inherit', textDecoration: 'none' }}>
                {followerCount} <span style={{ color: 'var(--text-faint)' }}>followers</span>
              </Link>
              {' · '}
              <Link href={`/u/${profile.username ?? username}/following`} style={{ color: 'inherit', textDecoration: 'none' }}>
                {followingCount} <span style={{ color: 'var(--text-faint)' }}>following</span>
              </Link>
            </span>
          </div>

          {profile.bio && (
            <p style={{ margin: '8px 0 0', fontSize: 14, lineHeight: 1.6, color: 'var(--text-muted)' }}>
              {profile.bio}
            </p>
          )}

          {isOwner && (
            <ProfileOwnerSection
              initialName={profile.name}
              initialBio={profile.bio ?? ''}
            />
          )}
        </div>
      </div>

      {/* ── Stats bar ───────────────────────────────────────────────────────── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${collectionValue ? 5 : 4}, 1fr)`,
        gap: 1, marginBottom: 24,
        background: 'var(--border)', borderRadius: 10, overflow: 'hidden',
      }}>
        {[
          { label: 'Public decks', value: stats.publicDecks, sub: stats.totalDecks !== stats.publicDecks ? `${stats.totalDecks} total` : null },
          { label: 'Games logged', value: stats.totalGames, sub: null },
          { label: 'Win rate', value: winPct != null ? `${winPct}%` : '—', sub: winPct != null ? `${stats.wins}W` : null },
          { label: 'Fav. format', value: stats.favoriteFormat ? stats.favoriteFormat.charAt(0).toUpperCase() + stats.favoriteFormat.slice(1) : '—', sub: null },
          ...(collectionValue ? [{ label: 'Collection', value: `$${collectionValue.value_usd.toFixed(0)}`, sub: `${collectionValue.card_count} cards` }] : []),
        ].map(({ label, value, sub }) => (
          <div key={label} style={{ background: 'var(--surface)', padding: '12px 0', textAlign: 'center' }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', fontFamily: "'IBM Plex Mono', monospace", lineHeight: 1.2 }}>
              {value}
            </div>
            <div style={{ fontSize: 9.5, color: 'var(--text-faint)', marginTop: 3, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              {label}
            </div>
            {sub && (
              <div style={{ fontSize: 9, color: 'var(--text-faintest)', marginTop: 1, fontFamily: "'IBM Plex Mono', monospace" }}>
                {sub}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* ── Top commander badge ──────────────────────────────────────────────── */}
      {stats.topCommander && (
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '4px 10px', borderRadius: 20,
          background: 'var(--surface)', border: '1px solid var(--border)',
          fontSize: 11, color: 'var(--text-faint)', marginBottom: 24,
        }}>
          <span>⌘</span>
          <span style={{ color: 'var(--text-muted)' }}>Favourite commander:</span>
          <span style={{ color: 'var(--accent)', fontWeight: 600 }}>{stats.topCommander}</span>
        </div>
      )}

      {/* ── Pinned deck ──────────────────────────────────────────────────────── */}
      {pinnedDeck && (
        <section style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 10, fontFamily: "'IBM Plex Mono', monospace", letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--accent)', marginBottom: 10 }}>
            📌 Pinned
          </div>
          <Link
            href={pinnedDeck.public_slug ? `/d/${pinnedDeck.public_slug}` : `/decks/${pinnedDeck.id}`}
            style={{ textDecoration: 'none', color: 'var(--text)' }}
          >
            <div style={{
              background: 'var(--surface)', border: '1.5px solid var(--accent)44',
              borderRadius: 12, padding: '18px 20px',
              display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
              gap: 16,
            }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 6, letterSpacing: '-0.01em' }}>
                  {pinnedDeck.name}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 14px', fontSize: 12, color: 'var(--text-faint)' }}>
                  <span style={{ textTransform: 'capitalize' }}>{pinnedDeck.format ?? 'Unknown'}</span>
                  {pinnedDeck.commander && <span>⌘ {pinnedDeck.commander}</span>}
                  <span>{deckSize(pinnedDeck)} cards</span>
                  {(pinnedDeck.tags?.length ?? 0) > 0 && (
                    <span style={{ color: 'var(--text-faintest)' }}>{pinnedDeck.tags!.slice(0, 3).join(' · ')}</span>
                  )}
                </div>
                {pinnedDeck.description && (
                  <p style={{ margin: '8px 0 0', fontSize: 12.5, color: 'var(--text-faint)', lineHeight: 1.5 }}>
                    {pinnedDeck.description.slice(0, 160)}{pinnedDeck.description.length > 160 ? '…' : ''}
                  </p>
                )}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-faintest)', textAlign: 'right', flexShrink: 0, fontFamily: "'IBM Plex Mono', monospace" }}>
                <div>Updated</div>
                <div>{pinnedDeck.updated_at ? new Date(pinnedDeck.updated_at).toLocaleDateString() : '—'}</div>
              </div>
            </div>
          </Link>

          {isOwner && (
            <form action={async () => { 'use server'; await actionPinDeck(null); }}>
              <button type="submit" style={{
                marginTop: 6, fontSize: 11, color: 'var(--text-faintest)',
                background: 'none', border: 'none', cursor: 'pointer',
                padding: '2px 0', textDecoration: 'underline',
              }}>
                Unpin
              </button>
            </form>
          )}
        </section>
      )}

      {/* ── Recent activity ──────────────────────────────────────────────────── */}
      {recentDecks.length > 0 && (
        <section style={{ marginBottom: 28 }}>
          <SectionLabel>Recent activity</SectionLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {recentDecks.map(d => (
              <DeckRow
                key={d.id}
                deck={d}
                isOwner={isOwner}
                isPinned={pinnedDeck?.id === d.id}
                compact
              />
            ))}
          </div>
        </section>
      )}

      {/* ── Public decks ─────────────────────────────────────────────────────── */}
      <section>
        <SectionLabel>
          {isOwner ? `Your public decks (${allDecks.length})` : `Public decks (${allDecks.length})`}
        </SectionLabel>

        {allDecks.length === 0 ? (
          <p style={{ color: 'var(--text-faint)', fontSize: 14 }}>
            {isOwner
              ? "You haven't shared any decks publicly yet. Head to your decks and set visibility to Public."
              : 'This user hasn\'t shared any decks publicly yet.'}
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {allDecks.map(d => (
              <DeckRow
                key={d.id}
                deck={d}
                isOwner={isOwner}
                isPinned={pinnedDeck?.id === d.id}
              />
            ))}
          </div>
        )}
      </section>

      <div style={{ marginTop: 32, display: 'flex', gap: 16 }}>
        <Link href="/" style={{ fontSize: 13, color: 'var(--text-faint)', textDecoration: 'none' }}>← Home</Link>
        {isOwner && <Link href="/decks" style={{ fontSize: 13, color: 'var(--accent)', textDecoration: 'none' }}>Manage decks →</Link>}
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: string }) {
  return (
    <div style={{
      fontSize: 10, fontFamily: "'IBM Plex Mono', monospace", letterSpacing: '1.5px',
      textTransform: 'uppercase', color: 'var(--text-faint)', marginBottom: 10,
    }}>
      {children}
    </div>
  );
}

function DeckRow({
  deck,
  isOwner,
  isPinned,
  compact = false,
}: {
  deck: DeckListRow;
  isOwner: boolean;
  isPinned: boolean;
  compact?: boolean;
}) {
  return (
    <div style={{
      display: 'flex', gap: 10, alignItems: 'stretch',
      background: 'var(--surface)', border: `1px solid ${isPinned ? 'var(--accent)44' : 'var(--border)'}`,
      borderRadius: 8,
    }}>
      <Link
        href={deck.public_slug ? `/d/${deck.public_slug}` : `/decks/${deck.id}`}
        style={{ flex: 1, textDecoration: 'none', color: 'var(--text)', padding: compact ? '10px 14px' : '13px 16px' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: compact ? 13 : 14, marginBottom: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
              {isPinned && <span style={{ fontSize: 10, color: 'var(--accent)' }}>📌</span>}
              {deck.name}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-faint)', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ textTransform: 'capitalize' }}>{deck.format}</span>
              {deck.commander && <span>⌘ {deck.commander}</span>}
              <span>{deck.card_count} cards</span>
            </div>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-faint)', textAlign: 'right', flexShrink: 0, fontFamily: "'IBM Plex Mono', monospace" }}>
            <div>❤ {deck.like_count}</div>
            <div style={{ fontSize: 10, color: 'var(--text-faintest)', marginTop: 1 }}>
              {new Date(deck.updated_at).toLocaleDateString()}
            </div>
          </div>
        </div>
      </Link>

      {isOwner && !isPinned && (
        <form
          action={async () => {
            'use server';
            await actionPinDeck(deck.id);
          }}
          style={{ display: 'flex', alignItems: 'center', paddingRight: 10 }}
        >
          <button
            type="submit"
            title="Pin this deck to your profile"
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              fontSize: 14, opacity: 0.4, padding: '4px 6px',
              color: 'var(--text-faint)',
            }}
          >
            📌
          </button>
        </form>
      )}
    </div>
  );
}
