import { getDeckBySlug } from '@/lib/deck/store';
import { getComments, getLikeCount, getUserLiked } from '@/lib/deck/store';
import { getWinRate } from '@/lib/games/store';
import { getDb } from '@/lib/db/connection';
import { runMigrations } from '@/lib/db/migrations';
import { getCurrentUser } from '@/lib/auth/session';
import { canView } from '@/lib/auth/access';
import { notFound } from 'next/navigation';
import { ManaIcon } from '@/components/ui';
import { LikeButton } from '@/components/like-button';
import { CommentForm } from '@/components/comment-form';
import { CommentReplySection } from '@/components/comment-reply';
import Link from 'next/link';
import type { DeckEntry } from '@/lib/deck/model';
import { mainboardEntries, boardEntries, isLegal } from '@/lib/deck/model';
import { LegalityBadge } from '@/components/legality-badge';
import { BracketBadge } from '@/components/bracket-badge';
import { renderMarkdown } from '@/lib/markdown/render';
import { checkLegalityWithCards } from '@/lib/deck/legality';
import type { Metadata } from 'next';
import { CardTooltip } from '@/components/card-tooltip';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const deck = getDeckBySlug(slug);
  if (!deck) return { title: 'Deck not found — Lodestone' };
  const title = deck.commander
    ? `${deck.name} — ${deck.commander} · ${deck.format}`
    : `${deck.name} · ${deck.format}`;
  const description = deck.description
    ? deck.description.slice(0, 140).replace(/[#*`]/g, '') + (deck.description.length > 140 ? '…' : '')
    : `${deck.format} deck with ${deck.entries?.length ?? 0} cards on Lodestone.`;
  return {
    title: `${title} — Lodestone`,
    description,
    openGraph: {
      title,
      description,
      type: 'article',
      siteName: 'Lodestone',
    },
    twitter: { card: 'summary_large_image', title, description },
  };
}

interface EntryWithType extends DeckEntry {
  type_line: string | null;
  image_url: string | null;
}

function extractImageUrl(imageUrisJson: string | null, cardFacesJson: string | null): string | null {
  if (imageUrisJson) {
    try { return (JSON.parse(imageUrisJson) as Record<string, string>).normal ?? null; } catch { return null; }
  }
  if (cardFacesJson) {
    try {
      const faces = JSON.parse(cardFacesJson) as { image_uris?: { normal?: string } }[];
      return faces[0]?.image_uris?.normal ?? null;
    } catch { return null; }
  }
  return null;
}

function enrichWithTypeLine(entries: DeckEntry[]): EntryWithType[] {
  const db = getDb();
  return entries.map(e => {
    if (!e.oracle_id) return { ...e, type_line: null, image_url: null };
    const row = db.prepare(
      'SELECT type_line, image_uris_json, card_faces_json FROM scryfall_cards WHERE oracle_id = ? LIMIT 1'
    ).get(e.oracle_id) as { type_line: string | null; image_uris_json: string | null; card_faces_json: string | null } | undefined;
    return {
      ...e,
      type_line: row?.type_line ?? null,
      image_url: extractImageUrl(row?.image_uris_json ?? null, row?.card_faces_json ?? null),
    };
  });
}

function groupByType(entries: EntryWithType[]): Record<string, EntryWithType[]> {
  const ORDER = ['Creature', 'Instant', 'Sorcery', 'Artifact', 'Enchantment', 'Planeswalker', 'Land', 'Other'];
  const groups: Record<string, EntryWithType[]> = {};
  for (const e of entries) {
    const tl = e.type_line ?? '';
    const key = ORDER.find(t => tl.includes(t)) ?? 'Other';
    if (!groups[key]) groups[key] = [];
    groups[key].push(e);
  }
  return groups;
}

function ColorPips({ identity }: { identity: string[] }) {
  if (!identity.length) return null;
  return (
    <span style={{ display: 'inline-flex', gap: 3 }}>
      {identity.map(c => <ManaIcon key={c} symbol={c} size={16} />)}
    </span>
  );
}

export default async function PublicDeckPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  runMigrations();

  const deck = getDeckBySlug(slug);
  if (!deck) notFound();

  const user = await getCurrentUser();
  if (!canView(deck, user)) notFound(); // treat private as not-found for anonymous viewers

  const comments = getComments(deck.id);
  const likeCount = getLikeCount(deck.id);
  const winRate = getWinRate(deck.id);
  const isRealUser = !!user && user.id !== 'local';
  const userLiked = isRealUser ? getUserLiked(user!.id, deck.id) : false;
  // Only mainboard counts toward the deck total; sideboard/maybeboard render separately
  const main = mainboardEntries(deck);
  const enriched = enrichWithTypeLine(main);
  const groups = groupByType(enriched.filter(e => !e.is_commander));
  const commander = deck.entries.find(e => e.is_commander);
  const totalCards = main.reduce((s, e) => s + e.quantity, 0);
  const enrichedSide = enrichWithTypeLine(boardEntries(deck, 'side'));
  const enrichedMaybe = enrichWithTypeLine(boardEntries(deck, 'maybe'));

  const GROUP_ORDER = ['Creature', 'Instant', 'Sorcery', 'Artifact', 'Enchantment', 'Planeswalker', 'Land', 'Other'];

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '32px 24px', color: 'var(--text)' }}>
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <h1 style={{ margin: 0, fontSize: 28, fontWeight: 700 }}>{deck.name}</h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8, color: 'var(--text-muted, #8ba)', fontSize: 14, flexWrap: 'wrap' }}>
              <span style={{ textTransform: 'capitalize', background: 'var(--surface-2)', padding: '2px 8px', borderRadius: 4 }}>
                {deck.format}
              </span>
              {commander && (
                <span>Commander: <strong>{commander.card_name}</strong></span>
              )}
              <span>{totalCards} cards</span>
              {deck.tags && deck.tags.length > 0 && deck.tags.map(t => (
                <span key={t} style={{ fontSize: 11, fontFamily: "'IBM Plex Mono', monospace", background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 20, padding: '2px 10px', color: 'var(--text-faint)' }}>
                  {t}
                </span>
              ))}
              {(() => {
                const tierA = isLegal(deck);
                if (!tierA.legal) return <LegalityBadge legal={false} reason={tierA.reason} />;
                const tierB = checkLegalityWithCards(deck);
                return <LegalityBadge legal={tierB.legal} reason={tierB.reasons[0] ?? null} />;
              })()}
              {deck.format === 'commander' && <BracketBadge deckId={deck.id} compact />}
              {winRate.games > 0 && (
                <span style={{ fontSize: 12, fontFamily: "'IBM Plex Mono', monospace", background: 'rgba(72,200,160,0.1)', border: '1px solid rgba(72,200,160,0.25)', borderRadius: 4, padding: '2px 8px', color: '#48c8a0' }}>
                  {winRate.winPct}% win rate ({winRate.games}g)
                </span>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
            {deck.visibility === 'public' && (
              <span style={{ fontSize: 11, color: 'var(--text-faint)', padding: '4px 8px', background: 'var(--surface-2)', borderRadius: 4 }}>
                🌐 Public
              </span>
            )}
            {deck.public_slug && (
              <Link
                href={`/decks/compare?a=${deck.public_slug}`}
                style={{
                  fontSize: 11, color: 'var(--text-faint)', padding: '4px 8px',
                  background: 'var(--surface-2)', borderRadius: 4, textDecoration: 'none',
                  border: '1px solid var(--border)',
                }}
              >
                ⇄ Compare
              </Link>
            )}
            <LikeButton
              deckId={deck.id}
              initialCount={likeCount}
              initialLiked={userLiked}
              isLoggedIn={isRealUser}
            />
          </div>
        </div>

        {/* Primer / description */}
        {!!deck.description && (
          <div
            className="primer"
            style={{
              marginTop: 24, padding: '16px 20px',
              background: 'var(--surface-2)', borderRadius: 8,
              border: '1px solid var(--border)',
            }}
            dangerouslySetInnerHTML={{ __html: renderMarkdown(deck.description) }}
          />
        )}
      </div>

      {/* Decklist by type */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 20, marginBottom: 32 }}>
        {GROUP_ORDER.filter(g => groups[g]?.length).map(group => (
          <div key={group} style={{ background: 'var(--surface-2)', borderRadius: 8, padding: '14px 16px', border: '1px solid var(--border)' }}>
            <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 13, color: 'var(--text-muted, #8ba)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {group} ({groups[group].reduce((s, e) => s + e.quantity, 0)})
            </div>
            {groups[group].sort((a, b) => (a.card_name > b.card_name ? 1 : -1)).map(e => (
              <div key={e.oracle_id} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', fontSize: 13, borderBottom: '1px solid var(--border)' }}>
                <span>
                  {e.quantity > 1 && <span style={{ color: 'var(--text-muted, #8ba)', marginRight: 4 }}>{e.quantity}×</span>}
                  <CardTooltip imageUrl={e.image_url}>{e.card_name}</CardTooltip>
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Sideboard */}
      {enrichedSide.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 10, color: 'var(--text-muted, #8ba)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Sideboard ({enrichedSide.reduce((s, e) => s + e.quantity, 0)})
          </h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px' }}>
            {enrichedSide.sort((a, b) => a.card_name > b.card_name ? 1 : -1).map(e => (
              <div key={e.oracle_id} style={{ fontSize: 13, color: 'var(--text-faint)' }}>
                {e.quantity > 1 && <span style={{ marginRight: 4 }}>{e.quantity}×</span>}
                <CardTooltip imageUrl={e.image_url}>{e.card_name}</CardTooltip>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Maybeboard */}
      {enrichedMaybe.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 10, color: 'var(--text-muted, #8ba)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Maybeboard ({enrichedMaybe.length})
          </h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px' }}>
            {enrichedMaybe.sort((a, b) => a.card_name > b.card_name ? 1 : -1).map(e => (
              <div key={e.oracle_id} style={{ fontSize: 13, color: 'var(--text-faint)', fontStyle: 'italic' }}>
                {e.quantity > 1 && <span style={{ marginRight: 4 }}>{e.quantity}×</span>}
                <CardTooltip imageUrl={e.image_url}>{e.card_name}</CardTooltip>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Comments */}
      <div style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>Comments ({comments.length})</h2>
        {comments.length === 0 && (
          <p style={{ color: 'var(--text-muted, #8ba)', fontSize: 14 }}>
            No comments yet.{user && user.id !== 'local' ? ' Be the first!' : ' Log in to comment.'}
          </p>
        )}
        {comments.filter(c => !c.parent_id).map(c => (
          <div key={c.id} style={{ borderLeft: '3px solid var(--border)', paddingLeft: 16, marginBottom: 16 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
              <strong style={{ fontSize: 13 }}>{c.user_name}</strong>
              <span style={{ fontSize: 11, color: 'var(--text-muted, #8ba)' }}>
                {new Date(c.created_at).toLocaleDateString()}
              </span>
            </div>
            <div style={{ fontSize: 14, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{c.body}</div>
            {/* Replies */}
            {comments.filter(r => r.parent_id === c.id).map(r => (
              <div key={r.id} style={{ borderLeft: '2px solid var(--border)', paddingLeft: 12, marginTop: 8, marginLeft: 8 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 2 }}>
                  <strong style={{ fontSize: 12 }}>{r.user_name}</strong>
                  <span style={{ fontSize: 11, color: 'var(--text-muted, #8ba)' }}>
                    {new Date(r.created_at).toLocaleDateString()}
                  </span>
                </div>
                <div style={{ fontSize: 13, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{r.body}</div>
              </div>
            ))}
            {isRealUser && <CommentReplySection deckId={deck.id} commentId={c.id} />}
          </div>
        ))}
        {isRealUser ? (
          <div style={{ marginTop: 20 }}>
            <div style={{ fontSize: 12, fontFamily: "'IBM Plex Mono', monospace", color: 'var(--text-faint)', marginBottom: 8, letterSpacing: '1px', textTransform: 'uppercase' }}>
              Leave a comment
            </div>
            <CommentForm deckId={deck.id} />
          </div>
        ) : (
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 12 }}>
            <Link href="/login" style={{ color: 'var(--accent)' }}>Log in</Link> to like or comment on decks.
          </p>
        )}
      </div>

      {/* Back / edit links */}
      <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
        <Link href="/decks/browse" style={{ fontSize: 13, color: 'var(--text-muted, #8ba)' }}>← Browse decks</Link>
        {user && deck.user_id === user.id && (
          <Link href={`/decks/${deck.id}`} style={{ fontSize: 13, color: 'var(--accent)', fontWeight: 600 }}>
            Edit deck →
          </Link>
        )}
      </div>
    </div>
  );
}
