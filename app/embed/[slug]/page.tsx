/**
 * /embed/[slug] — chrome-free deck embed page.
 * Suitable for iframing. Respects canView (private → 404).
 * No sidebar, no nav. Powered by the embed layout.
 */
import { getDeckBySlug } from '@/lib/deck/store';
import { getWinRate } from '@/lib/games/store';
import { runMigrations } from '@/lib/db/migrations';
import { getCurrentUser } from '@/lib/auth/session';
import { canView } from '@/lib/auth/access';
import { notFound } from 'next/navigation';
import { ManaIcon } from '@/components/ui';
import { mainboardEntries, boardEntries } from '@/lib/deck/model';
import { getDb } from '@/lib/db/connection';
import type { DeckEntry } from '@/lib/deck/model';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const deck = getDeckBySlug(slug);
  if (!deck) return { title: 'Deck — Lodestone' };
  return {
    title: `${deck.name} — Lodestone`,
    robots: { index: false }, // embeds shouldn't be indexed
  };
}

interface EntryWithType extends DeckEntry {
  type_line: string | null;
}

function enrichWithTypeLine(entries: DeckEntry[]): EntryWithType[] {
  const db = getDb();
  return entries.map(e => {
    const row = e.oracle_id
      ? (db
          .prepare('SELECT type_line FROM scryfall_cards WHERE oracle_id = ? LIMIT 1')
          .get(e.oracle_id) as { type_line: string | null } | undefined)
      : undefined;
    return { ...e, type_line: row?.type_line ?? null };
  });
}

function groupByType(entries: EntryWithType[]): Record<string, EntryWithType[]> {
  const ORDER = [
    'Creature',
    'Instant',
    'Sorcery',
    'Artifact',
    'Enchantment',
    'Planeswalker',
    'Land',
    'Other',
  ];
  const groups: Record<string, EntryWithType[]> = {};
  for (const e of entries) {
    const tl = e.type_line ?? '';
    const key = ORDER.find(t => tl.includes(t)) ?? 'Other';
    if (!groups[key]) groups[key] = [];
    groups[key].push(e);
  }
  return groups;
}

const GROUP_ORDER = [
  'Creature',
  'Instant',
  'Sorcery',
  'Artifact',
  'Enchantment',
  'Planeswalker',
  'Land',
  'Other',
];

export default async function EmbedPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  runMigrations();

  const deck = getDeckBySlug(slug);
  if (!deck) notFound();

  const user = await getCurrentUser();
  if (!canView(deck, user)) notFound();

  const winRate = getWinRate(deck.id);
  const main = mainboardEntries(deck);
  const enriched = enrichWithTypeLine(main);
  const groups = groupByType(enriched.filter(e => !e.is_commander));
  const commander = deck.entries.find(e => e.is_commander);
  const totalCards = main.reduce((s, e) => s + e.quantity, 0);
  const sideboard = boardEntries(deck, 'side');
  const colorIdentity: string[] = Array.isArray(deck.color_identity)
    ? deck.color_identity
    : [];

  const publicUrl = `${process.env.APP_URL ?? ''}/d/${slug}`;

  return (
    <div
      style={{
        background: 'var(--bg)',
        color: 'var(--text)',
        fontFamily: "'IBM Plex Sans', -apple-system, sans-serif",
        minHeight: '100vh',
        padding: '16px',
      }}
    >
      {/* ── Header ── */}
      <div
        style={{
          borderBottom: '1px solid var(--border)',
          paddingBottom: 12,
          marginBottom: 16,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1
              style={{
                margin: 0,
                fontSize: 18,
                fontWeight: 700,
                lineHeight: 1.2,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {deck.name}
            </h1>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                marginTop: 6,
                flexWrap: 'wrap',
              }}
            >
              {/* Format */}
              <span
                style={{
                  fontSize: 11,
                  textTransform: 'capitalize',
                  background: 'var(--surface-2)',
                  padding: '2px 8px',
                  borderRadius: 4,
                  color: 'var(--text-muted)',
                }}
              >
                {deck.format}
              </span>

              {/* Commander */}
              {commander && (
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  {commander.card_name}
                </span>
              )}

              {/* Color pips */}
              {colorIdentity.length > 0 && (
                <span style={{ display: 'inline-flex', gap: 2 }}>
                  {colorIdentity.map(c => (
                    <ManaIcon key={c} symbol={c} size={13} />
                  ))}
                </span>
              )}

              {/* Card count */}
              <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>
                {totalCards} cards
              </span>

              {/* Win rate */}
              {winRate.games > 0 && (
                <span
                  style={{
                    fontSize: 11,
                    fontFamily: "'IBM Plex Mono', monospace",
                    background: 'rgba(72,200,160,0.1)',
                    border: '1px solid rgba(72,200,160,0.25)',
                    borderRadius: 4,
                    padding: '2px 7px',
                    color: '#48c8a0',
                  }}
                >
                  {winRate.winPct}% ({winRate.games}g)
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Decklist by type ── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
          gap: 12,
          marginBottom: 16,
        }}
      >
        {GROUP_ORDER.filter(g => groups[g]?.length).map(group => (
          <div
            key={group}
            style={{
              background: 'var(--surface-2)',
              borderRadius: 6,
              padding: '10px 12px',
              border: '1px solid var(--border)',
            }}
          >
            <div
              style={{
                fontWeight: 600,
                marginBottom: 6,
                fontSize: 11,
                color: 'var(--text-muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}
            >
              {group} ({groups[group].reduce((s, e) => s + e.quantity, 0)})
            </div>
            {groups[group]
              .sort((a, b) => (a.card_name > b.card_name ? 1 : -1))
              .map(e => (
                <div
                  key={e.oracle_id ?? e.card_name}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    padding: '2px 0',
                    fontSize: 11.5,
                    borderBottom: '1px solid var(--border)',
                    lineHeight: 1.4,
                  }}
                >
                  <span>
                    {e.quantity > 1 && (
                      <span
                        style={{ color: 'var(--text-muted)', marginRight: 3 }}
                      >
                        {e.quantity}×
                      </span>
                    )}
                    {e.card_name}
                  </span>
                </div>
              ))}
          </div>
        ))}
      </div>

      {/* ── Sideboard ── */}
      {sideboard.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: 'var(--text-muted)',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              marginBottom: 6,
            }}
          >
            Sideboard ({sideboard.reduce((s, e) => s + e.quantity, 0)})
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 14px' }}>
            {sideboard
              .sort((a, b) => (a.card_name > b.card_name ? 1 : -1))
              .map(e => (
                <span
                  key={e.oracle_id ?? e.card_name}
                  style={{ fontSize: 11.5, color: 'var(--text-faint)' }}
                >
                  {e.quantity > 1 && (
                    <span style={{ marginRight: 3 }}>{e.quantity}×</span>
                  )}
                  {e.card_name}
                </span>
              ))}
          </div>
        </div>
      )}

      {/* ── Attribution ── */}
      <div
        style={{
          marginTop: 16,
          paddingTop: 10,
          borderTop: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <a
          href={publicUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            fontSize: 11,
            color: 'var(--accent)',
            textDecoration: 'none',
            fontFamily: "'IBM Plex Mono', monospace",
          }}
        >
          View on Lodestone ↗
        </a>
        <span
          style={{
            fontSize: 10,
            color: 'var(--text-faint)',
            fontFamily: "'IBM Plex Mono', monospace",
          }}
        >
          lodestone.nz
        </span>
      </div>
    </div>
  );
}
